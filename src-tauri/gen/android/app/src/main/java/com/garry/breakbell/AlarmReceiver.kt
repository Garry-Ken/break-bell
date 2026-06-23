package com.garry.breakbell

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

/** 精确闹钟到点：启动前台服务画悬浮窗，并把这条闹钟排到明天同一时间。 */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val svc = Intent(ctx, BreakService::class.java)
        try {
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(svc) else ctx.startService(svc)
        } catch (_: Exception) {}

        val time = intent.getStringExtra("time") ?: ""
        val requestCode = intent.getIntExtra("requestCode", 0)
        if (time.isNotEmpty()) AlarmBridge.rescheduleOne(ctx, requestCode, time)
    }
}
