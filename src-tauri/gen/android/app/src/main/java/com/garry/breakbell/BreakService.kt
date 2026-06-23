package com.garry.breakbell

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.CountDownTimer
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView

/** 前台服务：到点画全屏置顶悬浮窗 + 响铃 + 震动 + 倒计时，强制休息 N 分钟。 */
class BreakService : Service() {
    private var overlay: View? = null
    private var ringtone: Ringtone? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var timer: CountDownTimer? = null
    private var countdownView: TextView? = null
    private var finished = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForegroundCompat()
        val (mins, prompt, allowSkip) = AlarmBridge.breakParams(this)
        acquireWake(mins)
        startRing()
        showOverlay(mins, prompt, allowSkip)
        return START_NOT_STICKY
    }

    private fun startForegroundCompat() {
        val channelId = "breakbell_fgs"
        if (Build.VERSION.SDK_INT >= 26) {
            val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            mgr.createNotificationChannel(
                NotificationChannel(channelId, "休息提醒", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, channelId)
        else @Suppress("DEPRECATION") Notification.Builder(this)
        val notif = builder
            .setContentTitle("该歇一下啦 🫗")
            .setContentText("去喝水 · 起来拉伸")
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(1, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(1, notif)
        }
    }

    private fun acquireWake(mins: Int) {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            @Suppress("DEPRECATION")
            wakeLock = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
                    PowerManager.ACQUIRE_CAUSES_WAKEUP or
                    PowerManager.ON_AFTER_RELEASE,
                "breakbell:break",
            ).apply { acquire((mins + 1) * 60_000L) }
        } catch (_: Exception) {}
    }

    private fun startRing() {
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            ringtone = RingtoneManager.getRingtone(applicationContext, uri)
            ringtone?.play()
        } catch (_: Exception) {}
        try {
            val vibrator = if (Build.VERSION.SDK_INT >= 31) {
                (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION") getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            val pattern = longArrayOf(0, 400, 300, 400, 300, 500)
            if (Build.VERSION.SDK_INT >= 26) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
            } else {
                @Suppress("DEPRECATION") vibrator.vibrate(pattern, -1)
            }
        } catch (_: Exception) {}
    }

    private fun showOverlay(mins: Int, prompt: String, allowSkip: Boolean) {
        if (Build.VERSION.SDK_INT >= 23 && !Settings.canDrawOverlays(this)) {
            finishBreak(); return
        }
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        @Suppress("DEPRECATION")
        val type = if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else WindowManager.LayoutParams.TYPE_PHONE
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD,
            PixelFormat.OPAQUE,
        )
        val root = buildView(mins, prompt, allowSkip)
        try {
            wm.addView(root, lp); overlay = root
        } catch (e: Exception) {
            finishBreak(); return
        }
        timer = object : CountDownTimer(mins * 60_000L, 1000) {
            override fun onTick(ms: Long) {
                val total = ms / 1000
                val mm = (total / 60).toString().padStart(2, '0')
                val ss = (total % 60).toString().padStart(2, '0')
                countdownView?.text = "$mm:$ss"
            }
            override fun onFinish() = finishBreak()
        }.start()
    }

    private fun buildView(mins: Int, prompt: String, allowSkip: Boolean): View {
        val d = resources.displayMetrics.density
        fun dp(v: Int) = (v * d).toInt()
        val root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#0b1020")) }
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT,
            )
        }
        col.addView(TextView(this).apply {
            text = "休息一下"; setTextColor(Color.parseColor("#8aa0c8")); textSize = 14f; gravity = Gravity.CENTER
        })
        col.addView(TextView(this).apply {
            text = prompt; setTextColor(Color.WHITE); textSize = 26f; gravity = Gravity.CENTER
            setPadding(dp(24), dp(14), dp(24), dp(30))
        })
        countdownView = TextView(this).apply {
            text = "${mins.toString().padStart(2, '0')}:00"
            setTextColor(Color.WHITE); textSize = 66f; gravity = Gravity.CENTER
        }
        col.addView(countdownView)
        col.addView(TextView(this).apply {
            text = "站起来，接杯水，远眺放松一下 👀"
            setTextColor(Color.parseColor("#9aa8c8")); textSize = 15f; gravity = Gravity.CENTER
            setPadding(dp(24), dp(26), dp(24), dp(26))
        })
        if (allowSkip) {
            col.addView(Button(this).apply {
                text = "跳过这次休息"
                setOnClickListener { finishBreak() }
            })
        }
        root.addView(col)
        return root
    }

    private fun finishBreak() {
        if (finished) return
        finished = true
        try { timer?.cancel() } catch (_: Exception) {}
        try { ringtone?.stop() } catch (_: Exception) {}
        try {
            overlay?.let { (getSystemService(Context.WINDOW_SERVICE) as WindowManager).removeView(it) }
        } catch (_: Exception) {}
        overlay = null
        try { wakeLock?.let { if (it.isHeld) it.release() } } catch (_: Exception) {}
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE)
        else @Suppress("DEPRECATION") stopForeground(true)
        stopSelf()
    }

    override fun onDestroy() {
        finishBreak()
        super.onDestroy()
    }
}
