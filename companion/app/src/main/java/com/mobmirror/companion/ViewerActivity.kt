package com.mobmirror.companion

import android.app.Activity
import android.graphics.Color
import android.media.MediaCodec
import android.media.MediaFormat
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.Gravity
import android.view.MotionEvent
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.DataInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.min

/**
 * Shows the Mac's screen (or the phone-as-second-display) full screen, decoded with MediaCodec in
 * low-latency mode, and turns touches into Mac mouse events (tap = click, drag = drag,
 * long press = right click, two fingers = scroll).
 */
class ViewerActivity : Activity(), SurfaceHolder.Callback {
    private lateinit var base: String // http://localhost:PORT
    private lateinit var token: String
    private lateinit var surface: SurfaceView
    private lateinit var hud: TextView
    private val main = Handler(Looper.getMainLooper())

    @Volatile private var running = false
    @Volatile private var codec: MediaCodec? = null
    @Volatile private var videoW = 0
    @Volatile private var videoH = 0

    // Latency: Mac clock offset (NTP-style) and per-frame samples.
    @Volatile private var offsetMs: Double? = null
    @Volatile private var rttMs: Double? = null
    private val lat = java.util.Collections.synchronizedList(ArrayList<Double>())
    @Volatile private var frames = 0

    private val input = LinkedBlockingQueue<String>()

