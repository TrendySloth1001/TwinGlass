package com.mobmirror.companion

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Twinglass on the Mac asks for this phone's details (adb only, DUMP-guarded); sent as JSON to POST /link/info. */
class InfoReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        Thread {
            try {
                val ctx = context.applicationContext
                val json = DeviceInfo.toJson(DeviceInfo.collect(ctx), DeviceInfo.appVersion(ctx))
                Link.post(ctx, "/link/info", "", json.toString().toByteArray())
            } finally {
                pending.finish()
            }
        }.start()
    }
}
