package com.oddsdex.app.ui.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oddsdex.app.R
import com.oddsdex.app.ui.components.GradientButton
import com.oddsdex.app.ui.theme.OddsdexColors

/** Full-screen wallet handoff shown after the demo trade is won. */
@Composable
fun ReadyScreen(onConnectWallet: () -> Unit) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(OddsdexColors.Background)
            .background(
                // Soft cyan glow rising from the bottom — echoes the chart.
                Brush.verticalGradient(
                    0f to OddsdexColors.Background.copy(alpha = 0f),
                    0.55f to OddsdexColors.Background.copy(alpha = 0f),
                    1f to OddsdexColors.CtaStart.copy(alpha = 0.16f),
                ),
            ),
    ) {
        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                text = stringResource(R.string.ready_title),
                color = OddsdexColors.TextPrimary,
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                lineHeight = 40.sp,
            )
            Spacer(Modifier.height(14.dp))
            Text(
                text = stringResource(R.string.ready_body),
                color = OddsdexColors.TextSecondary,
                fontSize = 16.sp,
                textAlign = TextAlign.Center,
                lineHeight = 23.sp,
            )
        }
        GradientButton(
            text = stringResource(R.string.ready_cta),
            onClick = onConnectWallet,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(horizontal = 24.dp, vertical = 20.dp),
        )
    }
}
