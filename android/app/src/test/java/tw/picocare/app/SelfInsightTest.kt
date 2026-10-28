package tw.picocare.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.Robolectric
import org.robolectric.shadows.ShadowAlertDialog
import android.view.View
import android.view.ViewGroup
import android.widget.TextView

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class SelfInsightTest {
    @Test fun conciseDecisionDoesNotAddEmptySectionsOrConfirmationBoilerplate() {
        val decision = JSONObject().put("source", "meta").put("model", "muse-spark-1.3").put("title", "手機螢幕已關閉")
            .put("reason", "").put("at", 1000).put("validUntil", 5000).put("alternatives", JSONArray()).put("gaps", JSONArray())
        val text = SelfInsight.interpretation(JSONObject().put("secretary", JSONObject().put("decision", decision)), 2000)
        assertTrue(text.contains("手機螢幕已關閉")); assertFalse(text.contains("補充：")); assertFalse(text.contains("需要確認："))
        assertFalse(text.contains("不代表")); assertFalse(text.contains("尚需本人確認")); assertFalse(text.contains("仍不知道"))
    }
    @Test fun modelSourceAndConnectionFailureAreClearlySeparated() {
        val decision = JSONObject().put("source", "meta").put("model", "muse-spark-1.3").put("title", "可能正在閱讀")
            .put("reason", "手機提供前景線索").put("at", 1000).put("validUntil", 5000)
        val server = JSONObject().put("secretary", JSONObject().put("decision", decision)).put("meta", JSONObject().put("status", "active"))
        assertTrue(SelfInsight.interpretation(server, 2000).contains("判讀來源：Meta muse-spark-1.3"))
        decision.put("source", "local_evidence"); server.getJSONObject("meta").put("status", "fallback")
        val text = SelfInsight.interpretation(server, 2000)
        assertTrue(text.contains("判讀來源：本地證據規則")); assertTrue(text.contains("API 暫不可用"))
    }
    @Test fun firstScreenOffersOwnSecretaryAndVisibleEvidence() {
        RuntimeEnvironment.getApplication().getSharedPreferences("picocare_meta_v1", 0).edit().clear().commit()
        val controller = Robolectric.buildActivity(MainActivity::class.java).setup()
        try {
            val texts = mutableListOf<TextView>()
            fun visit(v: View) { if (v is TextView) texts.add(v); if (v is ViewGroup) for (i in 0 until v.childCount) visit(v.getChildAt(i)) }
            visit(controller.get().window.decorView)
            for (expected in listOf("我的照護秘書", "它剛剛看到了什麼", "PicoCare 怎麼猜、為什麼")) assertTrue(texts.any { it.text.toString() == expected })
            texts.first { it.text.toString() == "開始使用我的秘書" }.performClick()
            assertTrue(ShadowAlertDialog.getLatestAlertDialog().isShowing)
        } finally { controller.pause().stop().destroy() }
    }
    @Test fun localEvidenceCanBeReadWithoutServerOrCaregiver() {
        val context = RuntimeEnvironment.getApplication(); val config = CareConfig(context); config.beginSelf("Ken")
        assertTrue(config.ready); assertTrue(config.selfMode); assertFalse(config.paired)
        assertEquals("Ken", config.personName)
        val sample = JSONObject().put("batteryPercent", 87).put("charging", false).put("screenInteractive", true).put("sharing", "summary")
            .put("sources", JSONObject().put("usage", "permission_missing").put("media", "disabled").put("notifications", "disabled").put("location", "disabled"))
        val text = SelfInsight.observations(sample, 1000)
        assertTrue(text.contains("87%")); assertTrue(text.contains("前景 App 來源：未授權")); assertTrue(text.contains("媒體播放 來源：未啟用"))
        assertTrue(SelfInsight.interpretation(JSONObject(), 2000).contains("還沒收到秘書判讀"))
    }
    @Test fun staleGuessKeepsEvidenceAlternativesAndOriginalAnswerSeparate() {
        val decision = JSONObject().put("title", "可能正在看影片").put("reason", "前景與播放一致").put("at", 1000).put("validUntil", 2000)
            .put("evidence", JSONArray().put(JSONObject().put("label", "觀測到播放中").put("observedAt", 1000)))
            .put("alternatives", JSONArray().put("播放曾中斷，可能正在切換影片")).put("gaps", JSONArray().put("是否稍後提醒報安"))
        val server = JSONObject().put("secretary", JSONObject().put("decision", decision).put("confirmation", JSONObject().put("text", "我在做別的事").put("observedAt", 1500)))
        val text = SelfInsight.interpretation(server, 3000)
        for (expected in listOf("上次的猜測（需要更新）", "觀測到播放中", "播放曾中斷，可能正在切換影片", "是否稍後提醒報安", "你的原始回答：我在做別的事")) assertTrue(text.contains(expected))
    }
}
