/* ================================================================== Departures: the next trains and buses at stops nearby
 * A view of its own: the plan, the tiles and the layer card make way, only the layer bar stays. Each stop is a glass
 * card – every line once with its badge, each direction on one line with the next departure large on the right, the
 * ones after it in a quiet second line.
 * Stops by id are fetched by the card itself (public VBB / BVG interface, every 30 s while the view is shown), stops by
 * entity come from Home Assistant (integration "Berlin (BVG) and Brandenburg (VBB) transport"). */
const DEP_ORDER = ['subway', 'suburban', 'tram', 'regional', 'express', 'bus', 'ferry'];
/* colours of a kind of line when the line has none of its own (as the integration uses them) */
const DEP_COLORS = { subway: '#2864A6', suburban: '#008D4F', tram: '#D82020', bus: '#A5027D', ferry: '#0080BA', express: '#4D4D4D', regional: '#F01414' };
/* late: from two minutes on (a minute is everyday noise) */
const DEP_LATE = 120;
/* WCAG luminance – a light line colour with white letters gets a darker shade */
const relLum = (rgb) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
const hexRgb = (h) => {
  let s = String(h || '').replace('#', '');
  if (s.length === 3) s = s.replace(/./g, '$&$&');
  const n = parseInt(s, 16);
  return s.length === 6 && Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [120, 120, 132];
};
/* the destination, short: "U Britz-Süd via S Südkreuz" → "Britz-Süd", "S+U Zoologischer Garten" → "Zoologischer Garten",
 * "U Berliner Str. -> N43 Richtung …" → "Berliner Str." */
const depDir = (d) => String(d || '').replace(/\s*->.*$/, '').replace(/\s+via\s.*$/, '').replace(/\s*\((Berlin|Bln)\)/g, '').replace(/^(S\+U|U|S)\s+/, '').trim();
/* a departure as the interface sends it / as the integration's sensor has it */
const depFromApi = (x) => {
  const l = x.line || {}, w = x.when || x.plannedWhen;
  const p = x.currentTripPosition, ll = (o) => (o && Number.isFinite(o.latitude) ? [o.latitude, o.longitude] : null);
  return { line: l.name || '?', product: l.product || '', bg: l.color?.bg || null, fg: l.color?.fg || null, dir: depDir(x.direction), t: w ? Date.parse(w) : NaN, delay: x.delay ?? null, cancelled: !!x.cancelled,
    // for the live map: the trip, where its vehicle is now, where it ends and where exactly it leaves (a station has several stops)
    trip: x.tripId || null, pos: ll(p), to: ll(x.destination?.location), at: ll(x.stop?.location) };
};
const depFromSensor = (x) => ({
  line: x.line_name || '?', product: x.line_type || '', bg: x.color || null, fg: x.text_color || null, dir: depDir(x.direction),
  t: Date.parse(x.timestamp || ''), delay: x.delay ?? null, cancelled: !!x.cancelled,
});

