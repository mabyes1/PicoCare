package tw.picocare.app

import android.content.Context
import org.json.JSONObject

object AppLang {
    const val EN = "en"
    const val ZH = "zh"
    private const val PREFS = "picocare_lang"

    fun get(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("app_lang", EN) ?: EN

    fun isZh(context: Context): Boolean = get(context) == ZH

    fun t(context: Context, en: String, zh: String): String = if (isZh(context)) zh else en

    fun label(context: Context): String = if (isZh(context)) "中文" else "English"

    fun toggle(context: Context): String {
        val next = if (isZh(context)) EN else ZH
        set(context, next)
        return next
    }

    fun set(context: Context, lang: String) {
        val app = context.applicationContext
        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("app_lang", lang).apply()
        CareRuntime.executor.execute {
            runCatching {
                val config = CareConfig(app)
                if (config.paired) CareApi(config).call("/api/lang", JSONObject().put("lang", lang))
            }
            runCatching {
                val session = CareSession(app)
                if (session.ready) CareWebApi(session).post("/api/lang", JSONObject().put("lang", lang))
            }
        }
    }
}
