package tw.picocare.app

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.os.Build
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

object UiBits {
    val green = 0xFF1C5846.toInt()
    val greenDark = 0xFF124032.toInt()
    val ink = 0xFF22332B.toInt()
    val body = 0xFF3E5046.toInt()
    val muted = 0xFF6C7C70.toInt()
    val faint = 0xFF88968A.toInt()
    val rust = 0xFFA84224.toInt()
    val paper = 0xFFF4F6F0.toInt()
    val surface = Color.WHITE
    val surfaceSubtle = 0xFFF7F9F4.toInt()
    val cardBorder = 0xFFDEE6D8.toInt()
    val warm = 0xFFFEF9EC.toInt()
    val warmBorder = 0xFFECDAAe.toInt()
    val sage = 0xFFE7EFE1.toInt()
    val sageBorder = 0xFFCCDCCA.toInt()
    val amber = 0xFFA46A14.toInt()
    val pillAmber = 0xFFFAF0DA.toInt()
    val pillBlush = 0xFFFAE8E1.toInt()
    val pillMist = 0xFFEBEFE9.toInt()

    fun dp(context: Context, value: Int) = (value * context.resources.displayMetrics.density).toInt()

    fun rounded(
        context: Context,
        fill: Int,
        radiusDp: Int = 18,
        strokeColor: Int = 0,
        strokeWidthDp: Int = 1
    ) = GradientDrawable().apply {
        setColor(fill)
        cornerRadius = dp(context, radiusDp).toFloat()
        if (strokeColor != 0) setStroke(dp(context, strokeWidthDp).coerceAtLeast(1), strokeColor)
    }

    fun rippleButtonBg(
        context: Context,
        fill: Int,
        rippleColor: Int,
        radiusDp: Int = 14,
        strokeColor: Int = 0
    ): RippleDrawable {
        val content = rounded(context, fill, radiusDp, strokeColor)
        val mask = rounded(context, Color.WHITE, radiusDp)
        return RippleDrawable(ColorStateList.valueOf(rippleColor), content, mask)
    }

    fun styleButton(
        button: Button,
        primary: Boolean = false,
        tonal: Boolean = !primary,
        compact: Boolean = false
    ) {
        val ctx = button.context
        button.isAllCaps = false
        button.stateListAnimator = null
        button.elevation = 0f
        button.minWidth = 0
        button.minimumWidth = 0
        val minH = dp(ctx, if (compact) 46 else 52)
        button.minHeight = minH
        button.minimumHeight = minH
        button.gravity = Gravity.CENTER
        button.textSize = if (compact) 15.5f else 16.5f
        button.setTypeface(null, Typeface.BOLD)
        val padH = dp(ctx, if (compact) 16 else 18)
        val padV = dp(ctx, if (compact) 10 else 12)
        button.setPadding(padH, padV, padH, padV)
        val radius = if (compact) 12 else 14
        when {
            primary -> {
                button.setTextColor(Color.WHITE)
                button.background = rippleButtonBg(ctx, green, greenDark, radius)
            }
            tonal -> {
                button.setTextColor(green)
                button.background = rippleButtonBg(ctx, sage, sageBorder, radius, sageBorder)
            }
            else -> {
                button.setTextColor(ink)
                button.background = rippleButtonBg(ctx, surfaceSubtle, cardBorder, radius, cardBorder)
            }
        }
    }

