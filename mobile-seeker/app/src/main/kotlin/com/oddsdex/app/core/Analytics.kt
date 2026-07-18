package com.oddsdex.app.core

import android.util.Log

/**
 * Minimal event logger for the PRD §12 funnel. Backed by logcat until an
 * analytics provider is chosen; never receives wallet addresses (AGENT.md §2).
 */
object Analytics {
    fun log(event: String, params: Map<String, String> = emptyMap()) {
        Log.d(TAG, if (params.isEmpty()) event else "$event $params")
    }

    private const val TAG = "OddsdexAnalytics"
}
