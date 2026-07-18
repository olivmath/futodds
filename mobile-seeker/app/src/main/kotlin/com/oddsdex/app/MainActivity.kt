package com.oddsdex.app

import android.content.Context
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.oddsdex.app.core.Analytics
import com.oddsdex.app.ui.home.HomeScreen
import com.oddsdex.app.ui.onboarding.OnboardingScreen
import com.oddsdex.app.ui.onboarding.ReadyScreen
import com.oddsdex.app.ui.theme.OddsdexTheme
import com.oddsdex.app.wallet.WalletConnectResult
import com.oddsdex.app.wallet.WalletSessionManager
import com.solana.mobilewalletadapter.clientlib.ActivityResultSender
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.launch

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var walletSession: WalletSessionManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        // Must be constructed before the activity is RESUMED (MWA requirement)
        val sender = ActivityResultSender(this)
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        setContent {
            OddsdexTheme {
                var connectedAddress by remember {
                    mutableStateOf(walletSession.connectedAddress)
                }
                var onboardingDone by remember {
                    mutableStateOf(prefs.getBoolean(KEY_ONBOARDING_DONE, false))
                }
                val scope = rememberCoroutineScope()

                val connectWallet: () -> Unit = {
                    scope.launch {
                        when (val result = walletSession.connect(sender)) {
                            is WalletConnectResult.Connected -> {
                                prefs.edit()
                                    .putBoolean(KEY_ONBOARDING_DONE, true)
                                    .apply()
                                Analytics.log("wallet_connected")
                                onboardingDone = true
                                connectedAddress = result.address
                            }
                            WalletConnectResult.NoWalletFound ->
                                showToast(R.string.wallet_error_no_wallet)
                            is WalletConnectResult.Failed ->
                                showToast(R.string.wallet_error_failed)
                        }
                    }
                }

                when {
                    connectedAddress != null -> HomeScreen(
                        walletAddress = connectedAddress,
                        onDisconnect = {
                            scope.launch {
                                runCatching { walletSession.disconnect(sender) }
                                Analytics.log("wallet_disconnected")
                                // Disconnect resets the journey: the next
                                // entry starts from the onboarding demo, not
                                // straight at the connect screen.
                                prefs.edit()
                                    .putBoolean(KEY_ONBOARDING_DONE, false)
                                    .apply()
                                onboardingDone = false
                                connectedAddress = null
                            }
                        },
                    )
                    // Onboarding already completed: go straight to connect.
                    onboardingDone -> ReadyScreen(onConnectWallet = connectWallet)
                    else -> OnboardingScreen(onConnectWallet = connectWallet)
                }
            }
        }
    }

    private fun showToast(resId: Int) {
        Toast.makeText(this, resId, Toast.LENGTH_LONG).show()
    }

    private companion object {
        const val PREFS_NAME = "oddsdex_prefs"
        const val KEY_ONBOARDING_DONE = "onboarding_done"
    }
}
