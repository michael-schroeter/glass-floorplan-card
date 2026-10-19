/* ================================================================== Model: card configuration → geometry, devices, layers
 * Coordinates are plan units – centimetres by default (`scale: n` = centimetres per unit for traced plans).
 * Rooms are stored edge to edge; the card draws them as glass tiles with a small gap (the walls).
 * UI sizes (fonts, buttons, radii) use design units: 935 design units ≈ the plan's diagonal size (√(w·h)),
 * so the card looks the same for a studio flat and for a house. */

const FURN_KINDS = {
  sofa: { w: 220, h: 90, r: 14, icon: 'sofa' },
  armchair: { w: 85, h: 85, r: 12, icon: 'sofa' },
  bed: { w: 180, h: 200, r: 12, icon: 'bed' },
  bed_single: { w: 90, h: 200, r: 10, icon: 'bed' },
  table: { w: 160, h: 90, r: 8, icon: 'table' },
  round_table: { w: 110, h: 110, c: true, icon: 'round' },
  chair: { w: 46, h: 46, c: true, icon: 'chair' },
  desk: { w: 140, h: 70, r: 8, icon: 'desk' },
  wardrobe: { w: 200, h: 60, r: 8, icon: 'wardrobe' },
  shelf: { w: 100, h: 36, r: 6, icon: 'shelf' },
  sideboard: { w: 160, h: 45, r: 7, icon: 'shelf' },
  tv: { w: 130, h: 14, r: 6, icon: 'tv' },
  counter: { w: 240, h: 62, r: 8, icon: 'counter' },
  fridge: { w: 62, h: 66, r: 6, icon: 'fridge' },
  bath: { w: 170, h: 75, r: 22, icon: 'bath' },
  shower: { w: 90, h: 90, r: 14, icon: 'shower' },
  toilet: { w: 40, h: 62, r: 14, icon: 'toilet' },
  sink: { w: 60, h: 46, r: 14, icon: 'sink' },
  washer: { w: 60, h: 60, r: 8, icon: 'washer' },
  plant: { w: 50, h: 50, c: true, icon: 'sprout' },
  rug: { w: 200, h: 140, r: 16, icon: 'rug' },
  stairs: { w: 100, h: 260, r: 6, icon: 'stairs' },
  block: { w: 80, h: 80, r: 8, icon: 'grip' },
};

/* Built-in layers: which kinds of placed devices they show */
const LAYER_TYPES = {
  light: { icon: 'bulb', kinds: ['light', 'media', 'door'] },
  climate: { icon: 'thermo', kinds: ['climate'] },
  cover: { icon: 'blinds', kinds: ['cover'] },
  vacuum: { icon: 'robot', kinds: ['vacuum'] },
};
const SHOW_KINDS = ['light', 'media', 'door', 'climate', 'cover'];

function kindOf(eid, st) {
  const d = domainOf(eid), dc = st?.attributes?.device_class;
  if (d === 'light') return 'light';
  if (d === 'media_player') return 'media';
  if (d === 'climate' || d === 'water_heater' || d === 'humidifier') return 'climate';
  if (d === 'sensor' && (dc === 'temperature' || dc === 'humidity')) return 'climate';
  if (d === 'cover') return 'cover';
  return 'other';
}

