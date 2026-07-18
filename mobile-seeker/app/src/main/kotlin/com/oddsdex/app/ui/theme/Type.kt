package com.oddsdex.app.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import com.oddsdex.app.R

/**
 * Brand typography (brand.md): Inter for UI text, JetBrains Mono for
 * numbers — odds, countdowns, amounts, addresses (always tabular).
 * Both bundled as variable fonts (single file, all weights).
 */
@OptIn(ExperimentalTextApi::class)
private fun interAt(weight: FontWeight) = Font(
    R.font.inter_variable,
    weight = weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
)

@OptIn(ExperimentalTextApi::class)
private fun monoAt(weight: FontWeight) = Font(
    R.font.jetbrains_mono_variable,
    weight = weight,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
)

val InterFamily = FontFamily(
    interAt(FontWeight.Normal),
    interAt(FontWeight.Medium),
    interAt(FontWeight.SemiBold),
    interAt(FontWeight.Bold),
)

val JetBrainsMonoFamily = FontFamily(
    monoAt(FontWeight.Normal),
    monoAt(FontWeight.Medium),
    monoAt(FontWeight.SemiBold),
    monoAt(FontWeight.Bold),
)

private val Default = Typography()

/** Material typography with Inter everywhere; mono is applied per-use. */
val OddsdexTypography = Typography(
    displayLarge = Default.displayLarge.copy(fontFamily = InterFamily),
    displayMedium = Default.displayMedium.copy(fontFamily = InterFamily),
    displaySmall = Default.displaySmall.copy(fontFamily = InterFamily),
    headlineLarge = Default.headlineLarge.copy(fontFamily = InterFamily),
    headlineMedium = Default.headlineMedium.copy(fontFamily = InterFamily),
    headlineSmall = Default.headlineSmall.copy(fontFamily = InterFamily),
    titleLarge = Default.titleLarge.copy(fontFamily = InterFamily),
    titleMedium = Default.titleMedium.copy(fontFamily = InterFamily),
    titleSmall = Default.titleSmall.copy(fontFamily = InterFamily),
    bodyLarge = Default.bodyLarge.copy(fontFamily = InterFamily),
    bodyMedium = Default.bodyMedium.copy(fontFamily = InterFamily),
    bodySmall = Default.bodySmall.copy(fontFamily = InterFamily),
    labelLarge = Default.labelLarge.copy(fontFamily = InterFamily),
    labelMedium = Default.labelMedium.copy(fontFamily = InterFamily),
    labelSmall = Default.labelSmall.copy(fontFamily = InterFamily),
)
