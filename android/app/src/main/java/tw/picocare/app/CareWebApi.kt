package tw.picocare.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI

class CareSession(context: Context) {
    val prefs = context.getSharedPreferences("picocare_care_v1", Context.MODE_PRIVATE)
    var endpoint: String
        get() = prefs.getString("endpoint", "")!!
        set(value) { check(prefs.edit().putString("endpoint", CareConfig.validateEndpoint(value)).commit()) { "服務網址儲存失敗" } }
    var cookie: String
        get() = prefs.getString("session", "")!!
        set(value) { check(prefs.edit().putString("session", value).commit()) { "工作階段儲存失敗" } }
    val ready: Boolean get() = endpoint.isNotBlank() && cookie.isNotBlank()
    var workspaceLabel: String
        get() = prefs.getString("workspace", "")!!
        set(value) { prefs.edit().putString("workspace", value).apply() }
}

class CareWebApi(private val session: CareSession) {
    private fun conn(path: String): HttpURLConnection {
        val c = URI(session.endpoint + path).toURL().openConnection() as HttpURLConnection
        c.connectTimeout = 8000; c.readTimeout = 8000; c.instanceFollowRedirects = false
        c.setRequestProperty("Accept", "application/json")
        if (session.cookie.isNotBlank()) c.setRequestProperty("Cookie", "picocare_session=${session.cookie}")
        return c
    }
    private fun read(connection: HttpURLConnection): JSONObject {
        try {
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val raw = stream?.bufferedReader()?.use { it.readText().take(65536) } ?: "{}"
            val result = try { JSONObject(raw) } catch (_: Exception) { JSONObject() }
            if (status == 401) throw ApiFailure(status, "工作階段過期，請重建照顧空間")
            if (status !in 200..299) throw ApiFailure(status, result.optString("error", "服務回應 $status"))
            return result
        } finally { connection.disconnect() }
    }
    fun get(path: String): JSONObject = read(conn(path).apply { requestMethod = "GET" })
    fun post(path: String, body: JSONObject? = null): JSONObject {
        val c = conn(path)
        try {
            c.requestMethod = "POST"
            if (body != null) { c.doOutput = true; c.setRequestProperty("Content-Type", "application/json"); c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) } }
            val status = c.responseCode
            val stream = if (status in 200..299) c.inputStream else c.errorStream
            val raw = stream?.bufferedReader()?.use { it.readText().take(65536) } ?: "{}"
            val result = try { JSONObject(raw) } catch (_: Exception) { JSONObject() }
            if (status == 401) throw ApiFailure(status, "工作階段過期，請重建照顧空間")
            if (status !in 200..299) throw ApiFailure(status, result.optString("error", "服務回應 $status"))
            c.getHeaderField("Set-Cookie")?.let { setCookie ->
                Regex("picocare_session=([A-Za-z0-9_-]+)").find(setCookie)?.groupValues?.get(1)?.let { session.cookie = it }
            }
            return result
        } finally { c.disconnect() }
    }
    fun createWorkspace(label: String, caregiverName: String): JSONObject {
        val r = post("/api/workspaces", JSONObject().put("label", label).put("kind", "personal").put("caregiverName", caregiverName).put("timezone", "Asia/Taipei"))
        session.workspaceLabel = r.getJSONObject("workspace").optString("label")
        return r
    }
}

object CareView {
    fun personSummary(p: JSONObject): String {
        val checkin = if (p.optString("checkin") == "reported") "已報安" else "等候報安"
        val conn = mapOf("recent" to "連線正常", "stale" to "連線過期", "waiting" to "等待連線")[p.optString("connection")] ?: "連線未知"
        return "$checkin · $conn${if (p.optBoolean("helpOpen")) " · 已求助" else ""}${if (p.optBoolean("demo")) " · 示範" else ""}"
    }
    fun personBadges(p: JSONObject): List<Pair<String, String>> = buildList {
        if (p.optString("checkin") == "reported") add("已報安" to "ok") else add("等候報安" to "warn")
        add(when (p.optString("connection")) { "recent" -> "連線正常" to "ok"; "stale" -> "連線過期" to "warn"; else -> "等待連線" to "mute" })
        if (p.optBoolean("helpOpen")) add("已求助" to "bad")
        if (p.optBoolean("demo")) add("示範" to "mute")
    }
    fun alertTitle(a: JSONObject): String = a.optString("title").takeIf { it.isNotBlank() } ?: if (a.optString("kind") == "help") "本人求助" else "需要釐清"
    fun questionLine(q: JSONObject): String {
        val prompt = q.optString("prompt").take(60)
        val a = q.optJSONObject("answer")
        return if (a == null) "問：$prompt（尚未回答）" else "問：$prompt\n答：${a.optString("elseText").takeIf { it.isNotBlank() } ?: a.optString("label")}"
    }
}