    private fun wallMs(): Double = System.currentTimeMillis() + (SystemClock.elapsedRealtimeNanos() % 1_000_000) / 1e6

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val uri: Uri = intent?.data ?: run { finish(); return }
        base = "${uri.scheme}://${uri.authority}"
        token = uri.getQueryParameter("t") ?: ""
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        surface = SurfaceView(this)
        surface.holder.addCallback(this)
        hud = TextView(this).apply {
            setTextColor(Color.WHITE)
            textSize = 12f
            setBackgroundColor(Color.parseColor("#B3141414"))
            setPadding(24, 10, 24, 10)
            text = "Connecting to your Mac…"
        }
        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        root.addView(surface, FrameLayout.LayoutParams(-1, -1, Gravity.CENTER))
        root.addView(hud, FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply { bottomMargin = 24 })
        setContentView(root)
        surface.setOnTouchListener { _, e -> onTouch(e); true }
        immersive()
    }

    private fun immersive() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.insetsController?.let {
                it.hide(WindowInsets.Type.systemBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        }
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        running = true
        thread(name = "stream") { streamLoop(holder) }
        thread(name = "input") { inputLoop() }
        thread(name = "clock") { clockLoop() }
        thread(name = "stats") { statsLoop() }
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) = fitSurface()
    override fun surfaceDestroyed(holder: SurfaceHolder) = stopAll()
    override fun onDestroy() { stopAll(); super.onDestroy() }

    private fun stopAll() {
        running = false
        codec?.let { runCatching { it.stop(); it.release() } }
        codec = null
    }

    private fun say(t: String) = main.post { hud.text = t }

    // ---- video ----

    private fun streamLoop(holder: SurfaceHolder) {
        try {
            val c = URL("$base/stream?t=$token").openConnection() as HttpURLConnection
            c.connectTimeout = 5000
            c.readTimeout = 0
            if (c.responseCode != 200) { say("Not allowed (${c.responseCode}). Start again from the Mac."); return }
            val inp = DataInputStream(BufferedInputStream(c.inputStream, 1 shl 16))
            var needKey = true
            while (running) {
                val f = inp.readFrame()
                when (f.type) {
                    0 -> {
                        val cfg = JSONObject(String(f.data))
                        configure(holder, cfg.getInt("width"), cfg.getInt("height"))
                        needKey = true
                    }
                    1, 2 -> {
                        val dec = codec ?: continue
                        if (f.type == 1) needKey = false
                        if (needKey) continue
                        val idx = dec.dequeueInputBuffer(20_000)
                        if (idx < 0) { needKey = true; continue } // decoder behind: skip to the next key frame
                        val buf = dec.getInputBuffer(idx) ?: continue
                        buf.clear()
                        buf.put(f.data)
                        dec.queueInputBuffer(idx, 0, f.data.size, f.timestampUs.toLong(), if (f.type == 1) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0)
                    }
                }
            }
        } catch (e: Exception) {
            if (running) say("The Mac stopped sharing (${e.message ?: e.javaClass.simpleName}).")
        }
    }

    private fun configure(holder: SurfaceHolder, w: Int, h: Int) {
        codec?.let { runCatching { it.stop(); it.release() } }
        videoW = w; videoH = h
        main.post { fitSurface() }
        val fmt = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h).apply {
            if (Build.VERSION.SDK_INT >= 30) setInteger(MediaFormat.KEY_LOW_LATENCY, 1)
            setInteger(MediaFormat.KEY_PRIORITY, 0) // realtime
            setInteger(MediaFormat.KEY_OPERATING_RATE, Short.MAX_VALUE.toInt())
        }
        val dec = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
        dec.configure(fmt, holder.surface, null, 0)
        dec.start()
        codec = dec
        thread(name = "render") { renderLoop(dec) }
    }

    /** Render each decoded frame immediately (no presentation-time pacing: lowest latency). */
    private fun renderLoop(dec: MediaCodec) {
        val info = MediaCodec.BufferInfo()
        while (running && codec === dec) {
            val idx = try { dec.dequeueOutputBuffer(info, 20_000) } catch (_: Exception) { break }
            if (idx >= 0) {
                dec.releaseOutputBuffer(idx, true)
                frames++
                offsetMs?.let { lat.add(wallMs() + it - info.presentationTimeUs / 1000.0) }
            }
        }
    }

    /** Keep the video's aspect: size the SurfaceView to fit (letterbox). */
    private fun fitSurface() {
        val parent = surface.parent as? View ?: return
        if (videoW == 0 || parent.width == 0) return
        val s = min(parent.width.toFloat() / videoW, parent.height.toFloat() / videoH)
        surface.layoutParams = FrameLayout.LayoutParams((videoW * s).toInt(), (videoH * s).toInt(), Gravity.CENTER)
    }

    // ---- clock sync + latency stats (same report as the browser viewer) ----

    private fun clockLoop() {
        while (running) {
            try {
                var best: Pair<Double, Double>? = null
                repeat(8) {
                    val t0 = wallMs()
                    val c = URL("$base/time?t=$token").openConnection() as HttpURLConnection
                    val now = JSONObject(c.inputStream.bufferedReader().readText()).getDouble("now")
                    val t1 = wallMs()
                    if (best == null || t1 - t0 < best!!.first) best = (t1 - t0) to (now - (t0 + t1) / 2)
                }
                rttMs = best!!.first; offsetMs = best!!.second
            } catch (_: Exception) { }
            Thread.sleep(10_000)
        }
    }

    private fun statsLoop() {
        while (running) {
            Thread.sleep(2000)
            val s: List<Double>
            synchronized(lat) { s = lat.sorted(); lat.clear() }
            val fps = frames / 2; frames = 0
            if (s.isEmpty()) continue
            val p50 = s[s.size / 2]; val p95 = s[min(s.size - 1, (s.size * 0.95).toInt())]
            say("${p50.toInt()} ms · $fps fps")
            runCatching {
                val c = URL("$base/stats?t=$token").openConnection() as HttpURLConnection
                c.requestMethod = "POST"; c.doOutput = true
                val j = JSONObject().put("p50", p50).put("p95", p95).put("min", s.first()).put("max", s.last())
                    .put("fps", fps * 2).put("rtt", rttMs ?: -1.0).put("samples", s.size).put("w", videoW).put("h", videoH)
                    .put("client", "companion")
                c.outputStream.use { it.write(j.toString().toByteArray()) }
                c.responseCode
            }
        }
    }

    // ---- touch -> Mac mouse ----

    private var downAt = 0L
    private var downX = 0f
    private var downY = 0f
    private var dragging = false
    private var twoFinger = false
    private var lastScrollY = 0f
    private var lastScrollX = 0f
    private val longPress = Runnable {
        if (!dragging && !twoFinger) { send("down", downX, downY, 1); send("up", downX, downY, 1) } // right click
        downAt = 0
    }

    private fun norm(x: Float, y: Float): Pair<Double, Double> =
        (x / surface.width.coerceAtLeast(1)).toDouble() to (y / surface.height.coerceAtLeast(1)).toDouble()

    private fun send(t: String, x: Float, y: Float, b: Int = 0) {
        val (nx, ny) = norm(x, y)
        input.offer("""{"t":"$t","x":${"%.5f".format(nx)},"y":${"%.5f".format(ny)},"b":$b}""")
    }

    private fun onTouch(e: MotionEvent) {
        val slop = 12 * resources.displayMetrics.density
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downAt = SystemClock.uptimeMillis(); downX = e.x; downY = e.y
                dragging = false; twoFinger = false
                send("move", e.x, e.y)
                main.postDelayed(longPress, 500)
            }
            MotionEvent.ACTION_POINTER_DOWN -> {
                twoFinger = true; main.removeCallbacks(longPress)
                lastScrollY = (e.getY(0) + e.getY(1)) / 2; lastScrollX = (e.getX(0) + e.getX(1)) / 2
            }
            MotionEvent.ACTION_MOVE -> {
                if (twoFinger && e.pointerCount >= 2) {
                    val y = (e.getY(0) + e.getY(1)) / 2; val x = (e.getX(0) + e.getX(1)) / 2
                    val dy = (y - lastScrollY).toInt(); val dx = (x - lastScrollX).toInt()
                    if (abs(dy) >= 2 || abs(dx) >= 2) {
                        input.offer("""{"t":"scroll","dx":$dx,"dy":$dy}"""); lastScrollY = y; lastScrollX = x
                    }
                } else if (!twoFinger && downAt != 0L) {
                    if (!dragging && hypot(e.x - downX, e.y - downY) > slop) {
                        dragging = true; main.removeCallbacks(longPress)
                        send("down", downX, downY)
                    }
                    if (dragging) send("drag", e.x, e.y)
                }
            }
            MotionEvent.ACTION_UP -> {
                main.removeCallbacks(longPress)
                if (twoFinger) { twoFinger = false }
                else if (dragging) send("up", e.x, e.y)
                else if (downAt != 0L) { send("down", downX, downY); send("up", downX, downY) } // tap = click
                dragging = false; downAt = 0
            }
            MotionEvent.ACTION_CANCEL -> { main.removeCallbacks(longPress); if (dragging) send("up", e.x, e.y); dragging = false }
        }
    }

    /** Batches events (≤ every 8 ms) into one keep-alive POST: drags stay smooth without flooding. */
    private fun inputLoop() {
        while (running) {
            val first = input.poll(250, TimeUnit.MILLISECONDS) ?: continue
            Thread.sleep(8)
            val batch = StringBuilder(first)
            while (true) { val n = input.poll() ?: break; batch.append('\n').append(n) }
            runCatching {
                val c = URL("$base/input?t=$token").openConnection() as HttpURLConnection
                c.requestMethod = "POST"; c.doOutput = true
                c.outputStream.use { it.write(batch.toString().toByteArray()) }
                c.responseCode
            }
        }
    }
}
