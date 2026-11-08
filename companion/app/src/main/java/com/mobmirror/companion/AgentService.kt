package com.mobmirror.companion

import android.accessibilityservice.AccessibilityService
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import org.json.JSONArray
import org.json.JSONObject

/**
 * Reads and acts on the UI of ANY display (the phone's screen or a Twinglass second screen):
 * `uiautomator dump` only sees the default display. Driven by AgentReceiver (adb only).
 * Node refs are "w.i.j…": window index on that display, then child indices from its root.
 */
class AgentService : AccessibilityService() {
    override fun onServiceConnected() { instance = this }
    override fun onDestroy() { if (instance === this) instance = null; super.onDestroy() }
    override fun onUnbind(intent: android.content.Intent?): Boolean { if (instance === this) instance = null; return super.onUnbind(intent) }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}

    private fun windows(display: Int): List<AccessibilityWindowInfo> =
        if (Build.VERSION.SDK_INT >= 30) windowsOnAllDisplays.get(display)?.toList().orEmpty()
        else if (display == 0) windows.orEmpty() else emptyList()

    /** Top window first (Android lists them in z-order, top first). */
    fun tree(display: Int, limit: Int): JSONObject {
        val out = JSONArray()
        val wins = JSONArray()
        windows(display).forEachIndexed { wi, w ->
            val root = w.root ?: return@forEachIndexed
            wins.put(JSONObject().put("index", wi).put("type", w.type).put("title", w.title?.toString() ?: "").put("pkg", root.packageName?.toString() ?: "").put("active", w.isActive).put("focused", w.isFocused))
            walk(root, "$wi", out, limit)
        }
        return JSONObject().put("display", display).put("windows", wins).put("nodes", out)
    }

    private fun walk(n: AccessibilityNodeInfo, ref: String, out: JSONArray, limit: Int) {
        if (out.length() >= limit) return
        val text = n.text?.toString().orEmpty()
        val desc = n.contentDescription?.toString().orEmpty()
        val hint = if (Build.VERSION.SDK_INT >= 26) n.hintText?.toString().orEmpty() else ""
        val keep = text.isNotEmpty() || desc.isNotEmpty() || n.isClickable || n.isLongClickable || n.isScrollable || n.isEditable || n.isCheckable
        if (keep && n.isVisibleToUser) {
            val r = Rect().also { n.getBoundsInScreen(it) }
            if (r.width() > 0 && r.height() > 0) out.put(JSONObject().apply {
                put("ref", ref)
                put("text", text); put("desc", desc); if (hint.isNotEmpty()) put("hint", hint)
                put("id", n.viewIdResourceName ?: "")
                put("cls", n.className?.toString()?.substringAfterLast('.') ?: "View")
                put("pkg", n.packageName?.toString() ?: "")
                put("b", JSONArray(listOf(r.left, r.top, r.right, r.bottom)))
                put("f", listOfNotNull(
                    "click".takeIf { n.isClickable }, "long".takeIf { n.isLongClickable }, "scroll".takeIf { n.isScrollable },
                    "edit".takeIf { n.isEditable }, "checked".takeIf { n.isChecked }, "selected".takeIf { n.isSelected },
                    "focused".takeIf { n.isFocused }, "disabled".takeIf { !n.isEnabled }, "password".takeIf { n.isPassword },
                ).joinToString(","))
            })
        }
        for (i in 0 until n.childCount) {
            val c = n.getChild(i) ?: continue
            walk(c, "$ref.$i", out, limit)
        }
    }

    /**
     * Layout map of a display: EVERY visible view (containers too), with exact bounds, plus — where
     * the app's views expose it (Android 11+ "rendering info") — the layout size (match_parent /
     * wrap_content / px) and text size. Windows come with type and bounds (status / navigation
     * bars, keyboard, app). Refs are the same as in tree().
     */
    fun map(display: Int, limit: Int, rendering: Boolean): JSONObject {
        val nodes = JSONArray()
        val wins = JSONArray()
        windows(display).forEachIndexed { wi, w ->
            val wr = Rect().also { w.getBoundsInScreen(it) }
            val root = w.root
            wins.put(JSONObject().put("index", wi).put("type", w.type).put("title", w.title?.toString() ?: "")
                .put("pkg", root?.packageName?.toString() ?: "").put("layer", w.layer).put("b", JSONArray(listOf(wr.left, wr.top, wr.right, wr.bottom))))
            if (root != null) mapWalk(root, "$wi", 0, nodes, limit, rendering)
        }
        return JSONObject().put("display", display).put("windows", wins).put("nodes", nodes).put("truncated", nodes.length() >= limit)
    }

    private fun mapWalk(n: AccessibilityNodeInfo, ref: String, depth: Int, out: JSONArray, limit: Int, rendering: Boolean) {
        if (out.length() >= limit || !n.isVisibleToUser) return
        val r = Rect().also { n.getBoundsInScreen(it) }
        if (r.width() > 0 && r.height() > 0) {
            val o = JSONObject()
            o.put("ref", ref).put("d", depth)
            o.put("cls", n.className?.toString()?.substringAfterLast('.') ?: "View")
            n.text?.toString()?.takeIf { it.isNotEmpty() }?.let { o.put("text", it.take(200)) }
            n.contentDescription?.toString()?.takeIf { it.isNotEmpty() }?.let { o.put("desc", it.take(200)) }
            if (Build.VERSION.SDK_INT >= 26) n.hintText?.toString()?.takeIf { it.isNotEmpty() }?.let { o.put("hint", it.take(120)) }
            n.viewIdResourceName?.let { o.put("id", it) }
            o.put("pkg", n.packageName?.toString() ?: "")
            o.put("b", JSONArray(listOf(r.left, r.top, r.right, r.bottom)))
            val f = listOfNotNull(
                "click".takeIf { n.isClickable }, "scroll".takeIf { n.isScrollable }, "edit".takeIf { n.isEditable },
                "checkable".takeIf { n.isCheckable }, "checked".takeIf { n.isChecked }, "selected".takeIf { n.isSelected },
                "focused".takeIf { n.isFocused }, "disabled".takeIf { !n.isEnabled },
            )
            if (f.isNotEmpty()) o.put("f", f.joinToString(","))
            if (n.childCount > 0) o.put("children", n.childCount)
            if (rendering && Build.VERSION.SDK_INT >= 30 &&
                n.availableExtraData?.contains(AccessibilityNodeInfo.EXTRA_DATA_RENDERING_INFO_KEY) == true &&
                n.refreshWithExtraData(AccessibilityNodeInfo.EXTRA_DATA_RENDERING_INFO_KEY, Bundle())
            ) {
                n.extraRenderingInfo?.let { info ->
                    info.layoutSize?.let { sz -> o.put("lw", sz.width).put("lh", sz.height) } // px, -1 match_parent, -2 wrap_content
                    if (info.textSizeInPx > 0) o.put("tpx", info.textSizeInPx.toDouble()).put("tunit", info.textSizeUnit)
                }
            }
            out.put(o)
        }
        for (i in 0 until n.childCount) {
            val c = n.getChild(i) ?: continue
            mapWalk(c, "$ref.$i", depth + 1, out, limit, rendering)
        }
    }

    private fun resolve(display: Int, ref: String): AccessibilityNodeInfo? {
        val parts = ref.split('.').map { it.toIntOrNull() ?: return null }
        var n = windows(display).getOrNull(parts.first())?.root ?: return null
        for (i in parts.drop(1)) n = n.getChild(i) ?: return null
        return n
    }

    /** click / long_click (climbing to the nearest clickable parent), set_text, scroll_*, focus. */
    fun act(display: Int, ref: String, op: String, text: String?): JSONObject {
        val node = resolve(display, ref) ?: return JSONObject().put("ok", false).put("error", "element gone (take a new ui tree)")
        fun climb(pred: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? {
            var c: AccessibilityNodeInfo? = node
            while (c != null && !pred(c)) c = c.parent
            return c
        }
        val ok = when (op) {
            "click" -> climb { it.isClickable }?.performAction(AccessibilityNodeInfo.ACTION_CLICK) ?: false
            "long_click" -> climb { it.isLongClickable }?.performAction(AccessibilityNodeInfo.ACTION_LONG_CLICK) ?: false
            "set_text" -> (climb { it.isEditable } ?: node).performAction(
                AccessibilityNodeInfo.ACTION_SET_TEXT,
                Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text ?: "") },
            )
            "focus" -> node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
            "scroll_forward" -> climb { it.isScrollable }?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD) ?: false
            "scroll_backward" -> climb { it.isScrollable }?.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD) ?: false
            else -> return JSONObject().put("ok", false).put("error", "unknown op $op")
        }
        return JSONObject().put("ok", ok)
    }

    /** One-finger gesture through [pts] over [durationMs] (a single point = tap / long-press). */
    fun gesture(pts: List<Pair<Float, Float>>, durationMs: Long) {
        if (pts.isEmpty()) return
        val path = android.graphics.Path().apply {
            moveTo(pts[0].first.coerceAtLeast(0f), pts[0].second.coerceAtLeast(0f))
            pts.drop(1).forEach { lineTo(it.first.coerceAtLeast(0f), it.second.coerceAtLeast(0f)) }
        }
        val stroke = android.accessibilityservice.GestureDescription.StrokeDescription(path, 0, durationMs.coerceAtLeast(1))
        dispatchGesture(android.accessibilityservice.GestureDescription.Builder().addStroke(stroke).build(), null, null)
    }

    companion object {
        @Volatile var instance: AgentService? = null
    }
}
