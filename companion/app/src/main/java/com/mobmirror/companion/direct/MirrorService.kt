package com.mobmirror.companion.direct

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.view.Display
import com.mobmirror.companion.MainActivity
import com.mobmirror.companion.Prefs
import com.mobmirror.companion.R
import org.json.JSONObject
import java.nio.ByteBuffer
import kotlin.concurrent.thread
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * "Mirror to Mac" without developer mode: Android's screen capture (MediaProjection, the user
 * allows it each time) → hardware H.264 encoder → the Mac over the encrypted direct link, framed
 * exactly like scrcpy's video stream so the Mac's mirror pipeline is unchanged. Control messages
 * from the Mac are turned into touches / keys by [DirectInput] (accessibility).
 */
class MirrorService : Service(), DirectLink.Listener {
    companion object {
        const val EXTRA_CODE = "code"
        const val EXTRA_DATA = "data"
        const val ACTION_STOP = "com.mobmirror.companion.STOP_MIRROR"
        private const val CHANNEL = "mirror"
        private const val MAX_SIDE = 1600
        private const val CODEC_H264 = 0x68323634
        private const val FLAG_CONFIG = 1L shl 62
        private const val FLAG_KEY = 1L shl 61

        @Volatile var running = false
            private set

        /** Listeners for the UI (state text). */
        @Volatile var status: String = ""
            private set
        var onStatus: ((String) -> Unit)? = null
    }

    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var encoder: MediaCodec? = null
    private var session: DirectLink.Session? = null
    private var input: DirectInput? = null
    private val worker = HandlerThread("twinglass-mirror").apply { start() }
    private val handler = Handler(worker.looper)
    @Volatile private var streaming = false
    @Volatile private var size = 0 to 0
    private var displayListener: DisplayManager.DisplayListener? = null

    override fun onBind(intent: Intent?): IBinder? = null

    private fun setStatus(s: String) {
        status = s
        onStatus?.invoke(s)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopAll("Stopped")
            return START_NOT_STICKY
        }
        // Android 14+: the foreground service (type mediaProjection) must run before getMediaProjection.
        startForeground(1, notification("Connecting to your Mac…"), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        running = true
        val code = intent?.getIntExtra(EXTRA_CODE, 0) ?: 0
        @Suppress("DEPRECATION")
        val data: Intent? = if (Build.VERSION.SDK_INT >= 33) intent?.getParcelableExtra(EXTRA_DATA, Intent::class.java) else intent?.getParcelableExtra(EXTRA_DATA)
        if (data == null) { stopAll("No permission to share the screen"); return START_NOT_STICKY }
        val mpm = getSystemService(MediaProjectionManager::class.java)
        projection = mpm.getMediaProjection(code, data).apply {
            registerCallback(object : MediaProjection.Callback() {
                override fun onStop() = stopAll("Screen sharing ended")
            }, handler)
        }
        thread {
            try {
                setStatus("Connecting…")
                val s = DirectLink.open(this, this)
                session = s
                input = DirectInput(this)
                s.json(JSONObject().put("t", "offer").put("codec", "h264"))
                setStatus("Waiting for ${s.macName}…")
                updateNotification("Sharing with ${s.macName}")
            } catch (e: Exception) {
                stopAll(e.message ?: "Couldn’t reach your Mac")
            }
        }
        return START_NOT_STICKY
    }

    // ---- link events ----

    override fun onJson(msg: JSONObject) {
        when (msg.optString("t")) {
            "go" -> handler.post { startStream() }
            "stop" -> stopAll("Stopped on the Mac")
            "forget" -> stopAll("This Mac forgot the phone")
        }
    }

