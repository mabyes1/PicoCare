package tw.picocare.app

import org.junit.Assert.*
import org.junit.Test

class EvidencePolicyTest {
    @Test fun activeNavigationAndCallDoNotExpireWithPublicationAge() {
        assertTrue(EvidencePolicy.includeNotification("navigation", 3600000))
        assertTrue(EvidencePolicy.includeNotification("call", 600000))
        assertFalse(EvidencePolicy.includeNotification("other", 120001))
        assertFalse(EvidencePolicy.includeNotification("navigation", -1))
    }
    @Test fun staleAndFuturePositionAreNotCurrent() {
        assertTrue(EvidencePolicy.fresh(120000))
        assertFalse(EvidencePolicy.fresh(120001))
        assertFalse(EvidencePolicy.fresh(-1))
    }
    @Test fun ambiguousSpeedMustRemainUnknown() {
        assertEquals("moving", EvidencePolicy.motion(1.2f, 0.2f))
        assertEquals("stationary", EvidencePolicy.motion(0.1f, 0.2f))
        assertEquals("unknown", EvidencePolicy.motion(0.9f, 0.5f))
        assertEquals("unknown", EvidencePolicy.motion(2f, Float.POSITIVE_INFINITY))
    }
}
