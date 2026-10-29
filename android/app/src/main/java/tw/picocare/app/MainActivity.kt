package tw.picocare.app

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.DatePickerDialog
import android.app.NotificationManager
import android.content.Intent
import android.content.ComponentName
import android.content.ActivityNotFoundException
import android.net.Uri
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputFilter
import android.view.View
import android.view.WindowInsetsController
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date
import java.util.UUID
import java.util.Calendar

class MainActivity : Activity() {
    private val green = Color.rgb(32, 92, 74)
    private val ink = Color.rgb(49, 68, 57)
    private val muted = Color.rgb(119, 136, 111)
    private val faint = Color.rgb(133, 147, 124)
    private val rust = Color.rgb(166, 77, 45)
    private val paper = Color.rgb(245, 247, 240)
    private val warm = Color.rgb(255, 250, 235)
    private val sage = Color.rgb(232, 238, 222)
    private val amber = Color.rgb(176, 124, 32)
    private val pillAmber = Color.rgb(247, 238, 220)
    private val pillBlush = Color.rgb(247, 231, 224)
    private val pillMist = Color.rgb(235, 238, 230)
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var statusLines: LinearLayout
    private lateinit var statusDebugLines: LinearLayout
    private lateinit var thinkingTitle: TextView
    private lateinit var thinkingReason: TextView
    private lateinit var thinkingTime: TextView
    private lateinit var weeklyText: TextView
    private lateinit var weeklyTime: TextView
    private lateinit var weeklyPills: LinearLayout
    private lateinit var wallBox: LinearLayout
    private lateinit var debugInsightCard: LinearLayout
    private lateinit var syncButton: Button
    private lateinit var endpointButton: Button
    private lateinit var debugSwitch: Switch
    private lateinit var connectionButton: Button
    private lateinit var header: TextView
    private lateinit var questionPanel: LinearLayout
    private lateinit var observationText: TextView
    private lateinit var interpretationText: TextView
    private lateinit var metaPreviewText: TextView
    private lateinit var startButton: Button
    private lateinit var permissionText: TextView
    private lateinit var usagePermissionButton: Button
    private lateinit var listenerPermissionButton: Button
    private lateinit var locationPermissionButton: Button
    private lateinit var notificationPermissionButton: Button
    private var questionSignature = ""
    private lateinit var tabPages: List<View>
    private lateinit var tabButtons: List<Button>
    private var selectedTab = 0
    private val ticker = object : Runnable { override fun run() { refresh(); handler.postDelayed(this, 5000) } }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private fun background(color: Int) = GradientDrawable().apply { setColor(color); cornerRadius = dp(18).toFloat() }
    private fun column() = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(24), dp(24), dp(24), dp(24)) }
    private fun label(value: String, size: Float = 16f, color: Int = Color.rgb(49, 68, 57)) = TextView(this).apply {
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
    private fun compactButton(value: String, work: () -> Unit) = Button(this).apply {
        text = value; textSize = 16f; isAllCaps = false
        setTextColor(green)
        background = background(sage)
        minimumHeight = dp(52); setPadding(dp(14), dp(10), dp(14), dp(10))
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) }
        setOnClickListener { work() }
    }
    private fun buttonRow(first: Button, second: Button) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(13) }
        for ((child, left, right) in listOf(Triple(first, 0, 6), Triple(second, 6, 0))) {
            child.layoutParams = LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(left); rightMargin = dp(right) }
            addView(child)
        }
    }
    private fun tabButton(value: String, index: Int) = Button(this).apply {
        text = value; textSize = 17f; isAllCaps = false
        minimumHeight = dp(56)
        layoutParams = LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(4); rightMargin = dp(4) }
        setOnClickListener { showTab(index) }
    }
    private fun showTab(index: Int) {
        selectedTab = index
        for ((i, page) in tabPages.withIndex()) page.visibility = if (i == index) View.VISIBLE else View.GONE
        for ((i, button) in tabButtons.withIndex()) {
            val selected = i == index
            button.setTextColor(if (selected) green else muted)
            button.setTypeface(null, if (selected) Typeface.BOLD else Typeface.NORMAL)
            button.background = background(if (selected) sage else Color.WHITE)
        }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (BuildConfig.FLAVOR == "care") { startActivity(Intent(this, CareActivity::class.java)); finish(); return }
        val home = column().apply { setBackgroundColor(paper) }
        home.addView(label("PicoCare", 15f, green).apply { setTypeface(null, Typeface.BOLD) })
        header = label("我的照護秘書", 28f).apply { setTypeface(null, Typeface.BOLD) }; home.addView(header)
        home.addView(label("報安、回答問題、看近況都在這裡。", 14f, muted))
        startButton = button("開始使用我的秘書", true) { beginSelf() }; home.addView(startButton)
        questionPanel = column().apply { background = background(warm); setPadding(dp(18), dp(14), dp(18), dp(14)); visibility = View.GONE }
        home.addView(questionPanel, cardParams())
        home.addView(buttonRow(
            button("我很好", true) { send("checkin") },
            button("我需要協助") { AlertDialog.Builder(this).setTitle("記錄需要協助？").setMessage(if (CareConfig(this).selfMode) "本人實測尚未配對照顧者，會記錄這次需求；目前沒有照顧者可接收。" else "會通知你已配對的照顧空間，請人員聯絡你。").setNegativeButton("取消", null).setPositiveButton("記錄需求") { _, _ -> send("help") }.show() }
        ))
        val statusCard = card(); statusCard.addView(sectionTitle("近況"))
        statusLines = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        statusDebugLines = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        statusCard.addView(statusLines); statusCard.addView(statusDebugLines); home.addView(statusCard, cardParams())
        connectionButton = button("開始連線") { toggleConnection() }
        syncButton = button("立即同步") { runWork { CareRuntime.sync(this) } }
        home.addView(buttonRow(connectionButton, syncButton))
        val insight = column().apply { setBackgroundColor(paper) }
        insight.addView(label("秘書的想法", 28f).apply { setTypeface(null, Typeface.BOLD) })
        insight.addView(label("秘書看到了什麼、怎麼理解你。", 14f, muted))
        val thinkingCard = card(); thinkingCard.addView(sectionTitle("PicoCare 的關懷思考"))
        thinkingTitle = label("", 17f).apply { setTypeface(null, Typeface.BOLD) }; thinkingCard.addView(thinkingTitle)
        thinkingReason = label("", 15f); thinkingCard.addView(thinkingReason)
        thinkingTime = label("", 13f, muted); thinkingCard.addView(thinkingTime)
        insight.addView(thinkingCard, cardParams())
        val weeklyCard = card(); weeklyCard.addView(sectionTitle("本週回顧"))
        weeklyText = label("", 15f); weeklyCard.addView(weeklyText)
        weeklyPills = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }; weeklyCard.addView(weeklyPills)
        weeklyTime = label("", 13f, muted); weeklyCard.addView(weeklyTime)
        insight.addView(weeklyCard, cardParams())
        insight.addView(sectionTitle("秘書動態"))
        wallBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        insight.addView(wallBox)
        debugInsightCard = card(); debugInsightCard.addView(sectionTitle("詳細資訊（DEBUG）"))
        debugInsightCard.addView(label("詳細判讀", 15f, muted).apply { setTypeface(null, Typeface.BOLD) })
        interpretationText = label("", 14f); debugInsightCard.addView(interpretationText)
        debugInsightCard.addView(label("觀測原文", 15f, muted).apply { setTypeface(null, Typeface.BOLD) })
        observationText = label("", 14f); debugInsightCard.addView(observationText)
        // Field-test view: retain the latest model result when live context changes.
        debugInsightCard.addView(label("Meta 原始", 15f, muted).apply { setTypeface(null, Typeface.BOLD) })
        metaPreviewText = label("還沒有 Meta 判斷。", 14f); debugInsightCard.addView(metaPreviewText)
        insight.addView(debugInsightCard, cardParams())
        val settings = column().apply { setBackgroundColor(paper) }
        settings.addView(label("設定", 28f).apply { setTypeface(null, Typeface.BOLD) })
        settings.addView(label("權限、連線跟工具都在這裡。", 14f, muted))
        val permissionPanel = card()
        permissionPanel.addView(sectionTitle("手機資料與權限"))
        permissionText = label("", 15f); permissionPanel.addView(permissionText)
        usagePermissionButton = button("開啟 App 使用權限", true) { openUsageAccess() }; permissionPanel.addView(usagePermissionButton)
        listenerPermissionButton = button("開啟通知存取") { openNotificationAccess() }; permissionPanel.addView(listenerPermissionButton)
        locationPermissionButton = button("設定定位權限") { openAppDetails() }; permissionPanel.addView(locationPermissionButton)
        notificationPermissionButton = button("允許顯示提醒") { openSettings(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName), Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) }; permissionPanel.addView(notificationPermissionButton)
        permissionPanel.addView(button("選擇資料來源") { sources() })
        settings.addView(permissionPanel, cardParams())
        val settingsCard = card(); settingsCard.addView(sectionTitle("設定與工具"))
        endpointButton = compactButton("服務連線設定") { serviceEndpoint() }
        settingsCard.addView(endpointButton)
        settingsCard.addView(compactButton("手機配對") { pairing() })
        settingsCard.addView(compactButton("資料來源與分享") { sources() })
        settingsCard.addView(compactButton("本機證據時間線") { timeline() })
        settingsCard.addView(compactButton("開啟每日關心") { ownPlan() })
        settings.addView(settingsCard, cardParams())
        val debugCard = card(); debugCard.addView(sectionTitle("開發者選項"))
        debugSwitch = Switch(this).apply {
            text = "DEBUG MODE"; textSize = 16f; setTextColor(ink); setPadding(0, dp(4), 0, dp(4))
            setOnCheckedChangeListener { _, checked -> CareConfig(this@MainActivity).debugMode = checked; refresh() }
        }
        debugCard.addView(debugSwitch)
        debugCard.addView(label("開啟後顯示詳細同步與判讀資訊。", 13f, muted))
        settings.addView(debugCard, cardParams())
        settings.addView(label("情境猜測的來源與 Meta 連線狀態會顯示在判讀內容中。", 12f, faint))
        settings.addView(label("PicoCare 實測 ${BuildConfig.VERSION_NAME} / ${BuildConfig.VERSION_CODE}", 12f, faint))
        val pages = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(-1, 0, 1f)
        }
        tabPages = listOf(home, insight, settings).map { page ->
            ScrollView(this).apply { addView(page); pages.addView(this, LinearLayout.LayoutParams(-1, -1)) }
        }
        tabButtons = listOf("首頁" to 0, "判讀" to 1, "設定" to 2).map { (name, index) -> tabButton(name, index) }
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; setBackgroundColor(Color.WHITE)
            setPadding(dp(8), dp(8), dp(8), dp(8))
            for (button in tabButtons) addView(button)
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setBackgroundColor(paper)
            addView(pages)
            addView(View(this@MainActivity).apply { setBackgroundColor(Color.rgb(226, 232, 216)); layoutParams = LinearLayout.LayoutParams(-1, dp(1)) })
            addView(bar)
        }
        setContentView(root)
        showTab(0)
        // PhoneWindow needs its decor view before exposing the insets controller.
        if (Build.VERSION.SDK_INT >= 30) window.decorView.windowInsetsController?.setSystemBarsAppearance(WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS, WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS)
        else legacyStatusBar()
        CareConnectionService.channels(this)
    }
    override fun onResume() {
        super.onResume(); handler.post(ticker)
        val config = CareConfig(this)
        if (config.ready) {
            // A package update or returning from Settings can recreate the process.
            // Preserve the user's existing request for ongoing collection.
            if (config.prefs.getBoolean("connected", false) && (Build.VERSION.SDK_INT < 33 || hasPermission(Manifest.permission.POST_NOTIFICATIONS))) {
                try { startForegroundService(Intent(this, CareConnectionService::class.java)) }
                catch (error: RuntimeException) { config.prefs.edit().putString("connection_message", "持續連線需要重新啟動：${error.message}").apply() }
            }
            runWork { CareRuntime.sync(this) }
        }
    }
    override fun onPause() { handler.removeCallbacks(ticker); super.onPause() }
    private fun toast(message: String) { Toast.makeText(this, message, Toast.LENGTH_LONG).show() }
    private fun refresh() {
        val config = CareConfig(this)
        val last = config.prefs.getLong("sync_at", 0)
        val server = runCatching { JSONObject(config.prefs.getString("server_status", "{}")!!) }.getOrDefault(JSONObject())
        startButton.visibility = if (config.ready) View.GONE else View.VISIBLE
        val debug = config.debugMode
        syncButton.visibility = if (debug) View.VISIBLE else View.GONE
        endpointButton.visibility = if (debug) View.VISIBLE else View.GONE
        debugInsightCard.visibility = if (debug) View.VISIBLE else View.GONE
        statusDebugLines.visibility = if (debug) View.VISIBLE else View.GONE
        if (debugSwitch.isChecked != debug) debugSwitch.isChecked = debug
        renderStatus(config, server, last)
        connectionButton.text = if (CareConnectionService.running) "停止連線" else "開始連線"
        refreshPermissions(config)
        renderQuestion(server.optJSONObject("question"))
        observationText.text = SelfInsight.observations(runCatching { JSONObject(config.prefs.getString("last_local_context", "")!!) }.getOrNull(), config.prefs.getLong("last_local_at", 0))
        val estimatedNow = if (last > 0) server.optLong("serverAt", System.currentTimeMillis()) + (System.currentTimeMillis() - last).coerceAtLeast(0) else System.currentTimeMillis()
        metaPreviewText.text = SelfInsight.metaPreview(server, estimatedNow)
        interpretationText.text = SelfInsight.interpretation(server, estimatedNow)
        val thinking = SelfInsight.thinking(server, estimatedNow)
        thinkingTitle.text = thinking.title
        thinkingReason.text = thinking.reason
        thinkingTime.text = if (thinking.observedAt > 0) "${relativeTime(thinking.observedAt)}的想法" else ""
        val weekly = SelfInsight.weekly(server)
        weeklyText.text = weekly?.text ?: "動態再多一點，Meta 會幫你寫一段給家人的本週回顧。"
        weeklyPills.removeAllViews()
        if (weekly != null) weeklyPills.addView(UiBits.pill(this, if (weekly.model.contains("open")) "開源模型整理" else "Meta 整理", green, sage))
        weeklyTime.text = if (weekly == null || weekly.at <= 0) "" else relativeTime(weekly.at)
        renderWall(server)
    }
    private fun renderWall(server: JSONObject) {
        wallBox.removeAllViews()
        val items = SelfInsight.notes(server)
        if (items.isEmpty()) { wallBox.addView(label("還沒有動態。秘書有發現會寫在這裡。", 14f, muted)); return }
        for (n in items) {
            val post = card()
            post.addView(label(n.title, 16f).apply { setTypeface(null, Typeface.BOLD) })
            if (n.body.isNotBlank()) post.addView(label(n.body, 14f))
            for (e in n.evidence) post.addView(label(e, 13f, muted))
            val meta = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            meta.addView(UiBits.pill(this, relativeTime(n.at), muted, pillMist))
            meta.addView(UiBits.pill(this, if (n.source == "meta") "Meta 融合" else "本地整理", green, sage))
            post.addView(meta)
            wallBox.addView(post, cardParams(10))
        }
    }
    private fun renderStatus(config: CareConfig, server: JSONObject, last: Long) {
        statusLines.removeAllViews()
        if (!config.ready) { statusLines.addView(label("先開始使用自己的秘書；也可以輸入照顧者的配對碼。", 15f)); return }
        val reported = server.optString("checkin") == "reported"
        val hasCaregiver = server.optBoolean("caregiverConnected", !config.selfMode)
        statusLines.addView(label(if (reported) "已收到本人報安" else "等候報安", 21f, if (reported) green else ink).apply { setTypeface(null, Typeface.BOLD) })
        val pills = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        pills.addView(UiBits.pill(this, if (reported) "已報安" else "等候報安", if (reported) green else amber, if (reported) sage else pillAmber))
        if (server.optBoolean("helpOpen")) pills.addView(UiBits.pill(this, "已求助", rust, pillBlush))
        statusLines.addView(pills)
        if (server.optBoolean("helpOpen")) statusLines.addView(label(if (hasCaregiver) "已送出求助，等候照顧者處理" else "已記錄希望被聯絡；尚未配對照顧者", 16f, rust))
        val outbox = CareRuntime.outbox(this)
        statusLines.addView(label("${config.personName}${if (!hasCaregiver) " · 本人實測；尚未配對照顧者" else ""}", 14f, muted))
        statusDebugLines.removeAllViews()
        val sync = "最近同步：${if (last == 0L) "尚未同步" else DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(last))}"
        val pending = "待送出 ${outbox.count()} 筆${if (outbox.count("failed") > 0) " · 需檢查 ${outbox.count("failed")} 筆" else ""}"
        statusDebugLines.addView(label("$sync · $pending", 14f, muted))
        config.prefs.getString("connection_message", "")?.takeIf { it.isNotBlank() }?.let { statusDebugLines.addView(label(it, 14f, muted)) }
    }
    private fun relativeTime(at: Long): String {
        val minutes = ((System.currentTimeMillis() - at) / 60000).toInt()
        return when {
            minutes < 1 -> "剛剛"
            minutes < 60 -> "$minutes 分鐘前"
            minutes < 60 * 24 -> "${minutes / 60} 小時前"
            else -> DateFormat.getDateInstance(DateFormat.SHORT).format(Date(at))
        }
    }
    private fun beginSelf() {
        val config = CareConfig(this); val form = column()
        form.addView(label("你就是被關懷者。先建立自己的秘書，再自行選擇要開啟的手機資料。", 16f))
        val name = EditText(this).apply { hint = "你的稱呼"; setText("Ken"); isSingleLine = true; filters = arrayOf(InputFilter.LengthFilter(40)) }
        val endpoint = EditText(this).apply { hint = "服務網址"; setText(config.endpoint); inputType = 17 }
        form.addView(name); form.addView(endpoint)
        val dialog = AlertDialog.Builder(this).setTitle("開始使用我的秘書").setView(form).setNegativeButton("取消", null).setPositiveButton("開始", null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            try {
                config.endpoint = endpoint.text.toString(); config.beginSelf(name.text.toString()); dialog.dismiss(); refresh()
                runWork { CareRuntime.sync(this) }
            } catch (e: Exception) { name.error = e.message }
        } }; dialog.show()
    }
    private fun ownPlan() {
        val config = CareConfig(this)
        if (!config.selfMode || !config.paired) { toast("先開始自己的秘書並連上服務，才能開啟每日關心"); return }
        AlertDialog.Builder(this).setTitle("每日關心")
            .setMessage("秘書會在你方便用手機的時候問候；晚上還沒問到會再問一次，深夜不打擾。看片時會先延後確認。")
            .setNegativeButton("取消", null)
            .setPositiveButton("開啟") { _, _ -> runWork {
                // 實測用短等待與短冷卻，方便同一天重複驗證；產品預設較長。
                CareApi(config).call("/api/device/plan", JSONObject().put("enabled", true).put("contextualEnabled", true).put("graceMinutes", 5).put("responseMinutes", 5).put("deferMinutes", 5).put("cooldownMinutes", 60))
                CareRuntime.sync(this); "已開啟每日關心；秘書會挑方便的時候問候"
            } }.show()
    }
    private fun renderQuestion(question: JSONObject?) {
        val valid = question != null && question.optLong("expiresAt", 0) > System.currentTimeMillis()
        val replyState = if (valid) CareRuntime.outbox(this).questionState(question!!.getString("id")) else null
        val signature = if (valid) question.toString() + replyState else ""
        if (signature == questionSignature) return
        questionSignature = signature; questionPanel.removeAllViews(); questionPanel.visibility = if (valid) View.VISIBLE else View.GONE
        if (!valid) return
        val q = question!!
        questionPanel.addView(label("PicoCare 想關心你一下", 14f, green))
        questionPanel.addView(label(q.getString("prompt"), 23f).apply { setTypeface(null, Typeface.BOLD) })
        questionPanel.addView(label("這一題 ${DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(q.getLong("expiresAt")))} 前有效", 13f, muted))
        if (replyState != null) {
            questionPanel.addView(label(when (replyState) { "received" -> "這一題的回答已送達"; "failed" -> "回答已保留，需要同步確認。你仍可直接按下求助。"; else -> "回答已儲存，等待送出" }, 16f))
            return
        }
        val options = q.getJSONArray("options")
        for (i in 0 until options.length()) {
            val option = options.getJSONObject(i)
            questionPanel.addView(button(option.getString("label")) { answerQuestion(q, option.getString("id"), null) })
        }
        questionPanel.addView(button(q.getString("elseLabel")) { answerElse(q) })
    }
    private fun answerElse(question: JSONObject) {
        val form = column(); form.addView(label(question.getString("prompt"), 19f))
        val answer = EditText(this).apply {
            hint = "請補充你對這一題的回答"; textSize = 19f; minLines = 3
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
            filters = arrayOf(InputFilter.LengthFilter(question.getInt("maxElseLength")))
        }; form.addView(answer)
        val dialog = AlertDialog.Builder(this).setTitle("以上都不符合").setView(form).setNegativeButton("取消", null).setPositiveButton("回覆這一題", null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val value = answer.text.toString().trim()
            if (value.isEmpty()) answer.error = "請補充這一題的答案"
            else if (answerQuestion(question, "else", value)) dialog.dismiss()
        } }; dialog.show()
    }
    private fun answerQuestion(question: JSONObject, optionId: String, elseText: String?): Boolean {
        val id = question.getString("id")
        if (question.getLong("expiresAt") <= System.currentTimeMillis()) { toast("這一題已過期，請同步最近的問題"); refresh(); return false }
        if (CareRuntime.outbox(this).questionState(id) != null) { refresh(); return false }
        return try {
            val event = CareRuntime.event("question_answer").put("questionId", id).put("optionId", optionId)
            if (elseText != null) event.put("elseText", elseText)
            CareRuntime.outbox(this).add(event); getSystemService(NotificationManager::class.java).cancel(2); refresh(); toast("回答已儲存，正在送出")
            runWork { CareRuntime.sync(this, false) }; true
        } catch (error: Exception) { toast("回答儲存失敗：${error.message}"); false }
    }
    private fun runWork(work: () -> String) {
        CareRuntime.executor.execute {
            val message = try { work() } catch (error: Exception) { "等待重試：${error.message ?: "連線暫時中斷"}" }
            runOnUiThread { if (!isFinishing) { toast(message); refresh() } }
        }
    }
    private fun send(kind: String) {
        if (!CareConfig(this).ready) { toast("請先開始自己的秘書，或完成手機配對"); return }
        if (kind == "checkin") getSystemService(NotificationManager::class.java).cancel(2)
        try { CareRuntime.outbox(this).add(CareRuntime.event(kind)); toast(if (kind == "help") "求助已儲存，正在送出" else "報安已儲存，正在送出"); refresh(); runWork { CareRuntime.sync(this, false) } }
        catch (error: Exception) { toast("儲存失敗：${error.message}") }
    }
    private fun serviceEndpoint() {
        val config = CareConfig(this); val form = column()
        form.addView(label("設定秘書判讀服務的 HTTPS 網址。連不上時，手機仍會保留本機證據，恢復連線後再補送。", 15f))
        val endpoint = EditText(this).apply { hint = "服務網址"; setText(config.endpoint); inputType = 17 }; form.addView(endpoint)
        val dialog = AlertDialog.Builder(this).setTitle("服務連線設定").setView(form).setNegativeButton("取消", null).setPositiveButton("儲存並同步", null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            try {
                config.endpoint = endpoint.text.toString(); dialog.dismiss()
                if (config.ready) runWork { CareRuntime.sync(this) } else toast("服務網址已儲存")
            } catch (error: Exception) { endpoint.error = error.message }
        } }; dialog.show()
    }
    private fun pairing() {
        val config = CareConfig(this)
        if (config.paired) { toast("已配對：${config.personName}。這個版本會保留配對，不會覆蓋既有資料。"); return }
        val form = column(); val endpoint = EditText(this).apply { hint = "服務網址"; setText(config.endpoint); inputType = 17 }; val code = EditText(this).apply { hint = "照顧者提供的配對碼"; isSingleLine = true }
        form.addView(label("在照顧者網頁產生配對碼，再輸入下方。", 14f)); form.addView(endpoint); form.addView(code)
        val dialog = AlertDialog.Builder(this).setTitle("連起照顧空間").setView(form).setNegativeButton("取消", null).setPositiveButton("配對", null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val endpointValue = endpoint.text.toString(); val codeValue = code.text.toString().trim()
            if (codeValue.isEmpty()) { code.error = "請輸入配對碼"; return@setOnClickListener }
            try { config.endpoint = endpointValue } catch (error: Exception) { endpoint.error = error.message; return@setOnClickListener }
            runWork {
                val previousCode = config.prefs.getString("enrollment_code", "")
                val request = if (previousCode == codeValue) config.prefs.getString("enrollment_request", null) ?: UUID.randomUUID().toString() else UUID.randomUUID().toString()
                check(config.prefs.edit().putString("enrollment_code", codeValue).putString("enrollment_request", request).commit())
                val result = CareApi(config).call("/api/device/enroll", JSONObject().put("code", codeValue).put("requestId", request), false)
                config.savePairing(result); runOnUiThread { dialog.dismiss() }; "已配對 ${result.getString("personName")}"
            }
        } }; dialog.show()
    }
    private fun toggleConnection() {
        val config = CareConfig(this)
        if (CareConnectionService.running) { val service = Intent(this, CareConnectionService::class.java); stopService(service); refresh(); return }
        if (!config.ready) { toast("請先開始自己的秘書，或完成手機配對"); return }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 11); return
        }
        startForegroundService(Intent(this, CareConnectionService::class.java)); handler.postDelayed({ refresh() }, 500)
    }
    private fun hasPermission(permission: String) = checkSelfPermission(permission) == android.content.pm.PackageManager.PERMISSION_GRANTED
    private fun permissionSummary(config: CareConfig): String {
        fun selected(key: String) = config.prefs.getBoolean(key, false)
        fun state(enabled: Boolean, granted: Boolean) = if (!enabled) "未選用" else if (granted) "已選用，Android 已授權" else "已選用，Android 尚未授權"
        val listener = CareNotificationListener.accessGranted(this)
        val location = if (!selected("location")) "未選用" else if (hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)) "已授權精確定位；品質依實際取樣" else if (hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) "已授權約略定位；精確定位未開啟" else "已選用，Android 尚未授權"
        return "前景 App：${state(selected("usage"), ActivityEvidenceReader.usageGranted(this))}\n媒體播放：${state(selected("media"), listener)}\n通知線索：${state(selected("notifications"), listener)}\n位置：$location\nPicoCare 提醒：${if (getSystemService(NotificationManager::class.java).areNotificationsEnabled()) "已允許" else "尚未允許"}"
    }
    private fun refreshPermissions(config: CareConfig) {
        permissionText.text = permissionSummary(config)
        fun show(button: Button, needed: Boolean) { button.visibility = if (needed) View.VISIBLE else View.GONE }
        show(usagePermissionButton, config.prefs.getBoolean("usage", false) && !ActivityEvidenceReader.usageGranted(this))
        show(listenerPermissionButton, (config.prefs.getBoolean("notifications", false) || config.prefs.getBoolean("media", false)) && !CareNotificationListener.accessGranted(this))
        show(locationPermissionButton, config.prefs.getBoolean("location", false) && !hasPermission(Manifest.permission.ACCESS_FINE_LOCATION))
        show(notificationPermissionButton, !getSystemService(NotificationManager::class.java).areNotificationsEnabled())
    }
    private fun openSettings(primary: Intent, fallback: Intent) {
        try { startActivity(primary) }
        catch (_: ActivityNotFoundException) {
            try { startActivity(fallback) } catch (_: ActivityNotFoundException) { toast("找不到這個設定入口，請在系統設定搜尋 PicoCare 實測") }
        }
    }
    private fun openUsageAccess() {
        toast("在 Android 設定允許「PicoCare 實測」使用情況存取，完成後返回 App")
        openSettings(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.parse("package:$packageName")), Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
    }
    private fun openNotificationAccess() {
        val list = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        val detail = if (Build.VERSION.SDK_INT >= 30) Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS)
            .putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, ComponentName(this, CareNotificationListener::class.java).flattenToString()) else list
        openSettings(detail, list)
    }
    private fun openAppDetails() { openSettings(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")), Intent(Settings.ACTION_SETTINGS)) }
    private fun sources() {
        val config = CareConfig(this); val form = column()
        fun option(key: String, value: String) = CheckBox(this).apply { text = value; textSize = 16f; isChecked = config.prefs.getBoolean(key, false); form.addView(this) }
        form.addView(label("基本資訊包含電量、連線、可互動與鈴聲狀態。以下來源可自行選用。", 14f))
        val notifications = option("notifications", "通知情境（需要開啟通知存取）")
        val usage = option("usage", "前景 App 線索（需使用情況存取，用於判斷可能看影片）")
        val media = option("media", "媒體播放狀態（需通知存取，不讀取影片內容）")
        val location = option("location", "近期位置與移動資訊")
        val detailed = option("detailed", "詳細分享：包含通知原文及可用的精確位置")
        form.addView(label("看片判讀需要前景 App＋播放狀態；路徑變化判讀需要位置與詳細分享。持續連線時會取樣位置。", 14f))
        form.addView(label("Android 實際權限\n${permissionSummary(config)}\n勾選來源後，仍需完成 Android 授權。", 14f))
        fun saveSelection() {
            config.prefs.edit().putBoolean("notifications", notifications.isChecked).putBoolean("usage", usage.isChecked).putBoolean("media", media.isChecked).putBoolean("location", location.isChecked).putBoolean("detailed", detailed.isChecked).apply()
        }
        lateinit var dialog: AlertDialog
        form.addView(button("儲存並開使用權限") { saveSelection(); dialog.dismiss(); openUsageAccess() })
        form.addView(button("儲存並開通知權限") { saveSelection(); dialog.dismiss(); openNotificationAccess() })
        dialog = AlertDialog.Builder(this).setTitle("資料來源與分享").setView(ScrollView(this).apply { addView(form) }).setNegativeButton("取消", null).setPositiveButton("儲存") { _, _ ->
            saveSelection()
            val needsUsage = usage.isChecked && !ActivityEvidenceReader.usageGranted(this)
            val needsLocation = location.isChecked && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED
            val needsNotifications = (notifications.isChecked || media.isChecked) && !CareNotificationListener.accessGranted(this)
            if (needsUsage) openUsageAccess()
            else if (needsLocation) {
                requestPermissions(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), 12)
            } else if (needsNotifications) openNotificationAccess()
            if (CareConnectionService.running && !needsLocation) startForegroundService(Intent(this, CareConnectionService::class.java))
            refresh()
            if (!needsUsage && !needsLocation && !needsNotifications) toast("資料來源已儲存；權限可在首頁查看")
        }.create()
        dialog.show()
    }
    private fun timeline(day: Calendar = Calendar.getInstance()) {
        val selected = (day.clone() as Calendar).apply { set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
        val start = selected.timeInMillis; selected.add(Calendar.DAY_OF_YEAR, 1); val end = selected.timeInMillis
        val form = column()
        val box = CareRuntime.outbox(this); val summary = box.evidenceSummary(start, end)
        form.addView(label("本機保留最近七日證據；顯示選定日期的最新 60 筆。已送達的證據也會留下。\n這天共 ${summary.getInt("count")} 筆，其中 ${summary.getInt("samples")} 筆手機取樣、${summary.getInt("sent")} 筆已送達。", 14f))
        val rows = box.recentEvidence(start = start, end = end)
        if (rows.isEmpty()) form.addView(label("開始關懷連線或送出報安後，就會留下紀錄。"))
        for (row in rows) {
            val e = row.getJSONObject("event"); val at = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.MEDIUM).format(Date(e.getLong("observedAt")))
            val detail = when (e.getString("kind")) {
                "context" -> {
                    val c = e.getJSONObject("context")
                    val states = mapOf("available" to "可用", "disabled" to "未啟用", "permission_missing" to "未授權", "disconnected" to "採集服務未連接", "no_fix" to "沒有定位", "stale" to "資料過期", "inaccurate" to "精度不足", "speed_unavailable" to "缺少速度精度", "error" to "採集失敗")
                    val sources = c.optJSONObject("sources")
                    "手機取樣：電量 ${if (c.isNull("batteryPercent")) "未知" else "${c.getInt("batteryPercent")}%"} · ${if (c.optBoolean("charging")) "充電中" else "未充電／未知"}\n裝置${if (c.isNull("screenInteractive")) "互動狀態未知" else if (c.optBoolean("screenInteractive")) "可互動" else "不可互動"}\n通知：${states[sources?.optString("notifications")] ?: "未提供"} · 定位：${states[sources?.optString("location")] ?: "未提供"}\nApp 使用：${states[sources?.optString("usage")] ?: "未提供"} · 播放：${c.optJSONObject("media")?.optString("state") ?: "未提供"}${c.optJSONObject("motionEvidence")?.let { "\n定位觀測：${DateFormat.getTimeInstance().format(Date(it.getLong("observedAt")))} · 精度 ${it.opt("accuracy")}m" } ?: ""}"
                }
                "question_answer" -> "回答問題：${mapOf("report_ok" to "目前不需要協助", "busy" to "晚點回覆", "contact" to "請照顧者聯絡", "else" to "以上都不符合")[e.optString("optionId")] ?: "已記錄選項"} ${e.optString("elseText") }"
                "checkin" -> "本人送出報安"
                "help" -> "本人按下求助"
                else -> "提醒執行結果：${e.optString("result")}"
            }
            val delivery = when (row.getString("delivery")) { "sent" -> "中心已收件"; "failed" -> "待檢查：${row.optString("error")}"; else -> "待傳送" }
            form.addView(label("$at · $delivery\n$detail", 14f))
        }
        val dialog = AlertDialog.Builder(this).setTitle("${DateFormat.getDateInstance().format(Date(start))} 的證據").setView(ScrollView(this).apply { addView(form) }).setPositiveButton("關閉", null).setNeutralButton("選擇日期", null).create()
        dialog.setOnShowListener { dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener {
            DatePickerDialog(this, { _, year, month, date -> dialog.dismiss(); timeline(Calendar.getInstance().apply { set(year, month, date) }) }, day.get(Calendar.YEAR), day.get(Calendar.MONTH), day.get(Calendar.DAY_OF_MONTH)).show()
        } }; dialog.show()
    }
    @Suppress("DEPRECATION")
    private fun legacyStatusBar() { window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 11 && grantResults.firstOrNull() == android.content.pm.PackageManager.PERMISSION_GRANTED) toggleConnection()
        if (requestCode == 12 && CareConnectionService.running) startForegroundService(Intent(this, CareConnectionService::class.java))
    }
}
