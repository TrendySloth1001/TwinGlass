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

    data class Status(val mac: String, val version: String)

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
        Status(j.optString("mac", "Mac"), j.optString("version", ""))
    }.getOrNull()

}