    fun styleInput(input: EditText, topMarginDp: Int = 10) {
        val ctx = input.context
        input.textSize = 16f
        input.setTextColor(ink)
        input.setHintTextColor(faint)
        input.background = rounded(ctx, surfaceSubtle, 12, sageBorder)
        input.setPadding(dp(ctx, 14), dp(ctx, 12), dp(ctx, 14), dp(ctx, 12))
        input.layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(ctx, topMarginDp) }
    }

    fun pill(context: Context, text: String, fg: Int, bg: Int): TextView = TextView(context).apply {
        this.text = text
        textSize = 12.5f
        isSingleLine = true
        setTypeface(null, Typeface.BOLD)
        setTextColor(fg)
        setPadding(dp(context, 12), dp(context, 5), dp(context, 12), dp(context, 5))
        background = rounded(context, bg, 14)
        layoutParams = LinearLayout.LayoutParams(-2, -2).apply {
            rightMargin = dp(context, 6)
            topMargin = dp(context, 3)
            bottomMargin = dp(context, 3)
        }
    }

    fun pillContainer(context: Context): ViewGroup = WrapLayout(context, dp(context, 6), dp(context, 6)).apply {
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(context, 6); bottomMargin = dp(context, 2) }
    }

    fun avatar(context: Context, name: String, fg: Int, bg: Int): TextView = TextView(context).apply {
        text = name.firstOrNull()?.toString() ?: "?"
        textSize = 19f
        setTypeface(null, Typeface.BOLD)
        setTextColor(fg)
        gravity = Gravity.CENTER
        val s = dp(context, 46)
        background = GradientDrawable().apply {
            setColor(bg)
            shape = GradientDrawable.OVAL
            setStroke(dp(context, 1).coerceAtLeast(1), sageBorder)
        }
        layoutParams = LinearLayout.LayoutParams(s, s).apply { rightMargin = dp(context, 12) }
    }

    fun applyWindowInsets(target: View, leftDp: Int = 0, topDp: Int = 0, rightDp: Int = 0, bottomDp: Int = 0) {
        val ctx = target.context
        val bL = dp(ctx, leftDp)
        val bT = dp(ctx, topDp)
        val bR = dp(ctx, rightDp)
        val bB = dp(ctx, bottomDp)
        target.setPadding(bL, bT, bR, bB)
        target.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val sys = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                v.setPadding(bL + sys.left, bT + sys.top, bR + sys.right, bB + sys.bottom)
            } else {
                @Suppress("DEPRECATION")
                v.setPadding(
                    bL + insets.systemWindowInsetLeft,
                    bT + insets.systemWindowInsetTop,
                    bR + insets.systemWindowInsetRight,
                    bB + insets.systemWindowInsetBottom
                )
            }
            insets
        }
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

    class WrapLayout(context: Context, private val hSpacing: Int, private val vSpacing: Int) : ViewGroup(context) {
        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            val maxWidth = MeasureSpec.getSize(widthMeasureSpec) - paddingLeft - paddingRight
            val mode = MeasureSpec.getMode(widthMeasureSpec)
            var lineWidth = 0
            var lineHeight = 0
            var totalHeight = paddingTop + paddingBottom
            var maxLineWidth = 0
            for (i in 0 until childCount) {
                val child = getChildAt(i)
                if (child.visibility == View.GONE) continue
                measureChild(child, widthMeasureSpec, heightMeasureSpec)
                val cw = child.measuredWidth
                val ch = child.measuredHeight
                if (mode != MeasureSpec.UNSPECIFIED && lineWidth + cw > maxWidth && lineWidth > 0) {
                    totalHeight += lineHeight + vSpacing
                    maxLineWidth = maxOf(maxLineWidth, lineWidth - hSpacing)
                    lineWidth = cw + hSpacing
                    lineHeight = ch
                } else {
                    lineWidth += cw + hSpacing
                    lineHeight = maxOf(lineHeight, ch)
                }
            }
            if (lineHeight > 0) {
                totalHeight += lineHeight
                maxLineWidth = maxOf(maxLineWidth, lineWidth - hSpacing)
            }
            setMeasuredDimension(
                resolveSize(maxLineWidth + paddingLeft + paddingRight, widthMeasureSpec),
                resolveSize(totalHeight, heightMeasureSpec)
            )
        }

        override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
            val maxWidth = (r - l) - paddingRight
            var x = paddingLeft
            var y = paddingTop
            var lineHeight = 0
            for (i in 0 until childCount) {
                val child = getChildAt(i)
                if (child.visibility == View.GONE) continue
                val cw = child.measuredWidth
                val ch = child.measuredHeight
                if (x + cw > maxWidth && x > paddingLeft) {
                    x = paddingLeft
                    y += lineHeight + vSpacing
                    lineHeight = 0
                }
                child.layout(x, y, x + cw, y + ch)
                x += cw + hSpacing
                lineHeight = maxOf(lineHeight, ch)
            }
        }
    }
}
