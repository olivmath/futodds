package com.oddsdex.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.oddsdex.app.api.BackendApi
import com.oddsdex.app.core.Analytics
import com.oddsdex.app.data.BackendTickSource
import com.oddsdex.app.data.MatchRepository
import com.oddsdex.app.demo.SimulatedTickSource
import com.oddsdex.app.domain.TickSource
import com.oddsdex.app.session.SettledTrade
import com.oddsdex.app.session.TradeSessionManager
import com.oddsdex.app.ui.chart.SeriesBuffer
import com.oddsdex.app.ui.onboarding.Direction
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.launch

/** Which team's odd series the terminal tracks and trades. */
enum class TeamSide { HOME, AWAY }

data class Match(
    val id: String,
    val home: String,
    val away: String,
    val baseOdd: Double,
    val awayOdd: Double,
    /** True when this match came from the backend (odds are the oracle's). */
    val live: Boolean = false,
) {
    val title: String get() = if (away.isBlank()) home else "$home × $away"

    fun nameOf(side: TeamSide): String = if (side == TeamSide.HOME) home else away

    fun oddOf(side: TeamSide): Double = if (side == TeamSide.HOME) baseOdd else awayOdd

    /**
     * Compact team code for the side toggle — first three letters of the team
     * name, accent-stripped ("Itália" → ITA). Backend match ids are TxLINE
     * FixtureIds (numeric), so the id carries no team hint.
     */
    fun codeOf(side: TeamSide): String {
        val name = nameOf(side).ifBlank { id }
        val ascii = java.text.Normalizer.normalize(name, java.text.Normalizer.Form.NFD)
            .replace(Regex("\\p{Mn}+"), "")
        return ascii.filter(Char::isLetterOrDigit).take(3).uppercase()
    }
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

/**
 * One settled trade, newest first in [HomeUiState.history]. [profit] carries
 * the sign: +payout on a win, -stake on a loss, 0.0 on a tie.
 */
data class TradeRecord(
    val id: Long,
    val matchTitle: String,
    val team: String,
    val direction: Direction,
    val stake: Int,
    val entryOdd: Double,
    val exitOdd: Double,
    val profit: Double,
    val windowSeconds: Int,
    val timestampMillis: Long,
)

/** Payments flow that just confirmed — the sheet renders the success banner. */
enum class PaymentsKind { STAKE, UNSTAKE }

data class PaymentsNotice(val kind: PaymentsKind, val amount: Double)

enum class TxKind { STAKE, UNSTAKE, TRADE_WIN, TRADE_LOSS }

/** One on-chain transaction for the payments history (mock until indexer). */
data class ChainTx(
    val id: Long,
    val kind: TxKind,
    val amount: Double,
    val timestampMillis: Long,
    val signature: String,
)

data class HomeUiState(
    val stakeIndex: Int = 2,   // 10 USDC
    val windowIndex: Int = 1,  // 60 s
    /** Live catalog from MatchRepository (falls back to the demo list). */
    val matches: List<Match> = MatchRepository.FALLBACK_MATCHES,
    val selectedMatch: Match = MatchRepository.FALLBACK_MATCHES.first(),
    val selectedSide: TeamSide = TeamSide.HOME,
    val position: HomePosition? = null,
    val lastResult: TradeResult? = null,
    val history: List<TradeRecord> = emptyList(),
    // MOCK balances — replaced by the token-account RPC reads when the
    // program lands. tradingBalance is the staked 1:1 betting token; the
    // top bar shows it because it's what trades draw from.
    val walletUsdc: Double = 250.0,
    val tradingBalance: Double = 0.0,
    val paymentsBusy: Boolean = false,
    val paymentsNotice: PaymentsNotice? = null,
    val transactions: List<ChainTx> = emptyList(),
) {
    val stake: Int get() = STAKES[stakeIndex]
    val windowSeconds: Int get() = WINDOWS[windowIndex]

    companion object {
        val STAKES = listOf(1, 5, 10, 25, 50, 100)
        val WINDOWS = listOf(30, 60, 120, 300)
        const val MULTIPLIER = 1.93
    }
}

/**
 * Terminal (home) trading. Odds come from the backend oracle (BackendTickSource)
 * for live matches, or the honest simulated walk for the demo catalog — either
 * way wins and losses are real outcomes of the series. Positions themselves
 * are still paper: the betting-engine ixs land in a later phase (PRD §7).
 */
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val session: TradeSessionManager,
    private val repository: MatchRepository,
    private val api: BackendApi,
) : ViewModel() {

    private var tickSource: TickSource =
        newSource(MatchRepository.FALLBACK_MATCHES.first(), TeamSide.HOME)
    val chartBuffer = SeriesBuffer()

    private var tickJob: Job? = null
    private var resultDismissJob: Job? = null

    private val _state = MutableStateFlow(
        HomeUiState(history = mockHistory(), transactions = mockTransactions()),
    )
    val state: StateFlow<HomeUiState> = _state

    init {
        repository.start()
        startFeed()
        // The open-position lifecycle lives in TradeSessionManager (it keeps
        // running when the user leaves the app); the ViewModel just mirrors it.
        viewModelScope.launch {
            session.live.collect { live ->
                _state.value = _state.value.copy(
                    position = live?.let {
                        HomePosition(
                            direction = it.direction,
                            entryOdd = it.entryOdd,
                            stake = it.stake,
                            windowSeconds = it.windowSeconds,
                            remainingSeconds = it.remainingSeconds,
                        )
                    },
                )
            }
        }
        viewModelScope.launch {
            session.settled.filterNotNull().collect { onSettled(it) }
        }
        viewModelScope.launch {
            repository.matches.collect { onCatalog(it) }
        }
    }

    /**
     * Folds a catalog refresh into the state. If the selected match vanished
     * (backend replaced the demo list, or the match closed) the terminal moves
     * to the first available one — unless a position is open, in which case
     * the current series must keep running until it settles.
     */
    private fun onCatalog(matches: List<Match>) {
        val current = _state.value
        val selected = matches.firstOrNull { it.id == current.selectedMatch.id }
        if (selected != null) {
            _state.value = current.copy(matches = matches, selectedMatch = selected)
            return
        }
        if (current.position != null || matches.isEmpty()) {
            _state.value = current.copy(matches = matches)
            return
        }
        val next = matches.first()
        tickSource = newSource(next, TeamSide.HOME)
        _state.value = current.copy(
            matches = matches,
            selectedMatch = next,
            selectedSide = TeamSide.HOME,
            lastResult = null,
        )
        repository.onMatchWatched(next)
        startFeed()
    }

    /** Live matches read the oracle feed; demo matches keep the simulator. */
    private fun newSource(match: Match, side: TeamSide): TickSource =
        if (match.live) {
            BackendTickSource(api, match.id, side, initialOdd = match.oddOf(side))
        } else {
            SimulatedTickSource(baseOdd = match.oddOf(side))
        }

    /** Prefills history and streams live ticks for the selected match. */
    private fun startFeed() {
        tickJob?.cancel()
        chartBuffer.clear()
        when (val source = tickSource) {
            is SimulatedTickSource ->
                source.prefill(SimulatedTickSource.PREFILL_MILLIS).forEach(chartBuffer::add)
            is BackendTickSource ->
                source.prefill(BackendTickSource.PREFILL_MILLIS).forEach(chartBuffer::add)
        }
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
        tickSource = newSource(match, TeamSide.HOME)
        _state.value = current.copy(
            selectedMatch = match,
            selectedSide = TeamSide.HOME,
            lastResult = null,
        )
        repository.onMatchWatched(match)
        startFeed()
        Analytics.log("match_opened", mapOf("match" to match.id, "live" to match.live.toString()))
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
        tickSource = newSource(current.selectedMatch, side)
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
        _state.value = current.copy(lastResult = null)
        session.open(
            source = tickSource,
            matchTitle = current.selectedMatch.title,
            team = current.selectedMatch.nameOf(current.selectedSide),
            direction = direction,
            stake = current.stake,
            windowSeconds = current.windowSeconds,
        )
        Analytics.log(
            "position_open_attempted",
            mapOf("direction" to direction.name, "paper" to "true"),
        )
    }

    fun onCloseNow() = session.closeNow()

    fun onResultDismissed() {
        resultDismissJob?.cancel()
        _state.value = _state.value.copy(lastResult = null)
    }

    /** MOCK: wallet USDC → trading balance. Replaced by the stake ix later. */
    fun onStake(amount: Double) = runPayment(PaymentsKind.STAKE, amount)

    /** MOCK: trading balance → wallet USDC. Replaced by the unstake ix later. */
    fun onUnstake(amount: Double) = runPayment(PaymentsKind.UNSTAKE, amount)

    fun onPaymentsNoticeDismissed() {
        _state.value = _state.value.copy(paymentsNotice = null)
    }

    private fun runPayment(kind: PaymentsKind, amount: Double) {
        val current = _state.value
        val available = when (kind) {
            PaymentsKind.STAKE -> current.walletUsdc
            PaymentsKind.UNSTAKE -> current.tradingBalance
        }
        if (current.paymentsBusy || amount <= 0 || amount > available) return
        _state.value = current.copy(paymentsBusy = true, paymentsNotice = null)
        Analytics.log("${kind.name.lowercase()}_initiated", mapOf("paper" to "true"))
        viewModelScope.launch {
            delay(1_800) // MOCK on-chain confirmation latency
            val s = _state.value
            val signed = if (kind == PaymentsKind.STAKE) amount else -amount
            val tx = ChainTx(
                id = System.currentTimeMillis(),
                kind = if (kind == PaymentsKind.STAKE) TxKind.STAKE else TxKind.UNSTAKE,
                amount = amount,
                timestampMillis = System.currentTimeMillis(),
                signature = mockSignature(),
            )
            _state.value = s.copy(
                walletUsdc = s.walletUsdc - signed,
                tradingBalance = s.tradingBalance + signed,
                paymentsBusy = false,
                paymentsNotice = PaymentsNotice(kind, amount),
                transactions = listOf(tx) + s.transactions,
            )
            Analytics.log("${kind.name.lowercase()}_confirmed", mapOf("paper" to "true"))
        }
    }

    /** Folds a trade settled by [TradeSessionManager] into history and balances. */
    private fun onSettled(settled: SettledTrade) {
        val current = _state.value
        val result = settled.result
        val record = TradeRecord(
            id = settled.timestampMillis,
            matchTitle = settled.matchTitle,
            team = settled.team,
            direction = settled.direction,
            stake = settled.stake,
            entryOdd = settled.entryOdd,
            exitOdd = settled.exitOdd,
            profit = when (result) {
                is TradeResult.Win -> result.profit
                is TradeResult.Loss -> -settled.stake.toDouble()
                TradeResult.Tie -> 0.0
            },
            windowSeconds = settled.windowSeconds,
            timestampMillis = settled.timestampMillis,
        )
        val tx = when (result) {
            is TradeResult.Win -> ChainTx(
                id = record.id + 1, kind = TxKind.TRADE_WIN, amount = result.profit,
                timestampMillis = record.timestampMillis, signature = mockSignature(),
            )
            is TradeResult.Loss -> ChainTx(
                id = record.id + 1, kind = TxKind.TRADE_LOSS,
                amount = settled.stake.toDouble(),
                timestampMillis = record.timestampMillis, signature = mockSignature(),
            )
            TradeResult.Tie -> null
        }
        _state.value = current.copy(
            lastResult = result,
            history = listOf(record) + current.history,
            transactions = listOfNotNull(tx) + current.transactions,
        )
        session.consumeSettled()
        Analytics.log(
            "position_settled",
            mapOf(
                "result" to if (result is TradeResult.Win) "win" else "loss",
                "paper" to "true",
            ),
        )
        resultDismissJob = viewModelScope.launch {
            delay(6_000)
            _state.value = _state.value.copy(lastResult = null)
        }
    }
}

