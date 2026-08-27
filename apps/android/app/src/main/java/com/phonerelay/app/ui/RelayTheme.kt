package com.phonerelay.app.ui

import android.app.Activity
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val colors = darkColorScheme(
    primary = Color(0xFF6EA8FF),
    tertiary = Color(0xFFFFC857),
    error = Color(0xFFFF6B7D),
    background = Color(0xFF0B1020),
    surface = Color(0xFF141A2E),
    onBackground = Color(0xFFE8EDFF),
    onSurface = Color(0xFFE8EDFF),
    outline = Color(0xFF93A0C8),
)

@Composable
fun RelayTheme(content: @Composable () -> Unit) {
    val view = LocalView.current
    SideEffect {
        val window = (view.context as Activity).window
        window.statusBarColor = colors.background.toArgb()
        WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
    }
    MaterialTheme(colorScheme = colors, content = content)
}
