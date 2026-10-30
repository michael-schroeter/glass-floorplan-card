/* ================================================================== Floor plan editor: actions (tap / hold / double tap) and own tiles
 * Actions use Home Assistant's schema. Inside Home Assistant its own action editor is shown – in Home Assistant's look,
 * it knows every action, service and target. Without it (the demo) a short list of the common ones. */
const ACTION_KEYS = [['tap_action', 'ed_tap'], ['hold_action', 'ed_hold'], ['double_tap_action', 'ed_dbl']];
const TILE_ICONS = ['widget', 'bolt', 'gauge', 'sun', 'thermo', 'drop', 'humid', 'leaf', 'flame', 'plug', 'washer', 'coffee', 'camera', 'bell', 'shield', 'lock', 'home', 'sparkle', 'fan', 'tv', 'robot', 'battery', 'info', 'power'];
const eidOf = (e) => (typeof e === 'string' ? e : e?.entity);
/* the tiles every card may have (the layer card and the layer bar first) */
const WID_KEYS = ['card', 'bar', 'weather', 'indoor', 'door'];
/* a tile with buttons grows in these steps when more buttons are added */
const BTN_SIZES = [[1, 1], [2, 1], [2, 2], [2, 3]];
const BTN_MAX = tileBtnCap(BTN_SIZES[BTN_SIZES.length - 1]);
const ACT_LABEL = { toggle: 'toggle', 'more-info': 'more', navigate: 'navigate', url: 'url', 'perform-action': 'perform', 'call-service': 'perform', none: 'none' };

