package com.oddsdex.app.ui.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.oddsdex.app.core.Analytics
import com.oddsdex.app.demo.SimulatedTickSource
import com.oddsdex.app.ui.chart.SeriesBuffer
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlin.math.max
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

enum class OnboardingStep { INTRO, EXPLAIN, RUNNING, RESULT, HANDOFF }

enum class Direction { UP, DOWN }

data class OnboardingUiState(
    val step: OnboardingStep = OnboardingStep.INTRO,
    val direction: Direction? = null,
    val entryOdd: Double? = null,
    val exitOdd: Double? = null,
    val remainingSeconds: Int = DEMO_WINDOW_SECONDS,
) {
    companion object {
        const val DEMO_WINDOW_SECONDS = 60
        const val DEMO_STAKE_USDC = 100
        const val DEMO_MULTIPLIER = 1.93
        val DEMO_PROFIT_USDC = (DEMO_STAKE_USDC * (DEMO_MULTIPLIER - 1)).toInt() // 93
    }
}

@HiltViewModel
class OnboardingViewModel @Inject constructor() : ViewModel() {

    private val tickSource = SimulatedTickSource()
    val chartBuffer = SeriesBuffer()

    private var countdownJob: Job? = null

    private val _state = MutableStateFlow(OnboardingUiState())
    val state: StateFlow<OnboardingUiState> = _state

    init {
        Analytics.log("onboarding_started")
        // The intro shows a full, frozen series; it comes alive on choice.
        tickSource.prefill(SimulatedTickSource.PREFILL_MILLIS)
            .forEach(chartBuffer::add)
    }

    fun onIntroContinue() {
        _state.value = _state.value.copy(step = OnboardingStep.EXPLAIN)
    }

    /**
     * The chart and its animation only start here — the series is born the
     * moment the user commits to a direction (product decision 2026-07-17).
     */
    fun onDirectionPicked(direction: Direction) {
        if (_state.value.step != OnboardingStep.EXPLAIN) return
        val entry = tickSource.currentOdd
        // DEMO ONLY — steer the walk to a modest winning move.
        tickSource.steerTo(
            when (direction) {
                Direction.UP -> entry + SimulatedTickSource.TARGET_MOVE
                Direction.DOWN -> entry - SimulatedTickSource.TARGET_MOVE
            },
        )
        viewModelScope.launch {
            tickSource.ticks().collect { chartBuffer.add(it) }
        }
        _state.value = _state.value.copy(
            step = OnboardingStep.RUNNING,
            direction = direction,
            entryOdd = entry,
            remainingSeconds = OnboardingUiState.DEMO_WINDOW_SECONDS,
        )
        Analytics.log("demo_trade_opened", mapOf("direction" to direction.name))
        countdownJob = viewModelScope.launch {
            for (remaining in OnboardingUiState.DEMO_WINDOW_SECONDS - 1 downTo 0) {
                delay(1_000)
                _state.value = _state.value.copy(remainingSeconds = remaining)
            }
            settle()
        }
    }

    /** Cash-out: the user can close the position at any moment while it runs. */
    fun onCloseNow() {
        if (_state.value.step != OnboardingStep.RUNNING) return
        countdownJob?.cancel()
        countdownJob = null
        Analytics.log("demo_trade_closed_early")
        settle()
    }

    private fun settle() {
        val current = _state.value
        val direction = current.direction ?: return
        val entry = current.entryOdd ?: return
        tickSource.clearSteering()
        // The bias makes a win statistically certain; this clamp makes it a
        // hard guarantee for the demo, so the tutorial can never end in a loss.
        val minMargin = 0.01
        val exit = when (direction) {
            Direction.UP -> max(tickSource.currentOdd, entry + minMargin)
            Direction.DOWN -> minOf(tickSource.currentOdd, entry - minMargin)
        }
        _state.value = current.copy(
            step = OnboardingStep.RESULT,
            exitOdd = exit,
        )
        Analytics.log("demo_trade_settled", mapOf("result" to "win"))
    }

    fun onResultContinue() {
        _state.value = _state.value.copy(step = OnboardingStep.HANDOFF)
        Analytics.log("onboarding_completed")
    }
}
