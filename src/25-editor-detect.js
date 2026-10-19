/* ================================================================== Floor plan editor: find rooms in the template picture
 * Works best with clean plans (screenshots, architect plans, neat sketches): dark pixels are walls, letters are
 * ignored (small blobs), door gaps are closed by growing the walls, then every enclosed area becomes a room.
 * Rooms are snapped edge to edge; gaps in the shared walls become passages. */
function detectRooms(img, rectCm, opts = {}) {
  const maxW = 640, k = Math.min(1, maxW / img.width);
  const W = Math.max(40, Math.round(img.width * k)), H = Math.max(40, Math.round(img.height * k));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;
  const N = W * H, lum = new Float32Array(N);
  const hist = new Uint32Array(256);
  for (let i = 0; i < N; i++) { const v = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]; lum[i] = v; hist[v | 0]++; }
  // Otsu threshold; dark plans on light paper are the normal case, light lines on dark get inverted
  let sum = 0, sumB = 0, wB = 0, best = 0, thr = 128;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = N - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = i; }
  }
  let dark = 0;
  for (let i = 0; i < N; i++) if (lum[i] < thr) dark++;
  const invert = dark > N * 0.5;
  const wall = new Uint8Array(N);
  for (let i = 0; i < N; i++) wall[i] = invert ? lum[i] > thr : lum[i] < thr;

  // drop small blobs (letters, dimension text, furniture symbols)
  const lab = new Int32Array(N).fill(-1), stack = new Int32Array(N);
  const keep = new Uint8Array(N);
  const minSpan = Math.max(W, H) * 0.12;
  for (let s0 = 0; s0 < N; s0++) {
    if (!wall[s0] || lab[s0] >= 0) continue;
    let sp = 0, x1 = W, y1 = H, x2 = 0, y2 = 0;
    const members = [];
    stack[sp++] = s0; lab[s0] = s0;
    while (sp) {
      const i = stack[--sp], x = i % W, y = (i / W) | 0;
      members.push(i);
      if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= N || lab[j] >= 0 || !wall[j]) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue;
        lab[j] = s0; stack[sp++] = j;
      }
    }
    if (Math.max(x2 - x1, y2 - y1) >= minSpan) for (const i of members) keep[i] = 1;
  }
  // close door openings: grow the walls by about half a door width
  const cmPerPx = (rectCm[2] - rectCm[0]) / W;
  const r = clamp(Math.round((opts.door || 48) / cmPerPx), 2, 40);
  const grown = dilate(keep, W, H, r);
  // everything reachable from the border is outside
  const outside = new Uint8Array(N);
  let sp = 0;
  const push = (i) => { if (!grown[i] && !outside[i]) { outside[i] = 1; stack[sp++] = i; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (sp) {
    const i = stack[--sp], x = i % W;
    if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (i >= W) push(i - W); if (i < N - W) push(i + W);
  }
  // enclosed areas = rooms
  const seen = new Uint8Array(N), rooms = [];
  const minArea = (1.2e4 / (cmPerPx * cmPerPx)) * 0.4;
  for (let s0 = 0; s0 < N; s0++) {
    if (grown[s0] || outside[s0] || seen[s0]) continue;
    let n = 0, x1 = W, y1 = H, x2 = 0, y2 = 0;
    sp = 0; stack[sp++] = s0; seen[s0] = 1;
    while (sp) {
      const i = stack[--sp], x = i % W, y = (i / W) | 0;
      n++;
      if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N || seen[j] || grown[j] || outside[j]) continue;
        seen[j] = 1; stack[sp++] = j;
      }
    }
    const area = (x2 - x1 + 1) * (y2 - y1 + 1);
    if (n < minArea || n / area < 0.45 || area > N * 0.85) continue;
    // undo the growing (rooms shrank by r on every side)
    rooms.push([x1 - r, y1 - r, x2 + 1 + r, y2 + 1 + r]);
  }
  // to centimetres, edges on a 5 cm grid
  const toCm = (b) => [rectCm[0] + b[0] * cmPerPx, rectCm[1] + b[1] * cmPerPx, rectCm[0] + b[2] * cmPerPx, rectCm[1] + b[3] * cmPerPx];
  const R = rooms.map(toCm);
  // neighbours share one wall line (middle of the wall)
  const tol = Math.max(30, (r + 4) * cmPerPx * 0.9);
  for (let a = 0; a < R.length; a++) for (let b = 0; b < R.length; b++) {
    if (a === b) continue;
    const A = R[a], B = R[b];
    const oy = Math.min(A[3], B[3]) - Math.max(A[1], B[1]), ox = Math.min(A[2], B[2]) - Math.max(A[0], B[0]);
    if (oy > 40 && B[0] >= A[2] - tol && B[0] - A[2] < tol) { const m = (A[2] + B[0]) / 2; A[2] = m; B[0] = m; }
    if (ox > 40 && B[1] >= A[3] - tol && B[1] - A[3] < tol) { const m = (A[3] + B[1]) / 2; A[3] = m; B[1] = m; }
  }
  // align nearly equal edges (outer walls, rows of rooms)
  const xs = [], ys = [];
  for (const q of R) { xs.push(q[0], q[2]); ys.push(q[1], q[3]); }
  const align = (v, list) => { const near = list.filter((u) => Math.abs(u - v) < tol * 0.8); return near.reduce((s2, u) => s2 + u, 0) / near.length; };
  const out = R.map((q) => [align(q[0], xs), align(q[1], ys), align(q[2], xs), align(q[3], ys)].map((v) => Math.round(v / 5) * 5))
    .filter((q) => q[2] - q[0] >= 60 && q[3] - q[1] >= 60);
  // passages: a gap in the (un-grown) wall between two neighbours
  const doors = [];
  for (let a = 0; a < out.length; a++) for (let b = a + 1; b < out.length; b++) {
    const A = out[a], B = out[b];
    let seg = null;
    if (A[2] === B[0] || B[2] === A[0]) { const x = A[2] === B[0] ? A[2] : A[0]; seg = [x, Math.max(A[1], B[1]), x, Math.min(A[3], B[3])]; }
    else if (A[3] === B[1] || B[3] === A[1]) { const y = A[3] === B[1] ? A[3] : A[1]; seg = [Math.max(A[0], B[0]), y, Math.min(A[2], B[2]), y]; }
    if (!seg) continue;
    const h = seg[1] === seg[3], len = h ? seg[2] - seg[0] : seg[3] - seg[1];
    if (len < 60) continue;
    let run = 0, startV = 0, bestRun = null;
    for (let v = 0; v <= len; v += 5) {
      const cx = h ? seg[0] + v : seg[0], cy = h ? seg[1] : seg[1] + v;
      // only the wall line itself: probe with the un-grown mask, ±1 px around the line
      const x = Math.round((cx - rectCm[0]) / cmPerPx), y = Math.round((cy - rectCm[1]) / cmPerPx);
      let wl = false;
      for (let d = -Math.max(2, r); d <= Math.max(2, r); d++) { const xx = h ? x : x + d, yy = h ? y + d : y; if (xx >= 0 && yy >= 0 && xx < W && yy < H && keep[yy * W + xx]) { wl = true; break; } }
      if (!wl) { if (!run) startV = v; run += 5; if (!bestRun || run > bestRun[1]) bestRun = [startV, run]; } else run = 0;
    }
    if (bestRun && bestRun[1] >= 55 && bestRun[1] < len * 0.9) {
      const [s1, l] = bestRun;
      doors.push(h ? [seg[0] + s1, seg[1], seg[0] + s1 + l, seg[1]] : [seg[0], seg[1] + s1, seg[0], seg[1] + s1 + l]);
    }
  }
  return { rooms: out, doors, invert };
}

