package com.oddsdex.app.ui.onboarding

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.oddsdex.app.R
import com.oddsdex.app.ui.chart.OddsChart
import com.oddsdex.app.ui.components.CoachSheet
import com.oddsdex.app.ui.components.GradientButton
import com.oddsdex.app.ui.components.TradeControls
import com.oddsdex.app.ui.theme.OddsdexColors
import java.util.Locale

@Composable
fun OnboardingScreen(
    onConnectWallet: () -> Unit,
    viewModel: OnboardingViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    // The wallet handoff is its own full screen; everything else lives on
    // top of the full-bleed chart.
    AnimatedContent(
        targetState = state.step == OnboardingStep.HANDOFF,
        transitionSpec = {
            fadeIn(tween(320)) togetherWith fadeOut(tween(220))
        },
        label = "onboarding-root",
    ) { isHandoff ->
        if (isHandoff) {
            ReadyScreen(onConnectWallet = onConnectWallet)
        } else {
            ChartFlow(state, viewModel)
        }
    }
}

@Composable
private fun ChartFlow(state: OnboardingUiState, viewModel: OnboardingViewModel) {
    val density = LocalDensity.current
    var headerHeightPx by remember { mutableIntStateOf(0) }
    var sheetHeightPx by remember { mutableIntStateOf(0) }
    // The series band eases out of the way as sheets grow/shrink, so the
    // chart always reads as owning the full screen.
    val topInset by animateFloatAsState(
        targetValue = headerHeightPx + with(density) { 8.dp.toPx() },
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "chart-top-inset",
    )
    val bottomInset by animateFloatAsState(
        targetValue = sheetHeightPx + with(density) { 20.dp.toPx() },
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "chart-bottom-inset",
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(OddsdexColors.Background),
    ) {
        OddsChart(
            buffer = viewModel.chartBuffer,
            entryOdd = state.entryOdd.takeIf { state.step == OnboardingStep.RUNNING },
            topInsetPx = topInset,
            bottomInsetPx = bottomInset,
        )

        Header(
            modifier = Modifier
                .align(Alignment.TopStart)
                .onSizeChanged { headerHeightPx = it.height },
        )

        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .navigationBarsPadding()
                .padding(bottom = 12.dp)
                .onSizeChanged { sheetHeightPx = it.height },
        ) {
            AnimatedContent(
                targetState = state.step,
                transitionSpec = {
                    (
                        slideInVertically(
                            animationSpec = spring(
                                dampingRatio = Spring.DampingRatioLowBouncy,
                                stiffness = Spring.StiffnessMediumLow,
                            ),
                            initialOffsetY = { it / 3 },
                        ) + fadeIn(tween(220))
                        ) togetherWith (
                        slideOutVertically(tween(180), targetOffsetY = { it / 4 }) +
                            fadeOut(tween(140))
                        )
                },
                label = "coach-sheet",
            ) { step ->
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    when (step) {
                        OnboardingStep.INTRO -> IntroSheet(viewModel::onIntroContinue)
                        OnboardingStep.EXPLAIN -> ExplainSheet(viewModel::onDirectionPicked)
                        OnboardingStep.RUNNING -> RunningSheet(state, viewModel::onCloseNow)
                        OnboardingStep.RESULT -> ResultSheet(state, viewModel::onResultContinue)
                        OnboardingStep.HANDOFF -> Unit // handled at the root level
                    }
                }
            }
        }
    }
}

@Composable
private fun Header(modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(R.string.demo_match),
            color = OddsdexColors.TextPrimary,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier
                .clip(RoundedCornerShape(14.dp))
                .background(OddsdexColors.ChipSurface)
                .padding(horizontal = 16.dp, vertical = 12.dp),
        )
    }
}

@Composable
private fun IntroSheet(onContinue: () -> Unit) {
    CoachSheet(
        title = stringResource(R.string.onboarding_intro_title),
        body = stringResource(R.string.onboarding_intro_body),
    ) {
        GradientButton(
            text = stringResource(R.string.onboarding_intro_cta),
            onClick = onContinue,
        )
    }
}

