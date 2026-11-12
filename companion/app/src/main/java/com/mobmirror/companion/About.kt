package com.mobmirror.companion

import android.content.Context
import android.net.Uri
import android.os.Build
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.BugReport
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Laptop
import androidx.compose.material.icons.rounded.NewReleases
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mobmirror.companion.ui.Cell
import com.mobmirror.companion.ui.CellRow
import com.mobmirror.companion.ui.Chevron
import com.mobmirror.companion.ui.Chip
import com.mobmirror.companion.ui.DotField
import com.mobmirror.companion.ui.Expandable
import com.mobmirror.companion.ui.Grouped
import com.mobmirror.companion.ui.LocalPalette
import com.mobmirror.companion.ui.PageHeader
import com.mobmirror.companion.ui.PillButton
import com.mobmirror.companion.ui.SectionHeader
import com.mobmirror.companion.ui.Space
import com.mobmirror.companion.ui.SpringIn
import com.mobmirror.companion.ui.Tile
import com.mobmirror.companion.ui.Type
import org.json.JSONObject
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Locale

/** The project's home and the release notes both apps show (changelog/changelog.json in the repo). */
object About {
    const val REPO = "https://github.com/TrendySloth1001/TwinGlass"

    data class Release(val mac: String, val phone: String, val date: String, val title: String, val summary: String, val macNotes: List<String>, val phoneNotes: List<String>)

    @Volatile private var cached: List<Release>? = null

    fun releases(ctx: Context): List<Release> = cached ?: runCatching {
        val j = JSONObject(ctx.assets.open("changelog.json").bufferedReader().readText())
        val a = j.getJSONArray("releases")
        (0 until a.length()).map { i ->
            val r = a.getJSONObject(i)
            fun list(k: String) = r.optJSONArray(k)?.let { l -> (0 until l.length()).map { l.getString(it) } } ?: emptyList()
            Release(r.getString("version"), r.getString("phone"), r.optString("date"), r.optString("title"), r.optString("summary"), list("mac"), list("phoneApp"))
        }
    }.getOrDefault(emptyList()).also { cached = it }

    fun date(iso: String): String = runCatching {
        DateFormat.getDateInstance(DateFormat.LONG).format(SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(iso)!!)
    }.getOrDefault(iso)

    /** A new GitHub issue pre-filled with versions only (the user reviews it before sending). */
    fun newIssue(ctx: Context): String {
        val body = """
            **What happened**


            **What you expected**


            **Steps to reproduce**
            1.

            ---
            Phone app ${DeviceInfo.appVersion(ctx)} (${DeviceInfo.appCode(ctx)}) · ${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})
        """.trimIndent()
        return "$REPO/issues/new?body=" + Uri.encode(body)
    }
}

// ---------------------------------------------------------------- About

fun LazyListScope.aboutScreen(m: AppModel, licencesOpen: Boolean, onLicences: () -> Unit, licences: String, onChangelog: () -> Unit, onBack: () -> Unit) {
    item { PageHeader("About", "Twinglass phone app", onBack = onBack) }
    item { SpringIn(0) { AboutHero(m.version, onChangelog) } }

    item { SectionHeader("Project") }
    item {
        val uri = LocalUriHandler.current
        val ctx = LocalContext.current
        Grouped(4) { pos ->
            when (pos.index) {
                0 -> Cell(pos, onClick = { uri.openUri(About.REPO) }) {
                    CellRow("Source code on GitHub", "github.com/TrendySloth1001/TwinGlass", Icons.Rounded.Code, trailing = { OpenIcon() })
                }
                1 -> Cell(pos, onClick = onChangelog) { CellRow("What’s new", "Every release of the phone app and Twinglass for Mac.", Icons.Rounded.NewReleases) }
                2 -> Cell(pos, onClick = { uri.openUri(About.newIssue(ctx)) }) {
                    CellRow("Report a problem", "Opens a GitHub issue with this phone’s versions filled in. You see it before sending.", Icons.Rounded.BugReport, trailing = { OpenIcon() })
                }
                else -> Cell(pos, onClick = { uri.openUri("${About.REPO}/releases") }) {
                    CellRow("Releases", "Downloads for the Mac. Phones get updates from their Mac.", Icons.Rounded.Laptop, trailing = { OpenIcon() })
                }
            }
        }
    }

    item { SectionHeader("This app") }
    item {
        val ctx = LocalContext.current
        val pairedWith = About.releases(ctx).firstOrNull { it.phone == m.version }?.mac
        Grouped(4) { pos ->
            when (pos.index) {
                0 -> Cell(pos, onLongClick = { m.copy("Version", m.version) }) { CellRow("Version", "${m.version} · build ${DeviceInfo.appCode(ctx)}", Icons.Rounded.Info) }
                1 -> Cell(pos) { CellRow("Ships with", if (pairedWith != null) "Twinglass for Mac $pairedWith" else "Twinglass for Mac", Icons.Rounded.Laptop) }
                2 -> Cell(pos, onLongClick = { m.copy("Package", ctx.packageName) }) { CellRow("Package", ctx.packageName, Icons.Rounded.Code) }
                else -> Cell(pos) { CellRow("Updates", "From your Mac: Home shows “Update available” when it carries a newer version. This app never downloads anything from the internet.", Icons.Rounded.NewReleases) }
            }
        }
    }

    item { SectionHeader("Privacy") }
    item {
        Grouped(1) { pos ->
            Cell(pos) {
                CellRow(
                    "Nothing leaves your network",
                    "No accounts, no analytics, no ads. The app talks only to your paired Mac: over adb, or the encrypted Wi-Fi link (AES-256-GCM). What the Mac may read is switched in Settings → What the Mac may use.",
                    Icons.Rounded.Shield,
                )
            }
        }
    }

    item { SectionHeader("Built with") }
    item {
        Grouped(2) { pos ->
            when (pos.index) {
                0 -> Cell(pos) { CellRow("Kotlin, Jetpack Compose, Material 3", "Android Open Source Project · Apache-2.0", Icons.Rounded.Code) }
                else -> Cell(pos, onClick = onLicences) {
                    CellRow("Open-source licences", "Space Grotesk (SIL Open Font License 1.1). QR scanning by Google’s code scanner (Google Play services).", Icons.Rounded.Description, trailing = { Chevron(licencesOpen, Icons.Rounded.KeyboardArrowDown) })
                    Expandable(licencesOpen) {
                        Text(licences, style = Type.caption, color = LocalPalette.current.textSecondary, modifier = Modifier.padding(start = 72.dp, end = Space.lg, bottom = Space.lg))
                    }
                }
            }
        }
    }
    item {
        Text(
            "© 2026 Nikhil Kumawat\nNot affiliated with Google or Genymobile. Android is a trademark of Google LLC.",
            style = Type.caption,
            color = LocalPalette.current.textTertiary,
            modifier = Modifier.fillMaxWidth().padding(top = Space.xl),
        )
    }
}