const normPt = (a) => (Array.isArray(a) && a.length >= 2 && a.slice(0, 2).every((v) => Number.isFinite(+v)) ? [+a[0], +a[1]] : null);
function normRect(a) {
  if (!Array.isArray(a) || a.length < 4) return null;
  const [x1, y1, x2, y2] = a.slice(0, 4).map(Number);
  if (![x1, y1, x2, y2].every(Number.isFinite) || x1 === x2 || y1 === y2) return null;
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}
/* Wall segment, always axis-aligned: [x1, y, x2, y] or [x, y1, x, y2]; [x1, x2, y] is accepted as well */
function normSeg(a) {
  if (!Array.isArray(a)) return null;
  let v = a.map(Number);
  if (v.length === 3) v = [v[0], v[2], v[1], v[2]];
  if (v.length < 4 || !v.slice(0, 4).every(Number.isFinite)) return null;
  const [x1, y1, x2, y2] = v;
  if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) { const y = (y1 + y2) / 2; return [Math.min(x1, x2), y, Math.max(x1, x2), y]; }
  const x = (x1 + x2) / 2;
  return [x, Math.min(y1, y2), x, Math.max(y1, y2)];
}
const segH = (s) => s[1] === s[3];
function normFurn(f) {
  if (!f) return null;
  let rect, kind = 'block', rad = null, circle = false;
  if (Array.isArray(f)) {
    rect = normRect(f);
    const k = f[4];
    if (k === 'c') circle = true;
    else if (typeof k === 'number') rad = k;
    else if (typeof k === 'string') kind = k;
    if (typeof f[5] === 'string') kind = f[5];
  } else {
    rect = normRect(f.rect);
    kind = f.kind || 'block';
    if (f.radius != null) rad = +f.radius;
  }
  if (!rect) return null;
  const def = FURN_KINDS[kind] || FURN_KINDS.block;
  if (def.c) circle = true;
  return { r: rect, kind, rad: rad ?? def.r ?? 8, circle };
}
function normEntity(e) {
  if (typeof e === 'string') e = { entity: e };
  if (!e || typeof e.entity !== 'string' || !e.entity.includes('.')) return null;
  return {
    entity: e.entity, at: normPt(e.at), room: e.room != null ? String(e.room) : null, name: e.name || null, icon: e.icon || null,
    watt: +e.watt || null, power: e.power || null, kelvin: +e.kelvin || null, beams: Math.max(0, Math.min(6, e.beams | 0)),
    plan: e.plan !== false, reach: +e.reach || null, color: Array.isArray(e.color) ? e.color.map(Number) : null,
  };
}

const rectArea = (r) => (r[2] - r[0]) * (r[3] - r[1]);
const inRect = (r, [x, y], m = 0) => x >= r[0] - m && x <= r[2] + m && y >= r[1] - m && y <= r[3] + m;
const rectDist = (r, [x, y]) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - y, 0, y - r[3]));
const center = (r) => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
function bboxOf(rects) {
  if (!rects.length) return null;
  return rects.reduce((b, r) => [Math.min(b[0], r[0]), Math.min(b[1], r[1]), Math.max(b[2], r[2]), Math.max(b[3], r[3])], [Infinity, Infinity, -Infinity, -Infinity]);
}

/* Rotates every coordinate of the model by ±90° (portrait phones) */
function rotateModel(M, dir) {
  const B = bboxOf(M.rooms.map((r) => r.r));
  if (!B) return;
  const P = dir > 0 ? ([x, y]) => [B[0] + (B[3] - y), B[1] + (x - B[0])] : ([x, y]) => [B[0] + (y - B[1]), B[1] + (B[2] - x)];
  const R = (r) => { const a = P([r[0], r[1]]), b = P([r[2], r[3]]); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };
  const S = (s) => { const a = P([s[0], s[1]]), b = P([s[2], s[3]]); return normSeg([a[0], a[1], b[0], b[1]]); };
  for (const r of M.rooms) { r.r = R(r.r); for (const f of r.furn) f.r = R(f.r); }
  M.windows = M.windows.map(S);
  M.passages = M.passages.map(S);
  if (M.entrance) M.entrance = S(M.entrance);
  for (const e of M.ents) if (e.at) e.at = P(e.at);
  if (M.door?.at) M.door.at = P(M.door.at);
  if (M.vac?.dock) M.vac.dock = P(M.vac.dock);
  M.rot = dir;
}

