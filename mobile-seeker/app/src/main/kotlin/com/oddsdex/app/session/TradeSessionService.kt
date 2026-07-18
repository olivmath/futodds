package com.oddsdex.app.session

import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationManagerCompat
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Foreground service alive only while a position is open. It pins the process
 * so the countdown in [TradeSessionManager] survives the user leaving the app,
 * and mirrors the live trade into an ongoing notification (odd, entry,
 * remaining time, progress). Stops itself when the trade settles.
 */
@AndroidEntryPoint
class TradeSessionService : Service() {

    @Inject
    lateinit var session: TradeSessionManager

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    override fun onCreate() {
        super.onCreate()
        scope.launch {
            session.live.collect { trade ->
                if (trade == null) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                } else {
                    NotificationManagerCompat.from(this@TradeSessionService)
                        .notify(
                            TradeNotifications.ONGOING_ID,
                            TradeNotifications.buildOngoing(this@TradeSessionService, trade),
                        )
                }
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_CLOSE_NOW) {
            session.closeNow()
            return START_NOT_STICKY
        }
        val trade = session.live.value ?: run {
            stopSelf()
            return START_NOT_STICKY
        }
        val notification = TradeNotifications.buildOngoing(this, trade)
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(
                TradeNotifications.ONGOING_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(TradeNotifications.ONGOING_ID, notification)
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val ACTION_CLOSE_NOW = "com.oddsdex.app.session.CLOSE_NOW"
    }
}
