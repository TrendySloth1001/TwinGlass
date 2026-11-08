package com.mobmirror.companion

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager

/**
 * The phone app's settings (SharedPreferences "settings"), plus switches that turn the app's own
 * components on or off (share target, and the receivers the Mac talks to), so what the Mac may
 * use is enforced by Android, not just remembered.
 */
object Prefs {
    enum class Theme { System, Light, Dark }

    /**
     * How this phone connects: Unset = show the landing page; NoSetup = Wi-Fi without developer
     * mode (the app mirrors itself); Developer = USB / wireless debugging (full control, agents).
     */
    enum class Mode { Unset, NoSetup, Developer }

    fun mode(ctx: Context): Mode = enumOf(ctx, "mode", Mode.Unset)
    fun setMode(ctx: Context, m: Mode) = put(ctx, "mode", m)

    /** One-time explanations already shown (so sheets don't nag). */
    fun seen(ctx: Context, key: String) = p(ctx).getBoolean("seen.$key", false)
    fun markSeen(ctx: Context, key: String) = put(ctx, "seen.$key", true)
    enum class StartTab { Home, Device }
    enum class Units { Decimal, Binary }
    enum class CopyFormat { Text, Markdown, Json }

    /** Text size factors (Sparky's textScales). */
    val textScales = listOf(0.9f to "Small", 1f to "Normal", 1.15f to "Large", 1.3f to "Huge")
    val refreshChoices = listOf(1 to "1 s", 3 to "3 s", 10 to "10 s", 30 to "30 s")

    private fun p(ctx: Context) = ctx.getSharedPreferences("settings", Context.MODE_PRIVATE)
    private inline fun <reified E : Enum<E>> enumOf(ctx: Context, key: String, default: E): E =
        runCatching { enumValueOf<E>(p(ctx).getString(key, null) ?: default.name) }.getOrDefault(default)

    /** Everything at once, for the UI. */
    data class All(
        val theme: Theme,
        val textScale: Float,
        val dotGrid: Boolean,
        val reduceMotion: Boolean,
        val haptics: Boolean,
        val startTab: StartTab,
        val showMetrics: Boolean,
        val showQuickActions: Boolean,
        val refreshSec: Int,
        val units: Units,
        val copyFormat: CopyFormat,
        val shareAutoClose: Boolean,
        val shareConfirmMb: Int,
        val shareNotifyMac: Boolean,
        val shareDatePrefix: Boolean,
        val keepScreenOn: Boolean,
    )

    fun all(ctx: Context) = All(
        theme = enumOf(ctx, "theme", Theme.System),
        textScale = p(ctx).getFloat("textScale", 1f),
        dotGrid = p(ctx).getBoolean("dotGrid", true),
        reduceMotion = p(ctx).getBoolean("reduceMotion", false),
        haptics = p(ctx).getBoolean("haptics", true),
        startTab = enumOf(ctx, "startTab", StartTab.Home),
        showMetrics = p(ctx).getBoolean("showMetrics", true),
        showQuickActions = p(ctx).getBoolean("showQuickActions", true),
        refreshSec = p(ctx).getInt("refreshSec", 3),
        units = enumOf(ctx, "units", Units.Decimal),
        copyFormat = enumOf(ctx, "copyFormat", CopyFormat.Text),
        shareAutoClose = p(ctx).getBoolean("shareAutoClose", true),
        shareConfirmMb = p(ctx).getInt("shareConfirmMb", 100),
        shareNotifyMac = p(ctx).getBoolean("shareNotifyMac", true),
        shareDatePrefix = p(ctx).getBoolean("shareDatePrefix", false),
        keepScreenOn = p(ctx).getBoolean("keepScreenOn", false),
    )

    fun put(ctx: Context, key: String, value: Any) {
        val e = p(ctx).edit()
        when (value) {
            is Boolean -> e.putBoolean(key, value)
            is Int -> e.putInt(key, value)
            is Float -> e.putFloat(key, value)
            is Enum<*> -> e.putString(key, value.name)
            else -> e.putString(key, value.toString())
        }
        e.apply()
    }

    fun theme(ctx: Context): Theme = enumOf(ctx, "theme", Theme.System)
    fun shareAutoClose(ctx: Context) = p(ctx).getBoolean("shareAutoClose", true)
    fun shareConfirmMb(ctx: Context) = p(ctx).getInt("shareConfirmMb", 100)
    fun shareNotifyMac(ctx: Context) = p(ctx).getBoolean("shareNotifyMac", true)
    fun shareDatePrefix(ctx: Context) = p(ctx).getBoolean("shareDatePrefix", false)

    // ---- advanced ----

    data class Advanced(
        /** Link request timeout (ms): longer helps on slow wireless debugging. */
        val linkTimeoutMs: Int,
        /** Most elements an agent read returns (bigger = slower, more complete). */
        val agentMaxNodes: Int,
        /** Layout params and text sizes in agent maps (screen_map): richer, slower. */
        val agentRendering: Boolean,
        val detailsSensors: Boolean,
        val detailsCodecs: Boolean,
        /** Largest app icon sent to the Mac (px). */
        val iconSize: Int,
        val debugLog: Boolean,
    )

    fun advanced(ctx: Context) = Advanced(
        linkTimeoutMs = p(ctx).getInt("adv.linkTimeoutMs", 2500),
        agentMaxNodes = p(ctx).getInt("adv.agentMaxNodes", 800),
        agentRendering = p(ctx).getBoolean("adv.agentRendering", true),
        detailsSensors = p(ctx).getBoolean("adv.detailsSensors", true),
        detailsCodecs = p(ctx).getBoolean("adv.detailsCodecs", true),
        iconSize = p(ctx).getInt("adv.iconSize", 128),
        debugLog = p(ctx).getBoolean("adv.debugLog", false),
    )

    /** Logcat (tag "Twinglass") when Advanced → Debug logging is on. */
    fun log(ctx: Context, msg: String) {
        if (p(ctx).getBoolean("adv.debugLog", false)) android.util.Log.d("Twinglass", msg)
    }

    /** Back to defaults (settings only: the Mac link and component switches stay). */
    fun reset(ctx: Context) {
        val keepMode = mode(ctx)
        p(ctx).edit().clear().apply()
        setMode(ctx, keepMode) // the connection choice isn't a "setting" to undo
    }

    // ---- component switches (enforced by Android) ----

    enum class Feature(val cls: Class<*>) {
        /** "Send to Mac" in other apps' share sheets. */
        ShareTarget(ShareActivity::class.java),

        /** The Mac's Phone details window reads this phone's details from here. */
        Details(InfoReceiver::class.java),

        /** Real app icons in Twinglass' app grid and ⌘K. */
        Icons(IconReceiver::class.java),

        /** Agents reading / pressing elements (needs "Read any screen" too). */
        Agent(AgentReceiver::class.java),
    }

    fun enabled(ctx: Context, f: Feature): Boolean {
        val s = ctx.packageManager.getComponentEnabledSetting(ComponentName(ctx, f.cls))
        return s != PackageManager.COMPONENT_ENABLED_STATE_DISABLED
    }

    fun setEnabled(ctx: Context, f: Feature, on: Boolean) {
        ctx.packageManager.setComponentEnabledSetting(
            ComponentName(ctx, f.cls),
            if (on) PackageManager.COMPONENT_ENABLED_STATE_DEFAULT else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            PackageManager.DONT_KILL_APP,
        )
    }
}
