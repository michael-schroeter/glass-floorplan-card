/* ================================================================== Floor plan editor: inspector panels */
const SHOW_LABEL = { light: 'layer_light', media: 'ed_kind_media', door: 'frontDoor', climate: 'layer_climate', cover: 'layer_cover' };
const LAYER_ICONS = ['bulb', 'thermo', 'blinds', 'robot', 'moon', 'shield', 'sparkle', 'home', 'sofa', 'plug', 'fan', 'leaf', 'flame', 'drop', 'bolt', 'tv', 'lock', 'bell'];

Object.assign(GfcEditor.prototype, {
  _panel() {
    if (!this._ins) return;
    const I = this._ins, s = this._s;
    I.innerHTML = '';
    const map = { room: '_pRoom', furn: '_pFurn', open: '_pOpen', ent: '_pEnt', door: '_pDoor', dock: '_pDock', wid: '_pWid', ul: '_p_sketch' };
    const fn = s && this._selObj() ? map[s.t] : `_p_${this._tool}`;
    this[fn]?.(I);
    this._syncTop();
  },

  /* ---------------------------------------------------------------- small UI builders */
  _el(html, cls = '') { return mk('div', cls, html); },
  _fieldEl(label, ctl, row) {
    const f = mk('div', `efield${row ? ' row' : ''}`, label ? `<label>${esc(label)}</label>` : '');
    f.append(ctl);
    return f;
  },
  /* text / number input; typing updates live, one undo step per edit */
  _inp(value, onInput, { type = 'text', placeholder = '', num: isNum = false, step } = {}) {
    const i = mk('input', `einp${isNum ? ' num' : ''}`);
    i.type = type;
    if (step) i.step = step;
    i.value = value ?? '';
    i.placeholder = placeholder;
    let snapped = false;
    i.addEventListener('input', () => {
      if (!snapped) { this._snap(); snapped = true; }
      onInput(isNum ? (i.value === '' ? null : +i.value) : i.value);
      this._draw();
    });
    i.addEventListener('change', () => { snapped = false; });
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') i.blur(); });
    return i;
  },
  _drop(options, value, onChange) {
    const s = mk('select', 'esel2');
    s.innerHTML = options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('');
    s.addEventListener('change', () => this._change(() => onChange(s.value), { keepSel: true }));
    return s;
  },
  _segEl(options, value, onChange) {
    const s = mk('div', 'eseg', options.map(([v, l, ic]) => `<button data-v="${esc(v)}" class="${String(v) === String(value) ? 'act' : ''}">${ic ? icon(ic) : ''}<span>${esc(l)}</span></button>`).join(''));
    s.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => onChange(b.dataset.v)));
    return s;
  },
  _tglEl(on, onChange) {
    const b = mk('button', `etgl${on ? ' on' : ''}`);
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', String(!!on));
    b.addEventListener('click', () => onChange(!b.classList.contains('on')));
    return b;
  },
  _btn(html, cls, onClick) {
    const b = mk('button', `ebtn ${cls || ''}`, html);
    b.addEventListener('click', onClick);
    return b;
  },
  _entityOptions(filter, none) {
    const h = this._hs() || {};
    const list = Object.keys(h.states || {}).filter(filter).sort((a, b) => this._fname(a).localeCompare(this._fname(b), LOCALE));
    return [...(none ? [['', none]] : []), ...list.map((id) => [id, `${this._fname(id)} (${id})`])];
  },
  _fname(eid) { const h = this._hs() || {}; return h.states?.[eid]?.attributes?.friendly_name || h.entities?.[eid]?.name || eid; },
  _areas() { const h = this._hs() || {}; return Object.values(h.areas || {}).sort((a, b) => String(a.name).localeCompare(String(b.name), LOCALE)); },

  /* ---------------------------------------------------------------- sketch / start */
  _p_sketch(I) {
    const c = this._c, u = c.underlay;
    I.append(this._el(`<h2>${esc(t('ed_tool_sketch'))}</h2><p class="lead">${esc(t('ed_sketch_lead'))}</p>`));
    // an import waiting for confirmation, the size check after an import or the paste field come first
    if (this._pending || this._scaleCheck || this._pasting) { this._importSection(I); if (this._pending || this._pasting) return; }
    const file = mk('input');
    file.type = 'file'; file.accept = 'image/*'; file.hidden = true;
    file.addEventListener('change', () => this._readImage(file.files[0]));
    const drop = this._el(`<div style="display:flex;align-items:center;gap:12px">${icon('image')}<div><b style="font-size:14px">${esc(t(this._ulSrc ? 'ed_ulReplace' : 'ed_ulPick'))}</b><div class="small" style="font-size:12px;color:var(--t3);margin-top:2px">${esc(t('ed_ulDrop'))}</div></div></div>`, 'ecard');
    drop.style.cursor = 'pointer';
    drop.querySelector('.ic').style.fontSize = '26px';
    drop.addEventListener('click', () => file.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drop'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drop'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('drop'); this._readDropped(e.dataTransfer.files[0]); });
    I.append(file, drop);
    if (!this._scaleCheck) this._importSection(I);
    if (this._ulSrc && u?.rect) {
      const op = mk('input', 'erange');
      op.type = 'range'; op.min = '0.1'; op.max = '1'; op.step = '0.05'; op.value = String(u.opacity ?? 0.6);
      op.addEventListener('input', () => { u.opacity = +op.value; this._draw(); });
      I.append(this._fieldEl(t('ed_opacity'), op));
      I.append(this._fieldEl(t('ed_invert'), this._tglEl(!!u.invert, (v) => this._change(() => { if (v) u.invert = true; else delete u.invert; }, { keepSel: true })), true));
      const w = this._inp(fmt((u.rect[2] - u.rect[0]) / 100, 2).replace(',', '.'), (v) => {
        if (!(v > 0.5)) return;
        const k = (v * 100) / (u.rect[2] - u.rect[0]);
        u.rect = [u.rect[0], u.rect[1], r0(u.rect[0] + (u.rect[2] - u.rect[0]) * k), r0(u.rect[1] + (u.rect[3] - u.rect[1]) * k)];
      }, { num: true, type: 'number', step: '0.1' });
      I.append(this._fieldEl(t('ed_ulWidth'), w, true));
      const m = this._measure;
      if (m?.a && m.b) {
        const len = this._inp('', () => {}, { num: true, type: 'number', step: '0.01', placeholder: '4.20' });
        const box = this._el(`<p class="lead" style="margin:0 0 8px">${esc(t('ed_measure_len'))}</p>`, 'ecard');
        const apply = () => this._applyMeasure(parseFloat(String(len.value).replace(',', '.')) * 100);
        len.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
        const row = mk('div', 'ebtns');
        row.append(len, this._btn(`${icon('check')}<span>${esc(t('ed_apply'))}</span>`, 'blue', apply));
        box.append(row);
        I.append(box);
        requestAnimationFrame(() => len.focus());
      }
      const det = this._btn(`${icon('wand')}<span>${esc(t('ed_detect'))}</span>`, 'wide blue', () => this._detect());
      det.style.marginTop = '14px';
      I.append(det);
      I.append(this._el(`<p class="small">${esc(t('ed_detectHelp'))}</p>`));
      const row = mk('div', 'ebtns');
      row.append(
        this._btn(`${icon('fit')}<span>${esc(t(m ? 'ed_measure_stop' : 'ed_measure'))}</span>`, m ? 'blue' : '', () => { this._measure = m ? null : {}; this._s = null; this._draw(); this._panel(); }),
        this._btn(`${icon('trash')}<span>${esc(t('ed_ulRemove'))}</span>`, 'red', () => this._change(() => { delete this._c.underlay; this._setUnderlay(null); })),
      );
      I.append(row);
      I.append(this._el(`<p class="small">${esc(t('ed_ulNote'))}</p>`));
    }
    I.append(this._el(`<h3>${esc(t('ed_quick'))}</h3>`));
    const q = mk('div', '');
    q.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    if (this._areas().length) q.append(this._btn(`${icon('wand')}<span>${esc(t('ed_fromAreas'))}</span>`, 'wide', () => this._fromAreas()));
    q.append(this._btn(`${icon('home')}<span>${esc(t('ed_example'))}</span>`, 'wide', () => {
      this._change(() => {
        const ex = exampleConfig(LANG), h = this._hs() || {};
        // in a real home the example devices do not exist – then only the floor plan is used
        if (!ex.entities.every((e) => h.states?.[e.entity])) { delete ex.entities; delete ex.door; delete ex.vacuum; delete ex.layers; delete ex.weather; }
        for (const k of ['rooms', 'windows', 'doors', 'entrance', 'entities', 'door', 'vacuum', 'layers', 'widgets']) delete this._c[k];
        Object.assign(this._c, normEditorConfig({ ...this._c, ...ex, language: this._c.language }));
        if (!this._c.language) delete this._c.language;
      });
      this._fit(); this._draw(); this._toast(t('ed_exampleLoaded'));
    }));
    if (c.rooms.length) q.append(this._btn(`${icon('down')}<span>${esc(t('ed_export'))}</span>`, 'wide', () => this._exportPlan()));
    if (c.rooms.length) q.append(this._btn(`${icon('trash')}<span>${esc(t('ed_clear'))}</span>`, 'wide red', () => this._change(() => { Object.assign(this._c, { rooms: [], windows: [], doors: [], entities: [] }); delete this._c.entrance; delete this._c.widgets; })));
    I.append(q);
    I.append(this._el(`<p class="small">${esc(t('ed_claudeTip'))}</p>`));
  },

  /* rooms from the Home Assistant areas, devices placed automatically */
  _fromAreas() {
    const h = this._hs() || {};
    const auto = autoConfig(h, { lang: LANG });
    if (!auto.rooms.length) { this._toast(t('ed_noAreas')); return; }
    const have = new Set(this._c.rooms.map((r) => r.area).filter(Boolean));
    const add = auto.rooms.filter((r) => !have.has(r.area));
    if (!add.length) { this._toast(t('ed_areasDone')); return; }
    // new rooms go below what is already drawn
    const B = this._c.rooms.length ? bboxOf(this._c.rooms.map((r) => r.rect)) : null;
    const oy = B ? B[3] + 100 - Math.min(...add.map((r) => r.rect[1])) : 0, ox = B ? B[0] : 0;
    this._change(() => {
      for (const r of add) {
        const room = { ...r, id: this._uniqueRoomId(r.id), rect: [r.rect[0] + ox, r.rect[1] + oy, r.rect[2] + ox, r.rect[3] + oy] };
        this._c.rooms.push(room);
        for (const e of auto.entities.filter((x) => inRect(r.rect, x.at))) if (!this._c.entities.some((x) => x.entity === e.entity)) this._c.entities.push({ ...e, at: [e.at[0] + ox, e.at[1] + oy] });
      }
      if (!this._c.vacuum && auto.vacuum) this._c.vacuum = auto.vacuum;
      this._tool = 'rooms';
    });
    this._fit(); this._draw();
    this._toast(t('ed_areasAdded', add.length));
  },

  /* ---------------------------------------------------------------- rooms */
  _p_rooms(I) {
    const c = this._c;
    I.append(this._el(`<h2>${esc(t('ed_tool_rooms'))}</h2><p class="lead">${esc(t('ed_rooms_lead'))}</p>`));
    const missing = c.rooms.some((r) => !r.area);
    if (c.rooms.length && this._areas().length && missing) this._areaChips(I);
    if (c.rooms.length) {
      I.append(this._el(`<h3>${esc(t('ed_roomList'))}</h3>`));
      const list = mk('div', 'elist');
      c.rooms.forEach((r, i) => {
        const row = this._el(`<span class="ei">${icon('plan')}</span><div><b>${esc(r.name)}</b><small>${fmt((r.rect[2] - r.rect[0]) / 100, 1)} × ${fmt((r.rect[3] - r.rect[1]) / 100, 1)} m${r.area ? ` · ${esc(this._hs()?.areas?.[r.area]?.name || r.area)}` : ''}</small></div>`, 'erow');
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => this._select({ t: 'room', i }));
        list.append(row);
      });
      I.append(list);
    } else I.append(this._el(esc(t('ed_rooms_empty')), 'eempty'));
    if (c.rooms.length && this._areas().length && !missing) this._areaChips(I);
    if (this._areas().length) {
      const b = this._btn(`${icon('wand')}<span>${esc(t('ed_fromAreas'))}</span>`, 'wide', () => this._fromAreas());
      b.style.marginTop = '14px';
      I.append(b);
    }
  },

  /* Home Assistant areas as chips: drag one onto its room (or tap a room, then the chip) */
  _areaChips(I) {
    const c = this._c, h = this._hs() || {};
    const count = (a) => Object.keys(h.states || {}).filter((id) => this._areaOf(id) === a && this._isPlaceable(id)).length;
    I.append(this._el(`<h3>${esc(t('ed_areasHead'))}</h3><p class="small" style="margin:-2px 0 10px">${esc(t('ed_areasHelp'))}</p>`));
    const chips = mk('div', 'echips');
    const areas = this._areas().map((a) => ({ ...a, rooms: c.rooms.filter((r) => r.area === a.area_id).map((r) => r.name), n: count(a.area_id) }))
      .sort((x, y) => (x.rooms.length ? 1 : 0) - (y.rooms.length ? 1 : 0));
    for (const a of areas) {
      const done = a.rooms.length > 0;
      const b = mk('button', `echip area${done ? ' done' : ''}${!a.n && !done ? ' empty' : ''}`, `${icon(done ? 'check' : 'grip')}<span>${esc(a.name)}</span>${a.n ? `<small>${a.n}</small>` : ''}`);
      b.title = done ? t('ed_areaIn', a.rooms.join(', ')) : t('ed_areaDrag');
      this._dragFrom(b, (at) => {
        const i = this._c.rooms.findIndex((r) => inRect(r.rect, at));
        if (i >= 0) this._assignArea(i, a.area_id); else this._toast(t('ed_areaDropRoom'));
      }, 'plan', false, {
        label: a.name,
        hover: (pt) => { const i = pt ? this._c.rooms.findIndex((r) => inRect(r.rect, pt)) : -1; const v = i >= 0 ? i : null; if (v !== this._dropRoom) { this._dropRoom = v; this._draw(); } },
      });
      b.addEventListener('click', () => { if (this._s?.t === 'room') this._assignArea(this._s.i, a.area_id); else this._toast(t('ed_areaDrag')); });
      chips.append(b);
    }
    I.append(chips);
    I.append(this._fieldEl(t('ed_withDevices'), this._tglEl(this._withDevices !== false, (v) => { this._withDevices = v; this._panel(); }), true));
    const m = this._nameMatches();
    if (m.length) {
      const b = this._btn(`${icon('wand')}<span>${esc(t('ed_matchByName', m.length))}</span>`, 'wide blue', () => this._matchAreasByName());
      b.style.marginTop = '12px';
      I.append(b);
    }
  },

  _pRoom(I) {
    const r = this._selObj(), h = this._hs() || {};
    I.append(this._el(`<h2>${esc(r.name || t('ed_room'))}</h2>`));
    I.append(this._fieldEl(t('ed_name'), this._inp(r.name, (v) => { r.name = v; I.querySelector('h2').textContent = v || t('ed_room'); })));
    const areas = this._areas();
    if (areas.length) {
      const sel = mk('select', 'esel2');
      sel.innerHTML = [['', t('ed_noArea')], ...areas.map((a) => [a.area_id, a.name])].map(([v, l]) => `<option value="${esc(v)}"${v === (r.area || '') ? ' selected' : ''}>${esc(l)}</option>`).join('');
      sel.addEventListener('change', () => { if (sel.value) this._assignArea(this._s.i, sel.value); else this._change(() => { delete r.area; }, { keepSel: true }); });
      I.append(this._fieldEl(t('ed_area'), sel));
      // one tap on a free area links it (name + devices come along)
      if (!r.area) {
        const used = new Set(this._c.rooms.map((x) => x.area).filter(Boolean));
        const free = areas.filter((a) => !used.has(a.area_id));
        if (free.length) {
          const chips = mk('div', 'echips');
          chips.style.marginTop = '8px';
          for (const a of free) {
            const b = mk('button', 'echip area', `<span>${esc(a.name)}</span>`);
            b.addEventListener('click', () => this._assignArea(this._s.i, a.area_id));
            chips.append(b);
          }
          I.append(chips);
        }
      }
      I.append(this._el(`<p class="small">${esc(t('ed_area_help'))}</p>`));
    }
    I.append(this._fieldEl(t('ed_label'), this._segEl([['top', t('ed_top')], ['bottom', t('ed_bottom')]], r.label === 'bottom' ? 'bottom' : 'top', (v) => this._change(() => { if (v === 'bottom') r.label = 'bottom'; else delete r.label; }, { keepSel: true }))));
    const R = r.rect;
    const wI = this._inp(((R[2] - R[0]) / 100).toFixed(2), (v) => { if (v > 0.3) r.rect = [R[0], R[1], r0(R[0] + v * 100), R[3]]; }, { num: true, type: 'number', step: '0.05' });
    const hI = this._inp(((R[3] - R[1]) / 100).toFixed(2), (v) => { if (v > 0.3) r.rect = [R[0], R[1], r.rect[2], r0(R[1] + v * 100)]; }, { num: true, type: 'number', step: '0.05' });
    I.append(this._fieldEl(t('ed_width'), wI, true), this._fieldEl(t('ed_depth'), hI, true));
    I.append(this._el(`<p class="small">${esc(t('ed_area_m2', fmt(((R[2] - R[0]) * (R[3] - R[1])) / 1e4, 1)))}</p>`));
    // devices of this room's area that are not on the plan yet
    if (r.area) {
      const ids = Object.keys(h.states || {}).filter((id) => this._areaOf(id) === r.area && this._isPlaceable(id) && !this._c.entities.some((e) => e.entity === id && e.at));
      if (ids.length) {
        const b = this._btn(`${icon('wand')}<span>${esc(t('ed_placeArea', ids.length))}</span>`, 'wide blue', () => this._autoPlace(ids));
        b.style.marginTop = '16px';
        I.append(b);
      }
    }
    const row = mk('div', 'ebtns');
    row.append(this._btn(`${icon('copy')}<span>${esc(t('ed_duplicate'))}</span>`, '', () => this._duplicateSel()), this._btn(`${icon('trash')}<span>${esc(t('ed_delete'))}</span>`, 'red', () => this._deleteSel()));
    I.append(row);
  },
  /* lights, climate, covers, media … – not helpers, groups of sensors etc. */
  _isPlaceable(id) {
    const st = this._hs()?.states?.[id], d = domainOf(id), dc = st?.attributes?.device_class;
    if (['light', 'climate', 'cover', 'media_player', 'fan', 'lock', 'vacuum'].includes(d)) return !(this._hs()?.entities?.[id]?.hidden) && !Array.isArray(st?.attributes?.entity_id);
    return d === 'sensor' && (dc === 'temperature') && !this._hs()?.entities?.[id]?.entity_category;
  },

  /* ---------------------------------------------------------------- furniture */
  _palette(I) {
    const pal = mk('div', 'epal');
    for (const [k, def] of Object.entries(FURN_KINDS)) {
      if (k === 'block') continue;
      const b = mk('button', '', `${icon(def.icon)}<span>${esc(t(`furn_${k}`))}</span>`);
      b.title = t('ed_furn_drag');
      this._dragFrom(b, (at) => this._addFurniture(k, at), def.icon, true);
      b.addEventListener('click', () => this._addFurniture(k));
      pal.append(b);
    }
    I.append(pal);
  },
  _p_furniture(I) {
    I.append(this._el(`<h2>${esc(t('ed_tool_furniture'))}</h2><p class="lead">${esc(t('ed_furn_lead'))}</p>`));
    if (!this._c.rooms.length) { I.append(this._el(esc(t('ed_needRoom')), 'eempty')); return; }
    this._palette(I);
  },
  /* the palette stays where it is; rotate / duplicate / delete float next to the piece on the plan */
  _pFurn(I) {
    this._p_furniture(I);
    const f = this._selObj(), F = normFurn(f);
    I.append(this._el(`<h3>${esc(t('ed_selected'))}: ${esc(t(`furn_${F.kind}`))}</h3>`));
    I.append(this._fieldEl(t('ed_kind'), this._drop(Object.keys(FURN_KINDS).map((k) => [k, t(`furn_${k}`)]), F.kind, (v) => {
      if (Array.isArray(f)) { f.length = 4; f.push(v); } else f.kind = v;
    })));
    const R = F.r;
    I.append(this._fieldEl(t('ed_widthCm'), this._inp(R[2] - R[0], (v) => { if (v >= 5) setFurnRect(f, [R[0], R[1], R[0] + v, normFurn(f).r[3]]); }, { num: true, type: 'number' }), true));
    I.append(this._fieldEl(t('ed_depthCm'), this._inp(R[3] - R[1], (v) => { if (v >= 5) setFurnRect(f, [R[0], R[1], normFurn(f).r[2], R[1] + v]); }, { num: true, type: 'number' }), true));
  },

  /* ---------------------------------------------------------------- windows, passages, front door */
  _p_openings(I) {
    const c = this._c;
    I.append(this._el(`<h2>${esc(t('ed_tool_openings'))}</h2>`));
    I.append(this._segEl([['window', t('ed_open_window'), 'window'], ['door', t('ed_open_door'), 'pass'], ['entrance', t('ed_open_entrance'), 'entrance']], this._openKind, (v) => { this._openKind = v; this._hover = null; this._draw(); this._panel(); }));
    I.append(this._el(`<p class="lead" style="margin-top:14px">${esc(t(`ed_open_lead_${this._openKind}`))}</p>`));
    I.append(this._el(`<p class="small">${esc(t('ed_open_counts', c.windows.length, c.doors.length, c.entrance ? 1 : 0))}</p>`));
  },
  _pOpen(I) {
    this._p_openings(I);
    const s = this._s, seg = normSeg(this._selObj()), h = segH(seg);
    I.append(this._el(`<h3>${esc(t('ed_selected'))}: ${esc(t(`ed_open_${s.k}`))}</h3>`));
    const len = h ? seg[2] - seg[0] : seg[3] - seg[1];
    I.append(this._fieldEl(t('ed_lengthCm'), this._inp(len, (v) => {
      if (!(v >= 20)) return;
      const m = h ? (seg[0] + seg[2]) / 2 : (seg[1] + seg[3]) / 2;
      this._setOpening(s, h ? [r0(m - v / 2), seg[1], r0(m + v / 2), seg[3]] : [seg[0], r0(m - v / 2), seg[2], r0(m + v / 2)]);
    }, { num: true, type: 'number' }), true));
    const row = mk('div', 'ebtns');
    row.append(this._btn(`${icon('trash')}<span>${esc(t('ed_delete'))}</span>`, 'red', () => this._deleteSel()));
    I.append(row);
    I.append(this._el(`<p class="small">${esc(t('ed_open_move'))}</p>`));
  },

  /* ---------------------------------------------------------------- devices */
  _layerChips(I) {
    const chips = mk('div', 'echips');
    for (const L of this._layerDefs()) {
      const b = mk('button', `echip${L.id === this._layerSel ? ' act' : ''}`, `${this._iconHtml(L.icon)}<span>${esc(L.name)}</span>`);
      b.addEventListener('click', () => { this._layerSel = L.id; this._s = null; this._draw(); this._panel(); });
      chips.append(b);
    }
    const add = mk('button', 'echip', `${icon('plus')}<span>${esc(t('ed_ownLayer'))}</span>`);
    add.addEventListener('click', () => this._newLayer());
    chips.append(add);
    I.append(chips);
  },
  _iconHtml(n) { return GlassFloorplanCard.prototype._iconHtml(n); },

  _p_devices(I) {
    I.append(this._el(`<h2>${esc(t('ed_tool_devices'))}</h2><p class="lead">${esc(t('ed_dev_lead'))}</p>`));
    this._layerChips(I);
    const L = this._layerDef(this._layerSel);
    if (!L) return;
    if (L.type === 'vacuum') { this._vacuumPanel(I); return; }
    const h = this._hs() || {};
    const filt = L.type === 'custom' ? LAYER_FILTER.custom : LAYER_FILTER[L.type];
    const placed = new Set(this._c.entities.filter((e) => e.at).map((e) => e.entity));
    let ids = Object.keys(h.states || {}).filter((id) => filt(domainOf(id), h.states[id]?.attributes?.device_class) && !h.entities?.[id]?.hidden);
    const q = this._q.trim().toLowerCase();
    if (q) ids = ids.filter((id) => `${id} ${this._fname(id)} ${h.areas?.[this._areaOf(id)]?.name || ''}`.toLowerCase().includes(q));
    const search = this._el(`${icon('search')}`, 'esearch');
    const si = mk('input', 'einp');
    si.placeholder = t('ed_search');
    si.value = this._q;
    si.addEventListener('input', () => { this._q = si.value; const pos = si.selectionStart; this._panel(); const n = this._ins.querySelector('.esearch input'); n?.focus(); n?.setSelectionRange(pos, pos); });
    search.append(si);
    search.style.marginTop = '14px';
    I.append(search);
    // the part of the layer you can switch on/off: lights in "Light", custom picks …
    const unplaced = ids.filter((id) => !placed.has(id) && this._areaOf(id) && this._c.rooms.some((r) => r.area === this._areaOf(id)) && (L.type !== 'custom' || this._isPlaceable(id)));
    if (unplaced.length && !q) {
      const b = this._btn(`${icon('wand')}<span>${esc(t('ed_autoAll', unplaced.length))}</span>`, 'wide blue', () => this._autoPlace(unplaced));
      b.style.marginTop = '10px';
      I.append(b);
    }
    // grouped by area
    const groups = new Map();
    for (const id of ids) { const a = this._areaOf(id) || ''; if (!groups.has(a)) groups.set(a, []); groups.get(a).push(id); }
    const order = [...groups.keys()].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || String(h.areas?.[a]?.name || a).localeCompare(String(h.areas?.[b]?.name || b), LOCALE));
    const list = mk('div', 'elist');
    for (const a of order) {
      const gids = groups.get(a).sort((x, y) => (placed.has(x) ? 1 : 0) - (placed.has(y) ? 1 : 0) || this._fname(x).localeCompare(this._fname(y), LOCALE));
      list.append(this._el(`<span>${esc(a ? h.areas?.[a]?.name || a : t('ed_noAreaGroup'))}</span>`, 'egrp'));
      for (const id of gids.slice(0, q ? 200 : 60)) list.append(this._entityRow(id, placed.has(id), L));
    }
    if (!ids.length) list.append(this._el(esc(t(q ? 'ed_noMatch' : 'ed_noEntities')), 'eempty'));
    I.append(list);
    if (L.type === 'light') this._doorPanel(I);
    if (L.type === 'custom') {
      I.append(this._el(`<p class="small">${esc(t('ed_customDevHint', L.name))}</p>`));
    }
  },

  _entityRow(id, isPlaced, L) {
    const h = this._hs() || {}, st = h.states?.[id], kind = kindOf(id, st);
    const ic = kind === 'light' ? guessLampIcon(id, st) : GlassFloorplanCard.prototype._autoIcon(id, st);
    const inL = L.type !== 'custom' || L.kinds.includes(kind) || L.ents.includes(id);
    const row = this._el(`<span class="ei">${icon(ic)}</span><div><b>${esc(this._fname(id))}</b><small>${esc(id)}</small></div><button class="eadd" title="${esc(isPlaced ? t('ed_showOnPlan') : t('ed_add'))}">${icon(isPlaced && inL ? 'check' : 'plus')}</button>`, `erow${isPlaced ? ' placed' : ''}`);
    const sel = this._s?.t === 'ent' && this._c.entities[this._s.i]?.entity === id;
    row.classList.toggle('on', sel);
    this._dragFrom(row, (at) => this._placeEntity(id, at), ic);
    row.querySelector('.eadd').addEventListener('click', () => {
      const i = this._c.entities.findIndex((e) => e.entity === id && e.at);
      if (i >= 0 && inL) { this._select({ t: 'ent', i }); return; }
      if (i >= 0) { this._change(() => this._addToLayer(L.id, id)); return; }
      this._placeEntity(id);
    });
    row.addEventListener('click', (e) => {
      if (e.target.closest('.eadd')) return;
      const i = this._c.entities.findIndex((x) => x.entity === id && x.at);
      if (i >= 0) this._select({ t: 'ent', i });
    });
    return row;
  },

  _doorPanel(I) {
    const c = this._c, d = c.door || {};
    I.append(this._el(`<h3>${esc(t('frontDoor'))}</h3>`));
    const set = (k, v) => { c.door = { ...(c.door || {}) }; if (v) c.door[k] = v; else delete c.door[k]; if (!c.door.open && !c.door.doorbell) delete c.door; };
    I.append(this._fieldEl(t('ed_doorOpen'), this._drop(this._entityOptions((id) => ['button', 'lock', 'switch', 'script', 'input_button'].includes(domainOf(id)), t('ed_none')), d.open, (v) => set('open', v))));
    I.append(this._fieldEl(t('ed_doorBell'), this._drop(this._entityOptions((id) => domainOf(id) === 'event' || (domainOf(id) === 'binary_sensor' && ['sound', 'occupancy', 'running', undefined].includes(this._hs()?.states?.[id]?.attributes?.device_class)), t('ed_none')), d.doorbell, (v) => set('doorbell', v))));
    if (c.door && !c.door.at) {
      const b = this._btn(`${icon('door')}<span>${esc(t('ed_doorPlace'))}</span>`, 'wide', () => this._change(() => {
        const hall = c.rooms.find((r) => /flur|hall|diele|entr|eingang/i.test(`${r.name} ${r.area || ''}`)) || c.rooms[0];
        c.door.at = c.entrance ? (() => { const s = normSeg(c.entrance), m = center([s[0], s[1], s[2], s[3]]); const R = hall?.rect; return R ? [r0(clamp(m[0], R[0] + 40, R[2] - 40)), r0(clamp(m[1], R[1] + 40, R[3] - 40))] : m; })() : hall ? freeSpot(hall.rect, []) : [0, 0];
        this._s = { t: 'door' };
      }));
      b.style.marginTop = '12px';
      I.append(b);
    }
    I.append(this._el(`<p class="small">${esc(t('ed_doorHelp'))}</p>`));
  },
  _pDoor(I) {
    I.append(this._el(`<h2>${esc(t('frontDoor'))}</h2>`));
    this._doorPanel(I);
    const row = mk('div', 'ebtns');
    row.append(this._btn(`${icon('trash')}<span>${esc(t('ed_removeMarker'))}</span>`, 'red', () => this._deleteSel()));
    I.append(row);
  },

  /* Roborock: vacuum, station position, robot rooms → card rooms */
  _vacuumPanel(I) {
    const c = this._c, h = this._hs() || {}, v = c.vacuum || {};
    const vacs = Object.keys(h.states || {}).filter((id) => domainOf(id) === 'vacuum');
    I.append(this._el(`<p class="lead" style="margin-top:14px">${esc(t('ed_vac_lead'))}</p>`));
    I.append(this._fieldEl(t('ed_vac_entity'), this._drop([['', t('ed_none')], ...vacs.map((id) => [id, `${this._fname(id)}${h.entities?.[id]?.platform === 'roborock' ? '' : ` (${t('ed_notRoborock')})`}`])], v.entity, (val) => {
      if (!val) { delete c.vacuum; return; }
      c.vacuum = { ...v, entity: val };
      if (!c.vacuum.dock) {
        const area = this._areaOf(val), room = c.rooms.find((r) => r.area && r.area === area) || c.rooms[c.rooms.length - 1];
        if (room) c.vacuum.dock = freeSpot(room.rect, []);
      }
      if (c.layers?.length && !c.layers.includes('vacuum')) c.layers.push('vacuum');
    })));
    if (!v.entity) return;
    if (!v.dock) {
      const b = this._btn(`${icon('dock')}<span>${esc(t('ed_dockPlace'))}</span>`, 'wide', () => this._change(() => { c.vacuum.dock = this._spotFor(v.entity); this._s = { t: 'dock' }; }));
      b.style.marginTop = '12px';
      I.append(b);
    } else I.append(this._el(`<p class="small">${esc(t('ed_dockMove'))}</p>`));
    // robot room names (enum sensor options) → rooms of the card
    const dev = h.entities?.[v.entity]?.device_id;
    const roomSensor = v.room || Object.values(h.entities || {}).find((e) => e.device_id === dev && (e.translation_key === 'current_room' || e.entity_id.endsWith('_current_room')))?.entity_id;
    const names = h.states?.[roomSensor]?.attributes?.options || [];
    I.append(this._el(`<h3>${esc(t('ed_vac_rooms'))}</h3>`));
    if (!names.length) { I.append(this._el(esc(t('ed_vac_noRooms')), 'eempty')); return; }
    const map = c.vacuum.rooms || {};
    const norm = (s) => normName(s);
    for (const n of names) {
      const auto = c.rooms.find((r) => norm(r.name) === norm(n) || (r.area && (norm(r.area) === norm(n) || norm(h.areas?.[r.area]?.name) === norm(n))));
      const cur = map[n] || '';
      I.append(this._fieldEl(n, this._drop([['', auto ? `${t('ed_auto')}: ${auto.name}` : t('ed_notUsed')], ...c.rooms.map((r) => [r.id, r.name])], cur, (val) => {
        c.vacuum.rooms = { ...(c.vacuum.rooms || {}) };
        if (val) c.vacuum.rooms[n] = val; else delete c.vacuum.rooms[n];
        if (!Object.keys(c.vacuum.rooms).length) delete c.vacuum.rooms;
      })));
    }
    I.append(this._el(`<p class="small">${esc(t('ed_vac_area'))}</p>`));
  },
  _pDock(I) {
    I.append(this._el(`<h2>${esc(t('ed_dock'))}</h2>`));
    this._layerSel = 'vacuum';
    this._vacuumPanel(I);
  },

  _pEnt(I) {
    const e = this._selObj(), h = this._hs() || {}, st = h.states?.[e.entity], kind = kindOf(e.entity, st);
    const M = this._model(), room = M?.byRoom?.[M.roomAt(e.at)];
    I.append(this._el(`<h2>${esc(e.name || this._fname(e.entity))}</h2><p class="lead" style="margin:2px 0 0">${esc(e.entity)}${room ? ` · ${esc(room.name)}` : ''}</p>`));
    if (!st) I.append(this._el(esc(t('ed_missingEntity')), 'eempty'));
    I.append(this._fieldEl(t('ed_name'), this._inp(e.name || '', (v) => { if (v) e.name = v; else delete e.name; }, { placeholder: this._fname(e.entity) })));
    // icon
    const icons = kind === 'light' ? LAMP_ICONS : DEVICE_ICONS;
    const cur = e.icon || (kind === 'light' ? 'bulb' : GlassFloorplanCard.prototype._autoIcon(e.entity, st));
    const grid = mk('div', 'eicons');
    for (const n of icons) {
      const b = mk('button', n === cur ? 'act' : '', icon(n));
      b.title = n;
      b.addEventListener('click', () => this._change(() => { e.icon = n; }, { keepSel: true }));
      grid.append(b);
    }
    I.append(this._fieldEl(t('ed_icon'), grid));
    if (kind === 'light') {
      I.append(this._el(`<h3>${esc(t('ed_lampOptions'))}</h3>`));
      I.append(this._fieldEl(t('ed_watt'), this._inp(e.watt ?? '', (v) => { if (v > 0) e.watt = v; else delete e.watt; }, { num: true, type: 'number', placeholder: '–' }), true));
      I.append(this._fieldEl(t('ed_beams'), this._segEl([['0', t('ed_glow')], ['1', '1'], ['2', '2'], ['3', '3']], String(e.beams || 0), (v) => this._change(() => { if (+v) e.beams = +v; else delete e.beams; }, { keepSel: true }))));
      if (!hasColor(st) && !hasTemp(st)) I.append(this._fieldEl(t('ed_kelvin'), this._inp(e.kelvin ?? '', (v) => { if (v >= 1500 && v <= 9000) e.kelvin = v; else delete e.kelvin; }, { num: true, type: 'number', placeholder: '2700' }), true));
      I.append(this._fieldEl(t('ed_planButton'), this._tglEl(e.plan !== false, (on) => this._change(() => { if (on) delete e.plan; else e.plan = false; }, { keepSel: true })), true));
      const pw = this._entityOptions((id) => domainOf(id) === 'sensor' && h.states[id]?.attributes?.device_class === 'power', t('ed_estimate'));
      if (pw.length > 1) I.append(this._fieldEl(t('ed_powerSensor'), this._drop(pw, e.power, (v) => { if (v) e.power = v; else delete e.power; })));
    }
    // own layers
    const custom = this._layerDefs().filter((L) => L.type === 'custom');
    if (custom.length) {
      I.append(this._el(`<h3>${esc(t('ed_inLayers'))}</h3>`));
      const chips = mk('div', 'echips');
      for (const L of custom) {
        const viaKind = L.kinds.includes(kind), on = viaKind || L.ents.includes(e.entity);
        const b = mk('button', `echip chk${on ? ' act' : ''}`, `${this._iconHtml(L.icon)}<span>${esc(L.name)}</span>`);
        if (viaKind) { b.disabled = true; b.title = t('ed_viaKind'); }
        b.addEventListener('click', () => this._change(() => {
          const raw = L.raw;
          raw.entities = on ? (raw.entities || []).filter((x) => x !== e.entity) : [...(raw.entities || []), e.entity];
        }, { keepSel: true }));
        chips.append(b);
      }
      I.append(chips);
    }
    const row = mk('div', 'ebtns');
    row.append(this._btn(`${icon('trash')}<span>${esc(t('ed_removeFromPlan'))}</span>`, 'red', () => this._deleteSel()));
    I.append(row);
    if (M && !room) I.append(this._el(`<p class="small" style="color:rgb(var(--orange))">${esc(t('ed_outside'))}</p>`));
  },

  /* ---------------------------------------------------------------- layers */
  _materializeLayers() {
    if (!this._c.layers?.length) this._c.layers = (this._model()?.layers || []).map((L) => L.id);
  },
  _newLayer() {
    this._change(() => {
      this._materializeLayers();
      const n = this._c.layers.filter((l) => typeof l === 'object').length + 1;
      const id = `layer_${uid()}`;
      this._c.layers.push({ id, name: `${t('ed_layerName')} ${n}`, icon: 'sparkle', show: [], entities: [] });
      this._editLayer = id;
      this._tool = 'layers';
    });
  },
  _p_layers(I) {
    const c = this._c;
    I.append(this._el(`<h2>${esc(t('ed_tool_layers'))}</h2><p class="lead">${esc(t('ed_layers_lead'))}</p>`));
    const defs = this._layerDefs();
    const active = new Set((c.layers?.length ? c.layers : this._model()?.layers.map((L) => L.id) || []).map((l, i) => (typeof l === 'string' ? l : LAYER_TYPES[l.type] && !l.show && !l.entities ? l.type : String(l.id || `layer_${slug(l.name) || i + 1}`))));
    const list = mk('div', '');
    defs.forEach((L) => {
      const on = active.has(L.id);
      const box = this._el(`<div class="elayer"><span class="ei">${this._iconHtml(L.icon)}</span><div><b>${esc(L.name)}</b><small>${esc(this._layerSummary(L))}</small></div><div class="mv"></div></div>`, 'ecard');
      const mv = box.querySelector('.mv');
      if (on) {
        const up = mk('button', '', icon('chevU')), dn = mk('button', '', icon('chevD'));
        up.title = t('ed_up'); dn.title = t('ed_down');
        up.addEventListener('click', () => this._moveLayer(L.id, -1));
        dn.addEventListener('click', () => this._moveLayer(L.id, 1));
        mv.append(up, dn);
      }
      if (L.type === 'custom') {
        const ed = mk('button', '', icon('pencil'));
        ed.title = t('ed_edit');
        ed.addEventListener('click', () => { this._editLayer = this._editLayer === L.id ? null : L.id; this._panel(); });
        mv.append(ed);
      } else if (L.type !== 'vacuum' || c.vacuum) {
        box.querySelector('.elayer').append(this._tglEl(on, (v) => this._change(() => {
          this._materializeLayers();
          if (v) c.layers.push(L.type); else c.layers = c.layers.filter((l) => (typeof l === 'string' ? l : l.type) !== L.type || (typeof l === 'object' && (l.show || l.entities)));
        })));
      }
      if (L.type === 'custom' && this._editLayer === L.id) box.append(this._layerEditor(L));
      list.append(box);
    });
    I.append(list);
    const add = this._btn(`${icon('plus')}<span>${esc(t('ed_ownLayer'))}</span>`, 'wide blue', () => this._newLayer());
    add.style.marginTop = '14px';
    I.append(add);
    I.append(this._el(`<p class="small">${esc(t('ed_layers_help'))}</p>`));
  },
  _layerSummary(L) {
    if (L.type !== 'custom') return t(`ed_layerDesc_${L.type}`);
    const parts = L.kinds.map((k) => t(SHOW_LABEL[k]));
    if (L.ents.length) parts.push(t('nDevices', L.ents.length));
    return parts.join(' · ') || t('ed_layerEmpty');
  },
  _moveLayer(id, dir) {
    this._change(() => {
      this._materializeLayers();
      const L = this._c.layers, idOf = (l, i) => (typeof l === 'string' ? l : LAYER_TYPES[l.type] && !l.show && !l.entities ? l.type : String(l.id || `layer_${slug(l.name) || i + 1}`));
      const i = L.findIndex((l, j) => idOf(l, j) === id), j = i + dir;
      if (i < 0 || j < 0 || j >= L.length) return;
      [L[i], L[j]] = [L[j], L[i]];
    });
  },
  _layerEditor(L) {
    const raw = L.raw, w = mk('div', '');
    w.style.marginTop = '8px';
    if (!raw.id) raw.id = L.id;
    w.append(this._fieldEl(t('ed_name'), this._inp(raw.name, (v) => { raw.name = v; })));
    const grid = mk('div', 'eicons');
    for (const n of LAYER_ICONS) {
      const b = mk('button', n === (raw.icon || 'layers') ? 'act' : '', icon(n));
      b.addEventListener('click', () => this._change(() => { raw.icon = n; }));
      grid.append(b);
    }
    w.append(this._fieldEl(t('ed_icon'), grid));
    const chips = mk('div', 'echips');
    for (const k of SHOW_KINDS) {
      const on = (raw.show || []).includes(k);
      const b = mk('button', `echip chk${on ? ' act' : ''}`, `<span>${esc(t(SHOW_LABEL[k]))}</span>`);
      b.addEventListener('click', () => this._change(() => { raw.show = on ? raw.show.filter((x) => x !== k) : [...(raw.show || []), k]; }));
      chips.append(b);
    }
    w.append(this._fieldEl(t('ed_layerShows'), chips));
    w.append(this._el(`<p class="small">${esc(t('ed_layerShowsHelp'))}</p>`));
    const ents = raw.entities || [];
    const list = mk('div', 'elist');
    for (const id of ents) {
      const row = this._el(`<span class="ei">${icon(GlassFloorplanCard.prototype._autoIcon(id, this._hs()?.states?.[id]))}</span><div><b>${esc(this._fname(id))}</b><small>${esc(id)}</small></div><button class="eadd" title="${esc(t('ed_delete'))}">${icon('minus')}</button>`, 'erow');
      row.style.cursor = 'default';
      row.querySelector('.eadd').addEventListener('click', () => this._change(() => { raw.entities = raw.entities.filter((x) => x !== id); }));
      list.append(row);
    }
    w.append(this._fieldEl(t('ed_layerDevices', ents.length), list));
    const row = mk('div', 'ebtns');
    row.append(
      this._btn(`${icon('plus')}<span>${esc(t('ed_addDevices'))}</span>`, 'blue', () => { this._layerSel = L.id; this._tool = 'devices'; this._s = null; this._draw(); this._panel(); }),
      this._btn(icon('trash'), 'icon red', () => this._change(() => { this._c.layers = this._c.layers.filter((l) => l !== raw); this._editLayer = null; })),
    );
    w.append(row);
    return w;
  },

  /* ---------------------------------------------------------------- tiles */
  _p_tiles(I) {
    const c = this._c;
    I.append(this._el(`<h2>${esc(t('ed_tool_tiles'))}</h2><p class="lead">${esc(t('ed_tiles_lead'))}</p>`));
    const tg = (label, on, fn) => I.append(this._fieldEl(label, this._tglEl(on, (v) => this._change(() => fn(v))), true));
    tg(t('ed_tile_weather'), c.weather !== false, (v) => { if (v) delete c.weather; else c.weather = false; });
    tg(t('ed_tile_indoor'), c.indoor !== false, (v) => { if (v) delete c.indoor; else c.indoor = false; });
    const b = this._btn(`${icon('wand')}<span>${esc(t('ed_autoArrange'))}</span>`, 'wide', () => this._change(() => { delete c.widgets; }));
    b.style.marginTop = '16px';
    I.append(b);
  },
  _pWid(I) {
    const k = this._s.k, manual = Array.isArray(this._c.widgets?.[k]);
    I.append(this._el(`<h2>${esc(t(`ed_tile_${k}`))}</h2><p class="lead">${esc(t(manual ? 'ed_tileManual' : 'ed_tileAuto'))}</p>`));
    if (manual) {
      const b = this._btn(`${icon('wand')}<span>${esc(t('ed_auto'))}</span>`, 'wide', () => this._change(() => { delete this._c.widgets[k]; }));
      I.append(b);
    }
  },

  /* ---------------------------------------------------------------- settings */
  _p_settings(I) {
    const c = this._c;
    I.append(this._el(`<h2>${esc(t('ed_tool_settings'))}</h2>`));
    const set = (k, v, dflt) => { if (v === dflt || v === '' || v == null) delete c[k]; else c[k] = v; };
    I.append(this._fieldEl(t('ed_language'), this._segEl([['auto', t('ed_auto')], ['en', 'English'], ['de', 'Deutsch']], c.language || 'auto', (v) => this._change(() => { set('language', v, 'auto'); this._useLang(); this._shell(); this._dlg.showModal(); requestAnimationFrame(() => { this._draw(); this._panel(); }); }))));
    I.append(this._fieldEl(t('ed_weather'), this._drop([['', t('ed_auto')], ['__off', t('ed_none')], ...this._entityOptions((id) => domainOf(id) === 'weather').slice(0)], c.weather === false ? '__off' : c.weather || '', (v) => { if (v === '__off') c.weather = false; else set('weather', v, ''); })));
    I.append(this._fieldEl(t('ed_layout'), this._segEl([['auto', t('ed_auto')], ['desktop', t('ed_prev_laptop')], ['mobile', t('ed_prev_phone')]], c.layout || 'auto', (v) => this._change(() => set('layout', v, 'auto')))));
    I.append(this._el(`<p class="small">${esc(t('ed_layout_help'))}</p>`));
    const rot = String(c.mobile?.rotate ?? 'auto');
    I.append(this._fieldEl(t('ed_rotate_phone'), this._segEl([['auto', t('ed_auto')], ['0', '0°'], ['90', '90°'], ['-90', '−90°']], rot, (v) => this._change(() => { if (v === 'auto') delete c.mobile; else c.mobile = { ...(c.mobile || {}), rotate: +v }; }))));
    I.append(this._fieldEl(t('ed_height'), this._segEl([['screen', t('ed_fit_screen')], ['width', t('ed_fit_width')]], c.fit || 'screen', (v) => this._change(() => set('fit', v, 'screen')))));
    I.append(this._fieldEl(t('ed_modesLabel'), this._inp(c.modes_label || '', (v) => set('modes_label', v.trim(), ''), { placeholder: 'Dashboard mode' })));
    I.append(this._el(`<p class="small">${esc(t('ed_modes_help'))}</p>`));
  },
});
