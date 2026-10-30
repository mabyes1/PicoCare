package tw.picocare.app

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.security.KeyStore
import java.util.UUID
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class CareConfig(context: Context) {
    private val app = context.applicationContext
    val prefs = app.getSharedPreferences("picocare_meta_v1", Context.MODE_PRIVATE)
    private fun t(en: String, zh: String) = AppLang.t(app, en, zh)
    var endpoint: String
        get() = prefs.getString("endpoint", "http://127.0.0.1:4317")!!
        set(value) { check(prefs.edit().putString("endpoint", validateEndpoint(value, AppLang.get(app))).commit()) { t("Could not save the service URL", "服務網址儲存失敗") } }
    val personName: String get() = prefs.getString("person_name", t("Not paired yet", "尚未配對"))!!
    val paired: Boolean get() = prefs.contains("token")
    val selfMode: Boolean get() = prefs.getBoolean("self_mode", false)
    val ready: Boolean get() = paired || selfMode
    var debugMode: Boolean
        get() = prefs.getBoolean("debug_mode", false)
        set(value) { prefs.edit().putBoolean("debug_mode", value).apply() }
    fun beginSelf(name: String) {
        require(!paired && name.trim().isNotEmpty() && name.length <= 40) { t("Please enter your name first", "請先輸入自己的稱呼") }
        val request = prefs.getString("self_request", null) ?: UUID.randomUUID().toString()
        check(prefs.edit().putBoolean("self_mode", true).putString("self_request", request).putString("person_name", name.trim()).commit())
    }
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("picocare_meta_device", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("picocare_meta_device", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun token(): String {
        val bytes = Base64.decode(prefs.getString("token", ""), Base64.NO_WRAP)
        require(bytes.size > 12) { t("The pairing credential needs a reset", "手機配對憑證需要重新設定") }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        return String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8)
    }
    fun savePairing(response: JSONObject) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val encrypted = cipher.iv + cipher.doFinal(response.getString("deviceToken").toByteArray(Charsets.UTF_8))
        check(prefs.edit().putString("token", Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString("person_name", response.getString("personName")).putString("workspace", response.getString("workspaceLabel"))
            .remove("enrollment_request").remove("enrollment_code").commit()) { t("Could not save the pairing", "配對資料儲存失敗") }
    }
    companion object {
        fun validateEndpoint(raw: String, lang: String = "en"): String {
            val z = lang == "zh"
            val value = raw.trim().trimEnd('/'); val uri = URI(value)
            require(uri.host != null && uri.userInfo == null && uri.query == null && uri.fragment == null && (uri.path.isNullOrEmpty() || uri.path == "/")) { if (z) "請輸入服務根網址" else "Please enter the service root URL" }
            require(uri.scheme == "https" || uri.scheme == "http" && uri.host in listOf("127.0.0.1", "localhost")) { if (z) "請使用 HTTPS；本機開發可使用 127.0.0.1" else "Please use HTTPS (127.0.0.1 is fine for local dev)" }
            return value
        }
    }
}

class ApiFailure(val status: Int, message: String) : Exception(message)
class CareApi(private val config: CareConfig, private val context: Context? = null) {
    private fun t(en: String, zh: String): String = context?.let { AppLang.t(it, en, zh) } ?: en
    fun call(path: String, body: JSONObject? = null, authenticated: Boolean = true): JSONObject {
        val connection = URI(config.endpoint + path).toURL().openConnection() as HttpURLConnection
        connection.connectTimeout = 8000; connection.readTimeout = 8000; connection.instanceFollowRedirects = false
        connection.setRequestProperty("Accept", "application/json")
        if (authenticated) connection.setRequestProperty("Authorization", "Bearer ${config.token()}")
        try {
            if (body != null) {
                connection.requestMethod = "POST"; connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val raw = stream?.bufferedReader()?.use { it.readText().take(65536) } ?: "{}"
            val result = try { JSONObject(raw) } catch (_: Exception) { JSONObject() }
            if (status !in 200..299) throw ApiFailure(status, result.optString("error", t("Service replied $status", "服務回應 $status")))
            return result
        } finally { connection.disconnect() }
    }
}

class Outbox(context: Context, private val clock: () -> Long = System::currentTimeMillis) : SQLiteOpenHelper(context, "picocare_meta_outbox.sqlite", null, 3) {
    private val app = context.applicationContext
    private fun t(en: String, zh: String) = AppLang.t(app, en, zh)
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE events(id TEXT PRIMARY KEY,body TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',error TEXT)")
        createQuestionReceipts(db)
        createEvidence(db)
    }
    private fun createQuestionReceipts(db: SQLiteDatabase) { db.execSQL("CREATE TABLE IF NOT EXISTS question_receipts(question_id TEXT PRIMARY KEY,event_id TEXT NOT NULL)") }
    private fun createEvidence(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE IF NOT EXISTS evidence(event_id TEXT PRIMARY KEY,observed_at INTEGER NOT NULL,recorded_at INTEGER NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL,delivery TEXT NOT NULL,received_at INTEGER,error TEXT)")
        db.execSQL("CREATE INDEX IF NOT EXISTS evidence_time ON evidence(observed_at)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) createQuestionReceipts(db)
        if (oldVersion < 3) {
            createEvidence(db)
            db.rawQuery("SELECT id,body,state,error FROM events", null).use { cursor -> while (cursor.moveToNext()) {
                val event = JSONObject(cursor.getString(1))
                db.execSQL("INSERT OR IGNORE INTO evidence(event_id,observed_at,recorded_at,kind,body,delivery,error) VALUES(?,?,?,?,?,?,?)", arrayOf(cursor.getString(0), event.getLong("observedAt"), clock(), event.getString("kind"), cursor.getString(1), cursor.getString(2), cursor.getString(3)))
            } }
        }
    }
    @Synchronized fun add(event: JSONObject) {
        val db = writableDatabase; db.beginTransaction()
        try {
            db.execSQL("INSERT INTO events(id,body) VALUES(?,?)", arrayOf(event.getString("eventId"), event.toString()))
            db.execSQL("INSERT INTO evidence(event_id,observed_at,recorded_at,kind,body,delivery) VALUES(?,?,?,?,?,'pending')", arrayOf(event.getString("eventId"), event.getLong("observedAt"), clock(), event.getString("kind"), event.toString()))
            // Retain seven days locally. Pending user replies/help are never removed by retention.
            val cutoff = clock() - 7L * 86400000
            val expired = t("This sample is older than the 7-day window", "觀測已超過服務接收的七日範圍")
            db.execSQL("UPDATE events SET state='failed',error=? WHERE state='pending' AND id IN(SELECT event_id FROM evidence WHERE kind='context' AND observed_at<?)", arrayOf(expired, cutoff))
            db.execSQL("UPDATE evidence SET delivery='failed',error=? WHERE kind='context' AND observed_at<? AND delivery='pending'", arrayOf(expired, cutoff))
            db.execSQL("DELETE FROM events WHERE id IN(SELECT event_id FROM evidence WHERE kind='context' AND observed_at<? AND delivery='failed')", arrayOf(cutoff))
            db.execSQL("DELETE FROM evidence WHERE observed_at<? AND (delivery='sent' OR kind='context')", arrayOf(cutoff))
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }
    @Synchronized fun pending(): List<Pair<String, JSONObject>> = buildList {
        readableDatabase.rawQuery("SELECT id,body FROM events WHERE state='pending' ORDER BY CASE WHEN body LIKE '%\"kind\":\"context\"%' THEN 1 ELSE 0 END,rowid LIMIT 30", null).use { cursor ->
            while (cursor.moveToNext()) add(cursor.getString(0) to JSONObject(cursor.getString(1)))
        }
    }
    @Synchronized fun remove(id: String, receivedAt: Long = clock()) {
        val db = writableDatabase; db.beginTransaction()
        try {
            db.rawQuery("SELECT body FROM events WHERE id=?", arrayOf(id)).use { cursor ->
                if (cursor.moveToFirst()) {
                    val event = JSONObject(cursor.getString(0))
                    if (event.optString("kind") == "question_answer") db.execSQL("INSERT OR IGNORE INTO question_receipts VALUES(?,?)", arrayOf(event.getString("questionId"), id))
                }
            }
            db.execSQL("UPDATE evidence SET delivery='sent',received_at=?,error=NULL WHERE event_id=?", arrayOf<Any>(receivedAt, id))
            db.delete("events", "id=?", arrayOf(id)); db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }
    @Synchronized fun questionState(questionId: String): String? {
        readableDatabase.rawQuery("SELECT 1 FROM question_receipts WHERE question_id=?", arrayOf(questionId)).use { if (it.moveToFirst()) return "received" }
        readableDatabase.rawQuery("SELECT body,state FROM events", null).use { cursor ->
            while (cursor.moveToNext()) {
                val event = JSONObject(cursor.getString(0))
                if (event.optString("kind") == "question_answer" && event.optString("questionId") == questionId) return cursor.getString(1)
            }
        }
        return null
    }
    @Synchronized fun containsEvidence(eventId: String): Boolean = readableDatabase.rawQuery("SELECT 1 FROM evidence WHERE event_id=?", arrayOf(eventId)).use { it.moveToFirst() }
    @Synchronized fun fail(id: String, message: String) {
        val db = writableDatabase; db.beginTransaction()
        try {
            db.execSQL("UPDATE events SET state='failed',error=? WHERE id=?", arrayOf(message.take(200), id))
            db.execSQL("UPDATE evidence SET delivery='failed',error=? WHERE event_id=?", arrayOf(message.take(200), id)); db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }
    @Synchronized fun recentEvidence(limit: Int = 60, start: Long = 0, end: Long = Long.MAX_VALUE): List<JSONObject> = buildList {
        readableDatabase.rawQuery("SELECT body,delivery,received_at,error FROM evidence WHERE observed_at>=? AND observed_at<? ORDER BY observed_at DESC,rowid DESC LIMIT ?", arrayOf(start.toString(), end.toString(), limit.coerceIn(1, 200).toString())).use { c -> while (c.moveToNext()) {
            add(JSONObject().put("event", JSONObject(c.getString(0))).put("delivery", c.getString(1)).put("receivedAt", if (c.isNull(2)) JSONObject.NULL else c.getLong(2)).put("error", c.getString(3)))
        } }
    }
    @Synchronized fun evidenceSummary(start: Long, end: Long): JSONObject {
        val result = JSONObject().put("count", 0).put("samples", 0).put("sent", 0)
        readableDatabase.rawQuery("SELECT COUNT(*),SUM(CASE WHEN kind='context' THEN 1 ELSE 0 END),SUM(CASE WHEN delivery='sent' THEN 1 ELSE 0 END),MIN(observed_at),MAX(observed_at) FROM evidence WHERE observed_at>=? AND observed_at<?", arrayOf(start.toString(), end.toString())).use { c -> if (c.moveToFirst()) {
            result.put("count", c.getInt(0)).put("samples", c.getInt(1)).put("sent", c.getInt(2))
                .put("firstAt", if (c.isNull(3)) JSONObject.NULL else c.getLong(3)).put("lastAt", if (c.isNull(4)) JSONObject.NULL else c.getLong(4))
        } }; return result
    }
    @Synchronized fun count(state: String = "pending"): Int = readableDatabase.rawQuery("SELECT count(*) FROM events WHERE state=?", arrayOf(state)).use { it.moveToFirst(); it.getInt(0) }
}

object CareRuntime {
    val executor = Executors.newSingleThreadExecutor()
    private var queue: Outbox? = null
    @Synchronized fun outbox(context: Context): Outbox = queue ?: Outbox(context.applicationContext).also { queue = it }
    fun event(kind: String): JSONObject = JSONObject().put("eventId", UUID.randomUUID().toString()).put("kind", kind).put("observedAt", System.currentTimeMillis())
    private fun send(api: CareApi, outbox: Outbox, id: String, event: JSONObject, context: Context) {
        val receipt = api.call("/api/device/events", event)
        check(receipt.optString("eventId") == id && receipt.optString("status") == "recorded" && receipt.optString("receiptId").isNotEmpty() && receipt.optLong("receivedAt", 0) > 0) { AppLang.t(context, "Hub receipt incomplete; keeping data for resend", "中心回執不完整，資料保留等待重送") }
        outbox.remove(id, receipt.getLong("receivedAt"))
    }
    fun sync(context: Context, collect: Boolean = true): String {
        val app = context.applicationContext
        fun t(en: String, zh: String) = AppLang.t(app, en, zh)
        val config = CareConfig(app); if (!config.ready) return t("Start your own secretary or finish pairing first", "先開始使用自己的秘書，或完成手機配對")
        val outbox = outbox(app); val api = CareApi(config, app)
        if (collect) {
            val snapshot = DeviceContextReader.read(app)
            val e = event("context").put("context", snapshot)
            outbox.add(e)
            config.prefs.edit().putString("last_local_context", snapshot.toString()).putLong("last_local_at", e.getLong("observedAt")).apply()
        }
        if (!config.paired && config.selfMode) config.savePairing(api.call("/api/device/self-enroll", JSONObject().put("displayName", config.personName).put("requestId", config.prefs.getString("self_request", "")), false))
        for ((id, event) in outbox.pending()) {
            try { send(api, outbox, id, event, app) }
            catch (error: ApiFailure) {
                if (error.status in listOf(400, 404, 409, 413, 415)) outbox.fail(id, error.message ?: t("This entry needs a look", "資料需要檢查")) else throw error
            }
        }
        val status = api.call("/api/device/status")
        config.prefs.edit().putString("server_status", status.toString()).putLong("sync_at", System.currentTimeMillis()).apply()
        val reminders = status.getJSONArray("reminders")
        for (i in 0 until reminders.length()) {
            val reminder = reminders.getJSONObject(i); val id = reminder.getString("id")
            val executed = config.prefs.getStringSet("executed_reminders", emptySet())!!.toMutableSet()
            if (id in executed || reminder.getLong("expiresAt") <= System.currentTimeMillis()) continue
            val eventId = "reminder_$id"
            if (outbox.containsEvidence(eventId)) continue
            val shown = CareConnectionService.showReminder(app, status.optJSONObject("question")?.optString("prompt"))
            outbox.add(event("reminder_result").put("eventId", eventId).put("reminderId", id).put("result", if (shown) "executed" else "declined"))
            executed.add(id)
            check(config.prefs.edit().putStringSet("executed_reminders", executed.toList().takeLast(100).toSet()).commit())
        }
        for ((id, event) in outbox.pending()) {
            try { send(api, outbox, id, event, app) }
            catch (error: ApiFailure) { if (error.status in listOf(400, 404, 409)) outbox.fail(id, error.message ?: t("This receipt needs a look", "回條需要檢查")) else throw error }
        }
        return if (outbox.count("failed") > 0) t("Connected; ${outbox.count("failed")} entries need a look", "連線成功；${outbox.count("failed")} 筆資料需要檢查") else t("Synced; the hub has your data", "已同步，中心已收到資料")
    }
}