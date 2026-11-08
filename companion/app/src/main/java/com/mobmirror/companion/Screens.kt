package com.mobmirror.companion

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Android
import androidx.compose.material.icons.rounded.Straighten
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Animation
import androidx.compose.material.icons.rounded.Apps
import androidx.compose.material.icons.rounded.Bolt
import androidx.compose.material.icons.rounded.BugReport
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Dashboard
import androidx.compose.material.icons.rounded.FormatSize
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.RestartAlt
import androidx.compose.material.icons.rounded.Today
import androidx.compose.material.icons.rounded.Vibration
import androidx.compose.material.icons.rounded.BatteryFull
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Extension
import androidx.compose.material.icons.rounded.GridView
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Laptop
import androidx.compose.material.icons.rounded.LinkOff
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Memory
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.PhotoCamera
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.ScreenShare
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material.icons.rounded.SettingsAccessibility
import androidx.compose.material.icons.rounded.SmartToy
import androidx.compose.material.icons.rounded.Smartphone
import androidx.compose.material.icons.rounded.Speed
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material.icons.rounded.Usb
import androidx.compose.material.icons.rounded.Videocam
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mobmirror.companion.ui.Cell
import com.mobmirror.companion.ui.CellRow
import com.mobmirror.companion.ui.Chevron
import com.mobmirror.companion.ui.Chip
import com.mobmirror.companion.ui.DotField
import com.mobmirror.companion.ui.DotMeter
import com.mobmirror.companion.ui.Expandable
import com.mobmirror.companion.ui.Grouped
import com.mobmirror.companion.ui.LocalPalette
import com.mobmirror.companion.ui.PageHeader
import com.mobmirror.companion.ui.RoundIconButton
import com.mobmirror.companion.ui.SearchField
import com.mobmirror.companion.ui.SectionHeader
import com.mobmirror.companion.ui.Segmented
import com.mobmirror.companion.ui.Space
import com.mobmirror.companion.ui.SpringIn
import com.mobmirror.companion.ui.StatusDot
import com.mobmirror.companion.ui.Tile
import com.mobmirror.companion.ui.Toggle
import com.mobmirror.companion.ui.Type
import java.text.DateFormat
import java.util.Date

/** Everything the screens show and can do (owned by MainActivity). */
class AppModel(
    val link: LinkState,
    val snap: DeviceInfo.Snapshot?,
    val sections: List<DeviceInfo.Section>,
    val agent: Pair<Boolean, Boolean>,
    val version: String,
    /** All settings (Prefs.All) and the component switches. */
    val prefs: Prefs.All,
    val features: Map<Prefs.Feature, Boolean>,
    val advanced: Prefs.Advanced,
    val pairedAt: Long,
    val lastSeen: Long,
    val port: Int,
    val keyId: String,
    val refresh: () -> Unit,
    val copy: (label: String, text: String) -> Unit,
    val sendClipboard: () -> Unit,
    val openAccessibility: () -> Unit,
    val forget: () -> Unit,
    /** Saves one setting (Prefs key → value) and applies it. */
    val set: (key: String, value: Any) -> Unit,
    val setFeature: (Prefs.Feature, Boolean) -> Unit,
    val resetSettings: () -> Unit,
    val copyDiagnostics: () -> Unit,
    val openConnection: () -> Unit,
    val openDevice: () -> Unit,
    val openAdvanced: () -> Unit,
    val openAppInfo: () -> Unit,
    val mode: Prefs.Mode,
    val setMode: (Prefs.Mode) -> Unit,
    /** The Mac paired over "Wi-Fi, no setup", if any. */
    val directMac: String?,
    val forgetDirect: () -> Unit,
    val linkAgain: () -> Unit,
)

sealed interface LinkState {
    data object Checking : LinkState
    data object NotPaired : LinkState
    /** Forgotten in the app: the Mac's automatic re-link is refused until "Link again". */
    data object Forgotten : LinkState
    data class Unreachable(val mac: String) : LinkState
    data class Connected(val status: Link.Status) : LinkState
}

