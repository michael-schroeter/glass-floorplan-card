/* ================================================================== Live map: the buses and trains of the stops on the streets around them
 * A second view of the departures. The streets near the stops are drawn like the floor plan: every block a glass tile,
 * the streets the gaps between them, parks and water tinted glass. The lines of the stops glow in their colours, each
 * direction on its own side of the street (on its own carriageway where the road is divided, else to the right), and every
 * vehicle on its way is a glass marker in its line's colour with an arrow and the minutes until it is at the stop. Each side
 * of a stop shows what comes next there; vehicles further out wait at the edge of the map.
 * Map: OpenStreetMap through an Overpass API – fetched once, simplified to metres and kept for 30 days. Vehicles: the radar of
 * the public VBB / BVG interface every 30 s while the map is shown. Its positions are estimated from timetable and live
 * delays between the stops – the subway's even more so, it runs under the street: dashed and quieter. */
const TM_V = 2;
const TM_KEEP = 30 * 864e5;
const TM_KEY = 'glass-floorplan-card:map:';
/* half a street from its centre line to the houses (metres): the gap between the blocks */
const TM_HALF = { motorway: 16, trunk: 15, primary: 14, secondary: 12, tertiary: 10, unclassified: 8, residential: 8, living_street: 6.5, pedestrian: 6.5, rail: 7, light_rail: 6, narrow_gauge: 5 };
const TM_GREEN = { leisure: ['park', 'garden', 'playground', 'pitch', 'nature_reserve', 'recreation_ground'], landuse: ['grass', 'recreation_ground', 'cemetery', 'forest', 'meadow', 'village_green', 'allotments'], natural: ['wood', 'scrub', 'grassland'] };
/* which OSM routes a product of the interface runs on */
const TM_MODES = { bus: ['bus', 'trolleybus'], subway: ['subway'], tram: ['tram'], suburban: ['train', 'light_rail'], regional: ['train'], express: ['train'], ferry: ['ferry'] };
const tmProduct = (mode) => Object.keys(TM_MODES).find((k) => TM_MODES[k].includes(mode)) || 'bus';

