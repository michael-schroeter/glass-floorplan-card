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
  light: { icon: 'bulb', kinds: ['light', 'door'] },
  climate: { icon: 'thermo', kinds: ['climate'] },
  cover: { icon: 'blinds', kinds: ['cover'] },
  vacuum: { icon: 'robot', kinds: ['vacuum'] },
  departures: { icon: 'train', kinds: [] },
  departures_map: { icon: 'map', kinds: [] },
};
/* layers that are a view of their own instead of the plan (the departures as a board and on a map) */
const VIEW_TYPES = ['departures', 'departures_map'];
const SHOW_KINDS = ['light', 'media', 'door', 'climate', 'cover'];
/* A built-in layer in the configuration: 'light', or { type: 'light', entities: [...] } with extra devices of any kind */
const builtinType = (l) => (typeof l === 'string' ? (LAYER_TYPES[l] ? l : null) : l && LAYER_TYPES[l.type] && !l.show ? l.type : null);
/* the extra devices of a built-in layer (ents: [{ entity, kind }]) – before there were extras, TVs belonged to the light layer */
function layerExtras(l, ents) {
  if (l && typeof l === 'object' && Array.isArray(l.entities)) return l.entities.slice();
  return builtinType(l) === 'light' ? ents.filter((e) => e.kind === 'media').map((e) => e.entity) : [];
}

function kindOf(eid, st) {
  const d = domainOf(eid), dc = st?.attributes?.device_class;
  if (d === 'light') return 'light';
  if (d === 'media_player') return 'media';
  if (d === 'climate' || d === 'water_heater' || d === 'humidifier') return 'climate';
  if (d === 'sensor' && (dc === 'temperature' || dc === 'humidity')) return 'climate';
  if (d === 'cover') return 'cover';
  return 'other';
}

/* Window and door contacts: a binary sensor of a window / door, or a sensor that says open / tilted / closed (window handles) */
const OPENING_CLASSES = ['window', 'door', 'garage_door', 'opening'];
const OPEN_WORDS = ['open', 'opened', 'opening', 'on', 'true', 'offen', 'geöffnet', 'auf'];
const TILT_WORDS = ['tilted', 'tilt', 'tilted_open', 'vent', 'ventilating', 'gekippt', 'kipp'];
function openingSensor(eid, st) {
  const d = domainOf(eid), a = st?.attributes || {};
  if (d === 'binary_sensor') return OPENING_CLASSES.includes(a.device_class);
  if (d !== 'sensor') return false;
  // a handle can be tilted; "open" / "closed" alone only counts for a sensor named like a window or a door
  const words = [st?.state, ...(Array.isArray(a.options) ? a.options : [])].map((v) => String(v).toLowerCase());
  if (words.some((w) => TILT_WORDS.includes(w))) return true;
  return words.some((w) => w === 'open' || w === 'closed') && /window|fenster|door|t(ü|ue)r|handle|griff/.test(`${eid} ${a.friendly_name || ''}`.toLowerCase());
}
/* devices that do something (a door opener, a lock, a switch, a cover) keep their button on the plan when they are put on a
 * window / door; contacts only show there */
