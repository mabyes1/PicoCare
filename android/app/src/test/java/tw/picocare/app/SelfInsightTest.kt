package tw.picocare.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
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
    @Test fun latestMetaStaysVisibleWhenCurrentDecisionUsesLocalRules() {
        val latest = JSONObject().put("source", "meta").put("model", "muse-spark-1.3").put("title", "看起來正在看 YouTube")
            .put("reason", "影片已播放兩分鐘。").put("at", 1000).put("validUntil", 2000)
        val current = JSONObject().put("source", "local_evidence").put("title", "手機螢幕開啟")
        val server = JSONObject().put("secretary", JSONObject().put("latestMeta", latest).put("decision", current))
        val text = SelfInsight.metaPreview(server, 3000, "zh")
        assertTrue(text.contains("看起來正在看 YouTube")); assertTrue(text.contains("影片已播放兩分鐘。"))
        assertTrue(text.contains("上次結果")); assertTrue(text.contains("muse-spark-1.3")); assertFalse(text.contains("手機螢幕開啟"))
        assertEquals("還沒有 Meta 判斷。", SelfInsight.metaPreview(JSONObject(), 3000, "zh"))
        assertEquals("No Meta reading yet.", SelfInsight.metaPreview(JSONObject(), 3000))
    }
    @Test fun conciseDecisionDoesNotAddEmptySectionsOrConfirmationBoilerplate() {
        val decision = JSONObject().put("source", "meta").put("model", "muse-spark-1.3").put("title", "手機螢幕已關閉")
            .put("reason", "").put("at", 1000).put("validUntil", 5000).put("alternatives", JSONArray()).put("gaps", JSONArray())
        val text = SelfInsight.interpretation(JSONObject().put("secretary", JSONObject().put("decision", decision)), 2000, "zh")
        assertTrue(text.contains("手機螢幕已關閉")); assertFalse(text.contains("補充：")); assertFalse(text.contains("需要確認："))
        assertFalse(text.contains("不代表")); assertFalse(text.contains("尚需本人確認")); assertFalse(text.contains("仍不知道"))
        val en = SelfInsight.interpretation(JSONObject().put("secretary", JSONObject().put("decision", decision)), 2000)
        assertFalse(en.contains("Also possible:")); assertFalse(en.contains("To confirm:"))
    }
    @Test fun modelSourceAndConnectionFailureAreClearlySeparated() {
        val decision = JSONObject().put("source", "meta").put("model", "muse-spark-1.3").put("title", "可能正在閱讀")
            .put("reason", "手機提供前景線索").put("at", 1000).put("validUntil", 5000)
        val server = JSONObject().put("secretary", JSONObject().put("decision", decision)).put("meta", JSONObject().put("status", "active"))
        assertTrue(SelfInsight.interpretation(server, 2000, "zh").contains("判讀來源：Meta muse-spark-1.3"))
        decision.put("source", "local_evidence"); server.getJSONObject("meta").put("status", "fallback")
        val text = SelfInsight.interpretation(server, 2000, "zh")
        assertTrue(text.contains("判讀來源：本地證據規則")); assertTrue(text.contains("API 暫不可用"))
        assertTrue(SelfInsight.interpretation(server, 2000).contains("Read by: on-device evidence rules"))
    }
    @Test fun firstScreenOffersOwnSecretaryAndVisibleEvidence() {
        assumeTrue(BuildConfig.FLAVOR == "elder")
        RuntimeEnvironment.getApplication().getSharedPreferences("picocare_meta_v1", 0).edit().clear().commit()
        val controller = Robolectric.buildActivity(MainActivity::class.java).setup()
        try {
            val texts = mutableListOf<TextView>()
            fun visit(v: View) { if (v is TextView) texts.add(v); if (v is ViewGroup) for (i in 0 until v.childCount) visit(v.getChildAt(i)) }
            visit(controller.get().window.decorView)
            for (expected in listOf("My Care Secretary", "PicoCare's caring thoughts", "This week", "Secretary feed", "Details (DEBUG)", "Home", "Insights", "Settings")) assertTrue(texts.any { it.text.toString() == expected })
            texts.first { it.text.toString() == "Start my secretary" }.performClick()
            assertTrue(ShadowAlertDialog.getLatestAlertDialog().isShowing)
        } finally { controller.pause().stop().destroy() }
    }
    @Test fun localEvidenceCanBeReadWithoutServerOrCaregiver() {
        val context = RuntimeEnvironment.getApplication(); val config = CareConfig(context); config.beginSelf("Ken")
        assertTrue(config.ready); assertTrue(config.selfMode); assertFalse(config.paired)
        assertEquals("Ken", config.personName)
        val sample = JSONObject().put("batteryPercent", 87).put("charging", false).put("screenInteractive", true).put("sharing", "summary")
            .put("sources", JSONObject().put("usage", "permission_missing").put("media", "disabled").put("notifications", "disabled").put("location", "disabled"))
        val text = SelfInsight.observations(sample, 1000, "zh")
        assertTrue(text.contains("87%")); assertTrue(text.contains("前景 App 來源：未授權")); assertTrue(text.contains("媒體播放 來源：未啟用"))
        assertTrue(SelfInsight.interpretation(JSONObject(), 2000, "zh").contains("還沒收到秘書判讀"))
        assertTrue(SelfInsight.observations(sample, 1000).contains("Foreground app source: not granted"))
    }
    @Test fun userThinkingShowsTitleReasonAndFreshnessWithoutPlumbing() {
        val decision = JSONObject().put("source", "meta").put("model", "muse-spark-1.3").put("title", "可能正在看影片")
            .put("reason", "前景與播放一致").put("at", 1000).put("validUntil", 5000)
        val thinking = SelfInsight.thinking(JSONObject().put("secretary", JSONObject().put("decision", decision)), 2000, "zh")
        assertEquals("可能正在看影片", thinking.title); assertEquals("前景與播放一致", thinking.reason); assertEquals(1000, thinking.observedAt)
        val stale = SelfInsight.thinking(JSONObject().put("secretary", JSONObject().put("decision", decision)), 6000, "zh")
        assertEquals("可能正在看影片（需要更新）", stale.title)
        val empty = SelfInsight.thinking(JSONObject(), 2000, "zh")
        assertEquals("還沒有想法", empty.title); assertEquals(0, empty.observedAt)
        assertEquals("No thoughts yet", SelfInsight.thinking(JSONObject(), 2000).title)
    }
    @Test fun notesFeedParsesNotesAndSurvivesMissingField() {
        val note = JSONObject().put("id", "n1").put("at", 2000).put("kind", "morning").put("title", "今天第一次看到你用手機")
            .put("body", "今天 08:00 第一次看到手機亮起來。").put("source", "local_evidence")
            .put("evidence", JSONArray().put(JSONObject().put("label", "今天第一次手機可互動").put("observedAt", 2000)))
        val items = SelfInsight.notes(JSONObject().put("secretary", JSONObject().put("notes", JSONArray().put(note))))
        assertEquals(1, items.size); assertEquals("今天第一次看到你用手機", items[0].title)
        assertEquals(listOf("• 今天第一次手機可互動"), items[0].evidence); assertEquals("local_evidence", items[0].source)
        assertTrue(SelfInsight.notes(JSONObject()).isEmpty())
        assertTrue(SelfInsight.notes(JSONObject().put("secretary", JSONObject())).isEmpty())
    }
    @Test fun weeklyReviewParsesTextAndSurvivesMissingField() {
        val w = JSONObject().put("text", "媽媽這週都有出門走走。").put("at", 2000).put("model", "muse-spark-1.3")
        val weekly = SelfInsight.weekly(JSONObject().put("secretary", JSONObject().put("weekly", w)))!!
        assertEquals("媽媽這週都有出門走走。", weekly.text); assertEquals(2000, weekly.at)
        assertNull(SelfInsight.weekly(JSONObject()))
        assertNull(SelfInsight.weekly(JSONObject().put("secretary", JSONObject().put("weekly", JSONObject().put("text", "")))))
    }
    @Test fun staleGuessKeepsEvidenceAlternativesAndOriginalAnswerSeparate() {
        val decision = JSONObject().put("title", "可能正在看影片").put("reason", "前景與播放一致").put("at", 1000).put("validUntil", 2000)
            .put("evidence", JSONArray().put(JSONObject().put("label", "觀測到播放中").put("observedAt", 1000)))
            .put("alternatives", JSONArray().put("播放曾中斷，可能正在切換影片")).put("gaps", JSONArray().put("是否稍後提醒報安"))
        val server = JSONObject().put("secretary", JSONObject().put("decision", decision).put("confirmation", JSONObject().put("text", "我在做別的事").put("observedAt", 1500)))
        val text = SelfInsight.interpretation(server, 3000, "zh")
        for (expected in listOf("上次的猜測（需要更新）", "觀測到播放中", "播放曾中斷，可能正在切換影片", "是否稍後提醒報安", "你的原始回答：我在做別的事")) assertTrue(text.contains(expected))
    }
}
