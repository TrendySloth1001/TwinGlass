// The page the phone's browser opens for "Show Mac screen on phone" (served by mac-screen.ts).
// Plain HTML + JS on purpose: it runs in the phone's Chrome, not in our React app.
export const VIEWER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#000000">
<title>Mac screen · Mob Mirror</title>
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; touch-action: none; }
  canvas { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: contain; }
  #hud { position: fixed; left: 50%; bottom: max(16px, env(safe-area-inset-bottom)); transform: translateX(-50%);
         font: 13px -apple-system, system-ui, sans-serif; color: #ddd; background: rgba(20,20,20,.85);
         border: 1px solid rgba(255,255,255,.12); border-radius: 999px; padding: 8px 14px; white-space: nowrap;
         transition: opacity .4s; }
  #hud.hide { opacity: 0; pointer-events: none; }
  button { font: inherit; color: #fff; background: #2b6cff; border: 0; border-radius: 999px; padding: 6px 12px; margin-left: 8px; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="hud"><span id="msg">Connecting to your Mac…</span><button id="fs">Full screen</button></div>
<script>
(() => {
  const canvas = document.getElementById('c'), ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
  const hud = document.getElementById('hud'), msg = document.getElementById('msg')
  const say = (t) => { msg.textContent = t }
  let hideTimer = 0
  const showHud = () => { hud.classList.remove('hide'); clearTimeout(hideTimer); hideTimer = setTimeout(() => hud.classList.add('hide'), 3000) }
  document.getElementById('fs').onclick = async () => {
    try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); await screen.orientation.lock('landscape') } catch {}
  }
  addEventListener('pointerdown', showHud)
  if (!('VideoDecoder' in window)) { say('This browser can’t decode video (needs Chrome 94+).'); return }

  let decoder = null, frames = 0, needKey = true
  const t = new URLSearchParams(location.search).get('t')
  const now = () => performance.timeOrigin + performance.now()

  // ---- latency: sync to the Mac's clock (NTP-style: keep the sample with the smallest round trip),
  // then every drawn frame gives capture-on-Mac -> drawn-on-phone. Re-synced every 10 s.
  let offset = null, rtt = null
  const sync = async () => {
    let best = null
    for (let i = 0; i < 8; i++) {
      const t0 = now()
      const r = await fetch('/time?t=' + t, { cache: 'no-store' }).then((x) => x.json())
      const t1 = now()
      if (!best || t1 - t0 < best.rtt) best = { rtt: t1 - t0, offset: r.now - (t0 + t1) / 2 }
    }
    offset = best.offset; rtt = best.rtt
  }
  sync(); setInterval(sync, 10000)
  let lat = [], dec = [], gotAt = new Map()
  const pct = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
  setInterval(() => {
    const p50 = pct(lat, 0.5), p95 = pct(lat, 0.95), d50 = pct(dec, 0.5)
    if (decoder) say((p50 !== null ? Math.round(p50) + ' ms · ' : '') + frames + ' fps')
    if (p50 !== null) fetch('/stats?t=' + t, { method: 'POST', body: JSON.stringify({
      p50: +p50.toFixed(1), p95: +p95.toFixed(1), min: +Math.min(...lat).toFixed(1), max: +Math.max(...lat).toFixed(1),
      decode50: d50 === null ? null : +d50.toFixed(1), fps: frames, rtt: rtt === null ? null : +rtt.toFixed(1), samples: lat.length,
      w: canvas.width, h: canvas.height }) }).catch(() => {})
    frames = 0; lat = []; dec = []
  }, 2000)
  const make = (cfg) => {
    decoder?.close()
    decoder = new VideoDecoder({
      output: (f) => {
        if (canvas.width !== f.displayWidth) canvas.width = f.displayWidth
        if (canvas.height !== f.displayHeight) canvas.height = f.displayHeight
        ctx.drawImage(f, 0, 0)
        const n = now()
        if (offset !== null) lat.push(n + offset - f.timestamp / 1000) // capture (Mac clock) -> drawn
        const g = gotAt.get(f.timestamp); if (g) { dec.push(n - g); gotAt.delete(f.timestamp) }
        f.close(); frames++
      },
      error: (e) => { say('Decoder error: ' + e.message); needKey = true },
    })
    decoder.configure({ codec: cfg.codec, optimizeForLatency: true })
    needKey = true
    showHud()
  }

  const run = async () => {
    const res = await fetch('/stream?t=' + t, { cache: 'no-store' })
    if (!res.ok) { say('Not allowed (' + res.status + '). Start it again from the Mac.'); return }
    const reader = res.body.getReader()
    let buf = new Uint8Array(0)
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      const next = new Uint8Array(buf.length + value.length); next.set(buf); next.set(value, buf.length); buf = next
      while (buf.length >= 13) {
        const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
        const type = v.getUint8(0), ts = v.getFloat64(1), len = v.getUint32(9)
        if (buf.length < 13 + len) break
        const data = buf.subarray(13, 13 + len)
        buf = buf.subarray(13 + len)
        if (type === 0) make(JSON.parse(new TextDecoder().decode(data)))
        else if (decoder && decoder.state === 'configured') {
          if (type === 1) needKey = false
          if (needKey) continue
          gotAt.set(ts, now()); if (gotAt.size > 120) gotAt.delete(gotAt.keys().next().value)
          decoder.decode(new EncodedVideoChunk({ type: type === 1 ? 'key' : 'delta', timestamp: ts, data }))
        }
      }
    }
    say('The Mac stopped sharing.'); hud.classList.remove('hide')
  }
  run().catch((e) => { say('Connection lost: ' + e.message); hud.classList.remove('hide') })
})()
</script>
</body>
</html>`
