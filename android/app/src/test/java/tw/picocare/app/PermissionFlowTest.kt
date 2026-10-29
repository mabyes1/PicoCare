package tw.picocare.app

import android.app.AlertDialog
import android.app.AppOpsManager
import android.os.Process
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.widget.CheckBox
import android.widget.TextView
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowAlertDialog

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class PermissionFlowTest {
    private val context get() = RuntimeEnvironment.getApplication()
    @Before fun reset() {
        assumeTrue(BuildConfig.FLAVOR == "elder")
        CareConfig(context).prefs.edit().clear().commit()
        shadowOf(context.getSystemService(AppOpsManager::class.java)).setMode(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName, AppOpsManager.MODE_IGNORED)
    }
    private fun texts(root: View): List<TextView> {
        val result = mutableListOf<TextView>()
        fun walk(v: View) { if (v is TextView) result.add(v); if (v is ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i)) }
        walk(root); return result
    }
    @Test fun selectingForegroundSourceAndSavingLaunchesItsMissingPermission() {
        val controller = Robolectric.buildActivity(MainActivity::class.java).setup()
        try {
            texts(controller.get().window.decorView).first { it.text.toString() == "選擇資料來源" }.performClick()
            val dialog = ShadowAlertDialog.getLatestAlertDialog()
            texts(dialog.window!!.decorView).filterIsInstance<CheckBox>().first { it.text.toString().startsWith("前景 App") }.isChecked = true
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).performClick()
            shadowOf(android.os.Looper.getMainLooper()).idle()
            assertTrue(CareConfig(context).prefs.getBoolean("usage", false))
            val intent = shadowOf(controller.get()).nextStartedActivity
            assertEquals(Settings.ACTION_USAGE_ACCESS_SETTINGS, intent.action)
            assertEquals("package:${context.packageName}", intent.data.toString())
        } finally { controller.pause().stop().destroy() }
    }
    @Test fun settingsShortcutRetainsUnsavedSourceChoices() {
        val controller = Robolectric.buildActivity(MainActivity::class.java).setup()
        try {
            texts(controller.get().window.decorView).first { it.text.toString() == "選擇資料來源" }.performClick()
            val dialog = ShadowAlertDialog.getLatestAlertDialog()
            val views = texts(dialog.window!!.decorView)
            views.filterIsInstance<CheckBox>().first { it.text.toString().startsWith("前景 App") }.isChecked = true
            views.first { it.text.toString() == "儲存並開使用權限" }.performClick()
            assertTrue(CareConfig(context).prefs.getBoolean("usage", false))
            assertFalse(dialog.isShowing)
            assertEquals(Settings.ACTION_USAGE_ACCESS_SETTINGS, shadowOf(controller.get()).nextStartedActivity.action)
        } finally { controller.pause().stop().destroy() }
    }
    @Test fun returningFromAndroidSettingsRechecksGrantInsteadOfTrustingSourceCheckbox() {
        CareConfig(context).prefs.edit().putBoolean("usage", true).commit()
        val controller = Robolectric.buildActivity(MainActivity::class.java).setup()
        try {
            shadowOf(android.os.Looper.getMainLooper()).idle()
            val before = texts(controller.get().window.decorView)
            assertTrue(before.any { it.text.toString().contains("前景 App：已選用，Android 尚未授權") })
            assertEquals(View.VISIBLE, before.first { it.text.toString() == "開啟 App 使用權限" }.visibility)
            controller.pause()
            shadowOf(context.getSystemService(AppOpsManager::class.java)).setMode(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName, AppOpsManager.MODE_ALLOWED)
            controller.resume(); shadowOf(android.os.Looper.getMainLooper()).idle()
            val after = texts(controller.get().window.decorView)
            assertTrue(after.any { it.text.toString().contains("前景 App：已選用，Android 已授權") })
            assertEquals(View.GONE, after.first { it.text.toString() == "開啟 App 使用權限" }.visibility)
        } finally { controller.pause().stop().destroy() }
    }
}
