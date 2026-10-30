package tw.picocare.app

import org.json.JSONObject
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class CareParsingTest {
    @Test fun personSummaryShowsCheckinConnectionHelpAndDemo() {
        val p = JSONObject().put("checkin", "awaiting").put("connection", "recent").put("helpOpen", true).put("demo", true)
        val s = CareView.personSummary(p, "zh")
        for (expected in listOf("等候報安", "連線正常", "已求助", "示範")) assertTrue(s.contains(expected))
        assertTrue(CareView.personSummary(JSONObject().put("checkin", "reported").put("connection", "stale"), "zh").contains("已報安"))
        val en = CareView.personSummary(p)
        for (expected in listOf("Waiting for check-in", "Connected", "Asked for help", "Demo")) assertTrue(en.contains(expected))
    }
    @Test fun personBadgesCarryToneForEveryState() {
        val badges = CareView.personBadges(JSONObject().put("checkin", "awaiting").put("connection", "stale").put("helpOpen", true).put("demo", true), "zh")
        assertEquals(listOf("等候報安" to "warn", "連線過期" to "warn", "已求助" to "bad", "示範" to "mute"), badges)
        val ok = CareView.personBadges(JSONObject().put("checkin", "reported").put("connection", "recent"), "zh")
        assertEquals(listOf("已報安" to "ok", "連線正常" to "ok"), ok)
        assertEquals(listOf("Waiting" to "warn", "Stale" to "warn", "Help" to "bad", "Demo" to "mute"),
            CareView.personBadges(JSONObject().put("checkin", "awaiting").put("connection", "stale").put("helpOpen", true).put("demo", true)))
    }
    @Test fun alertTitleFallsBackToKindAndQuestionLineShowsAnswer() {
        assertEquals("本人求助", CareView.alertTitle(JSONObject().put("kind", "help").put("title", ""), "zh"))
        assertEquals("需要釐清", CareView.alertTitle(JSONObject().put("kind", "unclarified"), "zh"))
        assertEquals("自定標題", CareView.alertTitle(JSONObject().put("kind", "help").put("title", "自定標題"), "zh"))
        assertEquals("Asked for help", CareView.alertTitle(JSONObject().put("kind", "help").put("title", "")))
        val open = CareView.questionLine(JSONObject().put("prompt", "還好嗎？"), "zh")
        assertTrue(open.contains("尚未回答"))
        assertTrue(CareView.questionLine(JSONObject().put("prompt", "How are you?")).contains("no answer yet"))
        val answered = CareView.questionLine(JSONObject().put("prompt", "還好嗎？").put("answer", JSONObject().put("label", "很好").put("elseText", "")), "zh")
        assertTrue(answered.contains("很好")); assertFalse(answered.contains("尚未回答"))
        val elseAnswer = CareView.questionLine(JSONObject().put("prompt", "還好嗎？").put("answer", JSONObject().put("label", "以上都不符合").put("elseText", "我在等朋友")), "zh")
        assertTrue(elseAnswer.contains("我在等朋友"))
    }
    @Test fun caregiverSessionPersistsEndpointAndCookie() {
        val context = RuntimeEnvironment.getApplication()
        val session = CareSession(context)
        session.endpoint = "https://example.trycloudflare.com"; session.cookie = "abc123"; session.workspaceLabel = "我的照顧空間"
        val again = CareSession(context)
        assertTrue(again.ready); assertEquals("https://example.trycloudflare.com", again.endpoint)
        assertEquals("abc123", again.cookie); assertEquals("我的照顧空間", again.workspaceLabel)
    }
    @Test fun careFlavorBootsIntoCaregiverHome() {
        assumeTrue(BuildConfig.FLAVOR == "care")
        RuntimeEnvironment.getApplication().getSharedPreferences("picocare_care_v1", 0).edit().clear().commit()
        val controller = Robolectric.buildActivity(CareActivity::class.java).setup()
        try {
            val texts = mutableListOf<TextView>()
            fun visit(v: View) { if (v is TextView) texts.add(v); if (v is ViewGroup) for (i in 0 until v.childCount) visit(v.getChildAt(i)) }
            visit(controller.get().window.decorView)
            for (expected in listOf("PicoCare for caregivers", "People you watch over", "Create & join the demo")) assertTrue(texts.any { it.text.toString() == expected })
        } finally { controller.pause().stop().destroy() }
    }
}
