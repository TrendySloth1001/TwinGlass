package com.mobmirror.companion.direct

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.util.Base64
import com.mobmirror.companion.Prefs
import org.json.JSONObject
import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.security.SecureRandom
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/**
 * The phone app's "Wi-Fi, no setup" link to Twinglass on a Mac (no developer mode): find Macs on
 * the network (mDNS _twinglass._tcp), pair once with the code the Mac shows, then open encrypted
 * sessions to mirror (DirectCrypto; the Mac side is src/main/direct/server.ts).
 */
object DirectLink {
    const val SERVICE = "_twinglass._tcp"

    data class MacOnNetwork(val name: String, val host: String, val port: Int)

    data class PairedMac(val name: String, val host: String, val port: Int, val secret: ByteArray)

    enum class PairResult { Ok, WrongCode, PairingClosed, Unreachable, Failed }

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("direct", Context.MODE_PRIVATE)

    /** This phone's stable id on the link (random, not a hardware id). */
    fun phoneId(ctx: Context): String = prefs(ctx).getString("id", null) ?: UUID.randomUUID().toString().also { prefs(ctx).edit().putString("id", it).apply() }

    fun paired(ctx: Context): PairedMac? {
        val p = prefs(ctx)
        val secret = p.getString("secret", null) ?: return null
        return PairedMac(p.getString("mac", "Mac") ?: "Mac", p.getString("host", "") ?: "", p.getInt("port", 47200), Base64.decode(secret, Base64.NO_WRAP))
    }

    /** A Mac this phone was paired with until it was forgotten (shown on Home with "Pair again"). */
    data class Forgotten(val name: String, val byMac: Boolean, val at: Long)

    /**
     * Local only. [byMac]: the Mac forgot this phone (it told us, or refused us as unknown);
     * otherwise the user forgot it here. Remembered so Home can explain it and offer to pair again.
     */
    fun forget(ctx: Context, byMac: Boolean = true) {
        val p = prefs(ctx)
        val name = p.getString("mac", null)
        val e = p.edit().remove("secret").remove("mac").remove("host").remove("port")
        if (name != null) e.putString("last.mac", name).putBoolean("last.byMac", byMac).putLong("last.at", System.currentTimeMillis())
        e.apply()
    }

    fun forgotten(ctx: Context): Forgotten? {
        val p = prefs(ctx)
        if (p.getString("secret", null) != null) return null
        val name = p.getString("last.mac", null) ?: return null
        return Forgotten(name, p.getBoolean("last.byMac", true), p.getLong("last.at", 0))
    }

    /** "Not now" on Home: stop mentioning the forgotten Mac. */
    fun dismissForgotten(ctx: Context) = prefs(ctx).edit().remove("last.mac").remove("last.byMac").remove("last.at").apply()

    /**
     * Forgets the Mac on both sides: tells it over an authenticated session first, so it drops
     * this phone too. When it can't be reached, the request is kept and delivered the next time
     * the Mac is reachable (flushPendingForget). Returns true when the Mac was told now.
     */
    fun forgetEverywhere(ctx: Context): Boolean {
        val mac = paired(ctx) ?: return false
        forget(ctx, byMac = false)
        if (tellForget(ctx, mac)) return true
        prefs(ctx).edit()
            .putString("pending.mac", mac.name).putString("pending.host", mac.host).putInt("pending.port", mac.port)
            .putString("pending.secret", Base64.encodeToString(mac.secret, Base64.NO_WRAP)).apply()
        return false
    }

    /** Delivers a forget that couldn't reach the Mac before. Call when the app opens. */
    fun flushPendingForget(ctx: Context) {
        val p = prefs(ctx)
        val secret = p.getString("pending.secret", null) ?: return
        val mac = PairedMac(p.getString("pending.mac", "Mac") ?: "Mac", p.getString("pending.host", "") ?: "", p.getInt("pending.port", 47200), Base64.decode(secret, Base64.NO_WRAP))
        if (tellForget(ctx, mac)) p.edit().remove("pending.mac").remove("pending.host").remove("pending.port").remove("pending.secret").apply()
    }

    fun hasPendingForget(ctx: Context) = prefs(ctx).getString("pending.secret", null) != null

