package tw.picocare.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI

class CareSession(context: Context) {
    private val app = context.applicationContext
    val prefs = app.getSharedPreferences("picocare_care_v1", Context.MODE_PRIVATE)
    var endpoint: String
        get() = prefs.getString("endpoint", "")!!
        set(value) { check(prefs.edit().putString("endpoint", CareConfig.validateEndpoint(value, AppLang.get(app))).commit()) { AppLang.t(app, "Could not save the service URL", "服務網址儲存失敗") } }
    var cookie: String
        get() = prefs.getString("session", "")!!
        set(value) { check(prefs.edit().putString("session", value).commit()) { AppLang.t(app, "Could not save the session", "工作階段儲存失敗") } }
    var recoveryCode: String
        get() = prefs.getString("recovery:$endpoint", "")!!
        set(value) { check(prefs.edit().putString("recovery:$endpoint", value).commit()) }
    val ready: Boolean get() = endpoint.isNotBlank() && (cookie.isNotBlank() || recoveryCode.isNotBlank())
    var workspaceLabel: String
        get() = prefs.getString("workspace", "")!!
        set(value) { prefs.edit().putString("workspace", value).apply() }
}

class CareWebApi(private val session: CareSession, private val context: Context? = null) {
    private fun t(en: String, zh: String): String = context?.let { AppLang.t(it, en, zh) } ?: en
    private fun conn(path: String): HttpURLConnection {
        val c = URI(session.endpoint + path).toURL().openConnection() as HttpURLConnection
        c.connectTimeout = 8000; c.readTimeout = 8000; c.instanceFollowRedirects = false
        c.setRequestProperty("Accept", "application/json")
        if (session.cookie.isNotBlank()) c.setRequestProperty("Cookie", "picocare_session=${session.cookie}")
        return c
    }
    private fun request(path: String, body: JSONObject? = null, post: Boolean = false): JSONObject {
        val c = conn(path)
        try {
            c.requestMethod = if (post) "POST" else "GET"
            if (body != null) { c.doOutput = true; c.setRequestProperty("Content-Type", "application/json"); c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) } }
            val status = c.responseCode
            val stream = if (status in 200..299) c.inputStream else c.errorStream
            val raw = stream?.bufferedReader()?.use { it.readText().take(65536) } ?: "{}"
            val result = try { JSONObject(raw) } catch (_: Exception) { JSONObject() }
            if (status == 401) throw ApiFailure(status, t("Open your original care space with its recovery code.", "請用恢復碼重新開啟原本的照顧空間。"))
            if (status !in 200..299) throw ApiFailure(status, result.optString("error", t("Service replied $status", "服務回應 $status")))
            c.getHeaderField("Set-Cookie")?.let { setCookie ->
                Regex("picocare_session=([A-Za-z0-9_-]+)").find(setCookie)?.groupValues?.get(1)?.let { session.cookie = it }
            }
            result.optString("recoveryCode").takeIf { it.isNotBlank() }?.let { session.recoveryCode = it }
            result.optJSONObject("workspace")?.optString("label")?.takeIf { it.isNotBlank() }?.let { session.workspaceLabel = it }
            return result
        } finally { c.disconnect() }
    }
    fun restore(code: String): JSONObject = request("/api/session/restore", JSONObject().put("recoveryCode", code.trim()), true)
    private fun authenticated(path: String, body: JSONObject? = null, post: Boolean = false): JSONObject {
        try {
            if (session.recoveryCode.isBlank() && path != "/api/session") request("/api/session")
            return request(path, body, post)
        } catch (error: ApiFailure) {
            if (error.status != 401 || session.recoveryCode.isBlank()) throw error
            restore(session.recoveryCode)
            return request(path, body, post)
        }
    }
    fun get(path: String): JSONObject = authenticated(path)
    fun post(path: String, body: JSONObject? = null): JSONObject =
        if (path == "/api/workspaces" || path == "/api/session/restore") request(path, body, true) else authenticated(path, body, true)
    fun createWorkspace(label: String, caregiverName: String): JSONObject =
        post("/api/workspaces", JSONObject().put("label", label).put("kind", "personal").put("caregiverName", caregiverName).put("timezone", "Asia/Taipei"))
}

object CareView {
    fun personSummary(p: JSONObject, lang: String = "en"): String {
        val z = lang == "zh"
        val checkin = if (p.optString("checkin") == "reported") (if (z) "已報安" else "Checked in") else (if (z) "等候報安" else "Waiting for check-in")
        val conn = (if (z) mapOf("recent" to "連線正常", "stale" to "連線過期", "waiting" to "等待連線") else mapOf("recent" to "Connected", "stale" to "Stale", "waiting" to "Waiting"))[p.optString("connection")] ?: if (z) "連線未知" else "Unknown"
        return "$checkin · $conn${if (p.optBoolean("helpOpen")) if (z) " · 已求助" else " · Asked for help" else ""}${if (p.optBoolean("demo")) if (z) " · 示範" else " · Demo" else ""}"
    }
    fun personBadges(p: JSONObject, lang: String = "en"): List<Pair<String, String>> = buildList {
        val z = lang == "zh"
        if (p.optString("checkin") == "reported") add((if (z) "已報安" else "Checked in") to "ok") else add((if (z) "等候報安" else "Waiting") to "warn")
        add(when (p.optString("connection")) {
            "recent" -> (if (z) "連線正常" else "Connected") to "ok"
            "stale" -> (if (z) "連線過期" else "Stale") to "warn"
            else -> (if (z) "等待連線" else "Waiting") to "mute"
        })
        if (p.optBoolean("helpOpen")) add((if (z) "已求助" else "Help") to "bad")
        if (p.optBoolean("demo")) add((if (z) "示範" else "Demo") to "mute")
    }
    fun alertTitle(a: JSONObject, lang: String = "en"): String = a.optString("title").takeIf { it.isNotBlank() }
        ?: if (a.optString("kind") == "help") (if (lang == "zh") "本人求助" else "Asked for help") else (if (lang == "zh") "需要釐清" else "Needs a look")
    fun questionLine(q: JSONObject, lang: String = "en"): String {
        val prompt = q.optString("prompt").take(60)
        val a = q.optJSONObject("answer")
        return if (lang == "zh") {
            if (a == null) "問：$prompt（尚未回答）" else "問：$prompt\n答：${a.optString("elseText").takeIf { it.isNotBlank() } ?: a.optString("label")}"
        } else {
            if (a == null) "Q: $prompt (no answer yet)" else "Q: $prompt\nA: ${a.optString("elseText").takeIf { it.isNotBlank() } ?: a.optString("label")}"
        }
    }
}
