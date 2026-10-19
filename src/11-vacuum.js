/* ================================================================== Vacuum layer (Roborock): room selection, start, animated robot
 * Only the vacuum entity is needed – status, battery, current room, cleaning mode and mop intensity are found
 * on the same device. Rooms are cleaned with vacuum.clean_area (Home Assistant areas) or, as a fallback,
 * with Roborock segment ids (roborock.get_maps + app_segment_clean). */
const VAC_KEYS = {
  status: ['sensor', ['status']], battery: ['sensor', ['battery']], progress: ['sensor', ['cleaning_progress']],
  room: ['sensor', ['current_room']], error: ['sensor', ['vacuum_error']], area: ['sensor', ['cleaning_area']],
  time: ['sensor', ['cleaning_time']], charging: ['binary_sensor', ['charging']], mode: ['select', ['cleaning_mode']],
  water: ['select', ['mop_intensity']],
};
const VAC_MODES = [{ v: 'vacuum', i: 'robot', rate: 1.2 }, { v: 'vac_and_mop', i: 'vacmop', rate: 1.8 }, { v: 'mop', i: 'drop', rate: 1.6 }];
const FAN_PREF = ['quiet', 'balanced', 'turbo', 'max', 'max_plus'];
const WATER_PREF = ['low', 'mild', 'medium', 'moderate', 'high', 'intense'];
const normName = (s) => slug(s).replace(/_/g, '');

