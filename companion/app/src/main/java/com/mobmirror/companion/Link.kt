package com.mobmirror.companion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONObject
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/** Receives the Mac's link key (sent through adb only; see the manifest). */
class LinkReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Forgotten in the app: don't take a key again until the user links again.
        if (Link.blocked(context)) return
        val key = intent.getStringExtra("key") ?: return
        if (!Regex("^[0-9a-f]{64}$").matches(key)) return
        Link.save(context, key, intent.getStringExtra("mac") ?: "Mac", intent.getIntExtra("port", Link.DEFAULT_PORT))
    }
}

/**
 * The phone app's side of the link to Twinglass on the Mac (src/main/companion-link.ts):
 * localhost through `adb reverse`, every request carrying the per-Mac key.
 */
object Link {
    const val DEFAULT_PORT = 47123
    private const val PREFS = "link"

    /** One phone as the Mac sees it. */
    data class PhoneOnMac(val model: String, val links: List<String>, val mirroring: Boolean, val secondScreens: Int, val agentScreen: Boolean)

    data class Status(
        val mac: String,
        val version: String,
        val os: String,
        val phones: List<PhoneOnMac>,
        val agentsEnabled: Boolean,
        val agentsWorkspace: String,
        /** Round trip of this status request (ms). */
        val pingMs: Long,
    ) {
        /** This phone in the Mac's list (matched by model). */
        val me: PhoneOnMac? get() = phones.firstOrNull { it.model == Build.MODEL }
    }

    fun save(ctx: Context, key: String, mac: String, port: Int) {
        prefs(ctx).edit().putString("key", key).putString("mac", mac).putInt("port", port).putLong("pairedAt", System.currentTimeMillis()).apply()
    }

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    fun paired(ctx: Context): Boolean = prefs(ctx).getString("key", null) != null
    fun macName(ctx: Context): String = prefs(ctx).getString("mac", "your Mac") ?: "your Mac"
    fun port(ctx: Context): Int = prefs(ctx).getInt("port", DEFAULT_PORT)
    fun pairedAt(ctx: Context): Long = prefs(ctx).getLong("pairedAt", 0)
    fun lastSeen(ctx: Context): Long = prefs(ctx).getLong("lastSeen", 0)

    /** First 8 hex digits of the key, to tell links apart in diagnostics (never the key). */
    fun keyId(ctx: Context): String = prefs(ctx).getString("key", null)?.take(8) ?: "none"

    /**
     * Forget this Mac: the key goes, and the Mac's automatic re-linking over adb is refused until
     * the user chooses "Link again" (so a forget isn't silently undone).
     */
    fun forget(ctx: Context) {
        prefs(ctx).edit().clear().putBoolean("blocked", true).apply()
    }

    fun blocked(ctx: Context) = prefs(ctx).getBoolean("blocked", false)

    /** "Link again": the Mac's next link (cable / Twinglass → Phone app → Relink) is accepted. */
    fun unblock(ctx: Context) = prefs(ctx).edit().putBoolean("blocked", false).apply()

    private fun open(ctx: Context, path: String, query: String = ""): HttpURLConnection {
        val p = prefs(ctx)
        val url = URL("http://localhost:${p.getInt("port", DEFAULT_PORT)}$path?k=${p.getString("key", "")}$query")
        return (url.openConnection() as HttpURLConnection).apply {
            setRequestProperty("X-Twinglass-Phone", Build.MODEL)
        }
    }

    /** null = the Mac isn't reachable (Twinglass closed, or no USB / wireless adb link). */
    fun status(ctx: Context): Status? = runCatching {
        val t0 = System.nanoTime()
        val c = open(ctx, "/link/status")
        val to = Prefs.advanced(ctx).linkTimeoutMs
        c.connectTimeout = to.coerceAtMost(3000); c.readTimeout = to
        Prefs.log(ctx, "status → ${c.url.path}")
        if (c.responseCode != 200) return null
        val j = JSONObject(c.inputStream.bufferedReader().readText())
        val ms = (System.nanoTime() - t0) / 1_000_000
        prefs(ctx).edit().putLong("lastSeen", System.currentTimeMillis()).putString("mac", j.optString("mac", macName(ctx))).apply()
        val phones = j.optJSONArray("phones")?.let { a ->
            (0 until a.length()).map { i ->
                val o = a.getJSONObject(i)
                val links = o.optJSONArray("links")?.let { l -> (0 until l.length()).map { l.getString(it) } } ?: emptyList()
                PhoneOnMac(o.optString("model"), links, o.optBoolean("mirroring"), o.optInt("secondScreens"), o.optBoolean("agentScreen"))
            }
        } ?: emptyList()
        val agents = j.optJSONObject("agents")
        Status(
            mac = j.optString("mac", "Mac"),
            version = j.optString("version", ""),
            os = j.optString("os", ""),
            phones = phones,
            agentsEnabled = agents?.optBoolean("enabled") ?: false,
            agentsWorkspace = agents?.optString("workspace") ?: "",
            pingMs = ms,
        )
    }.getOrNull()

    /** POSTs bytes to the Mac; false when it isn't reachable or refuses. */
    fun post(ctx: Context, path: String, query: String, body: ByteArray): Boolean = runCatching {
        val c = open(ctx, path, query)
        c.connectTimeout = 1500; c.readTimeout = 4000
        c.requestMethod = "POST"; c.doOutput = true
        c.setFixedLengthStreamingMode(body.size)
        c.setRequestProperty("Content-Type", "application/octet-stream")
        c.outputStream.use { it.write(body) }
        val ok = c.responseCode == 200
        c.inputStream.close()
        ok
    }.getOrDefault(false)

    /** Share to Mac: text goes onto the Mac's clipboard. */
    fun sendText(ctx: Context, text: String, notifyMac: Boolean = true): Boolean =
        post(ctx, "/link/clipboard", if (notifyMac) "" else "&notify=0", text.toByteArray())

    /**
     * Share to Mac: a file, streamed (any size up to 2 GB) into ~/Downloads/Twinglass.
     * [length] -1 = unknown (chunked). [progress] gets bytes sent so far.
     */
    fun sendFile(ctx: Context, name: String, input: InputStream, length: Long, notifyMac: Boolean = true, progress: (Long) -> Unit = {}): Boolean = runCatching {
        val c = open(ctx, "/link/file", "&name=" + URLEncoder.encode(name, "UTF-8") + if (notifyMac) "" else "&notify=0")
        c.connectTimeout = 2000; c.readTimeout = 60_000
        c.requestMethod = "POST"; c.doOutput = true
        if (length >= 0) c.setFixedLengthStreamingMode(length) else c.setChunkedStreamingMode(64 * 1024)
        c.setRequestProperty("Content-Type", "application/octet-stream")
        var sent = 0L
        c.outputStream.use { out ->
            val buf = ByteArray(64 * 1024)
            input.use { inp ->
                while (true) {
                    val n = inp.read(buf)
                    if (n < 0) break
                    out.write(buf, 0, n)
                    sent += n
                    progress(sent)
                }
            }
        }
        val ok = c.responseCode == 200
        (if (ok) c.inputStream else c.errorStream)?.close()
        ok
    }.getOrDefault(false)
}