Object.assign(GfcEditor.prototype, {
  /* Home Assistant's form elements – they come with its card editors (loaded once if needed); never in the demo */
  _haForms() {
    if (this._haP) return this._haP;
    const h = this._hs?.();
    if (!h?.localize || !h.callWS) return (this._haP = Promise.resolve(false));
    const load = async () => {
      if (!customElements.get('ha-selector')) {
        try {
          const helpers = await window.loadCardHelpers?.();
          const card = await helpers?.createCardElement({ type: 'tile', entity: Object.keys(h.states || {})[0] || 'sun.sun' });
          await card?.constructor?.getConfigElement?.();
        } catch (e) { /* not there */ }
      }
      await Promise.race([customElements.whenDefined('ha-selector'), new Promise((r) => setTimeout(r, 3000))]);
      return !!customElements.get('ha-selector');
    };
    return (this._haP = load());
  },
  /* one undo step per field while typing in it */
  _snapOnce(key) {
    if (this._typKey !== key || Date.now() - (this._typT || 0) > 1500) this._snap();
    this._typKey = key;
    this._typT = Date.now();
  },

  /* ---------------------------------------------------------------- actions */
  /* what tapping, holding and double tapping do; `dflt` says what happens without an action */
  _actionsSection(I, o, entity, dflt) {
    I.append(this._el(`<h3>${esc(t('ed_actions'))}</h3>`));
    const box = mk('div', this._haUi ? 'eacts eha' : 'eacts');
    for (const [key, label] of ACTION_KEYS) box.append(this._haUi ? this._haAction(o, key, t(label), entity) : this._ownAction(o, key, t(label), entity));
    I.append(box);
    I.append(this._el(`<p class="small">${esc(dflt)}</p>`));
  },
  _haAction(o, key, label, entity) {
    const sel = document.createElement('ha-selector');
    sel.hass = this._hs();
    sel.selector = { ui_action: {} };
    // not required: only then does Home Assistant offer "Default action" (= the card's own behaviour)
    sel.required = false;
    sel.label = label;
    sel.value = typeof o[key] === 'string' ? { action: o[key] } : o[key];
    if (entity) sel.context = { entity_id: entity };
    sel.addEventListener('value-changed', (ev) => {
      ev.stopPropagation();
      const v = ev.detail?.value;
      this._snapOnce(key);
      if (v?.action) o[key] = v; else delete o[key];
      sel.value = v;
      this._draw();
    });
    return sel;
  },
  _ownAction(o, key, label, entity) {
    const cur = (typeof o[key] === 'string' ? { action: o[key] } : o[key]) || {}, act = cur.action || '';
    const w = mk('div', 'eact');
    const opts = [['', t('ed_act_default')], ['toggle', t('ed_act_toggle')], ['more-info', t('ed_act_more')], ['navigate', t('ed_act_navigate')],
      ['url', t('ed_act_url')], ['perform-action', t('ed_act_perform')], ['none', t('ed_act_none')]];
    if (act && !opts.some(([v]) => v === act)) opts.push([act, act]);
    w.append(this._fieldEl(label, this._drop(opts, act, (v) => { if (v) o[key] = { action: v }; else delete o[key]; })));
    const field = (k, ph, then) => w.append(this._fieldEl(null, this._inp(cur[k] ?? '', (v) => {
      o[key] = { ...o[key] };
      if (v) o[key][k] = v.trim(); else delete o[key][k];
      then?.(v.trim());
    }, { placeholder: ph })));
    if (act === 'navigate') field('navigation_path', '/lovelace/energy');
    if (act === 'url') field('url_path', 'https://…');
    if (act === 'perform-action') {
      // an action of the device's own domain (light.turn_on for a lamp) is meant for this device
      field('perform_action', 'script.movie_time', (v) => { if (entity && domainOf(v) === domainOf(entity)) o[key].target = { entity_id: entity }; else delete o[key].target; });
      const di = this._inp(cur.data ? JSON.stringify(cur.data) : '', (v) => {
        let d;
        try { d = v.trim() ? JSON.parse(v) : null; } catch (e) { d = undefined; }
        const ok = d === null || (d && typeof d === 'object' && !Array.isArray(d));
        di.classList.toggle('bad', !ok);
        if (!ok) return;
        o[key] = { ...o[key] };
        if (d) o[key].data = d; else delete o[key].data;
      }, { placeholder: '{"brightness_pct": 40}' });
      w.append(this._fieldEl(t('ed_act_data'), di));
    }
    if (act && act !== 'none') {
      w.append(this._fieldEl(t('ed_act_confirm'), this._tglEl(!!cur.confirmation, (on) => this._change(() => {
        o[key] = { ...o[key] };
        if (on) o[key].confirmation = true; else delete o[key].confirmation;
      }, { keepSel: true })), true));
    }
    return w;
  },
  /* the card's own behaviour for a device, in words */
  _actDefault(eid) {
    const st = this._hs()?.states?.[eid], d = domainOf(eid), kind = kindOf(eid, st);
    const tap = kind === 'light' || TOGGLE_DOMAINS.includes(d) ? 'ed_dt_toggle' : kind === 'cover' ? 'ed_dt_cover' : PRESS_DOMAINS.includes(d) ? 'ed_dt_press'
      : ['media', 'climate'].includes(kind) || ['lock', 'sensor', 'binary_sensor', 'alarm_control_panel'].includes(d) ? 'ed_dt_room' : 'ed_dt_info';
    return t('ed_actDefault', t(tap));
  },

  /* ---------------------------------------------------------------- places of the tiles – laptop and phone each their own */
  /* laptop: `widgets`, phone: `mobile.widgets` (in the phone's own, maybe turned plan) */
  _wids(create) {
    const c = this._c;
    if (this._mode !== 'phone') { if (create && !c.widgets) c.widgets = {}; return c.widgets || {}; }
    if (create) { c.mobile = c.mobile || {}; c.mobile.widgets = c.mobile.widgets || {}; }
    return c.mobile?.widgets || {};
  },
  _widGet(k) { return widgetOpt(this._wids(), k); },
  /* changes a tile's place or options in the view shown: only a place is stored as [x1, y1, x2, y2], with options as
   * { rect, … }; null / false remove a value (automatic place, the default) */
  _widSet(k, patch) {
    const W = this._wids(true);
    if (W[k] === false) return;
    const o = { ...widgetOpt(W, k), ...patch };
    delete o.off;
    for (const key of Object.keys(o)) if (o[key] == null || o[key] === false) delete o[key];
    if (o.rect) o.rect = o.rect.map(r0);
    const n = Object.keys(o).length;
    if (!n) delete W[k]; else W[k] = n === 1 && o.rect ? o.rect : o;
    if (Object.keys(W).length) return;
    if (this._mode === 'phone') dropPhoneWidgets(this._c); else delete this._c.widgets;
  },
  /* a tile that is gone (or changed its size): its places in both views go */
  _widForget(k, all) {
    for (const W of [this._c.widgets, this._c.mobile?.widgets]) {
      if (!W || !(k in W)) continue;
      if (all || Array.isArray(W[k])) delete W[k]; else if (W[k] && typeof W[k] === 'object') delete W[k].rect;
    }
  },
  /* the live card's element of a tile */
  _widEl(k) {
    const sr = this._card?.shadowRoot;
    if (!sr) return null;
    return k === 'card' ? sr.querySelector('.gcard') : k === 'bar' ? sr.querySelector('.tabs') : sr.querySelector(`.card[data-w="${CSS.escape(k)}"]`);
  },
  /* where a tile is on the canvas: its place in the plan, else where the card draws it (next to / below the plan,
   * the bar at the bottom of a phone) – the bar is always framed as it is drawn */
  _widBox(k) {
    const M = this._card?._M, R = M?.widgets?.[k];
    if (R && k !== 'bar') { const g = 6 * M.D; return this._rectS([R[0] + g, R[1] + g, R[2] - g, R[3] - g], true); }
    return this._cardBox(this._widEl(k));
  },
  /* a tile's place in the view's own plan – for one outside the plan where it is drawn (dragging it puts it in the plan) */
  _widRect(k) {
    const card = this._card, R = card?._M?.widgets?.[k];
    if (R && k !== 'bar') return [...R];
    const q = this._cardBox(this._widEl(k));
    if (!q) return null;
    const a = this._unP(q[0], q[1], true), b = this._unP(q[2], q[3], true);
    if (k !== 'bar' || !this._widEl(k).classList.contains('dock')) return [a[0], a[1], b[0], b[1]].map(r0);
    // the tab bar at the bottom of a phone is wider than the bar in the plan: its size there, around the same middle
    const u = card._u, n = card._M.layers.length, bt = Math.max(38, 60 * u), pad = Math.max(4, 6 * u);
    const long = (n * bt + (n - 1) * 4 * u + 2 * pad) / card._pu, short = (bt + 2 * pad) / card._pu, h = card._M.wopt.barH;
    const [w, hh] = h ? [long, short] : [short, long], cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
    return [cx - w / 2, cy - hh / 2, cx + w / 2, cy + hh / 2].map(r0);
  },
  /* laptop or phone – both are arranged on their own */
  _viewSwitch(I) {
    I.append(this._fieldEl(t('ed_arrangeFor'), this._segEl(['laptop', 'phone'].map((m) => [m, t(`ed_prev_${m}`), m]), this._mode, (v) => this._setMode(v))));
  },

  /* ---------------------------------------------------------------- the layer card and the layer bar */
  _cardBarSection(I) {
    const M = this._card?._M, phone = this._mode === 'phone', s = this._s;
    I.append(this._el(`<h3>${esc(t('ed_cardAndBar'))}</h3>`));
    const list = mk('div', 'elist');
    list.style.marginTop = '0';
    for (const k of ['card', 'bar']) {
      if (k === 'bar' && (M?.layers.length || 0) < 2) continue;
      const o = this._widGet(k), inPlan = !!M?.widgets?.[k];
      const where = phone && !inPlan ? t(k === 'card' ? 'ed_placeBelow' : 'ed_placeBottom') : t(o.rect ? 'ed_placedByYou' : 'ed_auto');
      const what = k === 'card' ? t(o.compact ? 'ed_cardCompact' : 'ed_cardFull') : phone && !inPlan ? '' : t(M?.wopt?.barH ? 'ed_barH' : 'ed_barV');
      const row = this._el(`<span class="ei">${icon(k === 'card' ? 'widget' : 'layers')}</span><div><b>${esc(t(`ed_tile_${k}`))}</b><small>${esc([what, where].filter(Boolean).join(' · '))}</small></div><span class="ego">${icon('chevR')}</span>`, 'erow');
      row.style.cursor = 'pointer';
      row.classList.toggle('on', s?.t === 'wid' && s.k === k);
      row.addEventListener('click', () => this._select({ t: 'wid', k }, 'tiles'));
      list.append(row);
    }
    I.append(list);
  },
  /* settings of the layer card / the layer bar in the view shown */
  _cardBarPanel(I, k) {
    const o = this._widGet(k), phone = this._mode === 'phone', M = this._card?._M, inPlan = !!M?.widgets?.[k];
    const lead = o.rect ? 'ed_tileManual' : inPlan ? 'ed_tileAuto' : !phone ? 'ed_tileSide' : o.place === 'plan' ? 'ed_noFreeSpot' : k === 'card' ? 'ed_cardBelowLead' : 'ed_barDockLead';
    I.append(this._el(`<h2>${esc(t(`ed_tile_${k}`))}</h2><p class="lead">${esc(t(k === 'card' ? 'ed_cardWhat' : 'ed_barWhat'))} ${esc(t(lead))}</p>`));
    this._viewSwitch(I);
    const set = (patch) => this._change(() => this._widSet(k, patch), { keepSel: true });
    if (phone) {
      const v = o.rect || o.place === 'plan' ? 'plan' : 'out';
      I.append(this._fieldEl(t('ed_place'), this._segEl([['out', t(k === 'card' ? 'ed_placeBelow' : 'ed_placeBottom')], ['plan', t('ed_placePlan')]], v, (x) => {
        if (x !== v) set(x === 'plan' ? { place: 'plan' } : { place: null, rect: null });
      })));
    }
    if (k === 'card') {
      I.append(this._fieldEl(t('ed_cardSize'), this._segEl([['full', t('ed_cardFull')], ['compact', t('ed_cardCompact')]], o.compact ? 'compact' : 'full', (x) => set({ compact: x === 'compact' }))));
      I.append(this._el(`<p class="small">${esc(t('ed_cardHelp'))}</p>`));
    } else if (!phone || inPlan || o.place === 'plan') {
      // turning the bar keeps its middle where it is
      const h = phone ? o.direction !== 'vertical' : o.direction === 'horizontal';
      const turn = (R) => { const cx = (R[0] + R[2]) / 2, cy = (R[1] + R[3]) / 2, w = R[2] - R[0], hh = R[3] - R[1]; return [cx - hh / 2, cy - w / 2, cx + hh / 2, cy + w / 2]; };
      I.append(this._fieldEl(t('ed_barDir'), this._segEl([['v', t('ed_barV')], ['h', t('ed_barH')]], h ? 'h' : 'v', (x) => {
        if ((x === 'h') === h) return;
        set({ direction: (x === 'h') === phone ? null : x === 'h' ? 'horizontal' : 'vertical', rect: o.rect ? turn(o.rect) : null });
      })));
    }
    if (o.rect) {
      const b = this._btn(`${icon('wand')}<span>${esc(t('ed_auto'))}</span>`, 'wide', () => set({ rect: null }));
      b.style.marginTop = '12px';
      I.append(b);
    }
    I.append(this._el(`<p class="small">${esc(t('ed_viewsApart'))}</p>`));
  },

  /* ---------------------------------------------------------------- own tiles */
  _tiles() { return Array.isArray(this._c.tiles) ? this._c.tiles : []; },
  _tileById(id) { return this._tiles().find((x) => x.id === id) || null; },
  _tileName(x) { const f = eidOf([].concat(x.entities || [])[0]); return x.name || (x.card ? t('ed_tileCard') : Array.isArray(x.buttons) ? t('ed_tileButtons') : f ? this._fname(f) : t('tile')); },
  _tileIcon(x) {
    const f = eidOf([].concat(x.entities || [])[0]);
    return x.icon || (Array.isArray(x.buttons) ? 'press' : !x.card && f ? GlassFloorplanCard.prototype._autoIcon(f, this._hs()?.states?.[f]) : 'widget');
  },
  _ownTilesSection(I) {
    I.append(this._el(`<h3>${esc(t('ed_ownTiles'))}</h3>`));
    const list = mk('div', 'elist');
    list.style.marginTop = '0';
    const s = this._s;
    for (const x of this._tiles()) {
      const n = [].concat(x.entities || []).length;
      const sub = x.card ? t('ed_tileCardOf', String(x.card.type || '').replace(/^custom:/, '')) : Array.isArray(x.buttons) ? t('ed_nButtons', x.buttons.length) : t('ed_nValues', n);
      const row = this._el(`<span class="ei">${this._iconHtml(this._tileIcon(x))}</span><div><b>${esc(this._tileName(x))}</b><small>${esc(sub)}</small></div><span class="ego">${icon('chevR')}</span>`, 'erow');
      row.style.cursor = 'pointer';
      row.classList.toggle('on', (s?.t === 'tile' && s.id === x.id) || (s?.t === 'wid' && s.k === x.id));
      row.addEventListener('click', () => this._select({ t: 'tile', id: x.id }, 'tiles'));
      list.append(row);
    }
    if (!this._tiles().length) list.append(this._el(`<p class="small" style="margin:0 4px">${esc(t('ed_ownTilesNone'))}</p>`));
    I.append(list);
    const b = this._btn(`${icon('plus')}<span>${esc(t('ed_newTile'))}</span>`, 'wide blue', () => this._change(() => {
      const id = `tile_${uid()}`;
      this._c.tiles = [...this._tiles(), { id }];
      this._s = { t: 'tile', id };
    }));
    b.style.marginTop = '10px';
    I.append(b);
  },

  /* a tile's settings: name, values or a Home Assistant card, icon, actions, size */
  _pTile(I) {
    const s = this._s, x = this._tileById(s.t === 'tile' ? s.id : s.k);
    if (!x) return;
    const h = this._hs() || {}, ents = [].concat(x.entities || []), isCard = !!x.card, kind = isCard ? 'card' : Array.isArray(x.buttons) ? 'buttons' : 'values';
    I.append(this._el(`<h2>${esc(this._tileName(x))}</h2>`));
    I.append(this._fieldEl(t('ed_name'), this._inp(x.name || '', (v) => { if (v) x.name = v; else delete x.name; }, { placeholder: kind === 'buttons' ? t('ed_btnTileNoName') : this._tileName({ ...x, name: '' }) })));
    I.append(this._fieldEl(t('ed_tileShows'), this._segEl([['values', t('ed_tileValues'), 'gauge'], ['buttons', t('ed_tileButtons'), 'press'], ['card', t('ed_tileCard'), 'widget']], kind, (v) => {
      if (v === kind) return;
      // values become buttons and the other way round
      this._change(() => {
        const ids = kind === 'buttons' ? x.buttons.map((b) => b.entity).filter(Boolean) : ents.map(eidOf);
        for (const k of ['card', 'buttons', 'entities', 'size']) delete x[k];
        if (v === 'card') x.card = { type: 'markdown', content: t('ed_tileCardHello') };
        else if (v === 'buttons') { x.buttons = ids.slice(0, BTN_MAX).map((entity) => ({ entity })); this._fitBtns(x); }
        else if (ids.length) x.entities = ids;
        this._widForget(x.id);
      }, { keepSel: true });
    })));
    if (kind === 'buttons') this._btnsSection(I, x);
    else if (!isCard) {
      // the values – the first one large
      const list = mk('div', 'elist');
      list.style.marginTop = '0';
      ents.forEach((en, i) => {
        const id = eidOf(en), st = h.states?.[id];
        const row = this._el(`<span class="ei">${icon(GlassFloorplanCard.prototype._autoIcon(id, st))}</span><div><b>${esc(en?.name || this._fname(id))}</b><small>${esc(i ? id : `${t('ed_tileBig')} · ${id}`)}</small></div>`, 'erow');
        row.style.cursor = 'default';
        if (i) {
          const up = mk('button', 'eadd', icon('chevU'));
          up.title = t('ed_tileMakeBig');
          up.addEventListener('click', () => this._change(() => { const a = [...ents]; a.unshift(a.splice(i, 1)[0]); x.entities = a; }, { keepSel: true }));
          row.append(up);
        }
        const del = mk('button', 'eadd del', icon('minus'));
        del.title = t('ed_delete');
        del.addEventListener('click', () => this._change(() => { x.entities = ents.filter((_, j) => j !== i); if (!x.entities.length) delete x.entities; }, { keepSel: true }));
        row.append(del);
        list.append(row);
      });
      if (!ents.length) list.append(this._el(esc(t('ed_noValues')), 'eempty'));
      I.append(this._fieldEl(t('ed_tileValuesHead'), list));
      const add = this._btn(`${icon('plus')}<span>${esc(t('ed_addValue'))}</span>`, 'wide', () => { this._tilePick = x.id; this._pq = ''; this._panel(); });
      add.style.marginTop = '10px';
      I.append(add);
      // icon (tap the chosen one again: from the first value)
      const cur = this._tileIcon(x), grid = mk('div', 'eicons');
      for (const n of TILE_ICONS.includes(cur) ? TILE_ICONS : [cur, ...TILE_ICONS.slice(0, -1)]) {
        const b = mk('button', n === cur ? 'act' : '', this._iconHtml(n));
        b.title = n;
        b.addEventListener('click', () => this._change(() => { if (x.icon === n) delete x.icon; else x.icon = n; }, { keepSel: true }));
        grid.append(b);
      }
      I.append(this._fieldEl(t('ed_icon'), grid));
      this._actionsSection(I, x, eidOf(ents[0]), t('ed_tileActDefault'));
    } else this._cardField(I, x);
    // size in tiles
    I.append(this._el(`<h3>${esc(t('ed_tileSize'))}</h3>`));
    const sz = [].concat(x.size ?? []), w = sz.length > 1 ? sz[0] : 1, hh = sz.length > 1 ? sz[1] : sz[0] || (isCard ? 2 : 1);
    const setSize = (nw, nh) => this._change(() => {
      if (nw === 1 && nh === (isCard ? 2 : 1)) delete x.size; else x.size = [nw, nh];
      this._widForget(x.id);
    }, { keepSel: true });
    const seg = (opts, v, fn) => { const e = this._segEl(opts.map((n) => [String(n), String(n)]), String(v), (val) => fn(+val)); e.style.width = `${opts.length * 46}px`; return e; };
    I.append(this._fieldEl(t('ed_tileWidth'), seg([1, 2], w, (v) => setSize(v, hh)), true));
    I.append(this._fieldEl(t('ed_tileHeight'), seg([1, 2, 3], hh, (v) => setSize(w, v)), true));
    if (kind === 'buttons') {
      const cap = tileBtnCap([w, hh]), over = x.buttons.length - cap;
      I.append(this._el(`<p class="small${over > 0 ? ' ewarn' : ''}">${esc(over > 0 ? t('ed_btnHidden', over) : t('ed_btnCap', cap))}</p>`));
    }
    // where it is – in the view shown
    const manual = !!this._widGet(x.id).rect, inPlan = !!this._card?._M?.widgets?.[x.id];
    I.append(this._el(`<p class="small">${esc(t(manual ? 'ed_tileManual' : inPlan ? 'ed_tileAuto' : 'ed_tileSide'))}</p>`));
    const row = mk('div', 'ebtns');
    if (manual) row.append(this._btn(`${icon('wand')}<span>${esc(t('ed_auto'))}</span>`, '', () => this._change(() => this._widSet(x.id, { rect: null }), { keepSel: true })));
    row.append(this._delBtn(t('ed_deleteTile'), () => this._change(() => {
      this._c.tiles = this._tiles().filter((y) => y !== x);
      this._widForget(x.id, true);
      if (!this._c.tiles.length) delete this._c.tiles;
      this._s = null;
    })));
    I.append(row);
  },

  /* the Home Assistant card of a tile: Home Assistant's YAML editor, else JSON (demo) */
  _cardField(I, x) {
    if (this._haUi && customElements.get('ha-yaml-editor')) {
      const ed = document.createElement('ha-yaml-editor');
      ed.hass = this._hs();
      ed.defaultValue = x.card;
      ed.addEventListener('value-changed', (ev) => {
        ev.stopPropagation();
        const v = ev.detail?.value;
        if (ev.detail?.isValid === false || !v || typeof v !== 'object' || Array.isArray(v) || !v.type) return;
        this._snapOnce('card');
        x.card = v;
        this._draw();
      });
      const w = mk('div', 'eha code');
      w.append(ed);
      I.append(this._fieldEl(t('ed_tileCardYaml'), w));
    } else {
      const ta = mk('textarea', 'einp ecode');
      ta.value = JSON.stringify(x.card, null, 2);
      ta.spellcheck = false;
      ta.addEventListener('input', () => {
        let v = null;
        try { v = JSON.parse(ta.value); } catch (e) { /* not finished yet */ }
        const ok = v && typeof v === 'object' && !Array.isArray(v) && v.type;
        ta.classList.toggle('bad', !ok);
        if (!ok) return;
        this._snapOnce('card');
        x.card = v;
        this._draw();
      });
      I.append(this._fieldEl(t('ed_tileCardJson'), ta));
    }
    I.append(this._el(`<p class="small">${esc(t('ed_tileCardHelp'))}</p>`));
  },

  /* every entity to choose from as a value of the tile (or for its buttons) */
  _tilePickerView(I, x) {
    if (Array.isArray(x.buttons)) { this._btnPickerView(I, x); return; }
    const h = this._hs() || {};
    I.append(this._el(`<h2>${esc(t('ed_addValueTo', this._tileName(x)))}</h2><p class="lead">${esc(t('ed_tilePickLead'))}</p>`));
    I.append(this._searchEl('_pq', t('ed_searchAll')));
    const q = (this._pq || '').trim().toLowerCase();
    const inT = new Set([].concat(x.entities || []).map(eidOf));
    const ids = this._matchQ(Object.keys(h.states || {}).filter((id) => !h.entities?.[id]?.hidden && !['update', 'tts', 'stt', 'conversation', 'wake_word', 'ai_task', 'notify'].includes(domainOf(id))), q);
    this._groupedList(I, ids, (id) => {
      const on = inT.has(id);
      const row = this._el(`<span class="ei">${icon(GlassFloorplanCard.prototype._autoIcon(id, h.states[id]))}</span><div><b>${esc(this._fname(id))}</b><small>${esc(id)}</small></div><button class="eadd">${icon(on ? 'check' : 'plus')}</button>`, `erow${on ? ' placed' : ''}`);
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => this._change(() => {
        const a = [].concat(x.entities || []);
        x.entities = on ? a.filter((e) => eidOf(e) !== id) : [...a, id];
        if (!x.entities.length) delete x.entities;
      }, { keepSel: true }));
      return row;
    }, { q, placed: inT, scope: 'tile', closed: true });
    if (!ids.length) I.append(this._el(esc(t(q ? 'ed_noMatch' : 'ed_noEntities')), 'eempty'));
  },

  /* ---------------------------------------------------------------- tiles with buttons */
  _btnIcon(b) {
    if (b.icon) return b.icon;
    if (!b.entity) return 'press';
    const pe = this._c.entities.find((e) => e.entity === b.entity);
    return pe?.icon || (domainOf(b.entity) === 'light' ? 'bulb' : GlassFloorplanCard.prototype._autoIcon(b.entity, this._hs()?.states?.[b.entity]));
  },
  /* the name the card shows: without the device's name in front (like _shortName of the card) */
  _btnName(b) {
    if (b.name || !b.entity) return b.name || t('button');
    const h = this._hs() || {}, full = this._fname(b.entity), dev = h.devices?.[h.entities?.[b.entity]?.device_id], dn = dev?.name_by_user || dev?.name;
    if (dn && full.length > dn.length + 1 && full.toLowerCase().startsWith(`${String(dn).toLowerCase()} `)) { const r = full.slice(dn.length + 1).trim(); return r.charAt(0).toUpperCase() + r.slice(1); }
    return full;
  },
  /* what a tap does, in words (an action of its own, else the device) */
  _btnSub(b) {
    const a = normAction(b.tap_action), k = a && ACT_LABEL[a.action];
    const act = a ? `${k ? t(`ed_act_${k}`) : a.action}${a.navigation_path ? ` ${a.navigation_path}` : a.perform_action ? ` ${a.perform_action}` : ''}` : '';
    return [b.entity || t('ed_btnNoDevice'), act].filter(Boolean).join(' · ');
  },
  /* the smallest size from the steps that holds all buttons (never smaller than it is) */
  _fitBtns(x) {
    const cur = normTile(x, 0).size, n = x.buttons.length;
    if (tileBtnCap(cur) >= n) return false;
    const next = BTN_SIZES.find(([w, h]) => w >= cur[0] && h >= cur[1] && tileBtnCap([w, h]) >= n) || BTN_SIZES[BTN_SIZES.length - 1];
    x.size = next;
    this._widForget(x.id);
    return true;
  },
  /* the buttons of a tile: tap one for its device, name, icon and actions */
  _btnsSection(I, x) {
    const list = mk('div', 'elist'), cap = tileBtnCap(normTile(x, 0).size);
    list.style.marginTop = '0';
    x.buttons.forEach((b, i) => {
      const row = this._el(`<span class="ei">${this._iconHtml(this._btnIcon(b))}</span><div><b>${esc(this._btnName(b))}</b><small>${esc(i < cap ? this._btnSub(b) : t('ed_btnNoRoom'))}</small></div>`, `erow${i < cap ? '' : ' dim'}`);
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => { this._tb = { id: x.id, i }; this._panel(); });
      if (i) {
        const up = mk('button', 'eadd', icon('chevU'));
        up.title = t('ed_moveUp');
        up.addEventListener('click', (e) => { e.stopPropagation(); this._change(() => { x.buttons.splice(i - 1, 0, x.buttons.splice(i, 1)[0]); }, { keepSel: true }); });
        row.append(up);
      }
      const del = mk('button', 'eadd del', icon('minus'));
      del.title = t('ed_deleteButton');
      del.addEventListener('click', (e) => { e.stopPropagation(); this._change(() => { x.buttons.splice(i, 1); }, { keepSel: true }); });
      row.append(del);
      list.append(row);
    });
    if (!x.buttons.length) list.append(this._el(esc(t('ed_noButtons')), 'eempty'));
    I.append(this._fieldEl(t('ed_tileButtonsHead'), list));
    const add = this._btn(`${icon('plus')}<span>${esc(t('ed_addButton'))}</span>`, 'wide', () => { this._tilePick = x.id; this._pq = ''; this._panel(); });
    add.style.marginTop = '10px';
    add.disabled = x.buttons.length >= BTN_MAX;
    I.append(add);
  },
  /* one button: its device (or none – only an action), name, icon and what tapping, holding and double tapping do */
  _tileBtnView(I, x, i) {
    const b = x.buttons[i];
    I.append(this._el(`<h2>${esc(this._btnName(b))}</h2>`));
    const dev = mk('div', 'elist');
    dev.style.marginTop = '0';
    const row = b.entity
      ? this._el(`<span class="ei">${this._iconHtml(this._btnIcon({ entity: b.entity }))}</span><div><b>${esc(this._fname(b.entity))}</b><small>${esc(b.entity)}</small></div><button class="eadd del" title="${esc(t('ed_btnNoDevice'))}">${icon('minus')}</button>`, 'erow')
      : this._el(`<span class="ei">${icon('plus')}</span><div><b>${esc(t('ed_btnChoose'))}</b><small>${esc(t('ed_btnNoDeviceSub'))}</small></div>`, 'erow');
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => { this._tilePick = x.id; this._pq = ''; this._panel(); });
    row.querySelector('.del')?.addEventListener('click', (e) => { e.stopPropagation(); this._change(() => { delete b.entity; }, { keepSel: true }); });
    dev.append(row);
    I.append(this._fieldEl(t('ed_btnDevice'), dev));
    I.append(this._fieldEl(t('ed_name'), this._inp(b.name || '', (v) => { if (v) b.name = v; else delete b.name; }, { placeholder: this._btnName({ entity: b.entity }) })));
    // icon (tap the chosen one again: the device's own)
    const cur = this._btnIcon(b), light = domainOf(b.entity || '') === 'light';
    const base = light ? LAMP_ICONS : [...new Set([...DEVICE_ICONS, ...TILE_ICONS])];
    const grid = mk('div', 'eicons');
    for (const n of base.includes(cur) ? base : [cur, ...base]) {
      const btn = mk('button', n === cur ? 'act' : '', this._iconHtml(n));
      btn.title = n;
      btn.addEventListener('click', () => this._change(() => { if (b.icon === n) delete b.icon; else b.icon = n; }, { keepSel: true }));
      grid.append(btn);
    }
    I.append(this._fieldEl(t('ed_icon'), grid));
    const d = domainOf(b.entity || ''), tap = TOGGLE_DOMAINS.includes(d) ? 'ed_dt_toggle' : PRESS_DOMAINS.includes(d) ? 'ed_dt_press' : d === 'cover' ? 'ed_dt_cover' : 'ed_dt_info';
    this._actionsSection(I, b, b.entity, b.entity ? t('ed_btnActDefault', t(tap)) : t('ed_btnActNone'));
    const rowB = mk('div', 'ebtns');
    rowB.append(this._delBtn(t('ed_deleteButton'), () => this._change(() => { x.buttons.splice(i, 1); this._tb = null; }, { keepSel: true })));
    I.append(rowB);
  },
  /* devices for the buttons: tap adds / removes one – or, coming from a button, chooses its device */
  _btnPickerView(I, x) {
    const h = this._hs() || {}, one = this._tb?.id === x.id ? x.buttons[this._tb.i] : null;
    I.append(this._el(`<h2>${esc(one ? t('ed_btnPickOne', this._btnName(one)) : t('ed_addButtonTo', this._tileName(x)))}</h2><p class="lead">${esc(t(one ? 'ed_btnPickOneLead' : 'ed_btnPickLead'))}</p>`));
    if (!one) {
      // a button that only runs an action (navigate …)
      const free = this._el(`<span class="ei">${icon('press')}</span><div><b>${esc(t('ed_btnNoDeviceRow'))}</b><small>${esc(t('ed_btnNoDeviceSub'))}</small></div><button class="eadd">${icon('plus')}</button>`, 'erow');
      free.style.cursor = 'pointer';
      free.addEventListener('click', () => this._change(() => {
        x.buttons.push({ name: t('button'), icon: 'sparkle' });
        if (this._fitBtns(x)) this._toast(t('ed_tileGrew'));
        this._tilePick = null;
        this._tb = { id: x.id, i: x.buttons.length - 1 };
      }, { keepSel: true }));
      const fl = mk('div', 'elist');
      fl.style.marginTop = '0';
      fl.append(free);
      I.append(fl);
    }
    I.append(this._searchEl('_pq', t('ed_searchAll')));
    const q = (this._pq || '').trim().toLowerCase();
    const inT = new Set(x.buttons.map((b) => b.entity).filter(Boolean));
    const ids = this._matchQ(Object.keys(h.states || {}).filter((id) => !h.entities?.[id]?.hidden && !NO_DEVICE_DOMAINS.includes(domainOf(id))), q);
    this._groupedList(I, ids, (id) => {
      const on = one ? one.entity === id : inT.has(id);
      const row = this._el(`<span class="ei">${this._iconHtml(this._btnIcon({ entity: id }))}</span><div><b>${esc(this._fname(id))}</b><small>${esc(id)}</small></div><button class="eadd">${icon(on ? 'check' : 'plus')}</button>`, `erow${on ? ' placed' : ''}`);
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        if (one) { this._change(() => { one.entity = id; this._tilePick = null; }, { keepSel: true }); return; }
        if (!on && x.buttons.length >= BTN_MAX) { this._toast(t('ed_btnFull', BTN_MAX)); return; }
        let grew = false;
        this._change(() => {
          if (on) x.buttons = x.buttons.filter((b) => b.entity !== id);
          else { x.buttons.push({ entity: id }); grew = this._fitBtns(x); }
        }, { keepSel: true });
        if (grew) this._toast(t('ed_tileGrew'));
      });
      return row;
    }, { q, placed: one ? new Set(one.entity ? [one.entity] : []) : inT, scope: 'tile', closed: true });
    if (!ids.length) I.append(this._el(esc(t(q ? 'ed_noMatch' : 'ed_noEntities')), 'eempty'));
  },
});

