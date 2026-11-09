package com.mobmirror.companion

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.DeveloperMode
import androidx.compose.material.icons.rounded.Laptop
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.ScreenShare
import androidx.compose.material.icons.rounded.TouchApp
import androidx.compose.material.icons.rounded.Usb
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mobmirror.companion.direct.DirectLink
import com.mobmirror.companion.ui.Benefit
import com.mobmirror.companion.ui.Cell
import com.mobmirror.companion.ui.CellRow
import com.mobmirror.companion.ui.Chip
import com.mobmirror.companion.ui.DotField
import com.mobmirror.companion.ui.Fonts
import com.mobmirror.companion.ui.Grouped
import com.mobmirror.companion.ui.LocalPalette
import com.mobmirror.companion.ui.PillButton
import com.mobmirror.companion.ui.Radius
import com.mobmirror.companion.ui.SectionHeader
import com.mobmirror.companion.ui.SheetActions
import com.mobmirror.companion.ui.SheetHeader
import com.mobmirror.companion.ui.Space
import com.mobmirror.companion.ui.SpringIn
import com.mobmirror.companion.ui.StatusDot
import com.mobmirror.companion.ui.Tile
import com.mobmirror.companion.ui.TwinglassSheet
import com.mobmirror.companion.ui.Type
import kotlin.concurrent.thread

/** Bottom sheets the app can show (one thing at a time, only when it's needed). */
enum class Sheet { Pair, ShareIntro, Control, Notifications, DevSetup }

/** "Wi-Fi, no setup" state for the screens. */
data class DirectState(
    val paired: DirectLink.PairedMac?,
    val mirroring: Boolean,
    val status: String,
    val controlOn: Boolean,
    val notificationsOn: Boolean,
    /** The Mac this phone was paired with before a forget (on either side), until paired again or dismissed. */
    val forgotten: DirectLink.Forgotten? = null,
    /** Forgotten here while the Mac was away: it hears about it the next time it's reachable. */
    val pendingForget: Boolean = false,
)

// ---------------------------------------------------------------- Landing (first run)

@Composable
fun Landing(onChoose: (Prefs.Mode) -> Unit) {
    val p = LocalPalette.current
    var choice by remember { mutableStateOf(Prefs.Mode.NoSetup) }
    val bars = WindowInsets.systemBars.asPaddingValues()
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = Space.xl, end = Space.xl, top = bars.calculateTopPadding() + Space.xxl, bottom = bars.calculateBottomPadding() + Space.xl),
    ) {
        item {
            SpringIn(0) {
                Box(Modifier.fillMaxWidth()) {
                    DotField(Modifier.align(Alignment.TopEnd).size(150.dp), color = p.accent)
                    Column {
                        Text("TWINGLASS", style = Type.caption, color = p.textTertiary)
                        Spacer(Modifier.height(Space.lg))
                        Text("Your phone,\non your Mac.", style = Type.display, color = p.textPrimary)
                        Spacer(Modifier.height(Space.md))
                        Text("See and use this phone from your Mac: mirror it, control it, send files and text both ways.", style = Type.body, color = p.textSecondary)
                    }
                }
            }
        }
        item { Spacer(Modifier.height(Space.xxl)) }
        item { Text("HOW SHOULD IT CONNECT?", style = Type.caption, color = p.textTertiary, modifier = Modifier.padding(bottom = Space.md)) }
        item {
            SpringIn(1) {
                ModeCard(
                    selected = choice == Prefs.Mode.NoSetup,
                    icon = Icons.Rounded.Wifi,
                    title = "Wi-Fi, no setup",
                    badge = "Recommended",
                    points = listOf("Mirror and control over your Wi-Fi", "Ready in a minute: pair with a code from your Mac", "No developer options needed"),
                ) { choice = Prefs.Mode.NoSetup }
            }
        }
        item { Spacer(Modifier.height(Space.md)) }
        item {
            SpringIn(2) {
                ModeCard(
                    selected = choice == Prefs.Mode.Developer,
                    icon = Icons.Rounded.DeveloperMode,
                    title = "Full control",
                    badge = "Developer mode",
                    points = listOf("Second screens, coding agents, app testing tools", "Lowest latency over USB, precise touch and typing", "One-time setup: turn on USB debugging"),
                ) { choice = Prefs.Mode.Developer }
            }
        }
        item { Spacer(Modifier.height(Space.xl)) }
        item { PillButton("Continue", onClick = { onChoose(choice) }) }
        item {
            Text("You can switch any time in Settings.", style = Type.bodySmall, color = p.textTertiary, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = Space.md))
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ModeCard(selected: Boolean, icon: ImageVector, title: String, badge: String, points: List<String>, onClick: () -> Unit) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(Radius.lg)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(p.surface)
            .border(if (selected) 2.dp else 1.dp, if (selected) p.textPrimary else p.border, shape)
            .combinedClickable(onClick = onClick)
            .padding(Space.lg),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(Radius.pill)).background(if (selected) p.textPrimary else p.surfaceHigh), contentAlignment = Alignment.Center) {
                Icon(icon, null, Modifier.size(22.dp), tint = if (selected) p.textInverse else p.textPrimary)
            }
            Spacer(Modifier.width(Space.md))
            Text(title, style = Type.title, color = p.textPrimary, modifier = Modifier.weight(1f))
            Chip(badge, inverted = selected && badge == "Recommended")
        }
        Spacer(Modifier.height(Space.md))
        points.forEach { Benefit(it) }
    }
}

