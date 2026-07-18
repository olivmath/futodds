package com.oddsdex.app.demo

import com.oddsdex.app.domain.OddsTick
import com.oddsdex.app.domain.TickSource
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.random.Random
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * Demo-only odds generator for the onboarding tutorial, modeled to look like
 * real in-play odds action rather than white noise:
 * - a momentum regime (AR(1)) produces trends and pullbacks,
 * - volatility clusters (calm stretches, nervous stretches),
 * - mean reversion targets a slow-moving anchor (mild pullbacks, no long-run
 *   fight against a trend),
 * - occasional small jumps mimic in-play events.
 *
 * [prefill] generates history synchronously so the chart can show a full,
 * frozen series before the user opens the demo trade; [ticks] then continues
 * the same series live.
 *
 * DEMO ONLY: [bias] couples into the momentum regime so the tutorial trade
 * trends toward the chosen direction and always wins. Nothing outside the
 * onboarding flow may reference this class — real trading uses the
 * WebSocket-backed TickSource.
 */
class SimulatedTickSource(
    baseOdd: Double = BASE_ODD,
    private val tickIntervalMillis: Long = TICK_INTERVAL_MILLIS,
    seed: Long? = null,
) : TickSource {

    private val random = if (seed != null) Random(seed) else Random.Default

    private var odd = baseOdd
    private var anchor = baseOdd
    private var momentum = 0.0
    private var volatility = BASE_VOLATILITY
    private var tsMillis = 0L

    /**
     * Demo rigging only: when set, a soft servo steers the walk toward this
     * value — the odd drifts there and then hovers with normal noise, so the
     * rigged move stays modest and market-like instead of a runaway ramp.
     */
    @Volatile
    private var steerTarget: Double? = null

    @Volatile
    var currentOdd: Double = baseOdd
        private set

    fun steerTo(target: Double) {
        steerTarget = target
    }

    fun clearSteering() {
        steerTarget = null
    }

    /** Synchronously advances the series, returning the generated history. */
    fun prefill(durationMillis: Long): List<OddsTick> {
        val steps = (durationMillis / tickIntervalMillis).toInt()
        return List(steps) { next() }
    }

    override fun ticks(): Flow<OddsTick> = flow {
        while (true) {
            delay(tickIntervalMillis)
            emit(next())
        }
    }

    private fun next(): OddsTick {
        // Servo bias: proportional pull toward the steer target, capped so it
        // stays inside believable per-tick drift.
        val target = steerTarget
        val bias = if (target == null) 0.0
        else ((target - odd) * STEER_GAIN).coerceIn(-MAX_STEER, MAX_STEER)

        // Trend regime: momentum decays, takes random kicks, and (demo rig)
        // is pulled toward the chosen direction through the bias coupling.
        momentum = momentum * MOMENTUM_DECAY +
            (random.nextDouble() - 0.5) * 2 * MOMENTUM_KICK +
            bias * MOMENTUM_COUPLING

        // Volatility clustering: drifts, spikes a little on activity.
        volatility = (volatility * VOLATILITY_DECAY + abs(gaussian()) * VOLATILITY_KICK)
            .coerceIn(MIN_VOLATILITY, MAX_VOLATILITY)

        val jump = if (random.nextDouble() < JUMP_PROBABILITY) {
            (random.nextDouble() - 0.5) * 2 * JUMP_STEP
        } else 0.0

        // Pull toward a slow-following anchor: mild pullbacks within trends.
        anchor += (odd - anchor) * ANCHOR_FOLLOW
        val reversion = (anchor - odd) * REVERSION

        odd = min(
            MAX_ODD,
            max(MIN_ODD, odd + momentum + gaussian() * volatility + jump + reversion + bias),
        )
        currentOdd = odd
        tsMillis += tickIntervalMillis
        return OddsTick(odd, tsMillis)
    }

    /** Approximate standard gaussian (sum of uniforms). */
    private fun gaussian(): Double =
        (random.nextDouble() + random.nextDouble() + random.nextDouble() - 1.5) / 0.5

    companion object {
        const val BASE_ODD = 2.10
        const val TICK_INTERVAL_MILLIS = 200L
        const val MIN_ODD = 1.20
        const val MAX_ODD = 3.50
        const val PREFILL_MILLIS = 45_000L

        private const val BASE_VOLATILITY = 0.0016
        private const val MIN_VOLATILITY = 0.0008
        private const val MAX_VOLATILITY = 0.0040
        private const val VOLATILITY_DECAY = 0.985
        private const val VOLATILITY_KICK = 0.00004

        private const val MOMENTUM_DECAY = 0.96
        private const val MOMENTUM_KICK = 0.00045
        private const val MOMENTUM_COUPLING = 0.04

        private const val ANCHOR_FOLLOW = 0.02
        private const val REVERSION = 0.006

        private const val JUMP_PROBABILITY = 0.03
        private const val JUMP_STEP = 0.010

        private const val STEER_GAIN = 0.06
        private const val MAX_STEER = 0.0020

        /**
         * How far past the entry the demo steers the odd — a modest,
         * believable move (2.10 → ~2.14), not a runaway ramp. The settle
         * clamp still hard-guarantees the win.
         */
        const val TARGET_MOVE = 0.045
    }
}
