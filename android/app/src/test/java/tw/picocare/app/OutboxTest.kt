package tw.picocare.app

import android.content.Context
import org.json.JSONObject
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import java.util.UUID

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class OutboxTest {
    private lateinit var context: Context
    private lateinit var box: Outbox
    private var now = 1793091600000L
    @Before fun setup() {
        context = RuntimeEnvironment.getApplication()
        context.deleteDatabase("picocare_meta_outbox.sqlite")
        box = Outbox(context) { now }
    }
    @After fun cleanup() { box.close(); context.deleteDatabase("picocare_meta_outbox.sqlite") }
    private fun event(kind: String) = JSONObject().put("eventId", UUID.randomUUID().toString()).put("kind", kind).put("observedAt", now)
    private fun sample() = event("context").put("context", JSONObject().put("batteryPercent", 50))
    @Test fun successfulSyncPreservesLocalEvidenceAcrossReopen() {
        val e = sample(); box.add(e); box.remove(e.getString("eventId")); assertEquals(0, box.count())
        box.close(); box = Outbox(context) { now }
        val evidence = box.recentEvidence().single()
        assertEquals("sent", evidence.getString("delivery")); assertEquals(e.toString(), evidence.getJSONObject("event").toString())
        assertEquals(now, evidence.getLong("receivedAt"))
    }
    @Test fun offlineSnapshotsAreKeptAndHelpGoesFirst() {
        val first = sample(); box.add(first); now += 30000
        val second = sample(); box.add(second); val help = event("help"); box.add(help)
        val pending = box.pending(); assertEquals(3, pending.size)
        assertEquals(help.getString("eventId"), pending.first().first)
        assertEquals(setOf(first.getString("eventId"), second.getString("eventId"), help.getString("eventId")), box.recentEvidence().map { it.getJSONObject("event").getString("eventId") }.toSet())
    }
    @Test fun permanentFailureIsKeptAndDuplicateWriteRollsBack() {
        val e = event("help"); box.add(e); box.fail(e.getString("eventId"), "配對需要檢查")
        assertEquals(0, box.count()); assertEquals(1, box.count("failed"))
        assertEquals("failed", box.recentEvidence().single().getString("delivery"))
        try { box.add(e); fail("duplicate must fail") } catch (_: android.database.sqlite.SQLiteConstraintException) { }
        assertEquals(1, box.recentEvidence().size)
    }
    @Test fun oldPendingHelpSurvivesRetentionWhileOldSamplesAreRemoved() {
        val delivered = sample(); box.add(delivered); box.remove(delivered.getString("eventId"))
        val offline = sample(); box.add(offline)
        val help = event("help"); box.add(help)
        now += 8L * 86400000; box.add(sample())
        val kept = box.recentEvidence().map { it.getJSONObject("event").getString("eventId") }
        assertEquals(2, kept.size); assertTrue(kept.contains(help.getString("eventId")))
        assertFalse(kept.contains(delivered.getString("eventId"))); assertFalse(kept.contains(offline.getString("eventId")))
        assertEquals(2, box.pending().size)
    }
    @Test fun versionTwoUpgradePreservesPendingAndFailedEvents() {
        box.close()
        context.openOrCreateDatabase("picocare_meta_outbox.sqlite", Context.MODE_PRIVATE, null).use { db ->
            db.execSQL("CREATE TABLE events(id TEXT PRIMARY KEY,body TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',error TEXT)")
            db.execSQL("CREATE TABLE question_receipts(question_id TEXT PRIMARY KEY,event_id TEXT NOT NULL)")
            for (state in listOf("pending", "failed")) {
                val e = event("help")
                db.execSQL("INSERT INTO events VALUES(?,?,?,?)", arrayOf(e.getString("eventId"), e.toString(), state, if (state == "failed") "錯誤" else null))
            }
            db.version = 2
        }
        box = Outbox(context) { now }
        assertEquals(1, box.count()); assertEquals(1, box.count("failed")); assertEquals(2, box.recentEvidence().size)
        assertEquals(setOf("pending", "failed"), box.recentEvidence().map { it.getString("delivery") }.toSet())
    }
    @Test fun questionAnswerKeepsReceiptAndOriginalTextAfterDelivery() {
        val e = event("question_answer").put("questionId", "question-1").put("optionId", "else").put("elseText", "手機留在家裡")
        box.add(e); assertEquals("pending", box.questionState("question-1"))
        box.remove(e.getString("eventId")); box.close(); box = Outbox(context) { now }
        assertEquals("received", box.questionState("question-1"))
        assertEquals("手機留在家裡", box.recentEvidence().single().getJSONObject("event").getString("elseText"))
    }
    @Test fun dailyQueryUsesObservationDayAndCountsDeliveredEvidence() {
        val start = now; val e = sample(); box.add(e); box.remove(e.getString("eventId"), now + 5000)
        now += 86400000; box.add(event("checkin"))
        val summary = box.evidenceSummary(start, start + 86400000)
        assertEquals(1, summary.getInt("count")); assertEquals(1, summary.getInt("samples")); assertEquals(1, summary.getInt("sent"))
        val rows = box.recentEvidence(start = start, end = start + 86400000)
        assertEquals(1, rows.size); assertEquals(start + 5000, rows.single().getLong("receivedAt"))
        assertEquals(1, box.evidenceSummary(start + 86400000, start + 2 * 86400000).getInt("count"))
    }
}
