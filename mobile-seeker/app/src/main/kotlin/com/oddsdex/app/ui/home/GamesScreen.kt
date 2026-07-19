package com.oddsdex.app.ui.home

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oddsdex.app.R
import com.oddsdex.app.ui.theme.JetBrainsMonoFamily
import com.oddsdex.app.ui.theme.OddsdexColors
import java.util.Locale

/**
 * Games tab (reference: imgs/negociacoes.png adapted): the asset list.
 * Live matches with their odds; tapping one makes it the terminal's series.
 */
@Composable
fun GamesScreen(
    state: HomeUiState,
    currentOddOf: (Match) -> Double,
    onMatchSelected: (Match) -> Boolean,
    onOpenTerminal: () -> Unit,
) {
    val context = LocalContext.current
    var liveTab by remember { mutableStateOf(true) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(OddsdexColors.Background)
            .statusBarsPadding()
            .padding(horizontal = 20.dp),
    ) {
        Spacer(Modifier.height(28.dp))
        Text(
            text = stringResource(R.string.games_title),
            color = OddsdexColors.TextPrimary,
            fontSize = 32.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(16.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(22.dp)) {
            TabLabel(stringResource(R.string.games_tab_live), liveTab) { liveTab = true }
            TabLabel(stringResource(R.string.games_tab_upcoming), !liveTab) { liveTab = false }
        }
        Spacer(Modifier.height(18.dp))

        if (liveTab) {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(state.matches, key = { it.id }) { match ->
                    val selected = match.id == state.selectedMatch.id
                    MatchRow(
                        match = match,
                        odd = currentOddOf(match),
                        // The live odd shown is the tracked team's series.
                        trackedTeam = if (selected) {
                            match.nameOf(state.selectedSide)
                        } else {
                            match.home
                        },
                        selected = selected,
                        onClick = {
                            if (onMatchSelected(match)) {
                                onOpenTerminal()
                            } else {
                                Toast.makeText(
                                    context,
                                    R.string.games_switch_blocked,
                                    Toast.LENGTH_SHORT,
                                ).show()
                            }
                        },
                    )
                }
            }
        } else {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.games_empty_upcoming),
                    color = OddsdexColors.TextSecondary,
                    fontSize = 15.sp,
                )
            }
        }
    }
}

@Composable
private fun TabLabel(text: String, selected: Boolean, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.clickable(onClick = onClick),
    ) {
        Text(
            text = text,
            color = if (selected) OddsdexColors.TextPrimary else OddsdexColors.TextSecondary,
            fontSize = 17.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(6.dp))
        Box(
            modifier = Modifier
                .width(28.dp)
                .height(3.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(if (selected) OddsdexColors.Up else OddsdexColors.Background),
        )
    }
}

@Composable
private fun MatchRow(
    match: Match,
    odd: Double,
    trackedTeam: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(
                if (selected) OddsdexColors.ChipSurface else OddsdexColors.Surface,
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(OddsdexColors.Up),
        )
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = match.title,
                color = OddsdexColors.TextPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
            )
            Text(
                text = stringResource(R.string.games_odd_label, trackedTeam),
                color = OddsdexColors.TextSecondary,
                fontSize = 13.sp,
            )
        }
        Text(
            text = String.format(Locale.US, "%.2f", odd),
            color = if (selected) OddsdexColors.Up else OddsdexColors.TextPrimary,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = JetBrainsMonoFamily,
        )
    }
}
