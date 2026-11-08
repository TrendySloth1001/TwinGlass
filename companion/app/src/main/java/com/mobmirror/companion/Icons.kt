package com.mobmirror.companion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URLEncoder

/**
 * Sends every launcher app's icon to Twinglass on the Mac, so its app grid can show real icons.
 * Triggered by the Mac through adb only (`am broadcast -n …/.IconReceiver`, DUMP permission, see
 * the manifest). Each icon goes as a PNG to POST /link/icon?pkg=…, then POST /link/icons-done.
 */
class IconReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val size = intent.getIntExtra("size", 128).coerceIn(48, Prefs.advanced(context).iconSize.coerceIn(48, 256))
        val pending = goAsync()
        Thread {
            try {
                export(context.applicationContext, size)
            } finally {
                pending.finish()
            }
        }.start()
    }

    private fun export(ctx: Context, size: Int) {
        val pm = ctx.packageManager
        val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val seen = HashSet<String>()
        var sent = 0
        for (ri in pm.queryIntentActivities(launcher, 0)) {
            val pkg = ri.activityInfo.packageName
            if (!seen.add(pkg)) continue
            val png = runCatching { render(ri.loadIcon(pm), size) }.getOrNull() ?: continue
            if (Link.post(ctx, "/link/icon", "&pkg=" + URLEncoder.encode(pkg, "UTF-8"), png)) sent++
        }
        Link.post(ctx, "/link/icons-done", "&count=$sent", ByteArray(0))
    }

    /** Draws the icon (adaptive icons come out masked to the phone's own shape). */
    private fun render(d: android.graphics.drawable.Drawable, size: Int): ByteArray {
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        d.setBounds(0, 0, size, size)
        d.draw(Canvas(bmp))
        val out = ByteArrayOutputStream()
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
        bmp.recycle()
        return out.toByteArray()
    }
}