const contactOnly = (eid) => ['binary_sensor', 'sensor'].includes(domainOf(eid));
const OPENER_MS = 60000;
/* 'open' | 'tilt' | 'closed' | 'na' – a door opener (button) counts as open for a minute after it was pressed */
function openState(eid, st) {
  if (unavailable(st)) return 'na';
  const d = domainOf(eid), s = String(st.state).toLowerCase();
  if (d === 'button' || d === 'input_button') { const age = isTime(st.state) ? Date.now() - new Date(st.state).getTime() : Infinity; return age >= 0 && age < OPENER_MS ? 'open' : 'closed'; }
  if (d === 'binary_sensor') return s === 'on' ? 'open' : 'closed';
  if (d === 'cover') return s === 'closed' ? 'closed' : 'open';
  if (TILT_WORDS.includes(s)) return 'tilt';
  return OPEN_WORDS.includes(s) ? 'open' : 'closed';
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
/* Home Assistant's action schema (tap_action / hold_action / double_tap_action): { action: toggle | more-info | navigate | url |
 * perform-action | assist | fire-dom-event | none, … } – a plain string is the action alone; missing or "default" = the card's own */
function normAction(a) {
  if (typeof a === 'string') a = { action: a };
  return a && typeof a === 'object' && a.action && a.action !== 'default' ? a : null;
}
const actionsOf = (o) => ({ tap: normAction(o.tap_action), hold: normAction(o.hold_action), dbl: normAction(o.double_tap_action) });
function normEntity(e) {
  if (typeof e === 'string') e = { entity: e };
  if (!e || typeof e.entity !== 'string' || !e.entity.includes('.')) return null;
  return {
    entity: e.entity, at: normPt(e.at), room: e.room != null ? String(e.room) : null, name: e.name || null, icon: e.icon || null,
    watt: +e.watt || null, power: e.power || null, kelvin: +e.kelvin || null, beams: Math.max(0, Math.min(6, e.beams | 0)),
    plan: e.plan !== false, reach: +e.reach || null, color: Array.isArray(e.color) ? e.color.map(Number) : null, ...actionsOf(e),
    // on a window / the front door: automatic (null), always (true) or never (false)
    opening: e.opening === true || e.opening === false ? e.opening : null,
  };
}
/* Own tiles: a few values (the first one large), buttons like the devices on the plan, or any Home Assistant card in a
 * glass frame. `size` = [width, height] in tiles – a Home Assistant card gets two tiles of height unless it says otherwise. */
const BUILTIN_TILES = ['card', 'weather', 'indoor', 'door', 'bar', 'side'];
function normTile(x, i) {
  if (!x || typeof x !== 'object') return null;
  let id = String(x.id || `tile_${i + 1}`);
  if (BUILTIN_TILES.includes(id)) id = `tile_${id}`;
  const card = x.card && typeof x.card === 'object' && x.card.type ? x.card : null;
  const sz = [].concat(x.size ?? []).map(Number);
  const size = [clamp(Math.round(sz.length > 1 ? sz[0] : 1) || 1, 1, 3), clamp(Math.round(sz.length > 1 ? sz[1] : sz[0] || (card ? 2 : 1)) || 1, 1, 4)];
  const ents = [].concat(x.entities || x.entity || []).map((e) => (typeof e === 'string' ? { entity: e } : e))
    .filter((e) => e && typeof e.entity === 'string' && e.entity.includes('.')).map((e) => ({ entity: e.entity, name: e.name || null }));
  // buttons: a device each (switched like on the plan) and / or an action of their own (navigate …)
  const btns = card || !Array.isArray(x.buttons) ? null : x.buttons.map((b) => (typeof b === 'string' ? { entity: b } : b)).filter((b) => b && typeof b === 'object')
    .map((b) => ({ entity: typeof b.entity === 'string' && b.entity.includes('.') ? b.entity : null, name: b.name || null, icon: b.icon || null, ...actionsOf(b) }));
  return { id, name: x.name ?? null, icon: x.icon || null, ents, btns, card, size, ...actionsOf(x) };
}
/* buttons on a tile: three side by side per tile of width, one row per tile of height */
const tileBtnCap = (size) => 3 * size[0] * size[1];
/* a tile that takes a whole row of the phone's tiles under the plan */
const tileBig = (x) => !!x.card || x.size[0] > 1 || (!!x.btns && x.size[1] > 1);

/* the sizes of the layer card: as always, small (round buttons beside the state), mini (no strip either) */
const CARD_SIZES = ['normal', 'small', 'mini'];
/* Where a tile goes in one view (laptop: `widgets`, phone: `mobile.widgets`): a rectangle [x1, y1, x2, y2], false (hidden)
 * or { rect, …options } – the layer card: size (normal | small | mini), place (phone: below | plan); the layer bar: direction (vertical |
 * horizontal), place (phone: bottom | plan). Positions on a phone are in its own (turned) plan. */
function widgetOpt(W, k) {
  const v = W?.[k];
  if (v === false) return { off: true, rect: null };
  if (Array.isArray(v)) return { rect: normRect(v) };
  if (v && typeof v === 'object') return { ...v, rect: normRect(v.rect) };
  return { rect: null };
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
  // and back (the editor maps pointer positions on a turned plan to the configuration)
  M.rotP = P;
  M.rotI = dir > 0 ? ([x, y]) => [B[0] + (y - B[1]), B[3] - (x - B[0])] : ([x, y]) => [B[2] - (y - B[1]), B[1] + (x - B[0])];
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
  const tids = new Set();
  const tiles = (Array.isArray(cfg.tiles) ? cfg.tiles : []).map(normTile).filter((x) => x && !tids.has(x.id) && tids.add(x.id));
  const M = {
    cfg, rooms, ents, door, vac, tiles, rot: 0, dep: normDepartures(cfg.departures),
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
  assignOpenings(M, hass);

  // indoor climate: configured sensors, else every placed temperature / humidity source
  const ic = M.cfg.indoor;
  M.indoor = ic === false ? [] : Array.isArray(ic) && ic.length ? ic : M.ents.filter((e) => e.kind === 'climate').map((e) => e.entity);
  M.layers = buildLayers(M);
  M.widgets = placeWidgets(M, mobile);
  const all = [B, ...['card', 'weather', 'indoor', 'door', 'bar', ...M.tiles.map((x) => x.id)].map((k) => M.widgets[k]).filter(Boolean)];
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
    // the plan always comes first, the departures after it
    if (!list.length) list.push('light');
    if (M.dep) list.push('departures');
    if (M.dep?.map) list.push('departures_map');
  }
  const out = [], used = new Set();
  list.forEach((l, i) => {
    let L;
    const type = builtinType(l);
    if (type) {
      L = { id: type, type, name: l.name || null, icon: l.icon || LAYER_TYPES[type].icon, kinds: new Set(LAYER_TYPES[type].kinds), ents: new Set(layerExtras(l, M.ents)) };
    } else if (l && typeof l === 'object') {
      L = {
        id: String(l.id || `layer_${slug(l.name) || i + 1}`), type: 'custom', name: l.name || null, icon: l.icon || 'layers',
        kinds: new Set([].concat(l.show || []).filter((k) => SHOW_KINDS.includes(k))), ents: new Set([].concat(l.entities || [])),
      };
    }
    if (!L || used.has(L.id) || (L.type === 'vacuum' && !M.vac) || (L.type === 'departures' && !M.dep) || (L.type === 'departures_map' && !M.dep?.map)) return;
    used.add(L.id);
    out.push(L);
  });
  if (!out.length) out.push({ id: 'light', type: 'light', name: null, icon: 'bulb', kinds: new Set(LAYER_TYPES.light.kinds), ents: new Set() });
  return out;
}
const inLayer = (L, e) => !!L && (L.kinds.has(e.kind) || L.ents.has(e.entity));

/* ---------------------------------------------------------------- Window and door contacts
 * A contact shows on the window or front door nearest to it on the walls of its room (a door contact prefers the front door,
 * a window contact a window) – in every layer, instead of a button. opening: true puts any device on the nearest one of the
 * whole plan, opening: false keeps it a button.
 * M.openings: [{ s, i (index in windows, -1 = front door), door, room + side (of the first room), rooms, sens }] */
function assignOpenings(M, hass) {
  const D = M.D;
  const ops = M.windows.map((s, i) => ({ s, i, door: false })).concat(M.entrance ? [{ s: M.entrance, i: -1, door: true }] : []);
  for (const o of ops) {
    const w = wallOf(M, o.s);
    o.room = w?.room.id || null; o.side = w?.side || null; o.sens = [];
    // a window in a wall between two rooms belongs to both
    o.rooms = M.rooms.filter((r) => wallOf({ D, rooms: [r] }, o.s)).map((r) => r.id);
  }
  M.openings = ops;
  for (const e of M.ents) {
    e.win = null;
    if (e.opening === false || e.kind === 'light' || e.kind === 'media') continue;
    const st = hass?.states?.[e.entity];
    if (e.opening !== true && !openingSensor(e.entity, st)) continue;
    const p = e.at || (M.byRoom[e.room] && center(M.byRoom[e.room].r));
    if (!p) continue;
    // a door contact, a door opener or a lock: the front door first
    const dc = st?.attributes?.device_class, door = dc === 'door' || dc === 'garage_door' || ['button', 'input_button', 'lock'].includes(domainOf(e.entity));
    let best = null, bd = Infinity;
    for (const o of ops) {
      if (e.opening !== true && !o.rooms.includes(e.room)) continue;
      const d = segDist(o.s, p) + (door !== o.door && dc !== 'opening' ? 200 * D : 0);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) { best.sens.push(e.entity); e.win = best; }
  }
}

/* where a contact on this window / front door is placed: a little inside the room, in the middle of it */
function openingSpot(o, d = 15) {
  const [x, y] = center(o.s), v = { t: [0, 1], b: [0, -1], l: [1, 0], r: [-1, 0] }[o.side] || [0, 0];
  return [Math.round(x + v[0] * d), Math.round(y + v[1] * d)];
}

/* ---------------------------------------------------------------- Free-space layout for the info tiles
 * Tiles (weather, indoor, front door), the layer card and the layer bar go into empty corners of the plan –
 * like the hand-made original. A coarse grid marks the rooms; every widget takes the best free spot,
 * grows into the space around it and snaps its edges to the walls. What does not fit goes next to the plan. */
function placeWidgets(M, mobile) {
  const B = M.bbox, D = M.D, cfgW = (mobile ? M.cfg.mobile?.widgets : M.cfg.widgets) || {};
  const opt = (k) => widgetOpt(cfgW, k), oc = opt('card'), ob = opt('bar');
  // the layer card and the layer bar of this view: on a phone they sit below the plan / at the bottom of the screen
  // unless they are put into the plan; the bar stands upright on a laptop and lies on a phone unless told otherwise
  M.wopt = { size: CARD_SIZES.includes(oc.size) ? oc.size : 'normal', barH: mobile ? ob.direction !== 'vertical' : ob.direction === 'horizontal' };
  const out = { card: null, weather: null, indoor: null, door: null, bar: null, side: null };
  const tiles = ['weather', 'indoor', 'door'].filter((k) => (k === 'weather' ? M.weather : k === 'indoor' ? M.indoor.length : M.door) && !opt(k).off)
    .concat(M.tiles.map((x) => x.id));
  const size = Object.fromEntries(M.tiles.map((x) => [x.id, x.size]));
  const tw = (k) => size[k]?.[0] || 1;
  const needBar = M.layers.length > 1 && (!mobile || !!ob.rect || ob.place === 'plan');
  const needCard = !mobile || !!oc.rect || oc.place === 'plan';
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
  const mark = ({ i, j, w, h }, v = 1) => { for (let y = j; y < j + h; y++) for (let x = i; x < i + w; x++) occ[y * nx + x] = v; sums(); };
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

  // sizes in design units (+ the wall gap of 13), converted to plan units
  const du = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, (v + 13) * D]));
  // phones draw the tiles with fixed pixel fonts: they need more room in design units
  const TILE = du(mobile ? { w: 290, h: 225, minW: 240, minH: 186, maxW: 380, maxH: 280 }
    : { w: 209, h: 118, minW: 158, minH: 92, maxW: 300, maxH: 150 });
  // the layer card in its three sizes (a phone draws it in fixed pixels: more design units)
  const CARD = du({
    normal: mobile ? { w: 760, h: 370, minW: 640, minH: 350, maxW: 900 } : { w: 446, h: 190, minW: 318, minH: 176, maxW: 560 },
    small: mobile ? { w: 520, h: 215, minW: 440, minH: 205, maxW: 640 } : { w: 360, h: 132, minW: 305, minH: 126, maxW: 440 },
    mini: mobile ? { w: 460, h: 155, minW: 400, minH: 145, maxW: 560 } : { w: 300, h: 92, minW: 270, minH: 88, maxW: 380 },
  }[M.wopt.size]);
  // the bar's buttons have a minimum size in pixels: on a phone that is more design units
  const nL = Math.max(1, M.layers.length), bu = mobile ? 86 : 64, bt = mobile ? 100 : 76;
  const BAR = du(M.wopt.barH ? { w: nL * bu + 12, h: bt } : { w: bt, h: nL * bu + 12 });

  for (const k of ['card', 'weather', 'indoor', 'door', ...M.tiles.map((x) => x.id)]) if (opt(k).rect) out[k] = opt(k).rect;
  if (ob.rect && M.layers.length > 1) out.bar = ob.rect;
  // what was placed by hand is taken: the automatic ones go around it
  for (const R of Object.values(out)) {
    if (!R) continue;
    const i1 = clamp(Math.floor((R[0] - B[0]) / cw), 0, nx), i2 = clamp(Math.ceil((R[2] - B[0]) / cw), 0, nx);
    const j1 = clamp(Math.floor((R[1] - B[1]) / ch), 0, ny), j2 = clamp(Math.ceil((R[3] - B[1]) / ch), 0, ny);
    if (i2 > i1 && j2 > j1) mark({ i: i1, j: j1, w: i2 - i1, h: j2 - j1 });
  }

  // layer card: prefers the bottom right
  let cardC = null;
  if (needCard && !out.card) {
    const c = find(CARD.minW, CARD.minH, (i, j, w, h) => (j + h / 2) / ny * 2 + (i + w / 2) / nx + (j + h === ny ? 2 : 0) + (i + w === nx ? 1 : 0));
    // wider fills the corner, taller would only add empty space inside the card
    if (c) { grow(c, CARD.maxW, CARD.h); out.card = snap(toRect(c)); mark(c); cardC = c; }
  }
  // info tiles: all together as a column (or a row); what does not fit together goes in smaller groups, then alone
  const colScore = mobile ? (i, j, w, h) => -(i + w / 2) / nx + (j + h / 2) / ny : (i, j, w, h) => (i + w / 2) / nx * 2 - (j / ny) * 0.5 + (i + w === nx ? 2 : 0) + (j === 0 ? 1 : 0);
  const weight = (k) => (k === 'door' && !mobile ? 1.18 : size[k]?.[1] || 1);
  const placeGroup = (group) => {
    const n = group.length, ws = group.map(weight), sum = ws.reduce((a, b) => a + b, 0), wide = Math.max(...group.map(tw));
    let c = find(wide * TILE.minW, sum * TILE.minH, colScore), dir = 'col';
    if (!c && n > 1) { c = find(n * TILE.minW, Math.max(...ws) * TILE.minH, colScore); dir = 'row'; }
    if (!c) return false;
    grow(c, dir === 'col' ? wide * TILE.maxW : n * TILE.maxW, dir === 'col' ? sum * TILE.maxH : Math.max(...ws) * TILE.maxH);
    const R = snap(toRect(c));
    mark(c);
    let pos = dir === 'col' ? R[1] : R[0];
    group.forEach((k, idx) => {
      const len = ((dir === 'col' ? R[3] - R[1] : R[2] - R[0]) * (dir === 'col' ? ws[idx] : 1)) / (dir === 'col' ? sum : n);
      out[k] = dir === 'col' ? [R[0], pos, R[2], pos + len] : [pos, R[1], pos + len, R[3]];
      pos += len;
    });
    return true;
  };
  const placeAll = (list) => {
    let rest = list.filter((k) => !out[k]);
    while (rest.length) {
      let done = 0;
      // a wide tile goes alone (a column of different widths would leave gaps)
      for (let n = rest.length; n >= 1 && !done; n--) if ((n === 1 || rest.slice(0, n).every((k) => tw(k) === 1)) && placeGroup(rest.slice(0, n))) done = n;
      // what does not fit goes next to the plan – the tiles after it may still find a corner
      rest = rest.slice(done || 1);
    }
  };
  const own = M.tiles.map((x) => x.id);
  placeAll(tiles.filter((k) => !own.includes(k)));
  placeAll(own);
  // own tiles without a corner: the layer card gives up its extra width (keeping the edge at the plan's side) –
  // better than a column next to the plan
  const minW = cells(CARD.minW, cw);
  if (cardC && cardC.w > minW && own.some((k) => !out[k])) {
    const before = { occ: occ.slice(), out: { ...out } }, edgeL = cardC.i === 0;
    for (const keepLeft of edgeL ? [true, false] : [false, true]) {
      mark(cardC, 0);
      const c = { ...cardC, w: minW, i: keepLeft ? cardC.i : cardC.i + cardC.w - minW };
      mark(c);
      placeAll(own);
      if (own.filter((k) => out[k]).length > own.filter((k) => before.out[k]).length) {
        mark(c, 0); grow(c, CARD.maxW, CARD.h); out.card = snap(toRect(c)); mark(c);
        // the tiles beside the card take its top and bottom edge
        const R = out.card, near = own.filter((k) => out[k] && !before.out[k] && Math.min(Math.abs(out[k][0] - R[2]), Math.abs(out[k][2] - R[0])) < 2 * cw);
        const T = bboxOf(near.map((k) => out[k]));
        if (T && T[1] < R[3] && T[3] > R[1]) {
          const y = (v) => R[1] + ((v - T[1]) / (T[3] - T[1])) * (R[3] - R[1]);
          for (const k of near) out[k] = [out[k][0], y(out[k][1]), out[k][2], y(out[k][3])];
        }
        break;
      }
      occ.set(before.occ); sums();
      for (const k of Object.keys(out)) out[k] = before.out[k] ?? null;
    }
  }
  // layer bar: upright in a free strip on the left, lying in one at the bottom
  if (needBar && !out.bar && !M.wopt.barH) {
    const c = find(BAR.w, BAR.h, (i, j, w, h) => -(i + w / 2) / nx * 3 + (i === 0 ? 2 : 0) - Math.abs((j + h / 2) / ny - 0.36));
    if (c) {
      // centred in its free strip, a little above the middle
      let j1 = c.j, j2 = c.j + c.h;
      while (j1 > 0 && free(c.i, j1 - 1, c.w, 1)) j1--;
      while (j2 < ny && free(c.i, j2, c.w, 1)) j2++;
      const R = toRect({ i: c.i, j: j1, w: c.w, h: j2 - j1 }), cy = R[1] + (R[3] - R[1]) * 0.45;
      const y1 = clamp(cy - BAR.h / 2, R[1], R[3] - BAR.h), x1 = (R[0] + R[2] - BAR.w) / 2;
      out.bar = [x1, y1, x1 + BAR.w, y1 + BAR.h];
    }
  } else if (needBar && !out.bar) {
    const c = find(BAR.w, BAR.h, (i, j, w, h) => (j + h / 2) / ny * 3 - Math.abs((i + w / 2) / nx - 0.4) + (j + h === ny ? 2 : 0));
    if (c) {
      // centred in its free strip
      let i1 = c.i, i2 = c.i + c.w;
      while (i1 > 0 && free(i1 - 1, c.j, 1, c.h)) i1--;
      while (i2 < nx && free(i2, c.j, 1, c.h)) i2++;
      const R = toRect({ i: i1, j: c.j, w: i2 - i1, h: c.h }), x1 = (R[0] + R[2] - BAR.w) / 2, y1 = (R[1] + R[3] - BAR.h) / 2;
      out.bar = [x1, y1, x1 + BAR.w, y1 + BAR.h];
    }
  }

  // what did not fit goes into a column next to the plan (desktop) or a row under it (phone), drawn at a readable size;
  // the layer bar next to the plan (desktop) or back at the bottom of the screen (phone)
  const left = tiles.filter((k) => !out[k]);
  if (left.length || (!mobile && !out.card)) out.side = { tiles: left, card: !mobile && !out.card };
  if (needBar && !out.bar && !mobile) {
    if (M.wopt.barH) { const cx = (B[0] + B[2]) / 2; out.bar = [cx - BAR.w / 2, B[3], cx + BAR.w / 2, B[3] + BAR.h]; }
    else { const cy = B[1] + (B[3] - B[1]) * 0.36; out.bar = [B[0] - BAR.w, cy - BAR.h / 2, B[0], cy + BAR.h / 2]; }
  }
  return out;
}