function dilate(m, W, H, r) {
  // separable square dilation (fast, good enough for walls)
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    let last = -1e9;
    for (let x = 0; x < W; x++) { if (m[y * W + x]) last = x; if (x - last <= r) tmp[y * W + x] = 1; }
    last = 1e9;
    for (let x = W - 1; x >= 0; x--) { if (m[y * W + x]) last = x; if (last - x <= r) tmp[y * W + x] = 1; }
  }
  for (let x = 0; x < W; x++) {
    let last = -1e9;
    for (let y = 0; y < H; y++) { if (tmp[y * W + x]) last = y; if (y - last <= r) out[y * W + x] = 1; }
    last = 1e9;
    for (let y = H - 1; y >= 0; y--) { if (tmp[y * W + x]) last = y; if (last - y <= r) out[y * W + x] = 1; }
  }
  return out;
}

Object.assign(GfcEditor.prototype, {
  _detect() {
    const u = this._c.underlay;
    if (!this._ulSrc || !u?.rect) return;
    const img = new Image();
    img.onload = () => {
      let res;
      try { res = detectRooms(img, u.rect); } catch (e) { this._toast(t('ed_detectFail')); return; }
      // keep rooms that are already drawn, add only new areas
      const fresh = res.rooms.filter((q) => !this._c.rooms.some((r) => {
        const o = r.rect, ix = Math.min(o[2], q[2]) - Math.max(o[0], q[0]), iy = Math.min(o[3], q[3]) - Math.max(o[1], q[1]);
        return ix > 0 && iy > 0 && ix * iy > 0.3 * rectArea(q);
      }));
      if (!fresh.length) { this._toast(t(res.rooms.length ? 'ed_detectNothingNew' : 'ed_detectNone')); return; }
      fresh.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      this._change(() => {
        const n0 = this._c.rooms.length;
        fresh.forEach((q, i) => this._c.rooms.push({ id: this._uniqueRoomId(`room_${n0 + i + 1}`), name: `${t('ed_room')} ${n0 + i + 1}`, rect: q, furniture: [] }));
        for (const d of res.doors) if (!this._c.doors.some((x) => segDist(x, center([d[0], d[1], d[2], d[3]])) < 30)) this._c.doors.push(d.map(r0));
        if (u.invert == null && !res.invert) u.invert = true;
        this._tool = 'rooms';
        this._s = null;
      });
      this._toast(t(Object.keys(this._hs()?.areas || {}).length ? 'ed_detectedAreas' : 'ed_detected', fresh.length, res.doors.length));
    };
    img.src = this._ulSrc;
  },
});
