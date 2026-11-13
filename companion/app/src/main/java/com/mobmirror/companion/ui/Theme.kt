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
import androidx.compose.ui.unit.sp
import kotlin.math.PI

// The Twinglass phone app wears VS Code's modernized look (2026): the "Dark 2026" and "Light 2026"
// theme colours (microsoft/vscode extensions/theme-defaults/themes/2026-*.json) laid out with the
// grammar of VS Code's own phone layout (src/vs/sessions/browser/mobile/media/mobileWorkbench.css):
// surfaces layered by tint instead of borders, 44 dp targets and 56 dp rows, the phone corner ramp
// (6 / 10 / 12 / 16 / 20), sentence-case labels (no all caps), and a quiet status bar.
// See docs/FACTS.md → "VS Code modernized UI (2026)".

/** Semantic colour roles. Widgets read these, never raw colours. */
@Immutable
data class Palette(
    /** The page (agents.background). */
    val background: Color,
    /** Cards and grouped cells (agentsPanel.background). */
    val surface: Color,
    /** Widgets, sheets' inner fields (editorWidget / chat input). */
    val surfaceRaised: Color,
    /** Control fills: icon tiles, secondary buttons (checkbox.background / button.secondaryBackground). */
    val surfaceHigh: Color,
    val dotGrid: Color,
    val border: Color,
    val borderStrong: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textTertiary: Color,
    val textInverse: Color,
    /** Links, on / live states (textLink.foreground). */
    val accent: Color,
    /** Primary buttons (button.background) and their text. */
    val primary: Color,
    val onPrimary: Color,
    val error: Color,
    /** The status bar strip at the bottom: the page colour with a hairline, like VS Code 2026. */
    val statusBar: Color,
    val statusBarText: Color,
    /** The active item's tinted square (modern activity bar / list selection). */
    val selection: Color,
    val disabled: Color,
    val isDark: Boolean,
) {
    companion object {
        val Dark = Palette(
            background = Color(0xFF121314),
            surface = Color(0xFF191A1B),
            surfaceRaised = Color(0xFF202122),
            surfaceHigh = Color(0xFF242526),
            dotGrid = Color(0xFF1C1D1E),
            border = Color(0xFF2A2B2C),
            borderStrong = Color(0xFF333536),
            textPrimary = Color(0xFFBFBFBF),
            textSecondary = Color(0xFF8C8C8C),
            textTertiary = Color(0xFF707070),
            textInverse = Color(0xFF121314),
            accent = Color(0xFF48A0C7),
            primary = Color(0xFF297AA0),
            onPrimary = Color(0xFFFFFFFF),
            error = Color(0xFFF48771),
            statusBar = Color(0xFF191A1B),
            statusBarText = Color(0xFF8C8C8C),
            selection = Color(0x22FFFFFF),
            disabled = Color(0xFF555555),
            isDark = true,
        )
        val Light = Palette(
            background = Color(0xFFFAFAFD),
            surface = Color(0xFFFFFFFF),
            surfaceRaised = Color(0xFFF7F7FA),
            surfaceHigh = Color(0xFFEAEAEA),
            dotGrid = Color(0xFFF0F1F2),
            border = Color(0xFFE4E5E6),
            borderStrong = Color(0xFFD8D8D8),
            textPrimary = Color(0xFF202020),
            textSecondary = Color(0xFF606060),
            textTertiary = Color(0xFF868686),
            textInverse = Color(0xFFFFFFFF),
            accent = Color(0xFF0069CC),
            primary = Color(0xFF0069CC),
            onPrimary = Color(0xFFFFFFFF),
            error = Color(0xFFAD0707),
            statusBar = Color(0xFFFAFAFD),
            statusBarText = Color(0xFF606060),
            selection = Color(0x14000000),
            disabled = Color(0xFFBBBBBB),
            isDark = false,
        )
    }
}

/** Spacing on a 4 dp grid. */
object Space {
    val xs = 4.dp
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 24.dp
    val xxl = 32.dp
    val xxxl = 48.dp
}

/** VS Code's phone corner ramp (cornerRadius-xSmall … xLarge). */
object Radius {
    val sm = 6.dp
    val md = 10.dp
    val lg = 16.dp
    val xl = 20.dp
    val pill = 999.dp

    /** Grouped cells: the run is one rounded surface, cells split by a hairline gap. */
    val groupOuter = 16.dp
    val groupInner = 6.dp
    val groupGap = 2.dp
}

object Sizes {
    /** A list row (--mobile-row). */
    val touch = 56.dp
    /** The smallest tap target (--mobile-target). */
    val target = 44.dp
    /** A round control's visual inside its 44 dp target (--mobile-control). */
    val iconCircle = 36.dp
    val icon = 20.dp
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

/** Colour-free text styles on VS Code's phone type scale (heading 28 / 20 / 17, body 16 / 15, label 13 / 12). */
object Type {
    val displayLarge = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.SemiBold, fontSize = 40.sp, lineHeight = 46.sp, letterSpacing = (-0.5).sp)
    val display = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.SemiBold, fontSize = 30.sp, lineHeight = 36.sp, letterSpacing = (-0.3).sp)
    val headline = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.SemiBold, fontSize = 28.sp, lineHeight = 34.sp, letterSpacing = (-0.2).sp)
    val metric = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.SemiBold, fontSize = 20.sp, lineHeight = 26.sp)
    val title = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.SemiBold, fontSize = 17.sp, lineHeight = 24.sp)
    val body = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp)
    val bodySmall = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp)
    /** Section and pane headers: sentence case, semibold (modern VS Code dropped all-caps labels). */
    val label = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, lineHeight = 18.sp)
    val caption = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp)
    val button = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 20.sp)

    /** Big figures (battery, memory, Hz). */
    val figure = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.SemiBold, fontSize = 36.sp, lineHeight = 40.sp, letterSpacing = (-0.5).sp)
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

/** VS Code Light / Dark 2026 (no wallpaper colours); [mode] System follows the phone's dark mode. */
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
