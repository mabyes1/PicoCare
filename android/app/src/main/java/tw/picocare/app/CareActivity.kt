package tw.picocare.app

import android.app.Activity
import android.app.AlertDialog
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.text.InputFilter
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsetsController
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
    private val green = UiBits.green
    private val ink = UiBits.ink
    private val body = UiBits.body
    private val muted = UiBits.muted
    private val faint = UiBits.faint
    private val rust = UiBits.rust
    private val paper = UiBits.paper
    private val sage = UiBits.sage
    private val amber = UiBits.amber
    private val pillAmber = UiBits.pillAmber
    private val pillBlush = UiBits.pillBlush
    private val pillMist = UiBits.pillMist
    private lateinit var root: LinearLayout
    private var people = JSONArray()
    private var alerts = JSONArray()
    private var personId = ""
    private var personName = ""

    private fun dp(value: Int) = UiBits.dp(this, value)
    private fun label(value: String, size: Float = 15.5f, color: Int = ink, padTopDp: Int = 3, padBottomDp: Int = 3) = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(color)
        setPadding(0, dp(padTopDp), 0, dp(padBottomDp))
        setLineSpacing(dp(4).toFloat(), 1f)
    }
    private fun button(value: String, primary: Boolean = false, topMarginDp: Int = 10, work: () -> Unit) = Button(this).apply {
        text = value
        UiBits.styleButton(this, primary = primary, tonal = !primary, compact = false)
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(topMarginDp) }
        setOnClickListener { work() }
    }
    private fun compactButton(value: String, topMarginDp: Int = 8, work: () -> Unit) = Button(this).apply {
        text = value
        UiBits.styleButton(this, primary = false, tonal = false, compact = true)
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(topMarginDp) }
        setOnClickListener { work() }
    }
    private fun card() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = UiBits.rounded(this@CareActivity, UiBits.surface, 18, UiBits.cardBorder)
        setPadding(dp(18), dp(16), dp(18), dp(16))
    }
    private fun subBox() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = UiBits.rounded(this@CareActivity, UiBits.surfaceSubtle, 12, UiBits.cardBorder)
        setPadding(dp(14), dp(10), dp(14), dp(10))
    }
    private fun cardParams(top: Int = 14) = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(top) }
    private fun sectionTitle(value: String) = label(value, 18f, ink, 0, 6).apply { setTypeface(null, Typeface.BOLD) }
    private fun time(at: Long) = if (at <= 0) "" else DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(at))

    private fun badgeRow(p: JSONObject): ViewGroup = UiBits.pillContainer(this).apply {
        for ((text, tone) in CareView.personBadges(p)) {
            val (fg, bg) = when (tone) {
                "ok" -> green to sage
                "warn" -> amber to pillAmber
                "bad" -> rust to pillBlush
                else -> muted to pillMist
            }
            addView(UiBits.pill(this@CareActivity, text, fg, bg))
        }
    }

    private fun toast(message: String) { Toast.makeText(this, message, Toast.LENGTH_LONG).show() }
    private fun work(job: () -> Unit) {
        CareRuntime.executor.execute {
            try { job() } catch (error: Exception) { runOnUiThread { if (!isFinishing) toast(error.message ?: "連線失敗") } }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(paper)
        }
        UiBits.applyWindowInsets(root, 18, 16, 18, 24)
        // Android 15+ enforces edge-to-edge: keep content inside the system bars.
        window.setBackgroundDrawable(ColorDrawable(paper))
        setContentView(ScrollView(this).apply {
            isFillViewport = true
            setBackgroundColor(paper)
            addView(root)
        })
        if (Build.VERSION.SDK_INT >= 30) {
            window.decorView.windowInsetsController?.setSystemBarsAppearance(
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            )
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        }
        if (CareSession(this).ready) showPeople() else showSetup()
    }

    private fun showSetup() {
        root.removeAllViews()
        val session = CareSession(this)
        root.addView(label("PicoCare 照顧者", 13.5f, green, 2, 1).apply { setTypeface(null, Typeface.BOLD) })
        root.addView(label("關心的人", 26f, ink, 0, 2).apply { setTypeface(null, Typeface.BOLD) })
        root.addView(label("連上服務，建立照顧空間，看看被照顧者的近況。", 14f, muted, 0, 8))

        val setupCard = card()
        setupCard.addView(sectionTitle("建立照顧空間"))
        val endpoint = EditText(this).apply {
            hint = "服務網址"
            setText(session.endpoint)
            inputType = 17
            UiBits.styleInput(this, 6)
        }
        setupCard.addView(endpoint)
        val name = EditText(this).apply {
            hint = "你的稱呼"
            isSingleLine = true
            filters = arrayOf(InputFilter.LengthFilter(40))
            UiBits.styleInput(this, 10)
        }
        setupCard.addView(name)
        setupCard.addView(button("建立並加入示範", primary = true, topMarginDp = 14) {
            work {
                session.endpoint = endpoint.text.toString()
                val api = CareWebApi(session)
                api.createWorkspace("我的照顧空間", name.text.toString().ifBlank { "家人" })
                val demo = api.post("/api/demo")
                runOnUiThread {
                    if (!isFinishing) {
                        toast(if (demo.optBoolean("created", true)) "示範空間已就緒" else "已連上既有空間")
                        showPeople()
                    }
                }
            }
        })
        root.addView(setupCard, cardParams(8))
        root.addView(label("示範資料只供展示三位虛擬長輩，不影響真實手機。", 12.5f, faint, 10, 4))
    }

    private fun showPeople() {
        root.removeAllViews()
        val session = CareSession(this)
        root.addView(label(session.workspaceLabel.ifBlank { "我的照顧空間" }, 13.5f, green, 2, 1).apply { setTypeface(null, Typeface.BOLD) })
        root.addView(label("關心的人", 26f, ink, 0, 6).apply { setTypeface(null, Typeface.BOLD) })
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(box)
        root.addView(compactButton("重新整理", topMarginDp = 14) { showPeople() })
        work {
            val api = CareWebApi(session)
            val list = api.get("/api/people")
            people = list.optJSONArray("people") ?: JSONArray()
            alerts = api.get("/api/alerts").optJSONArray("alerts") ?: JSONArray()
            runOnUiThread {
                if (isFinishing) return@runOnUiThread
                box.removeAllViews()
                if (alerts.length() > 0) {
                    val card = card()
                    card.addView(sectionTitle("需要處理（${alerts.length()}）"))
                    for (i in 0 until alerts.length()) {
                        val a = alerts.getJSONObject(i)
                        val read = !a.isNull("readAt")
                        val item = subBox().apply {
                            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(if (i == 0) 2 else 8) }
                        }
                        item.addView(label(
                            "${CareView.alertTitle(a)} · ${a.optString("personName")} ${time(a.optLong("createdAt"))}${if (read) " · 已讀" else ""}",
                            14.5f,
                            if (read) muted else rust,
                            1,
                            1
                        ).apply { if (!read) setTypeface(null, Typeface.BOLD) })
                        card.addView(item)
                    }
                    box.addView(card, cardParams(8))
                }
                for (i in 0 until people.length()) {
                    val p = people.getJSONObject(i)
                    val card = card()
                    val head = LinearLayout(this).apply {
                        orientation = LinearLayout.HORIZONTAL
                        gravity = Gravity.CENTER_VERTICAL
                        setPadding(0, 0, 0, dp(4))
                    }
                    head.addView(UiBits.avatar(this, p.optString("name"), green, sage))
                    head.addView(label(p.optString("name"), 19f, ink, 0, 0).apply { setTypeface(null, Typeface.BOLD) })
                    card.addView(head)
                    card.addView(badgeRow(p))
                    p.optJSONObject("assessment")?.optString("title")?.takeIf { it.isNotBlank() }?.let {
                        card.addView(label(it, 15f, body, 6, 2))
                    }
                    card.addView(button("查看", primary = false, topMarginDp = 10) {
                        personId = p.optString("id")
                        personName = p.optString("name")
                        showDetail()
                    })
                    box.addView(card, cardParams())
                }
                if (people.length() == 0) {
                    val emptyCard = card()
                    emptyCard.addView(label("還沒有被照顧者。", 15f, muted, 2, 2))
                    box.addView(emptyCard, cardParams())
                }
            }
        }
    }

    private fun showDetail() {
        root.removeAllViews()
        val session = CareSession(this)
        root.addView(label(personName, 13.5f, green, 2, 1).apply { setTypeface(null, Typeface.BOLD) })
        root.addView(label("近況", 26f, ink, 0, 6).apply { setTypeface(null, Typeface.BOLD) })
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        root.addView(box)
        root.addView(compactButton("回上一頁", topMarginDp = 12) { showPeople() })
        work {
            val api = CareWebApi(session)
            val detail = api.get("/api/people/$personId")
            val person = detail.getJSONObject("person")
            runOnUiThread {
                if (isFinishing) return@runOnUiThread
                box.removeAllViews()
                box.addView(badgeRow(person))
                val assess = person.optJSONObject("assessment")
                if (assess != null) {
                    val card = card()
                    card.addView(sectionTitle("秘書摘要"))
                    card.addView(label(assess.optString("title"), 16.5f, ink, 2, 4).apply { setTypeface(null, Typeface.BOLD) })
                    assess.optString("explanation").takeIf { it.isNotBlank() }?.let { card.addView(label(it, 14.5f, body, 2, 2)) }
                    box.addView(card, cardParams(10))
                }
                person.optJSONObject("secretary")?.optJSONObject("weekly")?.takeIf { it.optString("text").isNotBlank() }?.let { w ->
                    val card = card()
                    card.addView(sectionTitle("本週回顧"))
                    card.addView(label(w.optString("text"), 14.5f, body, 2, 4))
                    card.addView(label("${time(w.optLong("at"))} · ${if (w.optString("model").contains("open")) "開源模型整理" else "Meta 整理"}", 12.5f, faint, 2, 0))
                    box.addView(card, cardParams())
                }
                val questions = detail.optJSONArray("questions") ?: JSONArray()
                if (questions.length() > 0) {
                    val card = card()
                    card.addView(sectionTitle("問答"))
                    for (i in 0 until minOf(questions.length(), 5)) {
                        card.addView(label(CareView.questionLine(questions.getJSONObject(i)), 14f, body, 3, 3))
                    }
                    box.addView(card, cardParams())
                }
                val timeline = detail.optJSONArray("timeline") ?: JSONArray()
                if (timeline.length() > 0) {
                    val card = card()
                    card.addView(sectionTitle("近況時間線"))
                    for (i in 0 until minOf(timeline.length(), 8)) {
                        val e = timeline.getJSONObject(i)
                        card.addView(label("${UiBits.timelineLabel(e.optString("kind"))} · ${time(e.optLong("observedAt"))}", 14f, body, 3, 3))
                    }
                    box.addView(card, cardParams())
                }
                val mine = JSONArray()
                for (i in 0 until alerts.length()) { val a = alerts.getJSONObject(i); if (a.optString("personId") == personId) mine.put(a) }
                if (mine.length() > 0) {
                    val card = card()
                    card.addView(sectionTitle("提醒"))
                    for (i in 0 until mine.length()) {
                        val a = mine.getJSONObject(i)
                        val alertBox = subBox().apply {
                            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(if (i == 0) 2 else 10) }
                        }
                        alertBox.addView(label("${CareView.alertTitle(a)} ${time(a.optLong("createdAt"))}", 15f, rust, 0, 2).apply { setTypeface(null, Typeface.BOLD) })
                        val ev = a.optJSONArray("evidence")
                        if (ev != null) for (j in 0 until minOf(ev.length(), 3)) alertBox.addView(label("• ${ev.optString(j).take(80)}", 13f, muted, 1, 1))
                        if (a.isNull("readAt")) {
                            alertBox.addView(compactButton("標記已讀", topMarginDp = 8) {
                                work { api.post("/api/alerts/${a.optString("id")}/read", JSONObject()); runOnUiThread { showDetail() } }
                            })
                        }
                        card.addView(alertBox)
                    }
                    box.addView(card, cardParams())
                }
                if (person.optBoolean("helpOpen")) {
                    box.addView(button("求助已處理", primary = true, topMarginDp = 14) {
                        work {
                            api.post("/api/people/$personId/contacts", JSONObject().put("outcome", "help_resolved").put("revision", person.optInt("revision")).put("helpEventId", person.optString("helpEventId")).put("note", "已聯絡處理"))
                            runOnUiThread { toast("已記錄處理結果"); showPeople() }
                        }
                    })
                }
                box.addView(button("回填：已聯絡", primary = false, topMarginDp = 10) { contactDialog(api, personId) })
            }
        }
    }

    private fun contactDialog(api: CareWebApi, id: String) {
        val form = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22), dp(12), dp(22), dp(8))
        }
        val note = EditText(this).apply {
            hint = "備註（可空）"
            isSingleLine = true
            filters = arrayOf(InputFilter.LengthFilter(300))
            UiBits.styleInput(this, 4)
        }
        form.addView(note)
        AlertDialog.Builder(this).setTitle("回填聯絡結果").setView(form)
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