function buildModel(cfg, hass, { mobile = false } = {}) {
  cfg = cfg || {};
  const st = (id) => hass?.states?.[id];
  const ids = new Set();
  const rooms = [];
  (Array.isArray(cfg.rooms) ? cfg.rooms : []).forEach((r, i) => {
    const rect = normRect(r?.rect);
    if (!rect) return;
    let id = String(r.id || slug(r.name) || `room_${i + 1}`);
    while (ids.has(id)) id += '_';
    ids.add(id);
    rooms.push({
      id, name: r.name ?? id, area: r.area || null, r: rect, lb: r.label === 'bottom', m2: +r.m2 || null,
      furn: (Array.isArray(r.furniture) ? r.furniture : []).map(normFurn).filter(Boolean),
      helpers: [].concat(r.helpers || []).filter((h) => typeof h === 'string'),
    });
  });
  const seen = new Set();
  const ents = (Array.isArray(cfg.entities) ? cfg.entities : []).map(normEntity).filter((e) => e && !seen.has(e.entity) && seen.add(e.entity));
  const d = cfg.door;
  const door = d && (d.open || d.doorbell) ? { open: d.open || null, bell: d.doorbell || null, at: normPt(d.at), room: d.room || null, name: d.name || null } : null;
  const v = cfg.vacuum;
  const vac = v && v.entity ? { ...v, dock: normPt(v.dock) } : null;
  const M = {
    cfg, rooms, ents, door, vac, rot: 0,
    windows: (cfg.windows || []).map(normSeg).filter(Boolean),
    passages: (cfg.doors || []).map(normSeg).filter(Boolean),
    entrance: normSeg(cfg.entrance),
    scale: +cfg.scale > 0 ? +cfg.scale : 1,
  };
  for (const e of ents) e.kind = kindOf(e.entity, st(e.entity));
  // weather + indoor sensors (auto-detected unless switched off)
  M.weather = cfg.weather === false ? null : cfg.weather || Object.keys(hass?.states || {}).find((k) => k.startsWith('weather.')) || null;

  const landscape = (() => { const B = bboxOf(rooms.map((r) => r.r)); return B && (B[2] - B[0]) > (B[3] - B[1]) * 1.08; })();
  const mr = cfg.mobile?.rotate ?? 'auto';
  if (mobile && rooms.length) {
    const dir = mr === 'auto' ? (landscape ? 1 : 0) : +mr === 90 ? 1 : +mr === -90 || +mr === 270 ? -1 : 0;
    if (dir) rotateModel(M, dir);
  }
  finishModel(M, hass, mobile);
  return M;
}

function finishModel(M, hass, mobile) {
  const B = bboxOf(M.rooms.map((r) => r.r)) || [0, 0, 1200, 800];
  M.bbox = B;
  M.D = Math.sqrt((B[2] - B[0]) * (B[3] - B[1])) / 935;
  const D = M.D;
  for (const r of M.rooms) {
    r.m2 = r.m2 || (rectArea(r.r) * M.scale * M.scale) / 1e4;
  }
  // devices → room (explicit, else the room under the marker, else the nearest one)
  const byId = Object.fromEntries(M.rooms.map((r) => [r.id, r]));
  const roomFor = (pt, explicit) => {
    if (explicit && byId[explicit]) return explicit;
    if (!pt || !M.rooms.length) return null;
    const hits = M.rooms.filter((r) => inRect(r.r, pt));
    if (hits.length) return hits.sort((a, b) => rectArea(a.r) - rectArea(b.r))[0].id;
    return M.rooms.slice().sort((a, b) => rectDist(a.r, pt) - rectDist(b.r, pt))[0].id;
  };
  M.roomAt = (pt) => roomFor(pt);
  for (const e of M.ents) {
    e.room = roomFor(e.at, e.room);
    if (!e.room && hass?.entities?.[e.entity]) {
      const area = hass.entities[e.entity].area_id || hass.devices?.[hass.entities[e.entity].device_id]?.area_id;
      e.room = M.rooms.find((r) => r.area && r.area === area)?.id || null;
    }
    const rm = byId[e.room];
    e.reach = e.reach || (rm ? clamp(0.8 * Math.sqrt(rectArea(rm.r)), 110 * D, 300 * D) : 200 * D);
  }
  if (M.door) M.door.room = roomFor(M.door.at, M.door.room);
  M.byRoom = byId;

  // indoor climate: configured sensors, else every placed temperature / humidity source
  const ic = M.cfg.indoor;
  M.indoor = ic === false ? [] : Array.isArray(ic) && ic.length ? ic : M.ents.filter((e) => e.kind === 'climate').map((e) => e.entity);
  M.layers = buildLayers(M);
  M.widgets = placeWidgets(M, mobile);
  const all = [B, ...['card', 'weather', 'indoor', 'door', 'bar'].map((k) => M.widgets[k]).filter(Boolean)];
  const U = bboxOf(all), m = 6 * D;
  M.stage = { x: U[0] - m, y: U[1] - m, w: U[2] - U[0] + 2 * m, h: U[3] - U[1] + 2 * m };
}