/* The largest rectangle inside B that none of the blocks covers (its edges lie on the edges of B and the blocks) –
 * too little left: B itself (the departures view beside the layer bar) */
function freeOf(B, blocks) {
  const bs = blocks.filter((b) => b && b[2] > B[0] && b[0] < B[2] && b[3] > B[1] && b[1] < B[3]);
  const xs = [...new Set([B[0], B[2], ...bs.flatMap((b) => [b[0], b[2]]).filter((x) => x > B[0] && x < B[2])])].sort((a, b) => a - b);
  const ys = [...new Set([B[1], B[3], ...bs.flatMap((b) => [b[1], b[3]]).filter((y) => y > B[1] && y < B[3])])].sort((a, b) => a - b);
  let best = null;
  for (let a = 0; a < xs.length; a++) for (let c = a + 1; c < xs.length; c++) for (let b = 0; b < ys.length; b++) for (let d = b + 1; d < ys.length; d++) {
    const R = [xs[a], ys[b], xs[c], ys[d]];
    if ((!best || rectArea(R) > rectArea(best)) && !bs.some((q) => q[0] < R[2] && q[2] > R[0] && q[1] < R[3] && q[3] > R[1])) best = R;
  }
  return best && rectArea(best) > rectArea(B) * 0.3 ? best : [...B];
}

