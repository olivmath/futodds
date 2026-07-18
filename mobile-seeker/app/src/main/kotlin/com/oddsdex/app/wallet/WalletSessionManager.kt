package com.oddsdex.app.wallet

import android.net.Uri
import com.funkatronics.encoders.Base58
import com.oddsdex.app.BuildConfig
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import com.solana.mobilewalletadapter.clientlib.ConnectionIdentity
import com.solana.mobilewalletadapter.clientlib.MobileWalletAdapter
import com.solana.mobilewalletadapter.clientlib.Solana
import com.solana.mobilewalletadapter.clientlib.TransactionResult

sealed interface WalletConnectResult {
    data class Connected(val address: String) : WalletConnectResult
    data object NoWalletFound : WalletConnectResult
    data class Failed(val message: String?) : WalletConnectResult
}

/**
 * Owns the single MWA client. Signing and session approval always happen in
 * the wallet app (Seed Vault on Seeker) — no key material ever enters this
 * process (ARCHITECTURE.md §4).
 */
class WalletSessionManager(private val store: AuthTokenStore) {

    private val walletAdapter = MobileWalletAdapter(
        connectionIdentity = ConnectionIdentity(
            identityUri = Uri.parse(IDENTITY_URI),
            iconUri = Uri.parse(ICON_URI),
            identityName = IDENTITY_NAME,
        ),
    ).apply {
        blockchain = if (BuildConfig.CLUSTER == "devnet") Solana.Devnet else Solana.Mainnet
        authToken = store.authToken // silent reconnect across app restarts
    }

    val connectedAddress: String? get() = store.walletAddress

    suspend fun connect(sender: ActivityResultSender): WalletConnectResult =
        when (val result = walletAdapter.connect(sender)) {
            is TransactionResult.Success -> {
                val address = Base58.encodeToString(
                    result.authResult.accounts.first().publicKey,
                )
                store.authToken = walletAdapter.authToken
                store.walletAddress = address
                WalletConnectResult.Connected(address)
            }
            is TransactionResult.NoWalletFound -> WalletConnectResult.NoWalletFound
            is TransactionResult.Failure -> WalletConnectResult.Failed(result.e.message)
        }

    suspend fun disconnect(sender: ActivityResultSender) {
        try {
            walletAdapter.disconnect(sender)
        } finally {
            // Local session always ends, even if the wallet app fails to
            // acknowledge the deauthorize.
            store.clear()
        }
    }

    private companion object {
        const val IDENTITY_URI = "https://oddsdex.app"
        const val ICON_URI = "favicon.ico"
        const val IDENTITY_NAME = "oddsdex"
    }
}