const STYLES_D = `
/* the departures are a view of their own: the plan, every tile and the layer card make way – the layer bar stays above */
.root[data-type="departures"]:not(.bare) .stage > :not(.tabs):not(.tip), .root[data-type="departures"]:not(.bare) .side,
.root[data-type="departures"]:not(.bare) .mside, .root[data-type="departures"]:not(.bare) .lay > .gcard,
.root[data-type="departures"]:not(.bare) .empty-plan { opacity: 0 !important; pointer-events: none !important; }
.root[data-type="departures"]:not(.bare) .lay { z-index: 3; pointer-events: none; }
.root[data-type="departures"]:not(.bare) .lay .tabs { pointer-events: auto; }
/* its own calm light: the warm glows of the rooms and the plan's dot grid recede */
.root[data-type="departures"] .bg .g1, .root[data-type="departures"] .bg .g2 { opacity: calc(var(--warm) * .22); }
.root[data-type="departures"] .bg .g3, .root[data-type="departures"] .bg .g6 { opacity: 1; }
.root[data-type="departures"] .bg .dots { opacity: .4; }
/* a cool pool of light behind the board – the glass needs something to frost */
.bg .g6 { background: radial-gradient(55% 60% at 60% 36%, rgba(70, 88, 160, .2), rgba(70, 88, 160, 0) 70%), radial-gradient(40% 45% at 86% 86%, rgba(120, 70, 150, .11), rgba(120, 70, 150, 0) 70%); opacity: 0; }
.bg .dots { transition: opacity 1.2s ease; }
.root .room { transition: box-shadow .6s ease, background .5s ease, transform var(--sp-ms) var(--sp), opacity .4s ease; }
.root .pas, .root .win.fd { transition: opacity .4s ease, background .4s, box-shadow .4s; }

.dview { position: absolute; z-index: 2; display: grid; overflow: auto; scrollbar-width: none; opacity: 0; visibility: hidden;
  transition: opacity .3s ease, visibility 0s linear .3s; }
.dview::-webkit-scrollbar { display: none; }
.root.bare .dview { display: none; }
.root[data-type="departures"]:not(.bare) .dview { opacity: 1; visibility: visible; transition: opacity .45s ease .08s; }
.dview.ovf { -webkit-mask-image: linear-gradient(#000 calc(100% - 44px), transparent); mask-image: linear-gradient(#000 calc(100% - 44px), transparent); }
.dview .dp-in { width: 100%; max-width: calc(var(--dpn, 2) * 540 * var(--dz) + (var(--dpn, 2) - 1) * 20 * var(--dz)); margin: var(--dtop, 0px) auto auto;
  display: flex; flex-direction: column; gap: calc(20 * var(--dz)); }
.root[data-type="departures"] .dview .dp-in { animation: dpin .6s cubic-bezier(.2, .8, .2, 1) both; }
@keyframes dpin { from { opacity: 0; transform: translateY(14px) scale(.985); } to { opacity: 1; transform: none; } }
.dview .dp-head { display: flex; align-items: center; gap: calc(14 * var(--dz)); padding: 0 calc(6 * var(--dz)); }
.dview .dp-head h2 { margin: 0; font-size: calc(14 * var(--dz)); font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--t2); }
.dview .dp-live { display: flex; align-items: center; gap: 7px; font-size: calc(14 * var(--dz)); font-weight: 500; color: var(--t3); white-space: nowrap; font-variant-numeric: tabular-nums; }
.dview .dp-live i { width: 7px; height: 7px; border-radius: 50%; background: rgb(var(--green)); animation: dplive 3s ease-in-out infinite; }
.dview .dp-live.off i { background: rgb(var(--orange)); animation: none; }
@keyframes dplive { 50% { opacity: .4; } }
.dview .dp-stops { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, calc(340 * var(--dz))), 1fr)); align-items: start; gap: calc(20 * var(--dz)); }
.dview .dp-card { min-width: 0; border-radius: calc(26 * var(--dz)); padding: calc(18 * var(--dz)) calc(24 * var(--dz)) calc(10 * var(--dz));
  background: linear-gradient(160deg, rgba(46, 46, 54, .58), rgba(22, 23, 28, .64));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), inset 0 1px 0 rgba(255, 255, 255, .11), 0 18px 44px rgba(0, 0, 0, .34);
  -webkit-backdrop-filter: blur(30px) saturate(160%); backdrop-filter: blur(30px) saturate(160%); }
/* the stop's name is a quiet label, like the tiles' ("Außen", "Innen") – the minutes are what counts */
.dview .dp-card > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: calc(4 * var(--dz));
  font-size: calc(15.5 * var(--dz)); font-weight: 500; color: var(--t2); }
.dview .dp-card > header b { min-width: 0; font-weight: inherit; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dview .dp-card > header span { flex: none; display: flex; gap: calc(6 * var(--dz)); font-size: calc(19 * var(--dz)); }
.dview .dp-card > header .ic { stroke-width: 1.8; }
.dview .dp-grid { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; column-gap: calc(14 * var(--dz)); }
.dview .dp-grid hr { grid-column: 1 / -1; height: 1px; margin: calc(9 * var(--dz)) 0; border: 0; background: rgba(255, 255, 255, .08); }
.dview .dp-badge { grid-column: 1; align-self: baseline; display: inline-grid; place-items: center; box-sizing: border-box;
  min-width: calc(50 * var(--dz)); height: calc(28 * var(--dz)); padding: 0 calc(7 * var(--dz)); border-radius: calc(8 * var(--dz));
  background: var(--lb); color: var(--lf); font-size: calc(15 * var(--dz)); font-weight: 700; letter-spacing: -.01em;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .14), inset 0 1px 0 rgba(255, 255, 255, .16); }
.dview .dp-dir { grid-column: 2; align-self: baseline; min-width: 0; display: flex; flex-direction: column; gap: calc(3 * var(--dz)); padding: calc(9 * var(--dz)) 0 calc(8 * var(--dz)); }
.dview .dp-to, .dview .dp-sub { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dview .dp-to { font-size: calc(19 * var(--dz)); font-weight: 600; letter-spacing: -.012em; }
.dview .dp-sub { font-size: calc(14 * var(--dz)); font-weight: 500; color: var(--t2); font-variant-numeric: tabular-nums; }
.dview .dp-sub s { color: rgb(var(--red)); text-decoration-thickness: 1.5px; }
/* the minutes with their unit set small on the same baseline – like the tiles' "486 W" */
.dview .dp-num { grid-column: 3; align-self: baseline; justify-self: end; font-size: calc(36 * var(--dz)); font-weight: 700; letter-spacing: -.035em; line-height: 1;
  font-variant-numeric: tabular-nums; white-space: nowrap; }
.dview .dp-num small { margin-left: calc(5 * var(--dz)); font-size: calc(13.5 * var(--dz)); font-weight: 600; letter-spacing: 0; color: var(--t2); }
.dview .dp-num.word { font-size: calc(21 * var(--dz)); letter-spacing: -.02em; }
.dview .dp-num.dp-x { color: rgb(var(--red)); }
.dview .dp-late { color: rgb(var(--orange)); }
.dview .dp-msg { grid-column: 1 / -1; margin: 0; padding: calc(10 * var(--dz)) 0 calc(12 * var(--dz)); font-size: calc(16 * var(--dz)); color: var(--t3); }
`;