function buildLayers(M) {
  let list = M.cfg.layers;
  if (!Array.isArray(list) || !list.length) {
    list = [];
    if (M.ents.some((e) => e.kind === 'light' || e.kind === 'media') || M.door) list.push('light');
    if (M.ents.some((e) => e.kind === 'climate')) list.push('climate');
    if (M.ents.some((e) => e.kind === 'cover')) list.push('cover');
    if (M.vac) list.push('vacuum');
    if (!list.length) list.push('light');
  }
  const out = [], used = new Set();
  list.forEach((l, i) => {
    let L;
    if (typeof l === 'string' || (l && LAYER_TYPES[l.type] && !l.show && !l.entities)) {
      const type = typeof l === 'string' ? l : l.type;
      if (!LAYER_TYPES[type]) return;
      L = { id: type, type, name: l.name || null, icon: l.icon || LAYER_TYPES[type].icon, kinds: new Set(LAYER_TYPES[type].kinds), ents: new Set() };
    } else if (l && typeof l === 'object') {
      L = {
        id: String(l.id || `layer_${slug(l.name) || i + 1}`), type: 'custom', name: l.name || null, icon: l.icon || 'layers',
        kinds: new Set([].concat(l.show || []).filter((k) => SHOW_KINDS.includes(k))), ents: new Set([].concat(l.entities || [])),
      };
    }
    if (!L || used.has(L.id) || (L.type === 'vacuum' && !M.vac)) return;
    used.add(L.id);
    out.push(L);
  });
  if (!out.length) out.push({ id: 'light', type: 'light', name: null, icon: 'bulb', kinds: new Set(LAYER_TYPES.light.kinds), ents: new Set() });
  return out;
}
const inLayer = (L, e) => !!L && (L.kinds.has(e.kind) || L.ents.has(e.entity));

/* ---------------------------------------------------------------- Free-space layout for the info tiles
 * Tiles (weather, indoor, front door), the layer card and the layer bar go into empty corners of the plan –
 * like the hand-made original. A coarse grid marks the rooms; every widget takes the best free spot,
 * grows into the space around it and snaps its edges to the walls. What does not fit goes next to the plan. */
