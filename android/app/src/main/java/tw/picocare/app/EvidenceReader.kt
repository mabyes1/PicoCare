package tw.picocare.app

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.LocationManager
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.service.notification.NotificationListenerService
import org.json.JSONArray
import org.json.JSONObject

class CareNotificationListener : NotificationListenerService() {
    override fun onListenerConnected() { active = this }
    override fun onListenerDisconnected() { if (active === this) active = null }
    override fun onDestroy() { if (active === this) active = null; super.onDestroy() }
    companion object {
        @Volatile private var active: CareNotificationListener? = null
        fun accessGranted(context: Context): Boolean {
            val component = ComponentName(context, CareNotificationListener::class.java)
            return if (Build.VERSION.SDK_INT >= 27) context.getSystemService(NotificationManager::class.java).isNotificationListenerAccessGranted(component)
                else Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")?.split(':')?.any { ComponentName.unflattenFromString(it) == component } == true
        }
        fun snapshot(context: Context, enabled: Boolean, detailed: Boolean, now: Long): Pair<String, JSONArray> {
            val notes = JSONArray()
            if (!enabled) return "disabled" to notes
            if (!accessGranted(context)) return "permission_missing" to notes
            val listener = active ?: return "disconnected" to notes
            return try {
                // Observe the active notification now; its publication time is separate.
                val current = listener.activeNotifications ?: return "disconnected" to notes
                current.filter { it.packageName != context.packageName }
                    .sortedWith(compareByDescending<android.service.notification.StatusBarNotification> { it.notification.flags and Notification.FLAG_ONGOING_EVENT != 0 }.thenByDescending { it.postTime })
                    .mapNotNull { sbn ->
                        val notification = sbn.notification
                        val ongoing = notification.flags and Notification.FLAG_ONGOING_EVENT != 0
                        val category = when {
                            ongoing && notification.category == Notification.CATEGORY_NAVIGATION -> "navigation"
                            ongoing && notification.category == Notification.CATEGORY_CALL -> "call"
                            else -> "other"
                        }
                        if (!EvidencePolicy.includeNotification(category, now - sbn.postTime)) return@mapNotNull null
                        val note = JSONObject().put("category", category).put("observedAt", now).put("postedAt", sbn.postTime)
                        if (detailed) {
                            val content = "${notification.extras.getCharSequence(Notification.EXTRA_TITLE) ?: ""} ${notification.extras.getCharSequence(Notification.EXTRA_TEXT) ?: ""}".trim().take(300)
                            if (content.isNotEmpty()) note.put("text", content)
                        }
                        note
                    }.take(6).forEach { notes.put(it) }
                "available" to notes
            } catch (_: SecurityException) { "permission_missing" to JSONArray() }
              catch (_: RuntimeException) { "error" to JSONArray() }
        }
    }
}

object DeviceContextReader {
    fun read(context: Context): JSONObject {
        val prefs = CareConfig(context).prefs; val detailed = prefs.getBoolean("detailed", false); val now = System.currentTimeMillis()
        val battery = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val charge = battery?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val cm = context.getSystemService(ConnectivityManager::class.java)
        val caps = cm.getNetworkCapabilities(cm.activeNetwork)
        val network = when { caps == null -> "offline"; caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) -> "online"; else -> "unknown" }
        val ringer = when (context.getSystemService(AudioManager::class.java).ringerMode) { AudioManager.RINGER_MODE_NORMAL -> "normal"; AudioManager.RINGER_MODE_VIBRATE -> "vibrate"; AudioManager.RINGER_MODE_SILENT -> "silent"; else -> "unknown" }
        val (notificationState, notes) = CareNotificationListener.snapshot(context, prefs.getBoolean("notifications", false), detailed, now)
        val (usageState, usage) = ActivityEvidenceReader.usage(context, prefs.getBoolean("usage", false), now)
        val (mediaState, media) = ActivityEvidenceReader.media(context, prefs.getBoolean("media", false), usage?.optString("appId"), now)
        var motion = "unknown"; var motionEvidence: Any = JSONObject.NULL; var location: Any = JSONObject.NULL
        var locationState = "disabled"
        if (prefs.getBoolean("location", false)) {
            locationState = "permission_missing"
            if (context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED || context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                try {
                    val manager = context.getSystemService(LocationManager::class.java)
                    val latest = manager.getProviders(true).mapNotNull { manager.getLastKnownLocation(it) }.maxByOrNull { it.elapsedRealtimeNanos }
                    locationState = when {
                        latest == null -> "no_fix"
                        !EvidencePolicy.fresh((SystemClock.elapsedRealtimeNanos() - latest.elapsedRealtimeNanos) / 1000000) || !EvidencePolicy.fresh(now - latest.time) -> "stale"
                        !latest.hasAccuracy() || !latest.accuracy.isFinite() || latest.accuracy > 150 -> "inaccurate"
                        else -> "available"
                    }
                    if (latest != null && locationState == "available") {
                        if (latest.hasSpeed() && latest.hasSpeedAccuracy() && latest.speed.isFinite() && latest.speedAccuracyMetersPerSecond.isFinite() && latest.speed >= 0 && latest.speedAccuracyMetersPerSecond >= 0) {
                            motion = EvidencePolicy.motion(latest.speed, latest.speedAccuracyMetersPerSecond)
                            motionEvidence = JSONObject().put("observedAt", latest.time).put("accuracy", latest.accuracy.toDouble()).put("speed", latest.speed.toDouble()).put("speedAccuracy", latest.speedAccuracyMetersPerSecond.toDouble())
                        } else locationState = "speed_unavailable"
                        if (detailed) location = JSONObject().put("latitude", latest.latitude).put("longitude", latest.longitude).put("accuracy", latest.accuracy.toDouble()).put("observedAt", latest.time)
                    }
                } catch (_: SecurityException) { locationState = "permission_missing" }
                  catch (_: RuntimeException) { locationState = "error" }
            }
        }
        return JSONObject().put("batteryPercent", if (level >= 0 && scale > 0) (level * 100 / scale) else JSONObject.NULL)
            .put("charging", if (charge < 0) JSONObject.NULL else charge == BatteryManager.BATTERY_STATUS_CHARGING || charge == BatteryManager.BATTERY_STATUS_FULL)
            .put("network", network).put("screenInteractive", context.getSystemService(PowerManager::class.java).isInteractive)
            .put("ringer", ringer).put("motion", motion).put("motionEvidence", motionEvidence).put("location", location).put("notifications", notes)
            .put("usage", usage ?: JSONObject.NULL).put("media", media ?: JSONObject.NULL)
            .put("sources", JSONObject().put("notifications", notificationState).put("location", locationState).put("usage", usageState).put("media", mediaState))
            .put("sharing", if (detailed) "detailed" else "summary")
    }
}