// ---------------------------------------------------------------- Home (no-setup mode)

/** [full]: Developer mode is on and the Mac is linked over adb (everything already unlocked). */
fun LazyListScope.directHome(d: DirectState, onSheet: (Sheet) -> Unit, onMirror: () -> Unit, onStop: () -> Unit, full: Boolean = false, onDismissForgotten: () -> Unit = {}) {
    item { SpringIn(0) { DirectHero(d, onSheet, onMirror, onStop, full, onDismissForgotten) } }
    item {
        SpringIn(1) {
            Column {
                SectionHeader("Unlock more")
                Grouped(if (full) 2 else 3) { pos ->
                    when (pos.index) {
                        0 -> Cell(pos, onClick = { onSheet(Sheet.Control) }) {
                            CellRow("Control from your Mac", if (d.controlOn) "On: click, swipe and type on the Mac." else "Click, swipe, go Back or Home from the Mac.", Icons.Rounded.TouchApp, trailing = { State(d.controlOn) })
                        }
                        1 -> Cell(pos, onClick = { onSheet(Sheet.Notifications) }) {
                            CellRow("Mirroring notification", if (d.notificationsOn) "On: stop sharing from the notification." else "See when you’re sharing and stop it in one tap.", Icons.Rounded.Notifications, trailing = { State(d.notificationsOn) })
                        }
                        else -> Cell(pos, onClick = { onSheet(Sheet.DevSetup) }) {
                            CellRow("Full control", "Second screens, coding agents and app testing need Developer mode.", Icons.Rounded.DeveloperMode, trailing = { Arrow() })
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun State(on: Boolean) {
    val p = LocalPalette.current
    if (on) Row(verticalAlignment = Alignment.CenterVertically) {
        StatusDot(p.accent)
        Spacer(Modifier.width(6.dp))
        Text("ON", style = Type.caption.copy(fontWeight = FontWeight.Bold), color = p.textPrimary)
    } else Text("SET UP", style = Type.caption.copy(fontWeight = FontWeight.Bold), color = p.textSecondary)
}

@Composable
private fun Arrow() = Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, Modifier.size(20.dp), tint = LocalPalette.current.textTertiary)

@Composable
private fun DirectHero(d: DirectState, onSheet: (Sheet) -> Unit, onMirror: () -> Unit, onStop: () -> Unit, full: Boolean, onDismissForgotten: () -> Unit) {
    val p = LocalPalette.current
    val gone = if (d.paired == null) d.forgotten else null
    Tile(Modifier.fillMaxWidth()) {
        DotField(Modifier.align(Alignment.TopEnd).size(132.dp), color = if (d.mirroring) p.accent else p.textTertiary)
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatusDot(if (d.mirroring) p.accent else if (d.paired != null) p.textPrimary else p.textTertiary, live = d.mirroring)
                Spacer(Modifier.width(Space.sm))
                Text(
                    when {
                        d.mirroring -> "MIRRORING TO"
                        d.paired != null -> "PAIRED WITH"
                        gone != null -> "FORGOTTEN"
                        else -> "NOT PAIRED YET"
                    },
                    style = Type.caption,
                    color = p.textSecondary,
                )
            }
            Spacer(Modifier.height(Space.md))
            Text(d.paired?.name ?: gone?.name ?: "Your Mac", style = Type.headline, color = p.textPrimary)
            Spacer(Modifier.height(Space.xs))
            Text(
                when {
                    gone != null && gone.byMac -> "${gone.name} forgot this phone, so it can’t mirror there. Pair again to reconnect: on the Mac, Twinglass → Add phone, then scan its QR."
                    gone != null && d.pendingForget -> "You forgot this Mac here. It drops this phone too the next time it’s reachable. Pair again any time with a new code."
                    gone != null -> "You forgot this Mac on both sides. Pair again any time: on the Mac, Twinglass → Add phone, then scan its QR."
                    d.paired == null && full -> "Optional: you’re already linked through Developer mode. Pairing over Wi-Fi lets you mirror without the cable or debugging."
                    d.paired == null -> "Open Twinglass on your Mac, choose “Add phone”, and pair with the code it shows."
                    d.status.isNotEmpty() && (d.mirroring || d.status.startsWith("Can")) -> d.status
                    else -> "Over Wi-Fi, no developer mode. Both need to be on the same network."
                },
                style = Type.bodySmall,
                color = p.textSecondary,
                modifier = Modifier.padding(end = 48.dp),
            )
            Spacer(Modifier.height(Space.lg))
            when {
                gone != null -> Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                    PillButton("Pair again") { onSheet(Sheet.Pair) }
                    PillButton("Not now", primary = false, onClick = onDismissForgotten)
                }
                d.paired == null -> PillButton("Pair with your Mac") { onSheet(Sheet.Pair) }
                d.mirroring -> PillButton("Stop mirroring", primary = false, onClick = onStop)
                else -> PillButton("Mirror to Mac", onClick = onMirror)
            }
        }
    }
}

// ---------------------------------------------------------------- Sheets

@Composable
fun SheetHost(sheet: Sheet?, d: DirectState, onDismiss: () -> Unit, actions: SheetActionsModel) {
    when (sheet) {
        null -> {}
        Sheet.Pair -> TwinglassSheet(onDismiss) { PairFlow(onDone = { actions.paired(); onDismiss() }) }
        Sheet.ShareIntro -> TwinglassSheet(onDismiss) {
            SheetHeader(Icons.Rounded.ScreenShare, "Share this screen with your Mac", "Android asks you to allow it each time. Choose “Entire screen”. You can stop from the notification or here.", accent = true)
            Benefit("Only your paired Mac receives it, encrypted on your Wi-Fi")
            Benefit("Nothing is recorded on the phone")
            Spacer(Modifier.height(Space.xl))
            SheetActions("Continue", { onDismiss(); actions.startConsent() }, "Not now", onDismiss)
        }
        Sheet.Control -> TwinglassSheet(onDismiss) {
            SheetHeader(Icons.Rounded.TouchApp, "Control from your Mac", if (d.controlOn) "It’s on. Click, swipe, scroll and type in the Mac window." else "Turn on “Twinglass control” in Accessibility. Then the Mac can tap, swipe, go Back or Home and type for you.")
            Benefit("Acts only on what you do in the Twinglass window on your Mac")
            Benefit("Turn it off any time in Accessibility")
            Spacer(Modifier.height(Space.xl))
            SheetActions(if (d.controlOn) "Done" else "Open Accessibility", { onDismiss(); if (!d.controlOn) actions.openAccessibility() }, if (d.controlOn) null else "Not now", onDismiss)
        }
        Sheet.Notifications -> TwinglassSheet(onDismiss) {
            SheetHeader(Icons.Rounded.Notifications, "Know when you’re sharing", "Twinglass shows one quiet notification while your screen is shared, with a Stop button. Nothing else.")
            SheetActions(if (d.notificationsOn) "Done" else "Allow notifications", { onDismiss(); if (!d.notificationsOn) actions.requestNotifications() }, if (d.notificationsOn) null else "Not now", onDismiss)
        }
        Sheet.DevSetup -> TwinglassSheet(onDismiss) {
            SheetHeader(Icons.Rounded.Usb, "Unlock full control", "Second screens, coding agents, app testing and the lowest latency need USB debugging. It’s a one-time setup:")
            listOf(
                "Settings → About phone → tap “Build number” 7 times",
                "Settings → System → Developer options → turn on “USB debugging”",
                "Connect this phone to your Mac with a cable, open Twinglass, tap “Allow” here",
            ).forEachIndexed { i, step ->
                Row(Modifier.padding(vertical = 6.dp)) {
                    Box(Modifier.size(24.dp).clip(RoundedCornerShape(Radius.pill)).background(LocalPalette.current.surfaceHigh), contentAlignment = Alignment.Center) {
                        Text("${i + 1}", style = Type.caption.copy(fontWeight = FontWeight.Bold), color = LocalPalette.current.textPrimary)
                    }
                    Spacer(Modifier.width(Space.md))
                    Text(step, style = Type.bodySmall, color = LocalPalette.current.textPrimary)
                }
            }
            Spacer(Modifier.height(Space.xl))
            SheetActions("Open Developer options", { onDismiss(); actions.openDeveloperOptions() }, "Use Developer mode in this app", { onDismiss(); actions.switchToDeveloper() })
        }
    }
}

/** What sheets can do (MainActivity implements it). */
class SheetActionsModel(
    val paired: () -> Unit,
    val startConsent: () -> Unit,
    val openAccessibility: () -> Unit,
    val requestNotifications: () -> Unit,
    val openDeveloperOptions: () -> Unit,
    val switchToDeveloper: () -> Unit,
)

/** Pick a Mac found on the Wi-Fi → enter its code → paired. */
@Composable
private fun PairFlow(onDone: () -> Unit) {
    val p = LocalPalette.current
    val ctx = LocalContext.current
    val macs = remember { mutableStateListOf<DirectLink.MacOnNetwork>() }
    var picked by remember { mutableStateOf<DirectLink.MacOnNetwork?>(null) }
    var code by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var searching by remember { mutableStateOf(true) }
    var round by remember { mutableStateOf(0) }

    DisposableEffect(round) {
        searching = true
        val main = android.os.Handler(android.os.Looper.getMainLooper())
        DirectLink.discover(ctx, 6000) { m -> main.post { if (macs.none { it.name == m.name }) macs.add(m) } }
        main.postDelayed({ searching = false }, 6000)
        onDispose { }
    }
    // Never jump ahead to the code screen: scanning the Mac's QR is the main way, picking a Mac is the fallback.

    /** Pairs straight from the Mac's QR (…/Twinglass.apk?pair=<code>&port=…&mac=…): no typing. */
    fun scan() {
        error = null
        val opts = com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(com.google.mlkit.vision.barcode.common.Barcode.FORMAT_QR_CODE).build()
        com.google.mlkit.vision.codescanner.GmsBarcodeScanning.getClient(ctx, opts).startScan()
            .addOnSuccessListener { b ->
                val uri = runCatching { android.net.Uri.parse(b.rawValue ?: "") }.getOrNull()
                val c = uri?.getQueryParameter("pair")
                val host = uri?.host
                if (uri == null || c == null || host == null || !Regex("^\\d{6}$").matches(c)) {
                    error = "That QR doesn’t have a pairing code. On your Mac, open “Add phone” and scan the QR there."
                    return@addOnSuccessListener
                }
                val found = DirectLink.MacOnNetwork(uri.getQueryParameter("mac") ?: host, host, uri.getQueryParameter("port")?.toIntOrNull() ?: 47200)
                picked = found
                code = c
                busy = true
                thread {
                    val r = DirectLink.pair(ctx, found, c)
                    android.os.Handler(android.os.Looper.getMainLooper()).post {
                        busy = false
                        when (r) {
                            DirectLink.PairResult.Ok -> onDone()
                            DirectLink.PairResult.WrongCode, DirectLink.PairResult.PairingClosed -> { error = "That code has expired. Get a new one on the Mac and scan again."; picked = null; code = "" }
                            DirectLink.PairResult.Unreachable -> { error = "Can’t reach ${found.name}. Same Wi-Fi? Twinglass open?"; picked = null; code = "" }
                            DirectLink.PairResult.Failed -> { error = "Pairing failed. Scan a new code on the Mac."; picked = null; code = "" }
                        }
                    }
                }
            }
            .addOnFailureListener { error = "Couldn’t open the scanner (${it.message}). Pick your Mac below and type the code instead." }
    }

    val mac = picked
    if (mac == null) {
        SheetHeader(Icons.Rounded.QrCodeScanner, "Pair with your Mac", "On your Mac: Twinglass → Add phone. Then scan the QR it shows. That’s it.", accent = true)
        PillButton("Scan QR code", onClick = ::scan)
        error?.let { Text(it, style = Type.bodySmall, color = p.accent, modifier = Modifier.padding(top = Space.sm)) }
        Spacer(Modifier.height(Space.xl))
        Text("OR PICK YOUR MAC AND TYPE THE CODE", style = Type.caption, color = p.textTertiary, modifier = Modifier.padding(bottom = Space.sm))
        if (macs.isEmpty()) {
            Row(Modifier.fillMaxWidth().padding(vertical = Space.lg), verticalAlignment = Alignment.CenterVertically) {
                if (searching) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = p.textSecondary)
                Spacer(Modifier.width(Space.md))
                Text(if (searching) "Looking on this Wi-Fi…" else "No Mac found. Is Twinglass open on it, on the same Wi-Fi?", style = Type.bodySmall, color = p.textSecondary)
            }
            if (!searching) PillButton("Search again", primary = false) { round++ }
        } else {
            Grouped(macs.size) { pos ->
                val m = macs[pos.index]
                Cell(pos, onClick = { picked = m }) { CellRow(m.name, m.host, Icons.Rounded.Laptop, trailing = { Arrow() }) }
            }
        }
        return
    }

    if (busy && code.length == 6 && error == null) {
        // Paired from the QR: show progress instead of the code form.
        SheetHeader(Icons.Rounded.QrCodeScanner, "Pairing with ${mac.name}…", "One moment.")
        CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp, color = p.textSecondary)
        return
    }
    SheetHeader(Icons.Rounded.Lock, "Enter the code", "Type the 6-digit code shown on ${mac.name}.")
    // One big field, spaced like six boxes.
    Box(
        Modifier.fillMaxWidth().height(72.dp).clip(RoundedCornerShape(Radius.lg)).background(p.surfaceRaised).border(1.dp, if (error != null) p.accent else p.border, RoundedCornerShape(Radius.lg)),
        contentAlignment = Alignment.Center,
    ) {
        BasicTextField(
            code,
            { v -> code = v.filter { it.isDigit() }.take(6); error = null },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            textStyle = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Bold, fontSize = 34.sp, letterSpacing = 12.sp, textAlign = TextAlign.Center, color = p.textPrimary),
            cursorBrush = SolidColor(p.accent),
            modifier = Modifier.fillMaxWidth(),
        )
        if (code.isEmpty()) Text("• • • • • •", style = Type.headline, color = p.textTertiary)
    }
    error?.let { Text(it, style = Type.bodySmall, color = p.accent, modifier = Modifier.padding(top = Space.sm)) }
    Spacer(Modifier.height(Space.xl))
    SheetActions(
        if (busy) "Pairing…" else "Pair",
        {
            busy = true
            thread {
                val r = DirectLink.pair(ctx, mac, code)
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    busy = false
                    when (r) {
                        DirectLink.PairResult.Ok -> onDone()
                        DirectLink.PairResult.WrongCode -> { error = "That code didn’t match. Check the Mac and try again."; code = "" }
                        DirectLink.PairResult.PairingClosed -> error = "Pairing isn’t open on the Mac. Choose “Add phone” there to get a code."
                        DirectLink.PairResult.Unreachable -> error = "Can’t reach ${mac.name}. Same Wi-Fi? Twinglass open?"
                        DirectLink.PairResult.Failed -> error = "Pairing failed. Get a new code on the Mac and try again."
                    }
                }
            }
        },
        "Back",
        { picked = null; code = ""; error = null },
        primaryEnabled = code.length == 6 && !busy,
    )
}