/**
 * MOCK: seed history so the tab reads as a lived-in account. Replaced by the
 * positions indexer (GET /positions) when the backend lands — session trades
 * from [HomeViewModel.settle] already prepend to this list.
 */
private fun mockHistory(): List<TradeRecord> {
    val now = System.currentTimeMillis()
    val minute = 60_000L
    val hour = 60 * minute
    val day = 24 * hour
    fun win(stake: Int) = stake * (HomeUiState.MULTIPLIER - 1)
    return listOf(
        TradeRecord(
            id = 1, matchTitle = "Brasil × França", team = "Brasil",
            direction = Direction.UP, stake = 10, entryOdd = 1.85, exitOdd = 1.91,
            profit = win(10), windowSeconds = 60, timestampMillis = now - 25 * minute,
        ),
        TradeRecord(
            id = 2, matchTitle = "Alemanha × Itália", team = "Itália",
            direction = Direction.DOWN, stake = 5, entryOdd = 3.42, exitOdd = 3.47,
            profit = -5.0, windowSeconds = 120, timestampMillis = now - 1 * hour,
        ),
        TradeRecord(
            id = 3, matchTitle = "Argentina × Espanha", team = "Argentina",
            direction = Direction.UP, stake = 25, entryOdd = 2.08, exitOdd = 2.15,
            profit = win(25), windowSeconds = 60, timestampMillis = now - 3 * hour,
        ),
        TradeRecord(
            id = 4, matchTitle = "México × EUA", team = "EUA",
            direction = Direction.DOWN, stake = 10, entryOdd = 2.92, exitOdd = 2.83,
            profit = win(10), windowSeconds = 300, timestampMillis = now - 1 * day,
        ),
        TradeRecord(
            id = 5, matchTitle = "Alemanha × Itália", team = "Alemanha",
            direction = Direction.UP, stake = 10, entryOdd = 1.96, exitOdd = 1.90,
            profit = -10.0, windowSeconds = 60, timestampMillis = now - 1 * day - 2 * hour,
        ),
        TradeRecord(
            id = 6, matchTitle = "Japão × Coreia do Sul", team = "Japão",
            direction = Direction.UP, stake = 5, entryOdd = 2.60, exitOdd = 2.60,
            profit = 0.0, windowSeconds = 30, timestampMillis = now - 2 * day,
        ),
    )
}

