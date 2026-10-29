package tw.picocare.app

import android.content.Context
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView

object UiBits {
    fun dp(context: Context, value: Int) = (value * context.resources.displayMetrics.density).toInt()
    fun pill(context: Context, text: String, fg: Int, bg: Int): TextView = TextView(context).apply {
        this.text = text; textSize = 13f; setTypeface(null, Typeface.BOLD); setTextColor(fg)
        setPadding(dp(context, 14), dp(context, 7), dp(context, 14), dp(context, 7))
        background = GradientDrawable().apply { setColor(bg); cornerRadius = dp(context, 20).toFloat() }
        layoutParams = LinearLayout.LayoutParams(-2, -2).apply { rightMargin = dp(context, 8); topMargin = dp(context, 4); bottomMargin = dp(context, 4) }
    }
    fun avatar(context: Context, name: String, fg: Int, bg: Int): TextView = TextView(context).apply {
        text = name.firstOrNull()?.toString() ?: "?"; textSize = 20f; setTypeface(null, Typeface.BOLD); setTextColor(fg); gravity = Gravity.CENTER
        val s = dp(context, 52)
        background = GradientDrawable().apply { setColor(bg); shape = GradientDrawable.OVAL }
        layoutParams = LinearLayout.LayoutParams(s, s).apply { rightMargin = dp(context, 12) }
    }
    fun timelineLabel(kind: String): String = when (kind) {
        "context" -> "手機動態"
        "question_answer" -> "回答問題"
        "checkin" -> "本人報安"
        "help" -> "需要協助"
        "pairing" -> "手機配對"
        "plan" -> "關心設定"
        else -> kind
    }
}
