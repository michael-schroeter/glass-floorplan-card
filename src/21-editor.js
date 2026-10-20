/* ================================================================== Floor plan editor (full screen)
 * The canvas shows the real card, live, on a screen of the real size (laptop or phone) – what you see is what you get.
 * Invisible handles lie on top: rooms as rectangles (snap to each other), furniture from a palette, windows / passages /
 * the front door by clicking a wall, devices dragged from a list of Home Assistant entities onto the plan. Tapping a
 * lamp opens its settings instead of switching it. Everything is stored in the card configuration. */
const ED_GRID = 5;
const ED_TOOLS = [
  ['sketch', 'image'], ['rooms', 'plan'], ['furniture', 'sofa'], ['openings', 'window'], ['devices', 'bulb'], null, ['layers', 'layers'], ['tiles', 'widget'], ['settings', 'sliders'],
];
const OPEN_KINDS = { window: { key: 'windows', len: 100 }, door: { key: 'doors', len: 80 }, entrance: { key: 'entrance', len: 90 } };
const NO_DEVICE_DOMAINS = ['sun', 'zone', 'person', 'update', 'tts', 'stt', 'conversation', 'todo', 'weather', 'tag', 'device_tracker', 'image', 'notify', 'ai_task', 'wake_word', 'assist_satellite', 'calendar', 'event', 'persistent_notification', 'group', 'counter', 'timer', 'schedule', 'input_text', 'input_datetime', 'date', 'time', 'datetime', 'text'];
const LAYER_FILTER = {
  light: (d) => d === 'light' || d === 'media_player',
  climate: (d, dc) => ['climate', 'water_heater', 'humidifier'].includes(d) || (d === 'sensor' && ['temperature', 'humidity'].includes(dc)),
  cover: (d) => d === 'cover',
  vacuum: (d) => d === 'vacuum',
  custom: (d) => !NO_DEVICE_DOMAINS.includes(d),
};
/* the screen of a phone in the Home Assistant app (below the header) */
const ED_PHONE = { w: 390, h: 788 };
/* tools that show the template picture (and keep it inside the visible plan) */
const ED_UL_TOOLS = ['sketch', 'rooms', 'furniture', 'openings'];
const r0 = (v) => Math.round(v);
const deep = (o) => JSON.parse(JSON.stringify(o ?? null));

class GfcEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._undo = [];
    this._redo = [];
    this._tool = 'rooms';
    this._s = null;
    this._openKind = 'window';
    this._layerSel = 'light';
    this._q = '';
    this._f = null;
    this._light = 'on';
    this._groupBy = 'area';
    this._collapsed = new Set();
    this._scrollMem = {};
  }

  /* ---------------------------------------------------------------- open / close */
  open({ config, hass, onSave, onClose, viewport } = {}) {
    this._hs = typeof hass === 'function' ? hass : () => hass;
    this._onSave = onSave;
    this._onClose = onClose;
    this._vp = viewport || null;
    this._c = normEditorConfig(deep(config) || {});
    this._orig = JSON.stringify(this._c);
    this._useLang();
    // nothing drawn yet: start with the template, empty
    this._tool = this._c.rooms.length ? 'rooms' : 'sketch';
    this._mode = window.innerWidth < 700 ? 'phone' : 'laptop';
    this._loadUnderlay();
    this._loadLabels();
    this._shell();
    if (!this.isConnected) document.body.append(this);
    this._dlg.showModal();
    this._cv.focus({ preventScroll: true });
    requestAnimationFrame(() => { this._fit(); this._draw(); this._panel(); requestAnimationFrame(() => { if (!this._viewTouched) { this._fit(); this._draw(); } }); });
  }

  _useLang() {
    const h = this._hs?.(), c = this._c?.language;
    const l = c && c !== 'auto' ? c : h?.locale?.language || h?.language || navigator.language || 'en';
    LANG = String(l).toLowerCase().startsWith('de') ? 'de' : 'en';
    LOCALE = h?.locale?.language || h?.language || (LANG === 'de' ? 'de-DE' : 'en');
  }

  /* Home Assistant labels (to sort devices by label) */
  _loadLabels() {
    const h = this._hs?.();
    if (this._labelsP || !h?.callWS) return;
    this._labelsP = h.callWS({ type: 'config/label_registry/list' })
      .then((l) => { this._labels = l || []; if (this._tool === 'devices' && this._groupBy === 'label') this._panel(); })
      .catch(() => { this._labels = []; });
  }

  _close(save) {
    if (save) this._onSave?.(cleanConfig(this._c));
    this._dlg?.close();
    window.removeEventListener('keydown', this._onKey, true);
    clearInterval(this._liveT);
    this._onClose?.();
    this.remove();
  }

  _dirty() { return JSON.stringify(this._c) !== this._orig; }

  /* ---------------------------------------------------------------- shell */
  _shell() {
    this.shadowRoot.innerHTML = `<style>${STYLES}${EDITOR_STYLES}</style>
<dialog class="ed"><div class="root ew" style="${springVars()}">
  <svg class="defs" width="0" height="0" aria-hidden="true"><defs><linearGradient id="gfcg" gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="22"><stop offset="0" stop-color="#fbfbfd" stop-opacity=".94"/><stop offset=".55" stop-color="#d8dae1" stop-opacity=".8"/><stop offset="1" stop-color="#9ca1ad" stop-opacity=".7"/></linearGradient></defs></svg>
  <div class="etop">
    <h1>${esc(t('ed_title'))}<small></small></h1>
    <div class="eseg eview">${['laptop', 'phone'].map((m) => `<button data-m="${m}">${icon(m)}<span>${esc(t(`ed_prev_${m}`))}</span></button>`).join('')}</div>
    <i class="esep"></i>
    <button class="ebtn icon undo" title="${esc(t('ed_undo'))}">${icon('undo')}</button>
    <button class="ebtn icon redo" title="${esc(t('ed_redo'))}">${icon('redo')}</button>
    <i class="esep"></i>
    <button class="ebtn lbl cancel">${esc(t('ed_cancel'))}</button>
    <button class="ebtn white save">${icon('check')}<span>${esc(t('ed_done'))}</span></button>
  </div>
  <nav class="erail">${ED_TOOLS.map((x) => (x ? `<button data-tool="${x[0]}">${icon(x[1])}<span>${esc(t(`ed_tool_${x[0]}`))}</span></button>` : '<i class="rsep"></i>')).join('')}
    <button class="ereset" data-del="all">${icon('restart')}<span>${esc(t('ed_reset'))}</span></button></nav>
  <div class="ecv" tabindex="-1" autofocus><div class="eframe"><small></small></div><div class="elive"></div><img class="ul" alt="" hidden><div class="world"></div>
    <div class="elight eseg" title="${esc(t('ed_lightPreview'))}"><span class="lbl">${icon('bulb')}</span>${['on', 'off', 'real'].map((m) => `<button data-l="${m}">${esc(t(`ed_light_${m}`))}</button>`).join('')}</div>
    <div class="ezoom"><button class="zo" title="−">${icon('minus')}</button><button class="zf" title="${esc(t('ed_fit'))}">${icon('fit')}</button><button class="zi" title="+">${icon('plus')}</button></div>
    <div class="ehint"></div></div>
  <aside class="eins"></aside>
  <div class="econfirm" hidden></div>
  <div class="etoast"></div>
</div></dialog>`;
    const $ = (s) => this.shadowRoot.querySelector(s);
    this.$ = $;
    this._dlg = $('dialog');
    this._cv = $('.ecv');
    this._world = $('.world');
    this._ins = $('.eins');
    this._ulEl = $('.ul');
    this._liveEl = $('.elive');
    this._frameEl = $('.eframe');
    // the real card, live (it never gets pointer events – the handles on top do the work)
    this._card = document.createElement(CARD_TAG);
    this._liveEl.append(this._card);
    this._liveKey = null;
    // keys and clicks stay in the editor (Home Assistant's edit dialog must not react to them, e.g. close on Escape)
    for (const type of ['keydown', 'keyup', 'click', 'pointerdown', 'wheel']) this._dlg.addEventListener(type, (e) => e.stopPropagation());
    this._dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (!this.$('.econfirm').hidden) this._confirmClose();
      else if (this._s || this._editLayer) this._back();
      else this._tryClose();
    });
    $('.undo').addEventListener('click', () => this._doUndo());
    $('.redo').addEventListener('click', () => this._doRedo());
    $('.save').addEventListener('click', () => this._close(true));
    $('.cancel').addEventListener('click', () => this._tryClose());
    $('.ereset').addEventListener('click', () => this._askReset());
    this.shadowRoot.querySelectorAll('.eview button').forEach((b) => b.addEventListener('click', () => this._setMode(b.dataset.m)));
    this.shadowRoot.querySelectorAll('.elight button').forEach((b) => b.addEventListener('click', () => { this._light = b.dataset.l; this._draw(); }));
    $('.zi').addEventListener('click', () => this._zoomBy(1.25));
    $('.zo').addEventListener('click', () => this._zoomBy(0.8));
    $('.zf').addEventListener('click', () => { this._viewTouched = false; this._fit(); this._draw(); });
    this.shadowRoot.querySelectorAll('.erail button[data-tool]').forEach((b) => b.addEventListener('click', () => this._setTool(b.dataset.tool)));
    // delete buttons: show in red what would be deleted
    this.shadowRoot.addEventListener('pointerover', (e) => { const b = e.target.closest?.('[data-del]'); this._cv.classList.toggle('del-sel', b?.dataset.del === 'sel'); this._cv.classList.toggle('del-all', b?.dataset.del === 'all'); });
    this._wireCanvas();
    if (this._onKey) window.removeEventListener('keydown', this._onKey, true);
    this._ro?.disconnect();
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey, true);
    this._ro = new ResizeObserver(() => { if (!this._viewTouched) this._fit(); this._draw(); });
    this._ro.observe(this._cv);
    // new states from Home Assistant reach the live card
    clearInterval(this._liveT);
    this._liveT = setInterval(() => { if (!this.isConnected) { clearInterval(this._liveT); return; } const h = this._liveHass(this._hs()); if (this._card && h && this._card.hass !== h) this._card.hass = h; }, 500);
    this._syncTop();
  }

  _tryClose() {
    if (this._dirty() && !this._confirmClose) {
      this._confirmClose = true;
      this._toast(t('ed_unsaved'));
      setTimeout(() => { this._confirmClose = false; }, 3500);
      return;
    }
    this._close(false);
  }

  _toast(text) {
    const el = this.$('.etoast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._tT);
    this._tT = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* a small question in the editor's own glass (instead of the browser's confirm) */
  _confirm({ title, text, ok, danger }, onOk) {
    const box = this.$('.econfirm');
    box.innerHTML = `<div class="ecbox"><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="ebtns"><button class="ebtn no">${esc(t('ed_cancel'))}</button><button class="ebtn yes ${danger ? 'redfill' : 'blue'}">${esc(ok)}</button></div></div>`;
    box.hidden = false;
    box.querySelector('.no').addEventListener('click', () => this._confirmClose());
    box.querySelector('.yes').addEventListener('click', () => { this._confirmClose(); onOk(); });
    box.addEventListener('pointerdown', (e) => { if (e.target === box) this._confirmClose(); }, { once: true });
    requestAnimationFrame(() => box.querySelector('.no').focus());
  }
  _confirmClose() { const box = this.$('.econfirm'); box.hidden = true; box.innerHTML = ''; this._cv.classList.remove('del-all'); }

  /* start over: everything empty, back to the template */
  _askReset() {
    this._confirm({ title: t('ed_resetTitle'), text: t('ed_resetText'), ok: t('ed_reset'), danger: true }, () => {
      this._change(() => {
        const keep = { type: this._c.type, language: this._c.language };
        for (const k of Object.keys(this._c)) delete this._c[k];
        Object.assign(this._c, normEditorConfig(keep));
        if (!this._c.language) delete this._c.language;
      }, { panel: false });
      this._ulSrc = null;
      this._pending = null; this._scaleCheck = null; this._pasting = false; this._measure = null; this._editLayer = null;
      this._tool = 'sketch'; this._layerSel = 'light'; this._s = null; this._scrollMem = {};
      this._viewTouched = false;
      this._fit(); this._draw(); this._panel();
      this._toast(t('ed_resetDone'));
    });
  }

  _setTool(tool) {
    if (this._tool === tool && !this._s && !this._editLayer) return;
    this._tool = tool;
    this._s = null;
    this._measure = null;
    this._editLayer = null;
    this._draw();
    this._panel();
  }
  _setMode(m) {
    if (this._mode === m) return;
    this._mode = m;
    this._fix = null;
    this._s = this._s?.t === 'ul' || this._s?.t === 'wid' ? null : this._s;
    this._measure = null;
    this._viewTouched = false;
    this._liveKey = null;
    this._draw();
    this._fit();
    this._draw();
    this._panel();
  }

  _syncTop() {
    this.shadowRoot.querySelectorAll('.erail button[data-tool]').forEach((b) => b.classList.toggle('act', b.dataset.tool === this._tool));
    this.shadowRoot.querySelectorAll('.eview button').forEach((b) => b.classList.toggle('act', b.dataset.m === this._mode));
    this.shadowRoot.querySelectorAll('.elight button').forEach((b) => b.classList.toggle('act', b.dataset.l === this._light));
    this.$('.undo').disabled = !this._undo.length;
    this.$('.redo').disabled = !this._redo.length;
    const n = this._c.rooms.length, e = this._c.entities.filter((x) => x.at).length;
    this.$('.etop h1 small').textContent = n ? t('ed_summary', n, e) : '';
    this._cv.className = `ecv tool-${this._tool}${this._showUl() ? ' ul-on' : ''}${this._tool === 'rooms' || (this._tool === 'sketch' && this._measure) ? ' draw' : ''}${this._cv.classList.contains('del-sel') ? ' del-sel' : ''}${this._cv.classList.contains('del-all') ? ' del-all' : ''}`;
  }

  /* ---------------------------------------------------------------- undo / redo */
  _snap() {
    const s = JSON.stringify(this._c);
    if (this._undo[this._undo.length - 1] !== s) this._undo.push(s);
    if (this._undo.length > 120) this._undo.shift();
    this._redo = [];
  }
  _doUndo() {
    if (!this._undo.length) return;
    this._redo.push(JSON.stringify(this._c));
    this._c = JSON.parse(this._undo.pop());
    this._s = null;
    this._loadUnderlay();
    this._draw(); this._panel();
  }
  _doRedo() {
    if (!this._redo.length) return;
    this._undo.push(JSON.stringify(this._c));
    this._c = JSON.parse(this._redo.pop());
    this._s = null;
    this._loadUnderlay();
    this._draw(); this._panel();
  }
  _change(fn, opts = {}) {
    this._snap();
    fn();
    if (!opts.keepSel && this._s && !this._selObj()) this._s = null;
    this._draw();
    if (opts.panel !== false) this._panel();
  }

  /* ---------------------------------------------------------------- the live card on its screen */
  /* size of the real screen: the dashboard next to Home Assistant's sidebar, or a phone */
  _screen() {
    if (this._mode === 'phone') return ED_PHONE;
    if (this._vp) return this._vp;
    let sb = 0;
    try {
      const main = document.querySelector('home-assistant')?.shadowRoot?.querySelector('home-assistant-main');
      const r = main?.shadowRoot?.querySelector('ha-sidebar')?.getBoundingClientRect();
      if (r && r.right > 0 && r.width < window.innerWidth / 2) sb = r.right;
    } catch (e) { /* not in Home Assistant */ }
    return { w: Math.max(760, Math.round(window.innerWidth - sb)), h: Math.max(460, window.innerHeight - 56) };
  }
  _showUl() { return !!(this._ulSrc && this._c.underlay?.rect && this._mode !== 'phone' && ED_UL_TOOLS.includes(this._tool)); }
  _liveCfg() {
    const c = cleanConfig(this._c);
    c.layout = this._mode === 'phone' || c.layout === 'mobile' ? 'mobile' : 'desktop';
    delete c.underlay;
    return c;
  }
  /* The visible part of the plan is exactly the card's own – except: fixed while something is dragged, and the
   * template picture stays inside while tracing */
  _liveStage(cfg) {
    if (this._pin) return this._pin;
    if (!this._showUl() || cfg.layout === 'mobile') return null;
    try {
      const S = buildModel(cfg, this._hs()).stage, U = this._c.underlay.rect, m = 20;
      const R = bboxOf([[S.x, S.y, S.x + S.w, S.y + S.h], [U[0] - m, U[1] - m, U[2] + m, U[3] + m]]);
      return { x: R[0], y: R[1], w: R[2] - R[0], h: R[3] - R[1] };
    } catch (e) { return null; }
  }
  /* while rooms are drawn the plan stays where it is on the screen (a new room must not make it jump);
   * the fit button – or another tool – shows the exact view again */
  _drawing(cfg) { return ['sketch', 'rooms'].includes(this._tool) && cfg.layout !== 'mobile'; }
  /* lights shown switched on / off while editing (or as they really are) */
  _liveHass(h) {
    if (!h || this._light === 'real') return h;
    const ids = this._c.entities.map((e) => e.entity).filter((id) => domainOf(id) === 'light' && h.states?.[id]);
    const key = `${this._light}|${ids.join(',')}|${ids.map((id) => this._c.entities.find((e) => e.entity === id)?.kelvin || '').join(',')}`;
    if (this._lh?.src === h && this._lh.key === key) return this._lh.out;
    const states = { ...h.states };
    for (const id of ids) {
      const st = h.states[id], a = st.attributes || {}, modes = a.supported_color_modes || [];
      if (this._light === 'off') { states[id] = { ...st, state: 'off', attributes: { ...a, brightness: null, color_mode: null } }; continue; }
      if (st.state === 'on') { states[id] = { ...st, attributes: { ...a, brightness: Math.max(a.brightness || 0, 180) } }; continue; }
      const ct = modes.includes('color_temp'), k = this._c.entities.find((e) => e.entity === id)?.kelvin || 2900;
      states[id] = { ...st, state: 'on', attributes: { ...a, brightness: 220, color_mode: ct ? 'color_temp' : modes.find((m) => m !== 'onoff') || 'onoff', ...(ct ? { color_temp_kelvin: k } : {}) } };
    }
    const out = { ...h, states };
    this._lh = { src: h, key, out };
    return out;
  }
  _syncLive() {
    const card = this._card, h = this._hs();
    if (!card || !h) return;
    const scr = this._screen(), cfg = this._liveCfg(), lh = this._liveHass(h), draw = this._drawing(cfg);
    if (!draw) this._fix = null;
    const fix = draw ? this._fix : null, stage = fix ? null : this._liveStage(cfg);
    const key = JSON.stringify([cfg, scr, stage, fix]);
    if (key !== this._liveKey) {
      this._liveKey = key;
      card.style.width = `${scr.w}px`;
      card.setEditorView(cfg, { w: scr.w, h: scr.h, stage, fix, tab: this._layerSel });
    }
    if (card.hass !== lh) card.hass = lh;
    if (card._M && card._tab !== this._layerSel && card._M.layers.some((l) => l.id === this._layerSel)) { card._tab = this._layerSel; card._applyTab(true); }
    const lv = card._lv, M = card._M;
    this._map = lv && M ? { S: lv.S, pu: lv.pu, sx: lv.sx, sy: lv.sy, H: lv.H, rot: M.rot ? M.rotP : null, inv: M.rot ? M.rotI : null } : null;
    if (draw && !this._fix && lv) this._fix = { pu: lv.pu, ox: lv.sx - lv.S.x * lv.pu, oy: lv.sy - lv.S.y * lv.pu };
  }
  _fit() {
    const r = this._cv.getBoundingClientRect();
    if (!r.width) return;
    if (this._fix) { this._fix = null; this._syncLive(); }
    const scr = this._screen(), H = this._map?.H || scr.h, narrow = r.width < 600;
    const pad = narrow ? 10 : 30, top = narrow ? 14 : 46, bottom = narrow ? 64 : 66;
    const k = clamp(Math.min((r.width - 2 * pad) / scr.w, (r.height - top - bottom) / H), 0.08, 1.4);
    this._f = { k, ox: (r.width - scr.w * k) / 2, oy: top + Math.max(0, (r.height - top - bottom - H * k) / 2) };
  }
  _zoomBy(f, cx, cy) {
    this._viewTouched = true;
    const r = this._cv.getBoundingClientRect(), F = this._f;
    const px = cx ?? r.width / 2, py = cy ?? r.height / 2, k = clamp(F.k * f, 0.08, 6);
    F.ox = px - ((px - F.ox) * k) / F.k;
    F.oy = py - ((py - F.oy) * k) / F.k;
    F.k = k;
    this._draw();
  }
  /* plan (centimetres) → canvas pixels, through the live card's own layout (also on a turned phone plan) */
  P(x, y) {
    const m = this._map || { S: { x: 0, y: 0 }, pu: 0.5, sx: 0, sy: 0 }, F = this._f || { k: 1, ox: 0, oy: 0 };
    const [a, b] = m.rot ? m.rot([x, y]) : [x, y];
    return [F.ox + F.k * (m.sx + (a - m.S.x) * m.pu), F.oy + F.k * (m.sy + (b - m.S.y) * m.pu)];
  }
  _unP(X, Y) {
    const m = this._map || { S: { x: 0, y: 0 }, pu: 0.5, sx: 0, sy: 0 }, F = this._f || { k: 1, ox: 0, oy: 0 };
    const cx = (X - F.ox) / F.k, cy = (Y - F.oy) / F.k;
    const p = [m.S.x + (cx - m.sx) / m.pu, m.S.y + (cy - m.sy) / m.pu];
    return m.inv ? m.inv(p) : p;
  }
  /* canvas pixels per centimetre */
  _z() { return (this._f?.k || 1) * (this._map?.pu || 0.5); }
  _pt(e) {
    const r = this._cv.getBoundingClientRect();
    return this._unP(e.clientX - r.left, e.clientY - r.top);
  }
  _rectS(R) {
    const a = this.P(R[0], R[1]), b = this.P(R[2], R[3]);
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  }
  _boxPx(R) { const q = this._rectS(R); return `left:${q[0].toFixed(1)}px;top:${q[1].toFixed(1)}px;width:${(q[2] - q[0]).toFixed(1)}px;height:${(q[3] - q[1]).toFixed(1)}px`; }
  /* a line along a plan wall, drawn as a bar of thickness th */
  _segPx(s, th) {
    const a = this.P(s[0], s[1]), b = this.P(s[2], s[3]), l = Math.min(a[0], b[0]), tp = Math.min(a[1], b[1]);
    return Math.abs(a[0] - b[0]) >= Math.abs(a[1] - b[1])
      ? `left:${l}px;top:${a[1] - th / 2}px;width:${Math.abs(a[0] - b[0])}px;height:${th}px`
      : `left:${a[0] - th / 2}px;top:${tp}px;width:${th}px;height:${Math.abs(a[1] - b[1])}px`;
  }
  /* where the live card draws an element (its bounding box on the canvas) */
  _cardBox(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect(), c = this._cv.getBoundingClientRect();
    return r.width ? [r.left - c.left, r.top - c.top, r.right - c.left, r.bottom - c.top] : null;
  }

  /* the model the card would build on a laptop (for auto placed tiles, rooms of devices …) */
  _model() {
    try { return buildModel(cleanConfig(this._c), this._hs()); } catch (e) { return null; }
  }

  /* ---------------------------------------------------------------- draw (handles on top of the live card) */
  _draw() {
    if (!this._world) return;
    this._syncLive();
    if (!this._f) this._fit();
    this._syncTop();
    const c = this._c, F = this._f, z = this._z(), scr = this._screen(), H = this._map?.H || scr.h;
    // the screen with the live card
    Object.assign(this._liveEl.style, { width: `${scr.w}px`, height: `${H}px`, transform: `translate(${F.ox}px, ${F.oy}px) scale(${F.k})` });
    Object.assign(this._frameEl.style, { left: `${F.ox}px`, top: `${F.oy}px`, width: `${scr.w * F.k}px`, height: `${H * F.k}px` });
    this._frameEl.classList.toggle('phone', this._mode === 'phone');
    this._frameEl.querySelector('small').textContent = `${t(`ed_prev_${this._mode}`)} · ${scr.w} × ${scr.h}`;
    // template picture (on top of the card, so the plan can be traced)
    const ul = this._ulEl;
    if (this._showUl()) {
      if (ul.getAttribute('src') !== this._ulSrc) ul.src = this._ulSrc;
      ul.hidden = false;
      const q = this._rectS(c.underlay.rect);
      Object.assign(ul.style, { left: `${q[0]}px`, top: `${q[1]}px`, width: `${q[2] - q[0]}px`, height: `${q[3] - q[1]}px`, opacity: String(c.underlay.opacity ?? 0.6),
        filter: c.underlay.invert ? 'invert(1) hue-rotate(180deg) contrast(1.1)' : '', mixBlendMode: c.underlay.invert ? 'screen' : 'normal' });
    } else ul.hidden = true;

    const tool = this._tool, sel = this._s, card = this._card;
    const hs = this._hs() || {};
    let html = '';
    // rooms: invisible, outlined on hover / when selected; rooms without an area are marked while linking
    const hasAreas = Object.keys(hs.areas || {}).length > 0;
    c.rooms.forEach((r, i) => {
      const on = this._dropRoom === i;
      const noArea = !r.area && hasAreas && tool === 'rooms';
      html += `<div class="eroom${on ? ' hot' : ''}${noArea ? ' na' : ''}" data-k="room" data-i="${i}" style="${this._boxPx([r.rect[0] + 6.5, r.rect[1] + 6.5, r.rect[2] - 6.5, r.rect[3] - 6.5])}">${noArea ? `<em>${esc(t('ed_noAreaYet'))}</em>` : ''}</div>`;
    });
    // a floor plan waiting to be imported: dashed outlines
    for (const r of this._pending?.rooms || []) html += `<div class="eroom ghost" style="${this._boxPx(r.rect)}"><div class="en"><b>${esc(r.name)}</b></div></div>`;
    // furniture
    c.rooms.forEach((r, ri) => (r.furniture || []).forEach((f, fi) => {
      const Fu = normFurn(f);
      if (!Fu) return;
      const on = sel?.t === 'furn' && sel.r === ri && sel.i === fi;
      html += `<div class="efu${Fu.circle ? ' c' : ''}${on ? ' sel' : ''}" data-k="furn" data-r="${ri}" data-i="${fi}" style="${this._boxPx(Fu.r)};--fr:${(Fu.rad * z * 1.3).toFixed(1)}"></div>`;
    }));
    // windows, passages, front door
    const th = Math.max(8, 11 * z);
    for (const [kind, { key }] of Object.entries(OPEN_KINDS)) {
      const list = key === 'entrance' ? (c.entrance ? [c.entrance] : []) : c[key];
      list.forEach((s0, i) => {
        const s = normSeg(s0);
        if (!s) return;
        const on = sel?.t === 'open' && sel.k === kind && sel.i === i;
        html += `<div class="eopen ${kind === 'window' ? 'win' : kind === 'door' ? 'pas' : 'ent'}${on ? ' sel' : ''}" data-k="open" data-o="${kind}" data-i="${i}" style="${this._segPx(s, th)}" title="${esc(t(`ed_open_${kind}`))}"></div>`;
      });
    }
    if (this._hover && tool === 'openings') html += `<div class="eopen ghost ${this._openKind === 'window' ? 'win' : this._openKind === 'door' ? 'pas' : 'ent'}" style="${this._segPx(this._hover.seg, th)}"></div>`;
    // tiles (auto or manual) – on a laptop
    const M = this._model();
    if (tool === 'tiles' && M && this._mode !== 'phone') {
      for (const k of ['card', 'weather', 'indoor', 'door', 'bar']) {
        const R = M.widgets[k];
        if (!R) continue;
        const manual = Array.isArray(c.widgets?.[k]), on = sel?.t === 'wid' && sel.k === k;
        html += `<div class="ewid${manual ? '' : ' auto'}${on ? ' sel' : ''}" data-k="wid" data-w="${k}" style="${this._boxPx([R[0] + 6 * M.D, R[1] + 6 * M.D, R[2] - 6 * M.D, R[3] - 6 * M.D])}"><span>${esc(t(`ed_tile_${k}`))}</span></div>`;
      }
    }
    // device markers: exactly over the buttons the live card shows in its current layer (tap → settings)
    const onCard = (el) => { const b = !el || el.classList.contains('hid') ? null : this._cardBox(el); return b && [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2, b[2] - b[0]]; };
    c.entities.forEach((e, i) => {
      const on = sel?.t === 'ent' && sel.i === i, m = e.at && onCard(card?._mk?.[e.entity]);
      // a selected device without a button there (plan: false, another layer) is shown where it is
      const [x, y, w] = m || (on && e.at ? [...this.P(e.at[0], e.at[1]), 34 * F.k] : []);
      if (x == null) return;
      const out = !c.rooms.some((r) => inRect(r.rect, e.at));
      html += `<div class="emk${on ? ' sel' : ''}${m ? '' : ' ghost'}${out ? ' warn' : ''}" data-k="mk" data-i="${i}" style="left:${x}px;top:${y}px;--s:${w.toFixed(1)}px" title="${esc(e.name || hs.states?.[e.entity]?.attributes?.friendly_name || e.entity)}"></div>`;
    });
    const dm = c.door?.at && onCard(card?._mk?.__door);
    if (c.door?.at && (dm || sel?.t === 'door')) {
      const [x, y, w] = dm || [...this.P(c.door.at[0], c.door.at[1]), 36 * F.k];
      html += `<div class="emk${sel?.t === 'door' ? ' sel' : ''}" data-k="mk" data-m="door" style="left:${x}px;top:${y}px;--s:${w.toFixed(1)}px"></div>`;
    }
    const mkSize = (el, dflt) => (el?.offsetWidth || dflt) * F.k;
    if (c.vacuum?.entity && c.vacuum.dock && (sel?.t === 'dock' || card?._layer?.()?.type === 'vacuum')) {
      const [x, y] = this.P(c.vacuum.dock[0], c.vacuum.dock[1]);
      html += `<div class="emk dock${sel?.t === 'dock' ? ' sel' : ''}" data-k="mk" data-m="dock" style="left:${x}px;top:${y}px;--s:${mkSize(card?.$?.('.bot'), 30).toFixed(1)}px"></div>`;
    }
    // layers: the layer bar of the card, highlighted
    if (tool === 'layers') {
      const b = this._cardBox(card?.shadowRoot?.querySelector('.tabs'));
      if (b) html += `<i class="ehl" style="left:${b[0]}px;top:${b[1]}px;width:${b[2] - b[0]}px;height:${b[3] - b[1]}px"></i>`;
    }
    // selection handles (named after the plan's sides – on a turned phone plan they sit where that side is)
    const so = this._selObj();
    const hd = (pt, name, cx, cy, extra = '') => {
      const [x, y] = this.P(pt[0], pt[1]), dx = x - cx, dy = y - cy;
      const cur = Math.abs(dx) < 2 ? 'ns' : Math.abs(dy) < 2 ? 'ew' : dx * dy > 0 ? 'nwse' : 'nesw';
      return `<i class="ehd ${cur}" data-k="hd" data-h="${name}"${extra} style="left:${x}px;top:${y}px"></i>`;
    };
    const rectHandles = (R, list = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']) => {
      const q = this._rectS(R), cx = (q[0] + q[2]) / 2, cy = (q[1] + q[3]) / 2, mx = (R[0] + R[2]) / 2, my = (R[1] + R[3]) / 2;
      const Pp = { n: [mx, R[1]], s: [mx, R[3]], e: [R[2], my], w: [R[0], my], nw: [R[0], R[1]], ne: [R[2], R[1]], sw: [R[0], R[3]], se: [R[2], R[3]] };
      return `<i class="esel" style="${this._boxPx(R)}"></i>${list.map((k) => hd(Pp[k], k, cx, cy)).join('')}`;
    };
    if (so && !sel.quiet) {
      if (sel.t === 'room') html += sel.fresh ? `<i class="esel" style="${this._boxPx(so.rect)};opacity:.55"></i>` : rectHandles(so.rect);
      else if (sel.t === 'furn') html += rectHandles(normFurn(so).r);
      else if (sel.t === 'wid') html += rectHandles(so);
      else if (sel.t === 'ul') html += rectHandles(so.rect, ['nw', 'ne', 'sw', 'se']);
      else if (sel.t === 'open') {
        const s = normSeg(so), q = this._rectS(s), cx = (q[0] + q[2]) / 2, cy = (q[1] + q[3]) / 2;
        html += hd([s[0], s[1]], segH(s) ? 'w' : 'n', cx, cy, ' data-end="0"') + hd([s[2], s[3]], segH(s) ? 'e' : 's', cx, cy, ' data-end="1"');
      }
    } else if (so && sel.quiet && sel.t === 'furn') html += `<i class="esel" style="${this._boxPx(normFurn(so).r)}"></i>`;
    if (sel?.t === 'room' && so && !sel.fresh) {
      const q = this._rectS(so.rect);
      html += `<div class="edim" style="left:${(q[0] + q[2]) / 2}px;top:${q[1]}px">${fmt((so.rect[2] - so.rect[0]) / 100, 2)} × ${fmt((so.rect[3] - so.rect[1]) / 100, 2)} m</div>`;
    }
    if (sel?.t === 'furn' && so) {
      const q = this._rectS(normFurn(so).r), R = normFurn(so).r, below = q[1] < 56;
      html += `<div class="efloat" style="left:${(q[0] + q[2]) / 2}px;top:${below ? q[3] + 14 : q[1] - 14}px;transform:translate(-50%, ${below ? '0' : '-100%'})">
        <span>${esc(t(`furn_${normFurn(so).kind}`))} · ${r0(R[2] - R[0])} × ${r0(R[3] - R[1])}</span>
        <button data-act="rot" title="${esc(t('ed_rotate'))} (R)">${icon('rotate')}</button><button data-act="dup" title="${esc(t('ed_duplicate'))}">${icon('copy')}</button><button data-act="del" data-del="sel" title="${esc(t('ed_delete'))}">${icon('trash')}</button></div>`;
    }
    if (this._drawRect) {
      const q = this._rectS(this._drawRect);
      html += `<div class="edraw" style="${this._boxPx(this._drawRect)}"></div><div class="edim" style="left:${(q[0] + q[2]) / 2}px;top:${q[1]}px">${fmt((this._drawRect[2] - this._drawRect[0]) / 100, 2)} × ${fmt((this._drawRect[3] - this._drawRect[1]) / 100, 2)} m</div>`;
    }
    // snapping guides (a plan x is a horizontal line on a turned phone plan)
    const guide = (pa, pb) => { const a = this.P(...pa), b = this.P(...pb); return Math.abs(a[0] - b[0]) < 0.5 ? `<i class="eguide v" style="left:${a[0]}px"></i>` : `<i class="eguide h" style="top:${a[1]}px"></i>`; };
    for (const gx of this._guides?.x || []) html += guide([gx, 0], [gx, 100]);
    for (const gy of this._guides?.y || []) html += guide([0, gy], [100, gy]);
    if (this._measure?.a) {
      const a = this.P(...this._measure.a), bb = this._measure.b || this._measure.cur, b = bb && this.P(...bb);
      html += `<svg class="emeas" style="left:0;top:0;width:100%;height:100%;overflow:visible">${b ? `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="rgb(255,70,200)" stroke-width="2" stroke-dasharray="6 4"/>` : ''}</svg><div class="emeas"><i style="left:${a[0]}px;top:${a[1]}px"></i>${this._measure.b ? `<i style="left:${b[0]}px;top:${b[1]}px"></i>` : ''}</div>`;
    }
    this._world.innerHTML = html;
    fitText(this._world.querySelectorAll('.eroom .en b'));
    this._world.querySelectorAll('.efloat button').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.act === 'rot') this._rotateFurn(); else if (b.dataset.act === 'dup') this._duplicateSel(); else this._deleteSel();
    }));
    this.$('.ehint').textContent = this._hint();
  }

  _hint() {
    if (this._measure) return this._measure.b ? t('ed_hint_measure3') : this._measure.a ? t('ed_hint_measure2') : t('ed_hint_measure1');
    const tool = this._tool;
    if (tool === 'rooms') return this._c.rooms.length ? t('ed_hint_rooms') : t('ed_hint_rooms0');
    if (tool === 'openings') return t(`ed_hint_open_${this._openKind}`);
    if (tool === 'furniture') return t('ed_hint_furniture');
    if (tool === 'devices') return t('ed_hint_devices');
    if (tool === 'tiles') return this._mode === 'phone' ? t('ed_tiles_phone') : t('ed_hint_tiles');
    if (tool === 'layers') return t('ed_hint_layers');
    if (tool === 'sketch') return this._ulSrc ? t('ed_hint_sketch') : '';
    return '';
  }

  _selObj() {
    const s = this._s, c = this._c;
    if (!s) return null;
    if (s.t === 'room') return c.rooms[s.i] || null;
    if (s.t === 'furn') return c.rooms[s.r]?.furniture?.[s.i] || null;
    if (s.t === 'open') return s.k === 'entrance' ? c.entrance : c[OPEN_KINDS[s.k].key][s.i] || null;
    if (s.t === 'ent') return c.entities[s.i] || null;
    if (s.t === 'door') return c.door || null;
    if (s.t === 'dock') return c.vacuum || null;
    if (s.t === 'wid') return this._model()?.widgets[s.k] || null;
    if (s.t === 'ul') return c.underlay?.rect ? c.underlay : null;
    return null;
  }

  /* ---------------------------------------------------------------- snapping */
  _snapV(v, axis, skip, tol) {
    const c = this._c, cand = [];
    c.rooms.forEach((r, i) => { if (i !== skip) cand.push(axis === 'x' ? r.rect[0] : r.rect[1], axis === 'x' ? r.rect[2] : r.rect[3]); });
    let best = null, bd = tol ?? 9 / this._z();
    for (const q of cand) { const d = Math.abs(q - v); if (d < bd) { bd = d; best = q; } }
    return best != null ? { v: best, guide: true } : { v: Math.round(v / ED_GRID) * ED_GRID, guide: false };
  }

  /* walls under the pointer: nearest room edge (for windows, passages, the front door) */
  _wallAt(p) {
    const tol = 16 / this._z();
    let best = null;
    this._c.rooms.forEach((r) => {
      const [a, b, c, d] = r.rect;
      const edges = [[a, b, c, b], [a, d, c, d], [a, b, a, d], [c, b, c, d]];
      for (const s of edges) {
        const dist = segDist(s, p);
        if (dist < tol && (!best || dist < best.d)) best = { s, d: dist };
      }
    });
    return best?.s || null;
  }
  _openingOn(wall, p, len) {
    const h = wall[1] === wall[3];
    const lo = h ? wall[0] : wall[1], hi = h ? wall[2] : wall[3];
    const L = Math.min(len, hi - lo), mid = clamp(Math.round((h ? p[0] : p[1]) / ED_GRID) * ED_GRID, lo + L / 2, hi - L / 2);
    return h ? [r0(mid - L / 2), wall[1], r0(mid + L / 2), wall[1]] : [wall[0], r0(mid - L / 2), wall[0], r0(mid + L / 2)];
  }

  /* ---------------------------------------------------------------- canvas pointer handling */
  _wireCanvas() {
    const cv = this._cv;
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) this._zoomBy(Math.exp(-e.deltaY * 0.0045), e.clientX - r.left, e.clientY - r.top);
      else { this._viewTouched = true; this._f.ox -= e.deltaX; this._f.oy -= e.deltaY; this._draw(); }
    }, { passive: false });
    cv.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
    cv.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (!f) return; e.preventDefault(); this._readDropped(f); });
    cv.addEventListener('pointerdown', (e) => this._down(e));
    cv.addEventListener('pointermove', (e) => this._move(e));
    cv.addEventListener('pointerup', (e) => this._up(e));
    cv.addEventListener('pointercancel', (e) => this._up(e, true));
    cv.addEventListener('dblclick', (e) => {
      const el = e.target.closest('[data-k="room"]');
      if (el) { this._tool = 'rooms'; this._s = { t: 'room', i: +el.dataset.i }; this._draw(); this._panel(); this._ins.querySelector('.einp')?.focus(); }
    });
    // pinch zoom (two fingers)
    this._touches = new Map();
  }

  _down(e) {
    if (e.button === 2 || e.target.closest('.efloat')) return;
    this._cv.setPointerCapture(e.pointerId);
    this._touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (this._touches.size === 2) {
      const [a, b] = [...this._touches.values()];
      this._d = { mode: 'pinch', dist: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], f: { ...this._f } };
      return;
    }
    const p = this._pt(e), el = e.target.closest('[data-k]'), k = el?.dataset.k;
    const base = { sx: e.clientX, sy: e.clientY, p, moved: false, id: e.pointerId };
    if (e.button === 1 || this._space) { this._d = { ...base, mode: 'pan', f: { ...this._f } }; return; }
    if (this._measure) { this._d = { ...base, mode: 'measure' }; return; }
    if (k === 'hd') { this._d = { ...base, mode: 'resize', h: el.dataset.h, end: el.dataset.end, orig: deep(this._selObj()) }; return; }
    // rooms tool: dragging always draws a new room (also across others – tracing a plan); a selected room moves,
    // a short click on an unselected room selects it
    if (k === 'room' && this._tool === 'rooms' && !(this._s?.t === 'room' && this._s.i === +el.dataset.i && !this._s.fresh)) {
      const s = [this._snapV(p[0], 'x').v, this._snapV(p[1], 'y').v];
      this._d = { ...base, mode: 'draw', a: s, click: +el.dataset.i };
      return;
    }
    if (k === 'room' && (this._tool === 'rooms' || this._tool === 'sketch' || this._tool === 'settings' || this._tool === 'layers')) {
      const i = +el.dataset.i;
      this._select({ t: 'room', i }, 'rooms');
      const R = this._c.rooms[i].rect;
      // everything inside the room moves along with it
      const ents = this._c.entities.map((x, j) => (x.at && inRect(R, x.at) ? j : -1)).filter((j) => j >= 0);
      const onWall = (s) => { const q = normSeg(s); return q && ((segH(q) && (q[1] === R[1] || q[1] === R[3]) && q[0] >= R[0] - 1 && q[2] <= R[2] + 1) || (!segH(q) && (q[0] === R[0] || q[0] === R[2]) && q[1] >= R[1] - 1 && q[3] <= R[3] + 1)); };
      const shared = (s) => this._c.rooms.some((o, j) => j !== i && segDist(o.rect, [(s[0] + s[2]) / 2, (s[1] + s[3]) / 2]) < 1);
      this._d = { ...base, mode: 'move-room', i, orig: deep(this._c.rooms[i]), ents: ents.map((j) => [j, [...this._c.entities[j].at]]),
        wins: this._c.windows.map((s, j) => (onWall(s) && !shared(normSeg(s)) ? [j, deep(s)] : null)).filter(Boolean),
        door: this._c.door?.at && inRect(R, this._c.door.at) ? [...this._c.door.at] : null, dock: this._c.vacuum?.dock && inRect(R, this._c.vacuum.dock) ? [...this._c.vacuum.dock] : null,
        ent: this._c.entrance && onWall(this._c.entrance) ? deep(this._c.entrance) : null };
      return;
    }
    // furniture, windows, devices: dragging moves them (the list on the right stays), a tap opens their settings
    const pick = (s, tool) => this._select({ ...s, quiet: this._sameSel(s) ? !!this._s.quiet : true }, tool);
    if (k === 'furn' && this._tool !== 'devices') {
      pick({ t: 'furn', r: +el.dataset.r, i: +el.dataset.i }, 'furniture');
      this._d = { ...base, mode: 'move-furn', orig: deep(this._selObj()), tap: true };
      return;
    }
    if (k === 'open') {
      pick({ t: 'open', k: el.dataset.o, i: +el.dataset.i }, 'openings');
      this._d = { ...base, mode: 'move-open', orig: normSeg(this._selObj()), tap: true };
      return;
    }
    if (k === 'mk') {
      const m = el.dataset.m;
      pick(m ? { t: m } : { t: 'ent', i: +el.dataset.i }, 'devices');
      const at = m === 'door' ? this._c.door.at : m === 'dock' ? this._c.vacuum.dock : this._c.entities[+el.dataset.i].at;
      this._d = { ...base, mode: 'move-mk', orig: [...at], tap: true };
      return;
    }
    if (k === 'wid') {
      this._select({ t: 'wid', k: el.dataset.w }, 'tiles');
      this._d = { ...base, mode: 'move-wid', orig: deep(this._selObj()) };
      return;
    }
    // empty space
    if (this._tool === 'rooms') { const s = [this._snapV(p[0], 'x').v, this._snapV(p[1], 'y').v]; this._d = { ...base, mode: 'draw', a: s }; return; }
    if (this._tool === 'openings' && this._hover) { this._addOpening(this._hover.seg); return; }
    if (this._tool === 'sketch' && this._ulSrc && this._c.underlay?.rect && inRect(this._c.underlay.rect, p)) {
      this._select({ t: 'ul' }, 'sketch');
      this._d = { ...base, mode: 'move-ul', orig: deep(this._c.underlay.rect) };
      return;
    }
    this._d = { ...base, mode: 'pan', f: { ...this._f }, deselect: true };
  }

  _sameSel(s) { const o = this._s; return !!o && o.t === s.t && o.i === s.i && o.r === s.r && o.k === s.k; }
  _select(s, tool) {
    const changedTool = tool && this._tool !== tool;
    if (changedTool) this._tool = tool;
    const same = JSON.stringify(s) === JSON.stringify(this._s) || (s?.t === 'room' && this._s?.t === 'room' && s.i === this._s.i);
    this._s = s;
    if (s?.t === 'ent') {
      const e = this._c.entities[s.i], st = this._hs()?.states?.[e.entity], kind = kindOf(e.entity, st);
      const cur = this._layerDef(this._layerSel);
      if (!cur || !this._inLayerDef(cur, e.entity, kind)) this._layerSel = this._layersFor(e.entity, kind)[0] || this._layerSel;
    }
    if (s?.t === 'door') this._layerSel = 'light';
    if (s?.t === 'dock') this._layerSel = 'vacuum';
    this._draw();
    if (!same || changedTool) this._panel();
  }

  _move(e) {
    if (this._touches?.has(e.pointerId)) this._touches.set(e.pointerId, [e.clientX, e.clientY]);
    const d = this._d;
    const p = this._pt(e);
    if (!d) {
      if (this._tool === 'openings') {
        const wall = !e.target.closest('[data-k="open"],[data-k="hd"]') && this._wallAt(p);
        const hv = wall ? { seg: this._openingOn(wall, p, OPEN_KINDS[this._openKind].len) } : null;
        if (JSON.stringify(hv) !== JSON.stringify(this._hover)) { this._hover = hv; this._draw(); }
      } else if (this._measure?.a && !this._measure.b) { this._measure.cur = p; this._draw(); }
      return;
    }
    if (d.mode === 'pinch') {
      if (this._touches.size < 2) return;
      const [a, b] = [...this._touches.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const r = this._cv.getBoundingClientRect(), mx = d.mid[0] - r.left, my = d.mid[1] - r.top, k = clamp(d.f.k * (dist / d.dist), 0.08, 6);
      this._viewTouched = true;
      this._f = { k, ox: mx - ((mx - d.f.ox) * k) / d.f.k, oy: my - ((my - d.f.oy) * k) / d.f.k };
      this._draw();
      return;
    }
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
    if (!d.moved) {
      d.moved = true;
      if (!['pan', 'draw', 'measure'].includes(d.mode)) this._snap();
      // the live card keeps its scale while something is dragged
      if (!['pan', 'measure'].includes(d.mode) && this._card?._M) this._pin = { ...this._card._M.stage };
    }
    const dx = p[0] - d.p[0], dy = p[1] - d.p[1], c = this._c;
    this._guides = null;
    if (d.mode === 'pan') {
      this._viewTouched = true;
      this._cv.classList.add('panning');
      this._f.ox = d.f.ox + (e.clientX - d.sx);
      this._f.oy = d.f.oy + (e.clientY - d.sy);
    } else if (d.mode === 'draw') {
      const sx = this._snapV(p[0], 'x'), sy = this._snapV(p[1], 'y');
      this._drawRect = normRect([d.a[0], d.a[1], sx.v, sy.v]) || [d.a[0], d.a[1], d.a[0] + 1, d.a[1] + 1];
      this._guides = { x: [d.a[0], sx.v].filter((x, i) => i === 0 ? this._snapV(d.a[0], 'x').guide : sx.guide), y: [d.a[1], sy.v].filter((y, i) => i === 0 ? this._snapV(d.a[1], 'y').guide : sy.guide) };
    } else if (d.mode === 'move-room') {
      const o = d.orig.rect, w = o[2] - o[0], h = o[3] - o[1];
      const L = this._snapV(o[0] + dx, 'x', d.i), Rr = this._snapV(o[2] + dx, 'x', d.i);
      const T = this._snapV(o[1] + dy, 'y', d.i), B = this._snapV(o[3] + dy, 'y', d.i);
      const nx = L.guide || !Rr.guide ? L.v : Rr.v - w, ny = T.guide || !B.guide ? T.v : B.v - h;
      const ddx = nx - o[0], ddy = ny - o[1];
      const room = c.rooms[d.i];
      room.rect = [nx, ny, nx + w, ny + h];
      room.furniture = (d.orig.furniture || []).map((f) => shiftFurn(f, ddx, ddy));
      for (const [j, at] of d.ents) c.entities[j].at = [r0(at[0] + ddx), r0(at[1] + ddy)];
      for (const [j, s] of d.wins) c.windows[j] = shiftSeg(s, ddx, ddy);
      if (d.door) c.door.at = [r0(d.door[0] + ddx), r0(d.door[1] + ddy)];
      if (d.dock) c.vacuum.dock = [r0(d.dock[0] + ddx), r0(d.dock[1] + ddy)];
      if (d.ent) c.entrance = shiftSeg(d.ent, ddx, ddy);
      this._guides = { x: [L.guide ? L.v : null, Rr.guide ? Rr.v : null].filter((x) => x != null), y: [T.guide ? T.v : null, B.guide ? B.v : null].filter((x) => x != null) };
    } else if (d.mode === 'move-furn') {
      const F = normFurn(d.orig), [a, b, cc, dd] = F.r, rd = (v) => Math.round(v / ED_GRID) * ED_GRID;
      const nx = rd(a + dx), ny = rd(b + dy);
      setFurnRect(this._selObj(), [nx, ny, nx + cc - a, ny + dd - b]);
    } else if (d.mode === 'move-open') {
      const s = d.orig, h = segH(s);
      const wall = this._wallAt(p), len = h ? s[2] - s[0] : s[3] - s[1];
      let n;
      if (wall && (wall[1] === wall[3]) === h) n = this._openingOn(wall, p, len);
      else n = h ? [r0(s[0] + dx), s[1], r0(s[2] + dx), s[3]] : [s[0], r0(s[1] + dy), s[2], r0(s[3] + dy)];
      this._setOpening(this._s, n);
    } else if (d.mode === 'move-mk') {
      const n = [r0(d.orig[0] + dx), r0(d.orig[1] + dy)];
      if (this._s.t === 'door') c.door.at = n; else if (this._s.t === 'dock') c.vacuum.dock = n; else c.entities[this._s.i].at = n;
    } else if (d.mode === 'move-wid') {
      const o = d.orig, w = o[2] - o[0], h = o[3] - o[1], rd = (v) => Math.round(v / ED_GRID) * ED_GRID;
      c.widgets = { ...(c.widgets || {}), [this._s.k]: [rd(o[0] + dx), rd(o[1] + dy), rd(o[0] + dx) + w, rd(o[1] + dy) + h].map(r0) };
    } else if (d.mode === 'move-ul') {
      const o = d.orig;
      c.underlay.rect = [o[0] + dx, o[1] + dy, o[2] + dx, o[3] + dy].map(r0);
    } else if (d.mode === 'resize') this._resize(d, p);
    else if (d.mode === 'measure') return;
    this._draw();
  }

  _resize(d, p) {
    const s = this._s, c = this._c, h = d.h;
    if (s.t === 'open') {
      const o = d.orig, hz = segH(o), v = Math.round((hz ? p[0] : p[1]) / ED_GRID) * ED_GRID;
      const n = [...o];
      if (hz) { if (d.end === '0') n[0] = Math.min(v, o[2] - 20); else n[2] = Math.max(v, o[0] + 20); }
      else if (d.end === '0') n[1] = Math.min(v, o[3] - 20); else n[3] = Math.max(v, o[1] + 20);
      this._setOpening(s, n);
      return;
    }
    const orig = s.t === 'room' ? d.orig.rect : s.t === 'furn' ? normFurn(d.orig).r : s.t === 'ul' ? d.orig.rect : d.orig;
    let [a, b, cc, dd] = orig;
    const min = s.t === 'furn' ? 10 : 40;
    const sx = s.t === 'room' ? this._snapV(p[0], 'x', s.i) : { v: Math.round(p[0] / ED_GRID) * ED_GRID };
    const sy = s.t === 'room' ? this._snapV(p[1], 'y', s.i) : { v: Math.round(p[1] / ED_GRID) * ED_GRID };
    if (s.t === 'ul') {
      // keep the aspect ratio of the image
      const ar = (orig[3] - orig[1]) / (orig[2] - orig[0]);
      const ax = h.includes('w') ? orig[2] : orig[0], ay = h.includes('n') ? orig[3] : orig[1];
      const w = Math.max(100, Math.abs(p[0] - ax)), hh = w * ar;
      a = h.includes('w') ? ax - w : ax; cc = h.includes('w') ? ax : ax + w;
      b = h.includes('n') ? ay - hh : ay; dd = h.includes('n') ? ay : ay + hh;
      c.underlay.rect = [a, b, cc, dd].map(r0);
      return;
    }
    if (h.includes('w')) a = Math.min(sx.v, cc - min);
    if (h.includes('e')) cc = Math.max(sx.v, a + min);
    if (h.includes('n')) b = Math.min(sy.v, dd - min);
    if (h.includes('s')) dd = Math.max(sy.v, b + min);
    const R = [a, b, cc, dd].map(r0);
    if (s.t === 'room') { c.rooms[s.i].rect = R; this._guides = { x: sx.guide ? [sx.v] : [], y: sy.guide ? [sy.v] : [] }; }
    else if (s.t === 'furn') setFurnRect(this._selObj(), R);
    else if (s.t === 'wid') c.widgets = { ...(c.widgets || {}), [s.k]: R };
  }

  _up(e, cancel) {
    this._touches?.delete(e.pointerId);
    const d = this._d;
    this._d = null;
    this._cv.classList.remove('panning');
    this._guides = null;
    if (this._pin) { this._pin = null; if (!d?.moved) this._draw(); }
    if (!d) return;
    if (d.mode === 'pinch') return;
    // a tap on furniture / a window / a device: its settings
    if (!d.moved && d.tap && this._s?.quiet) { this._s = { ...this._s, quiet: false }; this._draw(); this._panel(); return; }
    if (d.mode === 'measure' && !cancel) { this._measureClick(this._pt(e)); return; }
    if (d.mode === 'draw') {
      const R = this._drawRect;
      this._drawRect = null;
      if (R && d.moved && !cancel && R[2] - R[0] >= 40 && R[3] - R[1] >= 40) this._addRoom(R);
      else if (!d.moved && d.click != null) this._select({ t: 'room', i: d.click });
      else if (!d.moved && this._s) { this._s = null; this._draw(); this._panel(); }
      else this._draw();
      return;
    }
    if (d.mode === 'pan' && !d.moved && d.deselect) { if (this._s) { this._s = null; this._panel(); } this._draw(); return; }
    if (d.moved && d.mode === 'move-furn') this._reparentFurn();
    if (d.moved) { this._draw(); this._panel(); }
  }

  /* furniture moved into another room belongs to that room from now on */
  _reparentFurn() {
    const s = this._s;
    if (s?.t !== 'furn') return;
    const f = this._selObj(), F = normFurn(f), cpt = center(F.r);
    const ri = this._c.rooms.findIndex((r) => inRect(r.rect, cpt));
    if (ri < 0 || ri === s.r) return;
    this._c.rooms[s.r].furniture.splice(s.i, 1);
    (this._c.rooms[ri].furniture = this._c.rooms[ri].furniture || []).push(f);
    this._s = { t: 'furn', r: ri, i: this._c.rooms[ri].furniture.length - 1 };
  }

  _setOpening(s, seg) {
    if (s.k === 'entrance') this._c.entrance = seg;
    else this._c[OPEN_KINDS[s.k].key][s.i] = seg;
  }

  _key(e) {
    if (!this._dlg?.open) return;
    const typing = e.composedPath().some((n) => n.tagName === 'INPUT' || n.tagName === 'SELECT' || n.tagName === 'TEXTAREA');
    if (e.key === ' ' && !typing) { this._space = e.type === 'keydown'; }
    if (typing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) this._doRedo(); else this._doUndo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this._doRedo(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this._s) { e.preventDefault(); e.stopPropagation(); this._deleteSel(); return; }
    if (mod && e.key.toLowerCase() === 'd' && this._s) { e.preventDefault(); this._duplicateSel(); return; }
    if ((e.key === 'r' || e.key === 'R') && this._s?.t === 'furn') { e.preventDefault(); this._rotateFurn(); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (arrows && this._s) { e.preventDefault(); this._nudge(arrows[0] * (e.shiftKey ? 50 : ED_GRID), arrows[1] * (e.shiftKey ? 50 : ED_GRID)); }
  }
  _nudge(dx, dy) {
    const s = this._s, o = this._selObj();
    if (!o) return;
    this._change(() => {
      if (s.t === 'room') { o.rect = [o.rect[0] + dx, o.rect[1] + dy, o.rect[2] + dx, o.rect[3] + dy]; o.furniture = (o.furniture || []).map((f) => shiftFurn(f, dx, dy)); }
      else if (s.t === 'furn') setFurnRect(o, normFurn(o).r.map((v, i) => v + (i % 2 ? dy : dx)));
      else if (s.t === 'open') this._setOpening(s, shiftSeg(normSeg(o), dx, dy));
      else if (s.t === 'ent') o.at = [o.at[0] + dx, o.at[1] + dy];
      else if (s.t === 'door') o.at = [o.at[0] + dx, o.at[1] + dy];
      else if (s.t === 'dock') o.dock = [o.dock[0] + dx, o.dock[1] + dy];
    }, { keepSel: true, panel: false });
  }

  /* ---------------------------------------------------------------- object operations */
  _addRoom(R) {
    const n = this._c.rooms.length + 1;
    this._change(() => {
      this._c.rooms.push({ id: this._uniqueRoomId(`room_${n}`), name: `${t('ed_room')} ${n}`, rect: R.map(r0), furniture: [] });
      // a new room shows its handles only after a tap – so the next room can start right at its edge
      this._s = { t: 'room', i: this._c.rooms.length - 1, fresh: true };
    });
    requestAnimationFrame(() => { const inp = this._ins.querySelector('.einp'); inp?.focus(); inp?.select(); });
  }
  _uniqueRoomId(base) {
    let id = slug(base) || 'room', k = 2;
    const ids = new Set(this._c.rooms.map((r) => r.id));
    const b = id;
    while (ids.has(id)) id = `${b}_${k++}`;
    return id;
  }
  _addOpening(seg) {
    const k = this._openKind;
    this._change(() => {
      if (k === 'entrance') { this._c.entrance = seg; this._s = { t: 'open', k, i: 0, quiet: true }; }
      else { this._c[OPEN_KINDS[k].key].push(seg); this._s = { t: 'open', k, i: this._c[OPEN_KINDS[k].key].length - 1, quiet: true }; }
    });
  }
  _addFurniture(kind, at) {
    const def = FURN_KINDS[kind];
    const c = this._c;
    let ri = at ? c.rooms.findIndex((r) => inRect(r.rect, at)) : this._s?.t === 'room' ? this._s.i : this._s?.t === 'furn' ? this._s.r : -1;
    if (ri < 0 && at) ri = c.rooms.map((r, i) => [rectDist(r.rect, at), i]).sort((a, b) => a[0] - b[0])[0]?.[1] ?? -1;
    if (ri < 0) ri = 0;
    const room = c.rooms[ri];
    if (!room) { this._toast(t('ed_needRoom')); return; }
    const p = at || center(room.rect);
    const x = Math.round((p[0] - def.w / 2) / ED_GRID) * ED_GRID, y = Math.round((p[1] - def.h / 2) / ED_GRID) * ED_GRID;
    this._change(() => {
      (room.furniture = room.furniture || []).push([x, y, x + def.w, y + def.h, kind]);
      this._s = { t: 'furn', r: ri, i: room.furniture.length - 1, quiet: true };
      this._tool = 'furniture';
    });
  }
  _rotateFurn() {
    const f = this._selObj();
    if (!f) return;
    const [a, b, c, d] = normFurn(f).r, [cx, cy] = center([a, b, c, d]), w = c - a, h = d - b;
    this._change(() => setFurnRect(f, [cx - h / 2, cy - w / 2, cx + h / 2, cy + w / 2].map(r0)), { keepSel: true });
  }
  _deleteSel() {
    const s = this._s, c = this._c;
    if (!s) return;
    this._change(() => {
      if (s.t === 'room') c.rooms.splice(s.i, 1);
      else if (s.t === 'furn') c.rooms[s.r].furniture.splice(s.i, 1);
      else if (s.t === 'open') { if (s.k === 'entrance') delete c.entrance; else c[OPEN_KINDS[s.k].key].splice(s.i, 1); }
      else if (s.t === 'ent') {
        const eid = c.entities[s.i].entity;
        c.entities.splice(s.i, 1);
        for (const L of c.layers || []) if (L && typeof L === 'object' && Array.isArray(L.entities)) L.entities = L.entities.filter((x) => x !== eid);
      } else if (s.t === 'door') delete c.door.at;
      else if (s.t === 'dock') delete c.vacuum.dock;
      else if (s.t === 'wid' && c.widgets) delete c.widgets[s.k];
      else if (s.t === 'ul') { delete c.underlay; this._setUnderlay(null); }
      this._s = null;
    });
  }
  _duplicateSel() {
    const s = this._s, c = this._c, o = this._selObj();
    if (!o) return;
    this._change(() => {
      if (s.t === 'furn') { const f = deep(o); setFurnRect(f, normFurn(f).r.map((v) => v + 20)); c.rooms[s.r].furniture.push(f); this._s = { t: 'furn', r: s.r, i: c.rooms[s.r].furniture.length - 1 }; }
      else if (s.t === 'room') {
        const R = o.rect, w = R[2] - R[0];
        c.rooms.push({ ...deep(o), id: this._uniqueRoomId(o.id || 'room'), name: `${o.name} 2`, rect: [R[2], R[1], R[2] + w, R[3]], furniture: (o.furniture || []).map((f) => shiftFurn(f, w, 0)) });
        this._s = { t: 'room', i: c.rooms.length - 1 };
      }
    });
  }

  /* Home Assistant area → room: the room gets the area's name (if it still has a default name) and,
   * if wanted, the area's lights, thermostats, covers, media players are placed in it */
  _assignArea(i, areaId) {
    const c = this._c, room = c.rooms[i], h = this._hs() || {};
    if (!room || !areaId) return;
    let placed = 0;
    this._change(() => {
      room.area = areaId;
      const an = h.areas?.[areaId]?.name;
      if (an && (!room.name || new RegExp(`^(${t('ed_room')}|Room|Raum)( \\d+)?$`).test(room.name))) room.name = an;
      if (this._withDevices === false) return;
      let ids = Object.keys(h.states || {}).filter((id) => this._areaOf(id) === areaId && this._isPlaceable(id) && !c.entities.some((e) => e.entity === id && e.at));
      if (ids.some((id) => domainOf(id) === 'climate')) ids = ids.filter((id) => domainOf(id) !== 'sensor');
      const taken = c.entities.filter((e) => e.at).map((e) => e.at);
      for (const id of ids.sort()) {
        const at = freeSpot(room.rect, taken);
        taken.push(at);
        if (domainOf(id) === 'vacuum') { if (!c.vacuum?.entity) c.vacuum = { entity: id, dock: at }; continue; }
        const j = c.entities.findIndex((x) => x.entity === id);
        if (j >= 0) c.entities[j].at = at;
        else c.entities.push({ entity: id, at, ...(domainOf(id) === 'light' ? { icon: guessLampIcon(id, h.states[id]) } : {}) });
        placed++;
      }
    });
    this._toast(placed ? t('ed_assignedPlaced', room.name, placed) : t('ed_assigned', room.name));
  }
  /* rooms whose name matches an area's name get that area */
  _matchAreasByName() {
    const pairs = this._nameMatches();
    if (!pairs.length) return;
    const keep = this._withDevices;
    pairs.forEach(([i, a]) => this._assignArea(i, a));
    this._withDevices = keep;
    this._toast(t('ed_matched', pairs.length));
  }
  /* exact names first, then the same word stem without "room / zimmer / raum" ("Wohnen" ↔ "Wohnzimmer", "Bath" ↔ "Bathroom",
   * "Bad" ↔ "Badezimmer") – only when exactly one area fits */
  _nameMatches() {
    const used = new Set(this._c.rooms.map((r) => r.area).filter(Boolean));
    const free = () => this._areas().filter((x) => !used.has(x.area_id));
    const stem = (s) => {
      let x = normName(s).replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
      for (let k = 0; k < 2; k++) x = x.replace(/(zimmer|raum|room|bereich|area)$/, '');
      return x.replace(/(en|e|s)$/, '');
    };
    const out = [];
    const open = this._c.rooms.map((r, i) => (r.area ? null : i)).filter((i) => i != null);
    for (const pass of [0, 1]) for (const i of open) {
      if (out.some(([j]) => j === i)) continue;
      const n = normName(this._c.rooms[i].name);
      if (!n) continue;
      const st = stem(this._c.rooms[i].name);
      const hits = free().filter((x) => (pass === 0 ? normName(x.name) === n : st.length >= 3 && stem(x.name) === st));
      if (hits.length === 1) { out.push([i, hits[0].area_id]); used.add(hits[0].area_id); }
    }
    return out;
  }

  /* ---------------------------------------------------------------- devices */
  _layerDefs() {
    const list = this._c.layers?.length ? this._c.layers : (this._model()?.layers || []).map((L) => L.id);
    const out = list.map((l, i) => {
      if (typeof l === 'string') return LAYER_TYPES[l] ? { id: l, type: l, name: t(`layer_${l}`), icon: LAYER_TYPES[l].icon, kinds: LAYER_TYPES[l].kinds, ents: [] } : null;
      if (l && LAYER_TYPES[l.type] && !l.show && !l.entities) return { id: l.type, type: l.type, name: l.name || t(`layer_${l.type}`), icon: l.icon || LAYER_TYPES[l.type].icon, kinds: LAYER_TYPES[l.type].kinds, ents: [] };
      return l ? { id: String(l.id || `layer_${slug(l.name) || i + 1}`), type: 'custom', name: l.name || t('layer'), icon: l.icon || 'layers', kinds: [].concat(l.show || []), ents: [].concat(l.entities || []), raw: l } : null;
    }).filter(Boolean);
    // built-in layers are always offered for placing devices
    for (const type of ['light', 'climate', 'cover', 'vacuum']) if (!out.some((L) => L.id === type)) out.push({ id: type, type, name: t(`layer_${type}`), icon: LAYER_TYPES[type].icon, kinds: LAYER_TYPES[type].kinds, ents: [], hidden: true });
    return out;
  }
  _layerDef(id) { return this._layerDefs().find((L) => L.id === id); }
  _inLayerDef(L, eid, kind) { return L.kinds.includes(kind) || L.ents.includes(eid); }
  _layersFor(eid, kind) { return this._layerDefs().filter((L) => this._inLayerDef(L, eid, kind)).map((L) => L.id); }

  _areaOf(eid) {
    const h = this._hs() || {}, e = h.entities?.[eid];
    return e?.area_id || h.devices?.[e?.device_id]?.area_id || null;
  }

  /* where a new device goes: its HA area's room (free spot), else the visible centre */
  _spotFor(eid) {
    const c = this._c, area = this._areaOf(eid);
    let room = c.rooms.find((r) => r.area && r.area === area);
    if (!room && this._s?.t === 'room') room = c.rooms[this._s.i];
    const R = room?.rect;
    if (!R) {
      const r = this._cv.getBoundingClientRect();
      return this._unP(r.width / 2, r.height / 2).map(r0);
    }
    return freeSpot(R, c.entities.filter((x) => x.at).map((x) => x.at));
  }

  _placeEntity(eid, at) {
    const c = this._c;
    const L = this._layerDef(this._layerSel);
    const st = this._hs()?.states?.[eid], kind = kindOf(eid, st);
    if (domainOf(eid) === 'vacuum') { this._change(() => { c.vacuum = { ...(c.vacuum || {}), entity: eid, dock: at || c.vacuum?.dock || this._spotFor(eid) }; this._s = { t: 'dock', quiet: true }; }); return; }
    const i = c.entities.findIndex((x) => x.entity === eid);
    this._change(() => {
      const pos = at || this._spotFor(eid);
      if (i >= 0) { c.entities[i].at = pos; this._s = { t: 'ent', i, quiet: true }; }
      else {
        const e = { entity: eid, at: pos };
        if (kind === 'light') e.icon = guessLampIcon(eid, st);
        c.entities.push(e);
        this._s = { t: 'ent', i: c.entities.length - 1, quiet: true };
      }
      // devices added in an own layer belong to it
      if (L?.type === 'custom' && !L.kinds.includes(kind)) this._addToLayer(L.id, eid);
      this._ensureLayer(L);
    });
  }
  /* built-in layers appear as soon as something is placed for them */
  _ensureLayer(L) {
    if (!L || L.type === 'custom' || !this._c.layers?.length) return;
    if (!this._c.layers.some((l) => (typeof l === 'string' ? l : l.type) === L.type && !l.show)) this._c.layers.push(L.type);
  }
  _addToLayer(id, eid) {
    const l = (this._c.layers || []).find((x) => typeof x === 'object' && String(x.id || `layer_${slug(x.name)}`) === id);
    if (l && !(l.entities || []).includes(eid)) l.entities = [...(l.entities || []), eid];
  }
  _autoPlace(eids) {
    if (!eids.length) return;
    this._change(() => {
      for (const eid of eids) {
        const st = this._hs()?.states?.[eid], kind = kindOf(eid, st);
        if (this._c.entities.some((x) => x.entity === eid && x.at)) continue;
        const e = { entity: eid, at: this._spotFor(eid) };
        if (kind === 'light') e.icon = guessLampIcon(eid, st);
        const i = this._c.entities.findIndex((x) => x.entity === eid);
        if (i >= 0) this._c.entities[i].at = e.at; else this._c.entities.push(e);
        const L = this._layerDef(this._layerSel);
        if (L?.type === 'custom' && !L.kinds.includes(kind)) this._addToLayer(L.id, eid);
      }
    });
    this._toast(t('ed_placed', eids.length));
  }

  /* drag from a list (devices, furniture palette) onto the plan */
  _dragFrom(el, onDrop, ghostIcon, square, extra = {}) {
    let st = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || e.target.closest('.eadd')) return;
      st = { x: e.clientX, y: e.clientY, id: e.pointerId, ghost: null };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      if (!st.ghost && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 6) {
        st.ghost = mk('div', `edrag-ghost${square ? ' sq' : ''}${extra.label ? ' pill' : ''}`, `${icon(ghostIcon)}${extra.label ? `<span>${esc(extra.label)}</span>` : ''}`);
        this.$('.ew').append(st.ghost);
      }
      if (st.ghost) {
        st.ghost.style.left = `${e.clientX}px`; st.ghost.style.top = `${e.clientY}px`;
        if (extra.hover) { const r = this._cv.getBoundingClientRect(), inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; extra.hover(inside ? this._pt(e) : null); }
      }
    });
    const end = (e, cancel) => {
      if (!st || e.pointerId !== st.id) return;
      const g = st.ghost;
      st = null;
      if (!g) return;
      g.remove();
      extra.hover?.(null);
      const r = this._cv.getBoundingClientRect();
      if (!cancel && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) onDrop(this._pt(e).map(r0));
    };
    el.addEventListener('pointerup', (e) => end(e));
    el.addEventListener('pointercancel', (e) => end(e, true));
  }

  /* ---------------------------------------------------------------- underlay (photo / sketch of the floor plan) */
  _ulKey() { return `${CARD_TAG}:underlay:${this._c.id || 'default'}`; }
  _loadUnderlay() {
    if (!this._c.underlay?.rect) { this._ulSrc = null; return; }
    let src = this._c.underlay?.image || null;
    if (!src) try { src = localStorage.getItem(this._ulKey()); } catch (e) { /* private mode */ }
    this._ulSrc = src || null;
  }
  _setUnderlay(src) {
    this._ulSrc = src;
    try { if (src && src.startsWith('data:')) localStorage.setItem(this._ulKey(), src); else localStorage.removeItem(this._ulKey()); } catch (e) { this._toast(t('ed_ulNotStored')); }
  }
  _readImage(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        // shrink big photos so they fit into the browser storage
        const k = Math.min(1, 1800 / Math.max(img.width, img.height));
        const cvs = document.createElement('canvas');
        cvs.width = Math.round(img.width * k); cvs.height = Math.round(img.height * k);
        cvs.getContext('2d').drawImage(img, 0, 0, cvs.width, cvs.height);
        const url = cvs.toDataURL('image/jpeg', 0.82);
        // bright paper would glare in the dark editor: invert it (lines light on dark)
        const sm = document.createElement('canvas'); sm.width = 32; sm.height = 32;
        const sc = sm.getContext('2d', { willReadFrequently: true }); sc.drawImage(cvs, 0, 0, 32, 32);
        const dd = sc.getImageData(0, 0, 32, 32).data; let L = 0;
        for (let i = 0; i < dd.length; i += 4) L += 0.2126 * dd[i] + 0.7152 * dd[i + 1] + 0.0722 * dd[i + 2];
        const bright = L / 1024 > 150;
        const B = this._c.rooms.length ? bboxOf(this._c.rooms.map((r) => r.rect)) : null;
        const w = B ? B[2] - B[0] : 1200, h = (w * img.height) / img.width;
        // an imported plan already knows where its picture lies (image_rect): keep that if the proportions fit
        const old = !this._ulSrc && this._c.underlay?.rect, ar = img.height / img.width;
        const keep = old && Math.abs((old[3] - old[1]) / (old[2] - old[0]) - ar) < ar * 0.03;
        this._change(() => { this._c.underlay = { rect: keep ? old : [B ? B[0] : 0, B ? B[1] : 0, (B ? B[0] : 0) + w, (B ? B[1] : 0) + h].map(r0), opacity: bright ? 0.5 : 0.6, ...(bright ? { invert: true } : {}) }; });
        this._setUnderlay(url);
        this._fit();
        this._draw();
        this._panel();
        this._toast(t(keep ? 'ed_ulAligned' : 'ed_ulLoaded'));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  _measureClick(p) {
    const m = this._measure;
    if (!m) return;
    if (!m.a) m.a = p;
    else if (!m.b) { m.b = p; this._panel(); }
    this._draw();
  }
  _applyMeasure(lenCm) {
    const m = this._measure, u = this._c.underlay;
    if (!m?.a || !m.b || !u?.rect || !(lenCm > 0)) return;
    const d = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]);
    if (d < 1) return;
    const k = lenCm / d, [ax, ay] = m.a;
    this._change(() => { u.rect = u.rect.map((v, i) => r0((i % 2 ? ay : ax) + (v - (i % 2 ? ay : ax)) * k)); });
    this._measure = null;
    this._fit();
    this._draw();
    this._panel();
    this._toast(t('ed_measured'));
  }
}

