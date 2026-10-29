package tw.picocare.app

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputFilter
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date

class CareActivity : Activity() {
    private val green = Color.rgb(32, 92, 74)
    private val ink = Color.rgb(49, 68, 57)
    private val muted = Color.rgb(119, 136, 111)
    private val faint = Color.rgb(133, 147, 124)
    private val rust = Color.rgb(166, 77, 45)
    private val paper = Color.rgb(245, 247, 240)
    private val sage = Color.rgb(232, 238, 222)
    private val amber = Color.rgb(176, 124, 32)
    private val pillAmber = Color.rgb(247, 238, 220)
    private val pillBlush = Color.rgb(247, 231, 224)
    private val pillMist = Color.rgb(235, 238, 230)
    private lateinit var root: LinearLayout
    private var people = JSONArray()
    private var alerts = JSONArray()
    private var personId = ""
    private var personName = ""
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun background(color: Int) = GradientDrawable().apply { setColor(color); cornerRadius = dp(18).toFloat() }
    private fun column() = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(24), dp(24), dp(24), dp(24)) }
    private fun label(value: String, size: Float = 16f, color: Int = ink) = TextView(this).apply {
        text = value; textSize = size; setTextColor(color); setPadding(0, dp(9), 0, dp(9)); setLineSpacing(dp(4).toFloat(), 1f)
    }
    private fun button(value: String, primary: Boolean = false, work: () -> Unit) = Button(this).apply {
        text = value; textSize = 18f; isAllCaps = false
        setTextColor(if (primary) Color.WHITE else green)
        background = background(if (primary) green else sage)
        minimumHeight = dp(64); setPadding(dp(14), dp(14), dp(14), dp(14))
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(13) }
        setOnClickListener { work() }
    }
    private fun card() = column().apply { background = background(Color.WHITE); setPadding(dp(18), dp(14), dp(18), dp(14)) }
    private fun cardParams(top: Int = 16) = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(top) }
    private fun sectionTitle(value: String) = label(value, 19f).apply { setTypeface(null, Typeface.BOLD); setPadding(0, dp(4), 0, dp(8)) }
    private fun time(at: Long) = if (at <= 0) "" else DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(at))
    private fun badgeRow(p: JSONObject) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        for ((text, tone) in CareView.personBadges(p)) {
            val (fg, bg) = when (tone) { "ok" -> green to sage; "warn" -> amber to pillAmber; "bad" -> rust to pillBlush; else -> muted to pillMist }
            addView(UiBits.pill(this@CareActivity, text, fg, bg))
        }
    }
    private fun toast(message: String) { Toast.makeText(this, message, Toast.LENGTH_LONG).show() }
    private fun work(job: () -> Unit) { CareRuntime.executor.execute { try { job() } catch (error: Exception) { runOnUiThread { if (!isFinishing) toast(error.message ?: "連線失敗") } } } }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(paper) }
        setContentView(ScrollView(this).apply { addView(root) })
        if (CareSession(this).ready) showPeople() else showSetup()
    }
    private fun showSetup() {
        root.removeAllViews()
        val session = CareSession(this)
        root.addView(label("PicoCare 照顧者", 15f, green).apply { setTypeface(null, Typeface.BOLD) })
        root.addView(label("關心的人", 28f).apply { setTypeface(null, Typeface.BOLD) })
        root.addView(label("連上服務，建立照顧空間，看看被照顧者的近況。", 14f, muted))
        val endpoint = EditText(this).apply { hint = "服務網址"; setText(session.endpoint); inputType = 17 }
        root.addView(endpoint)
        val name = EditText(this).apply { hint = "你的稱呼"; isSingleLine = true; filters = arrayOf(InputFilter.LengthFilter(40)) }
        root.addView(name)
        root.addView(button("建立並加入示範", true) { work {
            session.endpoint = endpoint.text.toString()
            val api = CareWebApi(session)
            api.createWorkspace("我的照顧空間", name.text.toString().ifBlank { "家人" })
            val demo = api.post("/api/demo")
            runOnUiThread { if (!isFinishing) { toast(if (demo.optBoolean("created", true)) "示範空間已就緒" else "已連上既有空間"); showPeople() } }
        } })
        root.addView(label("示範資料只供展示三位虛擬長輩，不影響真實手機。", 12f, faint))
    }
    private fun showPeople() {
        root.removeAllViews()
        val session = CareSession(this)
        root.addView(label(session.workspaceLabel.ifBlank { "我的照顧空間" }, 15f, green).apply { setTypeface(null, Typeface.BOLD) })
        root.addView(label("關心的人", 28f).apply { setTypeface(null, Typeface.BOLD) })
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(box)
        root.addView(button("重新整理") { showPeople() })
        work {
            val api = CareWebApi(session)
            val list = api.get("/api/people")
            people = list.optJSONArray("people") ?: JSONArray()
            alerts = api.get("/api/alerts").optJSONArray("alerts") ?: JSONArray()
            runOnUiThread { if (isFinishing) return@runOnUiThread
                box.removeAllViews()
                if (alerts.length() > 0) {
                    val card = card(); card.addView(sectionTitle("需要處理（${alerts.length()}）"))
                    for (i in 0 until alerts.length()) {
                        val a = alerts.getJSONObject(i)
                        val read = !a.isNull("readAt")
                        card.addView(label("${CareView.alertTitle(a)} · ${a.optString("personName")} ${time(a.optLong("createdAt"))}${if (read) " · 已讀" else ""}", 15f, if (read) muted else rust))
                    }
                    box.addView(card, cardParams())
                }
                for (i in 0 until people.length()) {
                    val p = people.getJSONObject(i)
                    val card = card()
                    val head = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                    head.addView(UiBits.avatar(this, p.optString("name"), green, sage))
                    head.addView(label(p.optString("name"), 19f).apply { setTypeface(null, Typeface.BOLD) })
                    card.addView(head)
                    card.addView(badgeRow(p))
                    card.addView(label(p.optJSONObject("assessment")?.optString("title") ?: "", 15f))
                    card.addView(button("查看") { personId = p.optString("id"); personName = p.optString("name"); showDetail() })
                    box.addView(card, cardParams())
                }
                if (people.length() == 0) box.addView(label("還沒有被照顧者。", 15f, muted))
            }
        }
    }
    private fun showDetail() {
        root.removeAllViews()
        val session = CareSession(this)
        root.addView(label(personName, 15f, green).apply { setTypeface(null, Typeface.BOLD) })
        root.addView(label("近況", 28f).apply { setTypeface(null, Typeface.BOLD) })
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(box)
        root.addView(button("回上一頁") { showPeople() })
        work {
            val api = CareWebApi(session)
            val detail = api.get("/api/people/$personId")
            val person = detail.getJSONObject("person")
            runOnUiThread { if (isFinishing) return@runOnUiThread
                box.removeAllViews()
                box.addView(badgeRow(person))
                val assess = person.optJSONObject("assessment")
                if (assess != null) {
                    val card = card(); card.addView(sectionTitle("秘書摘要"))
                    card.addView(label(assess.optString("title"), 16f).apply { setTypeface(null, Typeface.BOLD) })
                    assess.optString("explanation").takeIf { it.isNotBlank() }?.let { card.addView(label(it, 14f)) }
                    box.addView(card, cardParams())
                }
                person.optJSONObject("secretary")?.optJSONObject("weekly")?.takeIf { it.optString("text").isNotBlank() }?.let { w ->
                    val card = card(); card.addView(sectionTitle("本週回顧"))
                    card.addView(label(w.optString("text"), 14f))
                    card.addView(label("${time(w.optLong("at"))} · ${if (w.optString("model").contains("open")) "開源模型整理" else "Meta 整理"}", 12f, faint))
                    box.addView(card, cardParams())
                }
                val questions = detail.optJSONArray("questions") ?: JSONArray()
                if (questions.length() > 0) {
                    val card = card(); card.addView(sectionTitle("問答"))
                    for (i in 0 until minOf(questions.length(), 5)) card.addView(label(CareView.questionLine(questions.getJSONObject(i)), 14f))
                    box.addView(card, cardParams())
                }
                val timeline = detail.optJSONArray("timeline") ?: JSONArray()
                if (timeline.length() > 0) {
                    val card = card(); card.addView(sectionTitle("近況時間線"))
                    for (i in 0 until minOf(timeline.length(), 8)) {
                        val e = timeline.getJSONObject(i)
                        card.addView(label("${UiBits.timelineLabel(e.optString("kind"))} · ${time(e.optLong("observedAt"))}", 14f))
                    }
                    box.addView(card, cardParams())
                }
                val mine = JSONArray()
                for (i in 0 until alerts.length()) { val a = alerts.getJSONObject(i); if (a.optString("personId") == personId) mine.put(a) }
                if (mine.length() > 0) {
                    val card = card(); card.addView(sectionTitle("提醒"))
                    for (i in 0 until mine.length()) {
                        val a = mine.getJSONObject(i)
                        card.addView(label("${CareView.alertTitle(a)} ${time(a.optLong("createdAt"))}", 15f, rust))
                        val ev = a.optJSONArray("evidence")
                        if (ev != null) for (j in 0 until minOf(ev.length(), 3)) card.addView(label("• ${ev.optString(j).take(80)}", 13f, muted))
                        if (a.isNull("readAt")) card.addView(button("標記已讀") { work { api.post("/api/alerts/${a.optString("id")}/read", JSONObject()); runOnUiThread { showDetail() } } })
                    }
                    box.addView(card, cardParams())
                }
                if (person.optBoolean("helpOpen")) box.addView(button("求助已處理", true) { work {
                    api.post("/api/people/$personId/contacts", JSONObject().put("outcome", "help_resolved").put("revision", person.optInt("revision")).put("helpEventId", person.optString("helpEventId")).put("note", "已聯絡處理"))
                    runOnUiThread { toast("已記錄處理結果"); showPeople() }
                } })
                box.addView(button("回填：已聯絡") { contactDialog(api, personId) })
            }
        }
    }
    private fun contactDialog(api: CareWebApi, id: String) {
        val note = EditText(this).apply { hint = "備註（可空）"; isSingleLine = true; filters = arrayOf(InputFilter.LengthFilter(300)) }
        AlertDialog.Builder(this).setTitle("回填聯絡結果").setView(note)
            .setNegativeButton("取消", null)
            .setPositiveButton("已聯絡") { _, _ -> work {
                api.post("/api/people/$id/contacts", JSONObject().put("outcome", "contacted").put("note", note.text.toString()))
                runOnUiThread { toast("已記錄"); showDetail() }
            } }
            .setNeutralButton("沒接電話") { _, _ -> work {
                api.post("/api/people/$id/contacts", JSONObject().put("outcome", "no_answer").put("note", note.text.toString()))
                runOnUiThread { toast("已記錄"); showDetail() }
            } }.show()
    }
}