    override fun onControl(msg: ByteArray) {
        if (msg.isNotEmpty() && msg[0].toInt() == 17) { // RESET_VIDEO: a new keyframe now
            encoder?.setParameters(Bundle().apply { putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0) })
            return
        }
        input?.handle(msg, size)
    }

    override fun onClosed(error: String?) {
        if (running) stopAll(error ?: "Disconnected from the Mac")
    }

    // ---- capture + encode ----

    /** Screen size scaled so the long side is at most MAX_SIDE, both multiples of 8 (like scrcpy). */
    private fun captureSize(): Triple<Int, Int, Int> {
        val wm = getSystemService(android.view.WindowManager::class.java)
        val b = wm.maximumWindowMetrics.bounds
        val k = minOf(1.0, MAX_SIDE.toDouble() / max(b.width(), b.height()))
        val w = ((b.width() * k) / 8).roundToInt() * 8
        val h = ((b.height() * k) / 8).roundToInt() * 8
        return Triple(w, h, resources.displayMetrics.densityDpi)
    }

    private fun startStream() {
        val proj = projection ?: return
        val s = session ?: return
        val (w, h, dpi) = captureSize()
        val enc = newEncoder(w, h)
        val surface = enc.createInputSurface()
        enc.start()
        display = proj.createVirtualDisplay("Twinglass", w, h, dpi, DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, surface, null, handler)
        encoder = enc
        size = w to h
        streaming = true
        // scrcpy stream framing: codec id, then a session packet (size), then config / frames.
        s.send(DirectCrypto.KIND_VIDEO, ByteBuffer.allocate(4).putInt(CODEC_H264).array())
        sendSession(w, h)
        setStatus("Mirroring to ${s.macName}")
        updateNotification("Mirroring to ${s.macName}")
        thread(name = "twinglass-encode") { drain(enc) }
        watchRotation()
    }

    private fun newEncoder(w: Int, h: Int): MediaCodec {
        val f = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, w, h).apply {
            setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
            setInteger(MediaFormat.KEY_BIT_RATE, 6_000_000)
            setInteger(MediaFormat.KEY_FRAME_RATE, 60)
            setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 10)
            setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 100_000)
            setInteger(MediaFormat.KEY_PRIORITY, 0) // realtime
            if (Build.VERSION.SDK_INT >= 30) setInteger(MediaFormat.KEY_LATENCY, 1)
        }
        return MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_VIDEO_AVC).apply { configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE) }
    }

    private fun sendSession(w: Int, h: Int) {
        val b = ByteBuffer.allocate(12)
        b.put(0, 0x80.toByte())
        b.putInt(4, w)
        b.putInt(8, h)
        session?.send(DirectCrypto.KIND_VIDEO, b.array())
    }

    private fun drain(enc: MediaCodec) {
        val info = MediaCodec.BufferInfo()
        try {
            while (streaming && encoder === enc) {
                val i = enc.dequeueOutputBuffer(info, 100_000)
                if (i < 0) continue
                val buf = enc.getOutputBuffer(i)
                if (buf != null && info.size > 0) {
                    val config = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                    val key = info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME != 0
                    val header = if (config) FLAG_CONFIG else (info.presentationTimeUs and (FLAG_KEY - 1)) or (if (key) FLAG_KEY else 0L)
                    val pkt = ByteArray(12 + info.size)
                    ByteBuffer.wrap(pkt).putLong(header).putInt(info.size)
                    buf.position(info.offset)
                    buf.get(pkt, 12, info.size)
                    session?.send(DirectCrypto.KIND_VIDEO, pkt)
                }
                enc.releaseOutputBuffer(i, false)
            }
        } catch (e: Exception) {
            if (streaming && encoder === enc) stopAll("Encoder stopped: ${e.message}")
        }
    }

    /** Rotation: a new size → new encoder on the same virtual display + a new session packet. */
    private fun watchRotation() {
        val dm = getSystemService(DisplayManager::class.java)
        val l = object : DisplayManager.DisplayListener {
            override fun onDisplayAdded(id: Int) {}
            override fun onDisplayRemoved(id: Int) {}
            override fun onDisplayChanged(id: Int) {
                if (id != Display.DEFAULT_DISPLAY || !streaming) return
                val (w, h, dpi) = captureSize()
                if (w to h == size) return
                val old = encoder ?: return
                val enc = newEncoder(w, h)
                val surface = enc.createInputSurface()
                enc.start()
                encoder = enc
                display?.resize(w, h, dpi)
                display?.surface = surface
                size = w to h
                sendSession(w, h)
                thread(name = "twinglass-encode") { drain(enc) }
                runCatching { old.stop(); old.release() }
            }
        }
        displayListener = l
        dm.registerDisplayListener(l, handler)
    }

    // ---- teardown ----

    private fun stopAll(reason: String) {
        if (!running && projection == null) return
        running = false
        streaming = false
        Prefs.log(this, "direct: mirror stopped: $reason")
        displayListener?.let { getSystemService(DisplayManager::class.java).unregisterDisplayListener(it) }
        displayListener = null
        runCatching { session?.json(JSONObject().put("t", "stopped")) }
        session?.close()
        session = null
        runCatching { display?.release() }
        display = null
        runCatching { encoder?.stop(); encoder?.release() }
        encoder = null
        runCatching { projection?.stop() }
        projection = null
        setStatus(reason)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        stopAll("Stopped")
        worker.quitSafely()
        super.onDestroy()
    }

    // ---- notification ----

    private fun notification(text: String): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Mirroring to Mac", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shown while this phone’s screen is shared with your Mac."
            })
        }
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, MirrorService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("Twinglass")
            .setContentText(text)
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, "Stop", stop).build())
            .build()
    }

    private fun updateNotification(text: String) {
        getSystemService(NotificationManager::class.java).notify(1, notification(text))
    }
}

/** Starts the mirror after Android's screen-sharing consent (from MainActivity's result). */
fun startMirror(ctx: Context, resultCode: Int, data: Intent) {
    ctx.startForegroundService(Intent(ctx, MirrorService::class.java).putExtra(MirrorService.EXTRA_CODE, resultCode).putExtra(MirrorService.EXTRA_DATA, data))
}
