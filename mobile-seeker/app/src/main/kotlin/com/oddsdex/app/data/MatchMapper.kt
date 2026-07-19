package com.oddsdex.app.data

import com.oddsdex.app.api.ApiFixture
import com.oddsdex.app.api.ApiMatch
import com.oddsdex.app.ui.home.Match

/**
 * The oracle stores odds as implied probabilities in basis points (sum 10000);
 * the terminal trades the decimal odd, so the mapping is the reciprocal.
 * Returns 0.0 for unset/corrupt values — callers must treat that as "no odd".
 */
fun decimalOdd(bps: Int): Double = if (bps <= 0) 0.0 else 10000.0 / bps

/**
 * Resolves display names for a backend match: TxLINE fixture (keyed by the
 * match id, which IS the FixtureId for txline matches) wins; then a separator
 * in the free-text tag; then the "arg-esp" id convention; last resort is the
 * raw tag/id as a single title.
 */
fun teamNamesFor(match: ApiMatch, fixturesById: Map<String, ApiFixture>): Pair<String, String> {
    fixturesById[match.id]?.let { fixture ->
        val home = fixture.homeName?.takeIf { it.isNotBlank() }
        val away = fixture.awayName?.takeIf { it.isNotBlank() }
        if (home != null && away != null) return home to away
    }
    val tag = match.tag.trim()
    for (separator in TAG_SEPARATORS) {
        val parts = tag.split(separator, ignoreCase = true)
        if (parts.size == 2 && parts[0].isNotBlank() && parts[1].isNotBlank()) {
            return parts[0].trim() to parts[1].trim()
        }
    }
    val idParts = match.id.split("-")
    if (idParts.size == 2 && idParts.none { it.isBlank() || it.all(Char::isDigit) }) {
        return idParts[0].replaceFirstChar(Char::uppercase) to
            idParts[1].replaceFirstChar(Char::uppercase)
    }
    return (tag.ifBlank { match.id }) to ""
}

/** Backend match → UI catalog entry. Null when the odds can't seed a series. */
fun ApiMatch.toUiMatch(fixturesById: Map<String, ApiFixture>): Match? {
    val home = decimalOdd(odds.home)
    val away = decimalOdd(odds.away)
    if (home <= 0.0 || away <= 0.0) return null
    val (homeName, awayName) = teamNamesFor(this, fixturesById)
    return Match(
        id = id,
        home = homeName,
        away = awayName,
        baseOdd = home,
        awayOdd = away,
        live = true,
    )
}

private val TAG_SEPARATORS = listOf(" x ", " × ", " vs ", " v ", " - ")