val sectionIcons: Map<String, ImageVector> = mapOf(
    "Device" to Icons.Rounded.PhoneAndroid,
    "Android" to Icons.Rounded.Android,
    "CPU" to Icons.Rounded.Memory,
    "Memory & storage" to Icons.Rounded.Storage,
    "Display" to Icons.Rounded.Smartphone,
    "Battery" to Icons.Rounded.BatteryFull,
    "Cameras" to Icons.Rounded.PhotoCamera,
    "Sensors" to Icons.Rounded.Sensors,
    "Video codecs" to Icons.Rounded.Videocam,
    "Network" to Icons.Rounded.Wifi,
    "Features" to Icons.Rounded.Extension,
    "Region" to Icons.Rounded.Language,
)

private fun ago(t: Long): String {
    if (t <= 0) return "never"
    val s = (System.currentTimeMillis() - t) / 1000
    return when {
        s < 10 -> "just now"
        s < 60 -> "${s}s ago"
        s < 3600 -> "${s / 60} min ago"
        s < 86400 -> "${s / 3600} h ago"
        else -> DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(t))
    }
}

private fun linksLabel(links: List<String>): String = links.distinct().joinToString(" + ") { if (it == "usb") "USB" else "Wi-Fi" }.ifEmpty { "adb" }

// ---------------------------------------------------------------- Home