@Composable
private fun ExplainSheet(onDirection: (Direction) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        CoachSheet(
            title = stringResource(R.string.onboarding_explain_title),
            body = stringResource(R.string.onboarding_explain_body),
        )
        TradeControls(
            stakeLabel = stringResource(
                R.string.demo_stake_label,
                OnboardingUiState.DEMO_STAKE_USDC,
            ),
            windowLabel = stringResource(
                R.string.demo_window_label,
                OnboardingUiState.DEMO_WINDOW_SECONDS,
            ),
            downLabel = stringResource(R.string.direction_down),
            upLabel = stringResource(R.string.direction_up),
            enabled = true,
            onDown = { onDirection(Direction.DOWN) },
            onUp = { onDirection(Direction.UP) },
        )
    }
}

@Composable
private fun RunningSheet(state: OnboardingUiState, onCloseNow: () -> Unit) {
    val direction = state.direction ?: return
    val directionLabel = stringResource(
        if (direction == Direction.UP) R.string.direction_up else R.string.direction_down,
    )
    // Drains continuously (1s linear segments chain into smooth motion).
    val progress by animateFloatAsState(
        targetValue = state.remainingSeconds / OnboardingUiState.DEMO_WINDOW_SECONDS.toFloat(),
        animationSpec = tween(durationMillis = 1_000, easing = LinearEasing),
        label = "countdown-progress",
    )
    CoachSheet(
        title = stringResource(R.string.onboarding_running_title, directionLabel),
        body = stringResource(R.string.onboarding_running_body, formatOdd(state.entryOdd)),
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CountdownDigits(state.remainingSeconds)
            Spacer(Modifier.height(12.dp))
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier.fillMaxWidth().height(6.dp),
                color = OddsdexColors.CtaStart,
                trackColor = OddsdexColors.GridLine,
            )
            Spacer(Modifier.height(14.dp))
            CloseNowButton(onClick = onCloseNow)
        }
    }
}

/** Cash-out affordance: dark outlined button on the light sheet. */
@Composable
private fun CloseNowButton(onClick: () -> Unit) {
    androidx.compose.material3.OutlinedButton(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().height(48.dp),
        shape = RoundedCornerShape(14.dp),
        colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(
            contentColor = OddsdexColors.SheetTitle,
        ),
        border = androidx.compose.foundation.BorderStroke(1.5.dp, OddsdexColors.SheetTitle),
    ) {
        Text(
            text = stringResource(R.string.onboarding_running_close),
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

/** Big mono countdown with rolling-digit transitions ("speed" feel). */
@Composable
private fun CountdownDigits(remainingSeconds: Int) {
    AnimatedContent(
        targetState = remainingSeconds,
        transitionSpec = {
            (
                slideInVertically(
                    animationSpec = spring(
                        dampingRatio = Spring.DampingRatioMediumBouncy,
                        stiffness = Spring.StiffnessMedium,
                    ),
                    initialOffsetY = { -it },
                ) + fadeIn(tween(120))
                ) togetherWith (
                slideOutVertically(tween(120), targetOffsetY = { it }) + fadeOut(tween(90))
                )
        },
        label = "countdown-digits",
    ) { seconds ->
        Text(
            text = String.format(Locale.US, "0:%02d", seconds),
            color = OddsdexColors.SheetTitle,
            fontSize = 44.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = com.oddsdex.app.ui.theme.JetBrainsMonoFamily,
        )
    }
}

@Composable
private fun ResultSheet(state: OnboardingUiState, onContinue: () -> Unit) {
    CoachSheet(
        title = stringResource(R.string.onboarding_result_title),
        body = stringResource(
            R.string.onboarding_result_body,
            OnboardingUiState.DEMO_STAKE_USDC,
            OnboardingUiState.DEMO_PROFIT_USDC,
            formatOdd(state.entryOdd),
            formatOdd(state.exitOdd),
        ),
    ) {
        GradientButton(
            text = stringResource(R.string.onboarding_result_cta),
            onClick = onContinue,
        )
    }
}

private fun formatOdd(odd: Double?): String =
    if (odd == null) "—" else String.format(Locale.US, "%.2f", odd)
