/* ================================================================== Any other entity: switches, sensors, locks, buttons … + own layers */
Object.assign(GlassFloorplanCard.prototype, {

  /* switchable devices as tiles, everything else as rows */
  _devicesSection(ents, upd) {
    const w = mk('div', 'psec');
    w.append(this._secHead(t('devices'), true));
    const tg = ents.filter((e) => TOGGLE_DOMAINS.includes(domainOf(e.entity))), rest = ents.filter((e) => !tg.includes(e));
    if (tg.length) {
      const tiles = mk('div', 'tiles');
      tg.forEach((e) => tiles.append(this._switchTile(e, upd)));
      w.append(tiles);
    }
    if (rest.length) {
      const rows = mk('div', 'srows');
      if (tg.length) rows.style.marginTop = '16px';
      rest.forEach((e) => rows.append(this._deviceRow(e.entity, upd, e)));
      w.append(rows);
    }
    return w;
  },

  _switchTile(e, upd) {
    const eid = e.entity, d = domainOf(eid);
    const el = mk('div', 'tile', `<div class="tb" role="switch" tabindex="0" aria-label="${esc(this._name(e))}"><i class="fill"></i>${this._iconHtml(e.icon || this._autoIcon(eid, this._hass.states[eid]))}</div><div class="tn">${esc(this._name(e))}</div><div class="tv"></div>`);
    el.dataset.focus = eid;
    const tb = el.querySelector('.tb'), tv = el.querySelector('.tv');
    const c = d === 'fan' ? [120, 220, 255] : d === 'humidifier' ? [110, 200, 255] : [255, 214, 120];
    tb.style.setProperty('--c', c.join(','));
    tb.style.setProperty('--cl', lighten(c, 0.5).join(','));
    const tap = () => {
      const st = this._st(eid);
      if (unavailable(st)) { this._toast(t('notReachable', this._name(e))); return; }
      const want = !isOn(st);
      this._optimistic[eid] = { on: want, until: Date.now() + 2500 };
      this._kickOptimistic();
      this._call('homeassistant', want ? 'turn_on' : 'turn_off', { entity_id: eid }).catch(() => { this._optimistic = {}; this._update(true); });
    };
    this._press(tb, tap, () => this._openDevice(eid, tb));
    upd.push(() => {
      const s = this._st(eid), on = isOn(s);
      tb.style.setProperty('--v', on ? '100%' : '0%');
      tb.classList.toggle('on', on);
      const pw = this._powerOf(eid);
      tv.textContent = unavailable(s) ? t('offline') : on ? (pw != null ? `${fmt(pw, pw < 10 ? 1 : 0)} W` : d === 'fan' && s.attributes.percentage ? `${s.attributes.percentage} %` : t('on')) : t('off');
      el.classList.toggle('na', unavailable(s));
    });
    return el;
  },

  /* a power sensor of the same device (for switches / plugs) */
  _powerOf(eid) {
    const h = this._hass, dev = h.entities?.[eid]?.device_id;
    if (!dev) return null;
    const p = Object.values(h.entities).find((x) => x.device_id === dev && x.entity_id.startsWith('sensor.') && h.states[x.entity_id]?.attributes?.device_class === 'power');
    return p ? num(h.states[p.entity_id]) : null;
  },

  /* one row: icon, name, state – with a switch / button where it makes sense */
  _deviceRow(eid, upd, e) {
    const d = domainOf(eid), name = e ? this._name(e) : this._nameOf(eid);
    const row = mk('div', 'srow', `<span class="ri2"></span><div><b>${esc(name)}</b><span></span></div><span class="sv"></span>`);
    row.dataset.focus = eid;
    this._hold(row, eid);
    const sv = row.querySelector('.sv'), sub = row.querySelector(':scope > div > span'), ic = row.querySelector('.ri2');
    let ctl = null, armed = 0;
    if (TOGGLE_DOMAINS.includes(d)) {
      ctl = mk('button', 'tgl');
      ctl.setAttribute('role', 'switch');
      ctl.setAttribute('aria-label', name);
      ctl.addEventListener('click', () => {
        const st = this._st(eid), want = !isOn(st);
        this._optimistic[eid] = { on: want, until: Date.now() + 2500 };
        this._kickOptimistic();
        this._call('homeassistant', want ? 'turn_on' : 'turn_off', { entity_id: eid }).catch(() => { this._optimistic = {}; this._update(true); });
      });
    } else if (PRESS_DOMAINS.includes(d)) {
      ctl = mk('button', 'cbtn', icon(d === 'scene' ? 'sparkle' : 'play'));
      ctl.setAttribute('aria-label', t('run'));
      ctl.addEventListener('click', () => { this._pressEntity(eid).then(() => this._toast(t(d === 'scene' ? 'activated' : 'started', name))).catch(() => {}); });
    } else if (d === 'lock') {
      // unlocking needs a second tap within three seconds
      ctl = mk('button', 'pbtn');
      ctl.style.cssText = 'flex:none;height:36px;padding:0 14px;font-size:13.5px;border-radius:12px';
      ctl.addEventListener('click', () => {
        const st = this._hass.states[eid], locked = st?.state === 'locked';
        if (locked && Date.now() - armed > 3000) { armed = Date.now(); ctl.textContent = t('tapToConfirm'); setTimeout(() => upd.forEach((f) => f()), 3100); return; }
        armed = 0;
        this._call('lock', locked ? 'unlock' : 'lock', { entity_id: eid }).catch(() => {});
      });
    } else if (d === 'cover') {
      ctl = mk('button', 'cbtn');
      ctl.addEventListener('click', () => this._coverToggle(eid));
    }
    if (ctl) { sv.replaceWith(ctl); }
    upd.push(() => {
      const st = this._st(eid);
      const icn = e?.icon || this._autoIcon(eid, st);
      if (ic.dataset.i !== icn) { ic.dataset.i = icn; ic.innerHTML = this._iconHtml(icn); }
      row.classList.toggle('na', unavailable(st));
      const txt = d === 'cover' ? this._coverText(st) : d === 'climate' ? this._climText(st) : this._stateText(eid, st);
      if (TOGGLE_DOMAINS.includes(d)) { ctl.classList.toggle('on', isOn(st)); ctl.setAttribute('aria-checked', isOn(st)); sub.textContent = unavailable(st) ? t('offline') : ''; }
      else if (d === 'lock') { if (!armed || Date.now() - armed > 3000) ctl.textContent = st?.state === 'locked' ? t('unlock') : t('lock'); sub.textContent = txt; ctl.disabled = unavailable(st); }
      else if (d === 'cover') { ctl.innerHTML = icon(this._coverPos(st) > 1 ? 'down' : 'up'); sub.textContent = txt; }
      else if (PRESS_DOMAINS.includes(d)) { sub.textContent = txt; }
      else {
        sv.textContent = txt;
        row.classList.toggle('on', d === 'binary_sensor' && isOn(st) && !['motion', 'occupancy', 'presence', 'connectivity', 'power', 'plug', 'running', 'light'].includes(st?.attributes?.device_class));
        sub.textContent = st?.last_changed && d === 'binary_sensor' ? relTime(st.last_changed) : '';
      }
      sub.hidden = !sub.textContent;
    });
    return row;
  },

  /* room label in an own layer: "2 on", "Window open", or a single reading */
  _roomCustomLabel(k, L) {
    const ents = this._roomEnts(k, L);
    if (!ents.length) return '';
    const onN = ents.filter((e) => (e.kind === 'light' || TOGGLE_DOMAINS.includes(domainOf(e.entity))) && isOn(this._st(e.entity))).length;
    const alerts = ents.filter((e) => this._isAlert(e.entity));
    if (alerts.length === 1) return this._stateText(alerts[0].entity, this._hass.states[alerts[0].entity]);
    if (alerts.length > 1) return t('nAlerts', alerts.length);
    if (onN) return t('nOn', onN);
    const read = ents.find((e) => domainOf(e.entity) === 'sensor');
    if (read && ents.length <= 2) return this._stateText(read.entity, this._hass.states[read.entity]);
    const cov = ents.filter((e) => e.kind === 'cover');
    if (cov.length) return this._roomCoverLabel(k, L);
    const cl = this._climateOf(ents.filter((e) => e.kind === 'climate').map((e) => e.entity));
    if (cl.t != null) return `${fmt(cl.t, 1)}°`;
    return ents.some((e) => TOGGLE_DOMAINS.includes(domainOf(e.entity)) || e.kind === 'light') ? t('off') : '';
  },

  /* open windows / doors, unlocked locks, leaks … */
  _isAlert(eid) {
    const st = this._hass.states[eid], d = domainOf(eid), dc = st?.attributes?.device_class;
    if (d === 'binary_sensor') return isOn(st) && ['door', 'window', 'opening', 'garage_door', 'moisture', 'smoke', 'gas', 'carbon_monoxide', 'safety', 'problem', 'tamper', 'lock'].includes(dc);
    if (d === 'lock') return ['unlocked', 'open', 'jammed'].includes(st?.state);
    if (d === 'alarm_control_panel') return st?.state === 'triggered';
    return false;
  },

  /* ---------------------------------------------------------------- Layer card of an own layer */
  _customGap(L, upd) {
    const ents = this._ents(L);
    const sw = ents.filter((e) => e.kind === 'light' || TOGGLE_DOMAINS.includes(domainOf(e.entity)));
    const watch = ents.filter((e) => ['binary_sensor', 'lock', 'alarm_control_panel'].includes(domainOf(e.entity)));
    const seg = sw.length ? sw : watch;
    const v = mk('div', 'gv sub', `<div class="gk"><span>${esc(this._layerName(L))}</span><span class="bat"></span></div>
      <div class="gt"><b></b><span class="w"></span></div><div class="gs"></div>
      <div class="segs">${seg.map((e) => `<i data-e="${esc(e.entity)}"></i>`).join('')}</div>
      <div class="gbtns"><button class="gbtn glass modes" aria-haspopup="menu">${icon('sparkle')}<span>${esc(t('modes'))}</span>${icon('chevU', 'sm')}</button>${sw.length ? `<button class="gbtn white off">${icon('power')}<span>${esc(t('allOff'))}</span></button>` : ''}</div>`);
    const modes = v.querySelector('.modes');
    modes.addEventListener('click', () => (this._menuAnchor === modes && this._menu.classList.contains('open') ? this._closeMenu() : this._openModes(modes)));
    v.querySelector('.off')?.addEventListener('click', () => this._allOff(sw.map((e) => e.entity)));
    v.querySelector('.gk .bat').innerHTML = this._iconHtml(L.icon);
    upd.push(() => {
      const on = sw.filter((e) => isOn(this._st(e.entity)));
      const alerts = ents.filter((e) => this._isAlert(e.entity));
      const b = v.querySelector('.gt b'), gs = v.querySelector('.gs');
      if (sw.length) b.textContent = on.length ? t('nActive', on.length) : t('allOffState');
      else b.textContent = alerts.length ? t('nAlerts', alerts.length) : watch.length ? t('allClear') : t('nDevices', ents.length);
      const lights = ents.filter((e) => e.kind === 'light');
      const p = this._lightPower(lights);
      v.querySelector('.gt .w').textContent = on.length && p.w ? `${p.est ? '≈ ' : ''}${fmt(p.w, 0)} W` : '';
      gs.textContent = alerts.length ? alerts.slice(0, 2).map((e) => `${this._name(e)}: ${this._stateText(e.entity, this._hass.states[e.entity])}`).join(' · ')
        : sw.length && watch.length ? t('allClear') : this._layerSummary(ents);
      gs.style.color = alerts.length ? 'rgb(var(--orange))' : '';
      for (const e of seg) {
        const el = v.querySelector(`.segs i[data-e="${CSS.escape(e.entity)}"]`), st = this._st(e.entity);
        const lit = sw.length ? isOn(st) : this._isAlert(e.entity);
        el.classList.toggle('on', lit);
        el.style.setProperty('--c', (e.kind === 'light' ? lightRgb(e, st) : sw.length ? [255, 214, 120] : [255, 159, 10]).join(','));
      }
      const off = v.querySelector('.off');
      if (off) off.disabled = !on.length;
    });
    return v;
  },

  _layerSummary(ents) {
    const c = this._climateOf(ents.filter((e) => e.kind === 'climate').map((e) => e.entity));
    const parts = [];
    if (c.t != null) parts.push(`${fmt(c.t, 1)}°`);
    const cov = ents.filter((e) => e.kind === 'cover');
    if (cov.length) parts.push(t('nOfOpen', cov.filter((e) => this._coverPos(this._hass.states[e.entity]) > 1).length, cov.length));
    return parts.join(' · ') || t('nDevices', ents.length);
  },
});