@Composable
private fun OpenIcon() = androidx.compose.material3.Icon(Icons.AutoMirrored.Rounded.OpenInNew, null, Modifier.size(18.dp), tint = LocalPalette.current.textTertiary)

@Composable
private fun AboutHero(version: String, onChangelog: () -> Unit) {
    val p = LocalPalette.current
    val uri = LocalUriHandler.current
    Tile(Modifier.fillMaxWidth()) {
        DotField(Modifier.align(Alignment.TopEnd).size(132.dp), color = p.textTertiary)
        Column {
            Image(painterResource(R.drawable.ic_launcher), null, Modifier.size(72.dp).clip(RoundedCornerShape(18.dp)))
            Spacer(Modifier.height(Space.lg))
            Text("Twinglass", style = Type.headline, color = p.textPrimary)
            Spacer(Modifier.height(Space.xs))
            Text("Your phone, on your Mac. Mirror it, control it, share to it, and let coding agents test on it.", style = Type.bodySmall, color = p.textSecondary, modifier = Modifier.padding(end = 48.dp))
            Spacer(Modifier.height(Space.md))
            Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) { Chip("Phone app $version") }
            Spacer(Modifier.height(Space.lg))
            Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                PillButton("GitHub") { uri.openUri(About.REPO) }
                PillButton("What’s new", primary = false, onClick = onChangelog)
            }
        }
    }
}

// ---------------------------------------------------------------- What's new

fun LazyListScope.changelogScreen(m: AppModel, releases: List<About.Release>, onBack: () -> Unit) {
    item { PageHeader("What’s new", "Phone app and Twinglass for Mac", onBack = onBack) }
    if (releases.isEmpty()) item { Text("Release notes aren’t available in this build.", style = Type.bodySmall, color = LocalPalette.current.textSecondary) }
    releases.forEachIndexed { i, r ->
        item { SpringIn(i.coerceAtMost(4)) { ReleaseCard(r, installed = r.phone == m.version) } }
        item { Spacer(Modifier.height(Space.md)) }
    }
    item {
        val uri = LocalUriHandler.current
        Row(Modifier.fillMaxWidth().padding(top = Space.md), horizontalArrangement = Arrangement.Center) {
            PillButton("All releases on GitHub", primary = false) { uri.openUri("${About.REPO}/releases") }
        }
    }
}

@Composable
private fun ReleaseCard(r: About.Release, installed: Boolean) {
    val p = LocalPalette.current
    Tile(Modifier.fillMaxWidth()) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(r.phone, style = Type.title, color = p.textPrimary)
                Spacer(Modifier.width(Space.sm))
                if (installed) Chip("Installed", inverted = true)
                Spacer(Modifier.weight(1f))
                Text(About.date(r.date).uppercase(), style = Type.caption, color = p.textTertiary)
            }
            Spacer(Modifier.height(Space.xs))
            Text(r.title, style = Type.body.copy(fontWeight = FontWeight.SemiBold), color = p.textPrimary)
            Spacer(Modifier.height(Space.xs))
            Text(r.summary, style = Type.bodySmall, color = p.textSecondary)
            Notes("ON THIS PHONE", r.phoneNotes)
            Notes("ON THE MAC · TWINGLASS ${r.mac}", r.macNotes)
        }
    }
}

@Composable
private fun Notes(title: String, lines: List<String>) {
    if (lines.isEmpty()) return
    val p = LocalPalette.current
    Spacer(Modifier.height(Space.md))
    Text(title, style = Type.caption, color = p.textTertiary)
    Spacer(Modifier.height(Space.xs))
    lines.forEach { l ->
        Row(Modifier.padding(vertical = 3.dp)) {
            Spacer(Modifier.padding(top = 8.dp).size(5.dp).clip(CircleShape).background(p.accent))
            Spacer(Modifier.width(Space.sm))
            Text(l, style = Type.bodySmall, color = p.textPrimary)
        }
    }
}
