package tw.picocare.app

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.DatePickerDialog
import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.InputFilter
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
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
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.UUID

class MainActivity : Activity() {
    private val green = UiBits.green
    private val ink = UiBits.ink
    private val body = UiBits.body
    private val muted = UiBits.muted
    private val faint = UiBits.faint
    private val rust = UiBits.rust
    private val paper = UiBits.paper
    private val warm = UiBits.warm
    private val sage = UiBits.sage
    private val amber = UiBits.amber
    private val pillAmber = UiBits.pillAmber
    private val pillBlush = UiBits.pillBlush
    private val pillMist = UiBits.pillMist
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var statusLines: LinearLayout
    private lateinit var statusDebugLines: LinearLayout
    private lateinit var thinkingTitle: TextView
    private lateinit var thinkingReason: TextView
    private lateinit var thinkingTime: TextView
    private lateinit var weeklyText: TextView
    private lateinit var weeklyTime: TextView
    private lateinit var weeklyPills: ViewGroup
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

    private fun t(en: String, zh: String) = AppLang.t(this, en, zh)
    private fun lang() = AppLang.get(this)
    private fun us(): Locale = if (AppLang.isZh(this)) Locale.getDefault() else Locale.US
    private fun dp(value: Int) = UiBits.dp(this, value)
    private fun column() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(18), dp(16), dp(18), dp(24))
    }
    private fun dialogColumn() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(22), dp(14), dp(22), dp(10))
    }
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
    private fun card() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = UiBits.rounded(this@MainActivity, UiBits.surface, 18, UiBits.cardBorder)
        setPadding(dp(18), dp(16), dp(18), dp(16))
    }
    private fun subBox() = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = UiBits.rounded(this@MainActivity, UiBits.surfaceSubtle, 12, UiBits.cardBorder)
        setPadding(dp(14), dp(12), dp(14), dp(12))
    }
    private fun cardParams(top: Int = 14) = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(top) }
    private fun sectionTitle(value: String) = label(value, 18f, ink, 0, 6).apply { setTypeface(null, Typeface.BOLD) }
    private fun compactButton(value: String, work: () -> Unit) = Button(this).apply {
        text = value
        UiBits.styleButton(this, primary = false, tonal = false, compact = true)
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) }
        setOnClickListener { work() }
    }
    private fun buttonRow(first: Button, second: Button) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) }
        first.layoutParams = LinearLayout.LayoutParams(0, -2, 1f).apply { rightMargin = dp(6) }
        second.layoutParams = LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(6) }
        addView(first)
        addView(second)
    }
    private fun tabButton(value: String, index: Int) = Button(this).apply {
        text = value
        textSize = 15.5f
        isAllCaps = false
        stateListAnimator = null
        elevation = 0f
        minWidth = 0
        minimumWidth = 0
        val h = dp(44)
        minHeight = h
        minimumHeight = h
        gravity = Gravity.CENTER
        setPadding(dp(12), dp(8), dp(12), dp(8))
        layoutParams = LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(2); rightMargin = dp(2) }
        setOnClickListener { showTab(index) }
    }
    private fun showTab(index: Int) {
        selectedTab = index
        for ((i, page) in tabPages.withIndex()) page.visibility = if (i == index) View.VISIBLE else View.GONE
        for ((i, button) in tabButtons.withIndex()) {
            val selected = i == index
            button.setTextColor(if (selected) green else muted)
            button.setTypeface(null, if (selected) Typeface.BOLD else Typeface.NORMAL)
            button.background = if (selected) UiBits.rounded(this, sage, 13, UiBits.sageBorder) else ColorDrawable(Color.TRANSPARENT)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (BuildConfig.FLAVOR == "care") { startActivity(Intent(this, CareActivity::class.java)); finish(); return }

        val home = column().apply { setBackgroundColor(paper) }
        home.addView(label("PicoCare", 13.5f, green, 2, 1).apply { setTypeface(null, Typeface.BOLD) })
        header = label(t("My Care Secretary", "我的照護秘書"), 26f, ink, 0, 2).apply { setTypeface(null, Typeface.BOLD) }
        home.addView(header)
        home.addView(label(t("Check in, answer questions, and catch up — all here.", "報安、回答問題、看近況都在這裡。"), 14f, muted, 0, 6))
        startButton = button(t("Start my secretary", "開始使用我的秘書"), primary = true, topMarginDp = 8) { beginSelf() }
        home.addView(startButton)

        questionPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = UiBits.rounded(this@MainActivity, warm, 18, UiBits.warmBorder)
            setPadding(dp(18), dp(16), dp(18), dp(16))
            visibility = View.GONE
        }
        home.addView(questionPanel, cardParams(12))

        home.addView(buttonRow(
            button(t("I'm OK", "我很好"), primary = true) { send("checkin") },
            button(t("I need help", "我需要協助")) {
                AlertDialog.Builder(this)
                    .setTitle(t("Log a help request?", "記錄需要協助？"))
                    .setMessage(if (CareConfig(this).selfMode) t("This field test isn't paired with a caregiver yet. We'll log this request; nobody can receive it right now.", "本人實測尚未配對照顧者，會記錄這次需求；目前沒有照顧者可接收。") else t("This will notify your paired care space so someone can reach you.", "會通知你已配對的照顧空間，請人員聯絡你。"))
                    .setNegativeButton(t("Cancel", "取消"), null)
                    .setPositiveButton(t("Log it", "記錄需求")) { _, _ -> send("help") }
                    .show()
            }
        ))

        val statusCard = card()
        statusCard.addView(sectionTitle(t("How you're doing", "近況")))
        statusLines = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        statusDebugLines = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = UiBits.rounded(this@MainActivity, UiBits.surfaceSubtle, 12, UiBits.cardBorder)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) }
        }
        statusCard.addView(statusLines)
        statusCard.addView(statusDebugLines)
        home.addView(statusCard, cardParams())

        connectionButton = button(t("Start", "開始連線")) { toggleConnection() }
        syncButton = button(t("Sync now", "立即同步")) { runWork { CareRuntime.sync(this) } }
        home.addView(buttonRow(connectionButton, syncButton))

        val insight = column().apply { setBackgroundColor(paper) }
        insight.addView(label("PicoCare", 13.5f, green, 2, 1).apply { setTypeface(null, Typeface.BOLD) })
        insight.addView(label(t("What your secretary thinks", "秘書的想法"), 26f, ink, 0, 2).apply { setTypeface(null, Typeface.BOLD) })
        insight.addView(label(t("What your secretary noticed, and how it reads you.", "秘書看到了什麼、怎麼理解你。"), 14f, muted, 0, 6))

        val thinkingCard = card()
        thinkingCard.addView(sectionTitle(t("PicoCare's caring thoughts", "PicoCare 的關懷思考")))
        thinkingTitle = label("", 17f, ink, 2, 4).apply { setTypeface(null, Typeface.BOLD) }
        thinkingCard.addView(thinkingTitle)
        thinkingReason = label("", 15f, body, 2, 4)
        thinkingCard.addView(thinkingReason)
        thinkingTime = label("", 13f, muted, 4, 0)
        thinkingCard.addView(thinkingTime)
        insight.addView(thinkingCard, cardParams(10))

        val weeklyCard = card()
        weeklyCard.addView(sectionTitle(t("This week", "本週回顧")))
        weeklyText = label("", 15f, body, 2, 4)
        weeklyCard.addView(weeklyText)
        weeklyPills = UiBits.pillContainer(this)
        weeklyCard.addView(weeklyPills)
        weeklyTime = label("", 13f, muted, 4, 0)
        weeklyCard.addView(weeklyTime)
        insight.addView(weeklyCard, cardParams())

        insight.addView(sectionTitle(t("Secretary feed", "秘書動態")).apply {
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(18); bottomMargin = dp(2) }
        })
        wallBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        insight.addView(wallBox)

        debugInsightCard = card()
        debugInsightCard.addView(sectionTitle(t("Details (DEBUG)", "詳細資訊（DEBUG）")))
        debugInsightCard.addView(label(t("Full read", "詳細判讀"), 14f, green, 6, 2).apply { setTypeface(null, Typeface.BOLD) })
        interpretationText = label("", 13.5f, body, 2, 8)
        debugInsightCard.addView(interpretationText)
        debugInsightCard.addView(label(t("Raw observations", "觀測原文"), 14f, green, 6, 2).apply { setTypeface(null, Typeface.BOLD) })
        observationText = label("", 13.5f, body, 2, 8)
        debugInsightCard.addView(observationText)
        // Field-test view: retain the latest model result when live context changes.
        debugInsightCard.addView(label(t("Raw Meta", "Meta 原始"), 14f, green, 6, 2).apply { setTypeface(null, Typeface.BOLD) })
        metaPreviewText = label(t("No Meta reading yet.", "還沒有 Meta 判斷。"), 13.5f, body, 2, 2)
        debugInsightCard.addView(metaPreviewText)
        insight.addView(debugInsightCard, cardParams())
        val settings = column().apply { setBackgroundColor(paper) }
        settings.addView(label("PicoCare", 13.5f, green, 2, 1).apply { setTypeface(null, Typeface.BOLD) })
        settings.addView(label(t("Settings", "設定"), 26f, ink, 0, 2).apply { setTypeface(null, Typeface.BOLD) })
        settings.addView(label(t("Permissions, connection, and tools live here.", "權限、連線跟工具都在這裡。"), 14f, muted, 0, 6))

        val permissionPanel = card()
        permissionPanel.addView(sectionTitle(t("Phone data & permissions", "手機資料與權限")))
        val permBox = subBox().apply {
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(4); bottomMargin = dp(4) }
        }
        permissionText = label("", 14f, body, 2, 2).apply { setLineSpacing(dp(5).toFloat(), 1f) }
        permBox.addView(permissionText)
        permissionPanel.addView(permBox)
        usagePermissionButton = button(t("Allow app-usage access", "開啟 App 使用權限"), primary = true, topMarginDp = 10) { openUsageAccess() }
        permissionPanel.addView(usagePermissionButton)
        listenerPermissionButton = button(t("Allow notification access", "開啟通知存取"), topMarginDp = 8) { openNotificationAccess() }
        permissionPanel.addView(listenerPermissionButton)
        locationPermissionButton = button(t("Set location permission", "設定定位權限"), topMarginDp = 8) { openAppDetails() }
        permissionPanel.addView(locationPermissionButton)
        notificationPermissionButton = button(t("Allow reminders", "允許顯示提醒"), topMarginDp = 8) {
            openSettings(
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName),
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
            )
        }
        permissionPanel.addView(notificationPermissionButton)
        permissionPanel.addView(button(t("Choose data sources", "選擇資料來源"), topMarginDp = 8) { sources() })
        settings.addView(permissionPanel, cardParams(10))

        val settingsCard = card()
        settingsCard.addView(sectionTitle(t("Settings & tools", "設定與工具")))
        endpointButton = compactButton(t("Service connection", "服務連線設定")) { serviceEndpoint() }
        settingsCard.addView(endpointButton)
        settingsCard.addView(compactButton(t("Pair this phone", "手機配對")) { pairing() })
        settingsCard.addView(compactButton(t("Data sources & sharing", "資料來源與分享")) { sources() })
        settingsCard.addView(compactButton(t("On-device evidence timeline", "本機證據時間線")) { timeline() })
        settingsCard.addView(compactButton(t("Turn on daily check-ins", "開啟每日關心")) { ownPlan() })
        settingsCard.addView(compactButton(t("Language 語言：${AppLang.label(this)}", "語言 Language：${AppLang.label(this)}")) { AppLang.toggle(this); recreate() })
        settings.addView(settingsCard, cardParams())

        val debugCard = card()
        debugCard.addView(sectionTitle(t("Developer options", "開發者選項")))
        debugSwitch = Switch(this).apply {
            text = "DEBUG MODE"
            textSize = 15.5f
            setTextColor(ink)
            setTypeface(null, Typeface.BOLD)
            setPadding(0, dp(6), 0, dp(6))
            setOnCheckedChangeListener { _, checked -> CareConfig(this@MainActivity).debugMode = checked; refresh() }
        }
        debugCard.addView(debugSwitch)
        debugCard.addView(label(t("Shows detailed sync and reading info.", "開啟後顯示詳細同步與判讀資訊。"), 13.5f, muted, 2, 0))
        settings.addView(debugCard, cardParams())

        settings.addView(label(t("Guess sources and the Meta link status appear in the reading.", "情境猜測的來源與 Meta 連線狀態會顯示在判讀內容中。"), 12.5f, faint, 12, 2))
        settings.addView(label(t("PicoCare field test ${BuildConfig.VERSION_NAME} / ${BuildConfig.VERSION_CODE}", "PicoCare 實測 ${BuildConfig.VERSION_NAME} / ${BuildConfig.VERSION_CODE}"), 12.5f, faint, 2, 8))

        val pages = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(-1, 0, 1f)
        }
        tabPages = listOf(home, insight, settings).map { page ->
            ScrollView(this).apply {
                isFillViewport = true
                addView(page)
                pages.addView(this, LinearLayout.LayoutParams(-1, -1))
            }
        }
        tabButtons = listOf(t("Home", "首頁") to 0, t("Insights", "判讀") to 1, t("Settings", "設定") to 2).map { (name, index) -> tabButton(name, index) }
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = UiBits.rounded(this@MainActivity, Color.WHITE, 18, UiBits.cardBorder)
            setPadding(dp(5), dp(5), dp(5), dp(5))
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply {
                leftMargin = dp(18)
                rightMargin = dp(18)
                topMargin = dp(6)
                bottomMargin = dp(10)
            }
            for (button in tabButtons) addView(button)
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(paper)
            addView(pages)
            addView(bar)
        }
        UiBits.applyWindowInsets(root)
        window.setBackgroundDrawable(ColorDrawable(paper))
        setContentView(root)
        showTab(0)
        // PhoneWindow needs its decor view before exposing the insets controller.
        if (Build.VERSION.SDK_INT >= 30) {
            window.decorView.windowInsetsController?.setSystemBarsAppearance(
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            )
        } else legacyStatusBar()
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
                catch (error: RuntimeException) { config.prefs.edit().putString("connection_message", t("Ongoing connection needs a restart: ${error.message}", "持續連線需要重新啟動：${error.message}")).apply() }
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
        (connectionButton.layoutParams as? LinearLayout.LayoutParams)?.let { lp ->
            val targetRight = if (debug) dp(6) else 0
            if (lp.rightMargin != targetRight) {
                lp.rightMargin = targetRight
                connectionButton.layoutParams = lp
            }
        }
        endpointButton.visibility = if (debug) View.VISIBLE else View.GONE
        debugInsightCard.visibility = if (debug) View.VISIBLE else View.GONE
        statusDebugLines.visibility = if (debug && config.ready) View.VISIBLE else View.GONE
        if (debugSwitch.isChecked != debug) debugSwitch.isChecked = debug
        renderStatus(config, server, last)
        connectionButton.text = if (CareConnectionService.running) t("Stop", "停止連線") else t("Start", "開始連線")
        refreshPermissions(config)
        renderQuestion(server.optJSONObject("question"))
        observationText.text = SelfInsight.observations(
            runCatching { JSONObject(config.prefs.getString("last_local_context", "")!!) }.getOrNull(),
            config.prefs.getLong("last_local_at", 0), lang()
        )
        val estimatedNow = if (last > 0) server.optLong("serverAt", System.currentTimeMillis()) + (System.currentTimeMillis() - last).coerceAtLeast(0) else System.currentTimeMillis()
        metaPreviewText.text = SelfInsight.metaPreview(server, estimatedNow, lang())
        interpretationText.text = SelfInsight.interpretation(server, estimatedNow, lang())
        val thinking = SelfInsight.thinking(server, estimatedNow, lang())
        thinkingTitle.text = thinking.title
        thinkingReason.text = thinking.reason
        thinkingReason.visibility = if (thinking.reason.isNotBlank()) View.VISIBLE else View.GONE
        val tTime = if (thinking.observedAt > 0) t("Thoughts · ${relativeTime(thinking.observedAt)}", "${relativeTime(thinking.observedAt)}的想法") else ""
        thinkingTime.text = tTime
        thinkingTime.visibility = if (tTime.isNotBlank()) View.VISIBLE else View.GONE

        val weekly = SelfInsight.weekly(server)
        weeklyText.text = weekly?.text ?: t("Once there's more life in the feed, Meta will write a weekly recap for your family.", "動態再多一點，Meta 會幫你寫一段給家人的本週回顧。")
        weeklyPills.removeAllViews()
        if (weekly != null) {
            weeklyPills.addView(UiBits.pill(this, if (weekly.model.contains("open")) t("Open weights", "開源模型整理") else t("By Meta", "Meta 整理"), green, sage))
            weeklyPills.visibility = View.VISIBLE
        } else {
            weeklyPills.visibility = View.GONE
        }
        val wTime = if (weekly == null || weekly.at <= 0) "" else relativeTime(weekly.at)
        weeklyTime.text = wTime
        weeklyTime.visibility = if (wTime.isNotBlank()) View.VISIBLE else View.GONE
        renderWall(server)
    }

    private fun renderWall(server: JSONObject) {
        wallBox.removeAllViews()
        val items = SelfInsight.notes(server)
        if (items.isEmpty()) {
            val emptyCard = card()
            emptyCard.addView(label(t("Nothing here yet. Your secretary will post discoveries here.", "還沒有動態。秘書有發現會寫在這裡。"), 14.5f, muted, 2, 2))
            wallBox.addView(emptyCard, cardParams(8))
            return
        }
        for (n in items) {
            val post = card()
            post.addView(label(n.title, 16.5f, ink, 0, 4).apply { setTypeface(null, Typeface.BOLD) })
            if (n.body.isNotBlank()) post.addView(label(n.body, 14.5f, body, 2, 4))
            for (e in n.evidence) post.addView(label(e, 13.5f, muted, 1, 2))
            val meta = UiBits.pillContainer(this)
            meta.addView(UiBits.pill(this, relativeTime(n.at), muted, pillMist))
            meta.addView(UiBits.pill(this, if (n.source == "meta") t("Meta fused", "Meta 融合") else t("On-device", "本地整理"), green, sage))
            post.addView(meta)
            wallBox.addView(post, cardParams(10))
        }
    }

    private fun renderStatus(config: CareConfig, server: JSONObject, last: Long) {
        statusLines.removeAllViews()
        if (!config.ready) {
            statusLines.addView(label(t("Start your own secretary first — or enter a caregiver's pairing code.", "先開始使用自己的秘書；也可以輸入照顧者的配對碼。"), 15f, body, 2, 2))
            return
        }
        val reported = server.optString("checkin") == "reported"
        val hasCaregiver = server.optBoolean("caregiverConnected", !config.selfMode)
        statusLines.addView(label(if (reported) t("Check-in received", "已收到本人報安") else t("Waiting for check-in", "等候報安"), 20f, if (reported) green else ink, 2, 4).apply { setTypeface(null, Typeface.BOLD) })
        val pills = UiBits.pillContainer(this)
        pills.addView(UiBits.pill(this, if (reported) t("Checked in", "已報安") else t("Waiting", "等候報安"), if (reported) green else amber, if (reported) sage else pillAmber))
        if (server.optBoolean("helpOpen")) pills.addView(UiBits.pill(this, t("Help", "已求助"), rust, pillBlush))
        statusLines.addView(pills)
        if (server.optBoolean("helpOpen")) {
            statusLines.addView(label(if (hasCaregiver) t("Help request sent. Waiting for your caregiver.", "已送出求助，等候照顧者處理") else t("Logged as hoping to be contacted. No caregiver paired yet.", "已記錄希望被聯絡；尚未配對照顧者"), 15f, rust, 6, 2).apply { setTypeface(null, Typeface.BOLD) })
        }
        val outbox = CareRuntime.outbox(this)
        statusLines.addView(label("${config.personName}${if (!hasCaregiver) t(" · Field test; no caregiver paired", " · 本人實測；尚未配對照顧者") else ""}", 14f, muted, 6, 2))
        statusDebugLines.removeAllViews()
        val sync = t("Last sync: ${if (last == 0L) "never" else DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT, us()).format(Date(last))}", "最近同步：${if (last == 0L) "尚未同步" else DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(Date(last))}")
        val pending = t("${outbox.count()} waiting${if (outbox.count("failed") > 0) " · ${outbox.count("failed")} need a look" else ""}", "待送出 ${outbox.count()} 筆${if (outbox.count("failed") > 0) " · 需檢查 ${outbox.count("failed")} 筆" else ""}")
        statusDebugLines.addView(label("$sync · $pending", 13.5f, muted, 1, 1))
        config.prefs.getString("connection_message", "")?.takeIf { it.isNotBlank() }?.let {
            statusDebugLines.addView(label(it, 13.5f, muted, 3, 1))
        }
    }

    private fun relativeTime(at: Long): String {
        val minutes = ((System.currentTimeMillis() - at) / 60000).toInt()
        val z = AppLang.isZh(this)
        return when {
            minutes < 1 -> if (z) "剛剛" else "Just now"
            minutes < 60 -> if (z) "$minutes 分鐘前" else "$minutes min ago"
            minutes < 60 * 24 -> if (z) "${minutes / 60} 小時前" else "${minutes / 60} hr ago"
            else -> DateFormat.getDateInstance(DateFormat.SHORT, us()).format(Date(at))
        }
    }
    private fun beginSelf() {
        val config = CareConfig(this)
        val form = dialogColumn()
        form.addView(label(t("You're the one being cared for. Set up your secretary first, then pick which phone data to share.", "你就是被關懷者。先建立自己的秘書，再自行選擇要開啟的手機資料。"), 15f, body, 2, 6))
        val name = EditText(this).apply {
            hint = t("Your name", "你的稱呼")
            setText("Ken")
            isSingleLine = true
            filters = arrayOf(InputFilter.LengthFilter(40))
            UiBits.styleInput(this, 8)
        }
        val endpoint = EditText(this).apply {
            hint = t("Service URL", "服務網址")
            setText(config.endpoint)
            inputType = 17
            UiBits.styleInput(this, 10)
        }
        form.addView(name)
        form.addView(endpoint)
        val dialog = AlertDialog.Builder(this).setTitle(t("Start my secretary", "開始使用我的秘書")).setView(form).setNegativeButton(t("Cancel", "取消"), null).setPositiveButton(t("Start", "開始"), null).create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                try {
                    config.endpoint = endpoint.text.toString()
                    config.beginSelf(name.text.toString())
                    dialog.dismiss()
                    refresh()
                    runWork { CareRuntime.sync(this) }
                } catch (e: Exception) { name.error = e.message }
            }
        }
        dialog.show()
    }

    private fun ownPlan() {
        val config = CareConfig(this)
        if (!config.selfMode || !config.paired) { toast(t("Start your secretary and connect before turning on daily check-ins", "先開始自己的秘書並連上服務，才能開啟每日關心")); return }
        AlertDialog.Builder(this).setTitle(t("Daily check-ins", "每日關心"))
            .setMessage(t("Your secretary greets you when you're already on your phone; once more in the evening if it missed you, never late at night. It holds off while you're watching videos.", "秘書會在你方便用手機的時候問候；晚上還沒問到會再問一次，深夜不打擾。看片時會先延後確認。"))
            .setNegativeButton(t("Cancel", "取消"), null)
            .setPositiveButton(t("Turn on", "開啟")) { _, _ -> runWork {
                // 實測用短等待與短冷卻，方便同一天重複驗證；產品預設較長。
                CareApi(config, this).call("/api/device/plan", JSONObject().put("enabled", true).put("contextualEnabled", true).put("graceMinutes", 5).put("responseMinutes", 5).put("deferMinutes", 5).put("cooldownMinutes", 60))
                CareRuntime.sync(this); t("Daily check-ins on. Your secretary will pick a good moment.", "已開啟每日關心；秘書會挑方便的時候問候")
            } }.show()
    }

    private fun renderQuestion(question: JSONObject?) {
        val valid = question != null && question.optLong("expiresAt", 0) > System.currentTimeMillis()
        val replyState = if (valid) CareRuntime.outbox(this).questionState(question!!.getString("id")) else null
        val signature = if (valid) question.toString() + replyState else ""
        if (signature == questionSignature) return
        questionSignature = signature
        questionPanel.removeAllViews()
        questionPanel.visibility = if (valid) View.VISIBLE else View.GONE
        if (!valid) return
        val q = question!!
        questionPanel.addView(label(t("PicoCare wants to check in", "PicoCare 想關心你一下"), 13.5f, green, 0, 2).apply { setTypeface(null, Typeface.BOLD) })
        questionPanel.addView(label(q.getString("prompt"), 21f, ink, 2, 4).apply { setTypeface(null, Typeface.BOLD) })
        questionPanel.addView(label(t("Good until ${DateFormat.getTimeInstance(DateFormat.SHORT, us()).format(Date(q.getLong("expiresAt")))}", "這一題 ${DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(q.getLong("expiresAt")))} 前有效"), 13f, muted, 0, 6))
        if (replyState != null) {
            questionPanel.addView(label(when (replyState) {
                "received" -> t("Your answer got through", "這一題的回答已送達")
                "failed" -> t("Answer kept; needs a sync to confirm. You can still ask for help directly.", "回答已保留，需要同步確認。你仍可直接按下求助。")
                else -> t("Answer saved, waiting to send", "回答已儲存，等待送出")
            }, 15.5f, body, 4, 2))
            return
        }
        val options = q.getJSONArray("options")
        for (i in 0 until options.length()) {
            val option = options.getJSONObject(i)
            questionPanel.addView(button(option.getString("label"), primary = i == 0, topMarginDp = 8) {
                answerQuestion(q, option.getString("id"), null)
            })
        }
        questionPanel.addView(button(q.getString("elseLabel"), primary = false, topMarginDp = 8) { answerElse(q) })
    }

    private fun answerElse(question: JSONObject) {
        val form = dialogColumn()
        form.addView(label(question.getString("prompt"), 17.5f, ink, 2, 6).apply { setTypeface(null, Typeface.BOLD) })
        val answer = EditText(this).apply {
            hint = t("Anything else for this question?", "請補充你對這一題的回答")
            minLines = 3
            gravity = Gravity.TOP or Gravity.START
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
            filters = arrayOf(InputFilter.LengthFilter(question.getInt("maxElseLength")))
            UiBits.styleInput(this, 6)
        }
        form.addView(answer)
        val dialog = AlertDialog.Builder(this).setTitle(t("None of the above", "以上都不符合")).setView(form).setNegativeButton(t("Cancel", "取消"), null).setPositiveButton(t("Answer", "回覆這一題"), null).create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val value = answer.text.toString().trim()
                if (value.isEmpty()) answer.error = t("Please add your answer", "請補充這一題的答案")
                else if (answerQuestion(question, "else", value)) dialog.dismiss()
            }
        }
        dialog.show()
    }

    private fun answerQuestion(question: JSONObject, optionId: String, elseText: String?): Boolean {
        val id = question.getString("id")
        if (question.getLong("expiresAt") <= System.currentTimeMillis()) { toast(t("This question expired. Sync for the latest one.", "這一題已過期，請同步最近的問題")); refresh(); return false }
        if (CareRuntime.outbox(this).questionState(id) != null) { refresh(); return false }
        return try {
            val event = CareRuntime.event("question_answer").put("questionId", id).put("optionId", optionId)
            if (elseText != null) event.put("elseText", elseText)
            CareRuntime.outbox(this).add(event)
            getSystemService(NotificationManager::class.java).cancel(2)
            refresh()
            toast(t("Answer saved, sending now", "回答已儲存，正在送出"))
            runWork { CareRuntime.sync(this, false) }
            true
        } catch (error: Exception) { toast(t("Could not save the answer: ${error.message}", "回答儲存失敗：${error.message}")); false }
    }

    private fun runWork(work: () -> String) {
        CareRuntime.executor.execute {
            val message = try { work() } catch (error: Exception) { t("Will retry: ${error.message ?: "connection hiccup"}", "等待重試：${error.message ?: "連線暫時中斷"}") }
            runOnUiThread { if (!isFinishing) { toast(message); refresh() } }
        }
    }

    private fun send(kind: String) {
        if (!CareConfig(this).ready) { toast(t("Start your secretary or finish pairing first", "請先開始自己的秘書，或完成手機配對")); return }
        if (kind == "checkin") getSystemService(NotificationManager::class.java).cancel(2)
        try {
            CareRuntime.outbox(this).add(CareRuntime.event(kind))
            toast(if (kind == "help") t("Help request saved, sending now", "求助已儲存，正在送出") else t("Check-in saved, sending now", "報安已儲存，正在送出"))
            refresh()
            runWork { CareRuntime.sync(this, false) }
        } catch (error: Exception) { toast(t("Could not save: ${error.message}", "儲存失敗：${error.message}")) }
    }
    private fun serviceEndpoint() {
        val config = CareConfig(this)
        val form = dialogColumn()
        form.addView(label(t("Set the HTTPS address of the secretary service. If it can't connect, evidence stays on your phone and catches up later.", "設定秘書判讀服務的 HTTPS 網址。連不上時，手機仍會保留本機證據，恢復連線後再補送。"), 14.5f, body, 2, 6))
        val endpoint = EditText(this).apply {
            hint = t("Service URL", "服務網址")
            setText(config.endpoint)
            inputType = 17
            UiBits.styleInput(this, 6)
        }
        form.addView(endpoint)
        val dialog = AlertDialog.Builder(this).setTitle(t("Service connection", "服務連線設定")).setView(form).setNegativeButton(t("Cancel", "取消"), null).setPositiveButton(t("Save & sync", "儲存並同步"), null).create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                try {
                    config.endpoint = endpoint.text.toString()
                    dialog.dismiss()
                    if (config.ready) runWork { CareRuntime.sync(this) } else toast(t("Service URL saved", "服務網址已儲存"))
                } catch (error: Exception) { endpoint.error = error.message }
            }
        }
        dialog.show()
    }

    private fun pairing() {
        val config = CareConfig(this)
        if (config.paired) { toast(t("Paired as ${config.personName}. This build keeps your pairing and never overwrites existing data.", "已配對：${config.personName}。這個版本會保留配對，不會覆蓋既有資料。")); return }
        val form = dialogColumn()
        val endpoint = EditText(this).apply {
            hint = t("Service URL", "服務網址")
            setText(config.endpoint)
            inputType = 17
            UiBits.styleInput(this, 8)
        }
        val code = EditText(this).apply {
            hint = t("Pairing code from your caregiver", "照顧者提供的配對碼")
            isSingleLine = true
            UiBits.styleInput(this, 10)
        }
        form.addView(label(t("Get a code from the caregiver page, then enter it below.", "在照顧者網頁產生配對碼，再輸入下方。"), 14.5f, body, 2, 4))
        form.addView(endpoint)
        form.addView(code)
        val dialog = AlertDialog.Builder(this).setTitle(t("Join a care space", "連起照顧空間")).setView(form).setNegativeButton(t("Cancel", "取消"), null).setPositiveButton(t("Pair", "配對"), null).create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val endpointValue = endpoint.text.toString()
                val codeValue = code.text.toString().trim()
                if (codeValue.isEmpty()) { code.error = t("Please enter the code", "請輸入配對碼"); return@setOnClickListener }
                try { config.endpoint = endpointValue } catch (error: Exception) { endpoint.error = error.message; return@setOnClickListener }
                runWork {
                    val previousCode = config.prefs.getString("enrollment_code", "")
                    val request = if (previousCode == codeValue) config.prefs.getString("enrollment_request", null) ?: UUID.randomUUID().toString() else UUID.randomUUID().toString()
                    check(config.prefs.edit().putString("enrollment_code", codeValue).putString("enrollment_request", request).commit())
                    val result = CareApi(config, this).call("/api/device/enroll", JSONObject().put("code", codeValue).put("requestId", request), false)
                    config.savePairing(result); runOnUiThread { dialog.dismiss() }; t("Paired as ${result.getString("personName")}", "已配對 ${result.getString("personName")}")
                }
            }
        }
        dialog.show()
    }

    private fun toggleConnection() {
        val config = CareConfig(this)
        if (CareConnectionService.running) { val service = Intent(this, CareConnectionService::class.java); stopService(service); refresh(); return }
        if (!config.ready) { toast(t("Start your secretary or finish pairing first", "請先開始自己的秘書，或完成手機配對")); return }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 11); return
        }
        startForegroundService(Intent(this, CareConnectionService::class.java)); handler.postDelayed({ refresh() }, 500)
    }

    private fun hasPermission(permission: String) = checkSelfPermission(permission) == android.content.pm.PackageManager.PERMISSION_GRANTED
    private fun permissionSummary(config: CareConfig): String {
        val z = AppLang.isZh(this)
        fun selected(key: String) = config.prefs.getBoolean(key, false)
        fun state(enabled: Boolean, granted: Boolean) = if (!enabled) (if (z) "未選用" else "Off") else if (granted) (if (z) "已選用，Android 已授權" else "On, granted in Android") else (if (z) "已選用，Android 尚未授權" else "On, not granted yet")
        val listener = CareNotificationListener.accessGranted(this)
        val location = if (!selected("location")) (if (z) "未選用" else "Off")
            else if (hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)) (if (z) "已授權精確定位；品質依實際取樣" else "Precise location granted; quality depends on actual fixes")
            else if (hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) (if (z) "已授權約略定位；精確定位未開啟" else "Approximate granted; precise is off")
            else (if (z) "已選用，Android 尚未授權" else "On, not granted yet")
        return if (z) "前景 App：${state(selected("usage"), ActivityEvidenceReader.usageGranted(this))}\n媒體播放：${state(selected("media"), listener)}\n通知線索：${state(selected("notifications"), listener)}\n位置：$location\nPicoCare 提醒：${if (getSystemService(NotificationManager::class.java).areNotificationsEnabled()) "已允許" else "尚未允許"}"
            else "Foreground app: ${state(selected("usage"), ActivityEvidenceReader.usageGranted(this))}\nMedia: ${state(selected("media"), listener)}\nNotifications: ${state(selected("notifications"), listener)}\nLocation: $location\nPicoCare reminders: ${if (getSystemService(NotificationManager::class.java).areNotificationsEnabled()) "Allowed" else "Not allowed"}"
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
            try { startActivity(fallback) } catch (_: ActivityNotFoundException) { toast(t("Can't find that settings page. Search PicoCare in system settings.", "找不到這個設定入口，請在系統設定搜尋 PicoCare 實測")) }
        }
    }
    private fun openUsageAccess() {
        toast(t("In Android settings, allow usage access for PicoCare, then come back.", "在 Android 設定允許「PicoCare 實測」使用情況存取，完成後返回 App"))
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
        val config = CareConfig(this)
        val form = dialogColumn()
        fun option(key: String, value: String) = CheckBox(this).apply {
            text = value
            textSize = 15.5f
            setTextColor(ink)
            buttonTintList = ColorStateList.valueOf(green)
            setPadding(dp(8), dp(8), dp(4), dp(8))
            isChecked = config.prefs.getBoolean(key, false)
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(2) }
            form.addView(this)
        }
        form.addView(label(t("Basics cover battery, connection, interactivity, and ringer. Pick more sources below.", "基本資訊包含電量、連線、可互動與鈴聲狀態。以下來源可自行選用。"), 14f, body, 2, 6))
        val notifications = option("notifications", t("Notification context (needs notification access)", "通知情境（需要開啟通知存取）"))
        val usage = option("usage", t("Foreground-app hints (needs usage access; spots video watching)", "前景 App 線索（需使用情況存取，用於判斷可能看影片）"))
        val media = option("media", t("Media state (needs notification access; never reads content)", "媒體播放狀態（需通知存取，不讀取影片內容）"))
        val location = option("location", t("Recent location & movement", "近期位置與移動資訊"))
        val detailed = option("detailed", t("Detailed sharing: notification text and precise location when available", "詳細分享：包含通知原文及可用的精確位置"))
        form.addView(label(t("Spotting videos needs app + playback; route changes need location + detailed sharing. Ongoing connection samples location.", "看片判讀需要前景 App＋播放狀態；路徑變化判讀需要位置與詳細分享。持續連線時會取樣位置。"), 13.5f, muted, 8, 6))
        val statusBox = subBox().apply {
            layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(4); bottomMargin = dp(6) }
        }
        statusBox.addView(label(t("Actual Android permissions\n${permissionSummary(config)}\nAfter ticking sources, still complete the Android grants.", "Android 實際權限\n${permissionSummary(config)}\n勾選來源後，仍需完成 Android 授權。"), 13.5f, body, 2, 2))
        form.addView(statusBox)
        fun saveSelection() {
            config.prefs.edit()
                .putBoolean("notifications", notifications.isChecked)
                .putBoolean("usage", usage.isChecked)
                .putBoolean("media", media.isChecked)
                .putBoolean("location", location.isChecked)
                .putBoolean("detailed", detailed.isChecked)
                .apply()
        }
        lateinit var dialog: AlertDialog
        form.addView(compactButton(t("Save & open usage access", "儲存並開使用權限")) { saveSelection(); dialog.dismiss(); openUsageAccess() })
        form.addView(compactButton(t("Save & open notification access", "儲存並開通知權限")) { saveSelection(); dialog.dismiss(); openNotificationAccess() })
        dialog = AlertDialog.Builder(this)
            .setTitle(t("Data sources & sharing", "資料來源與分享"))
            .setView(ScrollView(this).apply { addView(form) })
            .setNegativeButton(t("Cancel", "取消"), null)
            .setPositiveButton(t("Save", "儲存")) { _, _ ->
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
                if (!needsUsage && !needsLocation && !needsNotifications) toast(t("Sources saved. Check permissions on the Home tab.", "資料來源已儲存；權限可在首頁查看"))
            }.create()
        dialog.show()
    }
    private fun timeline(day: Calendar = Calendar.getInstance()) {
        val z = AppLang.isZh(this)
        val selected = (day.clone() as Calendar).apply { set(Calendar.HOUR_OF_DAY, 0); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
        val start = selected.timeInMillis; selected.add(Calendar.DAY_OF_YEAR, 1); val end = selected.timeInMillis
        val form = dialogColumn()
        val box = CareRuntime.outbox(this); val summary = box.evidenceSummary(start, end)
        form.addView(label(if (z) "本機保留最近七日證據；顯示選定日期的最新 60 筆。已送達的證據也會留下。\n這天共 ${summary.getInt("count")} 筆，其中 ${summary.getInt("samples")} 筆手機取樣、${summary.getInt("sent")} 筆已送達。"
            else "Your phone keeps 7 days of evidence; showing the latest 60 for this date, delivered ones included.\n${summary.getInt("count")} entries this day: ${summary.getInt("samples")} samples, ${summary.getInt("sent")} delivered.", 13.5f, muted, 2, 8))
        val rows = box.recentEvidence(start = start, end = end)
        if (rows.isEmpty()) form.addView(label(t("Records appear after you start the connection or send a check-in.", "開始關懷連線或送出報安後，就會留下紀錄。"), 14.5f, body, 6, 6))
        for (row in rows) {
            val e = row.getJSONObject("event"); val at = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.MEDIUM, us()).format(Date(e.getLong("observedAt")))
            val detail = when (e.getString("kind")) {
                "context" -> {
                    val c = e.getJSONObject("context")
                    val states = if (z) mapOf("available" to "可用", "disabled" to "未啟用", "permission_missing" to "未授權", "disconnected" to "採集服務未連接", "no_fix" to "沒有定位", "stale" to "資料過期", "inaccurate" to "精度不足", "speed_unavailable" to "缺少速度精度", "error" to "採集失敗")
                        else mapOf("available" to "ok", "disabled" to "off", "permission_missing" to "not granted", "disconnected" to "collector down", "no_fix" to "no fix", "stale" to "stale", "inaccurate" to "not accurate", "speed_unavailable" to "speed missing", "error" to "failed")
                    val sources = c.optJSONObject("sources")
                    val battery = if (c.isNull("batteryPercent")) (if (z) "未知" else "unknown") else "${c.getInt("batteryPercent")}%"
                    val charging = if (c.optBoolean("charging")) (if (z) "充電中" else "charging") else (if (z) "未充電／未知" else "not charging/unknown")
                    val interactive = if (c.isNull("screenInteractive")) (if (z) "互動狀態未知" else "interaction unknown") else if (c.optBoolean("screenInteractive")) (if (z) "可互動" else "interactive") else (if (z) "不可互動" else "not interactive")
                    val na = if (z) "未提供" else "n/a"
                    val motion = c.optJSONObject("motionEvidence")?.let { if (z) "\n定位觀測：${DateFormat.getTimeInstance().format(Date(it.getLong("observedAt")))} · 精度 ${it.opt("accuracy")}m" else "\nLocation fix: ${DateFormat.getTimeInstance(DateFormat.SHORT, us()).format(Date(it.getLong("observedAt")))} · ±${it.opt("accuracy")}m" } ?: ""
                    if (z) "手機取樣：電量 $battery · $charging\n裝置$interactive\n通知：${states[sources?.optString("notifications")] ?: na} · 定位：${states[sources?.optString("location")] ?: na}\nApp 使用：${states[sources?.optString("usage")] ?: na} · 播放：${c.optJSONObject("media")?.optString("state") ?: na}$motion"
                    else "Sample: battery $battery · $charging\nDevice $interactive\nNotifications: ${states[sources?.optString("notifications")] ?: na} · Location: ${states[sources?.optString("location")] ?: na}\nApp usage: ${states[sources?.optString("usage")] ?: na} · Playback: ${c.optJSONObject("media")?.optString("state") ?: na}$motion"
                }
                "question_answer" -> if (z) "回答問題：${mapOf("report_ok" to "目前不需要協助", "busy" to "晚點回覆", "contact" to "請照顧者聯絡", "else" to "以上都不符合")[e.optString("optionId")] ?: "已記錄選項"} ${e.optString("elseText")}"
                    else "Answered: ${mapOf("report_ok" to "I'm fine for now", "busy" to "Reply later", "contact" to "Ask caregiver to call", "else" to "None of the above")[e.optString("optionId")] ?: "Option logged"} ${e.optString("elseText")}"
                "checkin" -> if (z) "本人送出報安" else "You sent a check-in"
                "help" -> if (z) "本人按下求助" else "You asked for help"
                else -> if (z) "提醒執行結果：${e.optString("result")}" else "Reminder result: ${e.optString("result")}"
            }
            val delivery = when (row.getString("delivery")) {
                "sent" -> if (z) "中心已收件" else "Received"
                "failed" -> if (z) "待檢查：${row.optString("error")}" else "Needs a look: ${row.optString("error")}"
                else -> if (z) "待傳送" else "Waiting to send"
            }
            val itemBox = subBox().apply {
                layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) }
            }
            itemBox.addView(label("$at · $delivery", 13f, green, 0, 2).apply { setTypeface(null, Typeface.BOLD) })
            itemBox.addView(label(detail, 13.5f, body, 2, 0))
            form.addView(itemBox)
        }
        val dialog = AlertDialog.Builder(this).setTitle(if (z) "${DateFormat.getDateInstance().format(Date(start))} 的證據" else "Evidence · ${DateFormat.getDateInstance(DateFormat.SHORT, us()).format(Date(start))}").setView(ScrollView(this).apply { addView(form) }).setPositiveButton(t("Close", "關閉"), null).setNeutralButton(t("Pick a date", "選擇日期"), null).create()
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener {
                DatePickerDialog(this, { _, year, month, date -> dialog.dismiss(); timeline(Calendar.getInstance().apply { set(year, month, date) }) }, day.get(Calendar.YEAR), day.get(Calendar.MONTH), day.get(Calendar.DAY_OF_MONTH)).show()
            }
        }
        dialog.show()
    }

    @Suppress("DEPRECATION")
    private fun legacyStatusBar() { window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 11 && grantResults.firstOrNull() == android.content.pm.PackageManager.PERMISSION_GRANTED) toggleConnection()
        if (requestCode == 12 && CareConnectionService.running) startForegroundService(Intent(this, CareConnectionService::class.java))
    }
}