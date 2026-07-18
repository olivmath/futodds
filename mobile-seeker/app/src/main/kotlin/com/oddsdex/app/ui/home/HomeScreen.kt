package com.oddsdex.app.ui.home

import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.automirrored.filled.ShowChart
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.SportsSoccer
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.oddsdex.app.R
import com.oddsdex.app.ui.chart.OddsChart
import com.oddsdex.app.ui.components.TradeControls
import com.oddsdex.app.ui.onboarding.Direction
import com.oddsdex.app.ui.profile.ProfileScreen
import com.oddsdex.app.ui.theme.JetBrainsMonoFamily
import com.oddsdex.app.ui.theme.OddsdexColors
import java.util.Locale

private enum class HomeTab { TERMINAL, GAMES, HISTORY, HELP }

/** Trading terminal (reference: imgs/home.png), plus payments sheet. */
@Composable
fun HomeScreen(
    walletAddress: String?,
    onDisconnect: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var tab by remember { mutableStateOf(HomeTab.TERMINAL) }
    var showPayments by remember { mutableStateOf(false) }
    var showProfile by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(OddsdexColors.Background),
    ) {
        Box(modifier = Modifier.weight(1f)) {
            when (tab) {
                HomeTab.TERMINAL -> Terminal(
                    state = state,
                    viewModel = viewModel,
                    onWalletClick = { showPayments = true },
                    onProfileClick = { showProfile = true },
                    onOpenGames = { tab = HomeTab.GAMES },
                )
                HomeTab.GAMES -> GamesScreen(
                    state = state,
                    currentOddOf = viewModel::currentOddOf,
                    onMatchSelected = viewModel::onMatchSelected,
                    onOpenTerminal = { tab = HomeTab.TERMINAL },
                )
                HomeTab.HISTORY -> HistoryScreen(history = state.history)
                HomeTab.HELP -> HelpScreen()
            }
        }
        BottomNav(tab, onSelect = { tab = it })
    }

    if (showPayments) {
        PaymentsSheet(
            walletUsdc = state.walletUsdc,
            tradingBalance = state.tradingBalance,
            busy = state.paymentsBusy,
            notice = state.paymentsNotice,
            transactions = state.transactions,
            onStake = viewModel::onStake,
            onUnstake = viewModel::onUnstake,
            onNoticeDismissed = viewModel::onPaymentsNoticeDismissed,
            onDismiss = { showPayments = false },
        )
    }

    // Profile opens from the top-bar avatar, over everything.
    AnimatedVisibility(
        visible = showProfile,
        enter = slideInVertically(
            spring(stiffness = Spring.StiffnessMediumLow),
            initialOffsetY = { it / 6 },
        ) + fadeIn(tween(200)),
        exit = slideOutVertically(tween(180), targetOffsetY = { it / 8 }) + fadeOut(tween(140)),
    ) {
        ProfileScreen(
            walletAddress = walletAddress,
            onDisconnect = onDisconnect,
            onBack = { showProfile = false },
        )
    }
    BackHandler(enabled = showProfile) { showProfile = false }
}

@Composable
private fun Terminal(
    state: HomeUiState,
    viewModel: HomeViewModel,
    onWalletClick: () -> Unit,
    onProfileClick: () -> Unit,
    onOpenGames: () -> Unit,
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    var topHeightPx by remember { mutableIntStateOf(0) }
    var bottomHeightPx by remember { mutableIntStateOf(0) }
    val topInset by animateFloatAsState(
        targetValue = topHeightPx + with(density) { 8.dp.toPx() },
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "home-top-inset",
    )
    val bottomInset by animateFloatAsState(
        targetValue = bottomHeightPx + with(density) { 16.dp.toPx() },
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        label = "home-bottom-inset",
    )

    Box(modifier = Modifier.fillMaxSize()) {
        OddsChart(
            buffer = viewModel.chartBuffer,
            entryOdd = state.position?.entryOdd,
            topInsetPx = topInset,
            bottomInsetPx = bottomInset,
            seriesKey = "${state.selectedMatch.id}:${state.selectedSide.name}",
        )

        Column(
            modifier = Modifier
                .align(Alignment.TopStart)
                .onSizeChanged { topHeightPx = it.height },
        ) {
            TopBar(state.tradingBalance, onWalletClick, onProfileClick)
            MatchHeader(
                match = state.selectedMatch,
                side = state.selectedSide,
                sideSwitchEnabled = state.position == null,
                onChipClick = onOpenGames,
                onSideSelected = { side ->
                    if (!viewModel.onSideSelected(side)) {
                        Toast.makeText(
                            context,
                            R.string.team_switch_blocked,
                            Toast.LENGTH_SHORT,
                        ).show()
                    }
                },
            )
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 10.dp)
                .onSizeChanged { bottomHeightPx = it.height },
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ResultBanner(state.lastResult, viewModel::onResultDismissed)
            state.position?.let { PositionBar(it, viewModel::onCloseNow) }
            PayoutRow()
            TradeControls(
                stakeLabel = stringResource(R.string.demo_stake_label, state.stake),
                windowLabel = windowLabel(state.windowSeconds),
                downLabel = stringResource(R.string.direction_down),
                upLabel = stringResource(R.string.direction_up),
                enabled = state.position == null,
                onDown = { viewModel.onDirectionPicked(Direction.DOWN) },
                onUp = { viewModel.onDirectionPicked(Direction.UP) },
                onStakeMinus = { viewModel.onStakeStep(-1) },
                onStakePlus = { viewModel.onStakeStep(+1) },
                onWindowMinus = { viewModel.onWindowStep(-1) },
                onWindowPlus = { viewModel.onWindowStep(+1) },
            )
        }
    }
}

