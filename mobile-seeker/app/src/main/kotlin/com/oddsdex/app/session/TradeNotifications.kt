package com.oddsdex.app.session

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.oddsdex.app.MainActivity
import com.oddsdex.app.R
import com.oddsdex.app.ui.home.TradeResult
import com.oddsdex.app.ui.onboarding.Direction
import java.util.Locale

/**
 * Channels and builders for the trade-session notifications. The ongoing
 * (silent) notification tracks the open position; the result channel fires a
 * heads-up when a trade settles while the user is outside the app.
 */
object TradeNotifications {

    const val CHANNEL_SESSION = "trade_session"
    const val CHANNEL_RESULT = "trade_result"
    const val ONGOING_ID = 1001
    const val RESULT_ID = 1002

    fun createChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_SESSION,
                context.getString(R.string.notif_channel_session),
                NotificationManager.IMPORTANCE_LOW,
            ),
        )
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_RESULT,
                context.getString(R.string.notif_channel_result),
                NotificationManager.IMPORTANCE_HIGH,
            ),
        )
    }

    fun buildOngoing(context: Context, trade: LiveTrade): Notification {
        val direction = context.getString(
            if (trade.direction == Direction.UP) R.string.direction_up
            else R.string.direction_down,
        )
        val closeIntent = Intent(context, TradeSessionService::class.java)
            .setAction(TradeSessionService.ACTION_CLOSE_NOW)
        return NotificationCompat.Builder(context, CHANNEL_SESSION)
            .setSmallIcon(R.drawable.ic_stat_trade)
            .setContentTitle("${trade.team} · $direction")
            .setContentText(
                context.getString(
                    R.string.notif_live_text,
                    odd(trade.currentOdd),
                    odd(trade.entryOdd),
                    trade.remainingSeconds,
                ),
            )
            .setSubText(trade.matchTitle)
            .setProgress(
                trade.windowSeconds,
                trade.windowSeconds - trade.remainingSeconds,
                false,
            )
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(openAppIntent(context))
            .addAction(
                0,
                context.getString(R.string.notif_close_now),
                PendingIntent.getService(
                    context, 1, closeIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                ),
            )
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    fun postResult(context: Context, trade: SettledTrade) {
        if (!canPost(context)) return
        val title = when (val result = trade.result) {
            is TradeResult.Win ->
                context.getString(R.string.result_win, money(result.profit))
            is TradeResult.Loss ->
                context.getString(R.string.result_loss, result.stake)
            TradeResult.Tie -> context.getString(R.string.result_tie)
        }
        val notification = NotificationCompat.Builder(context, CHANNEL_RESULT)
            .setSmallIcon(R.drawable.ic_stat_trade)
            .setContentTitle(title)
            .setContentText(
                "${trade.matchTitle} · " + context.getString(
                    R.string.result_odds, odd(trade.entryOdd), odd(trade.exitOdd),
                ),
            )
            .setAutoCancel(true)
            .setContentIntent(openAppIntent(context))
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .build()
        context.getSystemService(NotificationManager::class.java)
            .notify(RESULT_ID, notification)
    }

    private fun canPost(context: Context): Boolean =
        if (Build.VERSION.SDK_INT >= 33) {
            context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        } else {
            NotificationManagerCompat.from(context).areNotificationsEnabled()
        }

    private fun openAppIntent(context: Context): PendingIntent =
        PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    private fun odd(value: Double): String = String.format(Locale.US, "%.2f", value)

    private fun money(value: Double): String = String.format(Locale.US, "%.2f", value)
}
