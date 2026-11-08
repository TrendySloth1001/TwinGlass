package com.mobmirror.companion.direct

import android.accessibilityservice.AccessibilityService
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.accessibility.AccessibilityNodeInfo
import com.mobmirror.companion.AgentService
import java.nio.ByteBuffer

/**
 * Turns the Mac's control messages (scrcpy encoding, src/shared/scrcpy/control.ts) into input
 * through the accessibility service, since without developer mode there is no input injection:
 * a finger's whole path is sent as one gesture when it lifts (tap / long-press / swipe), wheel
 * scrolls become swipes, keys map to global actions or the focused field.
 */
class DirectInput(private val ctx: Context) {
    private data class Stroke(val start: Long, val points: MutableList<Pair<Float, Float>>)

    private var stroke: Stroke? = null

    private val svc: AgentService? get() = AgentService.instance

    /** [video]: the stream size the Mac's coordinates refer to. */
    fun handle(msg: ByteArray, video: Pair<Int, Int>) {
        val b = ByteBuffer.wrap(msg)
        when (msg[0].toInt()) {
            0 -> if (b.get(1).toInt() == 0) key(b.getInt(2)) // INJECT_KEYCODE, on key down
            1 -> text(String(msg, 5, b.getInt(1)))
            2 -> touch(b.get(1).toInt(), b.getInt(10), b.getInt(14), video)
            3 -> scroll(b.getInt(1), b.getInt(5), b.getShort(13).toInt(), video)
            4 -> if (b.get(1).toInt() == 0) svc?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
            5 -> svc?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_NOTIFICATIONS)
            6 -> svc?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_QUICK_SETTINGS)
            7 -> if (Build.VERSION.SDK_INT >= 31) svc?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE)
            9 -> clipboard(String(msg, 14, b.getInt(10)), msg[9].toInt() == 1)
            16 -> startApp(String(msg, 2, msg[1].toInt() and 0xff))
        }
    }

    /** Video coordinates → this phone's real screen pixels. */
    private fun toScreen(x: Int, y: Int, video: Pair<Int, Int>): Pair<Float, Float> {
        val b = ctx.getSystemService(android.view.WindowManager::class.java).maximumWindowMetrics.bounds
        val (vw, vh) = video
        if (vw <= 0 || vh <= 0) return x.toFloat() to y.toFloat()
        return x * b.width().toFloat() / vw to y * b.height().toFloat() / vh
    }

    private fun touch(action: Int, x: Int, y: Int, video: Pair<Int, Int>) {
        val p = toScreen(x, y, video)
        when (action) {
            0 -> stroke = Stroke(SystemClock.uptimeMillis(), mutableListOf(p)) // DOWN
            2 -> stroke?.points?.let { pts -> if (pts.size < 400) pts.add(p) } // MOVE
            1 -> { // UP: send the whole stroke
                val s = stroke ?: return
                stroke = null
                s.points.add(p)
                val ms = SystemClock.uptimeMillis() - s.start
                val (x0, y0) = s.points.first()
                val moved = s.points.maxOf { kotlin.math.hypot(it.first - x0, it.second - y0) }
                val dpi = ctx.resources.displayMetrics.density
                when {
                    moved < 12 * dpi && ms < 450 -> svc?.gesture(listOf(s.points.first()), 40)
                    moved < 12 * dpi -> svc?.gesture(listOf(s.points.first()), ms.coerceIn(500, 3000))
                    else -> svc?.gesture(simplify(s.points), ms.coerceIn(60, 2500))
                }
            }
            3 -> stroke = null // CANCEL
        }
    }

    /** Keeps at most ~30 points of a path (gestures don't need every mouse move). */
    private fun simplify(pts: List<Pair<Float, Float>>): List<Pair<Float, Float>> {
        if (pts.size <= 30) return pts
        val step = pts.size / 30.0
        return (0 until 30).map { pts[(it * step).toInt()] } + pts.last()
    }

    private fun scroll(x: Int, y: Int, vFixed: Int, video: Pair<Int, Int>) {
        val (sx, sy) = toScreen(x, y, video)
        val v = vFixed / 32768f * 16 // wheel clicks, positive = scroll up (content moves down)
        if (v == 0f) return
        val dist = (v * 120 * ctx.resources.displayMetrics.density).coerceIn(-900f, 900f)
        svc?.gesture(listOf(sx to sy, sx to (sy + dist)), 120)
    }

    private fun key(code: Int) {
        val s = svc
        when (code) {
            4 -> s?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
            3 -> s?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
            187 -> s?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_RECENTS)
            26 -> s?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN)
            24, 25 -> ctx.getSystemService(AudioManager::class.java).adjustStreamVolume(
                AudioManager.STREAM_MUSIC, if (code == 24) AudioManager.ADJUST_RAISE else AudioManager.ADJUST_LOWER, AudioManager.FLAG_SHOW_UI,
            )
            66 -> focused()?.let { if (Build.VERSION.SDK_INT >= 30) it.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id) }
            67 -> focused()?.let { n -> n.text?.toString()?.takeIf { it.isNotEmpty() }?.let { setText(n, it.dropLast(1)) } }
        }
    }

    private fun focused(): AccessibilityNodeInfo? = svc?.rootInActiveWindow?.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)

    private fun setText(n: AccessibilityNodeInfo, t: String) =
        n.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, t) })

    /** Typed text goes at the end of the focused field (there's no keyboard injection without adb). */
    private fun text(t: String) {
        val n = focused() ?: return
        val cur = if (n.isShowingHintText) "" else n.text?.toString().orEmpty()
        setText(n, cur + t)
    }

    private fun clipboard(t: String, paste: Boolean) {
        ctx.getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Twinglass", t))
        if (paste) focused()?.performAction(AccessibilityNodeInfo.ACTION_PASTE)
    }

    private fun startApp(pkg: String) {
        val i = ctx.packageManager.getLaunchIntentForPackage(pkg) ?: return
        // Allowed from the background: this app's accessibility service is bound by the system.
        ctx.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
