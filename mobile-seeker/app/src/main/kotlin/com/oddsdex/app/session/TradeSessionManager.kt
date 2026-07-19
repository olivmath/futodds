package com.oddsdex.app.session

import android.content.Context
import android.content.Intent
import com.oddsdex.app.domain.TickSource
import com.oddsdex.app.ui.home.HomeUiState
import com.oddsdex.app.ui.home.TradeResult
import com.oddsdex.app.ui.onboarding.Direction
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** Live position as tracked outside the UI — feeds both the screen and the notification. */
data class LiveTrade(
    val matchTitle: String,
    val team: String,
    val direction: Direction,
    val stake: Int,
    val windowSeconds: Int,
    val entryOdd: Double,
    val currentOdd: Double,
    val remainingSeconds: Int,
)

/** Settled position waiting to be folded into the UI state (history, balances). */
data class SettledTrade(
    val matchTitle: String,
    val team: String,
    val direction: Direction,
    val stake: Int,
    val windowSeconds: Int,
    val entryOdd: Double,
    val exitOdd: Double,
    val result: TradeResult,
    val timestampMillis: Long,
)

/**
 * Owns the open-position lifecycle (countdown + settle) at application scope,
 * so a trade started in the terminal keeps running when the user leaves the
 * app. While a position is open, [TradeSessionService] runs as a foreground
 * service: it keeps the process alive and mirrors [live] into an ongoing
 * notification; on settle, the result is posted as a heads-up notification
 * when the app is not on screen.
 */
@Singleton
class TradeSessionManager @Inject constructor(
    @param:ApplicationContext private val context: Context,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private var source: TickSource? = null
    private var countdownJob: Job? = null

    private val _live = MutableStateFlow<LiveTrade?>(null)
    val live: StateFlow<LiveTrade?> = _live

    private val _settled = MutableStateFlow<SettledTrade?>(null)
    val settled: StateFlow<SettledTrade?> = _settled

    /** Kept current by MainActivity; gates the settle heads-up notification. */
    @Volatile
    var appVisible: Boolean = false

    fun open(
        source: TickSource,
        matchTitle: String,
        team: String,
        direction: Direction,
        stake: Int,
        windowSeconds: Int,
    ) {
        if (_live.value != null) return
        this.source = source
        val trade = LiveTrade(
            matchTitle = matchTitle,
            team = team,
            direction = direction,
            stake = stake,
            windowSeconds = windowSeconds,
            entryOdd = source.currentOdd,
            currentOdd = source.currentOdd,
            remainingSeconds = windowSeconds,
        )
        _live.value = trade
        context.startForegroundService(Intent(context, TradeSessionService::class.java))
        countdownJob = scope.launch {
            for (remaining in windowSeconds - 1 downTo 0) {
                delay(1_000)
                val current = _live.value ?: return@launch
                _live.value = current.copy(
                    remainingSeconds = remaining,
                    currentOdd = source.currentOdd,
                )
            }
            settle()
        }
    }

    fun closeNow() {
        if (_live.value == null) return
        countdownJob?.cancel()
        countdownJob = null
        settle()
    }

    /** UI has folded the settled trade into its state — clear the handoff slot. */
    fun consumeSettled() {
        _settled.value = null
    }

    private fun settle() {
        val trade = _live.value ?: return
        val exit = source?.currentOdd ?: trade.currentOdd
        val entry = trade.entryOdd
        val won = when (trade.direction) {
            Direction.UP -> exit > entry
            Direction.DOWN -> exit < entry
        }
        val result = when {
            exit == entry -> TradeResult.Tie
            won -> TradeResult.Win(
                profit = trade.stake * (HomeUiState.MULTIPLIER - 1),
                entry = entry,
                exit = exit,
            )
            else -> TradeResult.Loss(trade.stake, entry, exit)
        }
        val settledTrade = SettledTrade(
            matchTitle = trade.matchTitle,
            team = trade.team,
            direction = trade.direction,
            stake = trade.stake,
            windowSeconds = trade.windowSeconds,
            entryOdd = entry,
            exitOdd = exit,
            result = result,
            timestampMillis = System.currentTimeMillis(),
        )
        _settled.value = settledTrade
        // Clearing live stops the foreground service (it observes this flow).
        _live.value = null
        source = null
        if (!appVisible) {
            TradeNotifications.postResult(context, settledTrade)
        }
    }
}
