package com.mobmirror.companion.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.min

/** A light haptic tick when Settings → Haptics is on. */
@Composable
fun rememberTick(): () -> Unit {
    val on = LocalHaptics.current
    val h = androidx.compose.ui.platform.LocalHapticFeedback.current
    return { if (on) h.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.TextHandleMove) }
}

/** Nothing-style dot matrix filling the background (Sparky DotGridBackground). */
fun Modifier.dotGrid(color: Color, spacing: Dp = Sizes.dotGridSpacing, radius: Dp = Sizes.dotGridRadius): Modifier = drawBehind {
    val step = spacing.toPx()
    val r = radius.toPx()
    var y = step / 2
    while (y < size.height) {
        var x = step / 2
        while (x < size.width) {
            drawCircle(color, r, Offset(x, y))
            x += step
        }
        y += step
    }
}

/** A square dot lattice fading towards its edges (Sparky settings DotGrid): hero texture. */
@Composable
fun DotField(modifier: Modifier = Modifier, color: Color = LocalPalette.current.textTertiary, spacing: Dp = 8.dp) {
    Canvas(modifier) {
        val step = spacing.toPx()
        val cx = size.width / 2
        val cy = size.height / 2
        val reach = min(size.width, size.height) / 2
        val cols = floor(size.width / step).toInt()
        val rows = floor(size.height / step).toInt()
        val ix = (size.width - (cols - 1) * step) / 2
        val iy = (size.height - (rows - 1) * step) / 2
        for (j in 0 until rows) for (i in 0 until cols) {
            val x = ix + i * step
            val y = iy + j * step
            val t = (hypot(x - cx, y - cy) / reach).coerceIn(0f, 1f)
            val a = (1 - t * t) * 0.55f
            if (a > 0.02f) drawCircle(color.copy(alpha = a), 1.2.dp.toPx(), Offset(x, y))
        }
    }
}

/** Mono caps caption followed by a hairline (Sparky SectionHeader). */
@Composable
fun SectionHeader(title: String, modifier: Modifier = Modifier, trailing: (@Composable () -> Unit)? = null) {
    val p = LocalPalette.current
    Row(modifier.fillMaxWidth().padding(top = Space.xl, bottom = Space.md), verticalAlignment = Alignment.CenterVertically) {
        Text(title.uppercase(), style = Type.caption, color = p.textTertiary)
        Spacer(Modifier.width(Space.md))
        Box(Modifier.weight(1f).height(1.dp).background(p.border))
        if (trailing != null) {
            Spacer(Modifier.width(Space.md))
            trailing()
        }
    }
}

/** Row of dots; [fraction] of them lit (Sparky DotMeter). */
@Composable
fun DotMeter(fraction: Float, modifier: Modifier = Modifier, count: Int = 20, lit: Color = LocalPalette.current.accent) {
    val p = LocalPalette.current
    val shown by animateFloatAsState(fraction.coerceIn(0f, 1f), Springs.gentle(), label = "meter")
    val on = (shown * count).toInt()
    Row(modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        repeat(count) { i ->
            Box(Modifier.size(Sizes.meterDot).clip(CircleShape).background(if (i < on) lit else p.border))
        }
    }
}

/** Status dot; [live] pulses softly (the accent "on air" dot). */
@Composable
fun StatusDot(color: Color, live: Boolean = false) {
    val pulse = if (live) {
        val t = rememberInfiniteTransition(label = "pulse")
        t.animateFloat(1f, 0.35f, infiniteRepeatable(tween(900), RepeatMode.Reverse), label = "a").value
    } else 1f
    Box(Modifier.size(Sizes.statusDot).graphicsLayer { alpha = pulse }.clip(CircleShape).background(color))
}

/** Pill chip: thin strong border, mono caps (Sparky chips / segmented look). */
@Composable
fun Chip(text: String, modifier: Modifier = Modifier, leading: (@Composable () -> Unit)? = null, inverted: Boolean = false) {
    val p = LocalPalette.current
    Row(
        modifier
            .clip(RoundedCornerShape(Radius.pill))
            .background(if (inverted) p.textPrimary else Color.Transparent)
            .border(1.dp, if (inverted) p.textPrimary else p.borderStrong, RoundedCornerShape(Radius.pill))
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (leading != null) {
            leading()
            Spacer(Modifier.width(6.dp))
        }
        Text(text.uppercase(), style = Type.caption, color = if (inverted) p.textInverse else p.textSecondary, maxLines = 1)
    }
}

/** Round, bordered icon button (Sparky top-bar buttons). */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun RoundIconButton(icon: ImageVector, description: String, onClick: () -> Unit) {
    val p = LocalPalette.current
    Box(
        Modifier.size(40.dp).clip(CircleShape).border(1.dp, p.border, CircleShape).combinedClickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, description, Modifier.size(20.dp), tint = p.textPrimary) }
}

