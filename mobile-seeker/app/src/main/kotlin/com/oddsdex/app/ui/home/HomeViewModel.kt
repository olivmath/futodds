package com.oddsdex.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.oddsdex.app.core.Analytics
import com.oddsdex.app.demo.SimulatedTickSource
import com.oddsdex.app.ui.chart.SeriesBuffer
import com.oddsdex.app.ui.onboarding.Direction
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** Which team's odd series the terminal tracks and trades. */
enum class TeamSide { HOME, AWAY }

data class Match(
    val id: String,
    val home: String,
    val away: String,
    val baseOdd: Double,
    val awayOdd: Double,
) {
    val title: String get() = "$home × $away"

    fun nameOf(side: TeamSide): String = if (side == TeamSide.HOME) home else away

    fun oddOf(side: TeamSide): Double = if (side == TeamSide.HOME) baseOdd else awayOdd

    /** Compact team code for the side toggle, derived from the id ("ale-ita" → ALE/ITA). */
    fun codeOf(side: TeamSide): String =
        id.split("-")[if (side == TeamSide.HOME) 0 else 1].uppercase()
}

data class HomePosition(
    val direction: Direction,
    val entryOdd: Double,
    val stake: Int,
    val windowSeconds: Int,
    val remainingSeconds: Int,
)

sealed interface TradeResult {
    data class Win(val profit: Double, val entry: Double, val exit: Double) : TradeResult
    data class Loss(val stake: Int, val entry: Double, val exit: Double) : TradeResult
    data object Tie : TradeResult
}

data class HomeUiState(
    val stakeIndex: Int = 2,   // 10 USDC
    val windowIndex: Int = 1,  // 60 s
    val selectedMatch: Match = MATCHES.first(),
    val selectedSide: TeamSide = TeamSide.HOME,
    val position: HomePosition? = null,
    val lastResult: TradeResult? = null,
) {
    val stake: Int get() = STAKES[stakeIndex]
    val windowSeconds: Int get() = WINDOWS[windowIndex]

    companion object {
        val STAKES = listOf(1, 5, 10, 25, 50, 100)
        val WINDOWS = listOf(30, 60, 120, 300)
        const val MULTIPLIER = 1.93

        // Live catalog — replaced by GET /matches when the backend lands.
        val MATCHES = listOf(
            Match("arg-esp", "Argentina", "Espanha", 2.10, 3.30),
            Match("bra-fra", "Brasil", "França", 1.85, 3.60),
            Match("ing-por", "Inglaterra", "Portugal", 2.45, 2.75),
            Match("ale-ita", "Alemanha", "Itália", 1.95, 3.40),
            Match("mex-eua", "México", "EUA", 2.30, 2.90),
            Match("jap-cor", "Japão", "Coreia do Sul", 2.60, 2.55),
        )
    }
}

/**
 * Terminal (home) trading over the simulated feed — an HONEST walk, no
 * steering: wins and losses are real outcomes of the series. Replaced by the
 * WebSocket TickSource + on-chain positions when the backend lands (PRD §7).
 */
@HiltViewModel
class HomeViewModel @Inject constructor() : ViewModel() {

    private var tickSource = SimulatedTickSource(baseOdd = HomeUiState.MATCHES.first().baseOdd)
    val chartBuffer = SeriesBuffer()

    private var tickJob: Job? = null
    private var countdownJob: Job? = null
    private var resultDismissJob: Job? = null

    private val _state = MutableStateFlow(HomeUiState())
    val state: StateFlow<HomeUiState> = _state

    init {
        startFeed()
    }

    /** Prefills history and streams live ticks for the selected match. */
    private fun startFeed() {
        tickJob?.cancel()
        chartBuffer.clear()
        tickSource.prefill(SimulatedTickSource.PREFILL_MILLIS)
            .forEach(chartBuffer::add)
        tickJob = viewModelScope.launch {
            tickSource.ticks().collect { chartBuffer.add(it) }
        }
    }

