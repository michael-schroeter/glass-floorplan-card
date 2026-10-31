/* ================================================================== Departures: the next trains and buses at stops nearby
 * A layer of its own: the plan dims, a glass board lies over it – per stop the lines in both directions with their next
 * departures, in the lines' own colours. The layer card shows the next departure you can still reach on foot and when
 * to leave. Stops by id are fetched by the card itself (public VBB / BVG interface, every 30 s while the layer is shown),
 * stops by entity come from Home Assistant (integration "Berlin (BVG) and Brandenburg (VBB) transport"). */
const DEP_ORDER = ['subway', 'suburban', 'tram', 'regional', 'express', 'bus', 'ferry'];
/* colours of a kind of line when the line has none of its own (as the integration uses them) */
const DEP_COLORS = { subway: '#2864A6', suburban: '#008D4F', tram: '#D82020', bus: '#A5027D', ferry: '#0080BA', express: '#4D4D4D', regional: '#F01414' };
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
  return { line: l.name || '?', product: l.product || '', bg: l.color?.bg || null, fg: l.color?.fg || null, dir: depDir(x.direction), t: w ? Date.parse(w) : NaN, delay: x.delay ?? null, cancelled: !!x.cancelled };
};
const depFromSensor = (x) => ({
  line: x.line_name || '?', product: x.line_type || '', bg: x.color || null, fg: x.text_color || null, dir: depDir(x.direction),
  t: Date.parse(x.timestamp || ''), delay: x.delay ?? null, cancelled: !!x.cancelled,
});

const STYLES_D = `
/* departures take the plan's place: rooms, light and devices fade away, a glass board shows the departures */
.root[data-type="departures"] .room, .root[data-type="departures"] .glows, .root[data-type="departures"] .win, .root[data-type="departures"] .pas,
.root[data-type="departures"] .lamp:not(.tk), .root[data-type="departures"] .dev:not(.tk), .root[data-type="departures"] .bot, .root[data-type="departures"] .dockm,
.root[data-type="departures"] .trail { opacity: 0 !important; pointer-events: none !important; }
.root .room { transition: box-shadow .6s ease, background .5s ease, transform var(--sp-ms) var(--sp), opacity .4s ease; }
.root .pas, .root .win.fd { transition: opacity .4s ease, background .4s, box-shadow .4s; }
.dboard { position: absolute; z-index: 6; display: flex; flex-direction: column; border-radius: calc(26 * var(--u)); overflow: hidden;
  background: linear-gradient(160deg, rgba(42, 44, 54, .66), rgba(18, 19, 24, .74));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), inset 0 1px 0 rgba(255, 255, 255, .08), 0 24px 60px rgba(0, 0, 0, .4);
  -webkit-backdrop-filter: blur(30px) saturate(150%); backdrop-filter: blur(30px) saturate(150%);
  opacity: 0; transform: scale(.985); pointer-events: none; transition: opacity .35s ease, transform var(--soft-ms) var(--soft); }
.root[data-type="departures"] .dboard { opacity: 1; transform: none; pointer-events: auto; }
.dbi { flex: 1; min-height: 0; overflow: auto; scrollbar-width: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, max(250px, calc(330 * var(--u)))), 1fr));
  align-content: start; gap: max(14px, calc(22 * var(--u))) max(18px, calc(34 * var(--u))); padding: max(14px, calc(24 * var(--u))) max(14px, calc(26 * var(--u))); }
.dbi::-webkit-scrollbar { display: none; }
.dst header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 0 2px max(6px, calc(10 * var(--u)));
  border-bottom: 1px solid rgba(255, 255, 255, .08); margin-bottom: max(4px, calc(6 * var(--u))); }
.dst header b { min-width: 0; font-size: max(15px, calc(21 * var(--u))); font-weight: 700; letter-spacing: -.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dst header span { flex: none; display: flex; align-items: center; gap: 4px; font-size: max(12px, calc(14 * var(--u))); font-weight: 500; color: var(--t2); }
.dst header .ic { font-size: 1.2em; stroke-width: 1.8; }
.drow { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: max(9px, calc(13 * var(--u)));
  padding: max(6px, calc(9 * var(--u))) 2px; border-bottom: 1px solid rgba(255, 255, 255, .05); }
.drow:last-child { border-bottom: 0; }
.dl { display: inline-grid; place-items: center; min-width: max(36px, calc(48 * var(--u))); height: max(22px, calc(29 * var(--u))); padding: 0 6px; box-sizing: border-box;
  border-radius: max(6px, calc(8 * var(--u))); background: var(--lb); color: var(--lf); font-size: max(12.5px, calc(15.5 * var(--u))); font-weight: 750; letter-spacing: -.01em;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .14), 0 2px 10px rgba(var(--lr), .3); }
.dd { min-width: 0; font-size: max(13.5px, calc(17 * var(--u))); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dt { display: flex; align-items: baseline; gap: 4px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.dt b { font-size: max(17px, calc(24 * var(--u))); font-weight: 700; letter-spacing: -.03em; }
.dt b + small { font-size: max(11px, calc(13 * var(--u))); font-weight: 600; color: var(--t2); margin-right: 4px; }
.dt i { font-style: normal; font-size: max(12.5px, calc(15 * var(--u))); font-weight: 500; color: var(--t2); }
.dt .late { color: rgb(var(--orange)); }
.dt .x { color: rgb(var(--red)); text-decoration: line-through; }
.dt .far { opacity: .38; }
.dt sup { font-size: .62em; font-weight: 650; color: rgb(var(--orange)); margin-left: 1px; }
.dmsg { padding: max(6px, calc(9 * var(--u))) 2px; font-size: max(12.5px, calc(15 * var(--u))); color: var(--t3); }
/* the layer card: the line's badge in front of the next departure */
.gt .dl { min-width: 0; height: 1.15em; padding: 0 .3em; margin-right: .35em; vertical-align: .08em; border-radius: .26em; font-size: .62em; box-shadow: none; }
.m .dbi { padding: 12px 14px; gap: 12px; }
`;

