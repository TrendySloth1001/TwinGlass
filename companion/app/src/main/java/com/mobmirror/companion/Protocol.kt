package com.mobmirror.companion

import java.io.DataInputStream

/**
 * Stream framing shared with the Mac (src/main/mac-screen.ts), big-endian:
 * u8 type (0 config JSON, 1 key frame, 2 delta frame), f64 timestamp (µs, Mac wall clock at
 * capture), u32 length, then `length` bytes of H.264 Annex-B (SPS/PPS inline in key frames).
 */
class Frame(val type: Int, val timestampUs: Double, val data: ByteArray)

fun DataInputStream.readFrame(): Frame {
    val type = readUnsignedByte()
    val ts = readDouble()
    val len = readInt()
    require(len in 0..(64 shl 20)) { "bad frame length $len" }
    val data = ByteArray(len)
    readFully(data)
    return Frame(type, ts, data)
}