    /**
     * Switches the terminal to another live match. Blocked while a position
     * is open — the series being traded cannot change mid-window. The side
     * resets to the home team so the terminal always lands in a predictable
     * state.
     */
    fun onMatchSelected(match: Match): Boolean {
        val current = _state.value
        if (current.position != null) return false
        if (match.id == current.selectedMatch.id) return true
        tickSource = SimulatedTickSource(baseOdd = match.baseOdd)
        _state.value = current.copy(
            selectedMatch = match,
            selectedSide = TeamSide.HOME,
            lastResult = null,
        )
        startFeed()
        Analytics.log("match_opened", mapOf("match" to match.id))
        return true
    }

    /**
     * Switches which team's odd the terminal tracks. Same rule as switching
     * matches: blocked while a position is open, because it swaps the series
     * being traded.
     */
    fun onSideSelected(side: TeamSide): Boolean {
        val current = _state.value
        if (current.position != null) return false
        if (side == current.selectedSide) return true
        tickSource = SimulatedTickSource(baseOdd = current.selectedMatch.oddOf(side))
        _state.value = current.copy(selectedSide = side, lastResult = null)
        startFeed()
        Analytics.log(
            "side_selected",
            mapOf("match" to current.selectedMatch.id, "side" to side.name),
        )
        return true
    }

    /** Snapshot odd for the games list: live for the active match. */
    fun currentOddOf(match: Match): Double =
        if (match.id == _state.value.selectedMatch.id) tickSource.currentOdd
        else match.baseOdd

    fun onStakeStep(delta: Int) {
        if (_state.value.position != null) return
        val next = (_state.value.stakeIndex + delta)
            .coerceIn(0, HomeUiState.STAKES.lastIndex)
        _state.value = _state.value.copy(stakeIndex = next)
    }

    fun onWindowStep(delta: Int) {
        if (_state.value.position != null) return
        val next = (_state.value.windowIndex + delta)
            .coerceIn(0, HomeUiState.WINDOWS.lastIndex)
        _state.value = _state.value.copy(windowIndex = next)
    }

    fun onDirectionPicked(direction: Direction) {
        val current = _state.value
        if (current.position != null) return
        val position = HomePosition(
            direction = direction,
            entryOdd = tickSource.currentOdd,
            stake = current.stake,
            windowSeconds = current.windowSeconds,
            remainingSeconds = current.windowSeconds,
        )
        _state.value = current.copy(position = position, lastResult = null)
        Analytics.log(
            "position_open_attempted",
            mapOf("direction" to direction.name, "paper" to "true"),
        )
        countdownJob = viewModelScope.launch {
            for (remaining in position.windowSeconds - 1 downTo 0) {
                delay(1_000)
                val p = _state.value.position ?: return@launch
                _state.value = _state.value.copy(
                    position = p.copy(remainingSeconds = remaining),
                )
            }
            settle()
        }
    }

    fun onCloseNow() {
        if (_state.value.position == null) return
        countdownJob?.cancel()
        countdownJob = null
        settle()
    }

    fun onResultDismissed() {
        resultDismissJob?.cancel()
        _state.value = _state.value.copy(lastResult = null)
    }

    private fun settle() {
        val position = _state.value.position ?: return
        val exit = tickSource.currentOdd
        val entry = position.entryOdd
        val won = when (position.direction) {
            Direction.UP -> exit > entry
            Direction.DOWN -> exit < entry
        }
        val result = when {
            exit == entry -> TradeResult.Tie
            won -> TradeResult.Win(
                profit = position.stake * (HomeUiState.MULTIPLIER - 1),
                entry = entry,
                exit = exit,
            )
            else -> TradeResult.Loss(position.stake, entry, exit)
        }
        _state.value = _state.value.copy(position = null, lastResult = result)
        Analytics.log(
            "position_settled",
            mapOf("result" to if (won) "win" else "loss", "paper" to "true"),
        )
        resultDismissJob = viewModelScope.launch {
            delay(6_000)
            _state.value = _state.value.copy(lastResult = null)
        }
    }
}
