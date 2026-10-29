package tw.picocare.app

import org.json.JSONObject
import java.text.DateFormat
import java.util.Date

object SelfInsight {
    private fun time(at: Long) = if (at <= 0) "尚未取得" else DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.MEDIUM).format(Date(at))
    private val sourceLabels = mapOf("available" to "可用", "disabled" to "未啟用", "permission_missing" to "未授權", "disconnected" to "服務未連接", "no_fix" to "尚無定位", "stale" to "來源過期", "inaccurate" to "精度不足", "speed_unavailable" to "位置可用，缺速度精度", "error" to "採集失敗")
    fun observations(c: JSONObject?, at: Long): String {
        if (c == null) return "還沒有本機取樣。開始自己的秘書後，選擇資料來源並同步。"
        val lines = mutableListOf("手機取樣：${time(at)}", "電量：${if (c.isNull("batteryPercent")) "未知" else "${c.getInt("batteryPercent")}%"}；${if (c.isNull("charging")) "充電狀態未知" else if (c.getBoolean("charging")) "充電中" else "未充電"}")
        lines.add("裝置：${if (c.isNull("screenInteractive")) "互動狀態未知" else if (c.getBoolean("screenInteractive")) "可互動" else "不可互動"}")
        val sources = c.optJSONObject("sources")
        for ((key, label) in listOf("usage" to "前景 App", "media" to "媒體播放", "notifications" to "通知", "location" to "位置")) lines.add("$label 來源：${sourceLabels[sources?.optString(key)] ?: "未提供"}")
        c.optJSONObject("usage")?.let { lines.add("前景 App：${it.optString("appId")}（${if (it.optString("category") == "video") "影音類" else "其他類"}）；觀測 ${time(it.optLong("observedAt"))}") }
        c.optJSONObject("media")?.let { lines.add("播放觀測：${mapOf("playing" to "播放中", "paused" to "暫停", "stopped" to "已停止")[it.optString("state")] ?: "未知"}；${it.optString("appId")}") }
        c.optJSONObject("location")?.let { lines.add("分享位置：${it.optDouble("latitude")}, ${it.optDouble("longitude")}；精度 ${it.optDouble("accuracy")}m；${time(it.optLong("observedAt"))}") }
        val notes = c.optJSONArray("notifications")
        val categories = mutableListOf<String>()
        if (notes != null) for (i in 0 until notes.length()) categories.add(when (notes.getJSONObject(i).optString("category")) { "navigation" -> "導航"; "call" -> "通話"; else -> "其他" })
        lines.add("通知線索：${if (categories.isEmpty()) "沒有可用線索" else categories.distinct().joinToString("、")}")
        lines.add("分享細度：${if (c.optString("sharing") == "detailed") "詳細分享" else "摘要"}；原始證據保留在本機時間線")
        return lines.joinToString("\n")
    }
    fun metaPreview(server: JSONObject, estimatedServerNow: Long): String {
        val secretary = server.optJSONObject("secretary")
        val latest = secretary?.optJSONObject("latestMeta")
            ?: secretary?.optJSONObject("decision")?.takeIf { it.optString("source") == "meta" }
            ?: return "還沒有 Meta 判斷。"
        val lines = mutableListOf(latest.optString("title"))
        latest.optString("reason").takeIf { it.isNotBlank() }?.let { lines.add(it) }
        val stamp = if (latest.optLong("validUntil") <= estimatedServerNow) "上次結果" else "判讀時間"
        lines.add("$stamp：${time(latest.optLong("at"))}")
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
    fun thinking(server: JSONObject, estimatedServerNow: Long): Thinking {
        val d = server.optJSONObject("secretary")?.optJSONObject("decision")
            ?: return Thinking("還沒有想法", "手機資料可以先留在本機；連上服務後才會產生服務端的情境猜測。", 0)
        val stale = d.optLong("validUntil") <= estimatedServerNow
        return Thinking(d.optString("title") + if (stale) "（需要更新）" else "",
            d.optString("reason").takeIf { it.isNotBlank() } ?: "維持原本關心流程，等待可用證據。", d.optLong("at"))
    }
    fun interpretation(server: JSONObject, estimatedServerNow: Long): String {
        val secretary = server.optJSONObject("secretary"); val d = secretary?.optJSONObject("decision")
        if (d == null) return "還沒收到秘書判讀。手機資料可以先留在本機；連上服務後才會產生服務端的情境猜測。"
        val lines = mutableListOf(if (d.optLong("validUntil") <= estimatedServerNow) "上次的猜測（需要更新）" else "目前的猜測", d.optString("title"), "判讀時間：${time(d.optLong("at"))}")
        d.optString("reason").takeIf { it.isNotBlank() }?.let { lines.add(it) }
        val evidence = d.optJSONArray("evidence")
        if (evidence != null && evidence.length() > 0) {
            lines.add("依據：")
            for (i in 0 until evidence.length()) { val e = evidence.getJSONObject(i); lines.add("• ${e.optString("label")}（${time(e.optLong("observedAt"))}）") }
        }
        for ((key, title) in listOf("alternatives" to "補充", "gaps" to "需要確認")) {
            val items = d.optJSONArray(key)
            if (items != null && items.length() > 0) { lines.add("$title："); for (i in 0 until items.length()) lines.add("• ${items.getString(i)}") }
        }
        secretary?.optJSONObject("confirmation")?.let { lines.add("你的原始回答：${it.optString("text")}（${time(it.optLong("observedAt"))}）") }
        secretary?.optJSONObject("outing")?.let { lines.add("外出確認進度：${it.optString("reason")}") }
        lines.add(if (d.optString("source") == "meta") "判讀來源：Meta ${d.optString("model")}" else "判讀來源：本地證據規則。")
        server.optJSONObject("meta")?.let { meta ->
            val state = mapOf("not_configured" to "尚未設定", "disabled" to "未啟用", "key_missing" to "後端缺少 Key", "ready" to "已設定，等待判讀", "connecting" to "判讀中", "active" to "已連線", "fallback" to "API 暫不可用，使用本地規則", "daily_limit" to "今日次數上限，使用本地規則")[meta.optString("status")] ?: meta.optString("status")
            lines.add("Meta 連線：$state")
        }
        return lines.joinToString("\n")
    }
}
