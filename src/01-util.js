/*! Glass Floorplan Card – a glassy, Apple-style floor plan for Home Assistant.
 * MIT License · https://github.com/michael-schroeter/glass-floorplan-card
 * Built from src/*.js by tools/build.py – edit the sources, not dist/. */
const VERSION = 'dev';
const CARD_TAG = 'glass-floorplan-card';

/* ================================================================== Helpers */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const isOn = (st) => !!st && st.state === 'on';
const unavailable = (st) => !st || st.state === 'unavailable' || st.state === 'unknown';
const num = (st) => { const v = parseFloat(st?.state); return Number.isFinite(v) ? v : null; };
const dimmable = (st) => (st?.attributes?.supported_color_modes || []).some((m) => m !== 'onoff');
const hasTemp = (st) => (st?.attributes?.supported_color_modes || []).includes('color_temp');
const hasColor = (st) => (st?.attributes?.supported_color_modes || []).some((m) => ['xy', 'hs', 'rgb', 'rgbw', 'rgbww'].includes(m));
const briPct = (st) => (isOn(st) ? (st.attributes.brightness != null ? Math.max(1, Math.round(st.attributes.brightness / 2.55)) : 100) : 0);
const domainOf = (eid) => String(eid || '').split('.')[0];
const isTime = (s) => typeof s === 'string' && /^\d{4}-\d\d-\d\dT/.test(s);
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const uid = () => Math.random().toString(36).slice(2, 8);

/* Display colour of a lamp: whites as gold → cool white, coloured light in its colour */
const WHITE_STOPS = [[2000, [245, 172, 64]], [2700, [246, 200, 89]], [3500, [248, 218, 140]], [4500, [246, 234, 196]], [6500, [218, 232, 255]]];
function whiteRgb(k) {
  let i = 0;
  while (i < WHITE_STOPS.length - 2 && k > WHITE_STOPS[i + 1][0]) i++;
  const [k1, c1] = WHITE_STOPS[i], [k2, c2] = WHITE_STOPS[i + 1];
  return lerp3(c1, c2, clamp((k - k1) / (k2 - k1), 0, 1)).map(Math.round);
}
function lightRgb(cfg, st) {
  const a = st?.attributes || {};
  if (cfg?.color) return cfg.color;
  if (a.color_mode && ['xy', 'hs', 'rgb', 'rgbw', 'rgbww'].includes(a.color_mode) && a.rgb_color) {
    // brighten colours a little so they glow on dark glass
    const [r, g, b] = a.rgb_color, m = Math.max(r, g, b, 1);
    return [r, g, b].map((v) => Math.round(clamp((v / m) * 255 * 0.92 + 20, 0, 255)));
  }
  if (a.color_temp_kelvin) return whiteRgb(a.color_temp_kelvin);
  return whiteRgb(cfg?.kelvin || 2700);
}
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const lighten = (c, t) => c.map((v) => Math.round(v + (255 - v) * t));

/* Room temperature → colour (cold blue · comfortable mint · warm amber · hot red) */
const TEMP_STOPS = [[15, [86, 150, 255]], [18.5, [96, 200, 250]], [21, [122, 222, 178]], [23.5, [255, 196, 92]], [27, [255, 104, 72]]];
function tempRgb(v) {
  if (v == null) return [150, 156, 170];
  let i = 0;
  while (i < TEMP_STOPS.length - 2 && v > TEMP_STOPS[i + 1][0]) i++;
  const [a, c1] = TEMP_STOPS[i], [b, c2] = TEMP_STOPS[i + 1];
  return lerp3(c1, c2, clamp((v - a) / (b - a), 0, 1)).map(Math.round);
}

/* Seeded random (same spot directions on every load) */
function seeded(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
/* Start angles of a spot's light cones: random, but never on top of each other */
function spotAngles(id, n = 3) {
  const r = seeded(`spot:${id}`), a = [r() * 360];
  for (let i = 1; i < n; i++) a.push(a[i - 1] + 360 / n - 15 + r() * 40);
  return a.map((v) => Math.round(v % 360));
}

/* Springs as CSS easing (linear()) */
function springEasing(stiffness, damping) {
  const w0 = Math.sqrt(stiffness), z = damping / (2 * Math.sqrt(stiffness));
  const wd = z < 1 ? w0 * Math.sqrt(1 - z * z) : 0;
  const f = (t) => (z < 1 ? 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t)) : 1 - (1 + w0 * t) * Math.exp(-w0 * t));
  const env = (t) => (z < 1 ? Math.exp(-z * w0 * t) / Math.sqrt(1 - z * z) : (1 + w0 * t) * Math.exp(-w0 * t));
  let dur = 0.1;
  while (dur < 2.5 && env(dur) > 0.002) dur += 0.02;
  const pts = Array.from({ length: 61 }, (_, i) => +f((i / 60) * dur).toFixed(4));
  pts[60] = 1;
  return { easing: `linear(${pts.join(',')})`, ms: Math.round(dur * 1000) };
}
const LINEAR_OK = typeof CSS !== 'undefined' && CSS.supports?.('transition-timing-function', 'linear(0, 1)');
const SPRINGS = {
  sp: springEasing(300, 26), soft: springEasing(140, 22), pop: springEasing(520, 24), snap: springEasing(420, 34),
  morph: springEasing(250, 24), close: springEasing(560, 47),
};
const ease = (name, fb) => (LINEAR_OK ? SPRINGS[name].easing : fb);
function springVars() {
  const v = (name, s, fb) => `--${name}:${LINEAR_OK ? s.easing : fb};--${name}-ms:${LINEAR_OK ? s.ms : 520}ms;`;
  return v('sp', SPRINGS.sp, 'cubic-bezier(.34,1.3,.64,1)') + v('soft', SPRINGS.soft, 'cubic-bezier(.22,1,.36,1)')
    + v('pop', SPRINGS.pop, 'cubic-bezier(.34,1.6,.64,1)') + v('snap', SPRINGS.snap, 'cubic-bezier(.2,.9,.3,1)');
}

/* Fires an event the way Home Assistant expects (bubbles out of shadow roots) */
function fire(node, type, detail) {
  node.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}
