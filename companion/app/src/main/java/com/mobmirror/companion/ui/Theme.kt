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
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.mobmirror.companion.R
import kotlin.math.PI

// The Twinglass phone app shares Sparky's visual language (agent-worker/frontend/lib/core):
// monochrome surfaces (true black / warm off-white), one red accent kept for "on / active / live",
// Space Grotesk for all text (one typeface, by the user's choice), a 4 dp grid, Android 16 grouped cells, dot-grid textures and damped-spring motion.

/** Raw ramp (Sparky AppColors). Widgets read [Palette] roles, never these. */
private object Ramp {
    val black = Color(0xFF000000)
    val white = Color(0xFFFFFFFF)
    val red = Color(0xFFD71921)
}

/** Semantic colour roles (Sparky AppPalette). */
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
    val accent: Color,
    val disabled: Color,
    val isDark: Boolean,
) {
    companion object {
        val Dark = Palette(
            background = Ramp.black,
            surface = Color(0xFF0A0A0A),
            surfaceRaised = Color(0xFF141414),
            surfaceHigh = Color(0xFF1F1F1F),
            dotGrid = Color(0xFF1C1C1C),
            border = Color(0xFF2A2A2A),
            borderStrong = Color(0xFF3D3D3D),
            textPrimary = Ramp.white,
            textSecondary = Color(0xFF999999),
            textTertiary = Color(0xFF5C5C5C),
            textInverse = Ramp.black,
            accent = Ramp.red,
            disabled = Color(0xFF333333),
            isDark = true,
        )
        val Light = Palette(
            background = Color(0xFFF4F4F2),
            surface = Ramp.white,
            surfaceRaised = Color(0xFFEBEBE8),
            surfaceHigh = Color(0xFFDDDDD9),
            dotGrid = Color(0xFFE2E2DE),
            border = Color(0xFFD6D6D2),
            borderStrong = Color(0xFFA8A8A3),
            textPrimary = Color(0xFF0A0A0A),
            textSecondary = Color(0xFF5E5E5A),
            textTertiary = Color(0xFF8E8E89),
            textInverse = Ramp.white,
            accent = Ramp.red,
            disabled = Color(0xFFD0D0CC),
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
    val sm = 4.dp
    val md = 12.dp
    val lg = 20.dp
    val pill = 999.dp

    /** Android 16 grouped cells: big outer corners, small inner ones, a thin gap. */
    val groupOuter = 28.dp
    val groupInner = 6.dp
    val groupGap = 2.dp
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

@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
private fun grotesk(weight: Int) =
    Font(R.font.space_grotesk, FontWeight(weight), variationSettings = FontVariation.Settings(FontVariation.weight(weight)))

/** One typeface throughout (the user's choice, 2026-11-08: "use normal font only"). */
object Fonts {
    val body = FontFamily(grotesk(300), grotesk(400), grotesk(500), grotesk(600), grotesk(700))
}

/** Colour-free text styles (Sparky AppTextStyles). */
object Type {
    val displayLarge = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Bold, fontSize = 56.sp, lineHeight = 56.sp, letterSpacing = (-1).sp)
    val display = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Bold, fontSize = 40.sp, lineHeight = 40.sp, letterSpacing = (-0.5).sp)
    val headline = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Bold, fontSize = 28.sp, lineHeight = 31.sp)
    val metric = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.SemiBold, fontSize = 24.sp, lineHeight = 28.sp)
    val title = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Medium, fontSize = 20.sp, lineHeight = 26.sp)
    val body = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp)
    val bodySmall = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp)
    // Small caps labels: same face, medium weight, letter-spaced.
    val label = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Medium, fontSize = 12.sp, letterSpacing = 0.08.em, lineHeight = 16.sp)
    val caption = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Medium, fontSize = 11.sp, letterSpacing = 0.08.em, lineHeight = 14.sp)
    val button = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Bold, fontSize = 12.sp, letterSpacing = 0.1.em)

    /** Big figures (battery, memory, Hz): bold, tight. */
    val figure = TextStyle(fontFamily = Fonts.body, fontWeight = FontWeight.Bold, fontSize = 44.sp, lineHeight = 44.sp, letterSpacing = (-1).sp)
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

/** Sparky's palettes (no wallpaper colours); [mode] System follows the phone's dark mode. */
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
            primary = p.textPrimary, onPrimary = p.textInverse, background = p.background, onBackground = p.textPrimary,
            surface = p.surface, onSurface = p.textPrimary, surfaceVariant = p.surfaceRaised, onSurfaceVariant = p.textSecondary,
            outline = p.borderStrong, outlineVariant = p.border, error = p.accent, inverseSurface = p.textPrimary, inverseOnSurface = p.textInverse,
        )
    } else {
        lightColorScheme(
            primary = p.textPrimary, onPrimary = p.textInverse, background = p.background, onBackground = p.textPrimary,
            surface = p.surface, onSurface = p.textPrimary, surfaceVariant = p.surfaceRaised, onSurfaceVariant = p.textSecondary,
            outline = p.borderStrong, outlineVariant = p.border, error = p.accent, inverseSurface = p.textPrimary, inverseOnSurface = p.textInverse,
        )
    }
    CompositionLocalProvider(LocalPalette provides p) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}
