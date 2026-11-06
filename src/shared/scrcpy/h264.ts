// Minimal H.264 Annex-B helpers for configuring WebCodecs.

/** Yields NAL unit payloads (without start codes) from an Annex-B buffer. */
export function* annexBNalUnits(data: Uint8Array): Generator<Uint8Array> {
  let i = 0
  let start = -1
  while (i + 2 < data.length) {
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
      if (start >= 0) yield trimTrailingZero(data.subarray(start, i))
      i += 3
      start = i
    } else {
      i++
    }
  }
  if (start >= 0 && start < data.length) yield data.subarray(start)
}

// A 4-byte start code (00 00 00 01) leaves one trailing zero on the previous NAL.
function trimTrailingZero(nal: Uint8Array): Uint8Array {
  return nal.length > 0 && nal[nal.length - 1] === 0 ? nal.subarray(0, nal.length - 1) : nal
}

const hex2 = (n: number): string => n.toString(16).padStart(2, '0')

/**
 * RFC 6381 codec string ("avc1.PPCCLL") from the SPS inside a scrcpy config packet.
 * profile_idc, constraint flags and level_idc are the 3 bytes after the NAL header.
 */
export function h264CodecString(config: Uint8Array): string {
  for (const nal of annexBNalUnits(config)) {
    if (nal.length >= 4 && ((nal[0] ?? 0) & 0x1f) === 7) {
      return `avc1.${hex2(nal[1]!)}${hex2(nal[2]!)}${hex2(nal[3]!)}`
    }
  }
  throw new Error('No SPS found in H.264 config packet')
}
