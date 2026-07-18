package com.oddsdex.app.ui.chart

import com.oddsdex.app.domain.OddsTick

/**
 * Fixed-capacity ring buffer for the chart series. Writes come from the tick
 * collector coroutine; the draw pass copies into caller-provided arrays so the
 * hot path allocates nothing per frame.
 */
class SeriesBuffer(private val capacity: Int = DEFAULT_CAPACITY) {

    private val odds = DoubleArray(capacity)
    private val times = LongArray(capacity)
    private var head = 0 // next write index
    private var count = 0

    @Synchronized
    fun add(tick: OddsTick) {
        odds[head] = tick.odd
        times[head] = tick.tsMillis
        head = (head + 1) % capacity
        if (count < capacity) count++
    }

    /**
     * Copies the series in chronological order into [outOdds]/[outTimes]
     * (each must be at least [capacity] long). Returns the number of points.
     */
    @Synchronized
    fun snapshotInto(outOdds: DoubleArray, outTimes: LongArray): Int {
        val start = (head - count + capacity) % capacity
        for (i in 0 until count) {
            val idx = (start + i) % capacity
            outOdds[i] = odds[idx]
            outTimes[i] = times[idx]
        }
        return count
    }

    @Synchronized
    fun clear() {
        head = 0
        count = 0
    }

    companion object {
        // ~80s of ticks at 200ms — covers the 60s demo window plus lead-in.
        const val DEFAULT_CAPACITY = 400
    }
}
