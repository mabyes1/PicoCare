package tw.picocare.app

import android.app.AppOpsManager
import android.app.NotificationManager
import android.app.usage.UsageStatsManager
import android.content.ComponentName
import android.content.Context
import android.media.session.MediaController
import android.media.session.MediaSession
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.PowerManager
import android.os.Process
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
@Suppress("DEPRECATION")
class ActivityEvidenceReaderTest {
    private val context: Context get() = RuntimeEnvironment.getApplication()
    private val now = 1793091600000L
    private fun grantUsage() { shadowOf(context.getSystemService(AppOpsManager::class.java)).setMode(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName, AppOpsManager.MODE_ALLOWED) }
    @Test fun disabledAndMissingPermissionAreDistinct() {
        assertEquals("disabled", ActivityEvidenceReader.usage(context, false, now).first)
        shadowOf(context.getSystemService(AppOpsManager::class.java)).setMode(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName, AppOpsManager.MODE_IGNORED)
        assertEquals("permission_missing", ActivityEvidenceReader.usage(context, true, now).first)
        assertEquals("permission_missing", ActivityEvidenceReader.media(context, true, null, now).first)
    }
    @Test fun resumedVideoAppRetainsOriginalChangeTimeAndPauseClearsForeground() {
        grantUsage(); val stats = shadowOf(context.getSystemService(UsageStatsManager::class.java))
        stats.addEvent("com.google.android.youtube", now - 60000, 1)
        shadowOf(context.getSystemService(PowerManager::class.java)).setIsInteractive(true)
        val (state, usage) = ActivityEvidenceReader.usage(context, true, now)
        assertEquals("available", state); assertNotNull(usage)
        assertEquals("video", usage!!.getString("category")); assertEquals(now - 60000, usage.getLong("changedAt"))
        stats.addEvent("com.google.android.youtube", now - 1000, 2)
        assertNull(ActivityEvidenceReader.usage(context, true, now).second)
    }
    @Test fun screenNotInteractiveDoesNotPretendForegroundViewing() {
        grantUsage(); shadowOf(context.getSystemService(UsageStatsManager::class.java)).addEvent("com.google.android.youtube", now - 60000, 1)
        shadowOf(context.getSystemService(PowerManager::class.java)).setIsInteractive(false)
        assertNull(ActivityEvidenceReader.usage(context, true, now).second)
    }
    @Test fun mediaSessionPlaybackAndPauseAreObservedSeparately() {
        val component = ComponentName(context, CareNotificationListener::class.java)
        shadowOf(context.getSystemService(NotificationManager::class.java)).setNotificationListenerAccessGranted(component, true)
        val session = MediaSession(context, "PicoCare test")
        try {
            val controller = MediaController(context, session.sessionToken)
            shadowOf(controller).setPackageName(context.packageName)
            shadowOf(controller).setPlaybackState(PlaybackState.Builder().setState(PlaybackState.STATE_PLAYING, 0, 1f).build())
            shadowOf(context.getSystemService(MediaSessionManager::class.java)).addController(controller)
            assertEquals("playing", ActivityEvidenceReader.media(context, true, context.packageName, now).second!!.getString("state"))
            shadowOf(controller).setPlaybackState(PlaybackState.Builder().setState(PlaybackState.STATE_PAUSED, 0, 0f).build())
            assertEquals("paused", ActivityEvidenceReader.media(context, true, context.packageName, now).second!!.getString("state"))
        } finally { session.release() }
    }
}
