/* ================================================================== Live map: the buses and trains of the stops on the streets around them
 * A second view of the departures. The streets near the stops are drawn like the floor plan: every block a glass tile,
 * the streets the gaps between them, parks and water tinted glass. The lines of the stops glow in their colours, each
 * direction on its own side of the street (on its own carriageway where the road is divided, else to the right), and every
 * vehicle on its way is a glass marker in its line's colour with an arrow and the minutes until it is at the stop. Each side
 * of a stop shows what comes next there; vehicles further out wait at the edge of the map.
 * Map: OpenStreetMap through an Overpass API – fetched once, simplified to metres and kept for 30 days. Vehicles: where the
 * departures (every 30 s while the map is shown) say they are, moved on by the card so that each is at the stop at its time –
 * nothing else is asked for. These positions are estimated from timetable and live delays between the stops – the subway's
 * even more so, it runs under the street: dashed and quieter. Once a second the card says where each vehicle will be a
 * second later and the browser glides it there (no script runs in between). */
const TM_V = 4;
const TM_KEEP = 30 * 864e5;
const TM_KEY = 'glass-floorplan-card:map:';
/* half a street from its centre line to the houses (metres): the gap between the blocks */
const TM_HALF = { motorway: 16, trunk: 15, primary: 14, secondary: 12, tertiary: 10, unclassified: 8, residential: 8, living_street: 6.5, pedestrian: 6.5, rail: 7, light_rail: 6, narrow_gauge: 5 };
/* the kinds of street, the most important first (the order their names are given room in) */
const TM_RANK = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'pedestrian'];
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
 * turns over has vanished and goes. */
