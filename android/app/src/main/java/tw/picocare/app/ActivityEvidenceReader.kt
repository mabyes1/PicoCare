package tw.picocare.app

import android.app.AppOpsManager
import android.app.NotificationManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.ApplicationInfo
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.os.UserManager
import android.provider.Settings
import org.json.JSONObject

object ActivityEvidenceReader {
    private val videoApps = setOf("com.google.android.youtube", "com.netflix.mediaclient", "com.google.android.videos")
    @Suppress("DEPRECATION")
    fun usageGranted(context: Context): Boolean = context.getSystemService(AppOpsManager::class.java)
        .checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName) == AppOpsManager.MODE_ALLOWED
    fun usage(context: Context, enabled: Boolean, now: Long): Pair<String, JSONObject?> {
        if (!enabled) return "disabled" to null
        if (!usageGranted(context)) return "permission_missing" to null
        if (!context.getSystemService(UserManager::class.java).isUserUnlocked) return "disconnected" to null
        return try {
            val events = context.getSystemService(UsageStatsManager::class.java).queryEvents(now - 6 * 3600000, now) ?: return "error" to null
            var app: String? = null; var changedAt = 0L; val event = UsageEvents.Event(); var count = 0
            while (events.hasNextEvent() && count++ < 20000) {
                events.getNextEvent(event)
                when (event.eventType) {
                    1 -> { app = event.packageName; changedAt = event.timeStamp } // resumed / moved to foreground on older APIs
                    2 -> if (app == event.packageName) app = null
                    16, 17 -> app = null // screen non-interactive / keyguard shown
                }
            }
            if (events.hasNextEvent()) return "error" to null
            if (!context.getSystemService(PowerManager::class.java).isInteractive) app = null
            val active = app ?: return "available" to null
            val isVideo = active in videoApps || runCatching { context.packageManager.getApplicationInfo(active, 0).category == ApplicationInfo.CATEGORY_VIDEO }.getOrDefault(false)
            "available" to JSONObject().put("appId", active).put("category", if (isVideo) "video" else "other").put("observedAt", now).put("changedAt", changedAt)
        } catch (_: SecurityException) { "permission_missing" to null }
          catch (_: RuntimeException) { "error" to null }
    }
    fun media(context: Context, enabled: Boolean, foregroundApp: String?, now: Long): Pair<String, JSONObject?> {
        if (!enabled) return "disabled" to null
        val component = ComponentName(context, CareNotificationListener::class.java)
        val granted = if (Build.VERSION.SDK_INT >= 27) context.getSystemService(NotificationManager::class.java).isNotificationListenerAccessGranted(component)
            else Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")?.split(':')?.any { ComponentName.unflattenFromString(it) == component } == true
        if (!granted) return "permission_missing" to null
        return try {
            val sessions = context.getSystemService(MediaSessionManager::class.java).getActiveSessions(component)
            val controller = sessions.firstOrNull { it.packageName == foregroundApp } ?: sessions.firstOrNull() ?: return "available" to null
            val state = when (controller.playbackState?.state) {
                PlaybackState.STATE_PLAYING -> "playing"
                PlaybackState.STATE_PAUSED -> "paused"
                PlaybackState.STATE_STOPPED, PlaybackState.STATE_NONE -> "stopped"
                else -> "unknown"
            }
            "available" to JSONObject().put("appId", controller.packageName).put("state", state).put("observedAt", now)
        } catch (_: SecurityException) { "permission_missing" to null }
          catch (_: RuntimeException) { "error" to null }
    }
}
