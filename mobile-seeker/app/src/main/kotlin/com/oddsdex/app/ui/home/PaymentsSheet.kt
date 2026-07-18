package com.oddsdex.app.ui.home

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.TrendingDown
import androidx.compose.material.icons.automirrored.filled.TrendingUp
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Savings
import androidx.compose.material.icons.filled.SystemUpdateAlt
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oddsdex.app.R
import com.oddsdex.app.ui.components.GradientButton
import com.oddsdex.app.ui.theme.JetBrainsMonoFamily
import com.oddsdex.app.ui.theme.OddsdexColors
import java.util.Locale

private enum class PaymentsPage { MENU, STAKE, UNSTAKE, TRANSACTIONS }

/**
 * "Pagamentos" bottom sheet with in-sheet pages. Stake/unstake move USDC
 * between the wallet and the trading account (the staked 1:1 token) with a
 * mocked on-chain confirmation; Transactions lists the chain activity. On
 * success the sheet returns to the menu, where the banner AND the updated
 * balances tell the story together.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaymentsSheet(
    walletUsdc: Double,
    tradingBalance: Double,
    busy: Boolean,
    notice: PaymentsNotice?,
    transactions: List<ChainTx>,
    onStake: (Double) -> Unit,
    onUnstake: (Double) -> Unit,
    onNoticeDismissed: () -> Unit,
    onDismiss: () -> Unit,
) {
    var page by remember { mutableStateOf(PaymentsPage.MENU) }

    // A confirmed operation lands the user back on the menu with the banner.
    LaunchedEffect(notice) {
        if (notice != null) page = PaymentsPage.MENU
    }

    ModalBottomSheet(
        onDismissRequest = {
            onNoticeDismissed()
            onDismiss()
        },
        containerColor = OddsdexColors.Surface,
    ) {
        BackHandler(enabled = page != PaymentsPage.MENU) { page = PaymentsPage.MENU }
        AnimatedContent(
            targetState = page,
            transitionSpec = { fadeIn() togetherWith fadeOut() },
            label = "payments-page",
        ) { current ->
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp)
                    .padding(bottom = 24.dp),
            ) {
                when (current) {
                    PaymentsPage.MENU -> MenuPage(
                        walletUsdc = walletUsdc,
                        tradingBalance = tradingBalance,
                        notice = notice,
                        onOpen = { page = it },
                    )
                    PaymentsPage.STAKE -> AmountPage(
                        title = stringResource(R.string.payments_stake),
                        description = stringResource(R.string.payments_stake_desc),
                        available = walletUsdc,
                        receiveTemplate = R.string.payments_receive_trading,
                        busy = busy,
                        onBack = { page = PaymentsPage.MENU },
                        onConfirm = onStake,
                    )
                    PaymentsPage.UNSTAKE -> AmountPage(
                        title = stringResource(R.string.payments_unstake),
                        description = stringResource(R.string.payments_unstake_desc),
                        available = tradingBalance,
                        receiveTemplate = R.string.payments_receive_wallet,
                        busy = busy,
                        onBack = { page = PaymentsPage.MENU },
                        onConfirm = onUnstake,
                    )
                    PaymentsPage.TRANSACTIONS -> TransactionsPage(
                        transactions = transactions,
                        onBack = { page = PaymentsPage.MENU },
                    )
                }
            }
        }
    }
}

// ───────────────────────────── menu ─────────────────────────────

@Composable
private fun MenuPage(
    walletUsdc: Double,
    tradingBalance: Double,
    notice: PaymentsNotice?,
    onOpen: (PaymentsPage) -> Unit,
) {
    Text(
        text = stringResource(R.string.payments_title),
        color = OddsdexColors.TextPrimary,
        fontSize = 22.sp,
        fontWeight = FontWeight.Bold,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
    )

    BalanceCard(walletUsdc, tradingBalance)

    if (notice != null) {
        Spacer(Modifier.height(12.dp))
        SuccessBanner(notice)
    }

    Spacer(Modifier.height(16.dp))
    GradientButton(
        text = stringResource(R.string.payments_stake),
        onClick = { onOpen(PaymentsPage.STAKE) },
    )
    Spacer(Modifier.height(12.dp))
    SheetRow(
        Icons.Filled.SystemUpdateAlt,
        stringResource(R.string.payments_unstake),
    ) { onOpen(PaymentsPage.UNSTAKE) }
    Spacer(Modifier.height(12.dp))
    SheetRow(
        Icons.Filled.History,
        stringResource(R.string.payments_transactions),
    ) { onOpen(PaymentsPage.TRANSACTIONS) }
}

@Composable
private fun BalanceCard(walletUsdc: Double, tradingBalance: Double) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(OddsdexColors.ChipSurface)
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Text(
            text = stringResource(R.string.payments_trading_balance),
            color = OddsdexColors.TextSecondary,
            fontSize = 12.sp,
        )
        Text(
            text = usdc(tradingBalance),
            color = OddsdexColors.TextPrimary,
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = JetBrainsMonoFamily,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = stringResource(R.string.payments_wallet_balance, usdc(walletUsdc)),
            color = OddsdexColors.TextSecondary,
            fontSize = 13.sp,
        )
    }
}

@Composable
private fun SuccessBanner(notice: PaymentsNotice) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(OddsdexColors.Up.copy(alpha = 0.16f))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = OddsdexColors.Up,
            modifier = Modifier.size(20.dp),
        )
        Spacer(Modifier.width(10.dp))
        Text(
            text = stringResource(
                if (notice.kind == PaymentsKind.STAKE) R.string.payments_stake_done
                else R.string.payments_unstake_done,
                usdc(notice.amount),
            ),
            color = OddsdexColors.Up,
            fontSize = 14.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

// ─────────────────────── stake / unstake ───────────────────────

@Composable
private fun AmountPage(
    title: String,
    description: String,
    available: Double,
    receiveTemplate: Int,
    busy: Boolean,
    onBack: () -> Unit,
    onConfirm: (Double) -> Unit,
) {
    var input by remember { mutableStateOf("") }
    val amount = input.replace(',', '.').toDoubleOrNull() ?: 0.0
    val tooHigh = amount > available
    val valid = amount > 0 && !tooHigh

    PageHeader(title, enabled = !busy, onBack = onBack)
    Spacer(Modifier.height(4.dp))
    Text(
        text = description,
        color = OddsdexColors.TextSecondary,
        fontSize = 14.sp,
    )
    Spacer(Modifier.height(20.dp))

    // Big centered amount — the single decision on this page.
    BasicTextField(
        value = input,
        onValueChange = { raw ->
            input = raw.filter { it.isDigit() || it == '.' || it == ',' }
        },
        enabled = !busy,
        textStyle = TextStyle(
            color = OddsdexColors.TextPrimary,
            fontSize = 40.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = JetBrainsMonoFamily,
            textAlign = TextAlign.Center,
        ),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        cursorBrush = SolidColor(OddsdexColors.Up),
        singleLine = true,
        decorationBox = { inner ->
            Box(contentAlignment = Alignment.Center) {
                if (input.isEmpty()) {
                    Text(
                        text = "0.00",
                        color = OddsdexColors.TextSecondary.copy(alpha = 0.5f),
                        fontSize = 40.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = JetBrainsMonoFamily,
                    )
                }
                inner()
            }
        },
        modifier = Modifier.fillMaxWidth(),
    )
    Spacer(Modifier.height(10.dp))

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = if (tooHigh) stringResource(R.string.payments_amount_too_high)
            else stringResource(R.string.payments_available, usdc(available)),
            color = if (tooHigh) OddsdexColors.Down else OddsdexColors.TextSecondary,
            fontSize = 13.sp,
            modifier = Modifier.weight(1f),
        )
        Text(
            text = stringResource(R.string.payments_max),
            color = OddsdexColors.Up,
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp,
            modifier = Modifier
                .clip(RoundedCornerShape(10.dp))
                .background(OddsdexColors.ChipSurface)
                .clickable(enabled = !busy) {
                    input = String.format(Locale.US, "%.2f", available)
                }
                .padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }

    if (valid) {
        Spacer(Modifier.height(8.dp))
        Text(
            text = stringResource(receiveTemplate, usdc(amount)),
            color = OddsdexColors.TextSecondary,
            fontSize = 13.sp,
        )
    }

    Spacer(Modifier.height(20.dp))
    Box(modifier = Modifier.alpha(if (valid || busy) 1f else 0.5f)) {
        GradientButton(
            text = if (busy) "" else title,
            onClick = { if (valid && !busy) onConfirm(amount) },
        )
        if (busy) {
            CircularProgressIndicator(
                color = OddsdexColors.CtaText,
                strokeWidth = 2.5.dp,
                modifier = Modifier
                    .size(22.dp)
                    .align(Alignment.Center),
            )
        }
    }
    if (busy) {
        Spacer(Modifier.height(10.dp))
        Text(
            text = stringResource(R.string.payments_confirming),
            color = OddsdexColors.TextSecondary,
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

// ─────────────────────── transactions ───────────────────────

@Composable
private fun TransactionsPage(transactions: List<ChainTx>, onBack: () -> Unit) {
    PageHeader(stringResource(R.string.payments_transactions), enabled = true, onBack = onBack)
    Spacer(Modifier.height(8.dp))

    if (transactions.isEmpty()) {
        Text(
            text = stringResource(R.string.payments_tx_empty),
            color = OddsdexColors.TextSecondary,
            fontSize = 14.sp,
            modifier = Modifier.padding(vertical = 24.dp),
        )
        return
    }

    LazyColumn(
        modifier = Modifier.heightIn(max = 420.dp),
    ) {
        items(transactions, key = { it.id }) { tx ->
            TxRow(tx)
        }
    }
}

@Composable
private fun TxRow(tx: ChainTx) {
    val (icon, label, tint) = when (tx.kind) {
        TxKind.STAKE -> Triple(
            Icons.Filled.Savings, stringResource(R.string.tx_stake), OddsdexColors.TextPrimary,
        )
        TxKind.UNSTAKE -> Triple(
            Icons.Filled.SystemUpdateAlt, stringResource(R.string.tx_unstake),
            OddsdexColors.TextPrimary,
        )
        TxKind.TRADE_WIN -> Triple(
            Icons.AutoMirrored.Filled.TrendingUp, stringResource(R.string.tx_win),
            OddsdexColors.Up,
        )
        TxKind.TRADE_LOSS -> Triple(
            Icons.AutoMirrored.Filled.TrendingDown, stringResource(R.string.tx_loss),
            OddsdexColors.Down,
        )
    }
    val signedAmount = when (tx.kind) {
        TxKind.TRADE_WIN, TxKind.STAKE -> "+" + String.format(Locale.US, "%.2f", tx.amount)
        TxKind.TRADE_LOSS, TxKind.UNSTAKE -> "−" + String.format(Locale.US, "%.2f", tx.amount)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
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
                icon,
                contentDescription = null,
                tint = tint,
                modifier = Modifier.size(18.dp),
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = label,
                color = OddsdexColors.TextPrimary,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = tx.signature,
                color = OddsdexColors.TextSecondary,
                fontSize = 12.sp,
                fontFamily = JetBrainsMonoFamily,
            )
        }
        Text(
            text = signedAmount,
            color = tint,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = JetBrainsMonoFamily,
        )
    }
}

// ─────────────────────── shared bits ───────────────────────

@Composable
private fun PageHeader(title: String, enabled: Boolean, onBack: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.AutoMirrored.Filled.ArrowBack,
            contentDescription = stringResource(R.string.back),
            tint = OddsdexColors.TextPrimary,
            modifier = Modifier
                .clip(CircleShape)
                .clickable(enabled = enabled, onClick = onBack)
                .padding(6.dp),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            text = title,
            color = OddsdexColors.TextPrimary,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

@Composable
private fun SheetRow(icon: ImageVector, label: String, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(OddsdexColors.ChipSurface)
            .clickable(onClick = onClick)
            .padding(horizontal = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = OddsdexColors.TextPrimary)
        Spacer(Modifier.width(14.dp))
        Spacer(Modifier.weight(1f))
        Text(
            text = label,
            color = OddsdexColors.TextPrimary,
            fontSize = 17.sp,
            fontWeight = FontWeight.SemiBold,
        )
        Spacer(Modifier.weight(1.4f))
    }
}

private fun usdc(value: Double): String =
    String.format(Locale.US, "%.2f USDC", value)