/* ---------------------------------------------------------------- geometry (metres, x east, y south) */
const tmProj = (c) => {
  const ky = 110574, kx = 111320 * Math.cos((c[0] * Math.PI) / 180);
  return { xy: (lat, lon) => [(lon - c[1]) * kx, (c[0] - lat) * ky], ll: (x, y) => [c[0] - y / ky, c[1] + x / kx] };
};
const tmLen = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
/* distance of p to the segment a–b and where on it (0 … 1) */
function tmSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2, 0, 1) : 0;
  return { d: Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy), t };
}
/* Douglas–Peucker: which points of a line matter at `tol` metres */
function tmKeep(P, tol) {
  const n = P.length, keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const st = [[0, n - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    let md = tol, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = tmSeg(P[i], P[a], P[b]).d; if (d > md) { md = d; mi = i; } }
    if (mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return keep;
}
const tmSimp = (P, tol) => (P.length < 3 ? P.slice() : ((k) => P.filter((_, i) => k[i]))(tmKeep(P, tol)));
const tmArea = (P) => { let a = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += P[j][0] * P[i][1] - P[i][0] * P[j][1]; return a / 2; };
function tmInside(p, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
/* a polygon cut to a rectangle (Sutherland–Hodgman) */
function tmClip(P, R) {
  let out = P;
  for (const [ax, sg, v] of [[0, 1, R[0]], [0, -1, R[2]], [1, 1, R[1]], [1, -1, R[3]]]) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const p = inp[i], q = inp[(i + 1) % inp.length], ip = sg * (p[ax] - v) >= 0, iq = sg * (q[ax] - v) >= 0;
      if (ip) out.push(p);
      if (ip !== iq) { const t = (v - p[ax]) / (q[ax] - p[ax]); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
    if (!out.length) break;
  }
  return out;
}
/* The polygon moved in by its own distance from every edge (inside = left of the edge in these numbers). An edge that
 * turns over has vanished and goes; a corner sharper than the rest is cut short. */
function tmInset(P, W) {
  let E = P.map((a, i) => {
    const b = P[(i + 1) % P.length], l = tmLen(a, b) || 1e-9, e = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    return { a, e, n: [-e[1], e[0]], w: W[i], l };
  });
  const lim = 8 * Math.max(...W);
  for (let guard = 0; guard < 80 && E.length >= 3; guard++) {
    const n = E.length, V = [];
    for (let i = 0; i < n; i++) {
      const A = E[(i - 1 + n) % n], B = E[i], cr = A.e[0] * B.e[1] - A.e[1] * B.e[0];
      const pa = [A.a[0] + A.n[0] * A.w, A.a[1] + A.n[1] * A.w], pb = [B.a[0] + B.n[0] * B.w, B.a[1] + B.n[1] * B.w];
      if (Math.abs(cr) < 0.06) { V.push([pb]); continue; }
      const t = ((pb[0] - pa[0]) * B.e[1] - (pb[1] - pa[1]) * B.e[0]) / cr, v = [pa[0] + A.e[0] * t, pa[1] + A.e[1] * t];
      const o = B.a, d = tmLen(o, v);
      if (d <= lim) { V.push([v]); continue; }
      // a very sharp tip: cut off square to its bisector at `lim` from the corner
      const m = [(v[0] - o[0]) / d, (v[1] - o[1]) / d], cut = (q, e) => { const de = e[0] * m[0] + e[1] * m[1], tt = Math.abs(de) > 1e-6 ? (lim - ((q[0] - o[0]) * m[0] + (q[1] - o[1]) * m[1])) / de : 0; return [q[0] + e[0] * tt, q[1] + e[1] * tt]; };
      V.push([cut(pa, A.e), cut(pb, B.e)]);
    }
    let worst = -1;
    for (let i = 0; i < n; i++) {
      const a = V[i][V[i].length - 1], b = V[(i + 1) % n][0];
      if ((b[0] - a[0]) * E[i].e[0] + (b[1] - a[1]) * E[i].e[1] < 0 && (worst < 0 || E[i].l < E[worst].l)) worst = i;
    }
    if (worst < 0) { const P = V.flat(); return tmArea(P) > 0 ? P : null; }
    E = E.filter((_, i) => i !== worst);
  }
  return null;
}
/* rounded corners, like the rooms */
function tmRound(P, r) {
  const n = P.length, f = (v) => v.toFixed(1);
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = P[(i - 1 + n) % n], b = P[i], c = P[(i + 1) % n], l1 = tmLen(a, b) || 1, l2 = tmLen(b, c) || 1, k = Math.min(r, l1 * 0.45, l2 * 0.45);
    d += `${i ? 'L' : 'M'}${f(b[0] + ((a[0] - b[0]) * k) / l1)} ${f(b[1] + ((a[1] - b[1]) * k) / l1)}Q${f(b[0])} ${f(b[1])} ${f(b[0] + ((c[0] - b[0]) * k) / l2)} ${f(b[1] + ((c[1] - b[1]) * k) / l2)}`;
  }
  return `${d}Z`;
}
const tmFlat = (P) => P.flatMap((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
const tmPts = (F) => { const P = []; for (let i = 0; i < F.length; i += 2) P.push([F[i], F[i + 1]]); return P; };

/* The faces between the streets: a planar graph (crossings without a shared node – bridges, sloppy data – get one),
 * dead ends pruned, every face traced by always turning the same way. Each comes with the half width of its streets. */
function tmFaces(lines) {
  const N = [], idx = new Map(), node = (p, k) => { let i = idx.get(k); if (i == null) { idx.set(k, (i = N.length)); N.push(p); } return i; };
  const pk = (p) => `${Math.round(p[0] * 10)}|${Math.round(p[1] * 10)}`;
  const segs = [];
  for (const L of lines) for (let i = 1; i < L.P.length; i++) {
    const a = node(L.P[i - 1], L.ids ? `n${L.ids[i - 1]}` : pk(L.P[i - 1])), b = node(L.P[i], L.ids ? `n${L.ids[i]}` : pk(L.P[i]));
    if (a !== b) segs.push({ a, b, w: L.w, cut: [] });
  }
  const G = 60, cells = new Map();
  segs.forEach((s, k) => {
    const A = N[s.a], B = N[s.b];
    for (let gx = Math.floor(Math.min(A[0], B[0]) / G); gx <= Math.floor(Math.max(A[0], B[0]) / G); gx++) {
      for (let gy = Math.floor(Math.min(A[1], B[1]) / G); gy <= Math.floor(Math.max(A[1], B[1]) / G); gy++) {
        const key = gx * 100003 + gy;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(k);
      }
    }
  });
  for (const [key, list] of cells) for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
    const s = segs[list[x]], q = segs[list[y]];
    if (s.a === q.a || s.a === q.b || s.b === q.a || s.b === q.b) continue;
    const p = N[s.a], r = [N[s.b][0] - p[0], N[s.b][1] - p[1]], o = N[q.a], u = [N[q.b][0] - o[0], N[q.b][1] - o[1]], den = r[0] * u[1] - r[1] * u[0];
    if (Math.abs(den) < 1e-9) continue;
    const t = ((o[0] - p[0]) * u[1] - (o[1] - p[1]) * u[0]) / den, v = ((o[0] - p[0]) * r[1] - (o[1] - p[1]) * r[0]) / den;
    if (t <= 1e-6 || t >= 1 - 1e-6 || v <= 1e-6 || v >= 1 - 1e-6) continue;
    const X = [p[0] + r[0] * t, p[1] + r[1] * t];
    // each crossing once: in the cell it lies in
    if (Math.floor(X[0] / G) * 100003 + Math.floor(X[1] / G) !== key) continue;
    const m = node(X, `x${pk(X)}`);
    s.cut.push([t, m]);
    q.cut.push([v, m]);
  }
  const adj = N.map(() => new Map());
  const link = (a, b, w) => { if (a !== b) { adj[a].set(b, Math.max(w, adj[a].get(b) || 0)); adj[b].set(a, Math.max(w, adj[b].get(a) || 0)); } };
  for (const s of segs) {
    let prev = s.a;
    for (const [, m] of s.cut.sort((x, y) => x[0] - y[0])) { link(prev, m, s.w); prev = m; }
    link(prev, s.b, s.w);
  }
  // dead ends bound no block
  const q = [];
  adj.forEach((m, i) => { if (m.size === 1) q.push(i); });
  while (q.length) {
    const i = q.pop();
    if (adj[i].size !== 1) continue;
    const [j] = adj[i].keys();
    adj[i].delete(j);
    adj[j].delete(i);
    if (adj[j].size === 1) q.push(j);
  }
  const ring = adj.map((m, i) => [...m.keys()].map((j) => [j, Math.atan2(N[j][1] - N[i][1], N[j][0] - N[i][0])]).sort((a, b) => a[1] - b[1]).map((x) => x[0]));
  const seen = new Set(), faces = [];
  for (let u = 0; u < N.length; u++) for (const v0 of ring[u]) {
    if (seen.has(`${u}>${v0}`)) continue;
    const P = [], W = [];
    let a = u, b = v0, ok = false;
    for (let k = 0; k < 5000; k++) {
      seen.add(`${a}>${b}`);
      P.push(N[a]);
      W.push(adj[a].get(b));
      const r = ring[b], c = r[(r.indexOf(a) - 1 + r.length) % r.length];
      a = b;
      b = c;
      if (a === u && b === v0) { ok = true; break; }
    }
    if (ok && P.length >= 3 && tmArea(P) > 250) faces.push({ P, W });
  }
  return faces;
}

/* a ring joined from the ways of a multipolygon (an open end is closed straight) */
function tmRings(pieces) {
  const out = [], eq = (p, q) => Math.abs(p[0] - q[0]) < 0.05 && Math.abs(p[1] - q[1]) < 0.05, left = pieces.filter((p) => p.length > 1);
  while (left.length) {
    const ring = left.pop().slice();
    for (let g = 0; g < 400 && !eq(ring[0], ring[ring.length - 1]); g++) {
      const end = ring[ring.length - 1], k = left.findIndex((p) => eq(p[0], end) || eq(p[p.length - 1], end));
      if (k < 0) break;
      const p = left.splice(k, 1)[0];
      ring.push(...(eq(p[0], end) ? p.slice(1) : p.slice(0, -1).reverse()));
    }
    if (ring.length > 3) out.push(ring);
  }
  return out;
}
/* the ways of a route in travel order, joined into lines (a new line where the data end). A closed way (an unsplit
 * roundabout) adds only the arc from where the route enters it to where the next way leaves; gaps up to 30 m are bridged. */
function tmChain(pieces) {
  const out = [], eq = (p, q) => Math.abs(p[0] - q[0]) < 0.5 && Math.abs(p[1] - q[1]) < 0.5;
  let cur = null, fresh = false;
  for (let k = 0; k < pieces.length; k++) {
    let w = pieces[k];
    if (cur && w.length > 3 && eq(w[0], w[w.length - 1])) {
      const ring = w.slice(0, -1), n = ring.length, at = (p) => ring.findIndex((q) => eq(q, p)), i = at(cur[cur.length - 1]), nx = pieces[k + 1];
      if (i >= 0) {
        let j = nx ? [at(nx[0]), at(nx[nx.length - 1])].find((x) => x >= 0 && x !== i) ?? -1 : -1;
        if (j < 0) j = i;
        const arc = [ring[i]];
        for (let q = (i + 1) % n, g = 0; g < n; q = (q + 1) % n, g++) { arc.push(ring[q]); if (q === j) break; }
        w = arc;
      }
    }
    if (cur) {
      const a = cur[0], b = cur[cur.length - 1], c = w[0], d = w[w.length - 1];
      if (eq(b, c)) { cur.push(...w.slice(1)); fresh = false; continue; }
      if (eq(b, d)) { cur.push(...w.slice(0, -1).reverse()); fresh = false; continue; }
      if (fresh && (eq(a, c) || eq(a, d))) { cur.reverse(); cur.push(...(eq(a, c) ? w.slice(1) : w.slice(0, -1).reverse())); fresh = false; continue; }
      out.push(cur);
    }
    cur = w.slice();
    fresh = true;
  }
  if (cur) out.push(cur);
  for (let k = 1; k < out.length; k++) {
    const a = out[k - 1], b = out[k], e = a[a.length - 1];
    if (tmLen(e, b[0]) < 30) { a.push(...b); out.splice(k--, 1); } else if (tmLen(e, b[b.length - 1]) < 30) { a.push(...b.reverse()); out.splice(k--, 1); }
  }
  return out;
}
/* where on a line (with its running length S) a point is closest: distance, metres along, segment */
function tmOn(L, p) {
  let best = { d: Infinity, s: 0, i: 0 };
  for (let i = 1; i < L.P.length; i++) {
    const r = tmSeg(p, L.P[i - 1], L.P[i]);
    if (r.d < best.d) best = { d: r.d, s: L.S[i - 1] + r.t * (L.S[i] - L.S[i - 1]), i };
  }
  return best;
}
const tmLine = (P) => { const S = [0]; for (let i = 1; i < P.length; i++) S.push(S[i - 1] + tmLen(P[i - 1], P[i])); return { P, S }; };
/* the point (and the direction) at metres s along a line */
function tmAtS(L, s) {
  const S = L.S, n = S.length;
  if (s <= 0) return { p: L.P[0], i: 1 };
  if (s >= S[n - 1]) return { p: L.P[n - 1], i: n - 1 };
  let lo = 1, hi = n - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (S[m] < s) lo = m + 1; else hi = m; }
  const a = L.P[lo - 1], b = L.P[lo], t = (s - S[lo - 1]) / ((S[lo] - S[lo - 1]) || 1);
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i: lo };
}

/* ---------------------------------------------------------------- OSM → the map in metres around the centre (kept) */
/* streets, railways, parks and water in the area; the routes of the lines by name (a station's stops can lie apart),
 * of a stop without a line filter every route that stops near it */
function tmQuery(c, half, refs, open) {
  const pr = tmProj(c), [s, w] = pr.ll(-half, half), [n, e] = pr.ll(half, -half), f = (v) => v.toFixed(5);
  const bb = `${f(Math.min(s, n))},${f(Math.min(w, e))},${f(Math.max(s, n))},${f(Math.max(w, e))}`;
  const rt = '[type=route][route~"^(bus|trolleybus|tram|subway|light_rail|train|ferry)$"]';
  const named = refs.length ? `rel${rt}[ref~"^(${refs.map((r) => r.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&')).join('|')})$"];` : '';
  const near = open.length ? `(${open.map((p) => `node(around:300,${f(p[0])},${f(p[1])})[public_transport];`).join('')});rel(bn)${rt};` : '';
  return `[out:json][timeout:90][bbox:${bb}];
(way[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian)(_link)?$"];
way[railway~"^(rail|light_rail|narrow_gauge)$"];
way[leisure~"^(${TM_GREEN.leisure.join('|')})$"];way[landuse~"^(${TM_GREEN.landuse.join('|')})$"];way[natural~"^(water|${TM_GREEN.natural.join('|')})$"];
rel[natural~"^(water|wood)$"];rel[leisure=park];rel[landuse~"^(forest|cemetery|grass|recreation_ground)$"];);
out body geom qt;
(${named}${near});
out body geom(${bb}) qt;`;
}

function tmBuild(osm, c, half) {
  const pr = tmProj(c), box = [-half, -half, half, half], xy = (g) => pr.xy(g.lat, g.lon);
  const lines = [], green = [], water = [], rail = [], major = [], routes = [];
  const area = (P, min) => { const Q = tmSimp(tmClip(P, box), 1.2); return Q.length >= 3 && Math.abs(tmArea(Q)) > min ? Q : null; };
  const isGreen = (tg) => Object.entries(TM_GREEN).some(([k, vs]) => vs.includes(tg[k]));
  for (const el of osm.elements || []) {
    const tg = el.tags || {};
    if (el.type === 'relation' && tg.type === 'route') {
      const pieces = [];
      for (const m of el.members || []) {
        if (m.type !== 'way' || /platform/.test(m.role || '') || !m.geometry) continue;
        let run = [];
        for (const g of m.geometry) { if (g) run.push(xy(g)); else { if (run.length > 1) pieces.push(run); run = []; } }
        if (run.length > 1) pieces.push(run);
      }
      const at = (role) => (el.members || []).filter((m) => m.type === 'node' && Number.isFinite(m.lat) && role.test(m.role || '')).map(xy);
      let stops = at(/^stop/);
      if (!stops.length) stops = at(/^platform/);
      const segs = tmChain(pieces).map((P) => tmSimp(P, 0.8)).filter((P) => P.length > 1).map((P) => {
        // the stops in order tell which way a line runs
        const L = tmLine(P), on = stops.map((p) => tmOn(L, p)).filter((o) => o.d < 40).map((o) => o.s);
        let up = 0;
        for (let i = 1; i < on.length; i++) up += Math.sign(on[i] - on[i - 1]);
        return up < 0 ? P.reverse() : P;
      });
      if (segs.length) routes.push({ ref: String(tg.ref || ''), mode: tg.route, colour: tg.colour || null, to: tg.to || '', from: tg.from || '', segs: segs.map(tmFlat), stops: tmFlat(stops) });
      continue;
    }
    const ringsOf = () => {
      if (el.type === 'way') return el.geometry?.length > 3 && el.nodes?.[0] === el.nodes?.[el.nodes.length - 1] ? [{ P: el.geometry.filter(Boolean).map(xy), inner: false }] : [];
      if (el.type !== 'relation') return [];
      const of = (role) => tmRings((el.members || []).filter((m) => m.type === 'way' && m.geometry && (m.role || 'outer') === role).map((m) => m.geometry.filter(Boolean).map(xy)));
      return [...of('outer').map((P) => ({ P, inner: false })), ...of('inner').map((P) => ({ P, inner: true }))];
    };
    const hw = tg.highway?.replace(/_link$/, ''), rw = tg.railway;
    if ((TM_HALF[hw] || TM_HALF[rw]) && el.type === 'way' && el.geometry && tg.area !== 'yes' && !['yes', 'building_passage', 'covered'].includes(tg.tunnel)) {
      if (el.geometry.some((g) => !g)) continue;
      let w = TM_HALF[hw] || TM_HALF[rw];
      const lanes = +tg.lanes || 0;
      if (hw && tg.highway.endsWith('_link')) w *= 0.65;
      else if (hw && tg.oneway === 'yes' && ['trunk', 'primary', 'secondary', 'tertiary'].includes(hw)) w = (lanes || 2) * 1.75 + 5; // one carriageway of a divided road
      else if (hw && lanes >= 3) w = Math.max(w, lanes * 1.75 + 6);
      const P = el.geometry.map(xy);
      lines.push({ P, ids: el.nodes?.length === P.length ? el.nodes : null, w });
      if (rw) rail.push(tmFlat(tmSimp(P, 1)));
      else if (['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(hw)) major.push({ k: ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].indexOf(hw), w, p: tmFlat(tmSimp(P, 1)) });
      continue;
    }
    if (tg.natural === 'water' || isGreen(tg)) {
      // the small greens of courtyards and back yards are texture without meaning
      const rings = ringsOf().map((r) => ({ ...r, P: area(r.P, r.inner ? 120 : tg.natural === 'water' ? 400 : 1500) })).filter((r) => r.P);
      if (rings.some((r) => !r.inner)) (tg.natural === 'water' ? water : green).push(rings.map((r) => tmFlat(r.P)));
    }
  }
  // the blocks: faces of the streets, moved in from each street by half its width
  const blocks = [];
  const gp = green.map((rs) => tmPts(rs[0])), wp = water.map((rs) => tmPts(rs[0]));
  for (const f of tmFaces(lines)) {
    if (Math.abs(tmArea(f.P)) > 4 * half * half * 0.5) continue;
    const R = f.P.concat([f.P[0]]), keep = tmKeep(R, 1.6), P = [], W = [];
    let last = 0, acc = 0, accL = 0;
    for (let i = 1; i < R.length; i++) {
      const l = tmLen(R[i - 1], R[i]);
      acc += f.W[i - 1] * l;
      accL += l;
      if (keep[i]) { P.push(R[last]); W.push(accL ? acc / accL : f.W[i - 1]); last = i; acc = 0; accL = 0; }
    }
    if (P.length < 3) continue;
    const I = tmInset(P, W.map((w) => w + 1.2));
    if (!I || tmArea(I) < 140) continue;
    const Q = tmClip(I, box);
    if (Q.length < 3) continue;
    // a block that is mostly park or water is drawn as such
    const bb = Q.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
    let n = 0, ng = 0, nw = 0;
    for (let gy = 1; gy < 6; gy++) for (let gx = 1; gx < 6; gx++) {
      const p = [bb[0] + ((bb[2] - bb[0]) * gx) / 6, bb[1] + ((bb[3] - bb[1]) * gy) / 6];
      if (!tmInside(p, Q)) continue;
      n++;
      if (gp.some((G) => tmInside(p, G))) ng++;
      else if (wp.some((G) => tmInside(p, G))) nw++;
    }
    blocks.push({ k: n && nw / n > 0.5 ? 2 : n && ng / n > 0.5 ? 1 : 0, p: tmFlat(Q) });
  }
  // parks and water that are not a block of their own lie on top
  const bpts = blocks.map((b) => ({ k: b.k, P: tmPts(b.p) }));
  const loose = (list, k) => list.filter((rs) => {
    const P = tmPts(rs[0]), m = P.reduce((a, p) => [a[0] + p[0] / P.length, a[1] + p[1] / P.length], [0, 0]);
    return !bpts.some((b) => b.k === k && tmInside(m, b.P));
  });
  return { v: TM_V, c, half, blocks, green: loose(green, 1), water: loose(water, 2), rail, major, routes };
}

const STYLES_T = `
/* the live map is a view of its own as well: the plan, the tiles and the layer card make way, the layer bar stays */
.root[data-type="departures_map"]:not(.bare) .stage > :not(.tabs):not(.tip), .root[data-type="departures_map"]:not(.bare) .side,
.root[data-type="departures_map"]:not(.bare) .mside, .root[data-type="departures_map"]:not(.bare) .lay > .gcard,
.root[data-type="departures_map"]:not(.bare) .empty-plan { opacity: 0 !important; pointer-events: none !important; }
.root[data-type="departures_map"]:not(.bare) .lay { z-index: 3; pointer-events: none; }
.root[data-type="departures_map"]:not(.bare) .lay .tabs { pointer-events: auto; }
.root[data-type="departures_map"] .bg .g1, .root[data-type="departures_map"] .bg .g2 { opacity: calc(var(--warm) * .18); }
.root[data-type="departures_map"] .bg .g3 { opacity: .85; }
.root[data-type="departures_map"] .bg .dots { opacity: 0; }

.tview { position: absolute; inset: 0; z-index: 2; overflow: hidden; opacity: 0; visibility: hidden; transition: opacity .3s ease, visibility 0s linear .3s;
  --tm-u: 1px; }
.root.bare .tview { display: none; }
.root[data-type="departures_map"]:not(.bare) .tview { opacity: 1; visibility: visible; transition: opacity .5s ease .08s; }
/* the map fades into the card's own background at its edges, like the plan floats on it */
.tview .tm-svg, .tview .tm-lit { position: absolute; left: 0; top: 0; overflow: visible; }
.tview .tm-svg { -webkit-mask-image: linear-gradient(90deg, transparent, #000 28px, #000 calc(100% - 28px), transparent), linear-gradient(transparent, #000 28px, #000 calc(100% - 28px), transparent);
  -webkit-mask-composite: source-in; mask-image: linear-gradient(90deg, transparent, #000 28px, #000 calc(100% - 28px), transparent), linear-gradient(transparent, #000 28px, #000 calc(100% - 28px), transparent);
  mask-composite: intersect; }
.root[data-type="departures_map"] .tview .tm-svg { animation: tmin .9s cubic-bezier(.2, .8, .2, 1) both; }
@keyframes tmin { from { opacity: 0; transform: scale(1.015); } to { opacity: 1; transform: none; } }
.tm-svg .bk { fill: url(#tmg); stroke: rgba(255, 255, 255, .12); stroke-width: 1; }
.tm-svg .bk.g { fill: url(#tmgg); stroke: rgba(130, 220, 150, .18); }
.tm-svg .bk.w, .tm-svg .wa { fill: url(#tmgw); stroke: rgba(120, 180, 255, .22); stroke-width: 1; }
.tm-svg .gr { fill: rgba(70, 190, 105, .08); stroke: rgba(130, 220, 150, .12); stroke-width: 1; }
.tm-svg .mj { fill: none; stroke: rgba(255, 255, 255, .04); stroke-linecap: round; stroke-linejoin: round; }
.tm-svg .rl { fill: none; stroke: rgba(255, 255, 255, .08); stroke-width: 1; }
/* the lines are structure: thin and quiet – colour at full strength only where a vehicle comes in to a stop */
.tm-svg .rt { fill: none; stroke-width: calc(1.8 * var(--tm-u)); opacity: .5; stroke-linecap: round; stroke-linejoin: round; }
.tm-svg .rt.ug { stroke-width: calc(1.6 * var(--tm-u)); stroke-dasharray: calc(4 * var(--tm-u)) calc(5 * var(--tm-u)); opacity: .45; }
.tm-lit path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.tm-lit path.gl { stroke-width: calc(8 * var(--tm-u)); opacity: .16; }
.tm-lit path.co { stroke-width: calc(2.6 * var(--tm-u)); opacity: .95; }
.tm-lit path.ug.co { stroke-dasharray: calc(4 * var(--tm-u)) calc(4 * var(--tm-u)); opacity: .8; }

/* layers: map, lit ways, vehicles, the bands of heading and footer, then the stops – the answer is never covered */
.tm-lit { z-index: 1; }
.tm-vs { z-index: 2; }
.tm-scr { position: absolute; left: 0; right: 0; z-index: 2; pointer-events: none; }
.tm-scr.t { top: 0; height: 70px; background: linear-gradient(rgba(8, 9, 12, .78), rgba(8, 9, 12, 0)); }
.tm-scr.b { bottom: 0; height: 64px; background: linear-gradient(rgba(8, 9, 12, 0), rgba(8, 9, 12, .82)); }
.tm-ov { z-index: 3; }
.tm-ov, .tm-vs { position: absolute; inset: 0; pointer-events: none; }
.tm-ov > *, .tm-vs > *, .tm-hs > * { position: absolute; left: 0; top: 0; }

/* a stop by the street: its name quiet, a small glass light on each side, a chip of what comes next beside it */
.tm-sl { font-size: max(12.5px, calc(13.5 * var(--tm-u))); font-weight: 600; letter-spacing: -.01em; white-space: nowrap; color: rgba(235, 235, 245, .82);
  text-shadow: 0 1px 8px rgba(0, 0, 0, .75); }
.tm-pt { width: calc(12 * var(--tm-u)); height: calc(12 * var(--tm-u)); margin: calc(-6 * var(--tm-u)) 0 0 calc(-6 * var(--tm-u)); border-radius: 50%;
  background: rgba(255, 255, 255, .18); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .38), 0 2px 6px rgba(0, 0, 0, .4); }
.tm-pt::after { content: ''; position: absolute; inset: 30%; border-radius: 50%; background: rgba(255, 255, 255, .9); }
.tm-pt.ug { background: rgba(255, 255, 255, .06); box-shadow: none; outline: 1px dashed rgba(255, 255, 255, .5); outline-offset: -1px; }
/* one glass token for every chip on the map – the tiles' material, a little denser without the blur */
.tm-pf, .tm-h, .tm-ve { background: linear-gradient(160deg, rgba(48, 48, 56, .9), rgba(22, 23, 28, .93));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), inset 0 1px 0 rgba(255, 255, 255, .09), 0 6px 16px rgba(0, 0, 0, .32); }
.tm-pf { display: flex; align-items: center; gap: calc(7 * var(--tm-u)); height: calc(30 * var(--tm-u)); padding: 0 calc(10 * var(--tm-u)) 0 calc(7 * var(--tm-u));
  border-radius: calc(15 * var(--tm-u)); white-space: nowrap; font-variant-numeric: tabular-nums; }
.tm-pf .ic, .tm-h .ic { font-size: calc(15 * var(--tm-u)); stroke: rgba(255, 255, 255, .85); stroke-width: 2.4; }
.tm-pf .ar, .tm-h .ar { display: grid; place-items: center; width: calc(18 * var(--tm-u)); height: calc(18 * var(--tm-u)); }
.tm-ln { display: flex; align-items: baseline; gap: calc(6 * var(--tm-u)); transition: opacity .4s ease; }
.tm-ln + .tm-ln { margin-left: calc(4 * var(--tm-u)); }
/* the next one first and in full; the ones after it quieter */
.tm-pf .tm-ln:not(.hero) { opacity: .62; }
.tm-pf .tm-ln:not(.hero) .tm-mn { font-size: max(13px, calc(15 * var(--tm-u))); }
.tm-bd { display: inline-grid; place-items: center; min-width: calc(36 * var(--tm-u)); height: calc(20 * var(--tm-u)); padding: 0 calc(6 * var(--tm-u)); box-sizing: border-box;
  border-radius: calc(6 * var(--tm-u)); background: var(--lb); color: var(--lf); font-size: max(11px, calc(12 * var(--tm-u))); font-weight: 700; letter-spacing: -.01em; align-self: center;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .14), inset 0 1px 0 rgba(255, 255, 255, .16); }
.tm-mn { font-size: max(15px, calc(18 * var(--tm-u))); font-weight: 700; letter-spacing: -.03em; color: var(--t1); }
.tm-mn small { margin-left: calc(3 * var(--tm-u)); font-size: max(10.5px, calc(11.5 * var(--tm-u))); font-weight: 600; letter-spacing: 0; color: var(--t2); }
.tm-mn.late { color: rgb(var(--orange)); }
.tm-mn.none { font-size: max(12px, calc(13 * var(--tm-u))); font-weight: 600; color: var(--t3); }
/* a station under the street: one plate like a card of the board – the name quiet on top, a row per line */
.tm-pf.st { display: block; height: auto; padding: calc(7 * var(--tm-u)) calc(11 * var(--tm-u)) calc(5 * var(--tm-u)); border-radius: calc(16 * var(--tm-u)); }
.tm-pf.st .tm-sh { padding: 0 calc(2 * var(--tm-u)) calc(3 * var(--tm-u)); font-size: max(11.5px, calc(12.5 * var(--tm-u))); font-weight: 500; color: var(--t2); }
.tm-pf.st .tm-row { display: flex; align-items: center; gap: calc(7 * var(--tm-u)); height: calc(30 * var(--tm-u)); }
.tm-pf.st .tm-row + .tm-row { border-top: 1px solid rgba(255, 255, 255, .08); }
.tm-pf.st .tm-row .tm-ln + .tm-ln { margin-left: calc(6 * var(--tm-u)); }
/* a vehicle further out: quietly at the edge where it will come in */
.tm-h { display: flex; align-items: center; gap: calc(5 * var(--tm-u)); height: calc(24 * var(--tm-u)); padding: 0 calc(9 * var(--tm-u)) 0 calc(5 * var(--tm-u));
  border-radius: calc(12 * var(--tm-u)); white-space: nowrap; font-variant-numeric: tabular-nums; opacity: .88; }
.tm-h .ar { width: calc(15 * var(--tm-u)); }
.tm-h .ic { font-size: calc(12 * var(--tm-u)); stroke: rgba(255, 255, 255, .6); }
.tm-h .tm-bd { min-width: calc(30 * var(--tm-u)); height: calc(17 * var(--tm-u)); font-size: max(10px, calc(10.5 * var(--tm-u))); }
.tm-h .tm-mn { font-size: max(12px, calc(13 * var(--tm-u))); font-weight: 600; color: rgba(235, 235, 245, .8); }
.tm-h .tm-mn small { font-size: max(10px, calc(10.5 * var(--tm-u))); }

/* a vehicle: a lit glass disc in its line's colour, made like the lamps; a white pointer on its rim where it goes */
.tm-v { will-change: transform; transition: opacity .7s ease; --vr: calc(16 * var(--tm-u)); }
.tm-v.out { opacity: 0; }
.tm-vd { position: absolute; left: calc(-1 * var(--vr)); top: calc(-1 * var(--vr)); width: calc(2 * var(--vr)); height: calc(2 * var(--vr)); border-radius: 50%; display: grid; place-items: center;
  background: radial-gradient(circle at 50% 28%, rgb(var(--lcl)), rgb(var(--lc)) 72%);
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .3), inset 0 -2px 6px rgba(0, 0, 0, .08), 0 0 0 calc(var(--vr) * .24) rgba(var(--lc), .13), 0 3px 16px rgba(var(--lc), .42), 0 4px 10px rgba(0, 0, 0, .3);
  color: var(--lf); font-size: max(10.5px, calc(11.5 * var(--tm-u))); font-weight: 700; letter-spacing: -.02em; transition: transform .6s ease, color .4s ease, box-shadow .4s ease; }
.tm-vp { position: absolute; left: 0; top: 0; width: 0; height: 0; transition: transform .6s ease, opacity .4s ease; }
.tm-vp::after { content: ''; position: absolute; left: calc(var(--vr) + 1 * var(--tm-u)); top: calc(-6 * var(--tm-u)); width: calc(9 * var(--tm-u)); height: calc(12 * var(--tm-u));
  background: rgba(255, 255, 255, .95); clip-path: polygon(0 0, 100% 50%, 0 100%); filter: drop-shadow(0 0 1.5px rgba(0, 0, 0, .7)); }
.tm-ve { position: absolute; left: 0; top: 0; transform: translate(calc(var(--vr) + 9 * var(--tm-u)), -50%); padding: calc(3 * var(--tm-u)) calc(9 * var(--tm-u));
  border-radius: calc(11 * var(--tm-u)); white-space: nowrap; font-size: max(12px, calc(13 * var(--tm-u))); font-weight: 650; color: var(--t1); font-variant-numeric: tabular-nums; }
.tm-ve.l { transform: translate(calc(-100% - var(--vr) - 9 * var(--tm-u)), -50%); }
.tm-ve:empty, .tm-ve.x { display: none; }
/* leaving (no stop of these ahead of it): a quiet dot that drifts off */
.tm-v.gone { opacity: .45; }
.tm-v.gone .tm-vd { transform: scale(.38); color: transparent; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .3); }
.tm-v.gone .tm-vp, .tm-v.gone .tm-ve { opacity: 0; }
.tm-v.gone.out, .tm-v.off { opacity: 0; }
/* under the street the position is estimated: a dashed rim */
.tm-v.ug .tm-vd { outline: 1.5px dashed rgba(var(--lc), .95); outline-offset: calc(2.5 * var(--tm-u)); }
.tm-v.ug .tm-vp::after { left: calc(var(--vr) + 4.5 * var(--tm-u)); }
.tm-v.ug.gone .tm-vd { outline-color: transparent; }

/* the heading as on the departures board: a quiet label, live beside it */
.tm-head { position: absolute; z-index: 4; display: flex; align-items: center; gap: 14px; height: 30px; padding: 0 14px 0 6px; pointer-events: none; }
.tm-head h2 { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--t2); }
.tm-live { display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 500; color: var(--t3); white-space: nowrap; font-variant-numeric: tabular-nums; }
.tm-live i { width: 7px; height: 7px; border-radius: 50%; background: rgb(var(--green)); animation: dplive 3s ease-in-out infinite; }
.tm-live.off i { background: rgb(var(--orange)); animation: none; }
.tm-foot { position: absolute; z-index: 4; display: flex; align-items: center; justify-content: space-between; gap: 14px; font-size: 11.5px; color: rgba(235, 235, 245, .55); pointer-events: none; }
.tm-foot a { color: rgba(235, 235, 245, .45); text-decoration: none; pointer-events: auto; white-space: nowrap; font-size: 11px; }
.tm-foot a:hover { color: var(--t2); }
.tm-leg { display: flex; align-items: center; gap: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tm-leg i { flex: none; width: 18px; height: 0; border-top: 2px dashed rgba(255, 255, 255, .5); }
.tm-msg { position: absolute; z-index: 4; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 12px 18px; border-radius: 16px; font-size: 15px; font-weight: 500; color: var(--t2);
  background: rgba(20, 21, 26, .8); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08); }
.tm-msg:empty { display: none; }
.m .tm-foot { flex-direction: column; align-items: flex-start; gap: 3px; font-size: 11px; }
`;

Object.assign(GlassFloorplanCard.prototype, {
  _tmOn() { return !!this._tview && !!this._M?.dep?.map && this.isConnected && this._layer()?.type === 'departures_map' && !this._root?.classList.contains('bare'); },
  /* while the map is shown: the map data (once), the radar every 30 s, the vehicles moving */
  _tmSync() {
    if (!this._tmOn()) { this._tmStop(); return; }
    this._tmDom();
    this._tmLoad();
    this._tmLayout();
    if (!this._tmI) this._tmI = setInterval(() => this._tmRadar(), 30e3);
    this._tmRadar();
    this._tmShow();
  },
  _tmStop() {
    clearInterval(this._tmI);
    this._tmI = null;
    cancelAnimationFrame(this._tmRaf);
    this._tmRaf = null;
  },

  /* ---------------------------------------------------------------- data */
  /* where a stop is: given in the configuration, else asked once from the interface and kept */
  _tmStopsLL() {
    const D = this._M.dep, store = (this._tmLL = this._tmLL || {});
    return D.stops.map((s) => {
      if (!s.id) return null;
      if (s.at) return s.at;
      const k = `${D.api}|${s.id}`;
      if (store[k]?.ll) return store[k].ll;
      try { const v = JSON.parse(localStorage.getItem(`glass-floorplan-card:stop:${k}`) || 'null'); if (v) return (store[k] = { ll: v }).ll; } catch (e) { /* ignore */ }
      const c = store[k] || (store[k] = {});
      if (c.bad) return null;
      if (!c.busy && Date.now() - (c.tried || 0) > 60e3) {
        c.busy = true;
        c.tried = Date.now();
        tmFetch(`${D.api}/stops/${encodeURIComponent(s.id)}`, null, 15e3).then((r) => {
          // an unknown stop is not asked for again
          if (r.status >= 400 && r.status < 500) { c.bad = true; return null; }
          return r.ok ? r.json() : Promise.reject(new Error(String(r.status)));
        }).then((j) => {
          const l = j && (j.location || j);
          if (!l || !Number.isFinite(l.latitude)) return;
          c.ll = [l.latitude, l.longitude];
          try { localStorage.setItem(`glass-floorplan-card:stop:${k}`, JSON.stringify(c.ll)); } catch (e) { /* ignore */ }
          this._tmLoad();
        }).catch(() => {}).finally(() => { c.busy = false; if (c.bad) this._tmLoad(); });
      }
      return null;
    });
  },
  /* The map data: from the browser's store while younger than 30 days, else from Overpass (once, after a busy server with
   * growing pauses). The area: the stops with `radius` around them, generous enough for any shape of screen. */
  _tmLoad() {
    const D = this._M?.dep;
    if (!D?.map) return;
    const ll = this._tmStopsLL(), bad = D.stops.some((s) => s.id && this._tmLL?.[`${D.api}|${s.id}`]?.bad);
    if (bad) { this._tmMsg(t('tmBadStop')); return; }
    if (ll.some((p, i) => !p && D.stops[i].id)) { this._tmMsg(t('tmLoading')); return; }
    const pts = ll.filter(Boolean);
    if (!pts.length) { this._tmMsg(t('tmNoStops')); return; }
    const c0 = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    const pr0 = tmProj(c0), m = pts.map((p) => pr0.xy(...p));
    const ext = Math.max(...m.map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1])))) + D.map.radius;
    const half = Math.min(2500, Math.round((ext * 2.2 + 200) / 50) * 50), c = c0.map((v) => Math.round(v * 2e4) / 2e4);
    const refs = [...new Set(D.stops.flatMap((s) => s.lines))].sort(), open = D.stops.map((s, i) => (!s.lines.length ? ll[i] : null)).filter(Boolean);
    const key = `${TM_KEY}${hashStr(JSON.stringify([TM_V, c, half, pts.map((p) => p.map((v) => +v.toFixed(4))), refs, D.map.overpass]))}`;
    const L = (this._tmL = this._tmL || {});
    if (L.key !== key) {
      Object.assign(L, { key, c, half, stops: pts, geo: null, at: 0, busy: false, wait: 0, tries: 0, err: false });
      try { const v = JSON.parse(localStorage.getItem(key) || 'null'); if (v?.g?.v === TM_V) Object.assign(L, { geo: v.g, at: v.at }); } catch (e) { /* ignore */ }
      if (L.geo) this._tmGeo(L.geo);
      else if (this._tmG) {
        // another area: the old map goes until the new one is there
        this._tmG = null;
        this._tmView = null;
        this._tview?.querySelectorAll('.tm-svg, .tm-lit, .tm-ov, .tm-vs').forEach((el) => el.replaceChildren());
        this._tmVeh = new Map();
      }
    }
    if (L.busy || (L.geo && Date.now() - L.at < TM_KEEP) || Date.now() < L.wait) { if (!L.geo) this._tmMsg(t(L.err ? 'tmOffline' : 'tmLoading')); return; }
    L.busy = true;
    if (!L.geo) this._tmMsg(t('tmLoading'));
    tmFetch(D.map.overpass, { method: 'POST', body: new URLSearchParams({ data: tmQuery(c, half, refs, open) }) }, 100e3)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        if (L.key !== key) return;
        // a busy server answers with what it got so far and a remark: try again later
        if (/error|timed out|out of memory/i.test(j.remark || '')) throw new Error(j.remark);
        const g = tmBuild(j, c, half), whole = !refs.length || g.routes.length;
        Object.assign(L, { geo: g, at: whole ? Date.now() : Date.now() - TM_KEEP + 600e3, err: false, tries: 0 });
        if (whole) tmKeep3(key, { at: L.at, g });
        this._tmGeo(g);
      })
      .catch(() => {
        if (L.key !== key) return;
        L.tries++;
        L.err = true;
        L.wait = Date.now() + Math.min(600e3, 15e3 * 2 ** (L.tries - 1));
        if (!L.geo) this._tmMsg(t('tmOffline'));
      })
      .finally(() => { if (L.key === key) L.busy = false; });
  },
  /* the map is there: its lines measured once, then laid out and drawn */
  _tmGeo(g) {
    const pr = tmProj(g.c);
    this._tmG = {
      ...g, pr,
      routes: g.routes.map((r) => {
        // the chains of a route one after the other: metres along the whole route (chain start + metres on the chain)
        let o = 0;
        const lines = r.segs.map((F) => { const L = tmLine(tmPts(F)); L.o = o; o += L.S[L.S.length - 1] + 50; return L; });
        return { ...r, prod: tmProduct(r.mode), lines, stopP: tmPts(r.stops) };
      }),
      green: g.green.filter((rs) => Math.abs(tmArea(tmPts(rs[0]))) > 1500),
    };
    // vehicles of the map before are gone with it
    this._tview?.querySelector('.tm-vs')?.replaceChildren();
    this._tmVeh = new Map();
    this._tmView = null;
    this._tmVKey = null;
    this._tmMsg('');
    this._tmLayout();
  },
  _tmMsg(s) { const el = this._tview?.querySelector('.tm-msg'); if (el && el.textContent !== s) el.textContent = s; },

  /* where a line leaves a stop: a station's stops can lie apart (the bus stop round the corner) – from its departures,
   * else the stop's own position */
  _tmAnchors(si, ref) {
    const s = this._M.dep.stops[si], seen = new Map();
    for (const d of this._depC?.[this._depKey(s)]?.list || []) if (d.line === ref && d.at) seen.set(d.at.map((v) => v.toFixed(4)).join(), d.at);
    const own = this._tmStopsLL()[si];
    return seen.size ? [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0])).map((x) => x[1]) : own ? [own] : [];
  },
  /* the lines of a stop: as configured, else every line leaving there */
  _tmLinesOf(s) {
    if (s.lines.length) return s.lines;
    const c = this._depC?.[this._depKey(s)];
    return [...new Set((c?.list || []).map((d) => d.line))].filter((l) => !s.exclude.includes(l));
  },
  /* the look of a line: its colours from the departures (like the board), else the colour of its kind */
  _tmLook(ref, prod) {
    const L = (this._tmLooks = this._tmLooks || {});
    if (!L[ref]) {
      let d = null;
      for (const s of this._M.dep.stops) { d = (this._depC?.[this._depKey(s)]?.list || []).find((x) => x.line === ref); if (d) break; }
      if (!d) { const bg = hexRgb(DEP_COLORS[prod] || '#6e6e78'); return { prod, bg, fg: [255, 255, 255], glow: bg }; }
      let bg = hexRgb(d.bg || DEP_COLORS[d.product] || '#6e6e78');
      const fg = hexRgb(d.fg || '#fff'), lb = relLum(bg), lf = relLum(fg);
      if ((Math.max(lb, lf) + 0.05) / (Math.min(lb, lf) + 0.05) < 3 && lf > lb) bg = bg.map((v) => Math.round(v * 0.72));
      L[ref] = { prod: d.product || prod, bg, fg, glow: hexRgb(d.bg || DEP_COLORS[d.product] || '#6e6e78') };
    }
    return L[ref];
  },
  _tmBadge(ref, look) { return `<b class="tm-bd" style="--lb:rgb(${look.bg.join(',')});--lf:rgb(${look.fg.join(',')})">${esc(ref)}</b>`; },

  /* the platforms: on each route of a stop's lines the stop nearest to it – grouped into the sides of the street */
  _tmPlats() {
    const G = this._tmG, D = this._M.dep;
    if (!G) return [];
    const ll = this._tmStopsLL();
    return D.stops.map((s, si) => {
      if (!ll[si] || !s.id) return null;
      const S = G.pr.xy(...ll[si]), lines = this._tmLinesOf(s), plats = [];
      G.routes.forEach((r, ri) => {
        if (!lines.includes(r.ref)) return;
        // the route's own stop nearest to any stop the line leaves from
        const As = this._tmAnchors(si, r.ref).map((a) => G.pr.xy(...a)), A = As[0] || S;
        const near = r.stopP.map((p) => [p, Math.min(...As.map((q) => tmLen(p, q)))]).filter((x) => x[1] < 160).sort((a, b) => a[1] - b[1])[0];
        r.lines.forEach((L, li) => {
          const o = tmOn(L, near ? near[0] : A);
          if (o.d > (near ? 35 : 70)) return;
          const a = L.P[o.i - 1], b = L.P[o.i];
          plats.push({ si, ri, li, s: o.s, rs: L.o + o.s, ref: r.ref, prod: r.prod, ug: r.mode === 'subway', pt: tmAtS(L, o.s).p, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) });
        });
      });
      // a side: platforms close together that face the same way – under the street one per line, both directions in it
      const sides = [];
      for (const p of plats) {
        const g = sides.find((x) => (p.ug ? x.ug && x.refs[0] === p.ref : !x.ug && tmLen(x.pt, p.pt) < 40 && Math.abs(Math.atan2(Math.sin(x.ang - p.ang), Math.cos(x.ang - p.ang))) < 0.9));
        if (g) { g.plats.push(p); if (!g.refs.includes(p.ref)) g.refs.push(p.ref); } else sides.push({ si, plats: [p], refs: [p.ref], pt: p.pt, ang: p.ang, ug: p.ug });
      }
      return { si, S, sides, plats };
    }).filter(Boolean);
  },

  /* ---------------------------------------------------------------- layout + the map itself */
  _tmLayout() {
    const v = this._tview, lv = this._lv;
    if (!v || !lv || !this._M?.dep?.map) return;
    const W = this._ev ? this._ev.w : this._root.clientWidth, H = this._h || lv.H, M = this._M;
    if (!W || !H) return;
    // The map fills the card (above a phone's tab bar); the stops go into the largest part the layer bar leaves free –
    // beside it on a laptop, above or below it when it lies in the plan – with the heading at that part's top
    let R = [0, 0, W, H], bar = null;
    const tabs = this.$('.tabs');
    if (tabs && !tabs.hidden && tabs.offsetWidth) {
      if (tabs.classList.contains('dock')) R[3] = Math.max(160, H - tabs.offsetHeight - 16 - (this._safeB || 0));
      else if (M.widgets.bar) {
        const c = center(M.widgets.bar), x = lv.sx + (c[0] - lv.S.x) * lv.pu, y = lv.sy + (c[1] - lv.S.y) * lv.pu, w = tabs.offsetWidth / 2 + 14, h = tabs.offsetHeight / 2 + 14;
        bar = [x - w, y - h, x + w, y + h];
      }
    }
    const RF = bar ? freeOf(R, [bar]) : R;
    const pad = this._m ? 12 : clamp(Math.round(W * 0.022), 16, 32), head = this._m ? 34 : 40, footH = this._m ? 34 : 18;
    const F = [RF[0] + pad, RF[1] + pad + head, RF[2] - pad, Math.min(RF[3], R[3] - footH) - pad];
    const u = this._m ? 1 : clamp(Math.min(W / 1100, H / 640), 1, 1.25);
    v.style.setProperty('--tm-u', `${u.toFixed(3)}px`);
    const h = v.querySelector('.tm-head'), foot = v.querySelector('.tm-foot');
    if (h) Object.assign(h.style, { left: `${RF[0] + pad}px`, top: `${RF[1] + pad}px` });
    if (foot) Object.assign(foot.style, { left: `${R[0] + pad + 2}px`, right: `${W - R[2] + pad}px`, bottom: `${H - R[3] + 8}px` });
    // the edge of the card for the vehicles still out of view, and what everything there keeps clear of
    const E = [R[0] + 14, R[1] + 14, R[2] - 14, R[3] - (this._m ? 46 : 32)];
    const hb = h?.getBoundingClientRect(), ob = foot?.getBoundingClientRect(), rb = this._root.getBoundingClientRect(), sc = rb.width / W || 1;
    const rel = (b) => [(b.left - rb.left) / sc - 8, (b.top - rb.top) / sc - 8, (b.right - rb.left) / sc + 8, (b.bottom - rb.top) / sc + 8];
    this._tmBox = { W, H, F, E, u, keep: [hb, ob].filter((b) => b?.width).map(rel).concat(bar ? [bar] : []) };
    const G = this._tmG;
    if (!G) return;
    // the stops with the radius around them fill the free part
    // a phone shows less around the stops (bigger, calmer), a laptop the full radius
    const ll = M.dep.stops.flatMap((s, si) => { const refs = this._tmLinesOf(s); return refs.length ? refs.flatMap((ref) => this._tmAnchors(si, ref)) : [this._tmStopsLL()[si]]; }).filter(Boolean).map((p) => G.pr.xy(...p)), r = M.dep.map.radius * (this._m ? 0.6 : 1);
    if (!ll.length) return;
    const fb = [Math.min(...ll.map((p) => p[0])) - r, Math.min(...ll.map((p) => p[1])) - r, Math.max(...ll.map((p) => p[0])) + r, Math.max(...ll.map((p) => p[1])) + r];
    const k = clamp(Math.min((F[2] - F[0]) / (fb[2] - fb[0]), (F[3] - F[1]) / (fb[3] - fb[1])), 0.12, 3);
    const view = { k, ox: (F[0] + F[2]) / 2 - ((fb[0] + fb[2]) / 2) * k, oy: (F[1] + F[3]) / 2 - ((fb[1] + fb[3]) / 2) * k, W, H, u };
    // drawn only while shown (and again when the screen, the map or the lines change)
    const key = JSON.stringify([view, this._tmL?.key, this._tmL?.at, this._tmSig()]);
    if (key === this._tmVKey || !this._tmOn()) return;
    this._tmVKey = key;
    this._tmView = view;
    this._tmDraw();
    this._tmShow();
  },
  /* what the drawing depends on besides the screen: the lines of the stops and their colours */
  _tmSig() {
    return this._M.dep.stops.map((s, si) => this._tmLinesOf(s).map((ref) => {
      const l = this._tmLooks?.[ref];
      return `${ref}${l ? l.glow.join('.') : ''}@${this._tmAnchors(si, ref).map((a) => a.map((v) => v.toFixed(4)).join()).join(';')}`;
    }).join()).join('|');
  },
  _tmX(p) { const V = this._tmView; return [V.ox + p[0] * V.k, V.oy + p[1] * V.k]; },

  _tmDom() {
    const v = this._tview;
    if (!v || v.firstElementChild) return;
    v.innerHTML = `<svg class="tm-svg" aria-hidden="true"></svg><svg class="tm-lit" aria-hidden="true"></svg><div class="tm-vs"></div><i class="tm-scr t"></i><i class="tm-scr b"></i><div class="tm-ov"></div>
      <header class="tm-head"><h2></h2><span class="tm-live off"><i></i><span></span></span></header>
      <div class="tm-foot"><span class="tm-leg"></span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener"></a></div><div class="tm-msg"></div>`;
    this._tmVKey = null;
    // the vehicles stay known; their elements come anew in the new body
    for (const x of this._tmVeh?.values() || []) Object.assign(x, { el: null, arEl: null, etEl: null, pp: null, deg: null, txt: null, side: null, dying: null });
    if (!this._tmVeh) this._tmVeh = new Map();
  },

  /* the map: blocks, parks, water, the railway, the lines of the stops (each direction on its own side) */
  _tmDraw() {
    const G = this._tmG, V = this._tmView, svg = this._tview?.querySelector('.tm-svg');
    if (!G || !V || !svg) return;
    const { W, H, k, u } = V, X = (P) => P.map((p) => this._tmX(p));
    const vis = (P) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const p of P) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); } return c > -80 && a < W + 80 && d > -80 && b < H + 80; };
    const path = (F) => { const P = X(tmPts(F)); return vis(P) ? P : null; };
    const r = clamp(13 * k * 1.6, 4, 11) * u;
    const poly = (rings) => rings.map((F) => { const P = X(tmPts(F)); return P.length > 2 ? tmRound(P, r * 0.7) : ''; }).join('');
    let out = '';
    // the big streets: a faint lighter floor in their gap (one path per width, so the joints do not shine through twice)
    const mj = new Map();
    for (const m of G.major) {
      const P = path(m.p), w = Math.max(2, Math.round(m.w * 1.6 * k));
      if (P) mj.set(w, (mj.get(w) || '') + `M${P.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}`);
    }
    for (const [w, d] of mj) out += `<path class="mj" d="${d}" stroke-width="${w}"/>`;
    for (const b of G.blocks) {
      const P = path(b.p);
      if (P) out += `<path class="bk${b.k === 1 ? ' g' : b.k === 2 ? ' w' : ''}" d="${tmRound(P, r)}"/>`;
    }
    for (const g of G.green) if (path(g[0])) out += `<path class="gr" fill-rule="evenodd" d="${poly(g)}"/>`;
    for (const g of G.water) if (path(g[0])) out += `<path class="wa" fill-rule="evenodd" d="${poly(g)}"/>`;
    for (const F of G.rail) { const P = path(F); if (P) out += `<path class="rl" d="M${P.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}"/>`; }
    // The lines of the stops: quiet structure, offset to the right of their direction (a second line of the same kind a
    // little further). Under the street the direction does not matter: one dashed line per line.
    const refs = [...new Set(this._M.dep.stops.flatMap((s) => this._tmLinesOf(s)))], drawnUg = new Set();
    this._tmScr = new Map();
    const core = [];
    G.routes.forEach((rt, ri) => {
      if (!refs.includes(rt.ref)) return;
      const look = this._tmLook(rt.ref, rt.prod), lane = refs.filter((x) => this._tmLook(x, rt.prod).prod === look.prod).indexOf(rt.ref), ug = rt.mode === 'subway';
      const off = ug ? 0 : (4.5 + Math.max(0, lane) * 3.2) * u, draw = !ug || !drawnUg.has(rt.ref);
      if (ug) drawnUg.add(rt.ref);
      rt.lines.forEach((L, li) => {
        const P = X(L.P), Q = off ? tmOffset(P, off) : P;
        this._tmScr.set(`${ri}:${li}`, { P: Q, S: L.S });
        if (draw && vis(Q)) core.push(`<path class="rt${ug ? ' ug' : ''}" d="M${Q.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}" stroke="rgb(${look.glow.join(',')})"/>`);
      });
    });
    for (const el of [svg, this._tview.querySelector('.tm-lit')]) { el.setAttribute('width', W); el.setAttribute('height', H); el.setAttribute('viewBox', `0 0 ${W} ${H}`); }
    this._tmLitH = null;
    svg.innerHTML = `<defs>
      <linearGradient id="tmg" x1="0" y1="0" x2=".45" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".1"/><stop offset=".55" stop-color="#fff" stop-opacity=".058"/><stop offset="1" stop-color="#fff" stop-opacity=".045"/></linearGradient>
      <linearGradient id="tmgg" x1="0" y1="0" x2=".45" y2="1"><stop offset="0" stop-color="rgb(110,210,135)" stop-opacity=".2"/><stop offset="1" stop-color="rgb(70,170,100)" stop-opacity=".12"/></linearGradient>
      <linearGradient id="tmgw" x1="0" y1="0" x2=".45" y2="1"><stop offset="0" stop-color="rgb(90,160,255)" stop-opacity=".2"/><stop offset="1" stop-color="rgb(40,100,220)" stop-opacity=".11"/></linearGradient>
    </defs>${out}${core.join('')}`;
    // points every few pixels along the lines in view: chips keep off them where they can
    this._tmLinePts = [];
    for (const sc of this._tmScr.values()) for (let i = 1; i < sc.P.length; i++) {
      const a = sc.P[i - 1], b = sc.P[i], n = Math.ceil(tmLen(a, b) / 6);
      for (let k = 0; k < n; k++) { const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]; if (p[0] > 0 && p[1] > 0 && p[0] < W && p[1] < H) this._tmLinePts.push(p); }
    }
    this._tmPl = this._tmPlats();
    this._tmDrawn = this._tmSig();
    this._tmStatic();
  },

  /* The stops: a small glass light on every side of the street with the chip of what comes next there beside it (on the
   * side where one waits) and the name above; a station under the street is one light with a plate beside it – its name
   * and a row per line, like a card of the board. Filled and placed by _tmShow. */
  _tmStatic() {
    const ov = this._tview.querySelector('.tm-ov'), D = this._M.dep, V = this._tmView, u = V.u;
    let html = '', chips = '';
    this._tmSides = [];
    this._tmStops = [];
    for (const st of this._tmPl || []) {
      const s = D.stops[st.si], name = esc(s.name || s.id || ''), up = st.sides.filter((g) => !g.ug), down = st.sides.filter((g) => g.ug);
      for (const g of up) {
        const p = this._tmX(g.pt), dx = -Math.sin(g.ang), dy = Math.cos(g.ang), off = 24 * u, id = `${st.si}-${this._tmSides.length}`;
        html += `<i class="tm-pt" style="transform:translate(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px)"></i>`;
        this._tmSides.push({ g, ax: p[0] + dx * off, ay: p[1] + dy * off, dx, dy, id });
        chips += `<div class="tm-pf" data-side="${id}" style="visibility:hidden"></div>`;
      }
      let stn = null;
      if (down.length) {
        stn = this._tmX(down.reduce((a, g) => [a[0] + g.pt[0] / down.length, a[1] + g.pt[1] / down.length], [0, 0]));
        html += `<i class="tm-pt ug" style="transform:translate(${stn[0].toFixed(1)}px,${stn[1].toFixed(1)}px)"></i>`;
        const rows = down.map((g) => { const id = `${st.si}-${this._tmSides.length}`; this._tmSides.push({ g, row: true, id }); return `<div class="tm-row" data-side="${id}"></div>`; }).join('');
        chips += `<div class="tm-pf st" data-stn="${st.si}" style="visibility:hidden"><div class="tm-sh">${name}</div>${rows}</div>`;
      }
      const pts = up.map((g) => this._tmX(g.pt));
      this._tmStops.push({ si: st.si, stn, pts: pts.length ? pts : stn ? [] : [this._tmX(st.S)] });
      if (!stn || up.length) html += `<span class="tm-sl" data-stop="${st.si}">${name}</span>`;
    }
    ov.innerHTML = `${html}${chips}<div class="tm-hs"></div>`;
  },

  /* ---------------------------------------------------------------- live: radar, vehicles, the minutes */
  _tmRadar() {
    const D = this._M?.dep, V = this._tmView, G = this._tmG;
    if (!this._tmOn() || !D || !V || !G || document.hidden) return;
    const r = (this._tmR = this._tmR || {});
    if (r.busy || Date.now() - (r.tried || 0) < 25e3) return;
    // which lines to look for comes from the departures of a stop without a line filter: wait for its first answer
    if (D.stops.some((s) => !s.lines.length && !this._depState(s).ok)) return;
    // the part of the map in view and a margin
    const m = 0.15, a = G.pr.ll((-V.ox - V.W * m) / V.k, (-V.oy - V.H * m) / V.k), b = G.pr.ll((V.W * (1 + m) - V.ox) / V.k, (V.H * (1 + m) - V.oy) / V.k);
    const prods = new Set(D.stops.flatMap((s) => this._tmLinesOf(s).map((ref) => this._tmLook(ref, G.routes.find((x) => x.ref === ref)?.prod || 'bus').prod)));
    const flags = ['suburban', 'subway', 'tram', 'bus', 'ferry', 'express', 'regional'].map((p) => `${p}=${prods.has(p)}`).join('&');
    const f = (x) => x.toFixed(5);
    r.busy = true;
    r.tried = Date.now();
    tmFetch(`${D.api}/radar?north=${f(a[0])}&west=${f(a[1])}&south=${f(b[0])}&east=${f(b[1])}&results=256&duration=30&frames=3&polylines=true&${flags}`, null, 15e3)
      .then((x) => (x.ok ? x.json() : Promise.reject(new Error(String(x.status)))))
      .then((j) => { r.at = Date.now(); r.err = false; this._tmMoves(Array.isArray(j) ? j : j.movements || [], r.at); })
      .catch(() => { r.err = true; })
      .finally(() => { r.busy = false; this._tmShow(); });
  },
  /* the routes a vehicle of a line can be on */
  _tmCand(ref, prod) { const G = this._tmG; return G.routes.map((r, ri) => [r, ri]).filter(([r]) => r.ref === ref && (!prod || r.prod === prod || TM_MODES[prod]?.includes(r.mode))); },
  /* a vehicle onto its route: the line nearest to its positions that runs the way it moves (standing: from its last stop to
   * the next) – on a divided road that is its own carriageway */
  _tmSnap(ref, prod, pts, from, to, only) {
    let best = null;
    for (const [r, ri] of this._tmCand(ref, prod)) {
      if (only != null && ri !== only) continue;
      r.lines.forEach((L, li) => {
        const on = pts.map((p) => tmOn(L, p)), d = on.reduce((a, o) => a + o.d, 0) / on.length;
        let pen = 0;
        if (tmLen(pts[0], pts[pts.length - 1]) > 6) { if (on[on.length - 1].s < on[0].s - 3) pen = 90; } else if (from && to) {
          const a = tmOn(L, from), b = tmOn(L, to);
          if (a.d < 200 && b.d < 200 && b.s < a.s) pen = 90;
        }
        if (!best || d + pen < best.sc) best = { sc: d + pen, d, ri, li, s: on.map((o) => o.s) };
      });
    }
    // a line it would run backwards on is not its line (rather the raw position)
    return best && best.sc === best.d && best.d < (prod === 'subway' ? 140 : 70) ? best : null;
  },
  _tmMoves(list, T0) {
    const G = this._tmG, D = this._M.dep;
    if (!G) return;
    const refs = new Set(D.stops.flatMap((s) => this._tmLinesOf(s))), now = Date.now(), seen = new Set();
    for (const mv of list) {
      const ref = mv.line?.name;
      if (!refs.has(ref) || !mv.tripId) continue;
      const feats = mv.polyline?.features || [], fr = mv.frames || [];
      let obs = feats.map((f, i) => [T0 + (fr[i]?.t ?? i * 10e3), ...G.pr.xy(f.geometry.coordinates[1], f.geometry.coordinates[0])]);
      if (!obs.length && mv.location) obs = [[T0, ...G.pr.xy(mv.location.latitude, mv.location.longitude)]];
      if (!obs.length) continue;
      const o = fr[0]?.origin?.location, de = fr[0]?.destination?.location;
      this._tmObs(mv.tripId, ref, mv.line.product, obs, o && de ? [G.pr.xy(o.latitude, o.longitude), G.pr.xy(de.latitude, de.longitude)] : null, now);
      seen.add(mv.tripId);
    }
    // gone from the radar: it fades once it has arrived where it was last going
    for (const [id, v] of this._tmVeh) if (!seen.has(id)) v.miss = (v.miss || 0) + 1;
  },
  /* where a vehicle was seen (times, metres): on its route its distance along it, never backwards, from where it is drawn now */
  _tmObs(id, ref, prod, obs, leg, now, only) {
    let v = this._tmVeh.get(id);
    if (!v) { v = { id, ref, prod }; this._tmVeh.set(id, v); }
    v.miss = 0;
    v.prod = prod || v.prod;
    const sn = this._tmSnap(ref, prod, obs.map((o) => o.slice(1)), leg?.[0], leg?.[1], only);
    if (sn) {
      const T = obs.map((o, i) => [o[0], sn.s[i]]);
      if (v.ri === sn.ri && v.li === sn.li && v.track) {
        const cur = tmTrack(v.track, now);
        if (Math.abs(cur - T[0][1]) < 400) { T[0] = [now, cur]; if (T.length === 1) T.push([now + 2500, sn.s[0]]); }
      }
      for (let i = 1; i < T.length; i++) T[i][1] = Math.max(T[i][1], T[i - 1][1]);
      Object.assign(v, { ri: sn.ri, li: sn.li, track: T, raw: null });
    } else Object.assign(v, { ri: -1, li: -1, track: null, raw: obs });
  },

  /* the minutes of a trip at one of the stops, and which side of the street it stops at */
  _tmPlatOf(st, d) {
    const G = this._tmG, cand = st.plats.filter((p) => p.ref === d.line);
    if (cand.length < 2) return cand[0] || null;
    const v = this._tmVeh?.get(d.trip);
    if (v && v.ri >= 0) { const p = cand.find((x) => x.ri === v.ri && x.li === v.li) || cand.find((x) => x.ri === v.ri); if (p) return p; }
    const cos = (a, b) => ((a[0] * b[0] + a[1] * b[1]) / ((Math.hypot(...a) * Math.hypot(...b)) || 1));
    const line = (p) => G.routes[p.ri].lines[p.li];
    if (d.pos) {
      // on the route before the stop: that one; far out: the route that comes from where it is
      const P = G.pr.xy(...d.pos);
      let best = null;
      for (const p of cand) {
        const L = line(p), o = tmOn(L, P), up = tmAtS(L, p.s - 600).p, S = p.pt;
        const sc = o.d < 60 && o.s <= p.s + 25 ? o.d : 1000 - 500 * cos([P[0] - S[0], P[1] - S[1]], [up[0] - S[0], up[1] - S[1]]);
        if (!best || sc < best.sc) best = { sc, p };
      }
      return best.p;
    }
    if (d.to) {
      const P = G.pr.xy(...d.to);
      return cand.map((p) => { const dn = tmAtS(line(p), p.s + 600).p, S = p.pt; return [p, cos([P[0] - S[0], P[1] - S[1]], [dn[0] - S[0], dn[1] - S[1]])]; }).sort((a, b) => b[1] - a[1])[0][0];
    }
    const n = (x) => depDir(x).toLowerCase();
    return cand.find((p) => n(G.routes[p.ri].to).includes(n(d.dir)) || n(d.dir).includes(n(G.routes[p.ri].to))) || cand[0];
  },

  /* everything that changes with the minutes: the chips of the sides, the vehicles' state and minutes, the hints at the edge */
  _tmShow() {
    const v = this._tview, D = this._M?.dep;
    if (!v || !D || this._layer()?.type !== 'departures_map') return;
    this._tmShown = Date.now();
    this._tmDom();
    if (!this._tmG) this._tmLoad();
    this._tmRadar();
    v.querySelector('.tm-head h2').textContent = this._layerName(this._layer());
    // the source of the map (another one than OpenStreetMap only when configured – the demo's made-up town)
    const a = v.querySelector('.tm-foot a'), attr = D.map.attribution || t('tmAttr');
    if (a.textContent !== attr) { a.textContent = attr; if (D.map.attribution) a.removeAttribute('href'); }
    const G = this._tmG, V = this._tmView, now = Date.now();
    // live while the departures and the radar are fresh
    const r = this._tmR || {}, states = D.stops.map((s) => this._depState(s)), fresh = states.every((x) => x.fresh) && r.at && now - r.at < 75e3 && !r.err;
    const live = v.querySelector('.tm-live'), ats = states.filter((x) => x.ok && x.at).map((x) => x.at).concat(r.at ? [r.at] : []);
    live.classList.toggle('off', !fresh);
    live.lastElementChild.textContent = fresh ? t('depLive') : ats.length ? t('depAsOf', new Date(Math.min(...ats)).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })) : t('depLoadingShort');
    if (!G || !V) return;
    if (this._tmSig() !== this._tmDrawn) { this._tmVKey = null; this._tmLayout(); return; }
    const leg = v.querySelector('.tm-leg'), ug = G.routes.some((x) => x.mode === 'subway' && D.stops.some((s) => this._tmLinesOf(s).includes(x.ref)));
    const lh = ug ? `<i></i>${esc(t(this._m ? 'tmUndergroundShort' : 'tmUnderground'))}` : '';
    if (leg.dataset.h !== lh) { leg.dataset.h = lh; leg.innerHTML = lh; }
    // the trips at the stops: minutes and side
    this._tmEta = new Map();
    const bySide = new Map();
    for (const st of this._tmPl || []) {
      for (const d of this._depList(D.stops[st.si])) {
        if (!d.trip) continue;
        const p = this._tmPlatOf(st, d);
        if (!p) continue;
        const g = st.sides.find((x) => x.plats.includes(p));
        const e = { d, p, g, st };
        if (!d.cancelled) { if (!this._tmEta.has(d.trip)) this._tmEta.set(d.trip, []); this._tmEta.get(d.trip).push(e); }
        if (g) { if (!bySide.has(g)) bySide.set(g, []); bySide.get(g).push(e); }
      }
    }
    // without a fresh radar the departures tell where the vehicles are (once, they move on with the next)
    if (!(r.at && now - r.at < 70e3)) for (const [, es] of this._tmEta) { const e = es[0]; if (e.d.pos && e.d.t - now < 20 * 60e3) this._tmObs(e.d.trip, e.d.line, e.d.product, [[now, ...G.pr.xy(...e.d.pos)]], [G.pr.xy(...e.d.pos), e.p.pt], now, e.p.ri); }
    const unit = t('min'), mins = (ms) => { const m = Math.floor((ms - now) / 60000); return m < 1 ? null : m; };
    const mnHtml = (d) => { const m = mins(d.t); return `<span class="tm-mn${d.delay >= DEP_LATE ? ' late' : ''}">${m == null ? esc(t('depNow')) : `${m}<small>${esc(unit)}</small>`}</span>`; };
    const order = (a, b) => (DEP_ORDER.indexOf(this._tmLook(a, 'bus').prod) - DEP_ORDER.indexOf(this._tmLook(b, 'bus').prod)) || a.localeCompare(b, undefined, { numeric: true });
    for (const el of this._tmSides || []) {
      const node = v.querySelector(`[data-side="${el.id}"]`);
      if (!node) continue;
      const list = bySide.get(el.g) || [], next = (f) => list.filter((e) => f(e) && !e.d.cancelled).sort((x, y) => x.d.t - y.d.t)[0];
      const arrow = (a) => `<span class="ar">${icon('arrowR').replace('<svg', `<svg style="transform:rotate(${((a * 180) / Math.PI).toFixed(0)}deg)"`)}</span>`;
      const none = '<span class="tm-mn none">–</span>';
      // the soonest first and in full, the others after it (a line without a departure last)
      const byTime = (items) => items.sort((a, b) => (a.nx ? a.nx.d.t : Infinity) - (b.nx ? b.nx.d.t : Infinity)).map((x, i) => ({ ...x, hero: i === 0 && !!x.nx }));
      const html = el.g.ug
        // a subway line in its station's plate: the badge, then each direction with its arrow
        ? `${this._tmBadge(el.g.refs[0], this._tmLook(el.g.refs[0], el.g.plats[0].prod))}${byTime(el.g.plats.map((p) => ({ p, nx: next((e) => e.p === p) })))
          .map((x) => `<span class="tm-ln${x.hero ? ' hero' : ''}">${arrow(x.p.ang)}${x.nx ? mnHtml(x.nx.d) : none}</span>`).join('')}`
        // a side of the street: where it goes, then every line stopping there
        : `${arrow(el.g.ang)}${byTime(el.g.refs.map((ref) => ({ ref, nx: next((e) => e.d.line === ref) })))
          .map((x) => `<span class="tm-ln${x.hero ? ' hero' : ''}">${this._tmBadge(x.ref, this._tmLook(x.ref, el.g.plats[0].prod))}${x.nx ? mnHtml(x.nx.d) : none}</span>`).join('')}`;
      if (node.dataset.h !== html) { node.dataset.h = html; node.innerHTML = html; }
      if (el.row) continue;
      el.node = node;
      el.w = node.offsetWidth;
      el.h = node.offsetHeight;
      // beside the street, never over it: centred on a point pushed out until the chip clears it
      const ext = (Math.abs(el.dx) * el.w) / 2 + (Math.abs(el.dy) * el.h) / 2, x = el.ax + el.dx * ext - el.w / 2, y = el.ay + el.dy * ext - el.h / 2;
      el.box = [x, y, x + el.w, y + el.h];
    }
    // a street stop's name above its lights; a station's plate beside its light where it covers the fewest lines and nothing
    // of the other stops (their chips, names and lights)
    const E = this._tmBox.E, u = V.u, taken = (this._tmSides || []).filter((e) => e.box && !e.row).map((e) => e.box);
    for (const st of this._tmStops || []) {
      const lab = v.querySelector(`.tm-sl[data-stop="${st.si}"]`);
      if (!lab || !st.pts.length) continue;
      const cx = st.pts.reduce((a, p) => a + p[0], 0) / st.pts.length, top = Math.min(...st.pts.map((p) => p[1])) - 24 * u, w = lab.offsetWidth, h = lab.offsetHeight;
      lab.style.transform = `translate(${(cx - w / 2).toFixed(1)}px,${(top - h).toFixed(1)}px)`;
      taken.push([cx - w / 2, top - h, cx + w / 2, top], ...st.pts.map((p) => [p[0] - 8, p[1] - 8, p[0] + 8, p[1] + 8]));
    }
    this._tmPlates = [];
    for (const st of this._tmStops || []) {
      const plate = st.stn && v.querySelector(`.tm-pf.st[data-stn="${st.si}"]`);
      if (!plate) continue;
      const at = st.stn, w = plate.offsetWidth, H = plate.offsetHeight;
      const busy = (x0, y0) => this._tmLinePts.reduce((n, p) => n + (p[0] > x0 - 4 && p[0] < x0 + w + 4 && p[1] > y0 - 4 && p[1] < y0 + H + 4), 0)
        + 60 * taken.filter((b) => x0 - 6 < b[2] && x0 + w + 6 > b[0] && y0 - 6 < b[3] && y0 + H + 6 > b[1]).length;
      const opts = [[at[0] + 16 * u, at[1] - H / 2], [at[0] - 16 * u - w, at[1] - H / 2], [at[0] + 12 * u, at[1] + 14 * u], [at[0] + 12 * u, at[1] - 14 * u - H],
        [at[0] - 12 * u - w, at[1] + 14 * u], [at[0] - 12 * u - w, at[1] - 14 * u - H], [at[0] - w / 2, at[1] - 16 * u - H], [at[0] - w / 2, at[1] + 16 * u]]
        .filter((o) => o[0] >= E[0] && o[0] + w <= E[2] && o[1] >= E[1] && o[1] + H <= E[3]);
      const best = opts.map((o, i) => [o, busy(...o) + i * 0.5]).sort((a, b) => a[1] - b[1])[0]?.[0] || [clamp(at[0] + 16 * u, E[0], E[2] - w), clamp(at[1] - H / 2, E[1], E[3] - H)];
      const box = [best[0], best[1], best[0] + w, best[1] + H];
      this._tmPlates.push({ node: plate, box, fixed: true });
      taken.push(box);
    }
    this._tmLabelsApart();
    this._tmHints(bySide, mnHtml);
    this._tmKick();
  },
  /* chips beside the street that would overlap move apart (the shorter way), away from names, lights and a station's
   * stack, inside the card */
  _tmLabelsApart() {
    const S = (this._tmSides || []).filter((e) => e.box && !e.row), all = S.concat(this._tmPlates || []), B = this._tmBox, rb = this._root.getBoundingClientRect(), sc = rb.width / B.W || 1;
    const fixed = [...this._tview.querySelectorAll('.tm-sl, .tm-pt')].map((n) => { const b = n.getBoundingClientRect(); return [(b.left - rb.left) / sc, (b.top - rb.top) / sc, (b.right - rb.left) / sc, (b.bottom - rb.top) / sc]; })
      .concat((this._tmPlates || []).map((e) => e.box), B.keep);
    const push = (a, b, both) => {
      const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]) + 6, oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]) + 6;
      if (ox <= 0 || oy <= 0) return false;
      const ax = ox < oy ? 0 : 1, d = ((ax ? oy : ox) / (both ? 2 : 1)), sg = Math.sign(b[ax] + b[ax + 2] - a[ax] - a[ax + 2]) || 1;
      b[ax] += d * sg; b[ax + 2] += d * sg;
      if (both) { a[ax] -= d * sg; a[ax + 2] -= d * sg; }
      return true;
    };
    // inside the card while they move (so a chip at the edge gives way up or down instead)
    const inside = (b) => {
      const w = b[2] - b[0], h = b[3] - b[1], x = clamp(b[0], B.E[0], B.E[2] - w), y = clamp(b[1], B.E[1], B.E[3] - h);
      b.splice(0, 4, x, y, x + w, y + h);
    };
    all.forEach((e) => inside(e.box));
    for (let it = 0; it < 16; it++) {
      let moved = false;
      for (let i = 0; i < S.length; i++) {
        for (let j = i + 1; j < S.length; j++) moved = push(S[i].box, S[j].box, true) || moved;
        for (const f of fixed) moved = push(f, S[i].box, false) || moved;
      }
      S.forEach((e) => inside(e.box));
      if (!moved) break;
    }
    for (const e of all) {
      e.node.style.transform = `translate(${e.box[0].toFixed(1)}px,${e.box[1].toFixed(1)}px)`;
      e.node.style.visibility = '';
    }
  },
  /* the next vehicle of each line and side that is not on the map yet: at the edge where its route comes in */
  _tmHints(bySide, mnHtml) {
    const box = this._tview.querySelector('.tm-hs'), B = this._tmBox, now = Date.now();
    if (!box || !B) return;
    this._tmFrame();
    const F = B.E, inF = (p) => p[0] >= F[0] && p[0] <= F[2] && p[1] >= F[1] && p[1] <= F[3], onCard = (p) => p[0] > 0 && p[0] < B.W && p[1] > 0 && p[1] < B.H;
    const hints = [];
    for (const [g, list] of bySide) for (const key of g.ug ? g.plats : g.refs) {
      const ref = g.ug ? key.ref : key, mine = (x) => (g.ug ? x.p === key : x.d.line === ref);
      const e = list.filter((x) => mine(x) && !x.d.cancelled && x.d.t > now + 30e3 && x.d.t - now < (this._m ? 10 : 15) * 60e3).sort((x, y) => x.d.t - y.d.t)[0];
      if (!e) continue;
      const vh = this._tmVeh.get(e.d.trip);
      if (vh?.xy && onCard(vh.xy)) continue;
      const sc = this._tmScr.get(`${e.p.ri}:${e.p.li}`);
      if (!sc) continue;
      // walk back along the route from the stop until it leaves the view
      const at = tmAtS(sc, e.p.s);
      let q = null, ang = 0, b = at.p;
      for (let i = at.i - 1; i >= 0; b = sc.P[i], i--) {
        const a = sc.P[i];
        if (!inF(a)) {
          let lo = 0, hi = 1;
          for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2, p = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]; if (inF(p)) hi = m; else lo = m; }
          q = [a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi];
          ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
          break;
        }
      }
      if (!q) {
        // the route data begin inside the view: on along its first stretch, backwards, to the edge
        const a = sc.P[0], b = sc.P[1], dl = tmLen(a, b) || 1, dir = [(b[0] - a[0]) / dl, (b[1] - a[1]) / dl];
        const ts = [(F[0] - a[0]) / -dir[0], (F[2] - a[0]) / -dir[0], (F[1] - a[1]) / -dir[1], (F[3] - a[1]) / -dir[1]].filter((x) => Number.isFinite(x) && x >= 0);
        const tt = ts.length ? Math.min(...ts) : 0;
        q = [a[0] - dir[0] * tt, a[1] - dir[1] * tt];
        ang = Math.atan2(dir[1], dir[0]);
      }
      hints.push({ q, ang, e, ref });
    }
    // hints at the same spot share a chip
    const groups = [];
    for (const h of hints) { const g = groups.find((x) => tmLen(x.q, h.q) < 60 && Math.cos(x.ang - h.ang) > 0.5); if (g) g.list.push(h); else groups.push({ q: h.q, ang: h.ang, list: [h] }); }
    const hh = groups.map((g) => {
      const items = g.list.sort((a, b) => a.e.d.t - b.e.d.t).map((h) => `<span class="tm-ln">${this._tmBadge(h.ref, this._tmLook(h.ref, h.e.p.prod))}${mnHtml(h.e.d)}</span>`).join('');
      return `<div class="tm-h" data-x="${g.q[0].toFixed(1)}" data-y="${g.q[1].toFixed(1)}"><span class="ar">${icon('arrowR').replace('<svg', `<svg style="transform:rotate(${((g.ang * 180) / Math.PI).toFixed(0)}deg)"`)}</span>${items}</div>`;
    }).join('');
    if (box.dataset.h !== hh) { box.dataset.h = hh; box.innerHTML = hh; }
    // the chips of the stops are there first
    const placed = (this._tmSides || []).filter((e) => e.box && !e.row).concat(this._tmPlates || []).map((e) => [e.box[0] - 4, e.box[1] - 4, e.box[2] + 4, e.box[3] + 4]);
    for (const el of box.children) {
      const w = el.offsetWidth, h = el.offsetHeight;
      let x = clamp(+el.dataset.x - w / 2, F[0], F[2] - w), y = clamp(+el.dataset.y - h / 2, F[1], F[3] - h);
      // along its edge past the heading, the layer bar and the hints already there
      const side = Math.min(x - F[0], F[2] - w - x) < Math.min(y - F[1], F[3] - h - y) ? 'v' : 'h';
      for (let it = 0; it < 6; it++) {
        const o = B.keep.concat(placed).find((q) => x < q[2] && x + w > q[0] && y < q[3] && y + h > q[1]);
        if (!o) break;
        if (side === 'v') y = o[3] + 6 + h <= F[3] ? o[3] + 6 : o[1] - 6 - h;
        else x = o[2] + 6 + w <= F[2] ? o[2] + 6 : o[0] - 6 - w;
      }
      placed.push([x, y, x + w, y + h]);
      el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    }
  },

  /* ---------------------------------------------------------------- the vehicles move (only while the map is shown) */
  _tmKick() {
    if (this._tmRaf || !this._tmOn()) return;
    const step = () => {
      if (!this._tmOn() || document.hidden) { this._tmRaf = null; return; }
      this._tmRaf = requestAnimationFrame(step);
      this._tmFrame();
      // while the map is really on screen (frames run only then) it asks for news itself – timers of a covered or
      // background browser window are slowed down; both requests keep their own pace
      const now = Date.now();
      if (now - (this._tmPoll || 0) > 5e3) { this._tmPoll = now; this._depFetch(); this._tmRadar(); }
      if (now - (this._tmShown || 0) > 10e3) this._tmShow();
    };
    this._tmRaf = requestAnimationFrame(step);
  },
  _tmFrame() {
    const box = this._tview?.querySelector('.tm-vs'), G = this._tmG, V = this._tmView;
    if (!box || !G || !V || !this._tmScr) return;
    const now = Date.now(), u = V.u, lit = now - (this._tmLitT || 0) > 400 ? [] : null;
    let boxes = null;
    for (const [id, v] of this._tmVeh) {
      let p = null, ang = v.ang || 0, s = null;
      if (v.track) {
        s = tmTrack(v.track, now);
        const sc = this._tmScr.get(`${v.ri}:${v.li}`);
        if (sc) {
          const a = tmAtS(sc, s), P = sc.P, i = a.i;
          p = a.p;
          ang = Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]);
        }
      } else if (v.raw) {
        const R = v.raw, T = R.map((o) => o[0]);
        let i = T.findIndex((x) => x > now);
        if (i < 0) i = R.length - 1;
        const a = R[Math.max(0, i - 1)], b = R[i], f = b[0] > a[0] ? clamp((now - a[0]) / (b[0] - a[0]), 0, 1) : 1;
        p = this._tmX([a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
        if (tmLen(a.slice(1), b.slice(1)) > 2) ang = Math.atan2(b[2] - a[2], b[1] - a[1]);
      }
      // the stop it heads for: of the stops it calls at, the next one still ahead of it (metres along the whole route)
      const vrs = s != null && v.ri >= 0 ? G.routes[v.ri].lines[v.li].o + s : null;
      const e = (this._tmEta?.get(id) || []).filter((x) => x.d.t > now - 45e3 && (vrs == null || x.p.ri !== v.ri || vrs <= x.p.rs + 25)).sort((a, b) => a.d.t - b.d.t)[0] || null;
      // gone from the radar: it fades once it has reached its last position; leaving (no stop ahead): a quiet dot
      const last = v.track ? v.track[v.track.length - 1][0] : v.raw ? v.raw[v.raw.length - 1][0] : 0;
      const out = !p || (v.miss && now > last) || v.miss > 2 || now - last > 90e3;
      const gone = !e, ahead = e && vrs != null && e.p.ri === v.ri ? e.p.rs - vrs : null;
      // its way to the stop lights up in its colour
      if (lit && ahead != null && ahead > 0 && e.p.li === v.li) {
        const sc = this._tmScr.get(`${v.ri}:${v.li}`), a = sc && tmAtS(sc, s), b = sc && tmAtS(sc, e.p.s);
        if (sc && b.i >= a.i) {
          const d = `M${[a.p, ...sc.P.slice(a.i, b.i), b.p].map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('L')}`, c = `rgb(${this._tmLook(v.ref, v.prod).glow.join(',')})`, ug = v.prod === 'subway' ? ' ug' : '';
          lit.push(`<path class="gl${ug}" d="${d}" stroke="${c}"/><path class="co${ug}" d="${d}" stroke="${c}"/>`);
        }
      }
      if (!v.el) {
        if (out) { this._tmVeh.delete(id); continue; }
        const look = this._tmLook(v.ref, v.prod);
        v.el = mk('div', `tm-v${v.prod === 'subway' ? ' ug' : ''} out`);
        v.el.style.setProperty('--lc', look.bg.join(','));
        v.el.style.setProperty('--lcl', look.bg.map((c) => Math.round(c + (255 - c) * 0.35)).join(','));
        v.el.style.setProperty('--lf', `rgb(${look.fg.join(',')})`);
        v.el.innerHTML = `<i class="tm-vp"></i><b class="tm-vd">${esc(v.ref)}</b><span class="tm-ve"></span>`;
        box.append(v.el);
        v.arEl = v.el.querySelector('.tm-vp');
        v.etEl = v.el.querySelector('.tm-ve');
        requestAnimationFrame(() => v.el?.classList.remove('out'));
      }
      if (out) {
        if (!v.dying) { v.dying = now; v.el.classList.add('out'); }
        if (now - v.dying > 800) { v.el.remove(); this._tmVeh.delete(id); }
        continue;
      }
      v.xy = p;
      if (!v.pp || Math.abs(v.pp[0] - p[0]) > 0.15 || Math.abs(v.pp[1] - p[1]) > 0.15) { v.pp = p; v.el.style.transform = `translate(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px)`; }
      // the arrow turns the short way round
      if (v.ang == null) v.ang = ang;
      else v.ang += Math.atan2(Math.sin(ang - v.ang), Math.cos(ang - v.ang));
      const deg = Math.round((v.ang * 180) / Math.PI);
      if (deg !== v.deg) { v.deg = deg; v.arEl.style.transform = `rotate(${deg}deg)`; }
      v.el.classList.toggle('gone', gone);
      // off the card: not drawn (its minutes would hang at the edge)
      v.el.classList.toggle('off', p[0] < -20 || p[1] < -20 || p[0] > V.W + 20 || p[1] > V.H + 20);
      // the minutes beside it – not once it is close to its stop: the chip there says it
      const m = e ? Math.floor((e.d.t - now) / 60000) : null, txt = e && !(ahead != null && ahead < 160) ? (m < 1 ? t('depNow') : t('tmIn', m)) : '';
      if (txt !== v.txt) { v.txt = txt; v.etEl.textContent = txt; v.etW = v.etEl.offsetWidth; v.etH = v.etEl.offsetHeight; }
      // the minutes beside the marker – on the side away from the edge and clear of the stops' chips (there the chip says it)
      if (txt) {
        const off = 25 * u, w = v.etW || 60, h = v.etH || 20, chips = boxes || (boxes = (this._tmSides || []).filter((x) => x.box && !x.row).concat(this._tmPlates || []).map((x) => x.box));
        const hit = (x0) => chips.some((b) => x0 < b[2] && x0 + w > b[0] && p[1] - h / 2 < b[3] && p[1] + h / 2 > b[1]);
        const rx = p[0] + off, lx = p[0] - off - w, prefer = p[0] > V.W - 140 * u ? 'l' : 'r';
        const side = !hit(prefer === 'r' ? rx : lx) ? prefer : !hit(prefer === 'r' ? lx : rx) ? (prefer === 'r' ? 'l' : 'r') : 'x';
        if (side !== v.side) { v.side = side; v.etEl.classList.toggle('l', side === 'l'); v.etEl.classList.toggle('x', side === 'x'); }
      }
    }
    if (lit) {
      this._tmLitT = now;
      const html = lit.join(''), svg = this._tview.querySelector('.tm-lit');
      if (svg && html !== this._tmLitH) { this._tmLitH = html; svg.innerHTML = html; }
    }
  },
});