/**
 * MOCK: on-chain activity consistent with [mockHistory] plus the funding
 * stake/unstake. Replaced by the transaction indexer when the backend lands.
 */
private fun mockTransactions(): List<ChainTx> {
    val now = System.currentTimeMillis()
    val minute = 60_000L
    val hour = 60 * minute
    val day = 24 * hour
    fun win(stake: Int) = stake * (HomeUiState.MULTIPLIER - 1)
    return listOf(
        ChainTx(101, TxKind.TRADE_WIN, win(10), now - 25 * minute, mockSignature()),
        ChainTx(102, TxKind.TRADE_LOSS, 5.0, now - 1 * hour, mockSignature()),
        ChainTx(103, TxKind.TRADE_WIN, win(25), now - 3 * hour, mockSignature()),
        ChainTx(104, TxKind.TRADE_WIN, win(10), now - 1 * day, mockSignature()),
        ChainTx(105, TxKind.TRADE_LOSS, 10.0, now - 1 * day - 2 * hour, mockSignature()),
        ChainTx(106, TxKind.UNSTAKE, 30.0, now - 2 * day, mockSignature()),
        ChainTx(107, TxKind.STAKE, 100.0, now - 3 * day, mockSignature()),
    )
}

/** Display-only fake tx signature, already in the truncated "abcd…wxyz" form. */
private fun mockSignature(): String {
    val alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    fun chunk(n: Int) = buildString { repeat(n) { append(alphabet.random()) } }
    return "${chunk(4)}…${chunk(4)}"
}
