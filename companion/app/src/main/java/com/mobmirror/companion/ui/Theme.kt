package com.mobmirror.companion.ui

import androidx.compose.animation.core.spring
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlin.math.PI

// The Twinglass phone app wears the same VS Code look as the Mac app: VS Code's "Dark Modern" and
// "Light Modern" colours (side bar, editor, widgets, borders, text), the system sans at small sizes,
// 2–6 dp corners, one blue accent (#0078D4) for primary actions, toggles, focus and "live", red only
// for errors, and a blue status bar at the bottom like VS Code's.

/** Semantic colour roles. Widgets read these, never raw colours. */
@Immutable
data class Palette(
    val background: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val surfaceHigh: Color,
    val dotGrid: Color,
    val border: Color,
    val borderStrong: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textTertiary: Color,
    val textInverse: Color,
    /** Blue: on / active / live, links. */
    val accent: Color,
    /** Primary buttons and selected items (VS Code button.background) and their text. */
    val primary: Color,
    val onPrimary: Color,
    val error: Color,
    /** The status bar strip at the bottom. */
    val statusBar: Color,
    val disabled: Color,
    val isDark: Boolean,
) {
    companion object {
        val Dark = Palette(
            background = Color(0xFF181818), // sideBar.background
            surface = Color(0xFF1F1F1F), // editor.background
            surfaceRaised = Color(0xFF2B2B2B),
            surfaceHigh = Color(0xFF313131), // input / secondary button
            dotGrid = Color(0xFF222222),
            border = Color(0xFF2B2B2B),
            borderStrong = Color(0xFF3C3C3C),
            textPrimary = Color(0xFFCCCCCC),
            textSecondary = Color(0xFF9D9D9D),
            textTertiary = Color(0xFF6E7681),
            textInverse = Color(0xFF1F1F1F),
            accent = Color(0xFF0078D4),
            primary = Color(0xFF0078D4),
            onPrimary = Color(0xFFFFFFFF),
            error = Color(0xFFF85149),
            statusBar = Color(0xFF0078D4),
            disabled = Color(0xFF3C3C3C),
            isDark = true,
        )
        val Light = Palette(
            background = Color(0xFFF8F8F8),
            surface = Color(0xFFFFFFFF),
            surfaceRaised = Color(0xFFF2F2F2),
            surfaceHigh = Color(0xFFE5E5E5),
            dotGrid = Color(0xFFEDEDED),
            border = Color(0xFFE5E5E5),
            borderStrong = Color(0xFFCECECE),
            textPrimary = Color(0xFF3B3B3B),
            textSecondary = Color(0xFF616161),
            textTertiary = Color(0xFF868686),
            textInverse = Color(0xFFFFFFFF),
            accent = Color(0xFF005FB8),
            primary = Color(0xFF005FB8),
            onPrimary = Color(0xFFFFFFFF),
            error = Color(0xFFC72E0F),
            statusBar = Color(0xFF005FB8),
            disabled = Color(0xFFD4D4D4),
            isDark = false,
        )
    }
}

/** Spacing on a 4 dp grid, radii and sizes (Sparky AppSpacing / AppRadius / SettingsSizes). */
object Space {
    val xs = 4.dp
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 24.dp
    val xxl = 32.dp
    val xxxl = 48.dp
}

object Radius {
    val sm = 2.dp
    val md = 4.dp
    val lg = 6.dp
    val pill = 999.dp

    /** Grouped cells: VS Code-small corners, a hairline gap. */
    val groupOuter = 6.dp
    val groupInner = 2.dp
    val groupGap = 1.dp
}

object Sizes {
    val touch = 56.dp
    val iconCircle = 40.dp
    val icon = 22.dp
    val statusDot = 8.dp
    val meterDot = 6.dp
    val dotGridSpacing = 18.dp
    val dotGridRadius = 1.dp
}

/** The system sans (VS Code's workbench uses the platform UI font); monospace for code-like values. */
object Fonts {
    val body = FontFamily.Default
    val mono = FontFamily.Monospace
}

