package com.mobmirror.companion.direct

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

/** Same fixed vectors as the Mac (test/direct-protocol.test.ts): both sides must agree byte for byte. */
class DirectCryptoTest {
    private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }

    @Test
    fun vectorsMatchTheMac() {
        val k = DirectCrypto.pairKey(ByteArray(32) { 7 }, "482913")
        val secret = DirectCrypto.pairSecret(k)
        val (up, down) = DirectCrypto.sessionKeys(secret, ByteArray(16) { 1 }, ByteArray(16) { 2 })
        assertEquals("f2be4920cb5f6e9fd02a5aeba268f1f4c7577a3222204e94ea829ee694c444d1", hex(k))
        assertEquals("07c2e9a6126fe7de2cc1666250f4a873e5b5be1d762dd3a7e4785a5865d55476", hex(secret))
        assertEquals("c4fe81fed89a218f2c2a7a0100370277baf883948f00369c6f2417499c4edf0b", hex(up))
        assertEquals("5cbb92621a11ed1d846245f7c6d1fdfb3e8553bbf6c5e0316022c3e1e768d2e8", hex(down))
        assertEquals("74a864d00940bde2822dbebaad416c57c5d94a79330c59d7e30b4a58b33e5c5a", hex(DirectCrypto.hmac(k, "phone".toByteArray())))
        val frame = DirectCrypto.Sealer(up).seal(DirectCrypto.KIND_JSON, """{"t":"ping"}""".toByteArray())
        assertEquals("0000002900000000000000000000000055d3be7a2c0d93b0cc0c498d15f5a556879db1f5dc691d123cd0332a0f", hex(frame))
    }

    @Test
    fun sealOpenRoundTripAndEcdhAgree() {
        val key = ByteArray(32) { 9 }
        val f = DirectCrypto.Sealer(key).seal(DirectCrypto.KIND_VIDEO, byteArrayOf(1, 2, 3))
        val (kind, payload) = DirectCrypto.Opener(key).open(f.copyOfRange(4, f.size))
        assertEquals(DirectCrypto.KIND_VIDEO, kind)
        assertArrayEquals(byteArrayOf(1, 2, 3), payload)
        val a = DirectCrypto.newKeyPair()
        val b = DirectCrypto.newKeyPair()
        assertArrayEquals(DirectCrypto.sharedX(a, DirectCrypto.publicPoint(b)), DirectCrypto.sharedX(b, DirectCrypto.publicPoint(a)))
        assertEquals(65, DirectCrypto.publicPoint(a).size)
    }
}
