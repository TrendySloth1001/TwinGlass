package com.mobmirror.companion

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.hardware.display.DisplayManager
import android.media.MediaCodecList
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.os.SystemClock
import android.view.Display
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.TimeZone

/**
 * Everything worth knowing about this phone, read from Android's own APIs (no extra permissions).
 * The same list is shown in this app and sent to Twinglass on the Mac (POST /link/info).
 */
object DeviceInfo {
    data class Row(val label: String, val value: String)
    data class Section(val title: String, val rows: List<Row>)

    private class Builder(val title: String) {
        val rows = mutableListOf<Row>()
        fun add(label: String, value: Any?) {
            val v = value?.toString()?.trim().orEmpty()
            if (v.isNotEmpty() && v != "unknown") rows += Row(label, v)
        }
    }

    private fun section(title: String, fill: Builder.() -> Unit): Section = Builder(title).apply { fill() }.let { Section(it.title, it.rows) }

    private fun bytes(n: Long): String {
        if (n <= 0) return ""
        val units = listOf("B", "KB", "MB", "GB", "TB")
        var v = n.toDouble(); var i = 0
        while (v >= 1024 && i < units.lastIndex) { v /= 1024; i++ }
        return String.format(Locale.US, if (v >= 100 || i == 0) "%.0f %s" else "%.1f %s", v, units[i])
    }

    private fun duration(ms: Long): String {
        val m = ms / 60_000; val d = m / 1440; val h = (m % 1440) / 60
        return if (d > 0) "${d}d ${h}h" else "${h}h ${m % 60}m"
    }

    fun collect(ctx: Context): List<Section> {
        val adv = Prefs.advanced(ctx)
        return listOfNotNull(
            device(), android(), cpu(), memory(ctx), display(ctx), battery(ctx), cameras(ctx),
            if (adv.detailsSensors) sensors(ctx) else null,
            if (adv.detailsCodecs) media() else null,
            network(ctx), features(ctx), locale(),
        ).filter { it.rows.isNotEmpty() }
    }

    private fun device() = section("Device") {
        add("Model", Build.MODEL)
        add("Manufacturer", Build.MANUFACTURER)
        add("Brand", Build.BRAND)
        add("Device", Build.DEVICE)
        add("Product", Build.PRODUCT)
        add("Board", Build.BOARD)
        add("Hardware", Build.HARDWARE)
        if (Build.VERSION.SDK_INT >= 31) {
            add("SoC", listOf(Build.SOC_MANUFACTURER, Build.SOC_MODEL).filter { it != Build.UNKNOWN }.joinToString(" "))
            add("SKU", Build.SKU)
        }
    }

    private fun android() = section("Android") {
        add("Version", "Android ${Build.VERSION.RELEASE}")
        add("API level", Build.VERSION.SDK_INT)
        if (Build.VERSION.SDK_INT >= 23) add("Security patch", Build.VERSION.SECURITY_PATCH)
        add("Build", Build.DISPLAY)
        add("Build ID", Build.ID)
        add("Incremental", Build.VERSION.INCREMENTAL)
        add("Type", "${Build.TYPE} · ${Build.TAGS}")
        add("Codename", Build.VERSION.CODENAME.takeIf { it != "REL" })
        add("Bootloader", Build.BOOTLOADER)
        add("Radio", Build.getRadioVersion())
        add("Kernel", System.getProperty("os.version"))
        add("Runtime", "${System.getProperty("java.vm.name")} ${System.getProperty("java.vm.version")}")
        add("Uptime", duration(SystemClock.elapsedRealtime()))
        add("Fingerprint", Build.FINGERPRINT)
    }

    private fun cpu() = section("CPU") {
        add("Cores", Runtime.getRuntime().availableProcessors())
        add("ABIs", Build.SUPPORTED_ABIS.joinToString(", "))
        // Max clock per core, from sysfs (readable by apps on most phones).
        val freqs = (0 until Runtime.getRuntime().availableProcessors()).mapNotNull { i ->
            runCatching { java.io.File("/sys/devices/system/cpu/cpu$i/cpufreq/cpuinfo_max_freq").readText().trim().toLong() / 1000 }.getOrNull()
        }
        if (freqs.isNotEmpty()) add("Max clock", freqs.distinct().sortedDescending().joinToString(" / ") { "$it MHz" })
    }

