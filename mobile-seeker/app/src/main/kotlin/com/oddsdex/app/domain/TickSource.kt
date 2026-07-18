package com.oddsdex.app.domain

import kotlinx.coroutines.flow.Flow

/**
 * Source of a live odds series. The real WebSocket client and the onboarding
 * demo simulator both implement this, so UI built against it (chart, trade
 * screen) is source-agnostic.
 */
interface TickSource {
    fun ticks(): Flow<OddsTick>
}
