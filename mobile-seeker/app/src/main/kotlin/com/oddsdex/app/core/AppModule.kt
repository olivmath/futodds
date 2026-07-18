package com.oddsdex.app.core

import android.content.Context
import com.oddsdex.app.wallet.AuthTokenStore
import com.oddsdex.app.wallet.WalletSessionManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideAuthTokenStore(@ApplicationContext context: Context): AuthTokenStore =
        AuthTokenStore(context)

    @Provides
    @Singleton
    fun provideWalletSessionManager(store: AuthTokenStore): WalletSessionManager =
        WalletSessionManager(store)
}