/** Tonal icon circle used at the start of grouped cells. */
@Composable
fun IconCircle(icon: ImageVector, tint: Color = LocalPalette.current.textPrimary) {
    val p = LocalPalette.current
    Box(Modifier.size(Sizes.iconCircle).clip(CircleShape).background(p.surfaceHigh), contentAlignment = Alignment.Center) {
        Icon(icon, null, Modifier.size(Sizes.icon), tint = tint)
    }
}

/** One cell of a [Grouped] run: index + total decide its corners. */
data class CellPosition(val index: Int, val total: Int)

private fun cellShape(pos: CellPosition): RoundedCornerShape {
    val top = if (pos.index == 0) Radius.groupOuter else Radius.groupInner
    val bottom = if (pos.index == pos.total - 1) Radius.groupOuter else Radius.groupInner
    return RoundedCornerShape(topStart = top, topEnd = top, bottomStart = bottom, bottomEnd = bottom)
}

/** Android 16 grouped container: cells with big outer / small inner radii and a thin gap. */
@Composable
fun Grouped(count: Int, modifier: Modifier = Modifier, cell: @Composable ColumnScope.(CellPosition) -> Unit) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(Radius.groupGap)) {
        repeat(count) { cell(CellPosition(it, count)) }
    }
}

/** A grouped cell surface. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun Cell(
    pos: CellPosition,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    onLongClick: (() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val p = LocalPalette.current
    val shape = cellShape(pos)
    val tick = rememberTick()
    Column(
        modifier
            .fillMaxWidth()
            .defaultMinSize(minHeight = Sizes.touch)
            .clip(shape)
            .background(p.surface)
            .then(
                if (onClick != null || onLongClick != null) {
                    Modifier.combinedClickable(onClick = { tick(); onClick?.invoke() }, onLongClick = onLongClick?.let { l -> { tick(); l() } })
                } else Modifier,
            ),
        content = content,
    )
}

/** Cell row: tonal icon, title + subtitle, trailing slot. */
@Composable
fun CellRow(title: String, subtitle: String? = null, icon: ImageVector? = null, trailing: (@Composable () -> Unit)? = null) {
    val p = LocalPalette.current
    Row(Modifier.fillMaxWidth().padding(horizontal = Space.lg, vertical = Space.md), verticalAlignment = Alignment.CenterVertically) {
        if (icon != null) {
            IconCircle(icon)
            Spacer(Modifier.width(Space.lg))
        }
        Column(Modifier.weight(1f)) {
            Text(title, style = Type.body, color = p.textPrimary, maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (subtitle != null) Text(subtitle, style = Type.bodySmall, color = p.textSecondary, maxLines = 3)
        }
        if (trailing != null) {
            Spacer(Modifier.width(Space.md))
            trailing()
        }
    }
}

/** Expand / collapse chevron that turns on a spring. */
@Composable
fun Chevron(expanded: Boolean, icon: ImageVector) {
    val turn by animateFloatAsState(if (expanded) 180f else 0f, Springs.snappy(), label = "chevron")
    Icon(icon, if (expanded) "Collapse" else "Expand", Modifier.size(20.dp).rotate(turn), tint = LocalPalette.current.textSecondary)
}

/** Expandable body for a cell (spring height + fade). */
@Composable
fun Expandable(visible: Boolean, content: @Composable ColumnScope.() -> Unit) {
    AnimatedVisibility(visible, enter = expandVertically(Springs.snappy()) + fadeIn(), exit = shrinkVertically(Springs.snappy()) + fadeOut()) {
        Column(content = content)
    }
}

/** Card surface: 20 dp corners, hairline border (metric tiles, hero). */
@Composable
fun Tile(modifier: Modifier = Modifier, content: @Composable BoxScope.() -> Unit) {
    val p = LocalPalette.current
    Box(
        modifier.clip(RoundedCornerShape(Radius.lg)).background(p.surface).border(1.dp, p.border, RoundedCornerShape(Radius.lg)).padding(Space.lg),
        content = content,
    )
}

/**
 * Spring entrance (Sparky SpringIn): rises 12% of a step and scales from 0.96 with the "pop"
 * spring, staggered by [index].
 */
@Composable
fun SpringIn(index: Int = 0, content: @Composable () -> Unit) {
    val reduce = LocalReduceMotion.current
    val t = remember { Animatable(if (reduce) 1f else 0f) }
    LaunchedEffect(Unit) {
        if (reduce) return@LaunchedEffect
        kotlinx.coroutines.delay(40L * index)
        t.animateTo(1f, Springs.pop())
    }
    Box(
        Modifier.graphicsLayer {
            val v = t.value
            alpha = v.coerceIn(0f, 1f)
            translationY = (1 - v) * 24.dp.toPx()
            val s = 0.96f + 0.04f * v
            scaleX = s
            scaleY = s
        },
    ) { content() }
}
