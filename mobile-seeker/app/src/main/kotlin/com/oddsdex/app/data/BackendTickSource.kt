package com.oddsdex.app.data

import com.oddsdex.app.api.BackendApi
import com.oddsdex.app.domain.OddsTick
import com.oddsdex.app.domain.TickSource
import com.oddsdex.app.ui.home.TeamSide
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.delay

/**
 * TickSource over the backend's oracle odds for one match/side. The backend
 * republishes odds at its poll cadence, so this source refreshes GET /matches
 * every [REFRESH_MILLIS] and emits the latest known odd at chart cadence
 * ([TICK_INTERVAL_MILLIS]) so the series keeps scrolling between updates.
 */
class BackendTickSource(
    private val api: BackendApi,
    private val matchId: String,
    private val side: TeamSide,
    initialOdd: Double,
) : TickSource {

    @Volatile
    override var currentOdd: Double = initialOdd
        private set

    private var tsMillis = 0L

    /**
     * Flat lead-in at the last known odd so the chart opens with a full
     * series instead of a bare head (there is no odds-history endpoint yet).
     */
    fun prefill(durationMillis: Long): List<OddsTick> {
        val steps = (durationMillis / TICK_INTERVAL_MILLIS).toInt()
        return List(steps) { OddsTick(currentOdd, advance()) }
    }

    override fun ticks(): Flow<OddsTick> = flow {
        var sinceRefresh = REFRESH_MILLIS // refresh immediately on start
        while (true) {
            if (sinceRefresh >= REFRESH_MILLIS) {
                sinceRefresh = 0
                refreshOdd()
            }
            emit(OddsTick(currentOdd, advance()))
            delay(TICK_INTERVAL_MILLIS)
            sinceRefresh += TICK_INTERVAL_MILLIS
        }
    }

    private fun advance(): Long {
        tsMillis += TICK_INTERVAL_MILLIS
        return tsMillis
    }

    private suspend fun refreshOdd() {
        val match = try {
            api.matches().firstOrNull { it.id == matchId }
        } catch (_: Exception) {
            null // network hiccup: keep emitting the last odd, retry next cycle
        } ?: return
        val bps = if (side == TeamSide.HOME) match.odds.home else match.odds.away
        val odd = decimalOdd(bps)
        if (odd > 0.0) currentOdd = odd
    }

    companion object {
        const val TICK_INTERVAL_MILLIS = 250L
        const val REFRESH_MILLIS = 2_000L
        const val PREFILL_MILLIS = 45_000L
    }
}
