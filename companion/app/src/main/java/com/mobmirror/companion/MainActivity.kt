package com.mobmirror.companion

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView

/** Launcher screen: the app is driven from Mob Mirror on the Mac, so this just explains that. */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.BLACK)
            setPadding(pad, pad, pad, pad)
        }
        layout.addView(TextView(this).apply {
            text = "Mob Mirror"
            textSize = 26f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        })
        layout.addView(TextView(this).apply {
            text = "Connect this phone to your Mac, then in Mob Mirror choose\n“Show Mac screen on phone” (⌥⌘P) or\n“Use phone as a second display” (⇧⌥⌘P).\n\nThis app opens by itself."
            textSize = 15f
            setTextColor(Color.parseColor("#AAAAAA"))
            gravity = Gravity.CENTER
            setPadding(0, pad, 0, 0)
        })
        setContentView(layout)
    }
}