@Composable
private fun TopBar(
    tradingBalance: Double,
    onWalletClick: () -> Unit,
    onProfileClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Profile avatar → profile screen
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(OddsdexColors.ChipSurface)
                .clickable(onClick = onProfileClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Person,
                contentDescription = stringResource(R.string.tab_profile),
                tint = OddsdexColors.TextSecondary,
            )
        }
        // Centered balance
        Column(
            modifier = Modifier.weight(1f),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                text = String.format(Locale.US, "%.2f USDC", tradingBalance),
                color = OddsdexColors.TextPrimary,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = JetBrainsMonoFamily,
            )
            Text(
                text = stringResource(R.string.home_balance_caption),
                color = OddsdexColors.TextSecondary,
                fontSize = 13.sp,
            )
        }
        // Gradient wallet button → payments sheet
        Box(
            modifier = Modifier
                .size(44.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(
                    Brush.linearGradient(
                        listOf(OddsdexColors.CtaStart, OddsdexColors.CtaEnd),
                    ),
                )
                .clickable(onClick = onWalletClick),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.AccountBalanceWallet,
                contentDescription = stringResource(R.string.payments_title),
                tint = OddsdexColors.CtaText,
            )
        }
    }
}

/**
 * Match chip + team side toggle. The chip is the asset switcher (opens the
 * games list — standard trading-app pattern: the asset name always leads to
 * the asset list); the toggle beside LIVE picks which team's odd the chart
 * tracks and the trade rides.
 */
@Composable
private fun MatchHeader(
    match: Match,
    side: TeamSide,
    sideSwitchEnabled: Boolean,
    onChipClick: () -> Unit,
    onSideSelected: (TeamSide) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier = Modifier
                .weight(1f, fill = false)
                .clip(RoundedCornerShape(14.dp))
                .background(OddsdexColors.ChipSurface)
                .clickable(onClick = onChipClick)
                .padding(start = 14.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LiveDot()
            Spacer(Modifier.width(8.dp))
            Text(
                text = match.title,
                color = OddsdexColors.TextPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            Spacer(Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.home_live),
                color = OddsdexColors.Up,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
            )
            Icon(
                Icons.Filled.ExpandMore,
                contentDescription = stringResource(R.string.open_games_cd),
                tint = OddsdexColors.TextSecondary,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(Modifier.width(8.dp))
        TeamToggle(
            match = match,
            side = side,
            enabled = sideSwitchEnabled,
            onSideSelected = onSideSelected,
        )
    }
}

/**
 * Compact segmented toggle with the two team codes. The selected segment
 * reuses the chart price-pill look (light on dark): "this team" is visually
 * the same object as "this series". Deliberately not green/red — those are
 * reserved for direction and results.
 */
@Composable
private fun TeamToggle(
    match: Match,
    side: TeamSide,
    enabled: Boolean,
    onSideSelected: (TeamSide) -> Unit,
) {
    Row(
        modifier = Modifier
            .alpha(if (enabled) 1f else 0.45f)
            .clip(RoundedCornerShape(14.dp))
            .background(OddsdexColors.ChipSurface)
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        TeamSide.entries.forEach { entry ->
            val selected = entry == side
            Text(
                text = match.codeOf(entry),
                color = if (selected) OddsdexColors.PillText else OddsdexColors.TextSecondary,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = JetBrainsMonoFamily,
                letterSpacing = 1.sp,
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(
                        if (selected) OddsdexColors.PillBackground
                        else OddsdexColors.ChipSurface,
                    )
                    .clickable { onSideSelected(entry) }
                    .padding(horizontal = 10.dp, vertical = 6.dp)
                    .semantics {
                        contentDescription = match.nameOf(entry)
                    },
            )
        }
    }
}

@Composable
private fun LiveDot() {
    val transition = rememberInfiniteTransition(label = "live-dot")
    val alpha by transition.animateFloat(
        initialValue = 1f,
        targetValue = 0.25f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "live-dot-alpha",
    )
    Box(
        modifier = Modifier
            .size(8.dp)
            .clip(CircleShape)
            .background(OddsdexColors.Up.copy(alpha = alpha)),
    )
}

@Composable
private fun PayoutRow() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(R.string.home_mode),
            color = OddsdexColors.TextSecondary,
            fontSize = 14.sp,
        )
        Spacer(Modifier.weight(1f))
        Text(
            text = stringResource(R.string.home_payout),
            color = OddsdexColors.TextPrimary,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

/** Compact open-position bar: direction, entry, countdown, close (cash-out). */
@Composable
private fun PositionBar(position: HomePosition, onClose: () -> Unit) {
    val directionLabel = stringResource(
        if (position.direction == Direction.UP) R.string.direction_up
        else R.string.direction_down,
    )
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(OddsdexColors.ChipSurface)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stringResource(
                R.string.home_position_open,
                directionLabel,
                formatOdd(position.entryOdd),
            ),
            color = if (position.direction == Direction.UP) OddsdexColors.Up
            else OddsdexColors.Down,
            fontSize = 14.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.weight(1f))
        Text(
            text = String.format(
                Locale.US, "%d:%02d",
                position.remainingSeconds / 60, position.remainingSeconds % 60,
            ),
            color = OddsdexColors.TextPrimary,
            fontSize = 16.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = JetBrainsMonoFamily,
        )
        Spacer(Modifier.width(14.dp))
        Text(
            text = stringResource(R.string.home_close),
            color = OddsdexColors.TextPrimary,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier
                .clip(RoundedCornerShape(10.dp))
                .background(OddsdexColors.Surface)
                .clickable(onClick = onClose)
                .padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }
}

