package com.oddsdex.app.api

import com.oddsdex.app.BuildConfig
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.serialization.kotlinx.json.json
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** On-chain odds as stored by the oracle: implied probabilities in basis points (sum 10000). */
@Serializable
data class ApiOdds(
    val home: Int = 0,
    val away: Int = 0,
    val draw: Int = 0,
)

/** One match from GET /matches (decoded oracle account + backend stream state). */
@Serializable
data class ApiMatch(
    val id: String,
    val tag: String = "",
    val odds: ApiOdds = ApiOdds(),
    val status: Int = 0,
    val oddsSource: String? = null,
    val streamStatus: String? = null,
)

/**
 * One TxLINE fixture from GET /fixtures — used to resolve team names for a
 * match id. The live payload names teams Participant1/Participant2 (with
 * [Participant1IsHome]); Home/Away are kept as a fallback shape.
 */
@Serializable
data class ApiFixture(
    val FixtureId: Long,
    val Home: String? = null,
    val Away: String? = null,
    val Participant1: String? = null,
    val Participant2: String? = null,
    val Participant1IsHome: Boolean? = null,
) {
    val homeName: String?
        get() = Home ?: if (Participant1IsHome == false) Participant2 else Participant1

    val awayName: String?
        get() = Away ?: if (Participant1IsHome == false) Participant1 else Participant2
}

/**
 * Thin HTTP client over the FutOdds backend (backend/src/server.js). Base URL
 * comes from BuildConfig.API_BASE_URL per flavor; when it is blank the app has
 * no backend configured and callers fall back to the local mock catalog.
 */
@Singleton
class BackendApi @Inject constructor() {

    val baseUrl: String = BuildConfig.API_BASE_URL.trimEnd('/')
    val isConfigured: Boolean = baseUrl.isNotBlank()

    private val client = HttpClient(OkHttp) {
        install(ContentNegotiation) {
            json(
                Json {
                    ignoreUnknownKeys = true
                    isLenient = true
                },
            )
        }
        install(HttpTimeout) {
            connectTimeoutMillis = 4_000
            requestTimeoutMillis = 8_000
        }
    }

    suspend fun matches(): List<ApiMatch> = client.get("$baseUrl/matches").body()

    suspend fun fixtures(): List<ApiFixture> = client.get("$baseUrl/fixtures").body()

    /** Asks the backend to start pushing TxLINE odds for this match on-chain. */
    suspend fun startStream(matchId: String) {
        client.post("$baseUrl/stream/start/$matchId")
    }

    suspend fun stopStream(matchId: String) {
        client.post("$baseUrl/stream/stop/$matchId")
    }
}
