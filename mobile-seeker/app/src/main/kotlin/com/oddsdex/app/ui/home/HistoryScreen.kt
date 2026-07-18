package com.oddsdex.app.ui.home

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oddsdex.app.R
import com.oddsdex.app.ui.onboarding.Direction
import com.oddsdex.app.ui.theme.JetBrainsMonoFamily
import com.oddsdex.app.ui.theme.OddsdexColors
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

/**
 * History tab: the player's settled trades, newest first. Session trades are
 * real ([HomeViewModel.settle] prepends them); older entries are mock until
 * the positions indexer lands. Scoreboard on top — net result first, because
 * "am I up or down?" is the question every trader opens this tab with.
 */
@Composable
fun HistoryScreen(history: List<TradeRecord>) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(OddsdexColors.Background)
            .statusBarsPadding()
            .padding(horizontal = 20.dp),
    ) {
        Spacer(Modifier.height(28.dp))
        Text(
            text = stringResource(R.string.history_title),
            color = OddsdexColors.TextPrimary,
            fontSize = 32.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(16.dp))

        if (history.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = stringResource(R.string.history_empty),
                    color = OddsdexColors.TextSecondary,
                    fontSize = 15.sp,
                )
            }
            return@Column
        }

        Scoreboard(history)
        Spacer(Modifier.height(18.dp))

        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(history, key = { it.id }) { record ->
                TradeRow(record)
            }
            item { Spacer(Modifier.height(12.dp)) }
        }
    }
}

@Composable
private fun Scoreboard(history: List<TradeRecord>) {
    val net = history.sumOf { it.profit }
    val wins = history.count { it.profit > 0 }
    val losses = history.count { it.profit < 0 }
    val decided = wins + losses // ties don't count either way
    val winRate = if (decided == 0) null else wins * 100 / decided

    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        StatTile(
            label = stringResource(R.string.history_stat_pnl),
            value = formatSigned(net),
            valueColor = when {
                net > 0 -> OddsdexColors.Up
                net < 0 -> OddsdexColors.Down
                else -> OddsdexColors.TextPrimary
            },
            modifier = Modifier.weight(1f),
        )
        StatTile(
            label = stringResource(R.string.history_stat_winrate),
            value = winRate?.let { "$it%" } ?: "—",
            valueColor = OddsdexColors.TextPrimary,
            modifier = Modifier.weight(1f),
        )
        StatTile(
            label = stringResource(R.string.history_stat_trades),
            value = "${history.size}",
            valueColor = OddsdexColors.TextPrimary,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun StatTile(
    label: String,
    value: String,
    valueColor: Color,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(OddsdexColors.Surface)
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Text(
            text = label,
            color = OddsdexColors.TextSecondary,
            fontSize = 12.sp,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = value,
            color = valueColor,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = JetBrainsMonoFamily,
            maxLines = 1,
        )
    }
}

@Composable
private fun TradeRow(record: TradeRecord) {
    val up = record.direction == Direction.UP
    val directionColor = if (up) OddsdexColors.Up else OddsdexColors.Down
    val directionLabel = stringResource(
        if (up) R.string.direction_up else R.string.direction_down,
    )

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(OddsdexColors.Surface)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(OddsdexColors.ChipSurface),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                if (up) Icons.AutoMirrored.Filled.TrendingUp
                else Icons.AutoMirrored.Filled.TrendingDown,
                contentDescription = directionLabel,
                tint = directionColor,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = record.team,
                    color = OddsdexColors.TextPrimary,
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = directionLabel,
                    color = directionColor,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 1.sp,
                )
            }
            Spacer(Modifier.height(2.dp))
            Text(
                text = "${record.matchTitle} · ${record.stake} USDC · " +
                    "${windowText(record.windowSeconds)} · ${timeText(record.timestampMillis)}",
                color = OddsdexColors.TextSecondary,
                fontSize = 12.sp,
                maxLines = 1,
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(horizontalAlignment = Alignment.End) {
            Text(
                text = formatSigned(record.profit),
                color = when {
                    record.profit > 0 -> OddsdexColors.Up
                    record.profit < 0 -> OddsdexColors.Down
                    else -> OddsdexColors.TextSecondary
                },
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = JetBrainsMonoFamily,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = stringResource(
                    R.string.result_odds,
                    formatOdd(record.entryOdd),
                    formatOdd(record.exitOdd),
                ),
                color = OddsdexColors.TextSecondary,
                fontSize = 12.sp,
                fontFamily = JetBrainsMonoFamily,
            )
        }
    }
}

/** +9.30 / −10.00 / 0.00 — sign always visible; U+2212 minus matches the font. */
private fun formatSigned(value: Double): String = when {
    value > 0 -> String.format(Locale.US, "+%.2f", value)
    value < 0 -> String.format(Locale.US, "−%.2f", -value)
    else -> "0.00"
}

private fun formatOdd(odd: Double): String = String.format(Locale.US, "%.2f", odd)

private fun windowText(seconds: Int): String =
    if (seconds < 60) "${seconds}s" else "${seconds / 60}min"

/** Same day → "14:32"; older → "12 jul". */
private fun timeText(timestampMillis: Long): String {
    val then = Calendar.getInstance().apply { timeInMillis = timestampMillis }
    val today = Calendar.getInstance()
    val sameDay = then.get(Calendar.YEAR) == today.get(Calendar.YEAR) &&
        then.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR)
    val pattern = if (sameDay) "HH:mm" else "d MMM"
    return SimpleDateFormat(pattern, Locale.getDefault()).format(timestampMillis)
}
