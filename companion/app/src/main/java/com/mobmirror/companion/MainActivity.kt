package com.mobmirror.companion

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import kotlin.concurrent.thread

/**
 * Home screen: connection to the Mac, and buttons to start sharing from the phone
 * ("connect back to my Mac") without touching the Mac.
 */
class MainActivity : Activity() {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var title: TextView
    private lateinit var sub: TextView
    private lateinit var dot: View
    private lateinit var mirrorBtn: Button
    private lateinit var extendBtn: Button
    private lateinit var openBtn: Button
    private lateinit var stopBtn: Button
    private var polling = false

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun button(label: String, primary: Boolean, onClick: () -> Unit) = Button(this).apply {
        text = label
        isAllCaps = false
        textSize = 16f
        setTextColor(if (primary) Color.WHITE else Color.parseColor("#E6E6E6"))
        background = GradientDrawable().apply {
            cornerRadius = dp(14).toFloat()
            setColor(if (primary) Color.parseColor("#2B6CFF") else Color.parseColor("#1E1E20"))
            if (!primary) setStroke(dp(1), Color.parseColor("#2E2E32"))
        }
        setPadding(dp(16), dp(14), dp(16), dp(14))
        layoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) }
        setOnClickListener { onClick() }
    }

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
        title = TextView(this).apply { textSize = 22f; setTextColor(Color.WHITE); text = "Mob Mirror" }
        header.addView(dot); header.addView(title)
        sub = TextView(this).apply { textSize = 14f; setTextColor(Color.parseColor("#9A9AA0")); setPadding(0, dp(6), 0, dp(18)) }
        root.addView(header); root.addView(sub)

        mirrorBtn = button("Show Mac screen", true) { act("Asking your Mac…") { Link.start(this, "mirror") } }
        extendBtn = button("Use as second display", false) { act("Asking your Mac…") { Link.start(this, "extend") } }
        openBtn = button("Open viewer", true) { act(null) { Link.open(this) } }
        stopBtn = button("Stop sharing", false) { act("Stopping…") { Link.stop(this) } }
        listOf(mirrorBtn, extendBtn, openBtn, stopBtn).forEach(root::addView)
        root.addView(TextView(this).apply {
            textSize = 12f; setTextColor(Color.parseColor("#6E6E74")); setPadding(0, dp(24), 0, 0)
            text = "Works while the phone is linked to the Mac by USB or wireless debugging and Mob Mirror is open."
        })
        setContentView(root)
    }

    /** Runs a link request off the main thread, then refreshes the status. */
    private fun act(toast: String?, call: () -> Boolean) {
        toast?.let { Toast.makeText(this, it, Toast.LENGTH_SHORT).show() }
        thread {
            val ok = call()
            main.post {
                if (!ok) Toast.makeText(this, "Couldn’t reach Mob Mirror on your Mac.", Toast.LENGTH_LONG).show()
                refresh()
            }
        }
    }

    override fun onResume() {
        super.onResume()
        polling = true
        poll()
    }

    override fun onPause() {
        polling = false
        super.onPause()
    }

    private fun poll() {
        if (!polling) return
        refresh()
        main.postDelayed({ poll() }, 2000)
    }

    private fun refresh() {
        if (!Link.paired(this)) {
            show(null, "Not paired yet. Connect this phone to your Mac by USB with Mob Mirror open: it pairs by itself.")
            return
        }
        thread {
            val s = Link.status(this)
            main.post {
                if (s == null) show(null, "Can’t reach ${Link.macName(this)}. Connect by USB (or wireless debugging) and open Mob Mirror.")
                else show(s, if (s.sharing) "Sharing: ${if (s.mode == "extend") "second display" else "Mac screen"}" else "Connected to ${s.mac}")
            }
        }
    }

    private fun show(s: Link.Status?, text: String) {
        title.text = s?.mac ?: "Mob Mirror"
        sub.text = text
        (dot.background as GradientDrawable).setColor(Color.parseColor(if (s == null) "#6E6E74" else if (s.sharing) "#FF4D4F" else "#34C759"))
        val reachable = s != null
        mirrorBtn.visibility = if (reachable && !s!!.sharing) View.VISIBLE else View.GONE
        extendBtn.visibility = if (reachable && !s!!.sharing) View.VISIBLE else View.GONE
        openBtn.visibility = if (reachable && s!!.sharing) View.VISIBLE else View.GONE
        stopBtn.visibility = if (reachable && s!!.sharing) View.VISIBLE else View.GONE
    }
}