Object.assign(GlassFloorplanCard.prototype, {
  _depKey(s) { return `${this._M.dep.api}|${s.id}`; },
  /* the departures of a stop, now: fetched or from its sensor, with the stop's line filters */
  _depList(s) {
    let list;
    if (s.entity) list = (this._hass?.states?.[s.entity]?.attributes?.departures || []).map(depFromSensor);
    else {
      const c = this._depC?.[this._depKey(s)];
      // a list older than ten minutes is no use any more
      list = c?.list && Date.now() - c.at < 600e3 ? c.list : [];
    }
    const now = Date.now() - 20e3;
    return list.filter((d) => Number.isFinite(d.t) && d.t >= now && (!s.lines.length || s.lines.includes(d.line)) && !s.exclude.includes(d.line));
  },
  /* has a stop answered, did its last try fail, when were its data new, are they still fresh */
  _depState(s) {
    if (s.entity) {
      // Home Assistant keeps last_updated while the departures stay the same: still fresh while some lie ahead
      const st = this._hass?.states?.[s.entity], bad = !st || unavailable(st), at = st ? Date.parse(st.last_updated) : null;
      const ahead = (st?.attributes?.departures || []).some((x) => Date.parse(x.timestamp || '') > Date.now());
      return { ok: !bad, err: bad, at, fresh: !bad && (Date.now() - at < 240e3 || ahead) };
    }
    const c = this._depC?.[this._depKey(s)], ok = !!c?.list && Date.now() - c.at < 600e3;
    return { ok, err: !!c?.err, at: c?.at || null, fresh: ok && !c.err && Date.now() - c.at < 100e3 };
  },
  _depMin(ms) { return Math.floor((ms - Date.now()) / 60000); },
  /* "4", "jetzt", "05:28" (an hour or more ahead) */
  _depTime(ms) {
    const m = this._depMin(ms);
    if (m < 1) return { v: t('depNow'), word: true };
    if (m >= 60) return { v: new Date(ms).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }), word: true };
    return { v: String(m), word: false };
  },
  _depBadge(d, rows = 1) {
    let bg = hexRgb(d.bg || DEP_COLORS[d.product] || '#6e6e78');
    const fg = hexRgb(d.fg || '#fff'), lb = relLum(bg), lf = relLum(fg);
    if ((Math.max(lb, lf) + 0.05) / (Math.min(lb, lf) + 0.05) < 3 && lf > lb) bg = bg.map((v) => Math.round(v * 0.72));
    return `<span class="dp-badge" style="--lb:rgb(${bg.join(',')});--lf:rgb(${fg.join(',')})${rows > 1 ? `;grid-row:span ${rows}` : ''}">${esc(d.line)}</span>`;
  },

  /* fetch the stops given by id: each at most every 25 s, a new one at once; a hidden browser tab waits */
  _depFetch() {
    const D = this._M?.dep;
    if (!D || document.hidden) return;
    this._depC = this._depC || {};
    for (const s of D.stops.filter((x) => x.id)) {
      const key = this._depKey(s), c = this._depC[key] || (this._depC[key] = {});
      if (c.busy || Date.now() - (c.tried || 0) < 25e3) continue;
      c.busy = true;
      c.tried = Date.now();
      const url = `${D.api}/stops/${encodeURIComponent(s.id)}/departures?duration=90&results=60&remarks=false&linesOfStops=false`;
      // a request that hangs (a phone between networks) is given up – otherwise the stop would never be asked again
      const ab = new AbortController(), to = setTimeout(() => ab.abort(), 15e3);
      fetch(url, { signal: ab.signal }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((j) => {
        Object.assign(c, { at: Date.now(), list: (Array.isArray(j) ? j : j.departures || []).map(depFromApi), err: false });
      }).catch(() => { c.err = true; }).finally(() => { clearTimeout(to); c.busy = false; this._depShow(); });
    }
  },
  /* while the view is shown: fetch now, every 30 s and when the browser tab comes back */
  _depSync() {
    const on = !!this._M?.dep && this.isConnected && VIEW_TYPES.includes(this._layer()?.type);
    if (!this._depVis) {
      this._depVis = () => { if (!document.hidden && VIEW_TYPES.includes(this._layer()?.type)) { this._depFetch(); this._depShow(); } };
      document.addEventListener('visibilitychange', this._depVis);
    }
    if (!on) { clearInterval(this._depI); this._depI = null; return; }
    if (!this._depI) this._depI = setInterval(() => this._depFetch(), 30e3);
    this._depFetch();
  },
  _depStop() {
    clearInterval(this._depI);
    this._depI = null;
    if (this._depVis) document.removeEventListener('visibilitychange', this._depVis);
    this._depVis = null;
  },
  _depShow() {
    const type = this._layer()?.type;
    if (this._dview && type === 'departures') this._depView();
    // the map follows the changes of the home's devices at most every two seconds – a call in between comes a little later
    if (type === 'departures_map') {
      const wait = 2e3 - (Date.now() - (this._tmShown || 0));
      if (wait <= 0) this._tmShow();
      else if (!this._tmLater) this._tmLater = setTimeout(() => { this._tmLater = null; if (this._layer()?.type === 'departures_map') this._tmShow(); }, wait);
    }
  },
  /* what the view hides cannot be reached with the keyboard either */
  _depInert(on) {
    const sr = this.shadowRoot;
    for (const el of sr.querySelectorAll('.stage > :not(.tabs):not(.tip), .side, .mside, .lay > .gcard, .empty-plan')) el.inert = on;
  },

  /* where the view goes: the whole card except the layer bar – beside it on a laptop (its heading level with the bar's
   * top, the bar's margin mirrored on the other side, so bar and board sit where bar and plan were), above it on a
   * phone; the size grows with the room there */
  _depLayout() {
    const v = this._dview, lv = this._lv, M = this._M;
    if (!v || !lv) return;
    const W = this._ev ? this._ev.w : this._root.clientWidth, H = this._h || lv.H;
    let R = [0, 0, W, H], barTop = null, px = null;
    const tabs = this.$('.tabs');
    if (tabs && !tabs.hidden && tabs.offsetWidth) {
      if (tabs.classList.contains('dock')) R[3] = Math.max(160, H - tabs.offsetHeight - 24 - (this._safeB || 0));
      else if (M.widgets.bar) {
        const c = center(M.widgets.bar), x = lv.sx + (c[0] - lv.S.x) * lv.pu, y = lv.sy + (c[1] - lv.S.y) * lv.pu;
        const bw = tabs.offsetWidth / 2, bh = tabs.offsetHeight / 2, gap = 16;
        R = freeOf(R, [[x - bw - 14, y - bh - 14, x + bw + 14, y + bh + 14]]);
        // the heading level with the bar's top only when the board stands beside the bar
        if (!tabs.classList.contains('h') && R[1] <= y - bh && R[3] >= y + bh) {
          barTop = y - bh;
          // a bar near the edge: its margin mirrored on the other side (a bar further in leaves the board its room)
          if (R[0] >= x && x < W * 0.3) { R[0] = x + bw + gap; R[2] = Math.min(R[2], W - (x - bw)); px = 0; }
          else if (R[2] <= x && x > W * 0.7) { R[2] = x - bw - gap; R[0] = Math.max(R[0], W - (x + bw)); px = 0; }
        }
      }
    }
    const pad = this._m ? 12 : clamp(Math.round(W * 0.025), 16, 36), ph = px ?? pad, w = R[2] - R[0] - 2 * ph, h = R[3] - R[1] - 2 * pad;
    Object.assign(v.style, { left: `${R[0] + ph}px`, top: `${R[1] + pad}px`, width: `${Math.max(0, w)}px`, height: `${Math.max(0, h)}px` });
    const dz = this._m ? clamp(w / 380, 0.88, 1.05) : clamp(Math.min(w / 800, h / 620), 0.95, 1.25);
    v.style.setProperty('--dz', `${dz.toFixed(3)}px`);
    this._dtop = barTop == null ? 0 : Math.max(0, Math.round(barTop - R[1] - pad));
    v.style.setProperty('--dpn', Math.min(2, this._M.dep?.stops.length || 1));
    this._depFit();
  },
  /* the heading level with the bar – unless the board would not fit below it then: it moves up as far as it must */
  _depFit() {
    const v = this._dview;
    if (!v) return;
    v.style.setProperty('--dtop', `${this._dtop || 0}px`);
    const over = v.scrollHeight - v.clientHeight;
    if (this._dtop && over > 0) v.style.setProperty('--dtop', `${Math.max(0, this._dtop - over)}px`);
    this._depOvf();
  },
  _depOvf() {
    const v = this._dview;
    if (v) v.classList.toggle('ovf', v.scrollHeight > v.clientHeight + 4 && v.scrollTop + v.clientHeight < v.scrollHeight - 4);
  },

  /* one direction of a line: the next departure you can take large, the delay, a cancelled one and the ones after it below */
  _depRow(dir, ds) {
    const per = this._M.dep.per, unit = t('min');
    ds.sort((a, b) => a.t - b.t);
    const go = ds.filter((d) => !d.cancelled), hero = go[0] || null, f = hero ? this._depTime(hero.t) : null;
    const sub = [];
    if (hero && hero.delay >= DEP_LATE) sub.push(`<span class="dp-late">+${Math.round(hero.delay / 60)} ${esc(unit)}</span>`);
    const gone = ds.find((d) => d.cancelled && (!hero || d.t <= hero.t));
    if (gone) sub.push(`<s>${esc(this._depTime(gone.t).v)}</s> ${esc(t('depCancelled'))}`);
    const later = ds.filter((d) => d !== hero && d !== gone && this._depMin(d.t) < 60).slice(0, per - 1);
    if (later.length) sub.push(`${esc(t('depThen'))} ${later.map((d) => (d.cancelled ? `<s>${esc(this._depTime(d.t).v)}</s>` : esc(this._depTime(d.t).v))).join(', ')} ${esc(unit)}`);
    const cls = !hero ? 'dp-num word dp-x' : `dp-num${f.word ? ' word' : ''}${hero.delay >= DEP_LATE ? ' dp-late' : ''}`;
    return `<span class="dp-dir"><span class="dp-to">${esc(dir)}</span><span class="dp-sub">${sub.join(' · ') || '&nbsp;'}</span></span>`
      + `<b class="${cls}">${esc(hero ? f.v : t('depCancelled'))}${hero && !f.word ? `<small>${esc(unit)}</small>` : ''}</b>`;
  },

  /* the view: a heading with the state of the data, then one glass card per stop – each line once, its directions beside it */
  _depView() {
    const v = this._dview, D = this._M.dep;
    if (!v || !D) return;
    if (!v.firstElementChild) {
      // a new view (the card was built anew): everything is drawn again
      this._depHtml = null;
      v.innerHTML = `<div class="dp-in"><header class="dp-head"><h2></h2><span class="dp-live"><i></i><span></span></span></header><div class="dp-stops"></div></div>`;
      v.addEventListener('scroll', () => this._depOvf(), { passive: true });
    }
    const rank = (p) => (DEP_ORDER.indexOf(p) + 1 || 99);
    const states = D.stops.map((s) => this._depState(s));
    const cards = D.stops.map((s, si) => {
      const st = states[si], lines = new Map();
      for (const d of this._depList(s)) {
        if (!lines.has(d.line)) lines.set(d.line, { ...d, dirs: new Map() });
        const L = lines.get(d.line);
        if (!L.dirs.has(d.dir)) L.dirs.set(d.dir, []);
        L.dirs.get(d.dir).push(d);
      }
      const sorted = [...lines.values()].sort((a, b) => rank(a.product) - rank(b.product) || a.line.localeCompare(b.line, undefined, { numeric: true }));
      const rows = sorted.map((L, li) => {
        const dirs = [...L.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0], LOCALE));
        return `${li ? '<hr>' : ''}${this._depBadge(L, dirs.length)}${dirs.map(([dir, ds]) => this._depRow(dir, ds)).join('')}`;
      }).join('');
      const kinds = [...new Set(sorted.map((L) => (L.product === 'bus' ? 'bus' : 'train')))].sort().reverse();
      const name = s.name || (s.entity ? this._nameOf(s.entity) : s.id);
      const msg = t(st.err ? 'depOffline' : st.ok ? 'depNone' : 'depLoading');
      return `<section class="dp-card"><header><b>${esc(name)}</b><span>${kinds.map((k) => icon(k)).join('')}</span></header><div class="dp-grid">${rows || `<p class="dp-msg">${esc(msg)}</p>`}</div></section>`;
    }).join('');
    // only what changed is drawn again (the live dot keeps pulsing)
    if (cards !== this._depHtml) { this._depHtml = cards; v.querySelector('.dp-stops').innerHTML = cards; this._depFit(); }
    v.querySelector('.dp-head h2').textContent = this._layerName(this._layer());
    // live while every stop's data are fresh; else as of when, or offline
    const ats = states.filter((x) => x.ok && x.at).map((x) => x.at), err = states.some((x) => x.err), fresh = ats.length && states.every((x) => x.fresh);
    const live = v.querySelector('.dp-live');
    live.classList.toggle('off', !fresh);
    live.lastElementChild.textContent = fresh ? t('depLive') : err && !ats.length ? t('depOfflineShort') : ats.length
      ? t('depAsOf', new Date(Math.min(...ats)).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })) : t('depLoadingShort');
    this._depOvf();
  },

  /* the layer card is not shown with the departures */
  _depGap() { return mk('div', 'gv'); },
});

Object.assign(STR.en, {
  layer_departures: 'Departures', depNow: 'now', depCancelled: 'cancelled', depThen: 'then', depLive: 'Live', depAsOf: (x) => `As of ${x}`,
  depNone: 'No departures in the next hour and a half', depLoading: 'Loading departures …', depLoadingShort: 'Loading …',
  depOffline: 'Timetable not reachable', depOfflineShort: 'Offline',
});
Object.assign(STR.de, {
  layer_departures: 'Abfahrten', depNow: 'jetzt', depCancelled: 'fällt aus', depThen: 'dann', depLive: 'Live', depAsOf: (x) => `Stand ${x}`,
  depNone: 'Keine Abfahrten in den nächsten anderthalb Stunden', depLoading: 'Abfahrten werden geladen …', depLoadingShort: 'Lädt …',
  depOffline: 'Fahrplan nicht erreichbar', depOfflineShort: 'Offline',
});
