package com.mobmirror.companion

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.mobmirror.companion.ui.DotMeter
import com.mobmirror.companion.ui.LocalPalette
import com.mobmirror.companion.ui.Radius
import com.mobmirror.companion.ui.Space
import com.mobmirror.companion.ui.SpringIn
import com.mobmirror.companion.ui.StatusDot
import com.mobmirror.companion.ui.TwinglassTheme
import com.mobmirror.companion.ui.Type
import kotlin.concurrent.thread

/**
 * "Send to Mac" in every app's share sheet: text and links go onto the Mac's clipboard; photos,
 * videos and files are streamed into ~/Downloads/Twinglass on the Mac. Shows a small card with
 * progress over the app you shared from, then closes.
 */
class ShareActivity : ComponentActivity() {
    private sealed interface State {
        data class Confirm(val count: Int, val bytes: Long) : State
        data class Sending(val label: String, val sent: Long, val total: Long) : State
        data class Done(val message: String) : State
        data class Failed(val message: String) : State
    }

    private var state by mutableStateOf<State>(State.Sending("", 0, -1))
    private val main = Handler(Looper.getMainLooper())

    private data class Item(val uri: Uri, val name: String, val size: Long)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TwinglassTheme(Prefs.theme(this)) { Sheet() }
        }
        if (savedInstanceState == null) start()
    }

    @Suppress("DEPRECATION")
    private fun items(): List<Item> {
        val uris: List<Uri> = when (intent.action) {
            Intent.ACTION_SEND -> listOfNotNull(
                if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableExtra(Intent.EXTRA_STREAM),
            )
            Intent.ACTION_SEND_MULTIPLE -> (
                if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
                ).orEmpty()
            else -> emptyList()
        }
        return uris.map { u ->
            var name = u.lastPathSegment?.substringAfterLast('/') ?: "file"
            var size = -1L
            runCatching {
                contentResolver.query(u, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                    if (c.moveToFirst()) {
                        c.getString(0)?.let { name = it }
                        if (!c.isNull(1)) size = c.getLong(1)
                    }
                }
            }
            Item(u, name, size)
        }
    }

    private fun start() {
        if (!Link.paired(this)) return fail("Not paired with a Mac yet. Connect this phone to your Mac with Twinglass open.")
        val files = items()
        if (files.isEmpty()) {
            val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()
            if (text.isNullOrBlank()) return fail("Nothing to send.")
            state = State.Sending("Text", 0, -1)
            thread {
                val ok = Link.sendText(this, text, Prefs.shareNotifyMac(this))
                main.post { if (ok) done("On your Mac’s clipboard") else unreachable() }
            }
            return
        }
        val total = files.sumOf { it.size.coerceAtLeast(0) }
        val limit = Prefs.shareConfirmMb(this) * 1024L * 1024L
        if (limit > 0 && total > limit) state = State.Confirm(files.size, total) else send(files)
    }

    private fun send(files: List<Item>) {
        val total = files.sumOf { it.size.coerceAtLeast(0) }.takeIf { files.all { f -> f.size >= 0 } } ?: -1
        thread {
            var base = 0L
            for ((i, f) in files.withIndex()) {
                val label = if (files.size > 1) "${f.name} (${i + 1}/${files.size})" else f.name
                main.post { state = State.Sending(label, base, total) }
                val ok = runCatching {
                    contentResolver.openInputStream(f.uri)!!.let { input ->
                        Link.sendFile(this, sendName(f.name), input, f.size, Prefs.shareNotifyMac(this)) { sent -> main.post { state = State.Sending(label, base + sent, total) } }
                    }
                }.getOrDefault(false)
                if (!ok) {
                    main.post { unreachable() }
                    return@thread
                }
                base += f.size.coerceAtLeast(0)
            }
            main.post { done(if (files.size == 1) "Saved to Downloads/Twinglass on your Mac" else "${files.size} files saved to Downloads/Twinglass") }
        }
    }

    /** Settings → Share to Mac → "Add the date to file names": "2026-11-08 11.30 photo.jpg". */
    private fun sendName(name: String): String =
        if (Prefs.shareDatePrefix(this)) java.text.SimpleDateFormat("yyyy-MM-dd HH.mm", java.util.Locale.US).format(java.util.Date()) + " " + name else name

    private fun done(message: String) {
        state = State.Done(message)
        if (Prefs.shareAutoClose(this)) main.postDelayed({ finish() }, 1400)
    }

    private fun unreachable() = fail("Can’t reach ${Link.macName(this)}. Connect by USB or wireless debugging and open Twinglass on the Mac.")

    private fun fail(message: String) {
        state = State.Failed(message)
    }

    @androidx.compose.runtime.Composable
    private fun Sheet() {
        val p = LocalPalette.current
        val tap = remember { MutableInteractionSource() }
        Box(
            Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.35f)).clickable(tap, null) { if (state !is State.Sending) finish() },
            contentAlignment = Alignment.BottomCenter,
        ) {
            SpringIn {
                Column(
                    Modifier
                        .navigationBarsPadding()
                        .padding(Space.lg)
                        .fillMaxWidth()
                        .background(p.surface, RoundedCornerShape(Radius.groupOuter))
                        .border(1.dp, p.border, RoundedCornerShape(Radius.groupOuter))
                        .clickable(remember { MutableInteractionSource() }, null) {}
                        .padding(Space.xl),
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        val s = state
                        StatusDot(if (s is State.Failed) p.textTertiary else p.accent, live = s is State.Sending)
                        Spacer(Modifier.width(Space.sm))
                        Text(
                            when (s) {
                                is State.Confirm -> "SEND TO ${Link.macName(this@ShareActivity).uppercase()}?"
                                is State.Sending -> "SENDING TO ${Link.macName(this@ShareActivity).uppercase()}"
                                is State.Done -> "SENT"
                                is State.Failed -> "NOT SENT"
                            },
                            style = Type.caption,
                            color = p.textSecondary,
                        )
                    }
                    Spacer(Modifier.height(Space.md))
                    when (val s = state) {
                        is State.Confirm -> {
                            Text("${s.count} file${if (s.count == 1) "" else "s"}, ${"%.0f".format(s.bytes / 1048576.0)} MB", style = Type.title, color = p.textPrimary)
                            Spacer(Modifier.height(Space.lg))
                            Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) {
                                PillButton("Send", primary = true) { send(items()) }
                                PillButton("Cancel") { finish() }
                            }
                        }
                        is State.Sending -> {
                            Text(s.label.ifEmpty { "…" }, style = Type.title, color = p.textPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Spacer(Modifier.height(Space.lg))
                            if (s.total > 0) {
                                DotMeter(s.sent.toFloat() / s.total, count = 24)
                                Spacer(Modifier.height(Space.sm))
                                Text("${"%.1f".format(s.sent / 1048576.0)} / ${"%.1f".format(s.total / 1048576.0)} MB", style = Type.caption, color = p.textTertiary)
                            } else Text("${"%.1f".format(s.sent / 1048576.0)} MB", style = Type.caption, color = p.textTertiary)
                        }
                        is State.Done -> Text(s.message, style = Type.title, color = p.textPrimary)
                        is State.Failed -> {
                            Text(s.message, style = Type.body, color = p.textPrimary)
                            Spacer(Modifier.height(Space.lg))
                            PillButton("Close") { finish() }
                        }
                    }
                }
            }
        }
    }

    @androidx.compose.runtime.Composable
    private fun PillButton(text: String, primary: Boolean = false, onClick: () -> Unit) {
        val p = LocalPalette.current
        Box(
            Modifier
                .background(if (primary) p.textPrimary else Color.Transparent, RoundedCornerShape(Radius.pill))
                .border(1.dp, if (primary) p.textPrimary else p.borderStrong, RoundedCornerShape(Radius.pill))
                .clickable(onClick = onClick)
                .padding(horizontal = Space.xl, vertical = Space.md),
        ) { Text(text.uppercase(), style = Type.button, color = if (primary) p.textInverse else p.textPrimary) }
    }
}
