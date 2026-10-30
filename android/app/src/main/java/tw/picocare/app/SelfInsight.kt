package tw.picocare.app

import org.json.JSONObject
import java.text.DateFormat
import java.util.Date
import java.util.Locale

object SelfInsight {
    private fun zh(lang: String) = lang == "zh"
    private fun time(at: Long, lang: String) = if (at <= 0) (if (zh(lang)) "尚未取得" else "Not sampled yet")
        else DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.MEDIUM, if (zh(lang)) Locale.getDefault() else Locale.US).format(Date(at))
    private fun sourceLabel(code: String?, lang: String): String {
        val en = mapOf("available" to "available", "disabled" to "off", "permission_missing" to "not granted", "disconnected" to "collector not connected", "no_fix" to "no fix yet", "stale" to "stale", "inaccurate" to "not accurate enough", "speed_unavailable" to "location ok, speed missing", "error" to "collection failed")
        val zht = mapOf("available" to "可用", "disabled" to "未啟用", "permission_missing" to "未授權", "disconnected" to "服務未連接", "no_fix" to "尚無定位", "stale" to "來源過期", "inaccurate" to "精度不足", "speed_unavailable" to "位置可用，缺速度精度", "error" to "採集失敗")
        return (if (zh(lang)) zht else en)[code] ?: if (zh(lang)) "未提供" else "not provided"
    }
    fun observations(c: JSONObject?, at: Long, lang: String = "en"): String {
        if (c == null) return if (zh(lang)) "還沒有本機取樣。開始自己的秘書後，選擇資料來源並同步。" else "No local samples yet. Start your secretary, pick data sources, then sync."
        val z = zh(lang)
        val lines = mutableListOf(
            if (z) "手機取樣：${time(at, lang)}" else "Phone sample: ${time(at, lang)}",
            if (z) "電量：${if (c.isNull("batteryPercent")) "未知" else "${c.getInt("batteryPercent")}%"}；${if (c.isNull("charging")) "充電狀態未知" else if (c.getBoolean("charging")) "充電中" else "未充電"}"
            else "Battery: ${if (c.isNull("batteryPercent")) "unknown" else "${c.getInt("batteryPercent")}%"}; ${if (c.isNull("charging")) "charging state unknown" else if (c.getBoolean("charging")) "charging" else "not charging"}"
        )
        lines.add(if (z) "裝置：${if (c.isNull("screenInteractive")) "互動狀態未知" else if (c.getBoolean("screenInteractive")) "可互動" else "不可互動"}"
            else "Device: ${if (c.isNull("screenInteractive")) "interaction unknown" else if (c.getBoolean("screenInteractive")) "interactive" else "not interactive"}")
        val sources = c.optJSONObject("sources")
        val names = if (z) listOf("usage" to "前景 App", "media" to "媒體播放", "notifications" to "通知", "location" to "位置")
            else listOf("usage" to "Foreground app", "media" to "Media", "notifications" to "Notifications", "location" to "Location")
        for ((key, label) in names) lines.add(if (z) "$label 來源：${sourceLabel(sources?.optString(key), lang)}" else "$label source: ${sourceLabel(sources?.optString(key), lang)}")
        c.optJSONObject("usage")?.let { lines.add(if (z) "前景 App：${it.optString("appId")}（${if (it.optString("category") == "video") "影音類" else "其他類"}）；觀測 ${time(it.optLong("observedAt"), lang)}"
            else "Foreground app: ${it.optString("appId")} (${if (it.optString("category") == "video") "video" else "other"}); observed ${time(it.optLong("observedAt"), lang)}") }
        c.optJSONObject("media")?.let { lines.add(if (z) "播放觀測：${mapOf("playing" to "播放中", "paused" to "暫停", "stopped" to "已停止")[it.optString("state")] ?: "未知"}；${it.optString("appId")}"
            else "Playback: ${mapOf("playing" to "playing", "paused" to "paused", "stopped" to "stopped")[it.optString("state")] ?: "unknown"}; ${it.optString("appId")}") }
        c.optJSONObject("location")?.let { lines.add(if (z) "分享位置：${it.optDouble("latitude")}, ${it.optDouble("longitude")}；精度 ${it.optDouble("accuracy")}m；${time(it.optLong("observedAt"), lang)}"
            else "Shared location: ${it.optDouble("latitude")}, ${it.optDouble("longitude")}; ±${it.optDouble("accuracy")}m; ${time(it.optLong("observedAt"), lang)}") }
        val notes = c.optJSONArray("notifications")
        val categories = mutableListOf<String>()
        if (notes != null) for (i in 0 until notes.length()) categories.add(when (notes.getJSONObject(i).optString("category")) {
            "navigation" -> if (z) "導航" else "navigation"; "call" -> if (z) "通話" else "call"; else -> if (z) "其他" else "other"
        })
        lines.add(if (z) "通知線索：${if (categories.isEmpty()) "沒有可用線索" else categories.distinct().joinToString("、")}"
            else "Notification hints: ${if (categories.isEmpty()) "none available" else categories.distinct().joinToString(", ")}")
        lines.add(if (z) "分享細度：${if (c.optString("sharing") == "detailed") "詳細分享" else "摘要"}；原始證據保留在本機時間線"
            else "Sharing: ${if (c.optString("sharing") == "detailed") "detailed" else "summary"}; raw evidence stays in the on-device timeline")
        return lines.joinToString("\n")
    }
    fun metaPreview(server: JSONObject, estimatedServerNow: Long, lang: String = "en"): String {
        val z = zh(lang)
        val secretary = server.optJSONObject("secretary")
        val latest = secretary?.optJSONObject("latestMeta")
            ?: secretary?.optJSONObject("decision")?.takeIf { it.optString("source") == "meta" }
            ?: return if (z) "還沒有 Meta 判斷。" else "No Meta reading yet."
        val lines = mutableListOf(latest.optString("title"))
        latest.optString("reason").takeIf { it.isNotBlank() }?.let { lines.add(it) }
        val stamp = if (latest.optLong("validUntil") <= estimatedServerNow) (if (z) "上次結果" else "Last result") else (if (z) "判讀時間" else "Read at")
        lines.add("$stamp：${time(latest.optLong("at"), lang)}")
        latest.optString("model").takeIf { it.isNotBlank() }?.let { lines.add(it) }
        return lines.joinToString("\n")
    }
    data class Note(val id: String, val at: Long, val kind: String, val title: String, val body: String, val evidence: List<String>, val source: String)
    fun notes(server: JSONObject, limit: Int = 8): List<Note> {
        val items = server.optJSONObject("secretary")?.optJSONArray("notes") ?: return emptyList()
        return buildList {
            for (i in 0 until minOf(items.length(), limit)) {
                val n = items.optJSONObject(i) ?: continue
                val raw = n.optJSONArray("evidence")
                val labels = buildList { if (raw != null) for (j in 0 until raw.length()) { val e = raw.optJSONObject(j) ?: continue; add("• ${e.optString("label")}") } }
                add(Note(n.optString("id"), n.optLong("at"), n.optString("kind"), n.optString("title"), n.optString("body"), labels, n.optString("source")))
            }
        }
    }
    data class Weekly(val text: String, val at: Long, val model: String)
    fun weekly(server: JSONObject): Weekly? {
        val w = server.optJSONObject("secretary")?.optJSONObject("weekly") ?: return null
        val text = w.optString("text")
        return if (text.isBlank()) null else Weekly(text, w.optLong("at"), w.optString("model"))
    }
    data class Thinking(val title: String, val reason: String, val observedAt: Long)
    fun thinking(server: JSONObject, estimatedServerNow: Long, lang: String = "en"): Thinking {
        val z = zh(lang)
        val d = server.optJSONObject("secretary")?.optJSONObject("decision")
            ?: return Thinking(if (z) "還沒有想法" else "No thoughts yet", if (z) "手機資料可以先留在本機；連上服務後才會產生服務端的情境猜測。" else "Phone data can stay on-device for now; guesses appear after connecting.", 0)
        val stale = d.optLong("validUntil") <= estimatedServerNow
        return Thinking(d.optString("title") + if (stale) (if (z) "（需要更新）" else " (needs refresh)") else "",
            d.optString("reason").takeIf { it.isNotBlank() } ?: if (z) "維持原本關心流程，等待可用證據。" else "Keeping the usual care flow, waiting for evidence.", d.optLong("at"))
    }
    fun interpretation(server: JSONObject, estimatedServerNow: Long, lang: String = "en"): String {
        val z = zh(lang)
        val secretary = server.optJSONObject("secretary"); val d = secretary?.optJSONObject("decision")
        if (d == null) return if (z) "還沒收到秘書判讀。手機資料可以先留在本機；連上服務後才會產生服務端的情境猜測。"
            else "No secretary reading yet. Phone data can stay on-device; guesses appear after connecting."
        val lines = mutableListOf(if (d.optLong("validUntil") <= estimatedServerNow) (if (z) "上次的猜測（需要更新）" else "Last guess (needs refresh)") else (if (z) "目前的猜測" else "Current guess"), d.optString("title"), if (z) "判讀時間：${time(d.optLong("at"), lang)}" else "Read at: ${time(d.optLong("at"), lang)}")
        d.optString("reason").takeIf { it.isNotBlank() }?.let { lines.add(it) }
        val evidence = d.optJSONArray("evidence")
        if (evidence != null && evidence.length() > 0) {
            lines.add(if (z) "依據：" else "Based on:")
            for (i in 0 until evidence.length()) { val e = evidence.getJSONObject(i); lines.add(if (z) "• ${e.optString("label")}（${time(e.optLong("observedAt"), lang)}）" else "• ${e.optString("label")} (${time(e.optLong("observedAt"), lang)})") }
        }
        for ((key, title) in listOf("alternatives" to if (z) "補充" else "Also possible", "gaps" to if (z) "需要確認" else "To confirm")) {
            val items = d.optJSONArray(key)
            if (items != null && items.length() > 0) { lines.add(if (z) "$title：" else "$title:"); for (i in 0 until items.length()) lines.add("• ${items.getString(i)}") }
        }
        secretary?.optJSONObject("confirmation")?.let { lines.add(if (z) "你的原始回答：${it.optString("text")}（${time(it.optLong("observedAt"), lang)}）" else "Your original answer: ${it.optString("text")} (${time(it.optLong("observedAt"), lang)})") }
        secretary?.optJSONObject("outing")?.let { lines.add(if (z) "外出確認進度：${it.optString("reason")}" else "Outing check: ${it.optString("reason")}") }
        lines.add(if (d.optString("source") == "meta") "判讀來源：Meta ${d.optString("model")}".let { if (z) it else "Read by: Meta ${d.optString("model")}" } else if (z) "判讀來源：本地證據規則。" else "Read by: on-device evidence rules.")
        server.optJSONObject("meta")?.let { meta ->
            val states = if (z) mapOf("not_configured" to "尚未設定", "disabled" to "未啟用", "key_missing" to "後端缺少 Key", "ready" to "已設定，等待判讀", "connecting" to "判讀中", "active" to "已連線", "fallback" to "API 暫不可用，使用本地規則", "daily_limit" to "今日次數上限，使用本地規則")
                else mapOf("not_configured" to "not set up", "disabled" to "off", "key_missing" to "backend key missing", "ready" to "set, waiting for a read", "connecting" to "reading", "active" to "connected", "fallback" to "API unavailable, using on-device rules", "daily_limit" to "daily limit reached, using on-device rules")
            lines.add("${if (z) "Meta 連線" else "Meta link"}：${states[meta.optString("status")] ?: meta.optString("status")}")
        }
        return lines.joinToString("\n")
    }
}