/* ---------------------------------------------------------------- Departures (configuration)
 * departures: { stops: [{ id | entity, name, lines, exclude, at }], api, per, map }
 * A stop by its id is fetched from the public VBB / BVG interface (transport.rest), a stop by its entity is read from a
 * sensor of the integration "Berlin (BVG) and Brandenburg (VBB) transport" (attribute `departures`).
 * map: true | { radius, overpass, attribution } adds the live map (the stops with an id; `at: [lat, lon]` instead of the stop's
 * own position; radius = metres of street around the stops that are always in view; attribution: another source than OpenStreetMap). */
function normDepartures(d) {
  const stops = (Array.isArray(d?.stops) ? d.stops : []).filter((s) => s && (s.id || s.entity)).map((s, i) => ({
    i, id: s.id ? String(s.id) : null, entity: s.entity || null, name: s.name || null,
    lines: [].concat(s.lines || []).map(String), exclude: [].concat(s.exclude || []).map(String), at: normPt(s.at),
  }));
  if (!stops.length) return null;
  const m = d.map === true ? {} : d.map && typeof d.map === 'object' ? d.map : null;
  const map = m && stops.some((s) => s.id) ? {
    radius: clamp(+m.radius || 300, 120, 1500), overpass: String(m.overpass || 'https://overpass-api.de/api/interpreter'),
    attribution: m.attribution ? String(m.attribution) : null,
    // the middle of the view: Home Assistant's home, a point [lat, lon], else between the stops
    center: m.center === 'home' ? 'home' : normPt(m.center),
  } : null;
  return { stops, api: String(d.api || 'https://v6.vbb.transport.rest').replace(/\/$/, ''), per: clamp(Math.round(+d.per || 3), 1, 5), map };
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
