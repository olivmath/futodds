package com.oddsdex.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

// oddsdex is dark-first: the trading surface is always dark, regardless of
// the system theme (matches the onboarding/trade reference designs).
private val OddsdexColorScheme = darkColorScheme(
    primary = OddsdexColors.Primary,
    background = OddsdexColors.Background,
    surface = OddsdexColors.Surface,
    onBackground = OddsdexColors.TextPrimary,
    onSurface = OddsdexColors.TextPrimary,
    error = OddsdexColors.Down,
)

@Composable
fun OddsdexTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = OddsdexColorScheme,
        typography = OddsdexTypography,
        content = content,
    )
}
