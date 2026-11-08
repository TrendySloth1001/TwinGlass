package com.mobmirror.companion.direct

import java.io.DataInputStream
import java.io.OutputStream
import java.math.BigInteger
import java.nio.ByteBuffer
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Crypto for the "Wi-Fi, no setup" link (mirror of src/main/direct/protocol.ts on the Mac; the
 * unit test checks the same fixed vectors). P-256 ECDH, HKDF-SHA256, HMAC-SHA256, AES-256-GCM.
 */
object DirectCrypto {
    const val KIND_JSON = 1
    const val KIND_VIDEO = 2
    const val KIND_CONTROL = 3
    const val KIND_DEVICE = 4
    const val MAX_FRAME = 8 * 1024 * 1024

    fun hmac(key: ByteArray, msg: ByteArray): ByteArray = Mac.getInstance("HmacSHA256").run {
        init(SecretKeySpec(key, "HmacSHA256"))
        doFinal(msg)
    }

    /** RFC 5869 HKDF-SHA256. */
    fun hkdf(ikm: ByteArray, salt: ByteArray, info: String, len: Int): ByteArray {
        val prk = hmac(if (salt.isEmpty()) ByteArray(32) else salt, ikm)
        val out = ByteArray(len)
        var t = ByteArray(0)
        var pos = 0
        var i = 1
        while (pos < len) {
            t = hmac(prk, t + info.toByteArray() + byteArrayOf(i.toByte()))
            val n = minOf(t.size, len - pos)
            System.arraycopy(t, 0, out, pos, n)
            pos += n
            i++
        }
        return out
    }

    fun pairKey(sharedX: ByteArray, code: String) = hkdf(sharedX, code.toByteArray(), "twinglass-pair", 32)
    fun pairSecret(key: ByteArray) = hkdf(key, ByteArray(0), "twinglass-secret", 32)

    /** first: phone → Mac key, second: Mac → phone key. */
    fun sessionKeys(secret: ByteArray, phoneNonce: ByteArray, macNonce: ByteArray): Pair<ByteArray, ByteArray> {
        val k = hkdf(secret, phoneNonce + macNonce, "twinglass-session", 64)
        return k.copyOfRange(0, 32) to k.copyOfRange(32, 64)
    }

    fun equal(a: ByteArray, b: ByteArray) = MessageDigest.isEqual(a, b)

    // ---- P-256 ECDH with uncompressed points (0x04 ‖ x ‖ y), like Node's createECDH('prime256v1') ----

    fun newKeyPair(): KeyPair = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()

    private fun fixed32(n: BigInteger): ByteArray {
        val b = n.toByteArray()
        return when {
            b.size == 32 -> b
            b.size > 32 -> b.copyOfRange(b.size - 32, b.size)
            else -> ByteArray(32 - b.size) + b
        }
    }

    fun publicPoint(kp: KeyPair): ByteArray {
        val w = (kp.public as ECPublicKey).w
        return byteArrayOf(4) + fixed32(w.affineX) + fixed32(w.affineY)
    }

    /** ECDH shared secret (the x-coordinate, 32 bytes), with the peer's uncompressed point. */
    fun sharedX(kp: KeyPair, peerPoint: ByteArray): ByteArray {
        require(peerPoint.size == 65 && peerPoint[0] == 4.toByte()) { "bad public key" }
        val params = (kp.public as ECPublicKey).params
        val point = ECPoint(BigInteger(1, peerPoint.copyOfRange(1, 33)), BigInteger(1, peerPoint.copyOfRange(33, 65)))
        val peer = KeyFactory.getInstance("EC").generatePublic(ECPublicKeySpec(point, params))
        return KeyAgreement.getInstance("ECDH").run {
            init(kp.private)
            doPhase(peer, true)
            generateSecret()
        }
    }

    // ---- framing ----

    private fun iv(counter: Long): ByteArray = ByteBuffer.allocate(12).putInt(0).putLong(counter).array()

    /** One direction of an encrypted session (own key and counter). Thread-safe sealing. */
    class Sealer(private val key: ByteArray) {
        private var counter = 0L

        /** u32 length ‖ IV ‖ AES-GCM([kind] ‖ payload) ‖ tag. */
        @Synchronized
        fun seal(kind: Int, payload: ByteArray, off: Int = 0, len: Int = payload.size): ByteArray {
            val n = counter++
            val plain = ByteArray(1 + len)
            plain[0] = kind.toByte()
            System.arraycopy(payload, off, plain, 1, len)
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv(n)))
            val body = c.doFinal(plain)
            return ByteBuffer.allocate(16 + body.size).putInt(12 + body.size).put(iv(n)).put(body).array()
        }
    }

    class Opener(private val key: ByteArray) {
        private var counter = 0L

        /** body = IV ‖ ciphertext ‖ tag. Returns kind and payload; throws on tampering / wrong order. */
        fun open(body: ByteArray): Pair<Int, ByteArray> {
            require(body.size >= 12 + 1 + 16) { "short frame" }
            val n = ByteBuffer.wrap(body, 4, 8).long
            require(n == counter) { "unexpected frame counter" }
            counter++
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, body.copyOfRange(0, 12)))
            val plain = c.doFinal(body, 12, body.size - 12)
            return (plain[0].toInt() and 0xff) to plain.copyOfRange(1, plain.size)
        }
    }

    fun readFrame(input: DataInputStream): ByteArray {
        val len = input.readInt()
        require(len in 0..MAX_FRAME) { "frame too large" }
        return ByteArray(len).also { input.readFully(it) }
    }

    fun writePlain(out: OutputStream, json: String) {
        val b = json.toByteArray()
        out.write(ByteBuffer.allocate(4).putInt(b.size).array())
        out.write(b)
        out.flush()
    }
}
