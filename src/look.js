// Mouse-look delta filter (pure, no DOM/three deps → unit-testable in node).
//  push(dx, dy, t)  — called from mousemove: accumulate e.movementX/Y only.
//  take(now, frameMs) — called exactly once per rAF frame before the camera update;
//                       returns the delta to apply this frame.
// De-aliasing: if input batches arrive SLOWER than frames (60-90 Hz trackpad on a
// 120 Hz ProMotion display) a naive apply gives 0,2x,0,2x… per-frame steps = judder.
// Then each batch is spread over one measured input interval (capped 25 ms) — a new
// batch never waits behind the old one (deadline restarts, remainder carried), so lag
// is bounded and nothing snaps. If input is as fast as frames: applied immediately.
// Spike filter: only an isolated single event far above the recent median is dropped
// (Chrome pointer-lock bug); a second large event in a row is accepted as real motion.
export function createLookFilter(opts = {}) {
  const mode = opts.smooth; // '0' off, '1' forced, else auto
  const out = { x: 0, y: 0 };
  const mags = new Float32Array(9);
  const scratch = new Float32Array(9);
  let magI = 0;
  let prevMag = 0;
  let justDropped = false;
  let pdx = 0;
  let pdy = 0;
  let lastEvt = -1e9;
  let deadline = 0;
  let lastApply = 0;
  const f = {
    inputMs: 0,
    frameMs: 16.7,
    dropped: 0,
    push(dx, dy, t) {
      if (!dx && !dy) return;
      const mag = Math.abs(dx) + Math.abs(dy);
      scratch.set(mags);
      scratch.sort();
      const med = scratch[4];
      if (!justDropped && med > 0 && mag > 250 && mag > med * 12 && prevMag < med * 3) {
        f.dropped++;
        justDropped = true;
        return;
      }
      justDropped = false;
      mags[magI] = mag;
      magI = (magI + 1) % mags.length;
      prevMag = mag;
      const gap = t - lastEvt;
      if (gap > 0.5 && gap < 60) f.inputMs = f.inputMs ? f.inputMs * 0.8 + gap * 0.2 : gap;
      if (gap >= 60) lastApply = Math.max(lastApply, t); // motion (re)start: nothing owed before t
      lastEvt = t;
      pdx += dx;
      pdy += dy;
      deadline = t + Math.min(25, f.inputMs || 0);
    },
    smoothing() {
      if (mode === '0') return false;
      if (mode === '1') return f.inputMs > 0;
      return f.inputMs > f.frameMs * 1.05;
    },
    take(now, frameMs) {
      if (frameMs > 0 && frameMs < 100) f.frameMs = f.frameMs * 0.9 + frameMs * 0.1;
      out.x = 0;
      out.y = 0;
      if (pdx === 0 && pdy === 0) { lastApply = now; return out; }
      let k = 1;
      if (f.smoothing() && now < deadline) {
        const span = deadline - lastApply;
        k = span > 0 ? Math.min(1, Math.max(0, (now - lastApply) / span)) : 1;
      }
      out.x = pdx * k;
      out.y = pdy * k;
      pdx -= out.x;
      pdy -= out.y;
      if (Math.abs(pdx) < 1e-4 && Math.abs(pdy) < 1e-4) { out.x += pdx; out.y += pdy; pdx = 0; pdy = 0; }
      lastApply = now;
      return out;
    },
  };
  return f;
}
