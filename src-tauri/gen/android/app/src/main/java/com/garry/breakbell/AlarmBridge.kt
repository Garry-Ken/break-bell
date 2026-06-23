package com.garry.breakbell

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import org.json.JSONObject
import java.util.Calendar

/**
 * JS → Rust(JNI) → 这里。用精确 AlarmManager 排程；到点由 AlarmReceiver 启动
 * BreakService 画全屏悬浮窗强制休息。日程与休息参数存 SharedPreferences，
 * 供服务、重排、开机重排读取。
 */
object AlarmBridge {
    private const val PREFS = "breakbell"
    private const val ACTION = "com.garry.breakbell.ALARM_FIRE"
    private const val MAX_CODES = 64

    // ---- JNI 入口 ----

    @JvmStatic
    fun schedule(ctx: Context, json: String) {
        val obj = JSONObject(json)
        val arr = obj.optJSONArray("times")
        val times = ArrayList<String>()
        if (arr != null) for (i in 0 until arr.length()) times.add(arr.getString(i))
        val breakMinutes = obj.optInt("breakMinutes", 5)
        val prompt = obj.optString("prompt", "去喝水 · 起来拉伸")
        val allowSkip = obj.optBoolean("allowSkip", true)

        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putStringSet("times", LinkedHashSet(times))
            .putInt("breakMinutes", breakMinutes)
            .putString("prompt", prompt)
            .putBoolean("allowSkip", allowSkip)
            .apply()

        ensurePermissions(ctx)
        cancelAll(ctx)
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        times.forEachIndexed { i, t ->
            val cal = nextOccurrence(t, false) ?: return@forEachIndexed
            scheduleExact(ctx, am, i, t, cal.timeInMillis)
        }
    }

    @JvmStatic
    fun cancel(ctx: Context) {
        cancelAll(ctx)
    }

    // ---- 给 AlarmReceiver / BootReceiver ----

    fun rescheduleOne(ctx: Context, requestCode: Int, time: String) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val cal = nextOccurrence(time, true) ?: return // 明天同一时间，保持每天循环
        scheduleExact(ctx, am, requestCode, time, cal.timeInMillis)
    }

    fun rescheduleFromPrefs(ctx: Context) {
        val sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val times = ArrayList(sp.getStringSet("times", emptySet()) ?: emptySet())
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        times.forEachIndexed { i, t ->
            val cal = nextOccurrence(t, false) ?: return@forEachIndexed
            scheduleExact(ctx, am, i, t, cal.timeInMillis)
        }
    }

    fun breakParams(ctx: Context): Triple<Int, String, Boolean> {
        val sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return Triple(
            sp.getInt("breakMinutes", 5),
            sp.getString("prompt", "去喝水 · 起来拉伸") ?: "去喝水 · 起来拉伸",
            sp.getBoolean("allowSkip", true),
        )
    }

    // ---- 内部 ----

    private fun scheduleExact(ctx: Context, am: AlarmManager, requestCode: Int, time: String, triggerAt: Long) {
        val pi = firePendingIntent(ctx, requestCode, time)
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            }
        } catch (e: SecurityException) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
        }
    }

    private fun firePendingIntent(ctx: Context, requestCode: Int, time: String): PendingIntent {
        val intent = Intent(ctx, AlarmReceiver::class.java).apply {
            action = ACTION
            putExtra("time", time)
            putExtra("requestCode", requestCode)
        }
        var flags = PendingIntent.FLAG_UPDATE_CURRENT
        if (Build.VERSION.SDK_INT >= 23) flags = flags or PendingIntent.FLAG_IMMUTABLE
        return PendingIntent.getBroadcast(ctx, requestCode, intent, flags)
    }

    private fun cancelAll(ctx: Context) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        for (i in 0 until MAX_CODES) {
            val intent = Intent(ctx, AlarmReceiver::class.java).apply { action = ACTION }
            var flags = PendingIntent.FLAG_NO_CREATE
            if (Build.VERSION.SDK_INT >= 23) flags = flags or PendingIntent.FLAG_IMMUTABLE
            val pi = PendingIntent.getBroadcast(ctx, i, intent, flags)
            if (pi != null) am.cancel(pi)
        }
    }

    private fun nextOccurrence(hhmm: String, fromTomorrow: Boolean): Calendar? {
        val parts = hhmm.split(":")
        if (parts.size != 2) return null
        val h = parts[0].toIntOrNull() ?: return null
        val m = parts[1].toIntOrNull() ?: return null
        val cal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, h)
            set(Calendar.MINUTE, m)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (fromTomorrow || cal.timeInMillis <= System.currentTimeMillis() + 1000) {
            cal.add(Calendar.DAY_OF_YEAR, 1)
        }
        return cal
    }

    private fun ensurePermissions(ctx: Context) {
        if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(ctx)) {
            try {
                ctx.startActivity(
                    Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + ctx.packageName))
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } catch (_: Exception) {}
        }
        if (Build.VERSION.SDK_INT >= 31) {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            if (!am.canScheduleExactAlarms()) {
                try {
                    ctx.startActivity(
                        Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + ctx.packageName))
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                } catch (_: Exception) {}
            }
        }
    }
}