    private fun tellForget(ctx: Context, mac: PairedMac): Boolean = runCatching {
        val s = open(ctx, object : Listener {
            override fun onJson(msg: JSONObject) {}
            override fun onControl(msg: ByteArray) {}
            override fun onClosed(error: String?) {}
        }, mac)
        s.json(JSONObject().put("t", "forget"))
        Thread.sleep(300) // let it flush before closing
        s.close()
        true
    }.getOrElse { it.message?.contains("forgot this phone") == true } // the Mac had already forgotten us: done

    private fun phoneName(): String = "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}"

    // ---- discovery ----

    /** Lists Macs running Twinglass on this network for [timeoutMs]. */
    @Suppress("DEPRECATION")
    fun discover(ctx: Context, timeoutMs: Long = 4000, onFound: (MacOnNetwork) -> Unit) {
        val nsd = ctx.getSystemService(NsdManager::class.java)
        val seen = HashSet<String>()
        val listener = object : NsdManager.DiscoveryListener {
            override fun onServiceFound(info: NsdServiceInfo) {
                if (!info.serviceType.startsWith(SERVICE)) return
                nsd.resolveService(info, object : NsdManager.ResolveListener {
                    override fun onResolveFailed(i: NsdServiceInfo, code: Int) {}
                    override fun onServiceResolved(i: NsdServiceInfo) {
                        val host = i.host?.hostAddress ?: return
                        if (seen.add(i.serviceName)) onFound(MacOnNetwork(i.serviceName, host, i.port))
                    }
                })
            }
            override fun onServiceLost(info: NsdServiceInfo) {}
            override fun onDiscoveryStarted(type: String) {}
            override fun onDiscoveryStopped(type: String) {}
            override fun onStartDiscoveryFailed(type: String, code: Int) {}
            override fun onStopDiscoveryFailed(type: String, code: Int) {}
        }
        runCatching { nsd.discoverServices(SERVICE, NsdManager.PROTOCOL_DNS_SD, listener) }
        thread {
            Thread.sleep(timeoutMs)
            runCatching { nsd.stopServiceDiscovery(listener) }
        }
    }

    /** Finds the paired Mac again by name (its IP may have changed). */
    private fun rediscover(ctx: Context, name: String): MacOnNetwork? {
        var hit: MacOnNetwork? = null
        val done = CountDownLatch(1)
        discover(ctx, 3500) { if (it.name == name && hit == null) { hit = it; done.countDown() } }
        done.await(3600, TimeUnit.MILLISECONDS)
        return hit
    }

    // ---- pairing ----

    fun pair(ctx: Context, mac: MacOnNetwork, code: String): PairResult = runCatching {
        Socket().use { s ->
            s.connect(InetSocketAddress(mac.host, mac.port), 4000)
            s.soTimeout = 10_000
            val input = DataInputStream(s.getInputStream())
            val out = BufferedOutputStream(s.getOutputStream())
            val kp = DirectCrypto.newKeyPair()
            DirectCrypto.writePlain(out, JSONObject()
                .put("t", "pair").put("id", phoneId(ctx)).put("name", phoneName()).put("model", Build.MODEL)
                .put("pub", Base64.encodeToString(DirectCrypto.publicPoint(kp), Base64.NO_WRAP)).toString())
            val r1 = JSONObject(String(DirectCrypto.readFrame(input)))
            if (r1.optString("t") == "error") return if (r1.optString("error") == "pairing-closed") PairResult.PairingClosed else PairResult.Failed
            val key = DirectCrypto.pairKey(DirectCrypto.sharedX(kp, Base64.decode(r1.getString("pub"), Base64.NO_WRAP)), code)
            DirectCrypto.writePlain(out, JSONObject().put("t", "confirm").put("mac", Base64.encodeToString(DirectCrypto.hmac(key, "phone".toByteArray()), Base64.NO_WRAP)).toString())
            val r2 = JSONObject(String(DirectCrypto.readFrame(input)))
            if (r2.optString("t") == "error") return if (r2.optString("error") == "code") PairResult.WrongCode else PairResult.Failed
            // The Mac proves it derived the same key too (no one in between).
            if (!DirectCrypto.equal(Base64.decode(r2.getString("mac"), Base64.NO_WRAP), DirectCrypto.hmac(key, "mac".toByteArray()))) return PairResult.Failed
            prefs(ctx).edit()
                .putString("secret", Base64.encodeToString(DirectCrypto.pairSecret(key), Base64.NO_WRAP))
                .putString("mac", r1.optString("mac", mac.name)).putString("host", mac.host).putInt("port", mac.port)
                .putLong("pairedAt", System.currentTimeMillis())
                .remove("last.mac").remove("last.byMac").remove("last.at").apply()
            PairResult.Ok
        }
    }.getOrElse { if (it is java.net.ConnectException || it is java.net.SocketTimeoutException) PairResult.Unreachable else PairResult.Failed }