/* a line moved sideways by d pixels (to the right of its direction) */
function tmOffset(P, d) {
  const n = P.length;
  if (n < 2) return P.slice();
  const N = [];
  for (let i = 1; i < n; i++) { const a = P[i - 1], b = P[i], l = tmLen(a, b) || 1; N.push([-(b[1] - a[1]) / l, (b[0] - a[0]) / l]); }
  return P.map((p, i) => {
    const a = N[Math.max(0, i - 1)], b = N[Math.min(N.length - 1, i)], m = [a[0] + b[0], a[1] + b[1]], ml = Math.hypot(m[0], m[1]) || 1;
    const k = d / Math.max(0.5, (m[0] * a[0] + m[1] * a[1]) / ml);
    return [p[0] + (m[0] / ml) * k, p[1] + (m[1] / ml) * k];
  });
}
/* metres along the route at a time: between the observations, held at the ends */
function tmTrack(T, now) {
  if (now <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (now <= T[i][0]) { const a = T[i - 1], b = T[i]; return a[1] + ((b[1] - a[1]) * (now - a[0])) / ((b[0] - a[0]) || 1); }
  return T[T.length - 1][1];
}
/* a fetch that gives up after `ms` (a request that hangs would block its next one for good) */
function tmFetch(url, opt, ms) {
  const ab = typeof AbortController === 'function' ? new AbortController() : null, tm = ab && setTimeout(() => ab.abort(), ms);
  return fetch(url, { ...(opt || {}), ...(ab ? { signal: ab.signal } : {}) }).finally(() => clearTimeout(tm));
}
/* the browser's store keeps the three newest maps (Home Assistant shares it); older than 30 days go */
function tmKeep3(key, val) {
  try {
    const own = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(TM_KEY) && k !== key) own.push(k); }
    const dated = own.map((k) => { let at = 0; try { at = JSON.parse(localStorage.getItem(k) || '{}').at || 0; } catch (e) { /* broken: goes */ } return [k, at]; }).sort((a, b) => b[1] - a[1]);
    dated.forEach(([k, at], i) => { if (i >= 2 || Date.now() - at > TM_KEEP) localStorage.removeItem(k); });
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) { /* too big for the store: kept for this visit */ }
}
/* a short fingerprint of a text (for keys in the browser's store) */
function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

Object.assign(STR.en, {
  layer_departures_map: 'Map', tmIn: (m) => `in ${m} min`, tmLoading: 'Loading the map …', tmOffline: 'Map data not reachable – trying again shortly',
  tmNoStops: 'The live map needs stops with an id', tmAttr: '© OpenStreetMap contributors', tmUnderground: 'Subway under the street · position estimated',
  tmUndergroundShort: 'Subway · position estimated', tmBadStop: 'A stop of the map is not known to the timetable',
});
Object.assign(STR.de, {
  layer_departures_map: 'Karte', tmIn: (m) => `in ${m} Min.`, tmLoading: 'Karte wird geladen …', tmOffline: 'Kartendaten nicht erreichbar – neuer Versuch gleich',
  tmNoStops: 'Die Live-Karte braucht Haltestellen mit id', tmAttr: '© OpenStreetMap-Mitwirkende', tmUnderground: 'U-Bahn unter der Straße · Position geschätzt',
  tmUndergroundShort: 'U-Bahn · Position geschätzt', tmBadStop: 'Eine Haltestelle der Karte kennt der Fahrplan nicht',
});
