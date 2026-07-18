package com.oddsdex.app.domain

/** One point of an odds series. [tsMillis] is monotonic within a session. */
data class OddsTick(
    val odd: Double,
    val tsMillis: Long,
)
