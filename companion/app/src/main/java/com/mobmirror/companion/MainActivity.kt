package com.mobmirror.companion

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.PhoneAndroid
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import com.mobmirror.companion.ui.FloatingNav
import com.mobmirror.companion.ui.LocalPalette
import com.mobmirror.companion.ui.NavItem
import com.mobmirror.companion.ui.Space
import com.mobmirror.companion.ui.Springs
import com.mobmirror.companion.ui.TwinglassTheme
import com.mobmirror.companion.ui.Type
import com.mobmirror.companion.ui.dotGrid
import kotlinx.coroutines.launch
import kotlin.concurrent.thread

/**
 * The Twinglass phone app: Home (link + this phone at a glance + quick actions), Device (every
 * detail, searchable), Settings, and the "Connected to" page for the Mac. Design: Sparky's
 * language (ui/Theme.kt).
 */
class MainActivity : ComponentActivity() {
    private val main = Handler(Looper.getMainLooper())
    private var polling = false
    private var link by mutableStateOf<LinkState>(LinkState.Checking)
    private var sections by mutableStateOf<List<DeviceInfo.Section>>(emptyList())
    private var snap by mutableStateOf<DeviceInfo.Snapshot?>(null)
    private var agent by mutableStateOf(false to false)
    private var prefs by mutableStateOf<Prefs.All?>(null)
    private var features by mutableStateOf<Map<Prefs.Feature, Boolean>>(emptyMap())
    private var advanced by mutableStateOf<Prefs.Advanced?>(null)
    private var notice by mutableStateOf<String?>(null)
    private var confirmForgetDirect by mutableStateOf(false)

    /** Forget the Wi-Fi Mac on both sides (tells the Mac; queues it if the Mac is away). */
    private fun forgetDirectEverywhere() {
        val name = direct.paired?.name ?: "the Mac"
        stopPresence()
        if (com.mobmirror.companion.direct.MirrorService.running) startService(Intent(this, com.mobmirror.companion.direct.MirrorService::class.java).setAction(com.mobmirror.companion.direct.MirrorService.ACTION_STOP))
        thread {
            val told = com.mobmirror.companion.direct.DirectLink.forgetEverywhere(this)
            main.post {
                refreshDirect()
                notice = if (told) "Forgot $name here and on the Mac" else "Forgot $name here. The Mac forgets this phone as soon as it’s reachable."
            }
        }
    }

    // ---- "Wi-Fi, no setup" (no developer mode) ----
    private var mode by mutableStateOf(Prefs.Mode.Unset)
    private var sheet by mutableStateOf<Sheet?>(null)
    private var direct by mutableStateOf(DirectState(null, false, "", false, false))
    private var dev by mutableStateOf(DeviceInfo.DevState(false, false, false))

