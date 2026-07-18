package com.oddsdex.app

import com.oddsdex.app.demo.SimulatedTickSource
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SimulatedTickSourceTest {

    @Test
    fun `same seed produces the same series`() = runTest {
        val a = SimulatedTickSource(seed = 42L).ticks().take(100).toList().map { it.odd }
        val b = SimulatedTickSource(seed = 42L).ticks().take(100).toList().map { it.odd }
        assertEquals(a, b)
    }

    @Test
    fun `prefill and live ticks form one continuous series`() = runTest {
        val source = SimulatedTickSource(seed = 42L)
        val history = source.prefill(SimulatedTickSource.PREFILL_MILLIS)
        assertEquals(
            (SimulatedTickSource.PREFILL_MILLIS / SimulatedTickSource.TICK_INTERVAL_MILLIS).toInt(),
            history.size,
        )
        val live = source.ticks().take(5).toList()
        // Timestamps continue monotonically from the prefilled history.
        assertTrue(live.first().tsMillis > history.last().tsMillis)
        assertEquals(source.currentOdd, live.last().odd, 0.0)
    }

    @Test
    fun `odds stay within plausible bounds`() = runTest {
        val odds = SimulatedTickSource(seed = 7L).ticks().take(500).toList().map { it.odd }
        assertTrue(odds.all { it in SimulatedTickSource.MIN_ODD..SimulatedTickSource.MAX_ODD })
    }

    @Test
    fun `steering up wins with a modest move over a 60s window`() = runTest {
        // 300 ticks ~ 60s at 200ms, after a realistic prefilled lead-in.
        for (seed in 1L..20L) {
            val source = SimulatedTickSource(seed = seed)
            source.prefill(SimulatedTickSource.PREFILL_MILLIS)
            val entry = source.currentOdd
            source.steerTo(entry + SimulatedTickSource.TARGET_MOVE)
            val exit = source.ticks().take(300).toList().last().odd
            assertTrue("seed $seed: expected rise, got $entry -> $exit", exit > entry)
            assertTrue(
                "seed $seed: move too large, got $entry -> $exit",
                exit < entry + SimulatedTickSource.TARGET_MOVE * 3,
            )
        }
    }

    @Test
    fun `steering down wins with a modest move over a 60s window`() = runTest {
        for (seed in 1L..20L) {
            val source = SimulatedTickSource(seed = seed)
            source.prefill(SimulatedTickSource.PREFILL_MILLIS)
            val entry = source.currentOdd
            source.steerTo(entry - SimulatedTickSource.TARGET_MOVE)
            val exit = source.ticks().take(300).toList().last().odd
            assertTrue("seed $seed: expected fall, got $entry -> $exit", exit < entry)
            assertTrue(
                "seed $seed: move too large, got $entry -> $exit",
                exit > entry - SimulatedTickSource.TARGET_MOVE * 3,
            )
        }
    }
}
