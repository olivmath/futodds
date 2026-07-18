package com.oddsdex.app.ui.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oddsdex.app.ui.theme.OddsdexColors

/**
 * Stake/window steppers plus the DOWN/UP action pair, laid out like the
 * reference. In the onboarding demo the steppers are fixed (100 USDC, 60s);
 * `onMinus`/`onPlus` become functional on the real trade screen.
 */
@Composable
fun TradeControls(
    stakeLabel: String,
    windowLabel: String,
    downLabel: String,
    upLabel: String,
    enabled: Boolean,
    onDown: () -> Unit,
    onUp: () -> Unit,
    modifier: Modifier = Modifier,
    onStakeMinus: (() -> Unit)? = null,
    onStakePlus: (() -> Unit)? = null,
    onWindowMinus: (() -> Unit)? = null,
    onWindowPlus: (() -> Unit)? = null,
) {
    Column(modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            StepperChip(stakeLabel, Modifier.weight(1f), onStakeMinus, onStakePlus)
            StepperChip(windowLabel, Modifier.weight(1f), onWindowMinus, onWindowPlus)
        }
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ActionButton(
                label = downLabel,
                arrow = "↓",
                color = OddsdexColors.Down,
                enabled = enabled,
                onClick = onDown,
                modifier = Modifier.weight(1f),
            )
            ActionButton(
                label = upLabel,
                arrow = "↑",
                color = OddsdexColors.Up,
                enabled = enabled,
                onClick = onUp,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun StepperChip(
    label: String,
    modifier: Modifier = Modifier,
    onMinus: (() -> Unit)? = null,
    onPlus: (() -> Unit)? = null,
) {
    Row(
        modifier = modifier
            .height(52.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(OddsdexColors.ChipSurface),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        StepperSymbol("−", onMinus)
        Text(
            text = label,
            color = OddsdexColors.TextPrimary,
            fontSize = 17.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        StepperSymbol("+", onPlus)
    }
}

@Composable
private fun StepperSymbol(symbol: String, onClick: (() -> Unit)? = null) {
    Box(
        modifier = Modifier
            .width(44.dp)
            .height(52.dp)
            .then(
                if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = symbol,
            color = if (onClick != null) OddsdexColors.TextPrimary else OddsdexColors.TextSecondary,
            fontSize = 20.sp,
        )
    }
}

@Composable
private fun ActionButton(
    label: String,
    arrow: String,
    color: Color,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.94f else 1f,
        animationSpec = spring(stiffness = Spring.StiffnessMedium),
        label = "action-press",
    )
    Box(
        modifier = modifier
            .height(60.dp)
            .graphicsLayer {
                scaleX = scale
                scaleY = scale
            }
            .clip(RoundedCornerShape(16.dp))
            .background(if (enabled) color else color.copy(alpha = 0.35f))
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = label,
                color = Color.White,
                fontSize = 19.sp,
                fontWeight = FontWeight.Bold,
            )
            Spacer(Modifier.width(10.dp))
            Text(text = arrow, color = Color.White, fontSize = 20.sp, fontWeight = FontWeight.Bold)
        }
    }
}
