package com.garry.breakbell

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** 重启后从 SharedPreferences 重排所有闹钟。 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            AlarmBridge.rescheduleFromPrefs(ctx)
        }
    }
}
