// Minimal H.265/HEVC Annex-B helpers for configuring WebCodecs (ISO/IEC 14496-15 Annex E codec string).
import { annexBNalUnits } from './h264'

const NAL_SPS = 33

/** HEVC NAL unit type: bits 1..6 of the first header byte. */
export const hevcNalType = (nal: Uint8Array): number => ((nal[0] ?? 0) >> 1) & 0x3f

/** Removes emulation-prevention bytes (00 00 03 -> 00 00) to get the RBSP. */
export function unescapeRbsp(nal: Uint8Array): Uint8Array {
  const out: number[] = []
  let zeros = 0
  for (const b of nal) {
    if (zeros >= 2 && b === 3) {
      zeros = 0
      continue
    }
    out.push(b)
    zeros = b === 0 ? zeros + 1 : 0
  }
  return Uint8Array.from(out)
}

function reverseBits32(v: number): number {
  let r = 0
  for (let i = 0; i < 32; i++) {
    r = (r << 1) | (v & 1)
    v >>>= 1
  }
  return r >>> 0
}

/**
 * "hvc1.<space><profile>.<compat reversed hex>.<L|H><level>.<constraint bytes>" from the SPS in a
 * scrcpy config packet (which also carries VPS and PPS).
 * SPS RBSP layout: 2-byte NAL header, 1 byte (vps id, max_sub_layers, nesting), then
 * profile_tier_level: 1 byte space/tier/profile, 4 bytes compatibility, 6 bytes constraints, 1 byte level.
 */
export function hevcCodecString(config: Uint8Array): string {
  for (const nal of annexBNalUnits(config)) {
    if (hevcNalType(nal) !== NAL_SPS) continue
    const r = unescapeRbsp(nal)
    if (r.length < 15) break
    const ptl = r[3]!
    const space = ['', 'A', 'B', 'C'][ptl >> 6]!
    const tier = (ptl >> 5) & 1 ? 'H' : 'L'
    const profile = ptl & 0x1f
    const compat = ((r[4]! << 24) | (r[5]! << 16) | (r[6]! << 8) | r[7]!) >>> 0
    const constraints = Array.from(r.subarray(8, 14))
    while (constraints.length && constraints[constraints.length - 1] === 0) constraints.pop()
    const level = r[14]!
    const parts = [`hvc1`, `${space}${profile}`, reverseBits32(compat).toString(16).toUpperCase(), `${tier}${level}`]
    for (const c of constraints) parts.push(c.toString(16).toUpperCase().padStart(2, '0'))
    return parts.join('.')
  }
  throw new Error('No SPS found in H.265 config packet')
}