Object.assign(GlassFloorplanCard.prototype, {
  /* the departures of a stop, now: fetched or from its sensor, with the stop's line filters */
  _depList(s) {
    let list = [];
    if (s.entity) list = (this._hass?.states?.[s.entity]?.attributes?.departures || []).map(depFromSensor);
    else list = this._depC?.[`${this._M.dep.api}|${s.id}`]?.list || [];
    const now = Date.now() - 20e3;
    return list.filter((d) => Number.isFinite(d.t) && d.t >= now && (!s.lines.length || s.lines.includes(d.line)) && !s.exclude.includes(d.line));
  },
  /* has a stop answered at all (fetched once / sensor known), did it fail */
  _depState(s) {
    if (s.entity) { const st = this._hass?.states?.[s.entity]; return { ok: !!st && !unavailable(st), err: !st || unavailable(st) }; }
    const c = this._depC?.[`${this._M.dep.api}|${s.id}`];
    return { ok: !!c?.list, err: !!c?.err && !c?.list };
  },
  _depMin(ms) { return Math.floor((ms - Date.now()) / 60000); },
  /* "4", "jetzt", "05:28" (an hour or more ahead) */
  _depTime(ms) {
    const m = this._depMin(ms);
    if (m < 1) return { v: t('depNow'), unit: '' };
    if (m >= 60) return { v: new Date(ms).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }), unit: '' };
    return { v: String(m), unit: t('min') };
  },
  _depBadge(d) {
    const bg = d.bg || DEP_COLORS[d.product] || '#6e6e78', fg = d.fg || '#fff';
    return `<span class="dl" style="--lb:${esc(bg)};--lf:${esc(fg)};--lr:${hexRgb(bg).join(',')}">${esc(d.line)}</span>`;
  },

  /* fetch the stops given by id (not more often than every 25 s; a hidden browser tab waits) */
  _depFetch(force) {
    const D = this._M?.dep;
    if (!D || (!force && (document.hidden || Date.now() - (this._depT || 0) < 25e3))) return;
    this._depT = Date.now();
    this._depC = this._depC || {};
    for (const s of D.stops.filter((x) => x.id)) {
      const key = `${D.api}|${s.id}`, url = `${D.api}/stops/${encodeURIComponent(s.id)}/departures?duration=90&results=60&remarks=false&linesOfStops=false`;
      fetch(url).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((j) => {
        this._depC[key] = { at: Date.now(), list: (Array.isArray(j) ? j : j.departures || []).map(depFromApi) };
        this._depShow();
      }).catch(() => { this._depC[key] = { ...(this._depC[key] || {}), err: true }; this._depShow(); });
    }
  },
  /* while the layer is shown: fetch now and every 30 s */
  _depSync() {
    const on = !!this._M?.dep && this.isConnected && this._layer()?.type === 'departures';
    if (!on) { clearInterval(this._depI); this._depI = null; return; }
    if (!this._depI) this._depI = setInterval(() => this._depFetch(), 30e3);
    this._depFetch();
  },
  _depShow() { if (this._layer()?.type === 'departures') this._renderGap(); },

  /* the board: per stop its lines (by kind, then name) and directions with the next departures */
  _depBoard() {
    const el = this.shadowRoot.querySelector('.dbi'), D = this._M.dep;
    if (!el || !D) return;
    const per = D.per;
    el.innerHTML = D.stops.map((s) => {
      const st = this._depState(s), groups = new Map();
      for (const d of this._depList(s)) {
        const k = `${d.line}|${d.dir}`;
        if (!groups.has(k)) groups.set(k, { ...d, deps: [] });
        groups.get(k).deps.push(d);
      }
      const rank = (p) => (DEP_ORDER.indexOf(p) + 1 || 99);
      const rows = [...groups.values()].sort((a, b) => rank(a.product) - rank(b.product) || a.line.localeCompare(b.line, undefined, { numeric: true }) || a.dir.localeCompare(b.dir, LOCALE));
      const body = rows.length ? rows.map((g) => {
        const ds = g.deps.sort((a, b) => a.t - b.t).slice(0, per);
        const cls = (d) => [d.cancelled ? 'x' : d.delay >= 60 ? 'late' : '', this._depMin(d.t) < s.walk ? 'far' : ''].filter(Boolean).join(' ');
        const first = ds[0], f = this._depTime(first.t), late = first.delay >= 60 && !first.cancelled ? `<sup>+${Math.round(first.delay / 60)}</sup>` : '';
        const more = ds.slice(1).map((d) => `<span class="${cls(d)}">${esc(this._depTime(d.t).v)}</span>`).join(' · ');
        return `<div class="drow">${this._depBadge(g)}<span class="dd">${esc(g.dir)}</span><span class="dt"><b class="${cls(first)}">${esc(f.v)}${late}</b>${f.unit ? `<small class="${cls(first)}">${esc(f.unit)}</small>` : ''}${more ? `<i>${more}</i>` : ''}</span></div>`;
      }).join('') : `<div class="dmsg">${esc(t(st.err ? 'depOffline' : st.ok ? 'depNone' : 'depLoading'))}</div>`;
      const name = s.name || (s.entity ? this._nameOf(s.entity) : s.id);
      return `<section class="dst"><header><b>${esc(name)}</b>${s.walk ? `<span>${icon('walk')}${esc(t('depWalk', s.walk))}</span>` : ''}</header>${body}</section>`;
    }).join('');
  },

  /* the next departure you can still reach on foot (each stop with its walk), and the ones after it */
  _depNext() {
    const all = [];
    for (const s of this._M.dep.stops) for (const d of this._depList(s)) if (!d.cancelled && this._depMin(d.t) >= s.walk) all.push({ ...d, stop: s });
    return all.sort((a, b) => (a.t - a.stop.walk * 6e4) - (b.t - b.stop.walk * 6e4));
  },

  /* ---------------------------------------------------------------- layer card */
  _depGap(L, upd) {
    const v = mk('div', 'gv sub', `<div class="gk"><span>${esc(this._layerName(L))}</span><span class="bat"></span></div>
      <div class="gt"><b></b><span class="w"></span></div><div class="gs"></div><div class="segs"></div>`);
    upd.push(() => {
      this._depBoard();
      const next = this._depNext(), n = next[0], D = this._M.dep;
      const b = v.querySelector('.gt b'), w = v.querySelector('.gt .w'), gs = v.querySelector('.gs');
      const st = D.stops.map((s) => this._depState(s));
      if (n) {
        b.innerHTML = `${this._depBadge(n)}${esc(n.dir)}`;
        const tm = this._depTime(n.t);
        w.textContent = tm.unit ? t('depIn', tm.v) : tm.v;
        const leave = this._depMin(n.t) - n.stop.walk, after = next.find((x) => x.stop !== n.stop || x.line !== n.line);
        gs.textContent = [n.stop.walk ? (leave <= 0 ? t('depGoNow') : t('depLeaveIn', leave)) : '', n.stop.name || '', after ? t('depThen', after.line, Math.max(0, this._depMin(after.t))) : ''].filter(Boolean).join(' · ');
      } else {
        b.textContent = t(st.some((x) => x.err) && !st.some((x) => x.ok) ? 'depOffline' : st.some((x) => x.ok) ? 'depNone' : 'depLoading');
        w.textContent = '';
        gs.textContent = '';
      }
      // the coming departures as a strip in the colours of their lines
      const segs = next.slice(0, 12);
      v.querySelector('.segs').innerHTML = segs.map((d) => `<i class="on" style="--c:${hexRgb(d.bg || DEP_COLORS[d.product]).join(',')}"></i>`).join('') || '<i></i>';
      v.querySelector('.gk .bat').innerHTML = this._iconHtml(L.icon);
    });
    return v;
  },
});

Object.assign(STR.en, {
  layer_departures: 'Departures', depNow: 'now', depIn: (m) => `in ${m} min`, depLeaveIn: (m) => `Leave in ${m} min`, depGoNow: 'Leave now',
  depWalk: (m) => `${m} min`, depThen: (l, m) => `then ${l} in ${m} min`, depNone: 'No departures in the next hour and a half',
  depLoading: 'Loading departures …', depOffline: 'Timetable not reachable',
});
Object.assign(STR.de, {
  layer_departures: 'Abfahrten', depNow: 'jetzt', depIn: (m) => `in ${m} min`, depLeaveIn: (m) => `Losgehen in ${m} min`, depGoNow: 'Jetzt losgehen',
  depWalk: (m) => `${m} min`, depThen: (l, m) => `danach ${l} in ${m} min`, depNone: 'Keine Abfahrten in den nächsten anderthalb Stunden',
  depLoading: 'Abfahrten werden geladen …', depOffline: 'Fahrplan nicht erreichbar',
});