/** Colour-free text styles (Sparky AppTextStyles). */
object Type {
    val displayLarge = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Light, fontSize = 48.sp, lineHeight = 52.sp, letterSpacing = (-0.5).sp)
    val display = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Light, fontSize = 34.sp, lineHeight = 40.sp)
    val headline = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Normal, fontSize = 26.sp, lineHeight = 32.sp)
    val metric = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.SemiBold, fontSize = 24.sp, lineHeight = 28.sp)
    val title = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Medium, fontSize = 17.sp, lineHeight = 24.sp)
    val body = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Normal, fontSize = 15.sp, lineHeight = 22.sp)
    val bodySmall = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp)
    // Small caps labels: VS Code's pane headers (bold caps, barely spaced).
    val label = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Bold, fontSize = 12.sp, letterSpacing = 0.02.em, lineHeight = 16.sp)
    val caption = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Bold, fontSize = 11.sp, letterSpacing = 0.02.em, lineHeight = 14.sp)
    val button = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Medium, fontSize = 13.sp, letterSpacing = 0.02.em)

    /** Big figures (battery, memory, Hz): bold, tight. */
    val figure = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Light, fontSize = 40.sp, lineHeight = 44.sp, letterSpacing = (-0.5).sp)
}

/**
 * Sparky's motion language (core/motion/springs.dart): damped springs given by their natural
 * period (seconds) and damping ratio, for a unit mass: stiffness = (2π / period)².
 */
object Springs {
    private fun stiffness(period: Float): Float = ((2 * PI / period) * (2 * PI / period)).toFloat()

    /** Quick, barely-bouncing: chips, toggles, small reveals. */
    fun <T> snappy() = spring<T>(dampingRatio = 0.86f, stiffness = stiffness(0.32f))

    /** The signature entrance: a visible overshoot that settles fast. */
    fun <T> pop() = spring<T>(dampingRatio = 0.68f, stiffness = stiffness(0.42f))

    /** Slow and soft: large surfaces. */
    fun <T> gentle() = spring<T>(dampingRatio = 0.92f, stiffness = stiffness(0.6f))
}

val LocalPalette = staticCompositionLocalOf { Palette.Dark }

/** Settings → Reduce motion: entrances appear at once, no springs. */
val LocalReduceMotion = staticCompositionLocalOf { false }

/** Settings → Haptics: a light tick on taps and switches. */
val LocalHaptics = staticCompositionLocalOf { true }

/** VS Code Light / Dark Modern (no wallpaper colours); [mode] System follows the phone's dark mode. */
@Composable
fun TwinglassTheme(mode: com.mobmirror.companion.Prefs.Theme = com.mobmirror.companion.Prefs.Theme.System, content: @Composable () -> Unit) {
    val dark = when (mode) {
        com.mobmirror.companion.Prefs.Theme.System -> isSystemInDarkTheme()
        com.mobmirror.companion.Prefs.Theme.Light -> false
        com.mobmirror.companion.Prefs.Theme.Dark -> true
    }
    val p = if (dark) Palette.Dark else Palette.Light
    val scheme = if (p.isDark) {
        darkColorScheme(
            primary = p.primary, onPrimary = p.onPrimary, background = p.background, onBackground = p.textPrimary,
            surface = p.surface, onSurface = p.textPrimary, surfaceVariant = p.surfaceRaised, onSurfaceVariant = p.textSecondary,
            outline = p.borderStrong, outlineVariant = p.border, error = p.error, inverseSurface = p.textPrimary, inverseOnSurface = p.textInverse,
        )
    } else {
        lightColorScheme(
            primary = p.primary, onPrimary = p.onPrimary, background = p.background, onBackground = p.textPrimary,
            surface = p.surface, onSurface = p.textPrimary, surfaceVariant = p.surfaceRaised, onSurfaceVariant = p.textSecondary,
            outline = p.borderStrong, outlineVariant = p.border, error = p.error, inverseSurface = p.textPrimary, inverseOnSurface = p.textInverse,
        )
    }
    CompositionLocalProvider(LocalPalette provides p) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