function placeWidgets(M, mobile) {
  const B = M.bbox, D = M.D, cfgW = (!mobile && M.cfg.widgets) || {};
  const out = { card: null, weather: null, indoor: null, door: null, bar: null, side: null };
  const tiles = ['weather', 'indoor', 'door'].filter((k) => (k === 'weather' ? M.weather : k === 'indoor' ? M.indoor.length : M.door) && cfgW[k] !== false);
  const needBar = !mobile && M.layers.length > 1;
  if (!M.rooms.length) return out;

  const nx = clamp(Math.round((B[2] - B[0]) / (7 * D)), 8, 260), ny = clamp(Math.round((B[3] - B[1]) / (7 * D)), 8, 260);
  const cw = (B[2] - B[0]) / nx, ch = (B[3] - B[1]) / ny;
  const occ = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = [B[0] + (i + 0.5) * cw, B[1] + (j + 0.5) * ch];
    if (M.rooms.some((r) => inRect(r.r, p))) occ[j * nx + i] = 1;
  }
  let P;
  const sums = () => {
    P = new Int32Array((nx + 1) * (ny + 1));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) P[(j + 1) * (nx + 1) + i + 1] = occ[j * nx + i] + P[j * (nx + 1) + i + 1] + P[(j + 1) * (nx + 1) + i] - P[j * (nx + 1) + i];
  };
  sums();
  const free = (i, j, w, h) => i >= 0 && j >= 0 && i + w <= nx && j + h <= ny
    && P[(j + h) * (nx + 1) + i + w] - P[j * (nx + 1) + i + w] - P[(j + h) * (nx + 1) + i] + P[j * (nx + 1) + i] === 0;
  const cells = (v, c) => Math.max(1, Math.ceil(v / c));
  const toRect = ({ i, j, w, h }) => [B[0] + i * cw, B[1] + j * ch, B[0] + (i + w) * cw, B[1] + (j + h) * ch];
  const mark = ({ i, j, w, h }) => { for (let y = j; y < j + h; y++) for (let x = i; x < i + w; x++) occ[y * nx + x] = 1; sums(); };
  // best free spot for a minimum size, scored by preference
  const find = (wMin, hMin, score) => {
    const w = cells(wMin, cw), h = cells(hMin, ch);
    let best = null;
    for (let j = 0; j + h <= ny; j++) for (let i = 0; i + w <= nx; i++) {
      if (!free(i, j, w, h)) continue;
      const s = score(i, j, w, h);
      if (!best || s > best.s) best = { i, j, w, h, s };
    }
    return best;
  };
  // grow into the free space around it, up to a maximum size
  const grow = (c, wMax, hMax) => {
    const W = cells(wMax, cw), H = cells(hMax, ch);
    let changed = true;
    while (changed) {
      changed = false;
      if (c.w < W && free(c.i + c.w, c.j, 1, c.h)) { c.w++; changed = true; }
      if (c.h < H && free(c.i, c.j + c.h, c.w, 1)) { c.h++; changed = true; }
      if (c.w < W && free(c.i - 1, c.j, 1, c.h)) { c.i--; c.w++; changed = true; }
      if (c.h < H && free(c.i, c.j - 1, c.w, 1)) { c.j--; c.h++; changed = true; }
    }
    return c;
  };
  // snap edges onto nearby walls / plan edges (the grid is coarse)
  const xs = [B[0], B[2], ...M.rooms.flatMap((r) => [r.r[0], r.r[2]])], ys = [B[1], B[3], ...M.rooms.flatMap((r) => [r.r[1], r.r[3]])];
  const snap = (r) => {
    const s = (v, list, tol) => { let b = v, d = tol; for (const q of list) { const dd = Math.abs(q - v); if (dd < d) { d = dd; b = q; } } return b; };
    return [s(r[0], xs, cw * 1.6), s(r[1], ys, ch * 1.6), s(r[2], xs, cw * 1.6), s(r[3], ys, ch * 1.6)];
  };
  const edge = (c) => ({ l: c.i === 0, r: c.i + c.w === nx, t: c.j === 0, b: c.j + c.h === ny });

  const g = 13 * D;
  // phones draw the tiles with fixed pixel fonts: they need more room in design units
  const TILE = mobile ? { w: 290 + g, h: 225 + g, minW: 240 + g, minH: 196 + g, maxW: 380 + g, maxH: 280 + g }
    : { w: 209 + g, h: 118 + g, minW: 158 + g, minH: 92 + g, maxW: 300 + g, maxH: 150 + g };
  const CARD = { w: 446 + g, h: 212 + g, minW: 318 + g, minH: 180 + g, maxW: 560 + g, maxH: 250 + g };
  const BAR = { w: 76 + g, h: Math.max(1, M.layers.length) * 64 + 12 + g };

  for (const k of ['card', 'weather', 'indoor', 'door', 'bar']) if (Array.isArray(cfgW[k])) out[k] = normRect(cfgW[k]);

  // layer card (desktop): prefers the bottom right
  if (!mobile && !out.card) {
    const c = find(CARD.minW, CARD.minH, (i, j, w, h) => (j + h / 2) / ny * 2 + (i + w / 2) / nx + (j + h === ny ? 2 : 0) + (i + w === nx ? 1 : 0));
    if (c) { grow(c, CARD.maxW, CARD.maxH); out.card = snap(toRect(c)); mark(c); }
  }
  // info tiles: as one column, else as one row, else one by one
  const todo = tiles.filter((k) => !out[k]);
  if (todo.length) {
    const n = todo.length;
    const colScore = mobile ? (i, j, w, h) => -(i + w / 2) / nx + (j + h / 2) / ny : (i, j, w, h) => (i + w / 2) / nx * 2 - (j / ny) * 0.5 + (i + w === nx ? 2 : 0) + (j === 0 ? 1 : 0);
    let c = find(TILE.minW, n * TILE.minH, colScore), dir = 'col';
    if (!c && n > 1) { c = find(n * TILE.minW, TILE.minH, colScore); dir = 'row'; }
    if (c) {
      grow(c, dir === 'col' ? TILE.maxW : n * TILE.maxW, dir === 'col' ? n * TILE.maxH : TILE.maxH);
      const R = snap(toRect(c));
      mark(c);
      const weights = todo.map((k) => (k === 'door' ? 1.18 : 1)), sum = weights.reduce((a, b) => a + b, 0);
      let pos = dir === 'col' ? R[1] : R[0];
      todo.forEach((k, idx) => {
        const len = ((dir === 'col' ? R[3] - R[1] : R[2] - R[0]) * weights[idx]) / sum;
        out[k] = dir === 'col' ? [R[0], pos, R[2], pos + len] : [pos, R[1], pos + len, R[3]];
        pos += len;
      });
    } else {
      for (const k of todo) {
        const t = find(TILE.minW, TILE.minH, colScore);
        if (!t) continue;
        grow(t, TILE.maxW, TILE.maxH * (k === 'door' ? 1.18 : 1));
        out[k] = snap(toRect(t));
        mark(t);
      }
    }
  }
  // layer bar (desktop): a free strip on the left
  if (needBar && !out.bar) {
    const c = find(BAR.w, BAR.h, (i, j, w, h) => -(i + w / 2) / nx * 3 + (i === 0 ? 2 : 0) - Math.abs((j + h / 2) / ny - 0.36));
    if (c) out.bar = toRect(c);
  }

  // what did not fit goes into a column next to the plan (desktop) or a row under it (phone), drawn at a readable size
  const left = tiles.filter((k) => !out[k]);
  if (left.length || (!mobile && !out.card)) out.side = { tiles: left, card: !mobile && !out.card };
  if (needBar && !out.bar) { const cy = B[1] + (B[3] - B[1]) * 0.36; out.bar = [B[0] - BAR.w, cy - BAR.h / 2, B[0], cy + BAR.h / 2]; }
  return out;
}