Object.assign(STR.en, {
  ed_actions: 'Actions', ed_tap: 'Tap', ed_hold: 'Hold', ed_dbl: 'Double tap',
  ed_act_default: 'Default', ed_act_toggle: 'Toggle', ed_act_more: 'More info', ed_act_navigate: 'Open a dashboard page', ed_act_url: 'Open a website',
  ed_act_perform: 'Perform action', ed_act_none: 'Nothing', ed_act_data: 'Data (JSON, optional)', ed_act_confirm: 'Ask first',
  ed_actDefault: (x) => `Default: a tap ${x}, holding opens the room, a double tap does nothing.`,
  ed_dt_toggle: 'switches it on or off', ed_dt_cover: 'moves it up or down', ed_dt_press: 'runs it', ed_dt_room: 'opens the room', ed_dt_info: 'opens the info dialog',
  ed_tileActDefault: 'Default: a tap opens the info of the first value, holding opens its device page.',
  ed_ownTiles: 'Own tiles', ed_ownTilesNone: 'Values of your choice or any Home Assistant card – in the same glass look.', ed_newTile: 'Add a tile',
  ed_nValues: (n) => (n ? `${n} ${pl(n, 'value', 'values')}` : 'No values yet'), ed_tileCardOf: (x) => `Home Assistant card · ${x}`,
  ed_tileShows: 'Shows', ed_tileValues: 'Values', ed_tileCard: 'HA card', ed_tileValuesHead: 'Values – the first one large', ed_tileBig: 'large',
  ed_tileMakeBig: 'Show large', ed_addValue: 'Add a value', ed_addValueTo: (n) => `Values for “${n}”`,
  ed_tilePickLead: 'Sensors, switches, anything – the first one is shown large.', ed_noValues: 'No values yet – add one.',
  ed_tileCardYaml: 'Card (YAML)', ed_tileCardJson: 'Card (JSON)',
  ed_tileCardHelp: 'Any card of your dashboard, e.g. picture-entity, history-graph, thermostat or a card from HACS. It keeps its own look inside the glass frame.',
  ed_tileCardHello: '**Hello!** Change the type to show any card.',
  ed_tileSize: 'Size', ed_tileWidth: 'Width', ed_tileHeight: 'Height', ed_deleteTile: 'Remove tile',
  ed_tileSide: 'No free corner in the plan – it stands next to it (on a phone below it).',
  ed_arrangeFor: 'Arranging for', ed_viewsApart: 'Laptop and phone are arranged separately – what you change here is only for this view.',
  ed_cardAndBar: 'Layer card & layer bar', ed_infoTiles: 'Tiles', ed_placedByYou: 'placed by you',
  ed_cardWhat: 'The overview of the layer shown, with “Mode” and “All off”.', ed_barWhat: 'Switches between the layers.',
  ed_cardSize: 'Size', ed_cardFull: 'Normal', ed_cardCompact: 'Compact',
  ed_cardHelp: 'Compact: the state with round buttons for mode and “All off” – it needs much less room.',
  ed_place: 'Place', ed_placeBelow: 'Below the plan', ed_placeBottom: 'Bottom of the screen', ed_placePlan: 'In the plan',
  ed_barDir: 'Direction', ed_barV: 'Vertical', ed_barH: 'Horizontal',
  ed_cardBelowLead: 'It sits below the plan, where your thumb is – put it into the plan to place it yourself.',
  ed_barDockLead: 'It floats at the bottom of the screen – put it into the plan to place it yourself.',
  ed_noFreeSpot: 'No free corner in the plan – drag it where you like.',
  ed_hint_tiles_phone: 'Drag tiles, the layer card or the layer bar – the phone has places of its own',
  ed_tileButtons: 'Buttons', ed_nButtons: (n) => (n ? `${n} ${pl(n, 'button', 'buttons')}` : 'No buttons yet'), ed_btnTileNoName: 'No heading',
  ed_tileButtonsHead: 'Buttons – in this order', ed_noButtons: 'No buttons yet – add one.', ed_addButton: 'Add a button',
  ed_addButtonTo: (n) => `Buttons for “${n}”`, ed_btnPickLead: 'Tap a device to give it a button – lights, switches, scenes, covers, anything. Tap again to remove it.',
  ed_btnPickOne: (n) => `Device for “${n}”`, ed_btnPickOneLead: 'The button switches this device just like on the plan.',
  ed_btnNoDeviceRow: 'Button without a device', ed_btnNoDeviceSub: 'Only an action – open a dashboard page, run a script …',
  ed_btnCap: (n) => `Room for ${n} buttons in this size – a larger tile holds more.`,
  ed_btnHidden: (n) => `${n} ${pl(n, 'button does', 'buttons do')} not fit – make the tile larger.`, ed_btnNoRoom: 'Does not fit – make the tile larger',
  ed_btnFull: (n) => `A tile holds at most ${n} buttons`, ed_tileGrew: 'The tile got larger for the new button',
  ed_btnDevice: 'Device', ed_btnNoDevice: 'No device', ed_btnChoose: 'Choose a device',
  ed_btnActDefault: (x) => `Default: a tap ${x}, holding opens its device page, a double tap does nothing.`,
  ed_btnActNone: 'Without a device the button does only what you set for tapping, holding and double tapping.',
  ed_deleteButton: 'Remove button', ed_moveUp: 'Move forward',
});
Object.assign(STR.de, {
  ed_actions: 'Aktionen', ed_tap: 'Antippen', ed_hold: 'Gedrückt halten', ed_dbl: 'Doppelt tippen',
  ed_act_default: 'Standard', ed_act_toggle: 'Umschalten', ed_act_more: 'Mehr Infos', ed_act_navigate: 'Dashboard-Seite öffnen', ed_act_url: 'Webseite öffnen',
  ed_act_perform: 'Aktion ausführen', ed_act_none: 'Nichts', ed_act_data: 'Daten (JSON, optional)', ed_act_confirm: 'Vorher nachfragen',
  ed_actDefault: (x) => `Standard: Antippen ${x}, Halten öffnet den Raum, Doppeltippen tut nichts.`,
  ed_dt_toggle: 'schaltet ein oder aus', ed_dt_cover: 'fährt hoch oder runter', ed_dt_press: 'löst aus', ed_dt_room: 'öffnet den Raum', ed_dt_info: 'öffnet den Info-Dialog',
  ed_tileActDefault: 'Standard: Antippen öffnet die Info des ersten Werts, Halten seine Geräteseite.',
  ed_ownTiles: 'Eigene Kacheln', ed_ownTilesNone: 'Werte deiner Wahl oder eine beliebige Home-Assistant-Karte – im gleichen Glas-Look.', ed_newTile: 'Kachel hinzufügen',
  ed_nValues: (n) => (n ? `${n} ${pl(n, 'Wert', 'Werte')}` : 'Noch keine Werte'), ed_tileCardOf: (x) => `Home-Assistant-Karte · ${x}`,
  ed_tileShows: 'Zeigt', ed_tileValues: 'Werte', ed_tileCard: 'HA-Karte', ed_tileValuesHead: 'Werte – der erste groß', ed_tileBig: 'groß',
  ed_tileMakeBig: 'Groß zeigen', ed_addValue: 'Wert hinzufügen', ed_addValueTo: (n) => `Werte für „${n}“`,
  ed_tilePickLead: 'Sensoren, Schalter, alles – der erste wird groß gezeigt.', ed_noValues: 'Noch keine Werte – füge einen hinzu.',
  ed_tileCardYaml: 'Karte (YAML)', ed_tileCardJson: 'Karte (JSON)',
  ed_tileCardHelp: 'Jede Karte deines Dashboards, z. B. picture-entity, history-graph, thermostat oder eine Karte aus HACS. Sie behält im Glasrahmen ihr eigenes Aussehen.',
  ed_tileCardHello: '**Hallo!** Ändere den Typ, um eine beliebige Karte zu zeigen.',
  ed_tileSize: 'Größe', ed_tileWidth: 'Breite', ed_tileHeight: 'Höhe', ed_deleteTile: 'Kachel entfernen',
  ed_tileSide: 'Keine freie Ecke im Plan – sie steht daneben (am Handy darunter).',
  ed_arrangeFor: 'Anordnen für', ed_viewsApart: 'Laptop und Handy werden getrennt angeordnet – was du hier änderst, gilt nur für diese Ansicht.',
  ed_cardAndBar: 'Ebenen-Karte & Ebenen-Leiste', ed_infoTiles: 'Kacheln', ed_placedByYou: 'von dir platziert',
  ed_cardWhat: 'Die Übersicht der gezeigten Ebene, mit „Mode“ und „Alle aus“.', ed_barWhat: 'Wechselt zwischen den Ebenen.',
  ed_cardSize: 'Größe', ed_cardFull: 'Normal', ed_cardCompact: 'Kompakt',
  ed_cardHelp: 'Kompakt: der Zustand mit runden Knöpfen für Mode und „Alle aus“ – braucht viel weniger Platz.',
  ed_place: 'Platz', ed_placeBelow: 'Unter dem Plan', ed_placeBottom: 'Unten am Bildschirm', ed_placePlan: 'Im Plan',
  ed_barDir: 'Ausrichtung', ed_barV: 'Senkrecht', ed_barH: 'Waagerecht',
  ed_cardBelowLead: 'Sie liegt unter dem Plan, wo der Daumen ist – in den Plan gesetzt, platzierst du sie selbst.',
  ed_barDockLead: 'Sie schwebt unten am Bildschirm – in den Plan gesetzt, platzierst du sie selbst.',
  ed_noFreeSpot: 'Keine freie Ecke im Plan – zieh sie, wohin du möchtest.',
  ed_hint_tiles_phone: 'Kacheln, Ebenen-Karte oder Ebenen-Leiste ziehen – das Handy hat eigene Plätze',
  ed_tileButtons: 'Buttons', ed_nButtons: (n) => (n ? `${n} ${pl(n, 'Button', 'Buttons')}` : 'Noch keine Buttons'), ed_btnTileNoName: 'Keine Überschrift',
  ed_tileButtonsHead: 'Buttons – in dieser Reihenfolge', ed_noButtons: 'Noch keine Buttons – füge einen hinzu.', ed_addButton: 'Button hinzufügen',
  ed_addButtonTo: (n) => `Buttons für „${n}“`, ed_btnPickLead: 'Gerät antippen, um ihm einen Button zu geben – Lampen, Schalter, Szenen, Rollläden, alles. Nochmal antippen entfernt ihn.',
  ed_btnPickOne: (n) => `Gerät für „${n}“`, ed_btnPickOneLead: 'Der Button schaltet dieses Gerät genau wie im Grundriss.',
  ed_btnNoDeviceRow: 'Button ohne Gerät', ed_btnNoDeviceSub: 'Nur eine Aktion – Dashboard-Seite öffnen, Skript starten …',
  ed_btnCap: (n) => `In dieser Größe ist Platz für ${n} Buttons – eine größere Kachel fasst mehr.`,
  ed_btnHidden: (n) => `${n} ${pl(n, 'Button passt', 'Buttons passen')} nicht hinein – Kachel größer machen.`, ed_btnNoRoom: 'Passt nicht hinein – Kachel größer machen',
  ed_btnFull: (n) => `Eine Kachel fasst höchstens ${n} Buttons`, ed_tileGrew: 'Die Kachel ist für den neuen Button größer geworden',
  ed_btnDevice: 'Gerät', ed_btnNoDevice: 'Kein Gerät', ed_btnChoose: 'Gerät wählen',
  ed_btnActDefault: (x) => `Standard: Antippen ${x}, Halten öffnet die Geräteseite, Doppeltippen tut nichts.`,
  ed_btnActNone: 'Ohne Gerät tut der Button nur, was du für Antippen, Halten und Doppeltippen einstellst.',
  ed_deleteButton: 'Button entfernen', ed_moveUp: 'Nach vorn',
});