    // ---- sessions ----

    interface Listener {
        fun onJson(msg: JSONObject)
        fun onControl(msg: ByteArray)
        fun onClosed(error: String?)
    }

    /** An open, encrypted session to the paired Mac. */
    class Session internal constructor(private val socket: Socket, private val sealer: DirectCrypto.Sealer, val macName: String) {
        private val out = BufferedOutputStream(socket.getOutputStream(), 64 * 1024)

        fun send(kind: Int, payload: ByteArray, off: Int = 0, len: Int = payload.size) {
            val frame = sealer.seal(kind, payload, off, len)
            synchronized(out) {
                out.write(frame)
                out.flush()
            }
        }

        fun json(msg: JSONObject) = send(DirectCrypto.KIND_JSON, msg.toString().toByteArray())

        fun close() = runCatching { socket.close() }
    }

    /** Opens a session (rediscovering the Mac if its address changed). Throws with a readable message. */
    fun open(ctx: Context, listener: Listener, creds: PairedMac? = null): Session {
        val mac = creds ?: paired(ctx) ?: error("Not paired with a Mac yet.")
        val socket = runCatching { connect(mac.host, mac.port) }.getOrNull()
            ?: rediscover(ctx, mac.name)?.let { found ->
                prefs(ctx).edit().putString("host", found.host).putInt("port", found.port).apply()
                connect(found.host, found.port)
            }
            ?: error("Can’t find ${mac.name} on this Wi-Fi. Open Twinglass on the Mac, on the same network.")
        socket.soTimeout = 10_000
        val input = DataInputStream(socket.getInputStream())
        val out = BufferedOutputStream(socket.getOutputStream())
        val nonce = ByteArray(16).also { SecureRandom().nextBytes(it) }
        DirectCrypto.writePlain(out, JSONObject()
            .put("t", "hello").put("id", phoneId(ctx)).put("name", phoneName()).put("model", Build.MODEL)
            .put("appCode", com.mobmirror.companion.DeviceInfo.appCode(ctx)).put("appVersion", com.mobmirror.companion.DeviceInfo.appVersion(ctx))
            .put("nonce", Base64.encodeToString(nonce, Base64.NO_WRAP)).toString())
        val r = JSONObject(String(DirectCrypto.readFrame(input)))
        if (r.optString("t") == "error") {
            socket.close()
            // Forgotten on the Mac (while this phone was away): forget it here too.
            if (r.optString("error") == "unknown") { if (creds == null) forget(ctx); error("${mac.name} forgot this phone. Pair again.") }
            error("The Mac refused the connection (${r.optString("error")}).")
        }
        val (up, down) = DirectCrypto.sessionKeys(mac.secret, nonce, Base64.decode(r.getString("nonce"), Base64.NO_WRAP))
        val opener = DirectCrypto.Opener(down)
        socket.soTimeout = 0
        val session = Session(socket, DirectCrypto.Sealer(up), r.optString("mac", mac.name))
        Prefs.log(ctx, "direct: session open to ${session.macName}")
        thread(name = "twinglass-direct-read") {
            var err: String? = null
            try {
                while (true) {
                    val (kind, payload) = opener.open(DirectCrypto.readFrame(input))
                    when (kind) {
                        DirectCrypto.KIND_JSON -> {
                            val msg = JSONObject(String(payload))
                            // Forgotten on the Mac: drop the pairing here too, whoever is listening.
                            if (msg.optString("t") == "forget" && creds == null) forget(ctx)
                            listener.onJson(msg)
                        }
                        DirectCrypto.KIND_CONTROL -> listener.onControl(payload)
                    }
                }
            } catch (e: Exception) {
                err = if (socket.isClosed) null else e.message
            }
            runCatching { socket.close() }
            listener.onClosed(err)
        }
        return session
    }

    private fun connect(host: String, port: Int): Socket = Socket().apply {
        tcpNoDelay = true
        connect(InetSocketAddress(host, port), 3000)
    }
}