    /** Android's screen-sharing consent → start the mirror service. */
    private val consent = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) { r ->
        val data = r.data
        if (r.resultCode == RESULT_OK && data != null) com.mobmirror.companion.direct.startMirror(this, r.resultCode, data)
        else notice = "Screen sharing wasn’t allowed"
    }
    private val notifPermission = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) { refreshDirect() }

    private fun refreshDirect() {
        val notif = android.os.Build.VERSION.SDK_INT < 33 ||
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == android.content.pm.PackageManager.PERMISSION_GRANTED
        dev = DeviceInfo.devState(this)
        direct = DirectState(
            paired = com.mobmirror.companion.direct.DirectLink.paired(this),
            mirroring = com.mobmirror.companion.direct.MirrorService.running,
            status = com.mobmirror.companion.direct.MirrorService.status,
            controlOn = DeviceInfo.agentAccess(this).first,
            notificationsOn = notif,
            forgotten = com.mobmirror.companion.direct.DirectLink.forgotten(this),
            pendingForget = com.mobmirror.companion.direct.DirectLink.hasPendingForget(this),
        )
    }

    /** "Mirror to Mac": pair first if needed, explain once, then Android's consent. */
    private fun mirror() {
        refreshDirect()
        when {
            direct.paired == null -> sheet = Sheet.Pair
            !Prefs.seen(this, "shareIntro") -> { Prefs.markSeen(this, "shareIntro"); sheet = Sheet.ShareIntro }
            else -> startConsent()
        }
    }

    private fun startConsent() {
        val mpm = getSystemService(android.media.projection.MediaProjectionManager::class.java)
        consent.launch(mpm.createScreenCaptureIntent())
    }

    private val sheetActions by lazy {
        SheetActionsModel(
            paired = { refreshDirect(); notice = "Paired with ${direct.paired?.name ?: "your Mac"}" },
            startConsent = ::startConsent,
            openAccessibility = { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) },
            requestNotifications = { if (android.os.Build.VERSION.SDK_INT >= 33) notifPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS) },
            openDeveloperOptions = { runCatching { startActivity(Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS)) }.onFailure { startActivity(Intent(Settings.ACTION_DEVICE_INFO_SETTINGS)) } },
            switchToDeveloper = { chooseMode(Prefs.Mode.Developer) },
        )
    }

    private fun chooseMode(m: Prefs.Mode) {
        Prefs.setMode(this, m)
        mode = m
        nav = Nav(Tab.Home)
        if (m == Prefs.Mode.NoSetup && com.mobmirror.companion.direct.DirectLink.paired(this) == null) sheet = Sheet.Pair
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        loadPrefs()
        mode = Prefs.mode(this)
        refreshDirect()
        com.mobmirror.companion.direct.MirrorService.onStatus = { main.post { refreshDirect() } }
        nav = Nav(if (prefs!!.startTab == Prefs.StartTab.Device) Tab.Device else Tab.Home)
        val licences = runCatching {
            listOf("SpaceGrotesk-OFL.txt").joinToString("\n\n— — —\n\n") { assets.open("licenses/$it").bufferedReader().readText().trim() }
        }.getOrDefault("")
        setContent {
            val s = prefs!!
            TwinglassTheme(s.theme) {
                // Status / nav bar icons follow the app's theme, not the system's (dark icons on the
                // light palette, light icons on black).
                val dark = com.mobmirror.companion.ui.LocalPalette.current.isDark
                val view = androidx.compose.ui.platform.LocalView.current
                androidx.compose.runtime.SideEffect {
                    androidx.core.view.WindowCompat.getInsetsController(window, view).apply {
                        isAppearanceLightStatusBars = !dark
                        isAppearanceLightNavigationBars = !dark
                    }
                }
                val d = androidx.compose.ui.platform.LocalDensity.current
                androidx.compose.runtime.CompositionLocalProvider(
                    androidx.compose.ui.platform.LocalDensity provides androidx.compose.ui.unit.Density(d.density, d.fontScale * s.textScale),
                    com.mobmirror.companion.ui.LocalReduceMotion provides s.reduceMotion,
                    com.mobmirror.companion.ui.LocalHaptics provides s.haptics,
                ) {
                    if (mode == Prefs.Mode.Unset) {
                        val p = LocalPalette.current
                        Box(Modifier.fillMaxSize().background(p.background).dotGrid(p.dotGrid)) { Landing(::chooseMode) }
                    } else App(model(), licences)
                    SheetHost(sheet, direct, { sheet = null; refreshDirect() }, sheetActions)
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        polling = true
        reload()
        refreshDirect()
        poll()
        startPresence()
    }

    override fun onPause() {
        polling = false
        stopPresence()
        super.onPause()
    }

    // ---- presence (Wi-Fi mode): while the app is open, stay connected to the paired Mac so it
    // shows this phone as "Ready", and a forget on the Mac reaches the phone at once. ----
    @Volatile private var presence: com.mobmirror.companion.direct.DirectLink.Session? = null
    @Volatile private var presenceWanted = false

    private fun startPresence() {
        if (mode != Prefs.Mode.NoSetup) return
        presenceWanted = true
        thread {
            com.mobmirror.companion.direct.DirectLink.flushPendingForget(this)
            if (com.mobmirror.companion.direct.DirectLink.paired(this) == null || presence != null) {
                main.post { refreshDirect() }
                return@thread
            }
            if (com.mobmirror.companion.direct.MirrorService.running) return@thread // the mirror has its own session
            runCatching {
                presence = com.mobmirror.companion.direct.DirectLink.open(this, object : com.mobmirror.companion.direct.DirectLink.Listener {
                    override fun onJson(msg: org.json.JSONObject) {
                        when (msg.optString("t")) {
                            "forget" -> main.post { refreshDirect(); notice = "${direct.paired?.name ?: "The Mac"} forgot this phone. Pair again to use it." }
                            // The Mac carries a newer phone app (Home shows "Update").
                            "update" -> main.post { wifiUpdate = msg.optString("version").ifEmpty { "A new version" } }
                            "update-url" -> main.post {
                                updating = false
                                val url = msg.optString("url")
                                if (url.startsWith("http://")) {
                                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))) }
                                        .onSuccess { notice = "Downloading the update from your Mac. Open it when it’s done and tap Install; your settings stay." }
                                        .onFailure { notice = "No browser to download the update with" }
                                } else notice = "The Mac couldn’t share the update (${msg.optString("error")})"
                            }
                        }
                    }
                    override fun onControl(msg: ByteArray) {}
                    override fun onClosed(error: String?) {
                        presence = null
                        main.post { refreshDirect() }
                        // Dropped while the app is open (Mac restarted, Wi-Fi blip): try again soon.
                        if (presenceWanted) main.postDelayed({ if (presenceWanted) startPresence() }, 10_000)
                    }
                })
            }.onFailure {
                // "… forgot this phone" already dropped the pairing in DirectLink.open.
                main.post { refreshDirect() }
                if (presenceWanted) main.postDelayed({ if (presenceWanted) startPresence() }, 15_000)
            }
        }
    }

    private fun stopPresence() {
        presenceWanted = false
        presence?.close()
        presence = null
    }

    private fun loadPrefs() {
        val s = Prefs.all(this)
        prefs = s
        advanced = Prefs.advanced(this)
        features = Prefs.Feature.entries.associateWith { Prefs.enabled(this, it) }
        if (s.keepScreenOn) window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    private fun diagnostics(): String = listOf(
        "Twinglass phone app ${DeviceInfo.appVersion(this)}",
        "Android ${android.os.Build.VERSION.RELEASE} (API ${android.os.Build.VERSION.SDK_INT}), ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}",
        "Paired: ${Link.paired(this)}, Mac: ${Link.macName(this)}, port ${Link.port(this)}, key ${Link.keyId(this)}…",
        "Link: " + when (val l = link) {
            is LinkState.Connected -> "connected, ${l.status.pingMs} ms, Mac app ${l.status.version}, ${l.status.os}"
            is LinkState.Unreachable -> "not reachable"
            LinkState.NotPaired -> "not paired"
            LinkState.Forgotten -> "forgotten (linking blocked)"
            LinkState.Checking -> "checking"
        },
        "Features: " + features.entries.joinToString { "${it.key}=${if (it.value) "on" else "off"}" },
        "Read any screen: switched ${if (agent.first) "on" else "off"}, service ${if (agent.second) "running" else "not running"}",
    ).joinToString("\n")

    private fun model() = AppModel(
        link = link, forgottenMac = Link.forgottenName(this), snap = snap, sections = sections, agent = agent, version = DeviceInfo.appVersion(this),
        prefs = prefs!!, features = features, advanced = advanced!!,
        pairedAt = Link.pairedAt(this), lastSeen = Link.lastSeen(this), port = Link.port(this), keyId = Link.keyId(this),
        refresh = { reload(); pollOnce() },
        copy = { label, text ->
            getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText(label, text))
            notice = "Copied $label"
        },
        sendClipboard = ::sendClipboard,
        openAccessibility = { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) },
        forget = { val name = Link.macName(this); Link.forget(this); link = LinkState.Forgotten; notice = "Forgot $name. Link again from Home when you want it back" },
        set = { key, value -> Prefs.put(this, key, value); loadPrefs() },
        setFeature = { f, on -> Prefs.setEnabled(this, f, on); loadPrefs() },
        resetSettings = { Prefs.reset(this); loadPrefs(); notice = "Settings reset" },
        copyDiagnostics = {
            getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("Twinglass diagnostics", diagnostics()))
            notice = "Copied diagnostics"
        },
        openConnection = { nav = Nav(nav.tab, page = Page.Connection) },
        openDevice = { nav = Nav(Tab.Device) },
        openAdvanced = { nav = Nav(nav.tab, page = Page.Advanced) },
        mode = mode,
        setMode = ::chooseMode,
        directMac = direct.paired?.name,
        forgetDirect = { confirmForgetDirect = true },
        linkAgain = { Link.unblock(this); link = LinkState.NotPaired; linkNow() },
        linkNow = ::linkNow,
        linking = linking,
        openAppInfo = { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.fromParts("package", packageName, null))) },
    )

    // Navigation: three tabs, plus the "Connected to" page pushed on top.
    enum class Tab { Home, Device, Settings }
    /** A page pushed over the tabs. */
    enum class Page { Connection, Advanced }
    data class Nav(val tab: Tab, val page: Page? = null)
    private var nav by mutableStateOf(Nav(Tab.Home))

    private fun sendClipboard() {
        val clip = getSystemService(ClipboardManager::class.java).primaryClip
        val text = clip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString()
        if (text.isNullOrBlank()) { notice = "The phone’s clipboard is empty"; return }
        thread {
            val ok = Link.sendText(this, text, Prefs.shareNotifyMac(this))
            main.post { notice = if (ok) "Sent to ${Link.macName(this)}’s clipboard" else "Can’t reach ${Link.macName(this)}" }
        }
    }

    private var linking by mutableStateOf(false)

    // ---- updates: the Mac carries the newest phone app; the phone never goes online for it ----
    /** Wi-Fi mode: the version the paired Mac offered. */
    private var wifiUpdate by mutableStateOf<String?>(null)
    private var updating by mutableStateOf(false)
    private val myCode by lazy { DeviceInfo.appCode(this) }

    /** The newer phone app version the Mac has, if any (Developer mode: from /link/status). */
    private fun availableUpdate(): String? =
        (link as? LinkState.Connected)?.status?.takeIf { it.phoneAppCode > myCode }?.phoneAppVersion ?: wifiUpdate

    private fun updateNow() {
        if (updating) return
        val adb = (link as? LinkState.Connected)?.status?.takeIf { it.phoneAppCode > myCode }
        updating = true
        if (adb != null) thread {
            val ok = Link.requestUpdate(this)
            main.post {
                updating = ok // stays "Updating…" until Android closes the app for the install
                notice = if (ok) "Updating to ${adb.phoneAppVersion}. Twinglass closes for a moment and reopens." else "Can’t reach Twinglass on ${adb.mac}"
            }
        } else {
            val s = presence
            if (s == null) { updating = false; notice = "Can’t reach your Mac. Open Twinglass there, on the same Wi-Fi."; return }
            thread { runCatching { s.json(org.json.JSONObject().put("t", "get-update")) }.onFailure { main.post { updating = false; notice = "Can’t reach your Mac" } } }
        }
    }

    /** Asks Twinglass on the Mac to link this phone now, then waits a few seconds for the key. */
    private fun linkNow() {
        if (linking) return
        linking = true
        thread {
            val mac = Link.requestLink(this)
            var ok = false
            if (!mac.isNullOrEmpty()) for (i in 0 until 20) { if (Link.paired(this)) { ok = true; break }; Thread.sleep(250) }
            main.post {
                linking = false
                pollOnce()
                notice = when {
                    ok -> "Linked to ${Link.macName(this)}"
                    mac == "" -> "Twinglass on the Mac needs an update to link from here. Meanwhile: Settings → Phone app → Relink on the Mac, or reconnect the cable."
                    mac != null -> "$mac answered but didn’t link. Update Twinglass on the Mac, or use Settings → Phone app → Relink there."
                    else -> "Can’t reach Twinglass on the Mac. Open it, with this phone connected by USB or wireless debugging."
                }
            }
        }
    }

    private fun reload() {
        thread {
            val ctx = applicationContext
            val s = DeviceInfo.collect(ctx)
            val n = DeviceInfo.snapshot(ctx)
            val a = DeviceInfo.agentAccess(ctx)
            main.post { sections = s; snap = n; agent = a }
        }
    }

    private fun pollOnce() {
        if (!Link.paired(this)) { link = if (Link.blocked(this)) LinkState.Forgotten else LinkState.NotPaired; return }
        thread {
            val s = Link.status(this)
            main.post { link = if (s == null) LinkState.Unreachable(Link.macName(this)) else LinkState.Connected(s) }
        }
    }

    private fun poll() {
        if (!polling) return
        pollOnce()
        dev = DeviceInfo.devState(this) // the user may flip USB / wireless debugging any time
        main.postDelayed({ poll() }, (prefs?.refreshSec ?: 3) * 1000L)
    }

    @Composable
    private fun App(m: AppModel, licences: String) {
        val p = LocalPalette.current
        val snackbar = remember { SnackbarHostState() }
        val scope = rememberCoroutineScope()
        var query by rememberSaveable { mutableStateOf("") }
        var open by rememberSaveable { mutableStateOf(setOf<String>()) }
        var licencesOpen by rememberSaveable { mutableStateOf(false) }
        var confirmForget by remember { mutableStateOf(false) }
        var confirmReset by remember { mutableStateOf(false) }
        val bars = WindowInsets.systemBars.asPaddingValues()

        LaunchedEffect(notice) {
            val msg = notice ?: return@LaunchedEffect
            notice = null
            scope.launch { snackbar.currentSnackbarData?.dismiss(); snackbar.showSnackbar(msg) }
        }
        BackHandler(enabled = nav.page != null || nav.tab != Tab.Home) {
            nav = if (nav.page != null) nav.copy(page = null) else Nav(Tab.Home)
        }

        Box(Modifier.fillMaxSize().background(p.background).then(if (m.prefs.dotGrid) Modifier.dotGrid(p.dotGrid) else Modifier)) {
            AnimatedContent(
                nav,
                transitionSpec = {
                    if (m.prefs.reduceMotion) return@AnimatedContent androidx.compose.animation.EnterTransition.None togetherWith androidx.compose.animation.ExitTransition.None
                    // Pages shift 30 dp with a spring (Sparky's settings page transition); tabs cross-fade.
                    val push = targetState.page != null && initialState.page == null
                    val pop = targetState.page == null && initialState.page != null
                    when {
                        push -> (slideInHorizontally(Springs.snappy<IntOffset>()) { it / 6 } + fadeIn()) togetherWith fadeOut()
                        pop -> fadeIn() togetherWith (slideOutHorizontally(Springs.snappy<IntOffset>()) { it / 6 } + fadeOut())
                        else -> fadeIn() togetherWith fadeOut()
                    }
                },
                label = "nav",
            ) { n ->
                LazyColumn(
                    Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = Space.lg, end = Space.lg, top = bars.calculateTopPadding() + Space.lg, bottom = bars.calculateBottomPadding() + 112.dp),
                ) {
                    when {
                        n.page == Page.Connection -> connectionScreen(m, onBack = { nav = nav.copy(page = null) }, onForget = { confirmForget = true })
                        n.page == Page.Advanced -> advancedScreen(m, onBack = { nav = nav.copy(page = null) })
                        n.tab == Tab.Home -> homeScreen(
                            m,
                            if (mode == Prefs.Mode.NoSetup) {
                                { directHome(direct, { sheet = it }, ::mirror, full = (dev.usbDebugging || dev.wirelessDebugging) && link is LinkState.Connected, onStop = { startService(Intent(this@MainActivity, com.mobmirror.companion.direct.MirrorService::class.java).setAction(com.mobmirror.companion.direct.MirrorService.ACTION_STOP)) }, onDismissForgotten = { com.mobmirror.companion.direct.DirectLink.dismissForgotten(this@MainActivity); refreshDirect() }) }
                            } else null,
                            {
                                availableUpdate()?.let { v ->
                                    UpdateCard(v, (link as? LinkState.Connected)?.status?.mac ?: direct.paired?.name ?: "your Mac", wifi = (link as? LinkState.Connected)?.status?.takeIf { it.phoneAppCode > myCode } == null, updating, ::updateNow)
                                    Spacer(Modifier.height(Space.md))
                                }
                                PotentialCard(
                                    dev = dev,
                                    mode = mode,
                                    adbLinkedTo = (link as? LinkState.Connected)?.status?.mac,
                                    forgotten = link == LinkState.Forgotten,
                                    onLinkAgain = m.linkAgain,
                                    onUnlock = { sheet = Sheet.DevSetup },
                                    onSwitch = ::chooseMode,
                                )
                            },
                        )
                        n.tab == Tab.Device -> deviceScreen(m, query, { query = it }, open) { t -> open = if (t in open) open - t else open + t }
                        else -> settingsScreen(m, licencesOpen, { licencesOpen = !licencesOpen }, { confirmForget = true }, { confirmReset = true }, licences)
                    }
                }
            }
            // Solid backdrop under the status bar (fading into the page) so scrolled content never
            // shows through behind the clock and icons; same at the bottom behind the nav bar.
            Box(
                Modifier
                    .align(Alignment.TopCenter)
                    .fillMaxWidth()
                    .height(bars.calculateTopPadding() + Space.lg)
                    .background(androidx.compose.ui.graphics.Brush.verticalGradient(0f to p.background, 0.7f to p.background, 1f to p.background.copy(alpha = 0f))),
            )
            Box(
                Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .height(bars.calculateBottomPadding() + Space.sm)
                    .background(androidx.compose.ui.graphics.Brush.verticalGradient(0f to p.background.copy(alpha = 0f), 0.4f to p.background, 1f to p.background)),
            )
            if (nav.page == null) {
                FloatingNav(
                    listOf(NavItem(Tab.Home, "Home", Icons.Rounded.Home), NavItem(Tab.Device, "Device", Icons.Rounded.PhoneAndroid), NavItem(Tab.Settings, "Settings", Icons.Rounded.Settings)),
                    nav.tab,
                    { nav = Nav(it) },
                    Modifier.align(Alignment.BottomCenter).padding(bottom = bars.calculateBottomPadding() + Space.lg),
                )
            }
            SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(bottom = bars.calculateBottomPadding() + 84.dp)) {
                Snackbar(it, shape = RoundedCornerShape(16.dp), containerColor = p.textPrimary, contentColor = p.textInverse)
            }
        }

        if (confirmForgetDirect) {
            AlertDialog(
                onDismissRequest = { confirmForgetDirect = false },
                shape = RoundedCornerShape(28.dp),
                containerColor = p.surface,
                title = { Text("Forget ${direct.paired?.name ?: "this Mac"}?", style = Type.title, color = p.textPrimary) },
                text = { Text("It’s removed on this phone and on the Mac. To use it again, pair with a new code.", style = Type.bodySmall, color = p.textSecondary) },
                confirmButton = { TextButton({ confirmForgetDirect = false; forgetDirectEverywhere() }) { Text("FORGET", style = Type.button, color = p.accent) } },
                dismissButton = { TextButton({ confirmForgetDirect = false }) { Text("CANCEL", style = Type.button, color = p.textPrimary) } },
            )
        }
        if (confirmReset) {
            AlertDialog(
                onDismissRequest = { confirmReset = false },
                shape = RoundedCornerShape(28.dp),
                containerColor = p.surface,
                title = { Text("Reset settings?", style = Type.title, color = p.textPrimary) },
                text = { Text("Everything in Settings goes back to its default. The link to your Mac and the “What the Mac may use” switches stay as they are.", style = Type.bodySmall, color = p.textSecondary) },
                confirmButton = { TextButton({ confirmReset = false; m.resetSettings() }) { Text("RESET", style = Type.button, color = p.accent) } },
                dismissButton = { TextButton({ confirmReset = false }) { Text("CANCEL", style = Type.button, color = p.textPrimary) } },
            )
        }
        if (confirmForget) {
            AlertDialog(
                onDismissRequest = { confirmForget = false },
                shape = RoundedCornerShape(28.dp),
                containerColor = p.surface,
                title = { Text("Forget ${Link.macName(this)}?", style = Type.title, color = p.textPrimary) },
                text = { Text("The link is removed from this phone, and the Mac can’t link again by itself. Choose “Link again” when you want it back.", style = Type.bodySmall, color = p.textSecondary) },
                confirmButton = { TextButton({ confirmForget = false; m.forget(); nav = Nav(Tab.Home) }) { Text("FORGET", style = Type.button, color = p.accent) } },
                dismissButton = { TextButton({ confirmForget = false }) { Text("CANCEL", style = Type.button, color = p.textPrimary) } },
            )
        }
    }
}