Object.assign(GlassFloorplanCard.prototype, {

  _vacEnts() {
    const V = this._M?.vac;
    if (!V) return {};
    if (this._vacE?._for === V.entity && this._vacE._n === Object.keys(this._hass?.entities || {}).length) return this._vacE;
    const h = this._hass, dev = h?.entities?.[V.entity]?.device_id;
    const sib = dev ? Object.values(h.entities).filter((e) => e.device_id === dev) : [];
    const base = V.entity.split('.')[1];
    const out = { entity: V.entity };
    for (const [k, [dom, keys]] of Object.entries(VAC_KEYS)) {
      if (V[k]) { out[k] = V[k]; continue; }
      const hit = sib.find((e) => e.entity_id.startsWith(`${dom}.`) && (keys.includes(e.translation_key) || keys.some((x) => e.entity_id.endsWith(`_${x}`))));
      const id = hit?.entity_id || keys.map((x) => `${dom}.${base}_${x}`).find((x) => h?.states?.[x]);
      if (id) out[k] = id;
    }
    Object.defineProperty(out, '_for', { value: V.entity });
    Object.defineProperty(out, '_n', { value: Object.keys(h?.entities || {}).length });
    this._vacE = out;
    return out;
  },
  _vs(k) { const id = this._vacEnts()[k]; return id ? this._hass.states[id] : null; },

  _vacRunning() { return ['cleaning', 'returning', 'paused'].includes(this._vs('entity')?.state); },

  /* name of the robot's room → room of the card (configured map, else by name / area) */
  _vacRoomFor(name) {
    if (!name) return null;
    const map = this._M.vac.rooms || {};
    if (map[name] && this._M.byRoom[map[name]]) return map[name];
    const n = normName(name);
    const r = this._M.rooms.find((x) => normName(x.name) === n || (x.area && (normName(x.area) === n || normName(this._hass.areas?.[x.area]?.name) === n)));
    return r?.id || null;
  },
  _vacRoomKey() { return this._vacRoomFor(this._vs('room')?.state); },

  _vacStatusText() {
    const vac = this._vs('entity'), vs = vac?.state, st = this._vs('status')?.state, rk = this._vacRoomKey();
    const batt = this._vacBattery();
    if (vs === 'cleaning') return rk ? t('cleaningRoom', this._M.byRoom[rk].name) : t('cleaning');
    if (vs === 'returning') return t('returning');
    if (vs === 'paused') return t('paused');
    if (vs === 'docked') return st === 'charging' && batt != null && batt < 100 ? t('charging') : t('docked');
    if (vs === 'error') return t('needsHelp');
    if (unavailable(vac)) return t('notReachableShort');
    return tf(`vs_${st}`, t('ready'));
  },
  _vacBattery() { const b = num(this._vs('battery')); return b ?? (this._vs('entity')?.attributes?.battery_level ?? null); },

  _roomCleanLabel(k) {
    const i = this._sel.indexOf(k);
    if (this._vacRunning()) return this._vs('entity')?.state === 'cleaning' && this._vacRoomKey() === k ? t('beingCleaned') : '';
    return i >= 0 ? `${fmt(this._M.byRoom[k].m2, 0)} m²` : '';
  },

  _vacModes() {
    const opts = this._vs('mode')?.attributes?.options || [];
    const m = VAC_MODES.filter((x) => opts.includes(x.v));
    return m.length > 1 ? m : [VAC_MODES[0]];
  },
  _vacFans() {
    const list = this._vs('entity')?.attributes?.fan_speed_list || [];
    let f = FAN_PREF.filter((x) => list.includes(x)).slice(0, 4);
    if (f.length < 2) f = list.filter((x) => !['off', 'custom'].includes(x)).slice(0, 4);
    return f.map((v) => ({ v, t: tf(`fan_${v}`, v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' ')) }));
  },
  _vacWaters() {
    const list = this._vs('water')?.attributes?.options || [];
    let w = WATER_PREF.filter((x) => list.includes(x)).slice(0, 4);
    if (w.length < 2) w = list.filter((x) => !['off', 'custom', 'custom_water_flow', 'smart_mode'].includes(x)).slice(0, 4);
    return w.map((v) => ({ v, t: tf(`water_${v}`, v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' ')) }));
  },

  _vacRoomTap(k) {
    if (this._vacRunning()) { this._toast(t('cleaningRunning')); return; }
    const i = this._sel.indexOf(k);
    if (i >= 0) this._sel.splice(i, 1); else this._sel.push(k);
    this._updClean();
  },

  /* ---------------------------------------------------------------- Layer card */
  _cleanGap(upd) {
    const v = mk('div', 'gv cv', `<div class="gk"><span class="lab">${esc(t('layer_vacuum'))}</span><span class="bat">${icon('battery')}<span></span></span></div>
      <div class="gt"><b></b><span class="w" hidden></span><button class="lnk all"></button></div>
      <div class="gs"></div>
      <div class="prog" hidden><i></i></div>
      <div class="gbtns"><button class="gbtn glass mode" aria-haspopup="menu"></button><button class="gbtn blue go"></button></div>`);
    const modeBtn = v.querySelector('.mode'), go = v.querySelector('.go'), all = v.querySelector('.all');
    const E = () => this._vacEnts().entity;
    modeBtn.addEventListener('click', () => {
      if (this._vacRunning()) { this._call('vacuum', this._vs('entity')?.state === 'paused' ? 'start' : 'pause', { entity_id: E() }).catch(() => {}); return; }
      if (this._menuAnchor === modeBtn && this._menu.classList.contains('open')) this._closeMenu(); else this._openCleanMenu(modeBtn);
    });
    go.addEventListener('click', () => {
      if (this._vacRunning()) { this._call('vacuum', 'return_to_base', { entity_id: E() }).catch(() => {}); return; }
      this._startClean(go);
    });
    all.addEventListener('click', () => {
      const keys = this._M.rooms.map((r) => r.id);
      this._sel = this._sel.length === keys.length ? [] : keys;
      this._updClean();
    });
    upd.push(() => {
      const running = this._vacRunning(), vs = this._vs('entity')?.state;
      const batt = this._vacBattery();
      v.querySelector('.bat span').textContent = batt != null ? `${Math.round(batt)} %` : '';
      v.querySelector('.bat').style.color = batt != null && batt < 20 ? 'rgb(var(--red))' : '';
      const prog = v.querySelector('.prog');
      prog.hidden = !running;
      if (running) {
        const p = num(this._vs('progress')), rk = this._vacRoomKey();
        v.querySelector('.lab').textContent = vs === 'paused' ? t('paused') : vs === 'returning' ? t('returnTrip') : p != null ? t('cleaningPct', p) : t('cleaning');
        v.querySelector('.gt b').textContent = vs === 'returning' ? t('toDock') : rk ? this._M.byRoom[rk].name : t('onTheWay');
        const area = num(this._vs('area')), time = num(this._vs('time'));
        const stat = v.querySelector('.gt .w');
        stat.textContent = [area != null ? `${fmt(area, 1)} m²` : '', time != null ? `${Math.round(time)} ${t('min')}` : ''].filter(Boolean).join(' · ');
        stat.hidden = false;
        v.querySelector('.gs').hidden = true;
        prog.querySelector('i').style.setProperty('--p', `${p ?? 0}%`);
        all.hidden = true;
        modeBtn.innerHTML = `${icon(vs === 'paused' ? 'play' : 'pause')}<span>${esc(vs === 'paused' ? t('resume') : t('pause'))}</span>`;
        go.className = 'gbtn white go';
        go.innerHTML = `${icon('dock')}<span>${esc(t('toDock'))}</span>`;
        go.disabled = vs === 'returning';
        modeBtn.disabled = vs === 'returning';
        return;
      }
      v.querySelector('.lab').textContent = this._vacStatusText();
      v.querySelector('.gt .w').hidden = true;
      v.querySelector('.gs').hidden = false;
      const n = this._sel.length;
      const modes = this._vacModes(), mode = modes.find((m) => m.v === this._mode) || modes[0];
      v.querySelector('.gt b').textContent = n ? t('nRooms', n) : t('pickRooms');
      const m2 = this._sel.reduce((s, k) => s + (this._M.byRoom[k]?.m2 || 0), 0);
      v.querySelector('.gs').textContent = n ? `${t('approx')} ${fmt(m2, 0)} m² · ${Math.max(3, Math.round(m2 * mode.rate))} ${t('min')}` : t('tapRooms');
      all.hidden = false;
      all.textContent = n === this._M.rooms.length ? t('none') : t('all');
      modeBtn.disabled = false;
      modeBtn.innerHTML = `${icon(mode.i)}<span>${esc(t(`mode_${mode.v}`))}</span>${icon('chevU', 'sm')}`;
      go.className = 'gbtn blue go';
      if (!this._starting) {
        go.innerHTML = `${icon('play')}<span>${esc(t('start'))}</span>`;
        go.disabled = !n || unavailable(this._vs('entity'));
      }
    });
    return v;
  },

  _openCleanMenu(anchor) {
    const modes = this._vacModes();
    const items = modes.length > 1 ? modes.map((m) => ({
      icon: m.i, label: t(`mode_${m.v}`), check: true, act: m.v === (this._mode || modes[0].v),
      onClick: () => { this._mode = m.v; this._save(); this._updClean(); },
    })) : [];
    const fans = this._vacFans(), waters = this._vacWaters(), mode = this._mode || modes[0].v;
    if (mode !== 'mop' && fans.length > 1) items.push(...(items.length ? [{ sep: true }] : []), { head: t('suction') }, { seg: { options: fans, value: this._fan, onChange: (val) => { this._fan = val; this._save(); } } });
    if (mode !== 'vacuum' && waters.length > 1) items.push(...(items.length ? [{ sep: true }] : []), { head: t('water') }, { seg: { options: waters, value: this._water, onChange: (val) => { this._water = val; this._save(); } } });
    if (!items.length) items.push({ note: t('noVacOptions') });
    this._openMenu(anchor, items);
  },

  _updClean() {
    const h = this._hass;
    if (!h || !this._built || !this._M.vac) return;
    const vac = this._vs('entity');
    const modes = this._vacModes(), fans = this._vacFans(), waters = this._vacWaters();
    if (!modes.some((m) => m.v === this._mode)) this._mode = modes.some((m) => m.v === this._vs('mode')?.state) ? this._vs('mode').state : modes[0].v;
    if (!fans.some((f) => f.v === this._fan)) this._fan = fans.some((f) => f.v === vac?.attributes?.fan_speed) ? vac.attributes.fan_speed : (fans.find((f) => f.v === 'balanced') || fans[0])?.v || null;
    if (!waters.some((w) => w.v === this._water)) this._water = waters.some((w) => w.v === this._vs('water')?.state) ? this._vs('water').state : (waters[Math.floor(waters.length / 2)] || {}).v || null;
    const clean = this._layer().type === 'vacuum', running = this._vacRunning(), rk = this._vacRoomKey();
    for (const [k, el] of Object.entries(this._roomEls)) {
      const i = this._sel.indexOf(k);
      el.classList.toggle('sel', clean && !running && i >= 0);
      el.classList.toggle('busy', clean && running);
      el.classList.toggle('cur', clean && running && rk === k && vac?.state === 'cleaning');
      if (i >= 0) el.querySelector('.badge').textContent = i + 1;
      el.setAttribute('aria-pressed', clean ? String(i >= 0) : 'false');
    }
    this._updRooms();
    if (this._gapKind === this._layer().id && clean) this._gapUpd.forEach((f) => f());
  },

  /* Roborock segment ids by room name (read-only service call) */
  async _vacSegments() {
    if (this._segs) return this._segs;
    const E = this._vacEnts().entity;
    const res = await this._hass.callWS({ type: 'call_service', domain: 'roborock', service: 'get_maps', target: { entity_id: E }, return_response: true });
    const maps = res?.response?.[E]?.maps || [];
    const sel = this._hass.states[`select.${E.split('.')[1]}_selected_map`]?.state;
    const map = maps.find((m) => m.name === sel) || maps.find((m) => m.flag === 0) || maps[0];
    const out = {};
    for (const [id, name] of Object.entries(map?.rooms || {})) { const k = this._vacRoomFor(name); if (k) (out[k] = out[k] || []).push(+id); }
    this._segs = out;
    return out;
  },

  async _startClean(btn) {
    if (!this._sel.length || this._starting) return;
    const h = this._hass, V = this._vacEnts(), E = V.entity, rooms = this._sel.map((k) => this._M.byRoom[k]);
    this._starting = true;
    btn.disabled = true;
    btn.innerHTML = `${icon('play')}<span>${esc(t('starting'))}</span>`;
    try {
      if (V.mode && this._vacModes().length > 1 && h.states[V.mode]?.state !== this._mode) await h.callService('select', 'select_option', { entity_id: V.mode, option: this._mode });
      if (this._mode !== 'mop' && this._fan && h.states[E]?.attributes?.fan_speed !== this._fan) await h.callService('vacuum', 'set_fan_speed', { entity_id: E, fan_speed: this._fan });
      if (this._mode !== 'vacuum' && V.water && this._water && h.states[V.water]?.state !== this._water) await h.callService('select', 'select_option', { entity_id: V.water, option: this._water });
      const method = this._M.vac.method || 'auto';
      const areaOk = rooms.every((r) => r.area) && (method === 'area' || (method === 'auto' && h.services?.vacuum?.clean_area));
      if (areaOk) await h.callService('vacuum', 'clean_area', { entity_id: E, cleaning_area_id: rooms.map((r) => r.area) });
      else {
        const segs = await this._vacSegments();
        const ids = rooms.flatMap((r) => segs[r.id] || []);
        if (!ids.length) throw new Error(t('noRoomMapping'));
        await h.callService('vacuum', 'send_command', { entity_id: E, command: 'app_segment_clean', params: [{ segments: ids, repeat: 1 }] });
      }
      this._toast(`${t('cleaningStarted')} · ${rooms.map((r) => r.name).join(', ')}`);
      this._sel = [];
    } catch (e) {
      this._toast(t('startFailed', e?.message || e));
    } finally {
      this._starting = false;
      this._updClean();
    }
  },

  /* ---------------------------------------------------------------- Robot animation */
  _dock() {
    const V = this._M.vac;
    return V.dock || center(this._M.rooms[this._M.rooms.length - 1]?.r || [0, 0, 0, 0]);
  },
  _dockApproach() {
    const d = this._dock(), rk = this._M.roomAt(d), c = rk ? center(this._M.byRoom[rk].r) : d, D = this._M.D;
    const len = Math.hypot(c[0] - d[0], c[1] - d[1]) || 1, k = Math.min(1, (34 * D) / len);
    return [d[0] + (c[0] - d[0]) * k, d[1] + (c[1] - d[1]) * k];
  },

  _route(from, toRoom, toPt) {
    const fk = this._M.roomAt(from);
    return [...routeBetween(this._M, fk, toRoom), [...toPt]];
  },

  _meander(room, flip) {
    const [a, b, c, d] = this._M.byRoom[room].r, D = this._M.D;
    const m = 26 * D, step = 30 * D, pts = [];
    let i = 0;
    if (c - a <= d - b) for (let x = a + m; x <= c - m; x += step, i++) pts.push(...(i % 2 ? [[x, d - m], [x, b + m]] : [[x, b + m], [x, d - m]]));
    else for (let y = b + m; y <= d - m; y += step, i++) pts.push(...(i % 2 ? [[c - m, y], [a + m, y]] : [[a + m, y], [c - m, y]]));
    if (!pts.length) pts.push(center([a, b, c, d]));
    return flip ? pts.reverse() : pts;
  },

  _robotTarget() {
    const vs = this._vs('entity')?.state, rk = this._vacRoomKey();
    if (vs === 'cleaning' && rk) return { type: 'clean', room: rk, key: `clean:${rk}` };
    if (vs === 'returning' || vs === 'docked') return { type: 'dock', key: 'dock' };
    return { type: 'stay', key: 'stay' };
  },

  _updRobot() {
    if (!this._hass || !this._botEl || !this._M.vac) return;
    const tgt = this._robotTarget();
    if (!this._robot) {
      const rk = this._vacRoomKey();
      this._robot = { pos: tgt.type !== 'dock' && rk ? center(this._M.byRoom[rk].r) : [...this._dock()], rot: 0, path: [], mode: 'stay', key: '', flip: false, inRoom: false };
    }
    const R = this._robot;
    if (R.key !== tgt.key) {
      R.key = tgt.key; R.mode = tgt.type; R.room = tgt.room;
      if (tgt.type === 'clean') {
        R.inRoom = false;
        R.path = this._route(R.pos, tgt.room, this._meander(tgt.room, false)[0]);
        this.$('.trail')?.classList.remove('fade');
      } else if (tgt.type === 'dock') {
        const d = this._dock(), atDock = Math.hypot(R.pos[0] - d[0], R.pos[1] - d[1]) < 2;
        R.path = atDock ? [] : [...this._route(R.pos, this._M.roomAt(d), this._dockApproach()), [...d]];
      } else R.path = [];
      if (this._reduced && R.path.length) { R.pos = R.path[R.path.length - 1]; R.path = []; }
    }
    // the robot belongs to the vacuum layer only
    this._botEl.classList.toggle('show', this._layer().type === 'vacuum');
    this._botEl.classList.toggle('charging', (isOn(this._vs('charging')) || this._vs('status')?.state === 'charging') && R.mode === 'dock' && !R.path.length);
    this._renderRobot();
    this._kickRobot();
  },

  _kickRobot() {
    const R = this._robot;
    if (this._rraf || !R || this._reduced || !this.isConnected || this._layer().type !== 'vacuum' || (!R.path.length && R.mode !== 'clean')) return;
    this._rlast = performance.now();
    this._rraf = requestAnimationFrame((tt) => this._tickRobot(tt));
  },

  _tickRobot(tm) {
    const R = this._robot, D = this._M.D;
    if (!R || this._layer().type !== 'vacuum' || !this.isConnected) { this._rraf = null; return; }
    const dt = Math.min(0.05, (tm - this._rlast) / 1000);
    this._rlast = tm;
    if (!R.path.length) {
      if (R.mode === 'clean') {
        R.flip = R.inRoom ? !R.flip : false;
        R.inRoom = true;
        R.path = this._meander(R.room, R.flip).slice(1);
      } else {
        this._rraf = null;
        if (R.mode === 'dock') {
          setTimeout(() => this.$('.trail')?.classList.add('fade'), 400);
          setTimeout(() => { if (R.mode === 'dock') { this._trail = []; this._drawTrail(); } }, 2400);
        }
        this._updRobot();
        return;
      }
    }
    const [tx, ty] = R.path[0];
    const dx = tx - R.pos[0], dy = ty - R.pos[1], dist = Math.hypot(dx, dy);
    const step = (R.mode === 'clean' && R.inRoom ? 40 : 90) * D * dt;
    if (dist <= step) { R.pos = [tx, ty]; R.path.shift(); } else R.pos = [R.pos[0] + (dx / dist) * step, R.pos[1] + (dy / dist) * step];
    if (dist > 0.5 * D) {
      const target = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      R.rot += ((((target - R.rot) % 360) + 540) % 360 - 180) * Math.min(1, dt * 9);
    }
    if (R.mode === 'clean' && R.inRoom) {
      const lp = this._trail[this._trail.length - 1];
      if (!lp || Math.hypot(lp[0] - R.pos[0], lp[1] - R.pos[1]) > 6 * D) {
        this._trail.push([Math.round(R.pos[0]), Math.round(R.pos[1])]);
        if (this._trail.length > 700) this._trail.shift();
        this._drawTrail();
      }
    }
    this._renderRobot();
    this._rraf = requestAnimationFrame((tt) => this._tickRobot(tt));
  },

  _drawTrail() {
    const pl = this.shadowRoot.querySelectorAll('.trail polyline');
    if (pl.length < 2) return;
    const pts = this._trail.map((p) => p.join(',')).join(' '), D = this._M.D;
    pl[0].setAttribute('points', pts);
    pl[1].setAttribute('points', pts);
    pl[0].setAttribute('stroke-width', (30 * D).toFixed(1));
    pl[1].setAttribute('stroke-width', (2.5 * D).toFixed(2));
  },

  _renderRobot() {
    const R = this._robot;
    if (!R || !this._botEl) return;
    this._botEl.style.left = `${this._G.px(R.pos[0])}%`;
    this._botEl.style.top = `${this._G.py(R.pos[1])}%`;
    this._botEl.style.setProperty('--rot', `${R.rot.toFixed(1)}deg`);
    this._botEl.classList.toggle('moving', R.mode === 'clean' || (R.mode === 'dock' && R.path.length > 0));
  },
});
