package com.mobmirror.companion.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp

/** Sparky's flat switch: 40×22 pill, strong border when off, red fill when on, 14 dp knob. */
@Composable
fun Toggle(checked: Boolean, onChange: (Boolean) -> Unit) {
    val p = LocalPalette.current
    val tick = rememberTick()
    val x by animateDpAsState(if (checked) 18.dp else 0.dp, Springs.snappy(), label = "knob")
    val fill by animateColorAsState(if (checked) p.accent else Color.Transparent, label = "fill")
    Box(
        Modifier
            .size(40.dp, 22.dp)
            .clip(RoundedCornerShape(Radius.pill))
            .background(fill)
            .border(1.dp, if (checked) p.accent else p.borderStrong, RoundedCornerShape(Radius.pill))
            .clickable(role = Role.Switch) { tick(); onChange(!checked) }
            .padding(horizontal = 3.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(Modifier.offset(x = x).size(14.dp).clip(CircleShape).background(if (checked) Color.White else p.textSecondary))
    }
}

/** Flat segmented control: thin border, selected segment inverted (Sparky Segmented). */
@Composable
fun <T> Segmented(value: T, options: List<Pair<T, String>>, onChange: (T) -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    val tick = rememberTick()
    Row(
        modifier.height(32.dp).clip(RoundedCornerShape(Radius.md)).border(1.dp, p.borderStrong, RoundedCornerShape(Radius.md)).padding(2.dp),
    ) {
        options.forEach { (v, label) ->
            val on = v == value
            val bg by animateColorAsState(if (on) p.primary else Color.Transparent, label = "seg")
            Box(
                Modifier.weight(1f).height(28.dp).clip(RoundedCornerShape(Radius.sm)).background(bg).clickable { if (!on) { tick(); onChange(v) } },
                contentAlignment = Alignment.Center,
            ) { Text(label, style = Type.bodySmall, color = if (on) p.onPrimary else p.textSecondary, maxLines = 1) }
        }
    }
}

/** Pill search field. */
@Composable
fun SearchField(value: String, onChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    Row(
        modifier.fillMaxWidth().height(40.dp).clip(RoundedCornerShape(Radius.sm)).background(p.surfaceHigh).border(1.dp, p.borderStrong, RoundedCornerShape(Radius.sm)).padding(horizontal = Space.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Rounded.Search, null, Modifier.size(20.dp), tint = p.textSecondary)
        Spacer(Modifier.width(Space.md))
        Box(Modifier.weight(1f)) {
            if (value.isEmpty()) Text(placeholder, style = Type.body, color = p.textTertiary)
            BasicTextField(value, onChange, singleLine = true, textStyle = Type.body.copy(color = p.textPrimary), cursorBrush = SolidColor(p.accent), modifier = Modifier.fillMaxWidth())
        }
    }
}

/** Page title: optional back button, big title, mono caption, trailing actions. */
@Composable
fun PageHeader(title: String, caption: String? = null, onBack: (() -> Unit)? = null, actions: @Composable () -> Unit = {}) {
    val p = LocalPalette.current
    Column(Modifier.fillMaxWidth().padding(bottom = Space.xl)) {
        if (onBack != null) {
            RoundIconButton(Icons.AutoMirrored.Rounded.ArrowBack, "Back", onBack)
            Spacer(Modifier.height(Space.lg))
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(title, style = Type.headline, color = p.textPrimary)
                if (caption != null) Text(caption.uppercase(), style = Type.caption, color = p.textTertiary)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(Space.sm)) { actions() }
        }
    }
}

data class NavItem<T>(val value: T, val label: String, val icon: ImageVector)

/**
 * VS Code-style bottom of the app: a row of tabs (the active one marked by a blue bar on top, like
 * VS Code's activity bar and editor tabs), then the blue status bar with the link state on the left,
 * VS Code's remote indicator. It runs under the system navigation bar ([bottomInset]).
 */
@Composable
fun <T> WorkbenchBar(
    items: List<NavItem<T>>,
    selected: T,
    onSelect: (T) -> Unit,
    status: String,
    statusIcon: ImageVector,
    bottomInset: androidx.compose.ui.unit.Dp,
    modifier: Modifier = Modifier,
) {
    val p = LocalPalette.current
    val tick = rememberTick()
    Column(modifier.fillMaxWidth().background(p.background)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.border))
        Row(Modifier.fillMaxWidth().height(52.dp)) {
            items.forEach { item ->
                val on = item.value == selected
                val fg by animateColorAsState(if (on) p.textPrimary else p.textTertiary, label = "tab")
                Box(
                    Modifier.weight(1f).fillMaxHeight().clickable(role = Role.Tab) { tick(); onSelect(item.value) },
                    contentAlignment = Alignment.Center,
                ) {
                    if (on) Box(Modifier.align(Alignment.TopCenter).fillMaxWidth(0.5f).height(2.dp).background(p.accent))
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(item.icon, item.label, Modifier.size(22.dp), tint = fg)
                        Text(item.label, style = Type.caption.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.Normal), color = fg, maxLines = 1)
                    }
                }
            }
        }
        Row(
            Modifier.fillMaxWidth().background(p.statusBar).padding(bottom = bottomInset).height(24.dp).padding(horizontal = Space.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(statusIcon, null, Modifier.size(14.dp), tint = Color.White)
            Spacer(Modifier.width(6.dp))
            Text(status, style = Type.bodySmall.copy(fontSize = androidx.compose.ui.unit.TextUnit(12f, androidx.compose.ui.unit.TextUnitType.Sp)), color = Color.White, maxLines = 1)
        }
    }
}

/** Floating pill navigation bar: solid surface, selected item inverted with its label. */
@Composable
fun <T> FloatingNav(items: List<NavItem<T>>, selected: T, onSelect: (T) -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    val tick = rememberTick()
    Row(
        modifier
            .clip(RoundedCornerShape(Radius.pill))
            .background(p.surfaceRaised)
            .border(1.dp, p.border, RoundedCornerShape(Radius.pill))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        items.forEach { item ->
            val on = item.value == selected
            val bg by animateColorAsState(if (on) p.textPrimary else Color.Transparent, label = "nav")
            Row(
                Modifier.height(44.dp).clip(RoundedCornerShape(Radius.pill)).background(bg).clickable { tick(); onSelect(item.value) }.padding(horizontal = if (on) Space.lg else Space.md),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(item.icon, item.label, Modifier.size(20.dp), tint = if (on) p.textInverse else p.textSecondary)
                if (on) {
                    Spacer(Modifier.width(Space.sm))
                    Text(item.label.uppercase(), style = Type.caption, color = p.textInverse)
                }
            }
        }
    }
}
