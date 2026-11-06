package com.mobmirror.companion

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import kotlin.concurrent.thread

/** Home screen: whether this phone is paired with and can reach Twinglass on the Mac. */
class MainActivity : Activity() {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var title: TextView
    private lateinit var sub: TextView
    private lateinit var dot: View
    private var polling = false

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0B0B0C"))
            setPadding(dp(24), dp(48), dp(24), dp(24))
        }
        val header = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        dot = View(this).apply {
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.GRAY) }
            layoutParams = LinearLayout.LayoutParams(dp(10), dp(10)).apply { rightMargin = dp(10) }
        }
        title = TextView(this).apply { textSize = 22f; setTextColor(Color.WHITE); text = "Twinglass" }
        header.addView(dot); header.addView(title)
        sub = TextView(this).apply { textSize = 14f; setTextColor(Color.parseColor("#9A9AA0")); setPadding(0, dp(6), 0, dp(18)) }
        root.addView(header); root.addView(sub)
        root.addView(TextView(this).apply {
            textSize = 12f; setTextColor(Color.parseColor("#6E6E74"))
            text = "Mirroring and control run from Twinglass on your Mac. This app pairs by itself over USB."
        })
        setContentView(root)
    }

    override fun onResume() { super.onResume(); polling = true; poll() }
    override fun onPause() { polling = false; super.onPause() }

    private fun poll() {
        if (!polling) return
        refresh()
        main.postDelayed({ poll() }, 3000)
    }

    private fun refresh() {
        if (!Link.paired(this)) { show(null, "Not paired yet. Connect this phone to your Mac by USB with Twinglass open."); return }
        thread {
            val s = Link.status(this)
            main.post {
                if (s == null) show(null, "Can’t reach ${Link.macName(this)}. Connect by USB (or wireless debugging) and open Twinglass.")
                else show(s, "Connected to ${s.mac}")
            }
        }
    }

    private fun show(s: Link.Status?, text: String) {
        title.text = s?.mac ?: "Twinglass"
        sub.text = text
        (dot.background as GradientDrawable).setColor(Color.parseColor(if (s == null) "#6E6E74" else "#34C759"))
    }
}