// ---------------------------------------------------------------- Status card (always on Home)

/**
 * "Update available": the Mac carries a newer phone app. Developer mode installs it over adb (the
 * app closes and reopens); Wi-Fi mode downloads it from the Mac and Android's installer takes over.
 */
@Composable
fun UpdateCard(version: String, mac: String, wifi: Boolean, updating: Boolean, onUpdate: () -> Unit) {
    val p = LocalPalette.current
    val shape = RoundedCornerShape(Radius.lg)
    Column(
        Modifier.fillMaxWidth().clip(shape).background(p.surface).border(1.dp, p.accent, shape).padding(Space.lg),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            StatusDot(p.accent, live = updating)
            Spacer(Modifier.width(Space.sm))
            Text("UPDATE AVAILABLE", style = Type.caption, color = p.textSecondary)
        }
        Spacer(Modifier.height(Space.sm))
        Text("Twinglass $version", style = Type.title, color = p.textPrimary)
        Spacer(Modifier.height(Space.xs))
        Text(
            if (wifi) "$mac has a newer phone app. It downloads from your Mac over Wi-Fi; then tap Install. Your settings and pairing stay."
            else "$mac has a newer phone app and installs it over debugging. Twinglass closes for a moment and reopens, settings and link intact.",
            style = Type.bodySmall,
            color = p.textSecondary,
        )
        Spacer(Modifier.height(Space.md))
        PillButton(if (updating) "Updating…" else "Update", enabled = !updating, onClick = onUpdate)
    }
}

