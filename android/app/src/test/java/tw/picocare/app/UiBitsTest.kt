package tw.picocare.app

import org.junit.Assert.*
import org.junit.Test

class UiBitsTest {
    @Test fun timelineLabelsCoverKnownKinds() {
        assertEquals("手機動態", UiBits.timelineLabel("context"))
        assertEquals("回答問題", UiBits.timelineLabel("question_answer"))
        assertEquals("本人報安", UiBits.timelineLabel("checkin"))
        assertEquals("需要協助", UiBits.timelineLabel("help"))
        assertEquals("手機配對", UiBits.timelineLabel("pairing"))
        assertEquals("關心設定", UiBits.timelineLabel("plan"))
        assertEquals("mystery", UiBits.timelineLabel("mystery"))
    }
}
