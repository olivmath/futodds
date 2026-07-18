package com.oddsdex.app.wallet

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Encrypted persistence for the MWA auth token and connected wallet address. */
class AuthTokenStore(context: Context) {

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        FILE_NAME,
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    var authToken: String?
        get() = prefs.getString(KEY_AUTH_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_AUTH_TOKEN, value).apply()

    var walletAddress: String?
        get() = prefs.getString(KEY_WALLET_ADDRESS, null)
        set(value) = prefs.edit().putString(KEY_WALLET_ADDRESS, value).apply()

    fun clear() = prefs.edit().clear().apply()

    private companion object {
        const val FILE_NAME = "oddsdex_wallet"
        const val KEY_AUTH_TOKEN = "auth_token"
        const val KEY_WALLET_ADDRESS = "wallet_address"
    }
}
