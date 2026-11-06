package com.mobmirror.companion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** Receives the Mac's link key (sent through adb only; see the manifest). */
class LinkReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val key = intent.getStringExtra("key") ?: return
        if (!Regex("^[0-9a-f]{64}$").matches(key)) return
        Link.save(context, key, intent.getStringExtra("mac") ?: "Mac", intent.getIntExtra("port", Link.DEFAULT_PORT))
    }
}

/** The companion's side of the Mac link (src/main/companion-link.ts on the Mac). */
object Link {
    const val DEFAULT_PORT = 47123
    private const val PREFS = "link"

    data class Status(val mac: String, val sharing: Boolean, val mode: String?, val viewers: Int)

    fun save(ctx: Context, key: String, mac: String, port: Int) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("key", key).putString("mac", mac).putInt("port", port).apply()
    }

    fun paired(ctx: Context): Boolean = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("key", null) != null
    fun macName(ctx: Context): String = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("mac", "your Mac") ?: "your Mac"

    private fun url(ctx: Context, path: String, query: String = ""): URL {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val key = p.getString("key", "") ?: ""
        val port = p.getInt("port", DEFAULT_PORT)
        return URL("http://localhost:$port$path?k=$key$query")
    }

    /** null = the Mac isn't reachable (Mob Mirror closed, or no USB / wireless adb link). */
    fun status(ctx: Context): Status? = runCatching {
        val c = url(ctx, "/link/status").openConnection() as HttpURLConnection
        c.connectTimeout = 1500; c.readTimeout = 2000
        if (c.responseCode != 200) return null
        val j = JSONObject(c.inputStream.bufferedReader().readText())
        Status(j.optString("mac", "Mac"), j.optBoolean("sharing"), j.optString("mode").ifEmpty { null }, j.optInt("viewers"))
    }.getOrNull()

    /** Ask the Mac to share ("mirror" or "extend"); the Mac then opens the viewer on this phone. */
    fun start(ctx: Context, mode: String): Boolean = post(ctx, "/link/start", "&mode=$mode")
    fun open(ctx: Context): Boolean = post(ctx, "/link/open")
    fun stop(ctx: Context): Boolean = post(ctx, "/link/stop")

    private fun post(ctx: Context, path: String, query: String = ""): Boolean = runCatching {
        val c = url(ctx, path, query).openConnection() as HttpURLConnection
        c.requestMethod = "POST"; c.connectTimeout = 2000; c.readTimeout = 5000
        c.responseCode in 200..299
    }.getOrDefault(false)
}
