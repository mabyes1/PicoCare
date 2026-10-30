package tw.picocare.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper

class CareConnectionService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var stopped = false
    private var locationListening = false
    private fun t(en: String, zh: String) = AppLang.t(this, en, zh)
    private val locationListener = object : LocationListener {
        override fun onLocationChanged(location: Location) { /* LocationManager keeps the fix; the evidence reader samples its original timestamp. */ }
        @Suppress("OVERRIDE_DEPRECATION") override fun onStatusChanged(provider: String?, status: Int, extras: android.os.Bundle?) { }
        override fun onProviderEnabled(provider: String) { }
        override fun onProviderDisabled(provider: String) { }
    }
    private val loop = object : Runnable {
        override fun run() {
            if (stopped) return
            CareRuntime.executor.execute {
                val result = try { CareRuntime.sync(this@CareConnectionService) } catch (error: Exception) { t("Waiting to reconnect: ${error.message ?: "network hiccup"}", "等待重連：${error.message ?: "網路暫時中斷"}") }
                CareConfig(this@CareConnectionService).prefs.edit().putString("connection_message", result).apply()
                if (!stopped) handler.postDelayed(this, 30000)
            }
        }
    }
    override fun onCreate() { super.onCreate(); channels(this) }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "stop") { stopSelf(); return START_NOT_STICKY }
        val wasRunning = running
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, CareConnectionService::class.java).setAction("stop"), PendingIntent.FLAG_IMMUTABLE)
        val notification = Notification.Builder(this, "care_connection").setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setContentTitle(t("PicoCare is watching over you", "PicoCare 持續關懷中")).setContentText(t("Checks in every 30 seconds. Stop anytime.", "每 30 秒嘗試更新情境，可隨時停止"))
            .setContentIntent(open).setOngoing(true).addAction(Notification.Action.Builder(null, t("Stop", "停止連線"), stop).build()).build()
        val locationEnabled = CareConfig(this).prefs.getBoolean("location", false) &&
            (checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) &&
            getSystemService(LocationManager::class.java).getProviders(true).isNotEmpty()
        if (Build.VERSION.SDK_INT >= 29) {
            val type = (if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0) or (if (locationEnabled) ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION else 0)
            startForeground(1, notification, type)
        } else startForeground(1, notification)
        val manager = getSystemService(LocationManager::class.java)
        if (locationListening) { manager.removeUpdates(locationListener); locationListening = false }
        if (locationEnabled) try {
            for (provider in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter { it in manager.getProviders(true) }) {
                manager.requestLocationUpdates(provider, 30000L, 15f, locationListener, Looper.getMainLooper()); locationListening = true
            }
        } catch (_: SecurityException) { CareConfig(this).prefs.edit().putString("connection_message", t("Location permission changed; other data still syncs", "定位權限已變更，其他資料仍可同步")).apply() }
        running = true
        CareConfig(this).prefs.edit().putBoolean("connected", true).apply()
        if (!wasRunning) { handler.removeCallbacks(loop); handler.post(loop) }
        return START_NOT_STICKY
    }
    override fun onDestroy() {
        stopped = true; handler.removeCallbacks(loop)
        if (locationListening) getSystemService(LocationManager::class.java).removeUpdates(locationListener)
        running = false
        CareConfig(this).prefs.edit().putBoolean("connected", false).apply()
        super.onDestroy()
    }
    override fun onBind(intent: Intent?): IBinder? = null
    companion object {
        @Volatile var running = false
            private set
        fun channels(context: Context) {
            val manager = context.getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(NotificationChannel("care_connection", AppLang.t(context, "Ongoing care", "持續關懷連線"), NotificationManager.IMPORTANCE_LOW).apply { setSound(null, null) })
            manager.createNotificationChannel(NotificationChannel("care_checkin", AppLang.t(context, "Check-in reminders", "報安提醒"), NotificationManager.IMPORTANCE_DEFAULT))
        }
        fun showReminder(context: Context, prompt: String? = null): Boolean {
            channels(context)
            val manager = context.getSystemService(NotificationManager::class.java)
            if (!manager.areNotificationsEnabled() || manager.getNotificationChannel("care_checkin").importance == NotificationManager.IMPORTANCE_NONE) return false
            if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
            val open = PendingIntent.getActivity(context, 2, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
            manager.notify(2, Notification.Builder(context, "care_checkin").setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(AppLang.t(context, "PicoCare wants to check in", "PicoCare 想關心你一下")).setContentText(prompt ?: AppLang.t(context, "A question is waiting. Tap to open PicoCare.", "有一個關心問題，點這裡打開 PicoCare。"))
                .setContentIntent(open).setOnlyAlertOnce(true).setAutoCancel(true).build())
            return true
        }
    }
}