function tmInset(P, W) {
  let E = P.map((a, i) => {
    const b = P[(i + 1) % P.length], l = tmLen(a, b) || 1e-9, e = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    return { a, e, n: [-e[1], e[0]], w: W[i], l };
  });
  for (let guard = 0; guard < 80 && E.length >= 3; guard++) {
    const n = E.length, V = [];
    for (let i = 0; i < n; i++) {
      const A = E[(i - 1 + n) % n], B = E[i], cr = A.e[0] * B.e[1] - A.e[1] * B.e[0];
      const pa = [A.a[0] + A.n[0] * A.w, A.a[1] + A.n[1] * A.w], pb = [B.a[0] + B.n[0] * B.w, B.a[1] + B.n[1] * B.w];
      if (Math.abs(cr) < 0.06) { V.push([pb]); continue; }
      const t = ((pb[0] - pa[0]) * B.e[1] - (pb[1] - pa[1]) * B.e[0]) / cr;
      V.push([[pa[0] + A.e[0] * t, pa[1] + A.e[1] * t]]);
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

/* the ways of a street joined where they meet (in any order and direction) */
function tmJoin(pieces) {
  const eq = (p, q) => Math.abs(p[0] - q[0]) < 0.5 && Math.abs(p[1] - q[1]) < 0.5, left = pieces.slice(), out = [];
  while (left.length) {
    let cur = left.pop().slice();
    for (let grown = true; grown;) {
      grown = false;
      for (let i = 0; i < left.length; i++) {
        const w = left[i], a = cur[0], b = cur[cur.length - 1];
        if (eq(b, w[0])) cur = cur.concat(w.slice(1));
        else if (eq(b, w[w.length - 1])) cur = cur.concat(w.slice(0, -1).reverse());
        else if (eq(a, w[w.length - 1])) cur = w.concat(cur.slice(1));
        else if (eq(a, w[0])) cur = w.slice(1).reverse().concat(cur);
        else continue;
        left.splice(i, 1);
        grown = true;
        break;
      }
    }
    out.push(cur);
  }
  return out;
}
/* the runs of a line inside a rectangle */
function tmCut(P, R) {
  const out = [];
  let run = [];
  for (const p of P) {
    if (p[0] >= R[0] && p[0] <= R[2] && p[1] >= R[1] && p[1] <= R[3]) run.push(p);
    else { if (run.length > 1) out.push(run); run = []; }
  }
  if (run.length > 1) out.push(run);
  return out;
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
      const ring = w.slice(0, -1), n = ring.length, at = (p) => ring.findIndex((q) => eq(q, p));
      if (fresh && at(cur[cur.length - 1]) < 0 && at(cur[0]) >= 0) cur.reverse();
      const i = at(cur[cur.length - 1]), nx = pieces[k + 1];
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
  const lines = [], green = [], water = [], rail = [], major = [], routes = [], named = new Map();
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
      if (hw && tg.name && !tg.highway.endsWith('_link')) {
        const x = named.get(tg.name) || { k: 9, w: 0, P: [] };
        named.set(tg.name, Object.assign(x, { k: Math.min(x.k, TM_RANK.indexOf(hw)), w: Math.max(x.w, w) }));
        x.P.push(P);
      }
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
  // the streets' names: their ways joined, inside the area, simplified
  const names = [];
  for (const [n, x] of named) {
    const p = tmJoin(x.P).flatMap((P) => tmCut(P, box)).map((P) => tmSimp(P, 1.5)).filter((P) => P.reduce((a, q, i) => a + (i ? tmLen(P[i - 1], q) : 0), 0) > 40).map(tmFlat);
    if (p.length) names.push({ n, k: x.k, w: x.w, p });
  }
  return { v: TM_V, c, half, blocks, green: loose(green, 1), water: loose(water, 2), rail, major, routes, names };
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
/* the board's cool pool of light shows through the streets, as the plan floats on the card's light */
.root[data-type="departures_map"] .bg .g6 { opacity: .8; }
.root[data-type="departures_map"] .bg .dots { opacity: 0; }
/* the layer bar over a map: the same glass, a little denser (the streets would show through) */
.root[data-type="departures_map"] .tabs { background: linear-gradient(165deg, rgba(255, 255, 255, .1), rgba(255, 255, 255, .05)), rgba(24, 25, 30, .74); }

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
.tm-svg .bk { fill: url(#tmg); stroke: rgba(255, 255, 255, .085); stroke-width: 1; }
.tm-svg .bk.g { fill: url(#tmgg); stroke: rgba(130, 220, 150, .18); }
.tm-svg .bk.w, .tm-svg .wa { fill: url(#tmgw); stroke: rgba(120, 180, 255, .22); stroke-width: 1; }
.tm-svg .gr { fill: rgba(70, 190, 105, .08); stroke: rgba(130, 220, 150, .12); stroke-width: 1; }
.tm-svg .mj { fill: none; stroke: rgba(255, 255, 255, .04); stroke-linecap: round; stroke-linejoin: round; }
.tm-svg .rl { fill: none; stroke: rgba(255, 255, 255, .08); stroke-width: 1; }
/* the streets' names: quiet, in the street, cut clean out of what they cross */
.tm-svg .nm text { font-weight: 500; letter-spacing: .02em; fill: rgba(235, 235, 245, .34); paint-order: stroke; stroke: rgba(12, 13, 18, .5); stroke-width: 3px; stroke-linejoin: round; }
.tm-svg .nm text.mj { fill: rgba(235, 235, 245, .44); }
/* the lines are structure: thin and quiet – colour at full strength only where a vehicle comes in to a stop */
.tm-svg .rt { fill: none; stroke-width: calc(1.4 * var(--tm-u)); opacity: .42; stroke-linecap: round; stroke-linejoin: round; }
.tm-svg .rt.ug { stroke-width: calc(1.4 * var(--tm-u)); stroke-dasharray: calc(4 * var(--tm-u)) calc(5 * var(--tm-u)); opacity: .42; }
.tm-lit path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
/* a soft light along the way, not a beam: one solid stroke, a faint glow (under the street: quieter still) */
.tm-lit path.gl { stroke-width: calc(6 * var(--tm-u)); opacity: .14; }
.tm-lit path.co { stroke-width: calc(2.2 * var(--tm-u)); opacity: .8; }
.tm-lit path.ug.co { opacity: .6; }
.tm-lit path.ug.gl { opacity: .1; }

/* layers: map, lit ways, vehicles, the bands of heading and footer, then the stops – the answer is never covered */
.tm-lit { z-index: 1; }
.tm-vs { z-index: 2; }
.tm-scr { position: absolute; left: 0; right: 0; z-index: 2; pointer-events: none; }
.tm-scr.t { top: 0; height: 70px; background: linear-gradient(rgba(8, 9, 12, .78), rgba(8, 9, 12, 0)); }
.tm-scr.b { bottom: 0; height: 64px; background: linear-gradient(rgba(8, 9, 12, 0), rgba(8, 9, 12, .86) 70%); }
.m .tm-scr.b { height: 84px; background: linear-gradient(rgba(8, 9, 12, 0), rgba(8, 9, 12, .92) 60%); }
.tm-ov { z-index: 3; }
.tm-ov, .tm-vs { position: absolute; inset: 0; pointer-events: none; }
.tm-ov > *, .tm-vs > *, .tm-hs > * { position: absolute; left: 0; top: 0; }

/* a stop by the street: its name quiet, a small glass light on each side, a chip of what comes next beside it */
.tm-sl { font-size: max(12.5px, calc(13 * var(--tm-u))); font-weight: 500; white-space: nowrap; color: rgba(235, 235, 245, .66);
  text-shadow: 0 0 6px rgba(0, 0, 0, .85), 0 1px 10px rgba(0, 0, 0, .6); }
.tm-pt { width: calc(9 * var(--tm-u)); height: calc(9 * var(--tm-u)); margin: calc(-4.5 * var(--tm-u)) 0 0 calc(-4.5 * var(--tm-u)); border-radius: 50%;
  background: rgba(255, 255, 255, .18); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .38), 0 2px 6px rgba(0, 0, 0, .4); }
.tm-pt::after { content: ''; position: absolute; inset: 22%; border-radius: 50%; background: rgba(255, 255, 255, .92); box-shadow: 0 0 calc(6 * var(--tm-u)) rgba(255, 255, 255, .45); }
.tm-pt.ug::after { background: rgba(255, 255, 255, .75); box-shadow: none; }
/* one glass token for every chip on the map – the tiles' material, a little denser without the blur */
.tm-pf, .tm-ve { background: linear-gradient(160deg, rgba(42, 45, 60, .92), rgba(20, 22, 31, .94));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), inset 0 1px 0 rgba(255, 255, 255, .09), 0 6px 16px rgba(0, 0, 0, .32); }
.tm-pf { display: flex; align-items: center; gap: calc(7 * var(--tm-u)); height: calc(30 * var(--tm-u)); padding: 0 calc(10 * var(--tm-u)) 0 calc(7 * var(--tm-u));
  border-radius: calc(15 * var(--tm-u)); white-space: nowrap; font-variant-numeric: tabular-nums;
  pointer-events: auto; cursor: pointer; -webkit-tap-highlight-color: transparent; transition: scale .25s var(--snap), box-shadow .2s ease, opacity .5s ease; }
/* a chip opens what comes after it there: a little brighter under the pointer, it gives way under the finger */
.tm-pf::before { content: ''; position: absolute; z-index: -1; inset: calc(-6 * var(--tm-u)); border-radius: inherit; }
.tm-pf:hover { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .2), inset 0 1px 0 rgba(255, 255, 255, .12), 0 6px 18px rgba(0, 0, 0, .36); }
.tm-pf:active { scale: .97; }
/* a vehicle passing under a chip: the chip steps back so the vehicle shows */
.tm-pf.under { opacity: .3; }
.tm-pf:focus-visible { outline: 2px solid rgba(var(--blue), .9); outline-offset: 2px; }
.tm-pf .ic, .tm-h .ic { font-size: calc(15 * var(--tm-u)); stroke: rgba(255, 255, 255, .85); stroke-width: 2.4; }
.tm-pf .ar, .tm-h .ar { display: grid; place-items: center; width: calc(18 * var(--tm-u)); height: calc(18 * var(--tm-u)); }
.tm-ln { display: flex; align-items: baseline; gap: calc(6 * var(--tm-u)); transition: opacity .4s ease; }
.tm-ln + .tm-ln { margin-left: calc(4 * var(--tm-u)); }
/* the next one first and in full; the ones after it smaller, their minutes grey (like the board's 'then') */
.tm-pf .tm-ln:not(.hero) .tm-bd { transform: scale(.86); }
.tm-pf.tall { flex-direction: column; justify-content: center; gap: 1px; height: auto; padding: 6px 10px 5px; border-radius: 14px; }
.tm-tr { display: flex; align-items: center; gap: 4px; }
.tm-pf.tall .ar { width: 16px; }
.tm-pf .tm-ln:not(.hero) .tm-mn { font-size: max(13px, calc(15 * var(--tm-u))); color: rgba(235, 235, 245, .58); }
.tm-pf .tm-ln:not(.hero) .tm-mn.late { color: rgba(var(--orange), .8); }
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
.tm-pf.st .tm-row { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; grid-auto-rows: calc(26 * var(--tm-u)); align-items: center;
  column-gap: calc(5 * var(--tm-u)); padding: calc(3 * var(--tm-u)) 0; }
.tm-pf.st .tm-row + .tm-row { border-top: 1px solid rgba(255, 255, 255, .08); }
/* a line of it like a card of the board: the badge beside its directions – each its arrow, where it goes, the minutes */
.tm-pf.st .tm-row > .tm-bd { grid-row: span var(--r); align-self: start; margin: calc(3 * var(--tm-u)) calc(4 * var(--tm-u)) 0 0; }
.tm-dr { display: contents; }
.tm-to { max-width: calc(150 * var(--tm-u)); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: max(12.5px, calc(13.5 * var(--tm-u))); font-weight: 500;
  color: rgba(235, 235, 245, .86); }
.tm-dr .tm-mn { justify-self: end; margin-left: calc(12 * var(--tm-u)); }
/* on a phone a little tighter: the streets around the station keep room for their names */
.m .tm-pf.st { padding: 6px 10px 3px; border-radius: 14px; }
.m .tm-pf.st .tm-sh { padding-bottom: 1px; font-size: 11.5px; }
.m .tm-pf.st .tm-row { grid-auto-rows: 22px; padding: 2px 0; }
.m .tm-pf.st .tm-row > .tm-bd { margin-top: 1px; }
.m .tm-to { font-size: 12.5px; }
.m .tm-pf.st .tm-mn { font-size: 15.5px; }
/* a vehicle further out: quiet words where it will come in, a tick in its colour on the line there */
.tm-h { display: flex; align-items: center; gap: calc(5 * var(--tm-u)); white-space: nowrap; font-size: max(10.5px, calc(11 * var(--tm-u))); font-weight: 600;
  color: rgba(235, 235, 245, .62); font-variant-numeric: tabular-nums; text-shadow: 0 0 6px rgba(8, 9, 12, .95), 0 1px 10px rgba(8, 9, 12, .8); }
.tm-h .tm-bd { min-width: calc(30 * var(--tm-u)); height: calc(16 * var(--tm-u)); font-size: max(10px, calc(10.5 * var(--tm-u))); opacity: .78; text-shadow: none; }
/* its minutes (only when no chip says them) quieter than a chip's: the answer is on the chips */
.tm-h i { font-style: normal; font-size: max(11.5px, calc(12 * var(--tm-u))); font-weight: 600; letter-spacing: -.01em; margin: 0 calc(1 * var(--tm-u)) 0 0; color: rgba(235, 235, 245, .72); }
.tm-h .late i { color: rgb(var(--orange)); }
.tm-tk { width: calc(12 * var(--tm-u)); height: calc(3 * var(--tm-u)); margin: calc(-1.5 * var(--tm-u)) 0 0 calc(-6 * var(--tm-u)); border-radius: 2px;
  background: rgb(var(--c)); box-shadow: 0 0 calc(8 * var(--tm-u)) rgba(var(--c), .7); }

/* a vehicle: a lit glass disc in its line's colour, made like the lamps; a white pointer on its rim where it goes */
.tm-v { will-change: transform; transition: transform 1.1s linear, opacity .7s ease; --vr: calc(16 * var(--tm-u)); }
.tm-v.jump { transition: opacity .7s ease; }
.tm-v.out { opacity: 0; }
.tm-vd { position: absolute; left: calc(-1 * var(--vr)); top: calc(-1 * var(--vr)); width: calc(2 * var(--vr)); height: calc(2 * var(--vr)); border-radius: 50%; display: grid; place-items: center;
  background: radial-gradient(circle at 50% 28%, rgb(var(--lcl)), rgb(var(--lc)) 72%);
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .3), inset 0 -2px 6px rgba(0, 0, 0, .08), 0 0 0 calc(var(--vr) * .24) rgba(var(--lc), .13), 0 3px 16px rgba(var(--lc), .42), 0 4px 10px rgba(0, 0, 0, .3);
  color: var(--lf); font-size: max(10.5px, calc(11.5 * var(--tm-u))); font-weight: 700; letter-spacing: -.02em; transition: transform .6s ease, color .4s ease, box-shadow .4s ease; }
.tm-vp { position: absolute; left: 0; top: 0; width: 0; height: 0; transition: transform .6s ease, opacity .4s ease; }
.tm-vp::after { content: ''; position: absolute; left: calc(var(--vr) + 1 * var(--tm-u)); top: calc(-6 * var(--tm-u)); width: calc(9 * var(--tm-u)); height: calc(12 * var(--tm-u));
  background: rgba(255, 255, 255, .95); clip-path: polygon(0 0, 100% 50%, 0 100%); filter: drop-shadow(0 0 1.5px rgba(0, 0, 0, .7)); }
.tm-ve { position: absolute; left: 0; top: 0; transform: translate(calc(var(--vr) + 9 * var(--tm-u)), -50%); padding: calc(3 * var(--tm-u)) calc(9 * var(--tm-u));
  border-radius: calc(11 * var(--tm-u)); white-space: nowrap; font-size: max(11px, calc(11.5 * var(--tm-u))); font-weight: 600; color: var(--t2); font-variant-numeric: tabular-nums; }
.tm-ve b { font-style: normal; font-size: max(13.5px, calc(15 * var(--tm-u))); font-weight: 700; letter-spacing: -.02em; color: var(--t1); margin: 0 calc(2 * var(--tm-u)); }
.tm-ve.l { transform: translate(calc(-100% - var(--vr) - 9 * var(--tm-u)), -50%); }
.tm-ve:empty, .tm-ve.x { display: none; }
/* leaving (no stop of these ahead of it): a quiet dot that drifts off */
.tm-v.gone { opacity: .55; }
.tm-v.gone .tm-vd { transform: scale(.42); color: transparent; background: rgba(var(--lc), .18); box-shadow: inset 0 0 0 calc(2.5 * var(--tm-u)) rgba(var(--lcl), .85); }
.tm-v.gone .tm-vp, .tm-v.gone .tm-ve { opacity: 0; }
.tm-v.gone.out, .tm-v.off { opacity: 0; }
/* under the street the position is estimated: a dashed rim */


/* the heading as on the departures board: a quiet label, live beside it */
.tm-head { position: absolute; z-index: 4; display: flex; align-items: center; gap: 14px; height: 30px; padding: 0 14px 0 6px; pointer-events: none; }
.tm-head h2 { margin: 0; font-size: 14px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--t2); }
.tm-live { display: flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 500; color: var(--t3); white-space: nowrap; font-variant-numeric: tabular-nums; }
.tm-live i { width: 7px; height: 7px; border-radius: 50%; background: rgb(var(--green)); }
.tm-live.off i { background: rgb(var(--orange)); }
.tm-foot { position: absolute; z-index: 4; display: flex; align-items: center; justify-content: space-between; gap: 14px; font-size: 11.5px; color: rgba(235, 235, 245, .55); pointer-events: none; }
.tm-foot a { color: rgba(235, 235, 245, .45); text-decoration: none; pointer-events: auto; white-space: nowrap; font-size: 11px; }
.tm-foot a:hover { color: var(--t2); }
.tm-leg { display: flex; align-items: center; gap: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tm-leg i { flex: none; width: 18px; height: 0; border-top: 2px dashed rgba(255, 255, 255, .5); }
.tm-leg b { font-weight: inherit; }
.tm-leg em { flex: none; width: 7px; height: 7px; border-radius: 50%; background: rgb(var(--orange)); }
.tm-msg { position: absolute; z-index: 4; left: 50%; top: 50%; transform: translate(-50%, -50%); padding: 12px 18px; border-radius: 16px; font-size: 15px; font-weight: 500; color: var(--t2);
  background: rgba(20, 21, 26, .8); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08); }
.tm-msg:empty { display: none; }
.m .tm-foot { flex-direction: column; align-items: flex-start; gap: 3px; font-size: 11px; }

/* the next departures of a stop, opened from its chip: like a card of the board, the next three of each direction */
.pop.tmp { width: min(600px, calc(100% - 48px)); }
.pop.tmp.tms { width: min(540px, calc(100% - 48px)); }
.tm-pop { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; column-gap: 16px; margin-top: 14px; }
.tm-pop hr { grid-column: 1 / -1; height: 1px; margin: 6px 0; border: 0; background: rgba(255, 255, 255, .08); }
.tm-pop > .tm-bd { grid-column: 1; grid-row: span var(--r); align-self: start; min-width: 50px; height: 28px; margin-top: 12px; padding: 0 7px; border-radius: 8px; font-size: 15px; }
.tm-pd { grid-column: 2; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 3px; padding: 12px 0; }
.tm-pto { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 18px; font-weight: 600; letter-spacing: -.012em; }
.tm-pto > span:last-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tm-pto .ar { flex: none; display: grid; place-items: center; width: 20px; height: 20px; }
.tm-pto .ic { font-size: 17px; stroke: var(--t1); stroke-width: 2.4; }
.tm-psub { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13.5px; font-weight: 500; color: var(--t2); }
.tm-psub:empty { display: none; }
.tm-psub s { color: rgb(var(--red)); text-decoration-thickness: 1.5px; }
.tm-pcs { grid-column: 3; align-self: center; display: flex; align-items: baseline; gap: 8px; }
.tm-pc { display: inline-flex; flex-direction: column; align-items: flex-end; min-width: 64px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.tm-pc.hero { min-width: 84px; }
.tm-pc b { font-size: 21px; font-weight: 700; letter-spacing: -.03em; line-height: 1.15; color: rgba(235, 235, 245, .6); }
.tm-pc.hero b { font-size: 30px; color: var(--t1); }
.tm-pc b small { margin-left: 3px; font-size: 12.5px; font-weight: 600; letter-spacing: 0; color: var(--t2); }
.tm-pc.late b { color: rgb(var(--orange)); }
.tm-pc i { min-height: 15px; margin-top: 1px; font-style: normal; font-size: 12.5px; font-weight: 500; color: var(--t3); }
.tm-pc i em { margin-left: 4px; font-style: normal; color: rgb(var(--orange)); }
.tm-pc.none b { color: var(--t3); }
.tm-pmsg { grid-column: 1 / -1; margin: 6px 0 4px; font-size: 16px; color: var(--t3); }
/* a phone: the times below where it goes */
.m .tm-pop { grid-template-columns: auto minmax(0, 1fr); column-gap: 14px; }
.m .tm-pop > .tm-bd { grid-row: span var(--r2); }
.m .tm-pd { padding: 11px 0 5px; }
.m .tm-pcs { grid-column: 2; justify-content: flex-start; gap: 16px; padding-bottom: 11px; }
.m .tm-pc { align-items: flex-start; min-width: 70px; }
.m .tm-pc.hero { min-width: 76px; }
`;

Object.assign(GlassFloorplanCard.prototype, {
  _tmOn() { return !!this._tview && !!this._M?.dep?.map && this.isConnected && this._layer()?.type === 'departures_map' && !this._root?.classList.contains('bare'); },
  /* while the map is shown: the map data (once), the vehicles moving (the departures come from _depSync) */
  _tmSync() {
    if (!this._tmOn()) { this._tmStop(); return; }
    this._tmDom();
    const now = Date.now();
    for (const [id, x] of this._tmVeh || []) if (now > tmEnd(x) + 90e3) { x.el?.remove(); this._tmVeh.delete(id); }
    this._tmLoad();
    this._tmLayout();
    this._tmShow();
  },
  _tmStop() {
    clearTimeout(this._tmTO);
    cancelAnimationFrame(this._tmRaf);
    this._tmTO = this._tmRaf = null;
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
          // an unknown stop is not asked for again (a busy server is, after the pause)
          if (r.status === 400 || r.status === 404) { c.bad = true; return null; }
          return r.ok ? r.j : Promise.reject(new Error(String(r.status)));
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
    // (a middle of its own further out widens the area – the area's centre stays between the stops)
    const hc = D.map.center === 'home' ? (Number.isFinite(this._hass?.config?.latitude) ? [this._hass.config.latitude, this._hass.config.longitude] : null) : D.map.center;
    const ext = Math.max(...m.concat(hc ? [pr0.xy(...hc)] : []).map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1])))) + D.map.radius;
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
    tmFetch(D.map.overpass, { method: 'POST', body: new URLSearchParams({ data: tmQuery(c, half, refs, open) }) }, 120e3)
      .then((r) => (r.ok ? r.j : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        if (L.key !== key) return;
        // a busy server answers with what it got so far and a remark: try again later
        if (/error|timed out|out of memory/i.test(j.remark || '')) throw new Error(j.remark);
        const g = tmBuild(j, c, half), whole = !refs.length || g.routes.length;
        Object.assign(L, { geo: g, at: whole ? Date.now() : Date.now() - TM_KEEP + 864e5, err: false, tries: 0 });
        tmKeep3(key, { at: L.at, g });
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
    if (s.at) return [s.at];
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
  /* a line's badge (beside `rows` rows of its directions) */
  _tmBadge(ref, look, rows = 1) {
    return `<b class="tm-bd" style="--lb:rgb(${look.bg.join(',')});--lf:rgb(${look.fg.join(',')});--r:${rows};--r2:${rows * 2}">${esc(ref)}</b>`;
  },
  /* where a direction goes: the destination most of its next departures have (else where its route ends) */
  _tmTo(list, p) {
    const n = new Map();
    for (const e of list.filter((x) => !x.d.cancelled && x.d.dir).sort((a, b) => a.d.t - b.d.t).slice(0, 6)) n.set(e.d.dir, (n.get(e.d.dir) || 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || depDir(this._tmG?.routes[p.ri]?.to);
  },

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
          const o = near ? tmOn(L, near[0]) : As.map((a) => tmOn(L, a)).sort((x, y) => x.d - y.d)[0] || tmOn(L, A);
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
      for (const g of sides.filter((x) => x.ug)) {
        g.dirs = [];
        for (const p of g.plats) {
          const d = g.dirs.find((x) => Math.abs(Math.atan2(Math.sin(x.ang - p.ang), Math.cos(x.ang - p.ang))) < 0.9);
          if (d) d.plats.push(p); else g.dirs.push({ ang: p.ang, plats: [p], ref: p.ref, prod: p.prod });
        }
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
    // the footer's soft band right above a docked tab bar
    const sb = v.querySelector('.tm-scr.b');
    if (sb) sb.style.bottom = `${Math.max(0, H - R[3] - 6)}px`;
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
    const rx = this._m ? r * 0.55 : r, mid = this._tmMid();
    let fb = [Math.min(...ll.map((p) => p[0])) - rx, Math.min(...ll.map((p) => p[1])) - r, Math.max(...ll.map((p) => p[0])) + rx, Math.max(...ll.map((p) => p[1])) + r];
    // a middle of its own: the stops around it, as far on each side
    if (mid) { const ex = Math.max(mid[0] - fb[0], fb[2] - mid[0]), ey = Math.max(mid[1] - fb[1], fb[3] - mid[1]); fb = [mid[0] - ex, mid[1] - ey, mid[0] + ex, mid[1] + ey]; }
    let k = Math.min((F[2] - F[0]) / (fb[2] - fb[0]), (F[3] - F[1]) / (fb[3] - fb[1]));
    // Every stop in view, and beside each side of a street stop room for its chip on that side of the street (pixels left,
    // top, right, bottom of the point): the scale shrinks and the map moves until all of it fits
    const need = ll.map((p) => [p[0], p[1], 24, 24, 24, 24]);
    for (const st of this._tmPlats()) for (const g of st.sides) if (!g.ug) {
      const dx = -Math.sin(g.ang), dy = Math.cos(g.ang), tall = this._m && Math.abs(dx) > 0.7, cw = tall ? 76 : this._m ? 124 : (60 + 86 * g.refs.length) * u, ch = tall ? 54 : 30 * u;
      const ext = 26 * u + (Math.abs(dx) * cw) / 2 + (Math.abs(dy) * ch) / 2, cx = dx * ext, cy = dy * ext;
      need.push([g.pt[0], g.pt[1], Math.max(0, cw / 2 - cx), Math.max(0, ch / 2 - cy), Math.max(0, cx + cw / 2), Math.max(0, cy + ch / 2)]);
    }
    for (const a of need) for (const b of need) {
      if (b[0] > a[0] + 1) k = Math.min(k, (F[2] - F[0] - a[2] - b[4]) / (b[0] - a[0]));
      if (b[1] > a[1] + 1) k = Math.min(k, (F[3] - F[1] - a[3] - b[5]) / (b[1] - a[1]));
    }
    k = clamp(k, 0.12, 3);
    const span = (lo, hi, c) => (lo <= hi ? clamp(c, lo, hi) : (lo + hi) / 2);
    const ox = span(Math.max(...need.map((n) => F[0] + n[2] - n[0] * k)), Math.min(...need.map((n) => F[2] - n[4] - n[0] * k)), (F[0] + F[2]) / 2 - ((fb[0] + fb[2]) / 2) * k);
    const oy = span(Math.max(...need.map((n) => F[1] + n[3] - n[1] * k)), Math.min(...need.map((n) => F[3] - n[5] - n[1] * k)), (F[1] + F[3]) / 2 - ((fb[1] + fb[3]) / 2) * k);
    const view = { k, ox, oy, W, H, u };
    // drawn only while shown (and again when the screen, the map or the lines change)
    const key = JSON.stringify([view, this._tmL?.key, this._tmL?.at, this._tmSig()]);
    if (key === this._tmVKey || !this._tmOn()) return;
    this._tmVKey = key;
    this._tmView = view;
    this._tmDraw();
    this._tmShow();
  },
  /* the configured middle of the view in metres (Home Assistant's home or a point), or null */
  _tmMid() {
    const c = this._M.dep.map.center, h = this._hass?.config, ll = c === 'home' ? (Number.isFinite(h?.latitude) ? [h.latitude, h.longitude] : null) : c;
    return ll && this._tmG ? this._tmG.pr.xy(...ll) : null;
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
    // a chip or a station's plate opens the next departures there
    const ov = v.querySelector('.tm-ov'), hit = (e) => e.target.closest?.('[data-side], [data-stn]');
    ov.addEventListener('click', (e) => { const n = hit(e); if (n) this._tmOpen(n); });
    ov.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.tm-pf')) { e.preventDefault(); this._tmOpen(e.target); } });
    this._tmVKey = null;
    // the vehicles stay known; their elements come anew in the new body
    for (const x of this._tmVeh?.values() || []) Object.assign(x, { el: null, arEl: null, etEl: null, pp: null, deg: null, txt: null, side: null, dying: null, jump: null, view: null });
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
    this._tmOffs = new Map();
    const core = [];
    G.routes.forEach((rt, ri) => {
      if (!refs.includes(rt.ref)) return;
      const look = this._tmLook(rt.ref, rt.prod), lane = refs.filter((x) => this._tmLook(x, rt.prod).prod === look.prod).indexOf(rt.ref), ug = rt.mode === 'subway';
      const off = ug ? 0 : (4.5 + Math.max(0, lane) * 3.2) * u, draw = !ug || !drawnUg.has(rt.ref);
      if (ug) drawnUg.add(rt.ref);
      this._tmOffs.set(ri, off);
      rt.lines.forEach((L, li) => {
        const P = X(L.P), Q = off ? tmOffset(P, off) : P;
        this._tmScr.set(`${ri}:${li}`, { P: Q, S: L.S });
        if (draw && vis(Q)) core.push(`<path class="rt${ug ? ' ug' : ''}" d="M${Q.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}" stroke="rgb(${look.glow.join(',')})"/>`);
      });
    });
    for (const el of [svg, this._tview.querySelector('.tm-lit')]) { el.setAttribute('width', W); el.setAttribute('height', H); el.setAttribute('viewBox', `0 0 ${W} ${H}`); }
    this._tmLitH = null;
    svg.innerHTML = `<defs>
      <linearGradient id="tmg" x1="0" y1="0" x2=".45" y2="1"><stop offset="0" stop-color="rgb(196,206,255)" stop-opacity=".1"/><stop offset=".55" stop-color="rgb(180,192,250)" stop-opacity=".06"/><stop offset="1" stop-color="rgb(170,182,245)" stop-opacity=".045"/></linearGradient>
      <linearGradient id="tmgg" x1="0" y1="0" x2=".45" y2="1"><stop offset="0" stop-color="rgb(110,210,135)" stop-opacity=".2"/><stop offset="1" stop-color="rgb(70,170,100)" stop-opacity=".12"/></linearGradient>
      <linearGradient id="tmgw" x1="0" y1="0" x2=".45" y2="1"><stop offset="0" stop-color="rgb(90,160,255)" stop-opacity=".2"/><stop offset="1" stop-color="rgb(40,100,220)" stop-opacity=".11"/></linearGradient>
    </defs>${out}${core.join('')}<g class="nm"></g>`;
    // points every few pixels along the lines in view: chips keep off them where they can (a plate rather off a line on the
    // street than off a dashed one under it – the weight)
    this._tmLinePts = [];
    for (const [key, sc] of this._tmScr) for (let i = 1, w = G.routes[+key.split(':')[0]].mode === 'subway' ? 1 : 3; i < sc.P.length; i++) {
      const a = sc.P[i - 1], b = sc.P[i], n = Math.ceil(tmLen(a, b) / 6);
      for (let k = 0; k < n; k++) { const p = [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, w]; if (p[0] > 0 && p[1] > 0 && p[0] < W && p[1] < H) this._tmLinePts.push(p); }
    }
    // the names: their streets on screen, and where the lines run (a name never lies on one – a lit way would cover it)
    this._tmNm = (G.names || []).map((x) => ({ ...x, L: x.p.map((F) => { const P = X(tmPts(F)); return vis(P) ? tmLine(P) : null; }).filter(Boolean) })).filter((x) => x.L.length);
    // the two small streets nearest the middle: a station's plate keeps off them too (their names have room there)
    const F = this._tmBox.F, mid = [(F[0] + F[2]) / 2, (F[1] + F[3]) / 2];
    const dist = (x) => Math.min(...x.L.map((L) => L.P.reduce((m, p, i) => (i ? Math.min(m, tmSeg(mid, L.P[i - 1], p).d) : m), Infinity)));
    this._tmKeyPts = this._tmNm.filter((x) => x.k > 4).map((x) => [x, dist(x)]).sort((a, b) => a[1] - b[1]).slice(0, 2)
      .flatMap(([x]) => x.L.flatMap((L) => { const out = []; for (let d = 0; d < L.S[L.S.length - 1]; d += 6) out.push(tmAtS(L, d).p); return out; }));
    this._tmLineGrid = new Map();
    for (const p of this._tmLinePts) { const k = `${Math.floor(p[0] / 8)}|${Math.floor(p[1] / 8)}`; if (!this._tmLineGrid.has(k)) this._tmLineGrid.set(k, []); this._tmLineGrid.get(k).push(p); }
    this._tmNmKey = this._tmNmAt = null;
    this._tmPl = this._tmPlats();
    this._tmDrawn = this._tmSig();
    this._tmStatic();
  },
  /* The streets' names, quiet and along them where they run straight: the big streets first, then the nearest, a handful at
   * most – never over a line, a chip, a plate, a stop, the heading or another name, as central as they can.
   * Placed anew only when what they keep clear of moves; a name keeps its place while it is free there. */
  _tmNames() {
    const g = this._tview?.querySelector('.tm-svg .nm'), V = this._tmView, B = this._tmBox;
    if (!g || !V || !B || !this._tmNm) return;
    const u = V.u, fs = Math.max(10, 10.5 * u), rb = this._root.getBoundingClientRect(), sc = rb.width / B.W || 1;
    const boxes = (this._tmSides || []).filter((e) => e.box && !e.row).map((e) => e.box).concat((this._tmPlates || []).map((e) => e.box), B.keep,
      [...this._tview.querySelectorAll('.tm-sl, .tm-pt')].map((n) => { const b = n.getBoundingClientRect(); return [(b.left - rb.left) / sc, (b.top - rb.top) / sc, (b.right - rb.left) / sc, (b.bottom - rb.top) / sc]; }))
      .map((b) => [b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4]);
    const key = boxes.map((b) => b.map((x) => Math.round(x / 4)).join()).join('|');
    if (key === this._tmNmKey) return;
    this._tmNmKey = key;
    const ctx = (this._tmCtx = this._tmCtx || document.createElement('canvas').getContext('2d'));
    ctx.font = `500 ${fs}px ${getComputedStyle(g).fontFamily}`;
    const E = [B.E[0] + 6, B.E[1] + 4, B.E[2] - 6, B.E[3] - 4], mid = [(B.F[0] + B.F[2]) / 2, (B.F[1] + B.F[3]) / 2];
    const taken = new Set(), cell = (p, c) => `${Math.floor(p[0] / c)}|${Math.floor(p[1] / c)}`, prev = this._tmNmAt || new Map(), at = new Map(), out = [];
    // a place for a name: its line straight there, everything around it free (or null)
    const onLine = (p) => {
      const gx = Math.floor(p[0] / 8), gy = Math.floor(p[1] / 8);
      for (let x = gx - 1; x <= gx + 1; x++) for (let y = gy - 1; y <= gy + 1; y++) for (const q of this._tmLineGrid.get(`${x}|${y}`) || []) if (Math.abs(q[0] - p[0]) < 5 && Math.abs(q[1] - p[1]) < 5) return true;
      return false;
    };
    const fit = (L, s0, need) => {
      const a = tmAtS(L, s0), b = tmAtS(L, s0 + need);
      for (let i = a.i; i < b.i; i++) if (tmSeg(L.P[i], a.p, b.p).d > 2) return null;
      const l = tmLen(a.p, b.p) || 1, e = [(b.p[0] - a.p[0]) / l, (b.p[1] - a.p[1]) / l], n = [-e[1] * fs * 0.42, e[0] * fs * 0.42], pts = [];
      for (let k = 0; k <= l; k += 7) for (const o of [-1, 0, 1]) pts.push([a.p[0] + e[0] * k + n[0] * o, a.p[1] + e[1] * k + n[1] * o]);
      const x0 = Math.min(a.p[0], b.p[0]) - fs, x1 = Math.max(a.p[0], b.p[0]) + fs, y0 = Math.min(a.p[1], b.p[1]) - fs, y1 = Math.max(a.p[1], b.p[1]) + fs;
      const near = boxes.filter((q) => q[0] < x1 && q[2] > x0 && q[1] < y1 && q[3] > y0);
      for (const p of pts) if (p[0] < E[0] || p[0] > E[2] || p[1] < E[1] || p[1] > E[3] || taken.has(cell(p, fs)) || near.some((q) => p[0] > q[0] && p[0] < q[2] && p[1] > q[1] && p[1] < q[3]) || onLine(p)) return null;
      return { a: a.p, b: b.p, pts };
    };
    // the big streets first, then those nearest the middle of the stops (the ones one walks)
    const dist = (x) => Math.min(...x.L.map((L) => L.P.reduce((m, p, i) => (i ? Math.min(m, tmSeg(mid, L.P[i - 1], p).d) : m), Infinity)));
    const list = this._tmNm.map((x) => [x, dist(x)]).sort((a, b) => (a[0].k > 4) - (b[0].k > 4) || a[1] - b[1]).map((x) => x[0]);
    for (const x of list) {
      if (out.length >= (this._m ? 6 : 10)) break;
      // too narrow drawn for a name between its houses
      if (2 * x.w * V.k < fs * 0.75) continue;
      const need = ctx.measureText(x.n).width + x.n.length * fs * 0.02 + 12;
      let best = null;
      const was = prev.get(x.n), keep = was && x.L[was.li] && fit(x.L[was.li], was.s0, need);
      if (keep) best = { ...keep, li: was.li, s0: was.s0 };
      else x.L.forEach((L, li) => {
        for (let s0 = 6; s0 + need < L.S[L.S.length - 1] - 6; s0 += 12) {
          const f = fit(L, s0, need);
          if (!f) continue;
          const score = tmLen([(f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2], mid);
          if (!best || score < best.score) best = { ...f, score, li, s0 };
        }
      });
      if (!best) continue;
      // the names around it keep a line's height away
      for (const p of best.pts) for (const d of [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) taken.add(cell([p[0] + d[0] * fs, p[1] + d[1] * fs], fs));
      at.set(x.n, { li: best.li, s0: best.s0 });
      // read from the left; a street that runs (nearly) up and down from below, all alike
      let deg = (Math.atan2(best.b[1] - best.a[1], best.b[0] - best.a[0]) * 180) / Math.PI;
      if (deg > 90) deg -= 180; else if (deg <= -90) deg += 180;
      if (deg > 75) deg -= 180;
      out.push({ n: x.n, mj: x.k <= 4, c: [(best.a[0] + best.b[0]) / 2, (best.a[1] + best.b[1]) / 2], deg, pts: best.pts });
    }
    this._tmNmAt = at;
    this._tmNameBoxes = out.map((l) => l.pts.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]));
    g.innerHTML = out.map((l) => `<text${l.mj ? ' class="mj"' : ''} font-size="${fs.toFixed(1)}" text-anchor="middle" dominant-baseline="central" transform="translate(${l.c[0].toFixed(1)} ${l.c[1].toFixed(1)}) rotate(${l.deg.toFixed(1)})">${esc(l.n)}</text>`).join('');
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
        // the light at the kerb of its carriageway (right of the line as it is drawn), the chip further out on that side
        const c = this._tmX(g.pt), dx = -Math.sin(g.ang), dy = Math.cos(g.ang), k = (this._tmOffs?.get(g.plats[0].ri) || 0) + 6 * u, p = [c[0] + dx * k, c[1] + dy * k];
        const off = 18 * u, id = tmSideId(g);
        html += `<i class="tm-pt" style="transform:translate(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px)"></i>`;
        g.kerb = p;
        this._tmSides.push({ g, ax: p[0] + dx * off, ay: p[1] + dy * off, dx, dy, id });
        chips += `<div class="tm-pf" data-side="${id}" role="button" tabindex="0" aria-label="${name}" style="visibility:hidden"></div>`;
      }
      let stn = null;
      if (down.length) {
        stn = this._tmX(down.reduce((a, g) => [a[0] + g.pt[0] / down.length, a[1] + g.pt[1] / down.length], [0, 0]));
        const lines = [...new Set(down.flatMap((g) => g.plats.map((x) => `${x.ri}:${x.li}`)))].map((k) => this._tmScr.get(k)?.P).filter(Boolean);
        let best = null;
        for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) for (let a = 1; a < lines[i].length; a++) for (let b = 1; b < lines[j].length; b++) {
          const X = tmCross(lines[i][a - 1], lines[i][a], lines[j][b - 1], lines[j][b]);
          if (X && tmLen(X, stn) < 50 * u && (!best || tmLen(X, stn) < tmLen(best, stn))) best = X;
        }
        if (best) stn = best;
        html += `<i class="tm-pt ug" style="transform:translate(${stn[0].toFixed(1)}px,${stn[1].toFixed(1)}px)"></i>`;
        const rows = down.map((g) => { const id = tmSideId(g); this._tmSides.push({ g, row: true, id }); return `<div class="tm-row" data-side="${id}"></div>`; }).join('');
        chips += `<div class="tm-pf st" data-stn="${st.si}" role="button" tabindex="0" aria-label="${name}" style="visibility:hidden"><div class="tm-sh">${name}</div>${rows}</div>`;
      }
      const pts = up.map((g) => g.kerb);
      this._tmStops.push({ si: st.si, stn, pts: pts.length ? pts : stn ? [] : [this._tmX(st.S)] });
      if (!stn || up.length) html += `<span class="tm-sl" data-stop="${st.si}">${name}</span>`;
    }
    ov.innerHTML = `${html}${chips}<div class="tm-hs"></div>`;
  },

  /* ---------------------------------------------------------------- live: vehicles, the minutes */
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
          // (a little past the stop – it is leaving – is still the line)
          if (a.d < 200 && b.d < 200 && b.s < a.s - 150) pen = 90;
        }
        if (!best || d + pen < best.sc) best = { sc: d + pen, d, ri, li, s: on.map((o) => o.s) };
      });
    }
    // a line it would run backwards on is not its line (rather the raw position)
    return best && best.sc === best.d && best.d < (prod === 'subway' ? 140 : 70) ? best : null;
  },
  /* A trip's vehicle from the departures (`at`: when they came): on its route where it was then, on its way so that it is
   * at the stop a little before its time, waits there, then goes on at an everyday pace for a minute and fades. From
   * where it is drawn now, never backwards (back to the stop only when it seemed to have left and has not) and never
   * faster than such a vehicle goes. Off its route: where it was, facing the way of its stop. */
  _tmTrip(e, at, now) {
    const G = this._tmG, d = e.d;
    let v = this._tmVeh.get(d.trip);
    if (v?.at === at && v.stop === e.p) return;
    if (!v) { v = { id: d.trip, ref: d.line, prod: d.product }; this._tmVeh.set(d.trip, v); }
    Object.assign(v, { at, stop: e.p, due: d.t });
    const P = G.pr.xy(...d.pos), sn = this._tmSnap(d.line, d.product, [P], P, e.p.pt, e.p.ri);
    if (!sn) { Object.assign(v, { ri: -1, li: -1, track: null, raw: [[at, ...P]] }); if (v.ang == null) v.ang = e.p.ang; return; }
    const s0 = sn.s[0], s1 = e.p.s, ug = d.product === 'subway', top = ug ? 16 : 11, calm = ug ? 9 : 5, before = sn.li === e.p.li && s0 <= s1 + 25;
    let t0 = at, p0 = s0;
    if (v.track && v.ri === sn.ri && v.li === sn.li) {
      const cur = tmTrack(v.track, now);
      if (Math.abs(cur - s0) < 400) { t0 = now; p0 = before && s0 <= s1 && cur > s1 ? s1 : cur; }
    }
    let T;
    if (before && p0 <= s1 + 25) {
      const s = Math.max(p0, s1), ta = Math.max(d.t - 15e3, t0 + ((s - p0) / top) * 1e3), go = Math.max(ta, d.t);
      T = [[t0, p0], [ta, s], [go, s], [go + 60e3, s + calm * 60]];
    } else T = [[t0, p0], [t0 + 60e3, p0 + calm * 60]];
    Object.assign(v, { ri: sn.ri, li: sn.li, track: T, raw: null });
  },

  /* the minutes of a trip at one of the stops, and which side of the street it stops at */
  _tmPlatOf(st, d) {
    const G = this._tmG, cand = st.plats.filter((p) => p.ref === d.line);
    if (!cand.length) return null;
    if (cand.length === 1) {
      // one side only (the other direction is not in the map data): not for a departure that clearly runs the other way
      const p = cand[0], L = G.routes[p.ri].lines[p.li];
      if (d.pos) { const o = tmOn(L, G.pr.xy(...d.pos)); if (o.d < 40 && o.s > p.s + 60) return null; }
      if (d.to) {
        const P = G.pr.xy(...d.to), dn = tmAtS(L, p.s + 600).p, S = p.pt, a = [P[0] - S[0], P[1] - S[1]], b = [dn[0] - S[0], dn[1] - S[1]];
        if ((a[0] * b[0] + a[1] * b[1]) / ((Math.hypot(...a) * Math.hypot(...b)) || 1) < -0.5) return null;
      }
      return p;
    }
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
    v.querySelector('.tm-head h2').textContent = this._layerName(this._layer());
    // the source of the map (another one than OpenStreetMap only when configured – the demo's made-up town)
    const a = v.querySelector('.tm-foot a'), attr = D.map.attribution || t('tmAttr');
    if (a.textContent !== attr) { a.textContent = attr; if (D.map.attribution) a.removeAttribute('href'); }
    const G = this._tmG, V = this._tmView, now = Date.now();
    // live while the departures are fresh – the dot beats once when new ones come (no light that never rests)
    const states = D.stops.map((s) => this._depState(s)), fresh = states.every((x) => x.fresh);
    const live = v.querySelector('.tm-live'), ats = states.filter((x) => x.ok && x.at).map((x) => x.at);
    live.classList.toggle('off', !fresh);
    live.lastElementChild.textContent = fresh ? t('depLive') : ats.length ? t('depAsOf', new Date(Math.min(...ats)).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })) : t('depLoadingShort');
    if (fresh && Math.max(...ats) > (this._tmBeat || 0)) {
      this._tmBeat = Math.max(...ats);
      if (!this._reduced) live.firstElementChild.animate([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], { duration: 1600, easing: 'ease-in-out' });
    }
    if (!G || !V) return;
    if (this._tmSig() !== this._tmDrawn) { this._tmVKey = null; this._tmLayout(); return; }
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
    // the vehicles: where the departures say they are – of a trip that calls at more of the stops, from the next one's list
    for (const [, es] of this._tmEta) {
      const e = es.filter((x) => x.d.pos && x.d.t > now - 20e3).sort((a, b) => a.d.t - b.d.t)[0];
      if (e && e.d.t - now < 20 * 60e3) this._tmTrip(e, this._depC?.[this._depKey(D.stops[e.st.si])]?.at || now, now);
    }
    // a trip gone from the departures before its time (cancelled, dropped): its vehicle fades where it is
    for (const [id, x] of this._tmVeh) {
      if (this._tmEta.has(id) || !x.due || now > x.due - 5e3 || now > tmEnd(x)) continue;
      if (x.track) x.track = [[now, tmTrack(x.track, now)]];
      else if (x.raw) x.raw = [[now - 75e3, ...x.raw[x.raw.length - 1].slice(1)]];
    }
    this._tmNext = new Set();
    for (const [g, list] of bySide) for (const key of g.ug ? g.dirs : g.refs) {
      const nx = list.filter((x) => (g.ug ? key.plats.includes(x.p) : x.d.line === key) && !x.d.cancelled && x.d.t > now - 30e3).sort((a, b) => a.d.t - b.d.t)[0];
      if (nx) this._tmNext.add(nx.d.trip);
    }
    // the legend: the dashed subway when one is shown, orange = late when a late one is shown
    const leg = v.querySelector('.tm-leg'), ug = G.routes.some((x) => x.mode === 'subway' && D.stops.some((s) => this._tmLinesOf(s).includes(x.ref)));
    const anyLate = [...bySide.values()].some((l) => l.some((e) => !e.d.cancelled && e.d.delay >= DEP_LATE && e.d.t - now < 60 * 60e3));
    const lh = `${ug ? `<i></i>${esc(t(this._m ? 'tmUndergroundShort' : 'tmUnderground'))}` : ''}${anyLate ? `<b class="lt">${ug ? ' · ' : ''}</b><em></em>${esc(t('tmLate'))}` : ''}`;
    if (leg.dataset.h !== lh) { leg.dataset.h = lh; leg.innerHTML = lh; }
    const unit = t('min'), mins = (ms) => { const m = Math.floor((ms - now) / 60000); return m < 1 ? null : m; };
    const mnHtml = (d) => { const m = mins(d.t); return `<span class="tm-mn${d.delay >= DEP_LATE ? ' late' : ''}">${m == null ? esc(t('depNow')) : `${m}<small>${esc(unit)}</small>`}</span>`; };
    const order = (a, b) => (DEP_ORDER.indexOf(this._tmLook(a, 'bus').prod) - DEP_ORDER.indexOf(this._tmLook(b, 'bus').prod)) || a.localeCompare(b, undefined, { numeric: true });
    // the trips whose minutes stand on a chip or a plate (a hint at the edge does not say them again)
    this._tmOnChip = new Set();
    for (const el of this._tmSides || []) {
      const node = v.querySelector(`[data-side="${el.id}"]`);
      if (!node) continue;
      const list = bySide.get(el.g) || [], next = (f) => list.filter((e) => f(e) && !e.d.cancelled).sort((x, y) => x.d.t - y.d.t)[0];
      const none = '<span class="tm-mn none">–</span>';
      // the soonest first and in full, the others after it (a line without a departure last)
      const byTime = (items) => items.sort((a, b) => (a.nx ? a.nx.d.t : Infinity) - (b.nx ? b.nx.d.t : Infinity)).map((x, i) => ({ ...x, hero: i === 0 && !!x.nx }));
      let html;
      if (el.g.ug) {
        // a subway line in its station's plate: the badge beside its directions – each its arrow, where it goes, the minutes
        const dirs = el.g.dirs.slice().sort((a, b) => tmOrder(a.ang) - tmOrder(b.ang));
        html = `${this._tmBadge(el.g.refs[0], this._tmLook(el.g.refs[0], el.g.plats[0].prod), dirs.length)}${dirs.map((dr) => {
          const es = list.filter((e) => dr.plats.includes(e.p)), nx = next((e) => dr.plats.includes(e.p));
          if (nx) this._tmOnChip.add(nx.d.trip);
          return `<span class="tm-dr">${tmArrow(dr.ang)}<span class="tm-to">${esc(this._tmTo(es, dr.plats[0]))}</span>${nx ? mnHtml(nx.d) : none}</span>`;
        }).join('')}`;
      } else {
        // a side of the street: where it goes, then every line stopping there – on a phone the next one only (the rest a tap away)
        const items = byTime(el.g.refs.map((ref) => ({ ref, nx: next((e) => e.d.line === ref) }))).slice(0, this._m ? 1 : undefined);
        for (const x of items) if (x.nx) this._tmOnChip.add(x.nx.d.trip);
        // beside a street that runs up and down a phone has no room for a long chip: a small tile – arrow and line, minutes below
        const tall = this._m && Math.abs(el.dx) > 0.7;
        if (tall !== !!el.tall) { el.tall = tall; node.classList.toggle('tall', tall); }
        html = tall && items[0] ? `<span class="tm-tr">${tmArrow(el.g.ang)}${this._tmBadge(items[0].ref, this._tmLook(items[0].ref, el.g.plats[0].prod))}</span>${items[0].nx ? mnHtml(items[0].nx.d) : none}`
          : `${tmArrow(el.g.ang)}${items.map((x) => `<span class="tm-ln${x.hero ? ' hero' : ''}">${this._tmBadge(x.ref, this._tmLook(x.ref, el.g.plats[0].prod))}${x.nx ? mnHtml(x.nx.d) : none}</span>`).join('')}`;
      }
      if (node.dataset.h !== html) { node.dataset.h = html; node.innerHTML = html; }
      if (el.row) continue;
      el.node = node;
      el.w = node.offsetWidth;
      el.h = node.offsetHeight;
      // beside the street, never over it: centred on a point pushed out until the chip clears it
      const ext = (Math.abs(el.dx) * el.w) / 2 + (Math.abs(el.dy) * el.h) / 2, x = el.ax + el.dx * ext - el.w / 2, y = el.ay + el.dy * ext - el.h / 2;
      el.box = [x, y, x + el.w, y + el.h];
    }
    // a street stop's name above its lights; a station's plate beside its light where it covers the fewest lines (and the
    // streets nearest the middle) and nothing of the other stops (their chips, names and lights)
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
      const busy = (x0, y0) => this._tmLinePts.reduce((n, p) => n + (p[0] > x0 - 4 && p[0] < x0 + w + 4 && p[1] > y0 - 4 && p[1] < y0 + H + 4 ? p[2] : 0), 0)
        + 3 * (this._tmKeyPts || []).reduce((n, p) => n + (p[0] > x0 - 8 && p[0] < x0 + w + 8 && p[1] > y0 - 8 && p[1] < y0 + H + 8), 0)
        + 60 * taken.concat(this._tmBox.keep).filter((b) => x0 - 6 < b[2] && x0 + w + 6 > b[0] && y0 - 6 < b[3] && y0 + H + 6 > b[1]).length;
      const opts = [[at[0] + 16 * u, at[1] - H / 2], [at[0] - 16 * u - w, at[1] - H / 2], [at[0] + 12 * u, at[1] + 14 * u], [at[0] + 12 * u, at[1] - 14 * u - H],
        [at[0] - 12 * u - w, at[1] + 14 * u], [at[0] - 12 * u - w, at[1] - 14 * u - H], [at[0] - w / 2, at[1] - 16 * u - H], [at[0] - w / 2, at[1] + 16 * u]]
        .filter((o) => o[0] >= E[0] && o[0] + w <= E[2] && o[1] >= E[1] && o[1] + H <= E[3]);
      const best = opts.map((o, i) => [o, busy(...o) + i * 0.5]).sort((a, b) => a[1] - b[1])[0]?.[0] || [clamp(at[0] + 16 * u, E[0], E[2] - w), clamp(at[1] - H / 2, E[1], E[3] - H)];
      const box = [best[0], best[1], best[0] + w, best[1] + H];
      this._tmPlates.push({ node: plate, box, fixed: true });
      taken.push(box);
    }
    this._tmLabelsApart();
    this._tmNames();
    this._tmHints(bySide);
    this._tmBySide = bySide;
    if (this._popOpen && this._popKind?.startsWith('tm:')) this._upd.forEach((f) => f());
    this._tmKick();
  },
  /* chips beside the street that would overlap move apart (the shorter way), away from names, lights and a station's
   * stack, inside the card */
  _tmLabelsApart() {
    const S = (this._tmSides || []).filter((e) => e.box && !e.row), all = S.concat(this._tmPlates || []), B = this._tmBox, rb = this._root.getBoundingClientRect(), sc = rb.width / B.W || 1;
    const fixed = [...this._tview.querySelectorAll('.tm-sl, .tm-pt')].map((n) => { const b = n.getBoundingClientRect(); return [(b.left - rb.left) / sc, (b.top - rb.top) / sc, (b.right - rb.left) / sc, (b.bottom - rb.top) / sc]; })
      .concat((this._tmPlates || []).map((e) => e.box), B.keep);
    // a chip by the street gives way only along its street (it stays on its side of the road)
    const shift = (e, b, d, away) => {
      const t = e?.dx != null ? [e.dy, -e.dx] : null;
      if (!t) { b[0] += d[0]; b[2] += d[0]; b[1] += d[1]; b[3] += d[1]; return; }
      let k = d[0] * t[0] + d[1] * t[1];
      if (Math.abs(k) < 1) k = Math.hypot(d[0], d[1]) * (Math.sign(away[0] * t[0] + away[1] * t[1]) || 1);
      b[0] += t[0] * k; b[2] += t[0] * k; b[1] += t[1] * k; b[3] += t[1] * k;
    };
    const push = (ea, a, eb, b, both) => {
      const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]) + 6, oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]) + 6;
      if (ox <= 0 || oy <= 0) return false;
      const ax = ox < oy ? 0 : 1, d = (ax ? oy : ox) / (both ? 2 : 1), sg = Math.sign(b[ax] + b[ax + 2] - a[ax] - a[ax + 2]) || 1;
      const away = [(b[0] + b[2] - a[0] - a[2]) / 2, (b[1] + b[3] - a[1] - a[3]) / 2], dv = ax ? [0, d * sg] : [d * sg, 0];
      shift(eb, b, dv, away);
      if (both) shift(ea, a, [-dv[0], -dv[1]], [-away[0], -away[1]]);
      return true;
    };
    // inside the card while they move
    const inside = (b) => {
      const w = b[2] - b[0], h = b[3] - b[1], x = clamp(b[0], B.E[0], B.E[2] - w), y = clamp(b[1], B.E[1], B.E[3] - h);
      b.splice(0, 4, x, y, x + w, y + h);
    };
    all.forEach((e) => inside(e.box));
    for (let it = 0; it < 16; it++) {
      let moved = false;
      for (let i = 0; i < S.length; i++) {
        for (let j = i + 1; j < S.length; j++) moved = push(S[i], S[i].box, S[j], S[j].box, true) || moved;
        for (const f of fixed) moved = push(null, f, S[i], S[i].box, false) || moved;
      }
      S.forEach((e) => inside(e.box));
      if (!moved) break;
    }
    // still in each other's way: away from the street (outwards on its own side – never across it)
    const over = (a, b) => a[0] < b[2] + 4 && a[2] + 4 > b[0] && a[1] < b[3] + 4 && a[3] + 4 > b[1];
    for (let it = 0; it < 6; it++) {
      let moved = false;
      for (const e of S) {
        if (e.dx == null || !S.some((o) => o !== e && over(o.box, e.box)) && !fixed.some((f) => over(f, e.box))) continue;
        const k = 8;
        e.box[0] += e.dx * k; e.box[2] += e.dx * k; e.box[1] += e.dy * k; e.box[3] += e.dy * k;
        inside(e.box);
        moved = true;
      }
      if (!moved) break;
    }
    // a chip lying on a line (of a route crossing there) slides along its street, on its own side, until it is clear
    const pts = this._tmLinePts || [], onLine = (b) => pts.some((p) => p[0] > b[0] && p[0] < b[2] && p[1] > b[1] && p[1] < b[3]);
    for (const e of S) {
      if (e.dx == null || !onLine(e.box)) continue;
      const t = [e.dy, -e.dx];
      for (const [a, o] of [[20, 0], [-20, 0], [40, 0], [-40, 0], [0, 12], [60, 0], [-60, 0], [20, 12], [-20, 12], [80, 0], [-80, 0], [0, 24], [110, 0], [-110, 0]]) {
        const d = [t[0] * a + e.dx * o, t[1] * a + e.dy * o], b = [e.box[0] + d[0], e.box[1] + d[1], e.box[2] + d[0], e.box[3] + d[1]];
        if (b[0] < B.E[0] || b[2] > B.E[2] || b[1] < B.E[1] || b[3] > B.E[3] || onLine(b) || S.some((x) => x !== e && over(x.box, b)) || fixed.some((f) => over(f, b))) continue;
        e.box = b;
        break;
      }
    }
    for (const e of all) {
      e.node.style.transform = `translate(${e.box[0].toFixed(1)}px,${e.box[1].toFixed(1)}px)`;
      e.node.style.visibility = '';
    }
  },
  /* The next vehicle of each line and side that is not on the map yet: quiet words where its route comes in – '142 · 7 Min.' –
   * and a short tick in the line's colour on the line there (where the route's data begin inside the view: at that end).
   * A vehicle is either a disc on the map or such a hint, never both. Never over a chip, a vehicle, the heading or the bar. */
  _tmHints(bySide, framed) {
    const box = this._tview.querySelector('.tm-hs'), B = this._tmBox, now = Date.now(), u = this._tmView.u;
    if (!box || !B) return;
    if (!framed) this._tmFrame(true);
    const F = B.E, inF = (p) => p[0] >= F[0] && p[0] <= F[2] && p[1] >= F[1] && p[1] <= F[3];
    const hints = [];
    for (const [g, list] of bySide) for (const key of g.ug ? g.dirs : g.refs) {
      const ref = g.ug ? key.ref : key, mine = (x) => (g.ug ? key.plats.includes(x.p) : x.d.line === ref);
      const e = list.filter((x) => mine(x) && !x.d.cancelled && x.d.t > now + 30e3 && x.d.t - now < (this._m ? 10 : 15) * 60e3).sort((x, y) => x.d.t - y.d.t)[0];
      if (!e || this._tmVeh.get(e.d.trip)?.shown) continue;
      const sc = this._tmScr.get(`${e.p.ri}:${e.p.li}`);
      if (!sc) continue;
      // back along the route from the stop until it leaves the view – where the data of a piece begin, on along the piece
      // that ends there; a route that begins inside the view gets no hint (it would stand in the middle of the map)
      const at = tmAtS(sc, e.p.s), pieces = this._tmG.routes[e.p.ri].lines.map((_, li) => this._tmScr.get(`${e.p.ri}:${li}`)?.P).filter(Boolean);
      let q = null, ang = 0, b = at.p, P = sc.P, i = at.i - 1;
      for (let hop = 0; hop < 4 && !q; hop++) {
        for (; i >= 0; b = P[i], i--) {
          const a = P[i];
          if (inF(a)) continue;
          let lo = 0, hi = 1;
          for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2, p = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]; if (inF(p)) hi = m; else lo = m; }
          q = [a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi];
          ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
          break;
        }
        const head = P[0], prev = !q && pieces.find((o) => o !== P && tmLen(o[o.length - 1], head) < 30 * u);
        if (!prev) break;
        P = prev;
        i = P.length - 1;
      }
      if (!q) continue;
      // its minutes only when no chip or plate says them already: else the badge says where it comes from, the chip when
      const look = this._tmLook(ref, e.p.prod), m = Math.floor((e.d.t - now) / 60000);
      const txt = this._tmOnChip?.has(e.d.trip) ? '' : m < 1 ? `<i>${esc(t('depNow'))}</i>` : `<i>${m}</i>${esc(t('min'))}`;
      hints.push({ trip: e.d.trip, q, ang, look, c: look.glow.map((v) => Math.round(v + (255 - v) * 0.3)).join(','), ref, txt, late: e.d.delay >= DEP_LATE });
    }
    const hh = hints.map((h) => `<i class="tm-tk" style="--c:${h.c};transform:translate(${h.q[0].toFixed(1)}px,${h.q[1].toFixed(1)}px) rotate(${((h.ang * 180) / Math.PI).toFixed(0)}deg)"></i>`
      + `<div class="tm-h" data-x="${h.q[0].toFixed(1)}" data-y="${h.q[1].toFixed(1)}" data-a="${h.ang.toFixed(3)}">${this._tmBadge(h.ref, h.look)}${h.txt ? `<span${h.late ? ' class="late"' : ''}>${h.txt}</span>` : ''}</div>`).join('');
    if (box.dataset.h !== hh) { box.dataset.h = hh; box.innerHTML = hh; }
    this._tmHinted = new Set(hints.map((h) => h.trip));
    // what is there first: the stops' chips, plates, names and lights, the vehicles on the map with their minutes
    const rb = this._root.getBoundingClientRect(), sc = rb.width / B.W || 1;
    const placed = (this._tmSides || []).filter((e) => e.box && !e.row).concat(this._tmPlates || []).map((e) => [e.box[0] - 4, e.box[1] - 4, e.box[2] + 4, e.box[3] + 4])
      .concat([...this._tview.querySelectorAll('.tm-sl, .tm-pt')].map((n) => { const b = n.getBoundingClientRect(); return [(b.left - rb.left) / sc - 4, (b.top - rb.top) / sc - 4, (b.right - rb.left) / sc + 4, (b.bottom - rb.top) / sc + 4]; }));
    for (const v of this._tmVeh.values()) if (v.shown && v.xy) { const r = 18 * u; placed.push([v.xy[0] - r, v.xy[1] - r, v.xy[0] + r, v.xy[1] + r]); }
    for (const b of this._tmNameBoxes || []) placed.push([b[0] - 2, b[1] - 2, b[2] + 2, b[3] + 2]);
    const mid = [(F[0] + F[2]) / 2, (F[1] + F[3]) / 2], lines = this._tmLinePts || [];
    for (const el of box.querySelectorAll('.tm-h')) {
      const w = el.offsetWidth, h = el.offsetHeight, a = +el.dataset.a, qx = +el.dataset.x, qy = +el.dataset.y;
      // just inside the tick and beside its line (never on it), on the side towards the middle first
      const e = [Math.cos(a), Math.sin(a)], n = [-e[1], e[0]], along = Math.abs(e[0]) * (w / 2) + Math.abs(e[1]) * (h / 2) + 4, across = Math.abs(n[0]) * (w / 2) + Math.abs(n[1]) * (h / 2) + 5;
      const at = (sg) => [qx + e[0] * along + n[0] * across * sg - w / 2, qy + e[1] * along + n[1] * across * sg - h / 2];
      const sides = [at(1), at(-1)].sort((p, o) => tmLen([p[0] + w / 2, p[1] + h / 2], mid) - tmLen([o[0] + w / 2, o[1] + h / 2], mid));
      const hit = (x, y) => B.keep.concat(placed).some((q) => x < q[2] && x + w > q[0] && y < q[3] && y + h > q[1]) || lines.some((p) => p[0] > x && p[0] < x + w && p[1] > y && p[1] < y + h);
      let spot = null;
      for (const [x0, y0] of sides) {
        const side = Math.min(x0 - F[0], F[2] - w - x0) < Math.min(y0 - F[1], F[3] - h - y0) ? 'v' : 'h';
        for (const d of [0, 10, 20, 30, 40]) {
          const x = clamp(side === 'h' ? x0 + d * Math.sign(x0 + w / 2 - qx || 1) : x0, F[0], F[2] - w), y = clamp(side === 'v' ? y0 + d * Math.sign(y0 + h / 2 - qy || 1) : y0, F[1], F[3] - h);
          if (!hit(x, y)) { spot = [x, y]; break; }
        }
        if (spot) break;
      }
      // no free spot near its tick: the tick alone says it
      el.style.visibility = spot ? '' : 'hidden';
      if (!spot) continue;
      placed.push([spot[0] - 4, spot[1] - 2, spot[0] + w + 4, spot[1] + h + 2]);
      el.style.transform = `translate(${spot[0].toFixed(1)}px,${spot[1].toFixed(1)}px)`;
    }
  },

  /* The next departures of a stop, opened from a chip or a plate: a card like the board's with the next three of every line
   * and direction – what was tapped first. Kept up to date while it is open. */
  _tmOpen(node) {
    const side = (this._tmSides || []).find((x) => x.id === node.dataset.side), si = side ? side.g.si : +node.dataset.stn, s = this._M.dep.stops[si];
    if (!s) return;
    const name = s.name || s.id;
    this._showPop((upd) => {
      const v = mk('div', 'pv'), body = mk('div', 'tm-pop');
      v.append(this._head(name, t(side && !side.row ? 'tmNext3Side' : 'tmNext3')), body);
      upd.push(() => { const h = this._tmPopHtml(si, side?.id); if (body.dataset.h !== h) { body.dataset.h = h; body.innerHTML = h; } });
      return v;
    }, { from: node.closest('.tm-pf') || node, cls: side && !side.row ? 'tmp tms' : 'tmp', label: name, kind: `tm:${si}` });
  },
  _tmPopHtml(si, first) {
    const now = Date.now(), unit = t('min'), by = this._tmBySide || new Map(), all = (this._tmSides || []).filter((x) => x.g.si === si);
    const at = (ms) => new Date(ms).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
    // the tapped side (or the station, its lines) first
    const tapped = all.find((x) => x.id === first), ugFirst = !tapped || tapped.row;
    const rank = (x) => (x === tapped ? 0 : !!x.row === ugFirst ? 1 : 2);
    // a side of the street: only that side (the other one has its own chip); a station: all its lines
    const sides = tapped && !tapped.row ? [tapped] : all.map((x, i) => [x, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);
    // a line in one direction: its badge (beside all its directions), arrow and destination, the next three
    const row = (ref, prod, ang, es, rows, p) => {
      const list = es.filter((e) => e.d.t > now - 30e3).sort((a, b) => a.d.t - b.d.t), go = list.filter((e) => !e.d.cancelled).slice(0, 3);
      const to = this._tmTo(list, p), last = go.length === 3 ? go[2].d.t : Infinity;
      const notes = list.filter((e) => e.d.cancelled && e.d.t <= last).map((e) => `<s>${esc(at(e.d.t))}</s> ${esc(t('depCancelled'))}`)
        .concat(go.filter((e) => e.d.dir && e.d.dir !== to).map((e) => esc(t('tmOnlyTo', at(e.d.t), e.d.dir))));
      let unitShown = false;
      const cells = go.map((e, i) => {
        // the unit once, with the first number (the times after it like the board's 'then 10, 20')
        const f = this._depTime(e.d.t), late = e.d.delay >= DEP_LATE, clock = at(e.d.t), un = !f.word && !unitShown;
        if (un) unitShown = true;
        return `<span class="tm-pc${i ? '' : ' hero'}${late ? ' late' : ''}"><b>${esc(f.v)}${un ? `<small>${esc(unit)}</small>` : ''}</b>`
          + `<i>${f.v === clock ? '' : esc(clock)}${late ? `<em>+${Math.round(e.d.delay / 60)}</em>` : ''}</i></span>`;
      }).join('') || '<span class="tm-pc hero none"><b>–</b><i></i></span>';
      return `${rows ? this._tmBadge(ref, this._tmLook(ref, prod), rows) : ''}<span class="tm-pd"><span class="tm-pto">${tmArrow(ang)}<span>${esc(to)}</span></span>`
        + `<span class="tm-psub">${notes.join(' · ')}</span></span><span class="tm-pcs">${cells}</span>`;
    };
    const order = (a, b) => (DEP_ORDER.indexOf(this._tmLook(a, 'bus').prod) - DEP_ORDER.indexOf(this._tmLook(b, 'bus').prod)) || a.localeCompare(b, undefined, { numeric: true });
    const groups = sides.map(({ g }) => {
      const list = by.get(g) || [];
      if (!g.ug) return g.refs.slice().sort(order).map((ref) => row(ref, g.plats[0].prod, g.ang, list.filter((e) => e.d.line === ref), 1, g.plats.find((p) => p.ref === ref))).join('');
      const dirs = g.dirs.slice().sort((a, b) => tmOrder(a.ang) - tmOrder(b.ang));
      return dirs.map((dr, i) => row(g.refs[0], dr.prod, dr.ang, list.filter((e) => dr.plats.includes(e.p)), i ? 0 : dirs.length, dr.plats[0])).join('');
    }).filter(Boolean);
    return groups.join('<hr>') || `<p class="tm-pmsg">${esc(t('depNone'))}</p>`;
  },

  /* ---------------------------------------------------------------- the vehicles move (only while the map is shown) */
  /* Once a second, and only while the map is on screen (a frame is asked for first – none comes for a hidden or covered
   * window): where the vehicles will be a second later. The browser glides them there on its own. */
  _tmKick() {
    if (this._tmRaf || this._tmTO || !this._tmOn()) return;
    const step = () => {
      this._tmTO = null;
      this._tmRaf = requestAnimationFrame(() => {
        this._tmRaf = null;
        if (!this._tmOn() || document.hidden) return;
        // the next step first: what runs now (and kicks the loop) finds it under way
        this._tmTO = setTimeout(step, 1000);
        this._tmFrame();
        // the map asks for news itself while it is on screen – timers of a covered browser window are slowed down
        const now = Date.now();
        if (now - (this._tmPoll || 0) > 5e3) { this._tmPoll = now; this._depFetch(); }
        if (now - (this._tmShown || 0) > 10e3) this._tmShow();
      });
    };
    step();
  },
  _tmFrame(quiet) {
    const box = this._tview?.querySelector('.tm-vs'), G = this._tmG, V = this._tmView;
    if (!box || !G || !V || !this._tmScr) return;
    // where they will be when the next step comes (the minutes are those of now)
    const now = Date.now(), at = now + 1000, u = V.u, lit = [], r = 17 * u, keep = this._tmBox?.keep || [], bot = (this._tmBox?.E[3] ?? V.H) + 10;
    // a disc only where it is whole and free (below the dark band of the heading, above the footer's, not under the heading,
    // the footer or the layer bar) – else a hint at the edge
    const safe = (p) => p[0] - r > 4 && p[0] + r < V.W - 4 && p[1] - r > 40 && p[1] + r < bot && !keep.some((k) => p[0] + r > k[0] && p[0] - r < k[2] && p[1] + r > k[1] && p[1] - r < k[3]);
    let boxes = null;
    for (const [id, v] of this._tmVeh) {
      let p = null, ang = v.ang || 0, s = null;
      if (v.track) {
        s = tmTrack(v.track, at);
        const sc = this._tmScr.get(`${v.ri}:${v.li}`);
        if (sc) {
          const a = tmAtS(sc, s), P = sc.P, i = a.i;
          p = a.p;
          ang = Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]);
        }
      } else if (v.raw) p = this._tmX(v.raw[v.raw.length - 1].slice(1));
      // the stop it heads for: of the stops it calls at, the next one still ahead of it (metres along the whole route)
      const vrs = s != null && v.ri >= 0 ? G.routes[v.ri].lines[v.li].o + s : null;
      const e = (this._tmEta?.get(id) || []).filter((x) => x.d.t > now - 45e3 && (vrs == null || x.p.ri !== v.ri || vrs <= x.p.rs + 25)).sort((a, b) => a.d.t - b.d.t)[0] || null;
      // at the end of its way it fades; leaving (no stop ahead): a quiet dot
      const out = !p || now > tmEnd(v);
      const gone = !e, ahead = e && vrs != null && e.p.ri === v.ri ? e.p.rs - vrs : null;
      // its way to the stop lights up in its colour (the next one there, from a few minutes away)
      if (ahead != null && ahead > 0 && e.p.li === v.li && this._tmNext?.has(id) && e.d.t - now < 6 * 60e3) {
        const sc = this._tmScr.get(`${v.ri}:${v.li}`), a = sc && tmAtS(sc, s), b = sc && tmAtS(sc, e.p.s);
        if (sc && b.i >= a.i) {
          const d = `M${[a.p, ...sc.P.slice(a.i, b.i), b.p].map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join('L')}`, c = `rgb(${this._tmLook(v.ref, v.prod).glow.join(',')})`, ug = v.prod === 'subway' ? ' ug' : '';
          lit.push(`<path class="gl${ug}" d="${d}" stroke="${c}"/><path class="co${ug}" d="${d}" stroke="${c}"/>`);
        }
      }
      // an element only once it is on the map
      if (!v.el && (out || !safe(p))) { v.shown = false; if (out) this._tmVeh.delete(id); continue; }
      if (!v.el) {
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
      // a glide of a second – a jump (another view, another place on the route) without one
      const jump = !v.pp || v.view !== V || tmLen(v.pp, p) > 60 * u;
      if (jump !== !!v.jump) { v.jump = jump; v.el.classList.toggle('jump', jump); }
      if (!v.pp || Math.abs(v.pp[0] - p[0]) > 0.15 || Math.abs(v.pp[1] - p[1]) > 0.15) { v.pp = p; v.el.style.transform = `translate(${p[0].toFixed(1)}px,${p[1].toFixed(1)}px)`; }
      v.view = V;
      // the arrow turns the short way round
      if (v.ang == null) v.ang = ang;
      else v.ang += Math.atan2(Math.sin(ang - v.ang), Math.cos(ang - v.ang));
      const deg = Math.round((v.ang * 180) / Math.PI);
      if (deg !== v.deg) { v.deg = deg; v.arEl.style.transform = `rotate(${deg}deg)`; }
      v.el.classList.toggle('gone', gone);
      v.shown = safe(p);
      v.el.classList.toggle('off', !v.shown);
      // the minutes beside it – not once it is close to its stop or due: the chip there says it ('jetzt' only there; still
      // far away, its 'now' is one minute)
      const m = e ? Math.floor((e.d.t - now) / 60000) : null;
      const txt = e && !(ahead != null && ahead < 160) && m >= 1 ? tmIn(m) : '';
      if (txt !== v.txt) { v.txt = txt; v.etEl.innerHTML = txt; v.etW = v.etEl.offsetWidth; v.etH = v.etEl.offsetHeight; }
      // the minutes beside the marker – on the side away from the edge and clear of the stops' chips (there the chip says it)
      if (txt) {
        const off = 25 * u, w = v.etW || 60, h = v.etH || 20, chips = boxes || (boxes = (this._tmSides || []).filter((x) => x.box && !x.row).concat(this._tmPlates || []).map((x) => x.box));
        const hit = (x0) => chips.some((b) => x0 < b[2] && x0 + w > b[0] && p[1] - h / 2 < b[3] && p[1] + h / 2 > b[1]);
        const rx = p[0] + off, lx = p[0] - off - w, prefer = p[0] > V.W - 140 * u ? 'l' : 'r';
        const side = !hit(prefer === 'r' ? rx : lx) ? prefer : !hit(prefer === 'r' ? lx : rx) ? (prefer === 'r' ? 'l' : 'r') : 'x';
        if (side !== v.side) { v.side = side; v.etEl.classList.toggle('l', side === 'l'); v.etEl.classList.toggle('x', side === 'x'); }
      }
    }
    const html = lit.join(''), svg = this._tview.querySelector('.tm-lit');
    if (svg && html !== this._tmLitH) { this._tmLitH = html; svg.innerHTML = html; }
    // a chip a vehicle passes under (more than its rim) steps back for it (a station's plate stays: it is the answer there,
    // and its rows over a disc would only blur into each other)
    const discs = [...this._tmVeh.values()].filter((x) => x.shown && x.xy).map((x) => x.xy), m = r / 2;
    for (const c of (this._tmSides || []).filter((x) => x.box && !x.row)) {
      const under = discs.some((p) => p[0] > c.box[0] - m && p[0] < c.box[2] + m && p[1] > c.box[1] - m && p[1] < c.box[3] + m);
      if (under !== !!c.under) { c.under = under; c.node?.classList.toggle('under', under); }
    }
    // a vehicle that has come into view is no longer a hint at the edge
    if (!quiet && this._tmBySide && [...(this._tmHinted || [])].some((id) => this._tmVeh.get(id)?.shown)) this._tmHints(this._tmBySide, true);
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
/* when a vehicle's way ends: the end of its track – off its route a minute and a quarter after it was seen */
const tmEnd = (v) => (v.track ? v.track[v.track.length - 1][0] : v.raw ? v.raw[v.raw.length - 1][0] + 75e3 : 0);
/* metres along the route at a time: between the observations, held at the ends */
function tmTrack(T, now) {
  if (now <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (now <= T[i][0]) { const a = T[i - 1], b = T[i]; return a[1] + ((b[1] - a[1]) * (now - a[0])) / ((b[0] - a[0]) || 1); }
  return T[T.length - 1][1];
}
/* a side of a stop by what it is made of (stays the same when the map is drawn anew) */
const tmSideId = (g) => `${g.si}-${g.plats.map((p) => `${p.ri}.${p.li}`).sort().join('_')}`;
/* an arrow that points where a direction goes on the map */
const tmArrow = (a) => `<span class="ar">${icon('arrowR').replace('<svg', `<svg style="transform:rotate(${((a * 180) / Math.PI).toFixed(0)}deg)"`)}</span>`;
/* 'in 4 min' with the numeral as on the chips */
const tmIn = (m) => t('tmIn', `<b>${m}</b>`);
/* where two segments cross (or null) */
function tmCross(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]], den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, v = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && v >= 0 && v <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
}
/* a direction's place in a row: west before east, north before south */
const tmOrder = (a) => (Math.abs(Math.cos(a)) >= Math.abs(Math.sin(a)) ? (Math.cos(a) < 0 ? 0 : 1) : Math.sin(a) < 0 ? 2 : 3);
/* a JSON request that gives up after `ms`, reading the answer included (a request that hangs would block its next one
 * for good) → { ok, status, j } */
function tmFetch(url, opt, ms) {
  const ab = typeof AbortController === 'function' ? new AbortController() : null, tm = ab && setTimeout(() => ab.abort(), ms);
  return fetch(url, { ...(opt || {}), ...(ab ? { signal: ab.signal } : {}) })
    .then((r) => (r.ok ? r.json().then((j) => ({ ok: true, status: r.status, j })) : { ok: false, status: r.status, j: null }))
    .finally(() => clearTimeout(tm));
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
  layer_departures_map: 'Map', tmIn: (m) => `in ${m}min`, tmLoading: 'Loading the map …', tmOffline: 'Map data not reachable – trying again shortly',
  tmNoStops: 'The live map needs stops with an id', tmAttr: '© OpenStreetMap contributors', tmUnderground: 'Subway underground · train positions estimated',
  tmUndergroundShort: 'Subway · positions estimated', tmLate: 'late', tmBadStop: 'A stop of the map is not known to the timetable',
  tmNext3: 'The next three each way', tmNext3Side: 'This side · the next three of each line', tmOnlyTo: (c, d) => `${c} only to ${d}`,
});
Object.assign(STR.de, {
  layer_departures_map: 'Karte', tmIn: (m) => `in ${m}Min.`, tmLoading: 'Karte wird geladen …', tmOffline: 'Kartendaten nicht erreichbar – neuer Versuch gleich',
  tmNoStops: 'Die Live-Karte braucht Haltestellen mit id', tmAttr: '© OpenStreetMap-Mitwirkende', tmUnderground: 'U-Bahn unterirdisch · Zuglage geschätzt',
  tmUndergroundShort: 'U-Bahn · Zuglage geschätzt', tmLate: 'verspätet', tmBadStop: 'Eine Haltestelle der Karte kennt der Fahrplan nicht',
  tmNext3: 'Die nächsten drei je Richtung', tmNext3Side: 'Diese Straßenseite · die nächsten drei je Linie', tmOnlyTo: (c, d) => `${c} nur bis ${d}`,
});