@Composable
private fun ResultBanner(result: TradeResult?, onDismiss: () -> Unit) {
    AnimatedVisibility(
        visible = result != null,
        enter = slideInVertically(
            spring(dampingRatio = Spring.DampingRatioMediumBouncy),
            initialOffsetY = { it / 2 },
        ) + fadeIn(),
        exit = slideOutVertically(tween(160), targetOffsetY = { it / 3 }) + fadeOut(tween(120)),
    ) {
        val (text, color) = when (result) {
            is TradeResult.Win -> stringResource(
                R.string.result_win, String.format(Locale.US, "%.2f", result.profit),
            ) to OddsdexColors.Up
            is TradeResult.Loss -> stringResource(
                R.string.result_loss, result.stake,
            ) to OddsdexColors.Down
            TradeResult.Tie, null -> stringResource(R.string.result_tie) to
                OddsdexColors.TextSecondary
        }
        val odds = when (result) {
            is TradeResult.Win -> stringResource(
                R.string.result_odds, formatOdd(result.entry), formatOdd(result.exit),
            )
            is TradeResult.Loss -> stringResource(
                R.string.result_odds, formatOdd(result.entry), formatOdd(result.exit),
            )
            else -> null
        }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .clip(RoundedCornerShape(14.dp))
                .background(color.copy(alpha = 0.16f))
                .clickable(onClick = onDismiss)
                .padding(horizontal = 14.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = text,
                color = color,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.weight(1f))
            odds?.let {
                Text(
                    text = it,
                    color = OddsdexColors.TextSecondary,
                    fontSize = 13.sp,
                    fontFamily = JetBrainsMonoFamily,
                )
            }
        }
    }
}

@Composable
private fun BottomNav(selected: HomeTab, onSelect: (HomeTab) -> Unit) {
    NavigationBar(containerColor = OddsdexColors.Surface) {
        NavItem(HomeTab.TERMINAL, selected, Icons.AutoMirrored.Filled.ShowChart,
            stringResource(R.string.tab_terminal), onSelect)
        NavItem(HomeTab.GAMES, selected, Icons.Filled.SportsSoccer,
            stringResource(R.string.tab_games), onSelect)
        NavItem(HomeTab.HISTORY, selected, Icons.Filled.History,
            stringResource(R.string.tab_history), onSelect)
        NavItem(HomeTab.HELP, selected, Icons.AutoMirrored.Filled.HelpOutline,
            stringResource(R.string.tab_help), onSelect)
    }
}

@Composable
private fun androidx.compose.foundation.layout.RowScope.NavItem(
    tab: HomeTab,
    selected: HomeTab,
    icon: ImageVector,
    label: String,
    onSelect: (HomeTab) -> Unit,
) {
    NavigationBarItem(
        selected = tab == selected,
        onClick = { onSelect(tab) },
        icon = { Icon(icon, contentDescription = label) },
        label = { Text(label, fontSize = 12.sp) },
        colors = NavigationBarItemDefaults.colors(
            selectedIconColor = OddsdexColors.Up,
            selectedTextColor = OddsdexColors.TextPrimary,
            unselectedIconColor = OddsdexColors.TextSecondary,
            unselectedTextColor = OddsdexColors.TextSecondary,
            indicatorColor = OddsdexColors.ChipSurface,
        ),
    )
}

@Composable
private fun windowLabel(seconds: Int): String =
    if (seconds < 60) "$seconds s" else "${seconds / 60} min"

private fun formatOdd(odd: Double): String = String.format(Locale.US, "%.2f", odd)