    private fun memory(ctx: Context) = section("Memory & storage") {
        val am = ctx.getSystemService(ActivityManager::class.java)
        val mi = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        add("RAM", bytes(mi.totalMem))
        add("RAM available", bytes(mi.availMem))
        add("Low memory", if (mi.lowMemory) "Yes" else "No")
        add("App memory class", "${am.memoryClass} MB (large ${am.largeMemoryClass} MB)")
        val fs = StatFs(Environment.getDataDirectory().path)
        add("Storage", bytes(fs.totalBytes))
        add("Storage free", bytes(fs.availableBytes))
    }

    @Suppress("DEPRECATION")
    private fun display(ctx: Context) = section("Display") {
        val d = ctx.getSystemService(DisplayManager::class.java).getDisplay(Display.DEFAULT_DISPLAY) ?: return@section
        val mode = d.mode
        add("Resolution", "${mode.physicalWidth} × ${mode.physicalHeight}")
        add("Density", "${ctx.resources.displayMetrics.densityDpi} dpi")
        add("Refresh rate", "${"%.0f".format(Locale.US, d.refreshRate)} Hz")
        add("Refresh rates", d.supportedModes.map { it.refreshRate.toInt() }.distinct().sortedDescending().joinToString(", ") { "$it Hz" })
        val hdr = d.hdrCapabilities?.supportedHdrTypes?.map {
            when (it) { 1 -> "Dolby Vision"; 2 -> "HDR10"; 3 -> "HLG"; 4 -> "HDR10+"; else -> "type $it" }
        }.orEmpty()
        add("HDR", hdr.ifEmpty { listOf("None") }.joinToString(", "))
        add("Wide colour", if (d.isWideColorGamut) "Yes" else "No")
        add("Rotation", "${d.rotation * 90}°")
    }