/** [direct]: the no-setup block (Wi-Fi mode) in place of the developer-mode link and actions. */
fun LazyListScope.homeScreen(m: AppModel, direct: (LazyListScope.() -> Unit)? = null, status: (@Composable () -> Unit)? = null) {
    item { PageHeader("Twinglass", "Phone app · ${m.version}", actions = { RoundIconButton(Icons.Rounded.Refresh, "Refresh", m.refresh) }) }
    // Always first: where this phone stands (full potential / developer mode / Wi-Fi mode).
    if (status != null) item { SpringIn(0) { Column { status(); Spacer(Modifier.height(Space.md)) } } }
    if (direct != null) direct() else item { SpringIn(0) { LinkHero(m.link, m.openConnection) } }
    m.snap?.let { s ->
        item { SpringIn(1) { PhoneTitle(s) } }
        if (m.prefs.showMetrics) item { SpringIn(2) { Metrics(s, m.openDevice, m.prefs.units == Prefs.Units.Decimal) } }
    }
    if (direct == null && m.prefs.showQuickActions) item {
        SpringIn(3) {
            Column {
                SectionHeader("Quick actions")
                Grouped(3) { pos ->
                    when (pos.index) {
                        0 -> Cell(pos, onClick = m.sendClipboard) {
                            CellRow("Send clipboard to Mac", "What you copied on the phone goes onto the Mac’s clipboard.", Icons.Rounded.ContentPaste, trailing = { Arrow() })
                        }
                        1 -> Cell(pos) {
                            CellRow("Send to Mac from any app", "Share text, links, photos or files → “Send to Mac”. Files land in Downloads/Twinglass.", Icons.AutoMirrored.Rounded.Send)
                        }
                        else -> Cell(pos, onClick = m.openAccessibility) {
                            CellRow("Agent access", if (m.agent.first) "On: agents you connected on your Mac can read and press buttons." else "Off: turn on from Twinglass on your Mac, or here.", Icons.Rounded.SmartToy, trailing = { OnOff(m.agent.first, m.agent.first && m.agent.second) })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Arrow() = Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, Modifier.size(20.dp), tint = LocalPalette.current.textTertiary)

@Composable
private fun OnOff(on: Boolean, live: Boolean) {
    val p = LocalPalette.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        StatusDot(if (on) p.accent else p.textTertiary, live = live)
        Spacer(Modifier.width(6.dp))
        Text(if (on) "ON" else "OFF", style = Type.caption.copy(fontWeight = FontWeight.Bold), color = if (on) p.textPrimary else p.textTertiary)
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun LinkHero(link: LinkState, onOpen: () -> Unit) {
    val p = LocalPalette.current
    val st = (link as? LinkState.Connected)?.status
    val me = st?.me
    Tile(Modifier.fillMaxWidth().combinedClickable(onClick = onOpen)) {
        DotField(Modifier.align(Alignment.TopEnd).size(132.dp), color = if (st != null) p.accent else p.textTertiary)
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatusDot(if (st != null) p.accent else p.textTertiary, live = st != null)
                Spacer(Modifier.width(Space.sm))
                Text(
                    when (link) {
                        is LinkState.Connected -> "CONNECTED TO"
                        is LinkState.Unreachable -> "NOT REACHABLE"
                        LinkState.NotPaired -> "NOT PAIRED"
                        LinkState.Forgotten -> "FORGOTTEN"
                        LinkState.Checking -> "CHECKING"
                    },
                    style = Type.caption,
                    color = p.textSecondary,
                )
                Spacer(Modifier.weight(1f))
                Arrow()
            }
            Spacer(Modifier.height(Space.md))
            Text(st?.mac ?: (link as? LinkState.Unreachable)?.mac ?: "Your Mac", style = Type.headline, color = p.textPrimary)
            Spacer(Modifier.height(Space.xs))
            Text(
                when {
                    st != null && me?.mirroring == true -> "Twinglass is mirroring this phone right now."
                    st != null -> "Linked. Open Twinglass on the Mac to mirror and control."
                    link is LinkState.Unreachable -> "Connect by USB or wireless debugging, then open Twinglass on the Mac."
                    link == LinkState.NotPaired -> "Plug this phone into your Mac with Twinglass open. It pairs by itself."
                    link == LinkState.Forgotten -> "You forgot this Mac. Open Connected to → Link again to allow it."
                    else -> "Looking for Twinglass…"
                },
                style = Type.bodySmall,
                color = p.textSecondary,
                modifier = Modifier.padding(end = 48.dp),
            )
            Spacer(Modifier.height(Space.lg))
            Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                if (st != null) {
                    if (me?.mirroring == true) Chip("Mirroring", inverted = true, leading = { StatusDot(p.accent, live = true) })
                    Chip(linksLabel(me?.links ?: emptyList()))
                    Chip("${st.pingMs} ms")
                } else Chip("USB or wireless debugging")
            }
        }
    }
}

@Composable
private fun PhoneTitle(s: DeviceInfo.Snapshot) {
    val p = LocalPalette.current
    Column(Modifier.padding(top = Space.xxl, bottom = Space.lg)) {
        Text(s.model, style = Type.display, color = p.textPrimary)
        Spacer(Modifier.height(Space.sm))
        Text("${s.maker}  ·  Android ${s.android}  ·  API ${s.api}".uppercase(), style = Type.caption, color = p.textSecondary)
        if (s.soc.isNotBlank()) Text(s.soc.uppercase(), style = Type.caption, color = p.textTertiary)
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun Metrics(s: DeviceInfo.Snapshot, onOpen: () -> Unit, decimal: Boolean) {
    val p = LocalPalette.current
    val ramUsed = 1f - s.ramFree.toFloat() / s.ramTotal.coerceAtLeast(1)
    val diskUsed = 1f - s.storageFree.toFloat() / s.storageTotal.coerceAtLeast(1)
    val low = (s.battery ?: 100) <= 20 && !s.charging
    Column(Modifier.combinedClickable(onClick = onOpen), verticalArrangement = Arrangement.spacedBy(Space.md)) {
        Row(horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            Metric(Modifier.weight(1f), "Battery", s.battery?.toString() ?: "--", "%", (s.battery ?: 0) / 100f, if (low) p.accent else p.textPrimary, if (s.charging) "Charging" else if (low) "Low" else "On battery", live = s.charging)
            val u = DeviceInfo.gbUnit(decimal)
            Metric(Modifier.weight(1f), "Memory", DeviceInfo.gb(s.ramFree, decimal), "$u free", ramUsed, p.textPrimary, "of ${DeviceInfo.gb(s.ramTotal, decimal)} $u")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(Space.md)) {
            val u = DeviceInfo.gbUnit(decimal)
            Metric(Modifier.weight(1f), "Storage", DeviceInfo.gb(s.storageFree, decimal), "$u free", diskUsed, p.textPrimary, "of ${DeviceInfo.gb(s.storageTotal, decimal)} $u")
            Metric(Modifier.weight(1f), "Display", s.refreshHz.toString(), "Hz", null, p.textPrimary, s.resolution)
        }
    }
}

@Composable
private fun Metric(modifier: Modifier, label: String, figure: String, unit: String, fraction: Float?, lit: Color, caption: String, live: Boolean = false) {
    val p = LocalPalette.current
    Tile(modifier) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(label.uppercase(), style = Type.caption, color = p.textTertiary, modifier = Modifier.weight(1f))
                if (live) StatusDot(p.accent, live = true)
            }
            Spacer(Modifier.height(Space.md))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(figure, style = Type.figure, color = p.textPrimary)
                Spacer(Modifier.width(Space.xs))
                Text(unit.uppercase(), style = Type.caption, color = p.textSecondary, modifier = Modifier.padding(bottom = 6.dp))
            }
            Spacer(Modifier.height(Space.md))
            if (fraction != null) DotMeter(fraction, count = 14, lit = lit) else Spacer(Modifier.height(6.dp))
            Spacer(Modifier.height(Space.sm))
            Text(caption.uppercase(), style = Type.caption, color = p.textSecondary, maxLines = 1)
        }
    }
}

// ---------------------------------------------------------------- Device

fun LazyListScope.deviceScreen(m: AppModel, query: String, onQuery: (String) -> Unit, open: Set<String>, onToggle: (String) -> Unit) {
    val q = query.trim().lowercase()
    val shown = if (q.isEmpty()) m.sections else m.sections.mapNotNull { s ->
        if (s.title.lowercase().contains(q)) s
        else s.rows.filter { "${it.label} ${it.value}".lowercase().contains(q) }.takeIf { it.isNotEmpty() }?.let { DeviceInfo.Section(s.title, it) }
    }
    item {
        PageHeader("Device", "${m.sections.sumOf { it.rows.size }} details · ${m.sections.size} groups", actions = {
            RoundIconButton(Icons.Rounded.ContentCopy, "Copy all") { m.copy("all details", DeviceInfo.format(m.sections, m.prefs.copyFormat)) }
        })
    }
    item { SearchField(query, onQuery, "Search details: battery, hdr, camera…") }
    item { Spacer(Modifier.height(Space.lg)) }
    item {
        Grouped(shown.size) { pos ->
            val s = shown[pos.index]
            val expanded = q.isNotEmpty() || s.title in open
            Cell(pos, onClick = { onToggle(s.title) }, onLongClick = { m.copy(s.title, DeviceInfo.format(listOf(s), m.prefs.copyFormat)) }) {
                CellRow(
                    title = s.title,
                    subtitle = if (expanded) null else s.rows.take(2).joinToString(" · ") { it.value }.take(60),
                    icon = sectionIcons[s.title] ?: Icons.Rounded.Extension,
                    trailing = { Chevron(expanded, Icons.Rounded.KeyboardArrowDown) },
                )
                Expandable(expanded) {
                    Column(Modifier.padding(start = 72.dp, end = Space.lg, bottom = Space.lg)) {
                        s.rows.forEach { r -> SpecRow(r) { m.copy(r.label, "${r.label}: ${r.value}") } }
                    }
                }
            }
        }
    }
    if (shown.isEmpty()) item { Text("Nothing matches “$query”.", style = Type.body, color = LocalPalette.current.textSecondary, modifier = Modifier.padding(top = Space.xl)) }
    item { Footnote("Long-press to copy · Twinglass shows the same on your Mac") }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SpecRow(r: DeviceInfo.Row, onCopy: () -> Unit) {
    val p = LocalPalette.current
    Column(Modifier.fillMaxWidth().combinedClickable(onClick = {}, onLongClick = onCopy).padding(vertical = 6.dp)) {
        Text(r.label.uppercase(), style = Type.caption, color = p.textTertiary)
        Text(r.value, style = Type.bodySmall, color = p.textPrimary)
    }
}

@Composable
private fun Footnote(text: String) =
    Text(text.uppercase(), style = Type.caption, color = LocalPalette.current.textTertiary, modifier = Modifier.fillMaxWidth().padding(top = Space.xl))

// ---------------------------------------------------------------- Connection (pushed from Home / Settings)

fun LazyListScope.connectionScreen(m: AppModel, onBack: () -> Unit, onForget: () -> Unit) {
    val st = (m.link as? LinkState.Connected)?.status
    val me = st?.me
    item {
        PageHeader("Connected to", null, onBack = onBack, actions = { RoundIconButton(Icons.Rounded.Refresh, "Refresh", m.refresh) })
    }
    item {
        SpringIn(0) {
            Tile(Modifier.fillMaxWidth()) {
                val p = LocalPalette.current
                DotField(Modifier.align(Alignment.TopEnd).size(120.dp), color = if (st != null) p.accent else p.textTertiary)
                Column {
                    Icon(Icons.Rounded.Laptop, null, Modifier.size(28.dp), tint = p.textPrimary)
                    Spacer(Modifier.height(Space.md))
                    Text(st?.mac ?: (m.link as? LinkState.Unreachable)?.mac ?: "No Mac yet", style = Type.display, color = p.textPrimary)
                    Spacer(Modifier.height(Space.sm))
                    Text(listOfNotNull(st?.os, st?.version?.let { "Twinglass $it" }).joinToString("  ·  ").ifEmpty { "Twinglass for Mac" }.uppercase(), style = Type.caption, color = p.textSecondary)
                }
            }
        }
    }
    item { SectionHeader("Link") }
    item {
        val rows = listOf<Triple<String, String, ImageVector>>(
            Triple("Status", when (m.link) {
                is LinkState.Connected -> "Connected"
                is LinkState.Unreachable -> "Not reachable · last seen ${ago(m.lastSeen)}"
                LinkState.NotPaired -> "Not paired"
                LinkState.Forgotten -> "Forgotten: linking is blocked until you choose Link again"
                LinkState.Checking -> "Checking…"
            }, Icons.Rounded.Info),
            Triple("Connected by", me?.let { linksLabel(it.links) } ?: "—", if (me?.links?.contains("usb") == true) Icons.Rounded.Usb else Icons.Rounded.Wifi),
            Triple("Response time", st?.let { "${it.pingMs} ms" } ?: "—", Icons.Rounded.Speed),
            Triple("Paired", if (m.pairedAt > 0) ago(m.pairedAt) else "—", Icons.Rounded.Timer),
        )
        Grouped(rows.size) { pos -> val (t, v, i) = rows[pos.index]; Cell(pos) { CellRow(t, v, i) } }
    }
    item { SectionHeader("On the Mac") }
    item {
        val rows = listOf<Triple<String, String, ImageVector>>(
            Triple("Mirroring this phone", when {
                st == null -> "—"
                me?.mirroring == true -> "Yes, the phone’s screen"
                else -> "No"
            }, Icons.Rounded.ScreenShare),
            Triple("Second screens", st?.let { "${me?.secondScreens ?: 0} open" } ?: "—", Icons.Rounded.GridView),
            Triple("Agents", when {
                st == null -> "—"
                !st.agentsEnabled -> "Off"
                me?.agentScreen == true -> "On · working on their own second screen now"
                else -> "On · they work on ${if (st.agentsWorkspace == "phone") "the phone’s screen" else "their own second screen"}"
            }, Icons.Rounded.SmartToy),
            Triple("Other phones", st?.phones?.filter { it.model != android.os.Build.MODEL }?.joinToString { it.model }?.ifEmpty { "None" } ?: "—", Icons.Rounded.PhoneAndroid),
        )
        Grouped(rows.size) { pos -> val (t, v, i) = rows[pos.index]; Cell(pos) { CellRow(t, v, i) } }
    }
    item { SectionHeader("Actions") }
    item {
        Grouped(2) { pos ->
            if (pos.index == 0) Cell(pos, onClick = m.sendClipboard) { CellRow("Send clipboard to Mac", "What you copied here goes onto the Mac’s clipboard.", Icons.Rounded.ContentPaste, trailing = { Arrow() }) }
            else if (m.link == LinkState.Forgotten) Cell(pos, onClick = m.linkAgain) {
                CellRow("Link again", "Allow this Mac to link again (reconnect the cable, or Relink in Twinglass on the Mac).", Icons.Rounded.Laptop)
            } else Cell(pos, onClick = onForget) {
                CellRow("Forget this Mac", "Removes the link here, and the Mac can’t link again by itself until you choose Link again.", Icons.Rounded.LinkOff)
            }
        }
    }
    item { Footnote("Key ${m.keyId}… · port ${m.port}") }
}

// ---------------------------------------------------------------- Settings

/** A settings cell with a switch on the right (the whole cell toggles). */
@Composable
private fun androidx.compose.foundation.layout.ColumnScope.ToggleCell(pos: com.mobmirror.companion.ui.CellPosition, title: String, subtitle: String?, icon: ImageVector, value: Boolean, onChange: (Boolean) -> Unit) {
    Cell(pos, onClick = { onChange(!value) }) { CellRow(title, subtitle, icon, trailing = { Toggle(value, onChange) }) }
}

/** A settings cell with a segmented choice under its title. */
@Composable
private fun <T> androidx.compose.foundation.layout.ColumnScope.ChoiceCell(pos: com.mobmirror.companion.ui.CellPosition, title: String, subtitle: String?, icon: ImageVector, value: T, options: List<Pair<T, String>>, onChange: (T) -> Unit) {
    Cell(pos) {
        CellRow(title, subtitle, icon)
        Segmented(value, options, onChange, Modifier.padding(start = 72.dp, end = Space.lg, bottom = Space.lg))
    }
}

fun LazyListScope.settingsScreen(m: AppModel, licencesOpen: Boolean, onLicences: () -> Unit, onForget: () -> Unit, onReset: () -> Unit, licences: String) {
    val s = m.prefs
    val f = m.features
    item { PageHeader("Settings", "Twinglass phone app") }

    item { SectionHeader("Appearance") }
    item {
        Grouped(5) { pos ->
            when (pos.index) {
                0 -> ChoiceCell(pos, "Theme", null, Icons.Rounded.DarkMode, s.theme, listOf(Prefs.Theme.System to "System", Prefs.Theme.Light to "Light", Prefs.Theme.Dark to "Dark")) { m.set("theme", it) }
                1 -> ChoiceCell(pos, "Text size", "Scales every text in the app.", Icons.Rounded.FormatSize, s.textScale, Prefs.textScales) { m.set("textScale", it) }
                2 -> ToggleCell(pos, "Dot-grid background", "The Nothing-style texture behind pages.", Icons.Rounded.GridView, s.dotGrid) { m.set("dotGrid", it) }
                3 -> ToggleCell(pos, "Reduce motion", "Pages and cards appear at once, without springs.", Icons.Rounded.Animation, s.reduceMotion) { m.set("reduceMotion", it) }
                else -> ToggleCell(pos, "Haptics", "A light tick on taps and switches.", Icons.Rounded.Vibration, s.haptics) { m.set("haptics", it) }
            }
        }
    }

    item { SectionHeader("Home") }
    item {
        Grouped(4) { pos ->
            when (pos.index) {
                0 -> ChoiceCell(pos, "Open on", "The tab the app starts on.", Icons.Rounded.Home, s.startTab, listOf(Prefs.StartTab.Home to "Home", Prefs.StartTab.Device to "Device")) { m.set("startTab", it) }
                1 -> ToggleCell(pos, "Phone at a glance", "Battery, memory, storage and display tiles.", Icons.Rounded.Dashboard, s.showMetrics) { m.set("showMetrics", it) }
                2 -> ToggleCell(pos, "Quick actions", "Send clipboard, share tips and agent access on Home.", Icons.Rounded.Bolt, s.showQuickActions) { m.set("showQuickActions", it) }
                else -> ChoiceCell(pos, "Check the Mac every", "How often the link status and response time refresh while the app is open.", Icons.Rounded.Speed, s.refreshSec, Prefs.refreshChoices) { m.set("refreshSec", it) }
            }
        }
    }

    item { SectionHeader("Device details") }
    item {
        Grouped(2) { pos ->
            if (pos.index == 0) ChoiceCell(pos, "Storage units", "GB counts like Android’s Settings and the box (1000³); GiB like most tools (1024³).", Icons.Rounded.Storage, s.units, listOf(Prefs.Units.Decimal to "GB", Prefs.Units.Binary to "GiB")) { m.set("units", it) }
            else ChoiceCell(pos, "Copy as", "Format used by Copy all and long-press on a group.", Icons.Rounded.ContentCopy, s.copyFormat, listOf(Prefs.CopyFormat.Text to "Text", Prefs.CopyFormat.Markdown to "Markdown", Prefs.CopyFormat.Json to "JSON")) { m.set("copyFormat", it) }
        }
    }

    item { SectionHeader("Share to Mac") }
    item {
        Grouped(5) { pos ->
            when (pos.index) {
                0 -> ToggleCell(pos, "Show in share sheets", "“Send to Mac” in every app’s share menu.", Icons.AutoMirrored.Rounded.Send, f[Prefs.Feature.ShareTarget] != false) { m.setFeature(Prefs.Feature.ShareTarget, it) }
                1 -> ToggleCell(pos, "Close after sending", "Back to the app you shared from once it’s sent.", Icons.Rounded.Check, s.shareAutoClose) { m.set("shareAutoClose", it) }
                2 -> ChoiceCell(pos, "Ask before large files", "Confirm before sending more than this at once.", Icons.Rounded.Description, s.shareConfirmMb, listOf(0 to "Never", 50 to "50 MB", 100 to "100 MB", 500 to "500 MB")) { m.set("shareConfirmMb", it) }
                3 -> ToggleCell(pos, "Notify on the Mac", "A Mac notification for each text or file you send.", Icons.Rounded.Notifications, s.shareNotifyMac) { m.set("shareNotifyMac", it) }
                else -> ToggleCell(pos, "Add the date to file names", "“2026-11-08 11.30 photo.jpg”, so files sort by when you sent them.", Icons.Rounded.Today, s.shareDatePrefix) { m.set("shareDatePrefix", it) }
            }
        }
    }

    item { SectionHeader("What the Mac may use") }
    item {
        Grouped(4) { pos ->
            when (pos.index) {
                0 -> ToggleCell(pos, "Device details", "Twinglass’ Phone details window reads them from this app (else it only sees basic adb facts).", Icons.Rounded.PhoneAndroid, f[Prefs.Feature.Details] != false) { m.setFeature(Prefs.Feature.Details, it) }
                1 -> ToggleCell(pos, "App icons", "Real icons in Twinglass’ app grid and ⌘K (else letter tiles).", Icons.Rounded.Apps, f[Prefs.Feature.Icons] != false) { m.setFeature(Prefs.Feature.Icons, it) }
                2 -> ToggleCell(pos, "Agent requests", "Lets agents on your Mac read and press elements through this app.", Icons.Rounded.SmartToy, f[Prefs.Feature.Agent] != false) { m.setFeature(Prefs.Feature.Agent, it) }
                else -> Cell(pos, onClick = m.openAccessibility) {
                    CellRow("Read any screen", "Android’s accessibility switch for agents. Opens the system settings.", Icons.Rounded.SettingsAccessibility, trailing = { OnOff(m.agent.first, m.agent.first && m.agent.second) })
                }
            }
        }
    }

    item { SectionHeader("Connection") }
    item {
        Grouped(if (m.directMac != null) 2 else 1) { pos ->
            if (pos.index == 0) ChoiceCell(pos, "Connect with", "Wi-Fi needs no setup. Developer mode adds second screens, agents and app testing.", Icons.Rounded.Wifi, m.mode, listOf(Prefs.Mode.NoSetup to "Wi-Fi, no setup", Prefs.Mode.Developer to "Developer mode")) { m.setMode(it) }
            else Cell(pos, onClick = m.forgetDirect) { CellRow("Forget ${m.directMac} (Wi-Fi)", "Pair again with a new code from the Mac.", Icons.Rounded.LinkOff) }
        }
    }
    item { Spacer(Modifier.height(Space.sm)) }
    item {
        Grouped(3) { pos ->
            when (pos.index) {
                0 -> Cell(pos, onClick = m.openConnection) {
                    val st = (m.link as? LinkState.Connected)?.status
                    CellRow("Connected to", st?.let { "${it.mac} · ${it.pingMs} ms" } ?: (m.link as? LinkState.Unreachable)?.let { "${it.mac} · not reachable" } ?: "Not paired", Icons.Rounded.Laptop, trailing = { Arrow() })
                }
                1 -> Cell(pos, onClick = m.copyDiagnostics) { CellRow("Copy diagnostics", "Link port, key id, versions and status, for troubleshooting.", Icons.Rounded.BugReport) }
                else -> Cell(pos, onClick = onForget) { CellRow("Forget this Mac", "Pairs again by itself next time.", Icons.Rounded.LinkOff) }
            }
        }
    }

    item { SectionHeader("More") }
    item {
        Grouped(1) { pos ->
            Cell(pos, onClick = m.openAdvanced) { CellRow("Advanced", "Link timeout, agent limits, what details and icons the Mac gets, debug logging.", Icons.Rounded.Tune, trailing = { Arrow() }) }
        }
    }

    item { SectionHeader("Screen") }
    item {
        Grouped(1) { pos -> ToggleCell(pos, "Keep the screen on", "While this app is open (e.g. watching the link or details).", Icons.Rounded.LightMode, s.keepScreenOn) { m.set("keepScreenOn", it) } }
    }

    item { SectionHeader("About") }
    item {
        Grouped(3) { pos ->
            when (pos.index) {
                0 -> Cell(pos) { CellRow("Version", m.version, Icons.Rounded.Info) }
                1 -> Cell(pos, onClick = onLicences) {
                    CellRow("Open-source licences", "Space Grotesk (SIL Open Font License 1.1).", Icons.Rounded.Description, trailing = { Chevron(licencesOpen, Icons.Rounded.KeyboardArrowDown) })
                    Expandable(licencesOpen) {
                        Text(licences, style = Type.caption, color = LocalPalette.current.textSecondary, modifier = Modifier.padding(start = 72.dp, end = Space.lg, bottom = Space.lg))
                    }
                }
                else -> Cell(pos, onClick = onReset) { CellRow("Reset settings", "Everything on this page back to defaults (the Mac link stays).", Icons.Rounded.RestartAlt) }
            }
        }
    }
    item { Footnote("Made to work with Twinglass for Mac") }
}

// ---------------------------------------------------------------- Advanced (pushed from Settings)

fun LazyListScope.advancedScreen(m: AppModel, onBack: () -> Unit) {
    val a = m.advanced
    item { PageHeader("Advanced", "For troubleshooting and fine control", onBack = onBack) }

    item { SectionHeader("Link to the Mac") }
    item {
        Grouped(1) { pos ->
            ChoiceCell(pos, "Request timeout", "How long to wait for Twinglass on the Mac. Raise it on slow wireless debugging.", Icons.Rounded.Timer, a.linkTimeoutMs, listOf(1500 to "1.5 s", 2500 to "2.5 s", 5000 to "5 s", 10000 to "10 s")) { m.set("adv.linkTimeoutMs", it) }
        }
    }

    item { SectionHeader("Agents") }
    item {
        Grouped(2) { pos ->
            if (pos.index == 0) ChoiceCell(pos, "Most elements per read", "Caps get_ui_tree / screen_map. Bigger is more complete but slower.", Icons.Rounded.Layers, a.agentMaxNodes, listOf(400 to "400", 800 to "800", 1500 to "1500", 2000 to "2000")) { m.set("adv.agentMaxNodes", it) }
            else ToggleCell(pos, "Layout and text-size info", "Lets screen_map report match_parent / wrap_content and sp sizes. Adds about half a second.", Icons.Rounded.Straighten, a.agentRendering) { m.set("adv.agentRendering", it) }
        }
    }

    item { SectionHeader("What the Mac gets") }
    item {
        Grouped(3) { pos ->
            when (pos.index) {
                0 -> ToggleCell(pos, "Sensor list", "Include every sensor in the details sent to the Mac.", Icons.Rounded.Sensors, a.detailsSensors) { m.set("adv.detailsSensors", it) }
                1 -> ToggleCell(pos, "Video codecs", "Include encoder and decoder lists.", Icons.Rounded.Videocam, a.detailsCodecs) { m.set("adv.detailsCodecs", it) }
                else -> ChoiceCell(pos, "App icon size", "Largest icon sent to the Mac. Smaller loads faster.", Icons.Rounded.Apps, a.iconSize, listOf(96 to "96", 128 to "128", 192 to "192", 256 to "256")) { m.set("adv.iconSize", it) }
            }
        }
    }

    item { SectionHeader("Diagnostics") }
    item {
        Grouped(3) { pos ->
            when (pos.index) {
                0 -> ToggleCell(pos, "Debug logging", "Writes link and agent activity to logcat (tag “Twinglass”).", Icons.Rounded.BugReport, a.debugLog) { m.set("adv.debugLog", it) }
                1 -> Cell(pos, onClick = m.copyDiagnostics) { CellRow("Copy diagnostics", "Versions, link, features and agent status.", Icons.Rounded.ContentCopy) }
                else -> Cell(pos, onClick = m.openAppInfo) { CellRow("Android app info", "Permissions, storage, battery use and force stop.", Icons.Rounded.Info, trailing = { Arrow() }) }
            }
        }
    }
    item { Footnote("Changes apply right away") }
}