/* ---------------------------------------------------------------- Room graph (robot routes)
 * Doors connect rooms; without drawn doors, rooms that share a long enough wall count as connected. */
function roomGraph(M) {
  if (M._graph) return M._graph;
  const D = M.D, tol = 5 * D, edges = [];
  const touching = (s) => M.rooms.filter((r) => {
    const q = r.r;
    if (segH(s)) return (Math.abs(q[1] - s[1]) < tol || Math.abs(q[3] - s[1]) < tol) && (s[0] + s[2]) / 2 > q[0] && (s[0] + s[2]) / 2 < q[2];
    return (Math.abs(q[0] - s[0]) < tol || Math.abs(q[2] - s[0]) < tol) && (s[1] + s[3]) / 2 > q[1] && (s[1] + s[3]) / 2 < q[3];
  });
  const add = (a, b, door, horiz) => {
    const o = 30 * D, ca = center(a.r), cb = center(b.r);
    const off = (r, c) => (horiz ? [door[0], door[1] + Math.sign(c[1] - door[1]) * o] : [door[0] + Math.sign(c[0] - door[0]) * o, door[1]]);
    edges.push({ a: a.id, b: b.id, door, ina: off(a, ca), inb: off(b, cb) });
  };
  for (const s of M.passages) {
    const rs = touching(s);
    if (rs.length >= 2) add(rs[0], rs[1], [(s[0] + s[2]) / 2, (s[1] + s[3]) / 2], segH(s));
  }
  const linked = (id) => edges.some((e) => e.a === id || e.b === id);
  for (let i = 0; i < M.rooms.length; i++) for (let j = i + 1; j < M.rooms.length; j++) {
    const a = M.rooms[i], b = M.rooms[j];
    if (M.passages.length && linked(a.id) && linked(b.id)) continue;
    const A = a.r, Bq = b.r;
    const ov = (p1, p2, q1, q2) => [Math.max(p1, q1), Math.min(p2, q2)];
    if (Math.abs(A[2] - Bq[0]) < tol || Math.abs(Bq[2] - A[0]) < tol) {
      const [y1, y2] = ov(A[1], A[3], Bq[1], Bq[3]);
      if (y2 - y1 > 60 * D) add(a, b, [Math.abs(A[2] - Bq[0]) < tol ? A[2] : A[0], (y1 + y2) / 2], false);
    } else if (Math.abs(A[3] - Bq[1]) < tol || Math.abs(Bq[3] - A[1]) < tol) {
      const [x1, x2] = ov(A[0], A[2], Bq[0], Bq[2]);
      if (x2 - x1 > 60 * D) add(a, b, [(x1 + x2) / 2, Math.abs(A[3] - Bq[1]) < tol ? A[3] : A[1]], true);
    }
  }
  M._graph = edges;
  return edges;
}

/* Waypoints from a point in one room to a point in another (rooms are rectangles, so straight lines stay inside) */
function routeBetween(M, fromRoom, toRoom) {
  if (!fromRoom || !toRoom || fromRoom === toRoom) return [];
  const E = roomGraph(M), prev = { [fromRoom]: null }, q = [fromRoom];
  while (q.length) {
    const k = q.shift();
    if (k === toRoom) break;
    for (const e of E) {
      const n = e.a === k ? e.b : e.b === k ? e.a : null;
      if (n && !(n in prev)) { prev[n] = { k, e }; q.push(n); }
    }
  }
  if (!(toRoom in prev)) return [];
  const hops = [];
  for (let k = toRoom; prev[k]; k = prev[k].k) hops.unshift(prev[k]);
  const pts = [];
  for (const { k, e } of hops) pts.push(...(e.a === k ? [e.ina, e.door, e.inb] : [e.inb, e.door, e.ina]));
  return pts.map((p) => [...p]);
}
