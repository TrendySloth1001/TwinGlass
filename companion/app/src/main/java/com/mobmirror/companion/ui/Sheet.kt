package com.mobmirror.companion.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * The app's bottom sheet: 28 dp corners, a handle, an icon badge, title and explanation, then
 * the sheet's own content and actions. Used to ask for one thing at a time, when it's needed.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TwinglassSheet(onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    val p = LocalPalette.current
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = RoundedCornerShape(topStart = Radius.groupOuter, topEnd = Radius.groupOuter),
        containerColor = p.surface,
        contentColor = p.textPrimary,
        dragHandle = { Box(Modifier.padding(top = Space.md).size(36.dp, 4.dp).clip(RoundedCornerShape(Radius.pill)).background(p.borderStrong)) },
    ) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = Space.xl, end = Space.xl, top = Space.lg, bottom = Space.xl), content = content)
    }
}

/** Sheet header: icon badge, title, explanation. */
@Composable
fun SheetHeader(icon: ImageVector, title: String, body: String, accent: Boolean = false) {
    val p = LocalPalette.current
    Box(Modifier.size(56.dp).clip(CircleShape).background(if (accent) p.accent else p.surfaceHigh), contentAlignment = Alignment.Center) {
        Icon(icon, null, Modifier.size(28.dp), tint = if (accent) Color.White else p.textPrimary)
    }
    Spacer(Modifier.height(Space.lg))
    Text(title, style = Type.headline, color = p.textPrimary)
    Spacer(Modifier.height(Space.sm))
    Text(body, style = Type.body, color = p.textSecondary)
    Spacer(Modifier.height(Space.xl))
}

/** "What you get" bullet with a check. */
@Composable
fun Benefit(text: String) {
    val p = LocalPalette.current
    Row(Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.Top) {
        Box(Modifier.padding(top = 7.dp).size(6.dp).clip(CircleShape).background(p.accent))
        Spacer(Modifier.width(Space.md))
        Text(text, style = Type.bodySmall, color = p.textPrimary)
    }
}

/** Big pill button. primary = inverted surface; quiet = text only. */
@Composable
fun PillButton(text: String, modifier: Modifier = Modifier, primary: Boolean = true, enabled: Boolean = true, onClick: () -> Unit) {
    val p = LocalPalette.current
    val tick = rememberTick()
    Box(
        modifier
            .fillMaxWidth()
            .height(44.dp)
            .clip(RoundedCornerShape(Radius.sm))
            .background(if (primary) (if (enabled) p.primary else p.disabled) else p.surfaceHigh)
            .clickable(enabled = enabled) { tick(); onClick() },
        contentAlignment = Alignment.Center,
    ) { Text(text, style = Type.title.copy(fontSize = Type.body.fontSize), color = if (primary) p.onPrimary else p.textPrimary, textAlign = TextAlign.Center) }
}

/** Primary + secondary actions stacked (thumb-friendly). */
@Composable
fun SheetActions(primary: String, onPrimary: () -> Unit, secondary: String? = null, onSecondary: () -> Unit = {}, primaryEnabled: Boolean = true) {
    Column(verticalArrangement = Arrangement.spacedBy(Space.sm)) {
        PillButton(primary, enabled = primaryEnabled, onClick = onPrimary)
        if (secondary != null) PillButton(secondary, primary = false, onClick = onSecondary)
    }
}