/* ---------------------------------------------------------------- helpers shared by editor and auto setup */
function normEditorConfig(c) {
  c.rooms = (Array.isArray(c.rooms) ? c.rooms : []).filter((r) => normRect(r?.rect)).map((r, i) => ({ ...r, id: r.id || slug(r.name) || `room_${i + 1}`, rect: normRect(r.rect).map(r0), furniture: Array.isArray(r.furniture) ? r.furniture : [] }));
  c.windows = (c.windows || []).map(normSeg).filter(Boolean);
  c.doors = (c.doors || []).map(normSeg).filter(Boolean);
  if (c.entrance) c.entrance = normSeg(c.entrance);
  c.entities = (Array.isArray(c.entities) ? c.entities : []).map((e) => (typeof e === 'string' ? { entity: e } : e)).filter((e) => e?.entity);
  return c;
}

function cleanConfig(c0) {
  const c = deep(c0);
  if (!c.type) c.type = `custom:${CARD_TAG}`;
  for (const k of ['windows', 'doors', 'entities']) if (Array.isArray(c[k]) && !c[k].length) delete c[k];
  if (c.door && !c.door.open && !c.door.doorbell) delete c.door;
  if (c.vacuum && !c.vacuum.entity) delete c.vacuum;
  if (c.widgets && !Object.keys(c.widgets).length) delete c.widgets;
  if (Array.isArray(c.layers) && !c.layers.length) delete c.layers;
  for (const r of c.rooms || []) { if (!r.furniture?.length) delete r.furniture; if (!r.area) delete r.area; if (!r.label || r.label === 'top') delete r.label; if (!r.helpers?.length) delete r.helpers; }
  if (c.underlay) { c.underlay = { ...c.underlay }; if (String(c.underlay.image || '').startsWith('data:')) delete c.underlay.image; }
  // key order like in the docs
  const order = ['type', 'language', 'title', 'rooms', 'windows', 'doors', 'entrance', 'entities', 'layers', 'door', 'vacuum', 'weather', 'indoor', 'widgets', 'modes_label', 'layout', 'fit', 'mobile', 'scale', 'underlay'];
  const out = {};
  for (const k of order) if (c[k] !== undefined) out[k] = c[k];
  for (const k of Object.keys(c)) if (!(k in out)) out[k] = c[k];
  return out;
}

