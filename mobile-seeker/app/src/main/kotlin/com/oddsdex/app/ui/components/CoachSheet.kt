package com.oddsdex.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.oddsdex.app.ui.theme.OddsdexColors

/** Light coach-mark card over the dark chart, as in the onboarding reference. */
@Composable
fun CoachSheet(
    title: String,
    body: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit = {},
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(OddsdexColors.SheetBackground)
            .padding(horizontal = 22.dp, vertical = 24.dp),
    ) {
        Text(
            text = title,
            color = OddsdexColors.SheetTitle,
            fontSize = 22.sp,
            fontWeight = FontWeight.Bold,
            lineHeight = 28.sp,
        )
        Spacer(Modifier.height(10.dp))
        Text(
            text = body,
            color = OddsdexColors.SheetBody,
            fontSize = 16.sp,
            lineHeight = 22.sp,
        )
        Spacer(Modifier.height(18.dp))
        content()
    }
}
