/* ================================================================== Card: build, stage, markers, layers, info tiles */
function geo(S) {
  const px = (x) => (((x - S.x) / S.w) * 100).toFixed(3);
  const py = (y) => (((y - S.y) / S.h) * 100).toFixed(3);
  const pw = (w) => ((w / S.w) * 100).toFixed(3);
  const ph = (h) => ((h / S.h) * 100).toFixed(3);
  return {
    px, py, pw, ph,
    at: ([x, y]) => `left:${px(x)}%;top:${py(y)}%`,
    box: ([a, b, c, d]) => `left:${px(a)}%;top:${py(b)}%;width:${pw(c - a)}%;height:${ph(d - b)}%`,
    /* glass tile: half a wall gap on every side */
    tile: ([a, b, c, d]) => `left:calc(${px(a)}% + var(--gap) / 2);top:calc(${py(b)}% + var(--gap) / 2);width:calc(${pw(c - a)}% - var(--gap));height:calc(${ph(d - b)}% - var(--gap))`,
  };
}
/* position inside a room (percent of the room's wall-to-wall rectangle) */
const inRoom = (r, [a, b, c, d]) => {
  const [x1, y1, x2, y2] = r, w = x2 - x1, h = y2 - y1;
  return `left:${(((a - x1) / w) * 100).toFixed(3)}%;top:${(((b - y1) / h) * 100).toFixed(3)}%;width:${(((c - a) / w) * 100).toFixed(3)}%;height:${(((d - b) / h) * 100).toFixed(3)}%`;
};
const inRoomAt = (r, [x, y]) => `left:${(((x - r[0]) / (r[2] - r[0])) * 100).toFixed(3)}%;top:${(((y - r[1]) / (r[3] - r[1])) * 100).toFixed(3)}%`;
const RING = '<svg class="ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18.4" pathLength="100" stroke-dasharray="0 100"/></svg>';
const TOGGLE_DOMAINS = ['switch', 'input_boolean', 'fan', 'light', 'humidifier', 'siren', 'automation', 'remote'];
const PRESS_DOMAINS = ['button', 'input_button', 'scene', 'script'];

/* Which wall of which room a window / door segment sits on */
function wallOf(M, s) {
  const tol = 6 * M.D;
  for (const r of M.rooms) {
    const q = r.r;
    if (segH(s)) {
      const mx = (s[0] + s[2]) / 2;
      if (mx < q[0] || mx > q[2]) continue;
      if (Math.abs(s[1] - q[1]) < tol) return { room: r, side: 't' };
      if (Math.abs(s[1] - q[3]) < tol) return { room: r, side: 'b' };
    } else {
      const my = (s[1] + s[3]) / 2;
      if (my < q[1] || my > q[3]) continue;
      if (Math.abs(s[0] - q[0]) < tol) return { room: r, side: 'l' };
      if (Math.abs(s[0] - q[2]) < tol) return { room: r, side: 'r' };
    }
  }
  return null;
}
const segDist = (s, [x, y]) => Math.hypot(Math.max(s[0] - x, 0, x - s[2]), Math.max(s[1] - y, 0, y - s[3]));

class GlassFloorplanCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._last = {};
    this._sel = [];
    this._upd = [];
    this._trail = [];
    this._fc = {};
    this._optimistic = {};
    this._reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  static getConfigElement() { return document.createElement(`${CARD_TAG}-editor`); }
  /* a new card starts empty – the floor plan editor begins with the template (rooms from the areas are one click there) */
  static getStubConfig() { return {}; }
  setConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('Invalid configuration');
    this._config = JSON.parse(JSON.stringify(config));
    this._restore();
    if (this._built) this._rebuild();
  }
  getCardSize() { return 12; }
  getGridOptions() { return { columns: 'full', rows: 'auto', min_columns: 6 }; }
  set preview(v) { this._previewFlag = !!v; }

  /* The floor plan editor shows the card live on a virtual screen: { w, h } size of that screen, the layer `tab`,
   * optionally a fixed `stage` (so the plan does not move while something is dragged) or a fixed scale and origin
   * `fix` (while rooms are drawn), `bare` hides the devices (while the plan itself is built). Nothing is stored for the viewer. */
  setEditorView(config, ev) {
    this._ev = ev || null;
    this._config = JSON.parse(JSON.stringify(config));
    if (ev?.tab) this._tab = ev.tab;
    if (this._built && this._hass) this._rebuild();
  }
  get preview() { return !!this._previewFlag; }

  connectedCallback() {
    if (!this._onResize) this._onResize = (e) => { if (e?.type === 'resize') this._layout(); if (this._popOpen) this._syncPop(); };
    window.addEventListener('resize', this._onResize);
    window.addEventListener('scroll', this._onResize, { passive: true });
    clearInterval(this._clockT);
    this._clockT = setInterval(() => this._tick(), 10000);
    if (this._built) {
      this._ro?.observe(this);
      this._layout();
      this._subscribeForecast();
      this._kickRobot?.();
      this._depSync();
      this._tmSync();
    }
  }

  disconnectedCallback() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('scroll', this._onResize);
    window.removeEventListener('keydown', this._onKey);
    clearInterval(this._clockT);
    this._ro?.disconnect();
    this._unsubscribeForecast();
    cancelAnimationFrame(this._rraf);
    this._rraf = null;
    this._wiredKey = false;
    this._depStop();
    this._tmStop();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._useLang();
    if (!this._built) this._build();
    else if (first) this._rebuild();
    if (!this._fcSub) this._subscribeForecast();
    this._loadLabels();
    this._update();
    this._haCards?.forEach((c) => { c.hass = hass; });
  }
  get hass() { return this._hass; }

  _useLang() {
    const h = this._hass, c = this._config.language;
    const l = c && c !== 'auto' ? c : h?.locale?.language || h?.language || 'en';
    LANG = String(l).toLowerCase().startsWith('de') ? 'de' : 'en';
    LOCALE = h?.locale?.language || h?.language || (LANG === 'de' ? 'de-DE' : 'en');
  }

  /* per-viewer conveniences (chosen layer, cleaning mode) */
  _storeKey() { return `${CARD_TAG}:${this._config.id || this._config.title || 'default'}`; }
  _restore() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(this._storeKey()) || '{}'); } catch (e) { /* private mode */ }
    this._tab = this._tab || s.tab || null;
    this._mode = this._mode || s.mode || null;
    this._fan = this._fan || s.fan || null;
    this._water = this._water || s.water || null;
  }
  _save() {
    try { localStorage.setItem(this._storeKey(), JSON.stringify({ tab: this._tab, mode: this._mode, fan: this._fan, water: this._water })); } catch (e) { /* never mind */ }
  }

  /* the preview in Home Assistant's card dialog / card picker (HA also sets .preview on every card in edit mode –
   * there the card keeps filling the screen, so only the surroundings count) */
  _inPreview() {
    for (let n = this; n; n = n.parentNode || n.host) {
      const tag = n.localName || '';
      if (tag === 'hui-card-preview' || tag === 'hui-dialog-edit-card' || tag === 'hui-card-picker' || n.classList?.contains?.('gfc-preview')) return true;
    }
    return false;
  }
  /* inside Home Assistant's edit mode (card options bar below the card) */
  _inEditMode() {
    for (let n = this; n; n = n.parentNode || n.host) {
      const tag = n.localName || '';
      if (tag === 'hui-card-options' || tag === 'hui-card-edit-mode') return true;
      if (tag === 'hui-panel-view' || tag === 'hui-sections-view') return !!n.lovelace?.editMode;
    }
    return false;
  }
  _wantMobile(W) {
    const l = this._config.layout;
    if (l === 'mobile') return true;
    if (l === 'desktop') return false;
    return W > 0 && W < 700;
  }

  /* ---------------------------------------------------------------- Build */
  _rebuild() {
    if (!this._hass) return;
    if (this._popOpen) { const r = this._reduced; this._reduced = true; this._closePop(); this._reduced = r; }
    cancelAnimationFrame(this._rraf);
    this._rraf = null;
    this._robot = null;
    this._trail = [];
    this._last = {};
    this._gapKind = null;
    this._decl = false;
    this._ro?.disconnect();
    this._build();
    this._update(true);
  }

  _build() {
    this._built = true;
    this._useLang();
    const W = this._ev?.w || this.getBoundingClientRect().width || this.parentElement?.getBoundingClientRect().width || window.innerWidth;
    this._m = this._wantMobile(W);
    const M = this._M = buildModel(this._config, this._hass, { mobile: this._m });
    if (this._ev?.stage) M.stage = { ...this._ev.stage };
    if (this._ev?.tab && M.layers.some((l) => l.id === this._ev.tab)) this._tab = this._ev.tab;
    // the editor needs the plan: a card with nothing but departures gets a plain layer to show it
    if (this._ev?.tab && !M.layers.some((l) => l.id === this._ev.tab) && M.layers.every((l) => VIEW_TYPES.includes(l.type))) {
      M.layers.unshift({ id: 'light', type: 'light', name: null, icon: 'bulb', kinds: new Set(LAYER_TYPES.light.kinds), ents: new Set() });
      this._tab = 'light';
    }
    if (!M.layers.some((l) => l.id === this._tab)) this._tab = M.layers[0].id;
    this._sel = this._sel.filter((k) => M.byRoom[k]);
    const S = M.stage, G = this._G = geo(S), D = M.D;
    const lights = M.ents.filter((e) => e.kind === 'light' && e.at);

    // covers darken the window next to them
    this._winCover = M.windows.map((w) => {
      let best = null, bd = 150 * D;
      for (const e of M.ents) if (e.kind === 'cover' && e.at) { const d = segDist(w, e.at); if (d < bd) { bd = d; best = e.entity; } }
      return best;
    });

    const rooms = M.rooms.map((r) => {
      const furn = r.furn.map((f) => `<i class="fu${f.circle ? ' c' : ''} ${esc(f.kind)}" style="${inRoom(r.r, f.r)}${f.circle ? '' : `;--fr:${f.rad}`}"></i>`).join('');
      // lamps: spots get a small halo + light cones, all others a round glow
      const glows = lights.filter((l) => l.room === r.id).map((l) => {
        const rr = (l.reach / D).toFixed(1);
        if (!l.beams) return `<i data-e="${esc(l.entity)}" style="${inRoomAt(r.r, l.at)};--r:${rr}"></i>`;
        const cones = spotAngles(l.entity, l.beams).map((a) => `conic-gradient(from ${a}deg, var(--cb))`).join(',');
        return `<i data-e="${esc(l.entity)}" style="${inRoomAt(r.r, l.at)};--r:62"></i><i class="cone" data-e="${esc(l.entity)}" style="${inRoomAt(r.r, l.at)};--r:${rr};--cones:${cones}"></i>`;
      }).join('') + M.ents.filter((e) => e.kind === 'media' && e.room === r.id && e.at).map((e) => {
        const tv = r.furn.find((f) => f.kind === 'tv');
        return `<i data-e="${esc(e.entity)}" data-tvglow style="${inRoomAt(r.r, tv ? center(tv.r) : e.at)};--r:150;--c:120,160,255"></i>`;
      }).join('');
      // daylight through this room's windows
      const day = M.windows.map((w, i) => ({ w, i, at: wallOf(M, w) })).filter((x) => x.at && x.at.room === r) .map(({ w, i, at: { side } }) => {
        const q = r.r, len = (segH(w) ? w[2] - w[0] : w[3] - w[1]) * 3.2;
        const cov = this._winCover[i] ? ` data-cover="${esc(this._winCover[i])}"` : '';
        if (side === 't' || side === 'b') {
          const cx = (w[0] + w[2]) / 2, d = Math.min(230 * D, (q[3] - q[1]) * 0.75);
          return `<i class="dl${side === 'b' ? ' up' : ''}"${cov} style="${inRoom(q, [cx - len / 2, side === 't' ? q[1] : q[3] - d, cx + len / 2, side === 't' ? q[1] + d : q[3]])}"></i>`;
        }
        const cy = (w[1] + w[3]) / 2, d = Math.min(230 * D, (q[2] - q[0]) * 0.75);
        return `<i class="dl ${side}"${cov} style="${inRoom(q, [side === 'l' ? q[0] : q[2] - d, cy - len / 2, side === 'l' ? q[0] + d : q[2], cy + len / 2])}"></i>`;
      }).join('');
      return `<div class="room${r.lb ? ' lb' : ''}" data-room="${esc(r.id)}" style="${G.tile(r.r)}" role="button" tabindex="0" aria-label="${esc(r.name)}">
        <div class="ctint"></div><div class="ri"><div class="rgl">${day}${glows}</div>${furn}</div><div class="rl"><b>${esc(r.name)}</b><span></span></div><div class="badge"></div></div>`;
    }).join('');

    const glows = lights.map((l) => `<i data-e="${esc(l.entity)}" style="${G.at(l.at)};--r:${l.beams ? 120 : (l.reach / D).toFixed(1)}"></i>`).join('')
      + M.ents.filter((e) => e.kind === 'media' && e.at).map((e) => `<i data-e="${esc(e.entity)}" data-tvglow style="${G.at(e.at)};--r:120;--c:120,160,255"></i>`).join('');
    // windows + front door hug the outside of the glass tile
    const segEl = (s, cls, extra = '') => {
      const w = wallOf(M, s), sgn = !w ? 0 : w.side === 't' || w.side === 'l' ? 1 : -1;
      const off = sgn ? ` + ${sgn} * (var(--gap) / 2 - 1.7 * var(--u))` : '';
      return segH(s)
        ? `<i class="${cls}"${extra} style="left:${G.px(s[0])}%;width:${G.pw(s[2] - s[0])}%;top:calc(${G.py(s[1])}%${off})"></i>`
        : `<i class="${cls} v"${extra} style="top:${G.py(s[1])}%;height:${G.ph(s[3] - s[1])}%;left:calc(${G.px(s[0])}%${off})"></i>`;
    };
    const wins = M.windows.map((w, i) => segEl(w, `win${this._winCover[i] ? ' cv' : ''}`, this._winCover[i] ? ` data-cover="${esc(this._winCover[i])}"` : '')).join('')
      + (M.entrance ? segEl(M.entrance, 'win fd') : '');
    // passages: glass bridges across the wall gap
    const pas = M.passages.map((s) => (segH(s)
      ? `<i class="pas" style="left:${G.px(s[0])}%;width:${G.pw(s[2] - s[0])}%;top:calc(${G.py(s[1])}% - var(--gap) / 2 + var(--u));height:calc(var(--gap) - 2 * var(--u))"></i>`
      : `<i class="pas" style="top:${G.py(s[1])}%;height:${G.ph(s[3] - s[1])}%;left:calc(${G.px(s[0])}% - var(--gap) / 2 + var(--u));width:calc(var(--gap) - 2 * var(--u))"></i>`)).join('');

    // window and door contacts sit on their window (15-openings), not as a button
    const markers = M.ents.filter((e) => e.at && e.plan && e.kind !== 'vacuum' && !e.win).map((e) => this._markerHtml(e)).join('')
      + (M.door?.at ? `<button class="dev door" data-e="__door" data-k="door" style="${G.at(M.door.at)}" aria-label="${esc(M.door.name || t('frontDoor'))}"><i class="rip"></i><i class="halo"></i><i class="disc"></i>${icon('door')}</button>` : '');
    const vac = M.vac ? `<svg class="trail" viewBox="${S.x} ${S.y} ${S.w} ${S.h}" preserveAspectRatio="none"><polyline class="t1" points=""/><polyline class="t2" points=""/></svg>
      ${M.vac.dock ? `<i class="dockm" style="${G.at(M.vac.dock)}"></i>` : ''}<div class="bot" style="${G.at(M.vac.dock || center(M.rooms[0]?.r || [0, 0, 0, 0]))}"><i class="bp"></i><i class="bd"></i></div>` : '';
    // layer bar: in the plan (upright or lying), on a phone else at the bottom of the screen like a tab bar
    const Wd = M.widgets, dock = this._m && !Wd.bar, barH = dock || M.wopt.barH, cmp = { normal: '', small: ' cmp', mini: ' cmp xs' }[M.wopt.size];
    const bar = Wd.bar || this._m ? `<div class="tabs${barH ? ' h' : ''}${dock ? ' dock' : ''}" role="tablist" aria-orientation="${barH ? 'horizontal' : 'vertical'}" style="${Wd.bar ? G.at(center(Wd.bar)) : ''}"><i class="knob"></i>
      ${M.layers.map((L) => `<button data-tab="${esc(L.id)}" role="tab" aria-label="${esc(this._layerName(L))}">${this._iconHtml(L.icon)}<span>${esc(this._layerName(L))}</span></button>`).join('')}</div>` : '';
    const empty = !M.rooms.length && !this._ev ? `<div class="empty-plan"><div>${icon('plan')}<b>${esc(t('emptyTitle'))}</b><p>${esc(t('emptyText'))}</p></div></div>` : '';

    this.shadowRoot.innerHTML = `<style>${STYLES}${STYLES_M}${STYLES_D}${STYLES_T}</style>
<div class="root boot${this._m ? ' m' : ''}${this._inPreview() || this._ev ? ' pv' : ''}${this._ev ? ' ev' : ''}${this._ev?.bare ? ' bare' : ''}" style="${springVars()}">
  <svg class="defs" width="0" height="0" aria-hidden="true"><defs>
    <linearGradient id="gfcg" gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="22"><stop offset="0" stop-color="#fbfbfd" stop-opacity=".94"/><stop offset=".55" stop-color="#d8dae1" stop-opacity=".8"/><stop offset="1" stop-color="#9ca1ad" stop-opacity=".7"/></linearGradient>
    <linearGradient id="gfcdial" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5aa8ff"/><stop offset=".5" stop-color="#7fe0c0"/><stop offset="1" stop-color="#ff9f45"/></linearGradient>
  </defs></svg>
  <div class="bg"><i class="g3"></i><i class="g4"></i><i class="g5"></i><i class="g6"></i><i class="g1"></i><i class="g2"></i><i class="dots"></i></div>
  <div class="lay">
    <div class="stage">
      <div class="glows">${glows}</div>
      ${pas}${rooms}${wins}${this._openingsHtml(G)}${vac}${markers}${dock ? '' : bar}
      ${Wd.card ? `<div class="gcard${cmp}" style="${G.tile(Wd.card)}"></div>` : ''}
      <div class="tip"></div>
    </div>
    ${Wd.side ? `<div class="${this._m ? 'mside' : 'side'}">${Wd.side.card ? `<div class="gcard${cmp}"></div>` : ''}</div>` : ''}
    ${this._m && M.rooms.length && !Wd.card ? `<div class="gcard${cmp}"></div>` : ''}
    ${empty}
  </div>
  ${M.dep ? '<div class="dview"></div>' : ''}
  ${M.dep?.map ? '<div class="tview"></div>' : ''}
  ${dock ? bar : ''}
  <div class="pop-wrap"><div class="scrim"></div><div class="pshell"></div><div class="pop" role="dialog" aria-modal="true" tabindex="-1"></div></div>
  <div class="menu" role="menu"></div>
  <div class="toast" role="status"></div>
</div>`;

    const $ = (s) => this.shadowRoot.querySelector(s);
    this.$ = $;
    this._root = $('.root');
    this._stage = $('.stage');
    this._gcard = $('.gcard');
    this._sideEl = $('.side, .mside');
    this._dview = $('.dview');
    this._tview = $('.tview');
    this._shell = $('.pshell');
    this._scrim = $('.scrim');
    this._tip = $('.tip');
    this._pop = $('.pop');
    this._popWrap = $('.pop-wrap');
    this._menu = $('.menu');
    this._botEl = $('.bot');
    this._mk = {};
    this.shadowRoot.querySelectorAll('.lamp, .dev').forEach((el) => { this._mk[el.dataset.e] = el; });
    this._roomEls = {};
    this.shadowRoot.querySelectorAll('.room').forEach((el) => { this._roomEls[el.dataset.room] = el; });
    this._watch = this._watchList();
    this._opSig = this._openSig();

    this._buildSide();
    this._wire();
    if (this._m) this._mobileInit();
    this._ro = new ResizeObserver(() => this._layout());
    this._ro.observe(this);
    this._layout();
    this._applyTab(false);
    requestAnimationFrame(() => { this._layout(); requestAnimationFrame(() => this._root?.classList.remove('boot')); });
  }

  /* a device's glass button on the plan – or (tile) the same button inside a button of an own tile */
  _markerHtml(e, tile) {
    const tag = tile ? 'span' : 'button', open = (cls, k) => `<${tag} class="${cls}${tile ? ' tk' : ''}" data-e="${esc(e.entity)}" data-k="${k}"${tile ? '' : ` style="${this._G.at(e.at)}" aria-label="${esc(this._name(e))}"`}>`;
    if (e.kind === 'light') return `${open('lamp', 'light')}<i class="rip"></i><i class="halo"></i><i class="disc"></i>${RING}${this._iconHtml(e.icon || 'bulb')}</${tag}>`;
    const st = this._hass?.states?.[e.entity], d = domainOf(e.entity);
    if (e.kind === 'climate' && (d === 'climate' || d === 'sensor')) {
      const sens = d === 'sensor';
      return `${open(`dev val${sens ? ' sens' : ' clim'}`, 'climate')}<i class="halo"></i><i class="disc"></i><span class="vt"></span>${sens ? '' : `<i class="act">${icon('flame')}</i>`}</${tag}>`;
    }
    const ring = e.kind === 'cover' ? RING : '';
    return `${open(`dev ${e.kind === 'media' ? 'tv' : e.kind === 'cover' ? 'cov' : 'oth'}`, e.kind)}<i class="rip"></i><i class="halo"></i><i class="disc"></i>${ring}${this._iconHtml(e.icon || this._autoIcon(e.entity, st))}</${tag}>`;
  }

  /* Glass icon by name, or a Home Assistant icon (mdi:…) */
  _iconHtml(name) {
    if (name && ICONS[name]) return icon(name);
    if (name && MDI_MAP[name]) return icon(MDI_MAP[name]);
    if (name && String(name).includes(':') && customElements.get('ha-icon')) return `<ha-icon icon="${esc(name)}"></ha-icon>`;
    return icon('dot');
  }
  _autoIcon(eid, st) {
    const d = domainOf(eid), a = st?.attributes || {}, dc = a.device_class, on = st?.state;
    if (a.icon && MDI_MAP[a.icon]) return MDI_MAP[a.icon];
    if (d === 'light') return 'bulb';
    if (d === 'media_player') return dc === 'speaker' || dc === 'receiver' ? 'speaker' : 'tv';
    if (d === 'cover') return on === 'closed' ? 'blinds' : 'blindsOpen';
    if (d === 'climate') return 'thermo';
    if (d === 'fan') return 'fan';
    if (d === 'switch') return dc === 'outlet' ? 'plug' : 'toggle';
    if (d === 'input_boolean') return 'toggle';
    if (d === 'lock') return on === 'unlocked' || on === 'open' ? 'unlock' : 'lock';
    if (d === 'vacuum') return 'robot';
    if (d === 'scene') return 'sparkle';
    if (d === 'script') return 'play';
    if (d === 'button' || d === 'input_button') return 'press';
    if (d === 'camera') return 'camera';
    if (d === 'humidifier') return 'humid';
    if (d === 'siren') return 'bell';
    if (d === 'alarm_control_panel') return 'shield';
    if (d === 'binary_sensor') {
      if (['door', 'garage_door'].includes(dc)) return isOn(st) ? 'doorOpen' : 'door';
      if (['window', 'opening'].includes(dc)) return isOn(st) ? 'windowOpen' : 'window';
      if (['motion', 'occupancy', 'presence'].includes(dc)) return 'motion';
      if (dc === 'moisture') return 'drop';
      if (['smoke', 'gas', 'carbon_monoxide', 'safety', 'problem'].includes(dc)) return 'alert';
      if (dc === 'lock') return isOn(st) ? 'unlock' : 'lock';
      return 'dot';
    }
    if (d === 'sensor') {
      return { temperature: 'thermo', humidity: 'humid', power: 'bolt', energy: 'bolt', current: 'bolt', voltage: 'bolt', illuminance: 'sun', carbon_dioxide: 'leaf', pm25: 'leaf', volatile_organic_compounds: 'leaf', battery: 'battery', moisture: 'drop' }[dc] || 'gauge';
    }
    return 'dot';
  }

  _watchList() {
    const M = this._M, ids = new Set(['sun.sun']);
    for (const e of M.ents) { ids.add(e.entity); if (e.power) ids.add(e.power); }
    for (const r of M.rooms) r.helpers.forEach((h) => ids.add(h));
    if (M.door) { ids.add(M.door.open); ids.add(M.door.bell); }
    if (M.weather) ids.add(M.weather);
    M.indoor.forEach((i) => ids.add(i));
    if (M.vac) Object.values(this._vacEnts()).forEach((i) => ids.add(i));
    for (const L of M.layers) L.ents.forEach((i) => ids.add(i));
    for (const x of M.tiles) { x.ents.forEach((e) => ids.add(e.entity)); (x.btns || []).forEach((b) => ids.add(b.entity)); }
    for (const s of M.dep?.stops || []) ids.add(s.entity);
    ids.delete(null); ids.delete(undefined);
    return [...ids];
  }

  /* Everything at a glance: the plan gets as large as width AND visible window height allow; the card fills
   * exactly the space below the header – the page does not scroll. "fit: width" scales by width only. */
  _layout() {
    const ev = this._ev, W = ev ? ev.w : this._root?.clientWidth;
    if (!W) return;
    if (this._wantMobile(W) !== this._m && this._hass) { clearTimeout(this._rbT); this._rbT = setTimeout(() => this._rebuild(), 30); return; }
    if (this._m) { this._layoutMobile(W); return; }
    const S = this._M.stage, D = this._M.D, B = this._M.bbox, side = this._sideEl;
    const padX = clamp(Math.round(W * 0.02), 12, 34);
    const sideW = side ? clamp(Math.round(W * 0.2), 220, 320) : 0, sgap = side ? clamp(Math.round(W * 0.014), 12, 22) : 0;
    let pu = (W - 2 * padX - sideW - sgap) / S.w, avail = 0, padY;
    const screen = (this._config.fit !== 'width' || !!ev?.fix) && (!!ev || !this._inPreview());
    if (screen) {
      const top = ev ? 0 : this.getBoundingClientRect().top + (window.scrollY || 0);
      avail = ev ? ev.h : Math.max(420, Math.floor(window.innerHeight - Math.max(0, top) - (this._inEditMode() ? 64 : 0)));
      padY = clamp(Math.round(avail * 0.018), 8, 22);
      pu = Math.min(pu, (avail - 2 * padY) / S.h);
    }
    let u = clamp(pu * D, 0.4, 1.45);
    pu = u / D;
    if (!screen) padY = clamp(Math.round(14 * u), 8, 22);
    let sw = S.w * pu, sh = S.h * pu;
    const H = avail || Math.round(sh + 2 * padY);
    let sx = Math.round((W - sw - sideW - sgap) / 2), sy = Math.round((H - sh) / 2);
    // the editor keeps plan → screen fixed while rooms are drawn ({ pu, ox, oy }: pixels per cm and where 0 / 0 is)
    if (ev?.fix) {
      pu = ev.fix.pu; u = pu * D;
      sw = S.w * pu; sh = S.h * pu;
      sx = ev.fix.ox + S.x * pu; sy = ev.fix.oy + S.y * pu;
    }
    if (this._h !== H) { this._h = H; this.style.height = `${H}px`; }
    if (side) {
      const g = 13 * u, top = sy + (B[1] - S.y) * pu + g / 2, h = (B[3] - B[1]) * pu - g;
      Object.assign(side.style, { left: `${sx + sw + sgap}px`, top: `${top.toFixed(1)}px`, width: `${sideW}px`, height: `${Math.max(h, 200).toFixed(1)}px` });
      side.style.setProperty('--su', `${clamp(sideW / 400, 0.56, 0.86).toFixed(4)}px`);
    }
    const s = this._root.style;
    s.setProperty('--u', `${u.toFixed(4)}px`);
    s.setProperty('--sw', `${sw.toFixed(1)}px`);
    s.setProperty('--sh', `${sh.toFixed(1)}px`);
    s.setProperty('--sx', `${sx}px`);
    s.setProperty('--sy', `${sy}px`);
    // dot grid aligned with the floor plan
    s.setProperty('--dx', `${(sx + (B[0] - S.x) * pu).toFixed(1)}px`);
    s.setProperty('--dy', `${(sy + (B[1] - S.y) * pu).toFixed(1)}px`);
    this._u = u;
    this._pu = pu;
    this._lv = { S, pu, sx, sy, H };
    this._placeKnob(true);
    this._fitLabels();
    this._fitBtnTiles();
    this._fitGcard();
    this._depLayout();
    this._tmLayout();
    this._declutter();
  }

  /* a room name that is a little too long for its room gets slightly smaller before it is cut off */
  _fitLabels() { fitText(this.shadowRoot.querySelectorAll('.rl b')); }
  /* the buttons of a tile in as many columns as give them the most room (a tall tile stacks them) */
  _fitBtnTiles() {
    const lab = Math.max(19, 24 * (this._u || 1));
    for (const g of this.shadowRoot.querySelectorAll('.card.bt .bgrid')) {
      const n = g.children.length, W = g.clientWidth, H = g.clientHeight;
      if (!n || !W || !H) continue;
      let best = null;
      for (let c = 1; c <= n; c++) {
        const r = Math.ceil(n / c), k = Math.min((0.8 * W) / c, H / r - lab);
        if (!best || k > best.k + 0.5) best = { c, r, k };
      }
      g.parentElement.style.setProperty('--bc', best.c);
      g.parentElement.style.setProperty('--br', best.r);
    }
  }

  /* Markers of one layer must not cover each other or a room name: overlapping ones are pushed apart
   * (a few relaxation steps, each marker stays in its room and close to its spot). Positions in the config stay. */
  _declutter() {
    const M = this._M, sr = this._stage?.getBoundingClientRect();
    if (!sr?.width || !this._pu) return;
    // (shown scaled in the floor plan editor: measured boxes are converted back)
    const S = M.stage, pu = this._pu, g = 13 * this._u, sc = sr.width / (S.w * pu) || 1;
    const items = [];
    for (const [eid, el] of Object.entries(this._mk)) {
      const e = eid === '__door' ? M.door : M.ents.find((x) => x.entity === eid);
      if (!e?.at) continue;
      const x0 = (e.at[0] - S.x) * pu, y0 = (e.at[1] - S.y) * pu;
      if (el.classList.contains('hid')) { el.style.left = `${this._G.px(e.at[0])}%`; el.style.top = `${this._G.py(e.at[1])}%`; continue; }
      const rm = M.byRoom[e.room]?.r;
      items.push({ el, e, x0, y0, x: x0, y: y0, r: el.offsetWidth / 2 + 2, room: rm && [(rm[0] - S.x) * pu + g / 2, (rm[1] - S.y) * pu + g / 2, (rm[2] - S.x) * pu - g / 2, (rm[3] - S.y) * pu - g / 2] });
    }
    const boxes = [];
    for (const el of this.shadowRoot.querySelectorAll('.rl b, .rl span')) {
      if (!el.textContent) continue;
      const rg = document.createRange();
      rg.selectNodeContents(el);
      const b = rg.getBoundingClientRect();
      if (b.width) boxes.push([(b.left - sr.left) / sc - 3, (b.top - sr.top) / sc - 2, (b.right - sr.left) / sc + 3, (b.bottom - sr.top) / sc + 2]);
    }
    for (let it = 0; it < 48; it++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (d >= min) continue;
        if (d < 0.01) { dx = j % 2 ? 1 : -1; dy = 0.3; d = Math.hypot(dx, dy); }
        const k = (min - d) / 2 / d;
        a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k;
        moved = true;
      }
      for (const a of items) for (const [l, tp, r, bt] of boxes) {
        const nx = clamp(a.x, l, r), ny = clamp(a.y, tp, bt), dx = a.x - nx, dy = a.y - ny, d = Math.hypot(dx, dy);
        if (d >= a.r) continue;
        if (d < 0.01) { const down = bt - a.y + a.r, right = r - a.x + a.r; if (down < right) a.y += down; else a.x += right; }
        else { a.x += (dx / d) * (a.r - d); a.y += (dy / d) * (a.r - d); }
        moved = true;
      }
      for (const a of items) {
        const lim = a.r * 2.4, vx = a.x - a.x0, vy = a.y - a.y0, v = Math.hypot(vx, vy);
        if (v > lim) { a.x = a.x0 + (vx / v) * lim; a.y = a.y0 + (vy / v) * lim; }
        // stay inside the room
        if (a.room) { const m = a.r * 0.92; a.x = clamp(a.x, a.room[0] + m, Math.max(a.room[0] + m, a.room[2] - m)); a.y = clamp(a.y, a.room[1] + m, Math.max(a.room[1] + m, a.room[3] - m)); }
      }
      if (!moved) break;
    }
    const sw = S.w * pu, sh = S.h * pu;
    for (const a of items) {
      a.el.style.left = `${((a.x / sw) * 100).toFixed(3)}%`;
      a.el.style.top = `${((a.y / sh) * 100).toFixed(3)}%`;
    }
  }

  /* ---------------------------------------------------------------- Interaction */
  _press(el, onTap, onHold, onDouble) {
    let timer, held = false, sx = 0, sy = 0, moved = false, active = false, tapT = 0;
    // with a double tap action a single tap waits a moment for the second one
    const tap = () => {
      if (!onDouble) { onTap(); return; }
      if (tapT) { clearTimeout(tapT); tapT = 0; onDouble(); return; }
      tapT = setTimeout(() => { tapT = 0; onTap(); }, 250);
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      active = true; held = false; moved = false; sx = e.clientX; sy = e.clientY;
      el.classList.add('pressed');
      if (onHold) timer = setTimeout(() => { held = true; el.classList.remove('pressed'); onHold(); }, 480);
    });
    el.addEventListener('pointermove', (e) => { if (active && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) { moved = true; clearTimeout(timer); el.classList.remove('pressed'); } });
    const cancel = () => { active = false; clearTimeout(timer); el.classList.remove('pressed'); };
    el.addEventListener('pointerup', (e) => { if (!active) return; const go = !held && !moved; cancel(); if (go) { e.stopPropagation(); tap(); } });
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('click', (e) => e.stopPropagation());
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (onHold) { cancel(); onHold(); } });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } });
  }

  _wire() {
    const sr = this.shadowRoot, M = this._M;
    sr.querySelectorAll('.tabs button').forEach((b) => {
      const L = M.layers.find((x) => x.id === b.dataset.tab);
      b.addEventListener('click', () => { this._hideTip(); this._setTab(b.dataset.tab); });
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !this._m) this._showTip(b, this._layerName(L), null, !b.parentElement.classList.contains('h')); });
      b.addEventListener('pointerleave', () => this._hideTip());
    });
    for (const [eid, el] of Object.entries(this._mk)) {
      if (eid === '__door') {
        this._press(el, () => { this._hideTip(); this._openDoor(el); });
        el.addEventListener('pointerenter', () => this._showTip(el, M.door.name || t('frontDoor'), t('open') + ' …'));
        el.addEventListener('pointerleave', () => this._hideTip());
        continue;
      }
      const e = M.ents.find((x) => x.entity === eid), ctx = (own) => ({ entity: e.entity, el, name: this._name(e), own });
      const room = () => this._openRoom(e.room, { from: this._roomEls[e.room], focus: e.entity });
      this._press(el, () => this._markerTap(e, el), () => { this._hideTip(); this._act(e.hold, ctx(room)); }, e.dbl && (() => { this._hideTip(); this._act(e.dbl, ctx()); }));
      el.addEventListener('pointerenter', () => this._showTip(el, this._name(e), this._valueText(e)));
      el.addEventListener('pointerleave', () => this._hideTip());
    }
    this._wireOpenings();
    for (const [k, el] of Object.entries(this._roomEls)) {
      el.addEventListener('click', () => this._roomTap(k));
      el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this._roomTap(k); } });
    }
    sr.querySelector('.scrim').addEventListener('click', () => this._closePop());
    this._root.addEventListener('pointerdown', (e) => {
      if (this._menu.classList.contains('open') && !e.composedPath().some((n) => n === this._menu || n === this._menuAnchor)) this._closeMenu();
    });
    if (!this._onKey) {
      this._onKey = (e) => {
        if (e.key !== 'Escape' || !this.isConnected || !this._root) return;
        if (this._menu.classList.contains('open')) this._closeMenu(); else this._closePop();
      };
    }
    window.removeEventListener('keydown', this._onKey);
    window.addEventListener('keydown', this._onKey);
  }

  /* A tap on a device on the plan: its tap_action, else what fits the device – lamps and switches toggle, covers go up or
   * down, scenes and buttons run, the rest opens its room (or Home Assistant's info dialog) */
  _markerTap(e, el) { this._act(e.tap, { entity: e.entity, el, name: this._name(e), own: () => this._markerOwn(e, el) }); }
  _markerOwn(e, el) {
    const d = domainOf(e.entity);
    if (e.kind === 'light') { this._toggleLamp(e); return; }
    if (e.kind === 'cover') { this._hideTip(); this._coverToggle(e.entity); this._ripple(el); return; }
    if (e.kind === 'media' || e.kind === 'climate' || d === 'lock' || d === 'sensor' || d === 'binary_sensor' || d === 'camera' || d === 'alarm_control_panel') {
      this._hideTip();
      if (d === 'camera' || (!this._roomHas(e.room, this._layer()) && e.room)) { this._openDevice(e.entity, el, true); return; }
      this._openRoom(e.room, { from: this._roomEls[e.room], focus: e.entity });
      return;
    }
    if (TOGGLE_DOMAINS.includes(d) || PRESS_DOMAINS.includes(d)) { this._toggleAny(e.entity, el); return; }
    this._openDevice(e.entity, el, true);
  }

  /* "toggle" for any entity – with the same instant feedback as a tap on the plan */
  _toggleAny(eid, el) {
    const st = this._hass.states[eid], d = domainOf(eid);
    const e = this._M.ents.find((x) => x.entity === eid) || { entity: eid, kind: kindOf(eid, st) };
    if (unavailable(st)) { this._toast(t('notReachable', this._name(e))); return; }
    // a lamp switched from somewhere else (a tile's button): the feedback there, not on the plan
    if (d === 'light') { this._toggleLamp(e, el && el !== this._mk[eid] ? el : null); return; }
    if (d === 'cover') { this._hideTip(); this._coverToggle(eid); this._ripple(el); return; }
    if (PRESS_DOMAINS.includes(d)) {
      this._ripple(el);
      this._pressEntity(eid).then(() => this._toast(t(d === 'scene' ? 'activated' : 'started', this._name(e)))).catch(() => {});
      return;
    }
    if (d === 'lock') { this._ripple(el); this._call('lock', st.state === 'locked' ? 'unlock' : 'lock', { entity_id: eid }).catch(() => {}); return; }
    if (!TOGGLE_DOMAINS.includes(d)) { this._ripple(el); this._call('homeassistant', 'toggle', { entity_id: eid }).catch(() => {}); return; }
    const want = !isOn(st);
    this._optimistic[eid] = { on: want, until: Date.now() + 2500 };
    this._kickOptimistic();
    if (want && el?.classList.contains('dev')) this._ignite(el); else this._ripple(el);
    if (el && this._mk[eid] === el) this._showTip(el, this._name(e), want ? t('on') : t('off'));
    this._call('homeassistant', want ? 'turn_on' : 'turn_off', { entity_id: eid }).catch(() => { this._optimistic = {}; this._update(true); });
  }

  /* An action in Home Assistant's schema. The card runs the usual ones itself (with its own feedback), anything else
   * (assist …) goes to Home Assistant as `hass-action`. No action: the card's own behaviour (`own`). */
  _act(a, { entity, el, name, own } = {}) {
    if (!a) { own?.(); return; }
    const eid = a.entity || entity, conf = a.confirmation;
    if (conf && !a.confirmed && !(conf.exemptions || []).some((x) => x?.user && x.user === this._hass?.user?.id)) {
      // asked in the card's own menu, next to what was tapped
      const n = name || (eid ? this._nameOf(eid) : t('action')), st = this._hass.states[eid], lock = a.action === 'toggle' && domainOf(eid) === 'lock';
      const text = conf.text || (lock ? t(st?.state === 'locked' ? 'confirmUnlock' : 'confirmLock', n) : a.action === 'toggle' ? t(isOn(st) ? 'confirmOff' : 'confirmOn', n) : t('confirmAction', n));
      const go = lock ? t(st?.state === 'locked' ? 'unlock' : 'lock') : a.action === 'toggle' ? t(isOn(st) ? 'turnOff' : 'turnOn') : t('run');
      this._hideTip();
      this._openMenu(el?.isConnected ? el : this._root, [{ ask: text }, { label: go, icon: 'check', onClick: () => this._act({ ...a, confirmed: true }, { entity, el, name }) }, { label: t('cancel'), icon: 'close' }]);
      return;
    }
    switch (a.action) {
      case 'none': return;
      case 'toggle': if (eid) this._toggleAny(eid, el); return;
      case 'more-info': if (eid) this._openDevice(eid, el, true); return;
      case 'navigate': if (a.navigation_path) this._navigate(a.navigation_path, a.navigation_replace); return;
      case 'url': if (a.url_path) window.open(a.url_path, '_blank', 'noopener'); return;
      case 'perform-action': case 'call-service': {
        const [d, sv] = String(a.perform_action || a.service || '').split('.');
        if (!d || !sv) return;
        this._ripple(el);
        this._call(d, sv, a.data || a.service_data || {}, a.target).catch(() => {});
        return;
      }
      case 'fire-dom-event': fire(this, 'll-custom', a); return;
      default: fire(this, 'hass-action', { config: { entity: eid, tap_action: a }, action: 'tap' });
    }
  }
  _navigate(path, replace) {
    const r = this._reduced; this._reduced = true; this._closePop(); this._reduced = r;
    history[replace ? 'replaceState' : 'pushState'](null, '', path);
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: !!replace } }));
  }
  _pressEntity(eid) {
    const d = domainOf(eid);
    if (d === 'button' || d === 'input_button') return this._call(d, 'press', { entity_id: eid });
    return this._call(d, 'turn_on', { entity_id: eid });
  }
  _kickOptimistic() {
    clearTimeout(this._optT);
    this._optT = setTimeout(() => { this._optimistic = {}; this._update(true); }, 2600);
    this._update(true);
  }

  _layer(id = this._tab) { return this._M.layers.find((l) => l.id === id) || this._M.layers[0]; }
  _layerName(L) {
    if (!L) return '';
    return L.name || (L.type === 'custom' ? t('layer') : t(`layer_${L.type}`));
  }
  _ents(L, kind) { return this._M.ents.filter((e) => inLayer(L, e) && (!kind || e.kind === kind)); }
  _roomEnts(k, L, kind) { return this._ents(L, kind).filter((e) => e.room === k); }
  _roomHas(k, L) {
    if (!k || !L) return false;
    if (L.type === 'vacuum') return true;
    if (this._roomEnts(k, L).length) return true;
    if (L.kinds.has('door') && this._M.door?.room === k) return true;
    return L.kinds.has('light') && (this._M.byRoom[k]?.helpers || []).length > 0;
  }

  _roomTap(k) {
    const L = this._layer();
    if (L.type === 'vacuum') { this._vacRoomTap(k); return; }
    if (this._roomHas(k, L)) this._openRoom(k, { from: this._roomEls[k] });
  }

  _call(domain, service, data, target) {
    let p;
    try { p = Promise.resolve(target ? this._hass.callService(domain, service, data, target) : this._hass.callService(domain, service, data)); } catch (e) { p = Promise.reject(e); }
    return p.catch((e) => { this._toast(t('error', e?.message || e)); throw e; });
  }
  _toggle(entity) { return this._call(domainOf(entity) === 'light' ? 'light' : 'homeassistant', 'toggle', { entity_id: entity }).catch(() => {}); }
  _setBri(entity, v) {
    return (v <= 0 ? this._call('light', 'turn_off', { entity_id: entity }) : this._call('light', 'turn_on', { entity_id: entity, brightness_pct: v })).catch(() => {});
  }

  /* Tap a lamp on the plan: switches visibly at once, the real state follows from Home Assistant */
  _toggleLamp(l, from) {
    const st = this._hass.states[l.entity];
    if (unavailable(st)) { this._toast(t('notReachable', this._name(l))); return; }
    const want = !isOn(st);
    this._optimistic[l.entity] = { on: want, until: Date.now() + 2500 };
    this._kickOptimistic();
    const el = from || this._mk[l.entity];
    if (want && el) this._ignite(el); else if (from) this._ripple(from);
    if (el && !from) this._showTip(el, this._name(l), want ? (dimmable(st) && st.attributes.brightness ? `${Math.round(st.attributes.brightness / 2.55)} %` : t('on')) : t('off'));
    this._call('light', want ? 'turn_on' : 'turn_off', { entity_id: l.entity }).catch(() => { this._optimistic = {}; this._update(true); });
  }

  /* Switch-on effect: the disc springs, a soft ring of light runs outwards */
  _ignite(el) {
    if (this._reduced || !el) return;
    el.querySelector('.disc')?.animate([{ transform: 'scale(.8)' }, { transform: 'scale(1)' }], { duration: SPRINGS.pop.ms, easing: ease('pop', 'ease-out') });
    el.querySelector('.rip')?.animate([{ transform: 'scale(.9)', opacity: 0.7 }, { transform: 'scale(2.7)', opacity: 0 }], { duration: 950, easing: 'cubic-bezier(.15, .7, .25, 1)' });
  }
  _ripple(el) {
    if (this._reduced || !el) return;
    const disc = el.querySelector('.disc');
    (disc || el).animate([{ transform: disc ? 'scale(.86)' : 'scale(.97)' }, { transform: 'scale(1)' }], { duration: SPRINGS.pop.ms, easing: ease('pop', 'ease-out') });
  }

  /* state with the optimistic switch applied */
  _st(eid) {
    const st = this._hass?.states?.[eid];
    const o = this._optimistic[eid];
    if (o && o.until > Date.now() && isOn(st) !== o.on) return { ...st, state: o.on ? 'on' : 'off', attributes: { ...(st?.attributes || {}) } };
    return st;
  }
  /* entity name without the room name in front ("Living room Ceiling" → "Ceiling") */
  _name(e) {
    if (e?.name) return e.name;
    const full = this._nameOf(e?.entity), rn = e?.room && this._M?.byRoom[e.room]?.name;
    if (rn) {
      const a = full.toLowerCase(), b = String(rn).toLowerCase();
      if (a === b) return tf(`dom_${domainOf(e.entity)}`, full);
      if (a.startsWith(`${b} `)) { const rest = full.slice(b.length + 1).trim(); return rest.charAt(0).toUpperCase() + rest.slice(1); }
    }
    return full;
  }
  /* without the device's name in front, like Home Assistant's tiles ("Weather station Humidity" → "Humidity") */
  _shortName(eid) {
    const h = this._hass, full = this._nameOf(eid), dev = h?.devices?.[h?.entities?.[eid]?.device_id], dn = dev?.name_by_user || dev?.name;
    if (dn && full.length > dn.length + 1 && full.toLowerCase().startsWith(`${String(dn).toLowerCase()} `)) { const rest = full.slice(dn.length + 1).trim(); return rest.charAt(0).toUpperCase() + rest.slice(1); }
    return this._name({ entity: eid });
  }
  _nameOf(eid) {
    const st = this._hass?.states?.[eid];
    return st?.attributes?.friendly_name || this._hass?.entities?.[eid]?.name || String(eid || '').split('.').pop().replace(/_/g, ' ');
  }

  /* text for tooltips and tiles */
  _valueText(e) {
    const st = this._st(e.entity), d = domainOf(e.entity);
    if (unavailable(st)) return t('offline');
    if (e.kind === 'light') return isOn(st) ? (dimmable(st) ? `${briPct(st)} %` : t('on')) : t('off');
    if (e.kind === 'media') return this._mediaLabel(st);
    if (e.kind === 'cover') return this._coverText(st);
    if (d === 'climate') return this._climText(st);
    return this._stateText(e.entity, st);
  }
  _stateText(eid, st) {
    const d = domainOf(eid), a = st?.attributes || {};
    if (unavailable(st)) return t('offline');
    // a window handle: open / tilted / closed in the card's words
    if (d === 'sensor' && openingSensor(eid, st)) { const o = openState(eid, st); return o === 'tilt' ? t('tilted') : t(o === 'open' ? 'bs_window_on' : 'bs_window_off'); }
    if (d === 'sensor' || (d === 'input_number' || d === 'number')) {
      const v = num(st);
      if (v == null) return String(st.state);
      const dig = Math.abs(v) < 10 && v % 1 ? 1 : a.device_class === 'temperature' ? 1 : 0;
      return `${fmt(v, dig)}${a.unit_of_measurement ? (a.unit_of_measurement === '°C' || a.unit_of_measurement === '°F' ? '°' : ` ${a.unit_of_measurement}`) : ''}`;
    }
    if (d === 'binary_sensor') return tf(`bs_${a.device_class || 'default'}_${isOn(st) ? 'on' : 'off'}`, t(isOn(st) ? 'on' : 'off'));
    if (d === 'lock') return tf(`lock_${st.state}`, st.state);
    if (PRESS_DOMAINS.includes(d)) return isTime(st.state) ? relTime(st.state) : d === 'script' && isOn(st) ? t('running') : '';
    if (['on', 'off'].includes(st.state)) return t(st.state);
    return this._hass.formatEntityState ? this._hass.formatEntityState(st) : String(st.state);
  }

  /* Tooltip above the element – or with side to the right of it (layer bar) */
  _showTip(el, name, value, side) {
    if (this._m || !this._tip) return;
    const tp = this._tip, sr = this._stage.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (tp.classList.contains('side') !== !!side && !tp.classList.contains('show')) {
      tp.style.transition = 'none'; tp.classList.toggle('side', !!side); void tp.offsetWidth; tp.style.transition = '';
    } else tp.classList.toggle('side', !!side);
    tp.innerHTML = `${esc(name)}${value ? `<small>${esc(value)}</small>` : ''}`;
    tp.style.left = `${(side ? r.right : r.left + r.width / 2) - sr.left}px`;
    tp.style.top = `${(side ? r.top + r.height / 2 : r.top) - sr.top}px`;
    tp.classList.add('show');
  }
  _hideTip() { this._tip?.classList.remove('show'); }

  _toast(text) {
    const tt = this.$('.toast'), r = this.getBoundingClientRect();
    if (!tt) return;
    tt.style.left = `${Math.max(0, r.left) + (Math.min(window.innerWidth, r.right) - Math.max(0, r.left)) / 2}px`;
    tt.textContent = text;
    tt.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => tt.classList.remove('show'), 2800);
  }

  /* ---------------------------------------------------------------- Layers */
  _setTab(tab) {
    if (tab === this._tab) return;
    this._tab = tab;
    this._save();
    this._closeMenu();
    this._hideTip();
    this._applyTab(true);
  }

  _applyTab(animate) {
    const L = this._layer();
    this._root.dataset.tab = L.id;
    this._root.dataset.type = L.type;
    this._root.dataset.glow = L.kinds.has('light') ? 'full' : 'dim';
    this.shadowRoot.querySelectorAll('.tabs button').forEach((b) => { const a = b.dataset.tab === L.id; b.classList.toggle('act', a); b.setAttribute('aria-selected', a); });
    for (const [eid, el] of Object.entries(this._mk)) {
      const show = eid === '__door' ? L.kinds.has('door') : inLayer(L, this._M.ents.find((e) => e.entity === eid));
      el.classList.toggle('hid', !show);
      el.tabIndex = show ? 0 : -1;
    }
    for (const [k, el] of Object.entries(this._roomEls)) el.classList.toggle('idle', L.type !== 'vacuum' && !this._roomHas(k, L));
    this._placeKnob(!animate);
    this._gapKind = null;
    this._depSync();
    this._tmSync();
    this._depInert(VIEW_TYPES.includes(L.type));
    this._depShow();
    if (this._hass) { this._renderGap(); this._updClean(); this._updRobot(); this._updAmbient(); this._updRooms(); }
    this._declutter();
  }

  _placeKnob(instant) {
    const b = this.shadowRoot.querySelector(`.tabs button[data-tab="${CSS.escape(this._tab || '')}"]`), k = this.$('.tabs .knob');
    if (!b || !k) return;
    if (instant) k.style.transition = 'none';
    if (k.parentElement.classList.contains('h')) { k.style.height = ''; k.style.width = `${b.offsetWidth}px`; k.style.transform = `translateX(${b.offsetLeft}px)`; }
    else { k.style.width = ''; k.style.height = `${b.offsetHeight}px`; k.style.transform = `translateY(${b.offsetTop}px)`; }
    if (instant) { void k.offsetWidth; k.style.transition = ''; }
  }

  /* ---------------------------------------------------------------- Updates */
  _update(force) {
    const h = this._hass;
    if (!h || !this._built || !this._root) return;
    const changed = force || this._watch.some((id) => h.states[id] !== this._last[id]);
    if (!changed) return;
    if (this._openSig() !== this._opSig) { this._rebuild(); return; }
    this._watch.forEach((id) => { this._last[id] = h.states[id]; });
    this._useLang();
    this._updLights();
    this._updMarkers();
    this._updRooms();
    this._updAmbient();
    this._renderGap();
    this._updSide();
    this._updClean();
    this._updRobot();
    this._upd.forEach((f) => f());
    this._depShow();
    if (!this._decl) { this._decl = true; requestAnimationFrame(() => this._declutter()); }
  }

  _updLights() {
    const sr = this.shadowRoot;
    for (const l of this._M.ents) {
      if (l.kind !== 'light') continue;
      const st = this._st(l.entity);
      const on = isOn(st), b = on ? briPct(st) : 0, rgb = lightRgb(l, st), dim = dimmable(st);
      if (this._mk[l.entity]) this._updLampEl(l, this._mk[l.entity]);
      const o = (0.5 + 0.5 * (dim ? b / 100 : 1)).toFixed(2);
      for (const g of sr.querySelectorAll(`.rgl i[data-e="${CSS.escape(l.entity)}"], .glows i[data-e="${CSS.escape(l.entity)}"]`)) {
        g.style.setProperty('--c', rgb.join(','));
        g.style.setProperty('--o', o);
        g.classList.toggle('on', on);
      }
    }
    this._shown = true;
  }
  /* a lamp's glass button: in its colour when on, the ring shows the brightness */
  _updLampEl(l, el) {
    const st = this._st(l.entity), on = isOn(st), b = on ? briPct(st) : 0, rgb = lightRgb(l, st), dim = dimmable(st);
    const wasOn = el.classList.contains('on');
    el.classList.toggle('on', on);
    el.classList.toggle('na', unavailable(st));
    el.classList.toggle('dk', on && lum(rgb) < 0.5);
    el.style.setProperty('--c', rgb.join(','));
    el.style.setProperty('--cl', lighten(rgb, 0.42).join(','));
    const c = el.querySelector('.ring circle');
    c.setAttribute('stroke-dasharray', on && dim ? `${b} 100` : '0 100');
    c.style.opacity = on && dim ? '1' : '0';
    el.setAttribute('aria-pressed', on);
    if (on && !wasOn && this._shown) this._ignite(el);
  }

  /* media, door, climate, covers and other devices on the plan */
  _updMarkers() {
    const sr = this.shadowRoot, h = this._hass;
    for (const e of this._M.ents) {
      const el = this._mk[e.entity];
      if (e.kind === 'media') {
        const st = h.states[e.entity], playing = st?.state === 'playing', active = this._mediaOn(st);
        if (el) {
          el.classList.toggle('on', playing || st?.state === 'paused');
          el.style.setProperty('--c', '150,185,255');
          el.style.setProperty('--cl', '220,232,255');
          el.classList.toggle('na', unavailable(st));
        }
        for (const g of sr.querySelectorAll(`[data-tvglow][data-e="${CSS.escape(e.entity)}"]`)) { g.classList.toggle('on', active); g.style.setProperty('--o', playing ? '0.9' : '0.5'); }
        sr.querySelector(`.room[data-room="${CSS.escape(e.room || '')}"] .fu.tv`)?.classList.toggle('on', active);
        continue;
      }
      if (!el) { if (e.kind === 'cover') this._updCoverWindows(e); continue; }
      this._updDevEl(e, el);
    }
    this._updOpenings();
    // front door: shows as opened for a minute
    const door = this._mk.__door, M = this._M;
    if (M.door) {
      const ds = h.states[M.door.open];
      const age = ds && isTime(ds.state) ? Date.now() - new Date(ds.state).getTime() : Infinity;
      const open = (age >= 0 && age < 60000) || (domainOf(M.door.open) === 'lock' && ['unlocked', 'open', 'opening'].includes(ds?.state));
      if (door) {
        door.classList.toggle('open', open);
        door.style.setProperty('--c', open ? '48,209,88' : '255,255,255');
        const ic = door.querySelector('.ic');
        if (ic && ic.dataset.o !== String(open)) { ic.outerHTML = icon(open ? 'doorOpen' : 'door'); door.querySelector('.ic').dataset.o = String(open); }
      }
      sr.querySelector('.win.fd')?.classList.toggle('open', open);
      clearTimeout(this._doorT);
      if (open && age < 60000) this._doorT = setTimeout(() => this._update(true), 60000 - age + 250);
    }
  }

  /* a device's glass button (not a lamp): a reading for thermostats and sensors, position for covers, on / off for the rest */
  _updDevEl(e, el) {
    if (e.kind === 'media') {
      const st = this._hass.states[e.entity];
      el.classList.toggle('on', st?.state === 'playing' || st?.state === 'paused');
      el.style.setProperty('--c', '150,185,255');
      el.style.setProperty('--cl', '220,232,255');
      el.classList.toggle('na', unavailable(st));
    } else if (e.kind === 'climate' && el.classList.contains('val')) this._updClimMarker(e, el);
    else if (e.kind === 'cover') this._updCoverMarker(e, el);
    else this._updOtherMarker(e, el);
  }

  /* 'tv' | 'speaker' | null – from the device class, else from the name (an Apple TV has no device class) */
  _mediaKind(id) {
    const st = this._hass.states[id], dc = st?.attributes?.device_class;
    if (dc === 'tv') return 'tv';
    if (dc === 'speaker' || dc === 'receiver') return 'speaker';
    const dev = this._hass.devices?.[this._hass.entities?.[id]?.device_id];
    const txt = `${id} ${st?.attributes?.friendly_name || ''} ${dev?.model || ''}`.toLowerCase();
    if (/(^|[^a-z])tv([^a-z]|$)|television|fernseh|oled|bravia|webos|chromecast|fire ?tv|roku|shield/.test(txt)) return 'tv';
    if (/speaker|lautsprecher|sonos|homepod|echo|nest (audio|mini)|receiver|soundbar|avr/.test(txt)) return 'speaker';
    return null;
  }
  _mediaOn(st) { return !!st && ['playing', 'paused', 'on', 'idle', 'buffering'].includes(st.state); }
  _mediaLabel(st) {
    if (unavailable(st)) return t('offline');
    return { playing: t('playing'), paused: t('paused'), idle: t('ready'), on: t('on'), off: t('off'), standby: t('standby'), buffering: t('playing') }[st.state] || st.state;
  }

  _updOtherMarker(e, el) {
    const st = this._st(e.entity), d = domainOf(e.entity), a = st?.attributes || {};
    let on = false, c = [255, 214, 150];
    if (TOGGLE_DOMAINS.includes(d)) { on = isOn(st); c = d === 'fan' ? [120, 220, 255] : d === 'humidifier' ? [110, 200, 255] : [255, 214, 120]; }
    else if (d === 'binary_sensor') { on = isOn(st); c = ['motion', 'occupancy', 'presence'].includes(a.device_class) ? [120, 200, 255] : [255, 170, 70]; }
    else if (d === 'lock') { on = ['unlocked', 'open', 'opening', 'jammed'].includes(st?.state); c = st?.state === 'jammed' ? [255, 90, 70] : [255, 170, 70]; }
    else if (d === 'alarm_control_panel') { on = String(st?.state).startsWith('armed') || st?.state === 'triggered'; c = st?.state === 'triggered' ? [255, 80, 60] : [48, 209, 88]; }
    else if (d === 'script') { on = isOn(st); c = [120, 200, 255]; }
    el.classList.toggle('on', on);
    el.classList.toggle('na', unavailable(st));
    el.classList.toggle('dk', on && lum(c) < 0.55);
    el.style.setProperty('--c', c.join(','));
    el.style.setProperty('--cl', lighten(c, 0.5).join(','));
    if (!e.icon) {
      const ic = this._autoIcon(e.entity, st);
      if (el.dataset.ic !== ic) { el.dataset.ic = ic; el.querySelector('.ic')?.remove(); el.insertAdjacentHTML('beforeend', icon(ic)); }
    }
  }

  _updRooms() {
    const L = this._layer();
    for (const [k, el] of Object.entries(this._roomEls)) {
      const ls = this._M.ents.filter((e) => e.kind === 'light' && e.room === k && e.at);
      const onL = ls.filter((l) => isOn(this._st(l.entity)));
      el.classList.toggle('lit', onL.length > 0);
      if (onL.length) {
        const c = onL.map((l) => lightRgb(l, this._st(l.entity))).reduce((a, c2) => a.map((v, i) => v + c2[i] / onL.length), [0, 0, 0]).map(Math.round);
        el.style.setProperty('--lc', c.join(','));
      }
      const tc = this._roomClimate(k);
      el.classList.toggle('tt', tc.t != null);
      if (tc.t != null) el.style.setProperty('--tc', tempRgb(tc.t).join(','));
      let s = '';
      if (L.type === 'vacuum') s = this._roomCleanLabel(k);
      else if (L.type === 'climate') s = [tc.t != null ? `${fmt(tc.t, 1)}°` : '', tc.h != null ? `${Math.round(tc.h)} %` : ''].filter(Boolean).join(' · ');
      else if (L.type === 'cover') s = this._roomCoverLabel(k, L);
      else if (L.type === 'light') {
        const lit = this._roomEnts(k, L, 'light');
        if (lit.length) s = onL.length ? t('nOn', onL.length) : t('off');
      } else if (!VIEW_TYPES.includes(L.type)) s = this._roomCustomLabel(k, L);
      el.querySelector('.rl span').textContent = s;
    }
  }

  _updAmbient() {
    const h = this._hass;
    let w = 0;
    for (const l of this._M.ents) {
      if (l.kind !== 'light') continue;
      const st = this._st(l.entity);
      if (isOn(st)) w += 0.22 + 0.2 * (dimmable(st) ? briPct(st) / 100 : 1);
    }
    const sun = h.states['sun.sun'];
    const el = sun?.attributes?.elevation ?? (sun?.state === 'above_horizon' ? 20 : -20);
    const day = clamp((el + 4) / 16, 0, 1);
    this._root.style.setProperty('--warm', clamp(w, 0, 1).toFixed(2));
    this._root.style.setProperty('--day', day.toFixed(2));
    // daylight colour: low sun warm, otherwise cool white; clouds dampen
    const clouds = { cloudy: 0.55, rainy: 0.6, pouring: 0.7, fog: 0.65, 'lightning-rainy': 0.7, snowy: 0.5, 'snowy-rainy': 0.6, partlycloudy: 0.25 }[h.states[this._M.weather]?.state] ?? 0.1;
    const warmSun = clamp(1 - (el - 2) / 14, 0, 1);
    this._root.style.setProperty('--dlc', lerp3([226, 236, 255], [255, 196, 140], warmSun).map(Math.round).join(','));
    this._root.style.setProperty('--dli', (day * (1 - clouds * 0.6)).toFixed(2));
    if (!this._gcard) return;
    const L = this._layer(), lit = this._M.ents.some((l) => l.kind === 'light' && isOn(this._st(l.entity)));
    const tint = L.type === 'vacuum' || VIEW_TYPES.includes(L.type) ? ['30, 52, 92', '20, 30, 58']
      : L.type === 'climate' ? this._climTint()
        : L.type === 'cover' ? ['44, 54, 72', '28, 32, 44']
          : lit && L.kinds.has('light') ? ['112, 72, 54', '92, 52, 36'] : ['46, 46, 54', '30, 30, 36'];
    this._gcard.style.setProperty('--g1', tint[0]);
    this._gcard.style.setProperty('--g2', tint[1]);
  }

  /* ---------------------------------------------------------------- Layer card */
  _renderGap() {
    if (!this._gcard) return;
    const L = this._layer(), kind = `${L.id}`;
    if (this._gapKind !== kind) {
      this._gapKind = kind;
      this._gapUpd = [];
      this._gcard.innerHTML = '';
      const v = L.type === 'vacuum' ? this._cleanGap(this._gapUpd) : L.type === 'climate' ? this._climateGap(L, this._gapUpd)
        : L.type === 'cover' ? this._coverGap(L, this._gapUpd) : L.type === 'light' ? this._lightGap(L, this._gapUpd)
          : VIEW_TYPES.includes(L.type) ? this._depGap() : this._customGap(L, this._gapUpd);
      this._gcard.append(v);
    }
    this._gapUpd.forEach((f) => f());
    this._fitGcard();
    // round buttons (small, mini – or too little room for the words): the words as tooltip
    if (this._gcard.matches('.cmp, .fi')) for (const b of this._gcard.querySelectorAll('.gbtn')) { const s = b.textContent.trim(); if (b.title !== s) { b.title = s; b.setAttribute('aria-label', s); } }
  }
  /* The layer card keeps what it shows legible in the room it really has: what does not fit goes, step by step –
   * normal: the subtitle, then the strip, then the heading; small: the strip, then the heading; mini: the heading.
   * Buttons too narrow for their words show only their icon. */
  _fitGcard() {
    const g = this._gcard, v = g?.firstElementChild;
    if (!v || !g.clientHeight) return;
    g.classList.remove('f1', 'f2', 'f3', 'fi');
    for (const c of ['f1', 'f2', 'f3']) { if (v.scrollHeight <= v.clientHeight + 1) break; g.classList.add(c); }
    if ([...g.querySelectorAll('.gbtn > span')].some((s) => s.scrollWidth > s.clientWidth + 1)) g.classList.add('fi');
  }

  _lightGap(L, upd) {
    const lights = this._ents(L, 'light');
    const v = mk('div', 'gv', `<div class="gk"><span>${esc(this._layerName(L))}</span></div>
      <div class="gt"><b></b><span class="w"></span></div>
      <div class="segs">${lights.map((l) => `<i data-e="${esc(l.entity)}"></i>`).join('')}</div>
      <div class="gbtns"><button class="gbtn glass modes" aria-haspopup="menu">${icon('sparkle')}<span>${esc(t('modes'))}</span>${icon('chevU', 'sm')}</button><button class="gbtn white off">${icon('power')}<span>${esc(t('allOff'))}</span></button></div>`);
    const modes = v.querySelector('.modes');
    modes.addEventListener('click', () => (this._menuAnchor === modes && this._menu.classList.contains('open') ? this._closeMenu() : this._openModes(modes)));
    v.querySelector('.off').addEventListener('click', () => this._allOff(lights.map((l) => l.entity)));
    upd.push(() => {
      const on = lights.filter((l) => isOn(this._st(l.entity)));
      v.querySelector('.gt b').textContent = on.length ? t('lightsOn', on.length) : t('allOffState');
      const p = this._lightPower(lights);
      v.querySelector('.gt .w').textContent = on.length && p.w ? `${p.est ? '≈ ' : ''}${fmt(p.w, p.w < 10 ? 1 : 0)} W` : '';
      for (const l of lights) {
        const seg = v.querySelector(`.segs i[data-e="${CSS.escape(l.entity)}"]`), st = this._st(l.entity);
        seg.classList.toggle('on', isOn(st));
        seg.style.setProperty('--c', lightRgb(l, st).join(','));
      }
      v.querySelector('.off').disabled = !on.length;
    });
    return v;
  }

  /* power: measured where sensors exist, otherwise rated power × brightness */
  _lightPower(lights) {
    let w = 0, est = false;
    for (const l of lights) {
      const st = this._st(l.entity);
      if (!isOn(st)) continue;
      const m = l.power ? num(this._hass.states[l.power]) : null;
      if (m != null) w += m;
      else if (l.watt) { w += l.watt * (dimmable(st) ? Math.max(0.12, briPct(st) / 100) : 1); est = true; }
    }
    return { w, est };
  }

  /* switches off everything switchable in the list (lights, switches, fans …) */
  _allOff(eids) {
    const on = eids.filter((id) => isOn(this._st(id)));
    if (!on.length) return;
    for (const id of on) this._optimistic[id] = { on: false, until: Date.now() + 2500 };
    this._kickOptimistic();
    const lights = on.filter((id) => domainOf(id) === 'light'), rest = on.filter((id) => domainOf(id) !== 'light');
    Promise.all([
      lights.length ? this._call('light', 'turn_off', { entity_id: lights }) : null,
      rest.length ? this._call('homeassistant', 'turn_off', { entity_id: rest }) : null,
    ]).then(() => this._toast(t('switchedOff', on.length, lights.length === on.length))).catch(() => { this._optimistic = {}; this._update(true); });
  }

  /* ---------------------------------------------------------------- Info tiles: outside, inside, front door */
  _buildSide() {
    const S = this._stage, W = this._M.widgets, G = this._G;
    this._sideUpd = [];
    const sideTiles = W.side?.tiles || [];
    // (data-w names the tile for the floor plan editor)
    const add = (cls, rect, html, k) => {
      const el = mk('div', `card ${cls}`, html);
      el.dataset.w = k;
      if (rect) { el.setAttribute('style', G.tile(rect)); S.insertBefore(el, this._tip); }
      else this._sideEl.insertBefore(el, this._sideEl.querySelector('.gcard'));
      return el;
    };
    if (W.weather || sideTiles.includes('weather')) {
      const wx = add('wx tap', W.weather, `<div class="k"><span>${esc(t('outside'))}</span><span class="wi"></span></div><div class="bot-row"><div class="v"></div><div class="s"></div></div>`, 'weather');
      wx.setAttribute('role', 'button');
      wx.setAttribute('aria-label', t('weatherForecast'));
      wx.tabIndex = 0;
      this._press(wx, () => this._openWeather(wx));
    }
    if (W.indoor || sideTiles.includes('indoor')) add('in', W.indoor, `<div class="k"><span class="lbl">${esc(t('inside'))}</span>${icon('thermo')}</div><div class="bot-row"><div class="v"></div><div class="s"></div></div>`, 'indoor');
    if (W.door || sideTiles.includes('door')) {
      const dr = add('dr', W.door, `<div class="k"><span>${esc(this._M.door.name || t('frontDoor'))}</span><span class="when"></span></div><div class="dslot"></div>`, 'door');
      if (this._M.door.open) dr.querySelector('.dslot').append(this._doorSlide(this._sideUpd, dr.querySelector('.when')));
      else this._sideUpd.push(() => { dr.querySelector('.when').textContent = this._bellText(); });
    }
    this._haCards = [];
    for (const x of this._M.tiles) {
      if (!W[x.id] && !sideTiles.includes(x.id)) continue;
      const el = add(`ct${x.card ? ' hc' : x.btns ? ' bt' : ''}${tileBig(x) ? ' big' : ''}`, W[x.id], x.card ? '<div class="hcw"></div>' : '', x.id);
      el.style.setProperty('--h', x.size[1]);
      if (x.card) this._haCard(x.card, el.querySelector('.hcw'));
      else if (x.btns) this._btnTile(x, el);
      else this._ownTile(x, el);
    }
    if (this._m && this._sideEl) {
      // phone: the tiles under the plan in rows of up to three, Home Assistant cards across the whole width
      const big = this._M.tiles.filter((x) => sideTiles.includes(x.id) && tileBig(x));
      const n = sideTiles.length - big.length, cols = n <= 3 ? Math.max(1, n) : n === 4 ? 2 : 3;
      this._sideEl.style.setProperty('--mc', cols);
      this._sideRows = Math.ceil(n / cols) + big.reduce((a, x) => a + x.size[1], 0);
    }
  }

  /* An own tile: the first value large, the others below; tap → its tap_action, else the info dialog of the first value */
  _ownTile(x, el) {
    const first = x.ents[0]?.entity || null;
    const name = x.name ?? (first ? this._nameOf(first) : t('tile'));
    el.innerHTML = `<div class="k"><span class="lbl">${esc(name)}</span><span class="ti"></span></div><div class="bot-row"><div class="v"></div><div class="s"></div></div>`;
    const ti = el.querySelector('.ti'), v = el.querySelector('.v'), sub = el.querySelector('.s');
    if (first || x.tap) {
      el.classList.add('tap');
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', name);
      el.tabIndex = 0;
      const ctx = (own) => ({ entity: first, el, name, own });
      this._press(el, () => this._act(x.tap, ctx(() => first && this._openDevice(first, el, true))),
        () => this._act(x.hold, ctx(() => first && this._openDevice(first, el))), x.dbl && (() => this._act(x.dbl, ctx())));
    }
    this._sideUpd.push(() => {
      const st = first && this._st(first), ic = x.icon || (first ? this._autoIcon(first, st) : 'widget');
      if (ti.dataset.ic !== ic) { ti.dataset.ic = ic; ti.innerHTML = this._iconHtml(ic); }
      el.classList.toggle('on', !!st && (isOn(st) || ['open', 'playing', 'unlocked', 'heat', 'cool', 'heat_cool', 'cleaning'].includes(st.state)));
      el.classList.toggle('na', !!first && unavailable(st));
      // a number with its unit in smaller type
      const val = first ? this._valueText({ entity: first, kind: kindOf(first, st) }) : '–', m = /^(-?[\d.,]+)(\s?)(.*)$/.exec(val);
      v.innerHTML = m && m[3] && m[3] !== '°' ? `${esc(m[1])}<small>${m[2]}${esc(m[3])}</small>` : esc(val || '–');
      const more = x.ents.slice(1).map((e) => `${e.name || this._shortName(e.entity)} ${this._valueText({ entity: e.entity, kind: kindOf(e.entity, this._st(e.entity)) })}`.trim());
      sub.textContent = more.length ? more.join(' · ') : x.ents[0]?.name || (first && x.name != null && this._nameOf(first) !== x.name ? this._nameOf(first) : '');
    });
  }

  /* An own tile with buttons: the glass buttons of the plan in a grid, as many as the tile's size allows. Each switches its
   * device like on the plan or runs its own action (navigate …); holding opens the device. */
  _btnTile(x, el) {
    const bs = x.btns.slice(0, tileBtnCap(x.size)), cols = Math.max(1, Math.min(bs.length, 3 * x.size[0]));
    el.style.setProperty('--bc', cols);
    el.style.setProperty('--br', Math.max(1, Math.ceil(bs.length / cols)));
    el.innerHTML = `${x.name ? `<div class="k"><span class="lbl">${esc(x.name)}</span>${x.icon ? `<span class="ti">${this._iconHtml(x.icon)}</span>` : ''}</div>` : ''}<div class="bgrid"></div>`;
    const grid = el.querySelector('.bgrid');
    if (!bs.length) { grid.outerHTML = `<div class="hph">${icon('press')}<span>${esc(t('noButtons'))}</span></div>`; return; }
    const items = bs.map((b) => {
      // a device that is on the plan as well keeps its icon and colour temperature from there
      const pe = b.entity && this._M.ents.find((e) => e.entity === b.entity);
      const e = b.entity ? { ...(pe || {}), entity: b.entity, kind: pe?.kind || kindOf(b.entity, this._hass?.states?.[b.entity]), icon: b.icon || pe?.icon || null } : null;
      const name = b.name || (b.entity ? this._shortName(b.entity) : t('button'));
      const btn = mk('button', 'tbtn', `${e ? this._markerHtml(e, true) : `<span class="dev oth tk"><i class="rip"></i><i class="halo"></i><i class="disc"></i>${this._iconHtml(b.icon || 'press')}</span>`}<span class="tbl">${esc(name)}</span>`);
      btn.setAttribute('aria-label', name);
      const knob = btn.firstElementChild, ctx = (own) => ({ entity: b.entity, el: knob, name, own });
      this._press(btn, () => this._act(b.tap, ctx(() => this._tileBtnOwn(b.entity, knob))),
        () => { this._hideTip(); this._act(b.hold, ctx(() => b.entity && this._openDevice(b.entity, knob))); }, b.dbl && (() => this._act(b.dbl, ctx())));
      if (e) {
        btn.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') this._showTip(knob, name, this._valueText(e)); });
        btn.addEventListener('pointerleave', () => this._hideTip());
      }
      grid.append(btn);
      return { e, knob };
    });
    this._sideUpd.push(() => { for (const { e, knob } of items) if (e) { if (e.kind === 'light') this._updLampEl(e, knob); else this._updDevEl(e, knob); } });
  }
  /* a tile's button without an action of its own: switches what can be switched, else shows the device's info */
  _tileBtnOwn(eid, el) {
    if (!eid) return;
    const d = domainOf(eid);
    this._hideTip();
    if (TOGGLE_DOMAINS.includes(d) || PRESS_DOMAINS.includes(d) || d === 'cover') this._toggleAny(eid, el);
    else this._openDevice(eid, el, true);
  }

  /* A Home Assistant card in a glass frame (the card itself stays as it is, only its background goes) */
  _haCard(cfg, box) {
    const ph = () => { box.innerHTML = `<div class="hph">${icon('widget')}<b>${esc(String(cfg.type).replace(/^custom:/, ''))}</b><span>${esc(t('haCardHint'))}</span></div>`; };
    if (!window.loadCardHelpers) { ph(); return; }
    const make = () => window.loadCardHelpers().then((h) => h.createCardElement(cfg)).then((c) => {
      if (box.getRootNode() !== this.shadowRoot) return;
      c.hass = this._hass;
      // a custom card that loads later replaces its error card
      c.addEventListener('ll-rebuild', (ev) => { ev.stopPropagation(); this._haCards = this._haCards.filter((x) => x !== c); make(); }, { once: true });
      box.replaceChildren(c);
      this._haCards.push(c);
    }).catch(ph);
    make();
  }

  _tick() {
    if (this._hass && this._root) this._updSide();
    // departures count down
    if (this._hass && this._root) this._depShow();
  }

  _wxIcon(cond, hour) {
    const night = hour == null ? (this._hass?.states['sun.sun']?.attributes?.elevation ?? 0) < -2 : hour < 7 || hour >= 19;
    const ic = WX_ICON[cond] || 'cloud';
    return ic === 'sun' && night ? 'moon' : ic === 'partly' && night ? 'partlyNight' : ic;
  }

  /* average indoor temperature / humidity of the given entities */
  _climateOf(eids) {
    const h = this._hass, ts = [], hs = [];
    for (const id of eids) {
      const st = h.states[id];
      if (unavailable(st) && domainOf(id) !== 'climate') continue;
      const a = st?.attributes || {}, d = domainOf(id);
      if (d === 'climate' || d === 'humidifier' || d === 'water_heater') {
        if (Number.isFinite(+a.current_temperature) && a.current_temperature !== null) ts.push(+a.current_temperature);
        if (Number.isFinite(+a.current_humidity) && a.current_humidity !== null) hs.push(+a.current_humidity);
      } else if (a.device_class === 'temperature') { const v = num(st); if (v != null) ts.push(v); }
      else if (a.device_class === 'humidity') { const v = num(st); if (v != null) hs.push(v); }
    }
    return { t: avg(ts), h: avg(hs), n: ts.length };
  }
  _roomClimate(k) { return this._climateOf(this._M.ents.filter((e) => e.room === k && e.kind === 'climate').map((e) => e.entity)); }

  _updSide() {
    const h = this._hass, S = this.shadowRoot, M = this._M;
    if (!h || !this._stage) return;
    const wx = S.querySelector('.card.wx'), w = h.states[M.weather];
    if (wx && w) {
      const ic = this._wxIcon(w.state), wi = wx.querySelector('.wi');
      if (wi.dataset.ic !== ic) { wi.dataset.ic = ic; wi.innerHTML = icon(ic); }
      wx.querySelector('.v').textContent = w.attributes.temperature != null ? `${Math.round(w.attributes.temperature)}°` : '–';
      const d = this._fc.daily?.[0];
      const hl = d && d.temperature != null ? ` · ${d.templow != null ? `${Math.round(d.templow)}° / ` : ''}${Math.round(d.temperature)}°` : '';
      wx.querySelector('.s').textContent = `${tf(`wx_${w.state}`, w.state)}${hl}`;
    }
    const inn = S.querySelector('.card.in');
    if (inn) {
      const c = this._climateOf(M.indoor);
      inn.querySelector('.lbl').textContent = c.n > 1 ? t('insideAvg') : t('inside');
      inn.querySelector('.v').textContent = c.t != null ? `${fmt(c.t, 1)}°` : '–';
      inn.querySelector('.s').textContent = c.h != null ? t('humidityPct', Math.round(c.h)) : t('noReadings');
    }
    this._sideUpd?.forEach((f) => f());
    if (this._popKind === 'weather') this._upd.forEach((f) => f());
  }

  /* weather forecast (daily for low/high, hourly for the strip) */
  _subscribeForecast() {
    const h = this._hass;
    if (!h?.connection?.subscribeMessage || this._fcSub || !this.isConnected || !this._M?.weather) return;
    const st = h.states[this._M.weather];
    if (!st) return;
    const feat = st.attributes.supported_features || 0;
    this._fcSub = [];
    const sub = (type) => h.connection.subscribeMessage((msg) => { this._fc[type] = msg?.forecast || []; this._updSide(); },
      { type: 'weather/subscribe_forecast', forecast_type: type, entity_id: this._M.weather })
      .then((un) => { if (this._fcSub) this._fcSub.push(un); else Promise.resolve(un()).catch(() => {}); })
      .catch(() => {});
    if (feat & 1) sub('daily');
    if (feat & 2) sub('hourly');
  }
  _unsubscribeForecast() {
    // (unsubscribing answers with a promise – it fails when Home Assistant ended the subscription already)
    (this._fcSub || []).forEach((un) => { try { Promise.resolve(un()).catch(() => {}); } catch (e) { /* never mind */ } });
    this._fcSub = null;
  }
}
const WX_ICON = {
  'clear-night': 'moon', cloudy: 'cloud', fog: 'fog', hail: 'rain', lightning: 'bolt', 'lightning-rainy': 'bolt', partlycloudy: 'partly', pouring: 'rain',
  rainy: 'rain', snowy: 'snow', 'snowy-rainy': 'snow', sunny: 'sun', windy: 'wind', 'windy-variant': 'wind', exceptional: 'bolt',
};