function shiftFurn(f, dx, dy) {
  if (Array.isArray(f)) return [r0(f[0] + dx), r0(f[1] + dy), r0(f[2] + dx), r0(f[3] + dy), ...f.slice(4)];
  return { ...f, rect: [r0(f.rect[0] + dx), r0(f.rect[1] + dy), r0(f.rect[2] + dx), r0(f.rect[3] + dy)] };
}
function setFurnRect(f, R) {
  if (!f) return;
  if (Array.isArray(f)) { f[0] = r0(R[0]); f[1] = r0(R[1]); f[2] = r0(R[2]); f[3] = r0(R[3]); } else f.rect = R.map(r0);
}
const shiftSeg = (s, dx, dy) => [r0(s[0] + dx), r0(s[1] + dy), r0(s[2] + dx), r0(s[3] + dy)];

/* a free spot in a room: grid positions away from the room name and from other markers */
function freeSpot(R, taken) {
  const [a, b, c, d] = R, w = c - a, h = d - b, m = Math.min(70, w / 4, h / 4);
  let best = null;
  for (let iy = 0; iy < 6; iy++) for (let ix = 0; ix < 6; ix++) {
    const p = [a + m + ((w - 2 * m) * (ix + 0.5)) / 6, b + m + ((h - 2 * m) * (iy + 0.5)) / 6];
    if (p[0] < a + Math.min(170, w * 0.6) && p[1] < b + Math.min(90, h * 0.35)) continue;
    const dist = Math.min(...taken.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])), 1e9);
    const score = Math.min(dist, 140) - Math.hypot(p[0] - (a + c) / 2, p[1] - (b + d) / 2) * 0.15;
    if (!best || score > best.s) best = { p, s: score };
  }
  return (best?.p || center(R)).map(r0);
}

function guessLampIcon(eid, st) {
  const n = `${eid} ${st?.attributes?.friendly_name || ''}`.toLowerCase();
  const pairs = [['plant|pflanz|grow', 'sprout'], ['chandelier|kronleuchter|luster|lüster', 'chandelier'], ['pendant|pendel|esstisch|dining', 'pendant'],
    ['strip|stripe|leiste|led_|lightstrip|band', 'strip'], ['spot|strahler|downlight', 'spot'], ['desk|schreibtisch', 'desklamp'], ['floor|steh', 'floorlamp'],
    ['wall|wand|mirror|spiegel|sconce', 'wall'], ['candle|kerze', 'candle'], ['ceiling|decke', 'ceiling'], ['bedside|nacht|lamp|lampe|leselampe|reading', 'lamp']];
  for (const [re, ic] of pairs) if (new RegExp(re).test(n)) return ic;
  return 'bulb';
}
