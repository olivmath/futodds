package com.oddsdex.app.data

import com.oddsdex.app.api.ApiFixture
import com.oddsdex.app.api.BackendApi
import com.oddsdex.app.ui.home.Match
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Live match catalog. Polls the backend's GET /matches and republishes it as
 * UI models; while the backend is unreachable (or no API_BASE_URL is
 * configured) the catalog stays on [FALLBACK_MATCHES] so the terminal remains
 * usable as a paper-trading demo.
 */
@Singleton
class MatchRepository @Inject constructor(
    private val api: BackendApi,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _matches = MutableStateFlow(FALLBACK_MATCHES)
    val matches: StateFlow<List<Match>> = _matches

    /** True once a real catalog has been received from the backend. */
    private val _live = MutableStateFlow(false)
    val live: StateFlow<Boolean> = _live

    private var pollJob: Job? = null
    private var fixturesById: Map<String, ApiFixture> = emptyMap()
    private var streamedMatchId: String? = null

    /** Idempotent; safe to call from every screen that needs the catalog. */
    fun start() {
        if (!api.isConfigured || pollJob != null) return
        pollJob = scope.launch {
            while (isActive) {
                refresh()
                delay(POLL_INTERVAL_MILLIS)
            }
        }
    }

    private suspend fun refresh() {
        try {
            if (fixturesById.isEmpty()) {
                // Fixture names are static per fixture — fetch once, tolerate
                // absence (backend returns 503 when TxLINE isn't configured).
                fixturesById = try {
                    api.fixtures().associateBy { it.FixtureId.toString() }
                } catch (_: Exception) {
                    emptyMap()
                }
            }
            val open = api.matches().filter { it.status == STATUS_OPEN }
            val mapped = open.mapNotNull { it.toUiMatch(fixturesById) }
            if (mapped.isNotEmpty()) {
                _matches.value = mapped
                _live.value = true
            }
        } catch (_: Exception) {
            // Keep the last known catalog; the poll loop retries.
        }
    }

    /**
     * Tells the backend to feed this match's odds (TxLINE stream → oracle) and
     * releases the previously watched one. Fire-and-forget: the terminal keeps
     * whatever odds the poller already publishes if the call fails.
     */
    fun onMatchWatched(match: Match) {
        if (!match.live || !api.isConfigured) return
        val previous = streamedMatchId
        if (previous == match.id) return
        streamedMatchId = match.id
        scope.launch {
            if (previous != null) {
                try { api.stopStream(previous) } catch (_: Exception) { }
            }
            try { api.startStream(match.id) } catch (_: Exception) { }
        }
    }

    companion object {
        private const val POLL_INTERVAL_MILLIS = 5_000L
        private const val STATUS_OPEN = 0

        /** Demo catalog shown until the backend answers (or without one). */
        val FALLBACK_MATCHES = listOf(
            Match("arg-esp", "Argentina", "Espanha", 2.10, 3.30),
            Match("bra-fra", "Brasil", "França", 1.85, 3.60),
            Match("ing-por", "Inglaterra", "Portugal", 2.45, 2.75),
            Match("ale-ita", "Alemanha", "Itália", 1.95, 3.40),
            Match("mex-eua", "México", "EUA", 2.30, 2.90),
            Match("jap-cor", "Japão", "Coreia do Sul", 2.60, 2.55),
        )
    }
}
