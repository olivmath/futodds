package com.oddsdex.app

import android.app.Application
import com.oddsdex.app.session.TradeNotifications
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class OddsdexApp : Application() {

    override fun onCreate() {
        super.onCreate()
        TradeNotifications.createChannels(this)
    }
}
