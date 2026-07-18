package com.oddsdex.app.ui.profile

import android.os.Build
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oddsdex.app.BuildConfig
import com.oddsdex.app.R
import com.oddsdex.app.ui.theme.JetBrainsMonoFamily
import com.oddsdex.app.ui.theme.OddsdexColors

/**
 * Profile tab (reference: imgs/profile.png), Seeker-aligned: wallet address
 * with copy, device badge, network, settings stub and wallet disconnect.
 */
@Composable
fun ProfileScreen(
    walletAddress: String?,
    onDisconnect: () -> Unit,
    onBack: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val isSeeker = Build.MODEL == "Seeker"

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(OddsdexColors.Background)
            .verticalScroll(rememberScrollState())
            .statusBarsPadding()
            .padding(horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (onBack != null) {
            Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Icon(
                    Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = stringResource(R.string.back),
                    tint = OddsdexColors.TextPrimary,
                    modifier = Modifier
                        .clip(CircleShape)
                        .clickable(onClick = onBack)
                        .padding(8.dp),
                )
            }
            Spacer(Modifier.height(16.dp))
        } else {
            Spacer(Modifier.height(48.dp))
        }

        // Avatar
        Box(
            modifier = Modifier
                .size(104.dp)
                .clip(CircleShape)
                .background(OddsdexColors.ChipSurface),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                Icons.Filled.Person,
                contentDescription = null,
                tint = OddsdexColors.TextSecondary,
                modifier = Modifier.size(52.dp),
            )
        }
        Spacer(Modifier.height(18.dp))

        Text(
            text = stringResource(R.string.profile_default_name),
            color = OddsdexColors.TextPrimary,
            fontSize = 30.sp,
            fontWeight = FontWeight.Bold,
        )
        Spacer(Modifier.height(8.dp))

        // Wallet address with copy (the reference's "ID ... [copy]" row)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .clip(RoundedCornerShape(10.dp))
                .clickable {
                    walletAddress?.let {
                        clipboard.setText(AnnotatedString(it))
                        Toast.makeText(context, R.string.address_copied, Toast.LENGTH_SHORT)
                            .show()
                    }
                }
                .padding(horizontal = 10.dp, vertical = 6.dp),
        ) {
            Text(
                text = walletAddress?.abbreviated() ?: "—",
                color = OddsdexColors.TextPrimary,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = JetBrainsMonoFamily,
            )
            Spacer(Modifier.width(8.dp))
            Icon(
                Icons.Filled.ContentCopy,
                contentDescription = stringResource(R.string.copy_address),
                tint = OddsdexColors.TextSecondary,
                modifier = Modifier.size(16.dp),
            )
        }

        if (isSeeker) {
            Spacer(Modifier.height(10.dp))
            Text(
                text = stringResource(R.string.profile_seeker_badge),
                color = OddsdexColors.Up,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.sp,
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .border(1.dp, OddsdexColors.Up, RoundedCornerShape(999.dp))
                    .padding(horizontal = 12.dp, vertical = 5.dp),
            )
        }

        Spacer(Modifier.height(36.dp))

        // Network card
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(16.dp))
                .background(OddsdexColors.ChipSurface)
                .padding(horizontal = 18.dp, vertical = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .size(8.dp)
                    .clip(CircleShape)
                    .background(OddsdexColors.Up),
            )
            Spacer(Modifier.width(12.dp))
            Text(
                text = stringResource(R.string.profile_network),
                color = OddsdexColors.TextSecondary,
                fontSize = 15.sp,
            )
            Spacer(Modifier.weight(1f))
            Text(
                text = "Solana · ${BuildConfig.CLUSTER}",
                color = OddsdexColors.TextPrimary,
                fontSize = 15.sp,
                fontWeight = FontWeight.SemiBold,
                fontFamily = JetBrainsMonoFamily,
            )
        }
        Spacer(Modifier.height(12.dp))

        ProfileRow(
            icon = Icons.Filled.Settings,
            label = stringResource(R.string.profile_settings),
            tint = OddsdexColors.TextPrimary,
            onClick = {
                Toast.makeText(context, R.string.coming_soon, Toast.LENGTH_SHORT).show()
            },
        )
        Spacer(Modifier.height(12.dp))

        ProfileRow(
            icon = Icons.AutoMirrored.Filled.Logout,
            label = stringResource(R.string.profile_disconnect),
            tint = OddsdexColors.Down,
            onClick = onDisconnect,
        )
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun ProfileRow(
    icon: ImageVector,
    label: String,
    tint: Color,
    onClick: () -> Unit,
) {
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
        Icon(icon, contentDescription = null, tint = tint)
        Spacer(Modifier.width(14.dp))
        Text(
            text = label,
            color = tint,
            fontSize = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

private fun String.abbreviated(): String =
    if (length <= 12) this else "${take(4)}…${takeLast(4)}"
