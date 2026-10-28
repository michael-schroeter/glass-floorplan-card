/* ================================================================== Floor plan editor: actions (tap / hold / double tap) and own tiles
 * Actions use Home Assistant's schema. Inside Home Assistant its own action editor is shown – in Home Assistant's look,
 * it knows every action, service and target. Without it (the demo) a short list of the common ones. */
const ACTION_KEYS = [['tap_action', 'ed_tap'], ['hold_action', 'ed_hold'], ['double_tap_action', 'ed_dbl']];
const TILE_ICONS = ['widget', 'bolt', 'gauge', 'sun', 'thermo', 'drop', 'humid', 'leaf', 'flame', 'plug', 'washer', 'coffee', 'camera', 'bell', 'shield', 'lock', 'home', 'sparkle', 'fan', 'tv', 'robot', 'battery', 'info', 'power'];
const eidOf = (e) => (typeof e === 'string' ? e : e?.entity);

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

  /* ---------------------------------------------------------------- own tiles */
  _tiles() { return Array.isArray(this._c.tiles) ? this._c.tiles : []; },
  _tileById(id) { return this._tiles().find((x) => x.id === id) || null; },
  _tileName(x) { const f = eidOf([].concat(x.entities || [])[0]); return x.name || (x.card ? t('ed_tileCard') : f ? this._fname(f) : t('tile')); },
  _tileIcon(x) {
    const f = eidOf([].concat(x.entities || [])[0]);
    return x.icon || (!x.card && f ? GlassFloorplanCard.prototype._autoIcon(f, this._hs()?.states?.[f]) : 'widget');
  },
  _ownTilesSection(I) {
    I.append(this._el(`<h3>${esc(t('ed_ownTiles'))}</h3>`));
    const list = mk('div', 'elist');
    list.style.marginTop = '0';
    const s = this._s;
    for (const x of this._tiles()) {
      const n = [].concat(x.entities || []).length;
      const sub = x.card ? t('ed_tileCardOf', String(x.card.type || '').replace(/^custom:/, '')) : t('ed_nValues', n);
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
    const h = this._hs() || {}, ents = [].concat(x.entities || []), isCard = !!x.card;
    I.append(this._el(`<h2>${esc(this._tileName(x))}</h2>`));
    I.append(this._fieldEl(t('ed_name'), this._inp(x.name || '', (v) => { if (v) x.name = v; else delete x.name; }, { placeholder: this._tileName({ ...x, name: '' }) })));
    I.append(this._fieldEl(t('ed_tileShows'), this._segEl([['values', t('ed_tileValues'), 'gauge'], ['card', t('ed_tileCard'), 'widget']], isCard ? 'card' : 'values', (v) => {
      if ((v === 'card') === isCard) return;
      this._change(() => {
        if (v === 'card') x.card = { type: 'markdown', content: t('ed_tileCardHello') }; else delete x.card;
        delete x.size;
      }, { keepSel: true });
    })));
    if (!isCard) {
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
      if (this._c.widgets) delete this._c.widgets[x.id];
    }, { keepSel: true });
    const seg = (opts, v, fn) => { const e = this._segEl(opts.map((n) => [String(n), String(n)]), String(v), (val) => fn(+val)); e.style.width = `${opts.length * 46}px`; return e; };
    I.append(this._fieldEl(t('ed_tileWidth'), seg([1, 2], w, (v) => setSize(v, hh)), true));
    I.append(this._fieldEl(t('ed_tileHeight'), seg([1, 2, 3], hh, (v) => setSize(w, v)), true));
    const manual = Array.isArray(this._c.widgets?.[x.id]);
    I.append(this._el(`<p class="small">${esc(t(manual ? 'ed_tileManual' : this._model()?.widgets?.[x.id] ? 'ed_tileAuto' : 'ed_tileSide'))}</p>`));
    const row = mk('div', 'ebtns');
    if (manual) row.append(this._btn(`${icon('wand')}<span>${esc(t('ed_auto'))}</span>`, '', () => this._change(() => { delete this._c.widgets[x.id]; }, { keepSel: true })));
    row.append(this._delBtn(t('ed_deleteTile'), () => this._change(() => {
      this._c.tiles = this._tiles().filter((y) => y !== x);
      if (this._c.widgets) delete this._c.widgets[x.id];
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

  /* every entity to choose from as a value of the tile */
  _tilePickerView(I, x) {
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
});