    private fun battery(ctx: Context) = section("Battery") {
        val i = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return@section
        val level = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = i.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
        if (level >= 0) add("Level", "${level * 100 / scale}%")
        add("Status", when (i.getIntExtra(BatteryManager.EXTRA_STATUS, 0)) {
            BatteryManager.BATTERY_STATUS_CHARGING -> "Charging"; BatteryManager.BATTERY_STATUS_FULL -> "Full"
            BatteryManager.BATTERY_STATUS_DISCHARGING -> "Discharging"; BatteryManager.BATTERY_STATUS_NOT_CHARGING -> "Not charging"
            else -> null
        })
        add("Power source", when (i.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)) {
            BatteryManager.BATTERY_PLUGGED_AC -> "Charger"; BatteryManager.BATTERY_PLUGGED_USB -> "USB"
            BatteryManager.BATTERY_PLUGGED_WIRELESS -> "Wireless"; 0 -> "Battery"; else -> null
        })
        add("Health", when (i.getIntExtra(BatteryManager.EXTRA_HEALTH, 0)) {
            BatteryManager.BATTERY_HEALTH_GOOD -> "Good"; BatteryManager.BATTERY_HEALTH_OVERHEAT -> "Overheating"
            BatteryManager.BATTERY_HEALTH_DEAD -> "Dead"; BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "Over voltage"
            BatteryManager.BATTERY_HEALTH_COLD -> "Cold"; else -> null
        })
        val t = i.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
        if (t != Int.MIN_VALUE) add("Temperature", "${"%.1f".format(Locale.US, t / 10.0)} °C")
        val mv = i.getIntExtra(BatteryManager.EXTRA_VOLTAGE, -1)
        if (mv > 0) add("Voltage", "${"%.2f".format(Locale.US, mv / 1000.0)} V")
        add("Technology", i.getStringExtra(BatteryManager.EXTRA_TECHNOLOGY))
        if (Build.VERSION.SDK_INT >= 34) {
            val cycles = i.getIntExtra(BatteryManager.EXTRA_CYCLE_COUNT, -1)
            if (cycles >= 0) add("Charge cycles", cycles)
        }
        val bm = ctx.getSystemService(BatteryManager::class.java)
        val now = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)
        if (now != Int.MIN_VALUE && now != 0) add("Current", "${now / 1000} mA")
    }

    private fun cameras(ctx: Context) = section("Cameras") {
        val cm = ctx.getSystemService(CameraManager::class.java)
        runCatching {
            for (id in cm.cameraIdList) {
                val c = cm.getCameraCharacteristics(id)
                val facing = when (c.get(CameraCharacteristics.LENS_FACING)) {
                    CameraCharacteristics.LENS_FACING_FRONT -> "Front"; CameraCharacteristics.LENS_FACING_BACK -> "Back"; else -> "External"
                }
                val px = c.get(CameraCharacteristics.SENSOR_INFO_PIXEL_ARRAY_SIZE)
                val mp = px?.let { "%.1f MP".format(Locale.US, it.width * it.height / 1_000_000.0) } ?: ""
                add("$facing camera $id", mp)
            }
        }
    }

    private fun sensors(ctx: Context) = section("Sensors") {
        val list = ctx.getSystemService(SensorManager::class.java).getSensorList(Sensor.TYPE_ALL)
        add("Count", list.size)
        for (s in list.distinctBy { it.type }.take(40)) add(s.stringType.substringAfterLast('.').replace('_', ' ').replaceFirstChar { it.uppercase() }, s.name)
    }

    private fun media() = section("Video codecs") {
        val codecs = MediaCodecList(MediaCodecList.REGULAR_CODECS).codecInfos
        val enc = codecs.filter { it.isEncoder }.flatMap { it.supportedTypes.toList() }.filter { it.startsWith("video/") }.distinct()
        val dec = codecs.filter { !it.isEncoder }.flatMap { it.supportedTypes.toList() }.filter { it.startsWith("video/") }.distinct()
        add("Encoders", enc.joinToString(", ") { it.removePrefix("video/") })
        add("Decoders", dec.joinToString(", ") { it.removePrefix("video/") })
    }

    private fun network(ctx: Context) = section("Network") {
        val cm = ctx.getSystemService(ConnectivityManager::class.java)
        val caps = cm.getNetworkCapabilities(cm.activeNetwork)
        add("Connection", when {
            caps == null -> "Offline"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobile data"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "VPN"
            else -> "Other"
        })
        if (caps != null) {
            add("Down / up", "${caps.linkDownstreamBandwidthKbps / 1000} / ${caps.linkUpstreamBandwidthKbps / 1000} Mbps")
            add("Metered", if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)) "No" else "Yes")
        }
    }

    private fun features(ctx: Context) = section("Features") {
        val pm = ctx.packageManager
        fun yes(f: String) = if (pm.hasSystemFeature(f)) "Yes" else "No"
        add("NFC", yes(PackageManager.FEATURE_NFC))
        add("Fingerprint", yes(PackageManager.FEATURE_FINGERPRINT))
        add("Bluetooth LE", yes(PackageManager.FEATURE_BLUETOOTH_LE))
        add("Telephony", yes(PackageManager.FEATURE_TELEPHONY))
        add("Wi-Fi Direct", yes(PackageManager.FEATURE_WIFI_DIRECT))
        add("USB host", yes(PackageManager.FEATURE_USB_HOST))
        add("Vulkan", yes(PackageManager.FEATURE_VULKAN_HARDWARE_VERSION))
        add("OpenGL ES", ctx.getSystemService(ActivityManager::class.java).deviceConfigurationInfo.glEsVersion)
    }

    private fun locale() = section("Region") {
        add("Language", Locale.getDefault().displayName)
        add("Time zone", TimeZone.getDefault().id)
    }

    /** Numbers for the home screen's figures and dot meters. */
    data class Snapshot(
        val model: String,
        val maker: String,
        val android: String,
        val api: Int,
        val battery: Int?,
        val charging: Boolean,
        val ramTotal: Long,
        val ramFree: Long,
        val storageTotal: Long,
        val storageFree: Long,
        val refreshHz: Int,
        val resolution: String,
        val soc: String,
    )

    @Suppress("DEPRECATION")
    fun snapshot(ctx: Context): Snapshot {
        val am = ctx.getSystemService(ActivityManager::class.java)
        val mi = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        val fs = StatFs(Environment.getDataDirectory().path)
        val bat = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = bat?.let { i ->
            val l = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val sc = i.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
            if (l >= 0 && sc > 0) l * 100 / sc else null
        }
        val status = bat?.getIntExtra(BatteryManager.EXTRA_STATUS, 0) ?: 0
        val d = ctx.getSystemService(DisplayManager::class.java).getDisplay(Display.DEFAULT_DISPLAY)
        val soc = if (Build.VERSION.SDK_INT >= 31) listOf(Build.SOC_MANUFACTURER, Build.SOC_MODEL).filter { it != Build.UNKNOWN }.joinToString(" ") else Build.HARDWARE
        return Snapshot(
            model = Build.MODEL,
            maker = Build.MANUFACTURER.replaceFirstChar { it.uppercase() },
            android = Build.VERSION.RELEASE,
            api = Build.VERSION.SDK_INT,
            battery = level,
            charging = status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL,
            ramTotal = mi.totalMem,
            ramFree = mi.availMem,
            storageTotal = fs.totalBytes,
            storageFree = fs.availableBytes,
            refreshHz = d?.supportedModes?.maxOfOrNull { it.refreshRate }?.toInt() ?: d?.refreshRate?.toInt() ?: 60,
            resolution = d?.mode?.let { "${it.physicalWidth} × ${it.physicalHeight}" } ?: "",
            soc = soc,
        )
    }

    /** Developer options, USB debugging and wireless debugging (readable Global settings). */
    data class DevState(val developerOptions: Boolean, val usbDebugging: Boolean, val wirelessDebugging: Boolean)

    fun devState(ctx: Context): DevState {
        val cr = ctx.contentResolver
        fun g(name: String) = runCatching { android.provider.Settings.Global.getInt(cr, name, 0) == 1 }.getOrDefault(false)
        return DevState(
            developerOptions = g(android.provider.Settings.Global.DEVELOPMENT_SETTINGS_ENABLED),
            usbDebugging = g(android.provider.Settings.Global.ADB_ENABLED),
            wirelessDebugging = g("adb_wifi_enabled"),
        )
    }

    /** "Agents read any screen": our accessibility service switched on, and running. */
    fun agentAccess(ctx: Context): Pair<Boolean, Boolean> {
        val am = ctx.getSystemService(android.view.accessibility.AccessibilityManager::class.java)
        val on = am.getEnabledAccessibilityServiceList(android.accessibilityservice.AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
            .any { it.resolveInfo.serviceInfo.packageName == ctx.packageName }
        return on to (AgentService.instance != null)
    }

    /**
     * Size in GB: [decimal] = 1000³ like Android's own Settings and the box ("256 GB"), else
     * binary GiB (1024³, what most tools print).
     */
    fun gb(n: Long, decimal: Boolean = true): String {
        val v = n / (if (decimal) 1e9 else (1L shl 30).toDouble())
        return String.format(Locale.US, if (v >= 100) "%.0f" else if (v >= 1) "%.1f" else "%.2f", v)
    }

    fun gbUnit(decimal: Boolean) = if (decimal) "GB" else "GiB"

    /** All details in the chosen copy format. */
    fun format(sections: List<Section>, f: Prefs.CopyFormat): String = when (f) {
        Prefs.CopyFormat.Text -> toText(sections)
        Prefs.CopyFormat.Markdown -> sections.joinToString("\n\n") { s ->
            "## ${s.title}\n\n| | |\n|---|---|\n" + s.rows.joinToString("\n") { "| ${it.label} | ${it.value.replace("|", "\\|")} |" }
        }
        Prefs.CopyFormat.Json -> toJson(sections, "").toString(2)
    }

    fun appVersion(ctx: Context): String = runCatching { ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName }.getOrNull() ?: ""

    fun toJson(sections: List<Section>, appVersion: String): JSONObject = JSONObject().put("sections", JSONArray().apply {
        for (s in sections) put(JSONObject().put("title", s.title).put("rows", JSONArray().apply {
            for (r in s.rows) put(JSONObject().put("label", r.label).put("value", r.value))
        }))
    }).put("app", appVersion)

    fun toText(sections: List<Section>): String = sections.joinToString("\n\n") { s ->
        s.title + "\n" + s.rows.joinToString("\n") { "${it.label}: ${it.value}" }
    }
}
