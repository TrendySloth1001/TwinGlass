package com.mobmirror.companion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Base64
import org.json.JSONObject

/**
 * Agent requests from Twinglass on the Mac, through `am broadcast` (adb only: DUMP permission).
 * The answer goes back as the broadcast's result data (base64 JSON), which `am broadcast` prints:
 * no network round trip. Extras: op (tree | click | long_click | set_text | focus | scroll_*),
 * display (int), ref (node ref from tree), text (set_text), limit (tree).
 */
class AgentReceiver : BroadcastReceiver() {
    /** Settings → Advanced → Most elements per read. */
    private fun cap(ctx: Context) = Prefs.advanced(ctx).agentMaxNodes.coerceIn(50, 2000)

    override fun onReceive(context: Context, intent: Intent) {
        val svc = AgentService.instance
        val op = intent.getStringExtra("op") ?: "tree"
        val display = intent.getIntExtra("display", 0)
        val res = try {
            when {
                op == "ping" -> JSONObject().put("ok", true).put("service", svc != null)
                svc == null -> JSONObject().put("ok", false).put("error", "a11y-off")
                op == "tree" -> svc.tree(display, intent.getIntExtra("limit", 400).coerceIn(10, cap(context))).put("ok", true)
                op == "map" -> svc.map(
                    display,
                    intent.getIntExtra("limit", 800).coerceIn(10, cap(context)),
                    intent.getBooleanExtra("rendering", true) && Prefs.advanced(context).agentRendering,
                ).put("ok", true)
                else -> svc.act(display, intent.getStringExtra("ref") ?: "", op, intent.getStringExtra("text"))
            }
        } catch (e: Exception) {
            JSONObject().put("ok", false).put("error", e.toString())
        }
        Prefs.log(context, "agent $op on display $display → ${if (res.optBoolean("ok", true)) "ok" else res.optString("error")}")
        resultData = Base64.encodeToString(res.toString().toByteArray(), Base64.NO_WRAP)
    }
}
