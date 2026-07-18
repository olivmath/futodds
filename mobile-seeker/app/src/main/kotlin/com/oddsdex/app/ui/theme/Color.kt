package com.oddsdex.app.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Brand palette: "Volt Court" (defi · bold · electric) — see brand.md.
 * Seeds (OKLCH): bg 0.12/0.015/160 · elevated 0.17/0.02/160 ·
 * primary 0.76/0.21/148 · primary-soft 0.87/0.15/148 · fg 0.97/0.008/160.
 *
 * Dopamine rule: the electric green is RESERVED for action, wins and payouts.
 * The chart series stays cyan (data-neutral — it must not "lean" up or down
 * before settlement), and red marks only DOWN/losses.
 */
object OddsdexColors {
    // Volt Court seeds — near-black with a subtle pitch-green tint
    val Background = Color(0xFF081310)
    val Surface = Color(0xFF0F1E18)
    val ChipSurface = Color(0xFF14261F)
    val TextPrimary = Color(0xFFF0F5F2)
    val TextSecondary = Color(0xFF85948B)

    // Chart — data-neutral by design (never the reward color)
    val SeriesCyan = Color(0xFF41D9E8)
    val GridLine = Color(0xFF1D2B24)
    val AxisLabel = Color(0xFF66756C)
    val PillBackground = Color(0xFFF0F5F2)
    val PillText = Color(0xFF081310)
    val EntryLine = Color(0xFFA9B8AF)

    // Semantic pair (never color-only — always icon + label too)
    val Up = Color(0xFF2FE083)          // brand green = win = UP
    val Down = Color(0xFFFA5A6A)

    // Gradient CTA ramps into the brand green
    val CtaStart = Color(0xFF00E5C9)
    val CtaEnd = Color(0xFF2FE083)
    val CtaText = Color(0xFF052015)

    // Coach sheet (light card over the dark chart)
    val SheetBackground = Color(0xFFECF6F0)
    val SheetTitle = Color(0xFF081310)
    val SheetBody = Color(0xFF39463F)

    // Brand primary (Volt Court electric green) + soft variant
    val Primary = Up
    val PrimarySoft = Color(0xFF83EDAF)
}
