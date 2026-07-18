package com.oddsdex.app.ui.home

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.SystemUpdateAlt
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oddsdex.app.R
import com.oddsdex.app.core.Analytics
import com.oddsdex.app.ui.components.GradientButton
import com.oddsdex.app.ui.theme.OddsdexColors

/**
 * "Pagamentos" bottom sheet. The wallet is already connected, so the sheet only
 * offers Stake, Unstake and Transactions — all stubs until the program lands.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PaymentsSheet(
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    val comingSoon = {
        Toast.makeText(context, R.string.coming_soon, Toast.LENGTH_SHORT).show()
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = OddsdexColors.Surface,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
        ) {
            Text(
                text = stringResource(R.string.payments_title),
                color = OddsdexColors.TextPrimary,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(bottom = 20.dp),
            )
            GradientButton(
                text = stringResource(R.string.payments_stake),
                onClick = {
                    Analytics.log("stake_initiated")
                    comingSoon()
                },
            )
            Spacer(Modifier.height(12.dp))
            SheetRow(
                Icons.Filled.SystemUpdateAlt,
                stringResource(R.string.payments_unstake),
                comingSoon,
            )
            Spacer(Modifier.height(12.dp))
            SheetRow(
                Icons.Filled.History,
                stringResource(R.string.payments_transactions),
                comingSoon,
            )
        }
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
