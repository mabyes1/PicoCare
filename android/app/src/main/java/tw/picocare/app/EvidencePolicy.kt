package tw.picocare.app

object EvidencePolicy {
    fun fresh(ageMillis: Long) = ageMillis in 0..120000
    fun includeNotification(category: String, postedAgeMillis: Long) = postedAgeMillis >= 0 && (category == "navigation" || category == "call" || fresh(postedAgeMillis))
    fun motion(speed: Float, uncertainty: Float): String = when {
        !speed.isFinite() || !uncertainty.isFinite() || speed < 0 || uncertainty < 0 -> "unknown"
        speed - uncertainty >= 0.8f -> "moving"
        speed + uncertainty <= 0.5f -> "stationary"
        else -> "unknown"
    }
}
