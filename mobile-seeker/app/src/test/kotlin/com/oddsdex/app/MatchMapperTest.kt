package com.oddsdex.app

import com.oddsdex.app.api.ApiFixture
import com.oddsdex.app.api.ApiMatch
import com.oddsdex.app.api.ApiOdds
import com.oddsdex.app.data.decimalOdd
import com.oddsdex.app.data.teamNamesFor
import com.oddsdex.app.data.toUiMatch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MatchMapperTest {

    @Test
    fun `decimal odd is the reciprocal of the implied probability`() {
        assertEquals(3.0, decimalOdd(3334), 0.01)
        assertEquals(2.0, decimalOdd(5000), 0.001)
        assertEquals(0.0, decimalOdd(0), 0.0)
        assertEquals(0.0, decimalOdd(-10), 0.0)
    }

    @Test
    fun `fixture names win over tag and id`() {
        val match = ApiMatch(id = "17588229", tag = "whatever")
        val fixtures = mapOf("17588229" to ApiFixture(17588229, "Arsenal", "Chelsea"))
        assertEquals("Arsenal" to "Chelsea", teamNamesFor(match, fixtures))
    }

    @Test
    fun `txline participant fields resolve home and away`() {
        val match = ApiMatch(id = "18257739")
        val fixtures = mapOf(
            "18257739" to ApiFixture(
                FixtureId = 18257739,
                Participant1 = "Spain",
                Participant2 = "Argentina",
                Participant1IsHome = true,
            ),
        )
        assertEquals("Spain" to "Argentina", teamNamesFor(match, fixtures))

        val awayFirst = mapOf(
            "18257739" to ApiFixture(
                FixtureId = 18257739,
                Participant1 = "Argentina",
                Participant2 = "Spain",
                Participant1IsHome = false,
            ),
        )
        assertEquals("Spain" to "Argentina", teamNamesFor(match, awayFirst))
    }

    @Test
    fun `tag with separator is parsed into home and away`() {
        val fixtures = emptyMap<String, ApiFixture>()
        assertEquals(
            "Flamengo" to "Palmeiras",
            teamNamesFor(ApiMatch(id = "1", tag = "Flamengo x Palmeiras"), fixtures),
        )
        assertEquals(
            "Real" to "Barça",
            teamNamesFor(ApiMatch(id = "2", tag = "Real vs Barça"), fixtures),
        )
    }

    @Test
    fun `id convention arg-esp still resolves without tag or fixture`() {
        val names = teamNamesFor(ApiMatch(id = "arg-esp"), emptyMap())
        assertEquals("Arg" to "Esp", names)
    }

    @Test
    fun `numeric id without fixture or tag falls back to single title`() {
        val names = teamNamesFor(ApiMatch(id = "17588229"), emptyMap())
        assertEquals("17588229" to "", names)
    }

    @Test
    fun `backend match maps to a live ui match with decimal odds`() {
        val api = ApiMatch(
            id = "17588229",
            tag = "Arsenal x Chelsea",
            odds = ApiOdds(home = 4000, away = 3500, draw = 2500),
        )
        val match = requireNotNull(api.toUiMatch(emptyMap()))
        assertTrue(match.live)
        assertEquals(2.5, match.baseOdd, 0.001)
        assertEquals(10000.0 / 3500, match.awayOdd, 0.001)
        assertEquals("Arsenal", match.home)
    }

    @Test
    fun `match with unset odds is dropped`() {
        val api = ApiMatch(id = "x", odds = ApiOdds(home = 0, away = 5000, draw = 5000))
        assertNull(api.toUiMatch(emptyMap()))
    }
}