/**
 * Where this phone stands, always at the top of Home: full potential (Developer mode + linked to
 * the Mac over adb), Developer mode on but not linked yet, or Wi-Fi mode (with the way up).
 */
@Composable
fun PotentialCard(
    dev: DeviceInfo.DevState,
    mode: Prefs.Mode,
    adbLinkedTo: String?,
    /** The Mac was forgotten here: adb linking is blocked until Link again. */
    forgotten: Boolean = false,
    onLinkAgain: () -> Unit = {},
    onUnlock: () -> Unit,
    onSwitch: (Prefs.Mode) -> Unit,
) {
    val p = LocalPalette.current
    val debugging = dev.usbDebugging || dev.wirelessDebugging
    val full = debugging && adbLinkedTo != null
    val (label, title, body) = when {
        full -> Triple("FULL POTENTIAL", "Running at full potential", "Developer mode is on and $adbLinkedTo is linked: second screens, coding agents, app testing and the lowest latency are all available.")
        debugging && forgotten -> Triple("DEVELOPER MODE ON", "Almost at full potential", "You forgot your Mac, so it can’t link over adb. Tap Link again below to get second screens, coding agents, app testing and the lowest latency back.")
        debugging -> Triple("DEVELOPER MODE ON", "Almost at full potential", "${if (dev.wirelessDebugging && !dev.usbDebugging) "Wireless" else "USB"} debugging is on. Connect to your Mac (cable or wireless debugging) with Twinglass open to link it.")
        else -> Triple("WI-FI MODE", "Mirroring and basic control", "Turn on Developer mode to unlock second screens, coding agents, app testing and the lowest latency.")
    }
    val shape = RoundedCornerShape(Radius.lg)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(if (full) p.textPrimary else p.surface)
            .border(1.dp, if (full) p.textPrimary else p.border, shape)
            .padding(Space.lg),
    ) {
        val fg = if (full) p.textInverse else p.textPrimary
        val sub = if (full) p.textInverse.copy(alpha = 0.7f) else p.textSecondary
        Row(verticalAlignment = Alignment.CenterVertically) {
            StatusDot(if (full || debugging) p.accent else p.textTertiary, live = full)
            Spacer(Modifier.width(Space.sm))
            Text(label, style = Type.caption, color = sub, modifier = Modifier.weight(1f))
            // The three things that decide it, at a glance.
            Text(
                listOf(if (dev.developerOptions) "DEV OPTIONS ✓" else "DEV OPTIONS ✗", if (debugging) "DEBUGGING ✓" else "DEBUGGING ✗", if (adbLinkedTo != null) "LINKED ✓" else "LINKED ✗").joinToString("  "),
                style = Type.caption.copy(fontSize = 9.sp),
                color = sub,
            )
        }
        Spacer(Modifier.height(Space.sm))
        Text(title, style = Type.title, color = fg)
        Spacer(Modifier.height(Space.xs))
        Text(body, style = Type.bodySmall, color = sub)
        // One clear next step when something doesn't match.
        val action: Pair<String, () -> Unit>? = when {
            full && mode != Prefs.Mode.Developer -> "Switch to Full control" to { onSwitch(Prefs.Mode.Developer) }
            !debugging && mode == Prefs.Mode.Developer -> "Turn on Developer mode" to onUnlock
            !debugging -> "Unlock full potential" to onUnlock
            else -> null
        }
        if (action != null) {
            Spacer(Modifier.height(Space.md))
            Box(
                Modifier.clip(RoundedCornerShape(Radius.pill)).background(if (full) p.textInverse else p.textPrimary).clickable(onClick = action.second).padding(horizontal = Space.lg, vertical = 10.dp),
            ) { Text(action.first, style = Type.bodySmall.copy(fontWeight = FontWeight.SemiBold), color = if (full) p.textPrimary else p.textInverse) }
        }
    }
}
