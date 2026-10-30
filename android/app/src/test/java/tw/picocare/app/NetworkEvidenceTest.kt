package tw.picocare.app

import android.app.AlertDialog
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.Assume.assumeTrue
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowAlertDialog

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class NetworkEvidenceTest {
    private val context get() = RuntimeEnvironment.getApplication()
    @Before fun reset() { CareConfig(context).prefs.edit().clear().commit() }
    @Test fun wifiContinuityAndCellularSwitchKeepOriginalPairingPreferences() {
        val prefs = CareConfig(context).prefs
        prefs.edit().putString("token", "existing-encrypted-token").putBoolean("self_mode", true).putString("endpoint", "https://example.com").commit()
        val first = NetworkEvidence.capture(prefs, listOf("wifi"), 1000)
        assertEquals(1000, first.getLong("changedAt"))
        assertEquals(1000, NetworkEvidence.capture(prefs, listOf("wifi"), 2000).getLong("changedAt"))
        val switched = NetworkEvidence.capture(prefs, listOf("cellular"), 3000)
        assertEquals(3000, switched.getLong("changedAt"))
        assertEquals("cellular", switched.getJSONArray("transports").getString(0))
        assertEquals("existing-encrypted-token", prefs.getString("token", null))
        assertTrue(prefs.getBoolean("self_mode", false))
        assertEquals(setOf("transports", "observedAt", "changedAt"), switched.keys().asSequence().toSet())
    }
    @Test fun noNetworkAndClockRollbackProduceHonestFreshTransitions() {
        val prefs = CareConfig(context).prefs
        NetworkEvidence.capture(prefs, listOf("wifi", "vpn"), 5000)
        assertEquals(4000, NetworkEvidence.capture(prefs, listOf("wifi", "vpn"), 4000).getLong("changedAt"))
        val offline = NetworkEvidence.capture(prefs, emptyList(), 6000)
        assertEquals(0, offline.getJSONArray("transports").length())
        assertEquals(6000, offline.getLong("changedAt"))
    }
    @Test fun selfRegisteredPersonCanOpenCaregiverLinkWithoutClearingIdentity() {
        assumeTrue(BuildConfig.FLAVOR == "elder")
        val prefs = CareConfig(context).prefs
        prefs.edit().putString("token", "existing-encrypted-token").putBoolean("self_mode", true).putString("person_name", "Ken").commit()
        val controller = Robolectric.buildActivity(MainActivity::class.java).setup()
        try {
            MainActivity::class.java.getDeclaredMethod("pairing").apply { isAccessible = true }.invoke(controller.get())
            val dialog = ShadowAlertDialog.getLatestAlertDialog()
            assertTrue(dialog.isShowing)
            assertNotNull(dialog.getButton(AlertDialog.BUTTON_POSITIVE))
            assertEquals("existing-encrypted-token", prefs.getString("token", null))
            assertEquals("Ken", prefs.getString("person_name", null))
        } finally { controller.pause().stop().destroy() }
    }
}
