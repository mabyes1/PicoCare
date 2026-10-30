package tw.picocare.app

import org.junit.Assert.*
import org.junit.Test

class UiBitsTest {
    @Test fun timelineLabelsCoverKnownKinds() {
        assertEquals("手機動態", UiBits.timelineLabel("context", "zh"))
        assertEquals("回答問題", UiBits.timelineLabel("question_answer", "zh"))
        assertEquals("本人報安", UiBits.timelineLabel("checkin", "zh"))
        assertEquals("需要協助", UiBits.timelineLabel("help", "zh"))
        assertEquals("手機配對", UiBits.timelineLabel("pairing", "zh"))
        assertEquals("關心設定", UiBits.timelineLabel("plan", "zh"))
        assertEquals("mystery", UiBits.timelineLabel("mystery", "zh"))
    }
    @Test fun timelineLabelsDefaultToEnglish() {
        assertEquals("Phone activity", UiBits.timelineLabel("context"))
        assertEquals("Answered", UiBits.timelineLabel("question_answer"))
        assertEquals("Check-in", UiBits.timelineLabel("checkin"))
        assertEquals("Asked for help", UiBits.timelineLabel("help"))
        assertEquals("Pairing", UiBits.timelineLabel("pairing"))
        assertEquals("Care plan", UiBits.timelineLabel("plan"))
        assertEquals("mystery", UiBits.timelineLabel("mystery"))
    }
}
