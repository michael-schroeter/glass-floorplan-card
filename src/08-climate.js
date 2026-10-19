/* ================================================================== Climate layer: room temperatures, thermostats, dial */
const HVAC_ICON = { off: 'power', heat: 'flame', cool: 'snowflake', heat_cool: 'thermo', auto: 'autoMode', dry: 'drop', fan_only: 'fan' };
const HVAC_ORDER = ['off', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only'];
const HEAT_RGB = [255, 150, 62], COOL_RGB = [96, 172, 255];

/* "20,8°" with a small decimal part, for the round markers */
function tempHtml(v, unit = '°') {
  if (v == null) return '–';
  const s = fmt(v, 1), m = s.match(/^(-?\d+)(\D)(\d)$/);
  return m ? `${m[1]}<small>${m[2]}${m[3]}${unit}</small>` : `${esc(s)}<small>${unit}</small>`;
}

Object.assign(GlassFloorplanCard.prototype, {

  _climAction(st) {
    const a = st?.attributes || {};
    if (a.hvac_action) return a.hvac_action;
    if (unavailable(st) || st.state === 'off') return 'off';
    const cur = +a.current_temperature, tgt = +a.temperature;
    if (Number.isFinite(cur) && Number.isFinite(tgt)) {
      if (st.state === 'heat' || st.state === 'heat_cool' || st.state === 'auto') if (cur < tgt - 0.2) return 'heating';
      if (st.state === 'cool') if (cur > tgt + 0.2) return 'cooling';
    }
    return 'idle';
  },

  _climText(st) {
    const a = st?.attributes || {};
    if (unavailable(st)) return t('offline');
    const cur = a.current_temperature != null ? `${fmt(+a.current_temperature, 1)}°` : '';
    if (st.state === 'off') return [cur, t('off')].filter(Boolean).join(' · ');
    const tgt = a.temperature != null ? `${fmt(+a.temperature, 1)}°` : a.target_temp_low != null ? `${fmt(+a.target_temp_low, 1)}–${fmt(+a.target_temp_high, 1)}°` : '';
    const act = this._climAction(st);
    return [cur, tgt ? `${act === 'cooling' || st.state === 'cool' ? t('coolTo') : t('heatTo')} ${tgt}` : tf(`hvac_${st.state}`, st.state)].filter(Boolean).join(' · ');
  },

  _updClimMarker(e, el) {
    const st = this._hass.states[e.entity], d = domainOf(e.entity), a = st?.attributes || {};
    const vt = el.querySelector('.vt');
    let v = null, unit = '°';
    if (d === 'sensor') { v = num(st); if (a.device_class === 'humidity') unit = '%'; }
    else if (d === 'humidifier') { v = a.current_humidity ?? a.humidity ?? null; unit = '%'; }
    else v = a.current_temperature ?? a.temperature ?? null;
    v = v == null ? null : +v;
    const html = v == null ? '–' : unit === '%' ? `${Math.round(v)}<small>%</small>` : tempHtml(v);
    if (vt.innerHTML !== html) vt.innerHTML = html;
    el.classList.toggle('na', unavailable(st));
    if (d === 'sensor') {
      el.style.setProperty('--c', (unit === '%' ? [120, 190, 255] : tempRgb(v)).join(','));
      return;
    }
    const act = this._climAction(st), on = ['heating', 'preheating', 'cooling', 'drying', 'defrosting'].includes(act);
    const c = act === 'cooling' ? COOL_RGB : act === 'drying' ? [110, 200, 255] : HEAT_RGB;
    el.classList.toggle('on', on);
    el.classList.toggle('dk', false);
    el.classList.toggle('off', st?.state === 'off');
    el.style.setProperty('--c', c.join(','));
    el.style.setProperty('--cl', lighten(c, 0.45).join(','));
    const badge = el.querySelector('.act');
    if (badge) { const ic = act === 'cooling' ? 'snowflake' : act === 'drying' ? 'drop' : 'flame'; if (badge.dataset.ic !== ic) { badge.dataset.ic = ic; badge.innerHTML = icon(ic); } }
  },

  _climTint() {
    const c = this._climateOf(this._M.indoor.length ? this._M.indoor : this._M.ents.filter((e) => e.kind === 'climate').map((e) => e.entity));
    if (c.t == null) return ['40, 50, 60', '26, 30, 38'];
    const rgb = tempRgb(c.t), mix = (k) => rgb.map((v) => Math.round(v * k + 26 * (1 - k))).join(', ');
    return [mix(0.32), mix(0.16)];
  },

  /* ---------------------------------------------------------------- Layer card: average inside, rooms as a heat strip */
  _climateGap(L, upd) {
    const ents = this._ents(L, 'climate'), therms = ents.filter((e) => domainOf(e.entity) === 'climate');
    const rooms = this._M.rooms.filter((r) => ents.some((e) => e.room === r.id));
    const v = mk('div', 'gv sub', `<div class="gk"><span>${esc(this._layerName(L))}</span></div>
      <div class="gt"><b></b><span class="w"></span></div><div class="gs"></div>
      <div class="segs">${rooms.map((r) => `<i data-r="${esc(r.id)}"></i>`).join('')}</div>
      <div class="gbtns"><button class="gbtn glass modes" aria-haspopup="menu">${icon('sparkle')}<span>${esc(t('modes'))}</span>${icon('chevU', 'sm')}</button>${therms.length ? `<button class="gbtn white off">${icon('power')}<span>${esc(t('allOff'))}</span></button>` : ''}</div>`);
    const modes = v.querySelector('.modes');
    modes.addEventListener('click', () => (this._menuAnchor === modes && this._menu.classList.contains('open') ? this._closeMenu() : this._openModes(modes)));
    const off = v.querySelector('.off');
    off?.addEventListener('click', () => {
      const on = therms.filter((e) => this._hass.states[e.entity]?.state && !['off', 'unavailable'].includes(this._hass.states[e.entity].state)).map((e) => e.entity);
      if (on.length) this._call('climate', 'turn_off', { entity_id: on }).then(() => this._toast(t('thermostatsOff', on.length))).catch(() => {});
    });
    upd.push(() => {
      const c = this._climateOf(ents.map((e) => e.entity));
      v.querySelector('.gt b').textContent = c.t != null ? `${c.n > 1 ? 'Ø ' : ''}${fmt(c.t, 1)}°` : '–';
      v.querySelector('.gt .w').textContent = c.h != null ? `${Math.round(c.h)} %` : '';
      const sts = therms.map((e) => this._hass.states[e.entity]);
      const heating = sts.filter((s) => ['heating', 'preheating'].includes(this._climAction(s))).length;
      const cooling = sts.filter((s) => this._climAction(s) === 'cooling').length;
      const offN = sts.filter((s) => s?.state === 'off').length;
      const parts = [];
      if (heating) parts.push(t('nHeating', heating));
      if (cooling) parts.push(t('nCooling', cooling));
      if (therms.length && !heating && !cooling) parts.push(offN === therms.length ? t('allThermostatsOff') : t('allAtTemp'));
      if (!therms.length) parts.push(t('nRoomsMeasured', rooms.length));
      v.querySelector('.gs').textContent = parts.join(' · ');
      for (const r of rooms) {
        const seg = v.querySelector(`.segs i[data-r="${CSS.escape(r.id)}"]`), rc = this._roomClimate(r.id);
        seg.classList.toggle('on', rc.t != null);
        seg.style.setProperty('--c', tempRgb(rc.t).join(','));
      }
      if (off) off.disabled = !sts.some((s) => s && !['off', 'unavailable', 'unknown'].includes(s.state));
    });
    return v;
  },

  /* ---------------------------------------------------------------- Room pop-up: thermostats + sensors */
  _climateSection(ents, upd) {
    const w = mk('div', 'psec');
    w.append(this._secHead(t('layer_climate'), true));
    const therms = ents.filter((e) => domainOf(e.entity) === 'climate'), rest = ents.filter((e) => domainOf(e.entity) !== 'climate');
    therms.forEach((e) => w.append(this._thermostat(e, upd)));
    if (rest.length) {
      if (therms.length) w.append(this._secHead(t('sensors')));
      const rows = mk('div', 'srows');
      rest.forEach((e) => rows.append(this._deviceRow(e.entity, upd, e)));
      w.append(rows);
    }
    return w;
  },

  _thermostat(e, upd) {
    const eid = e.entity, w = mk('div', 'therm');
    w.dataset.focus = eid;
    const R = 84, C = 105, A0 = 135, SW = 270;
    const pt = (deg) => [C + R * Math.cos((deg * Math.PI) / 180), C + R * Math.sin((deg * Math.PI) / 180)];
    const arc = (d0, d1) => { const [x0, y0] = pt(d0), [x1, y1] = pt(Math.max(d0 + 0.01, d1)); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${d1 - d0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
    w.innerHTML = `<div class="tn2">${esc(this._name(e))}<span></span></div>
      <div class="dialw"><button class="cbtn lg dn" aria-label="${esc(t('colder'))}">${icon('minus')}</button>
        <div class="dial" role="slider" tabindex="0" aria-label="${esc(t('targetTemp'))}"><svg viewBox="0 0 210 196"><path class="trk" d="${arc(A0, A0 + SW)}"/><path class="arc" d=""/><circle class="cur" r="3.2" cx="0" cy="0"/><circle class="kn2" r="11" cx="0" cy="0"/></svg>
          <div class="mid"><small></small><b></b><span></span></div></div>
        <button class="cbtn lg upb" aria-label="${esc(t('warmer'))}">${icon('plus')}</button></div>
      <div class="hvac"><i class="knob"></i></div>`;
    this._hold(w.querySelector('.tn2'), eid);
    const dial = w.querySelector('.dial'), arcEl = w.querySelector('.arc'), kn = w.querySelector('.kn2'), cur = w.querySelector('.cur');
    const st = () => this._hass.states[eid];
    const rng = () => { const a = st()?.attributes || {}; const step = +a.target_temp_step || (a.temperature_unit === '°F' ? 1 : 0.5); return { min: Number.isFinite(+a.min_temp) ? +a.min_temp : 7, max: Number.isFinite(+a.max_temp) ? +a.max_temp : 30, step }; };
    let val = null, drag = false, pending = 0, localAt = 0;
    const toAng = (v) => { const { min, max } = rng(); return A0 + clamp((v - min) / (max - min || 1), 0, 1) * SW; };
    const draw = (v) => {
      const s = st(), a = s?.attributes || {}, single = a.temperature != null;
      const on = s && !['off', 'unavailable', 'unknown'].includes(s.state);
      dial.classList.toggle('off', !on || !single);
      const ang = v != null ? toAng(v) : A0;
      arcEl.setAttribute('d', arc(A0, ang));
      const [kx, ky] = pt(ang);
      kn.setAttribute('cx', kx.toFixed(2)); kn.setAttribute('cy', ky.toFixed(2));
      kn.style.display = single ? '' : 'none';
      const c = +a.current_temperature;
      if (Number.isFinite(c)) { const [cx, cy] = pt(toAng(c)); cur.setAttribute('cx', cx.toFixed(2)); cur.setAttribute('cy', cy.toFixed(2)); cur.style.display = ''; } else cur.style.display = 'none';
      const mid = dial.querySelector('.mid');
      const act = this._climAction(s);
      mid.querySelector('small').textContent = !on ? t('off') : act === 'cooling' || s.state === 'cool' ? t('coolTo') : act === 'heating' ? t('heatingTo') : tf(`hvac_${s.state}`, t('target'));
      mid.querySelector('b').innerHTML = single && v != null ? `${esc(fmt(v, rng().step < 1 ? 1 : 0))}<sup>°</sup>` : a.target_temp_low != null ? `${fmt(+a.target_temp_low, 0)}–${fmt(+a.target_temp_high, 0)}<sup>°</sup>` : '–';
      mid.querySelector('span').textContent = [Number.isFinite(c) ? t('currently', fmt(c, 1)) : '', a.current_humidity != null ? `${Math.round(a.current_humidity)} %` : ''].filter(Boolean).join(' · ');
      dial.setAttribute('aria-valuenow', v ?? '');
    };
    const commit = (v) => {
      localAt = Date.now();
      clearTimeout(pending);
      pending = setTimeout(() => this._call('climate', 'set_temperature', { entity_id: eid, temperature: v }).catch(() => { localAt = 0; upd.forEach((f) => f()); }), 450);
    };
    const nudge = (dir) => {
      const s = st(), a = s?.attributes || {}, { min, max, step } = rng();
      if (a.temperature == null && a.target_temp_low != null) {
        this._call('climate', 'set_temperature', { entity_id: eid, target_temp_low: clamp(+a.target_temp_low + dir * step, min, max), target_temp_high: clamp(+a.target_temp_high + dir * step, min, max) }).catch(() => {});
        return;
      }
      val = clamp(Math.round(((val ?? +a.temperature ?? min) + dir * step) / step) * step, min, max);
      draw(val);
      commit(val);
    };
    w.querySelector('.dn').addEventListener('click', () => nudge(-1));
    w.querySelector('.upb').addEventListener('click', () => nudge(1));
    const fromPointer = (ev) => {
      const r = dial.getBoundingClientRect(), sx = r.width / 210, sy = r.height / 196;
      let deg = (Math.atan2((ev.clientY - r.top) / sy - C, (ev.clientX - r.left) / sx - C) * 180) / Math.PI;
      if (deg < 0) deg += 360;
      let rel = deg - A0;
      if (rel < 0) rel += 360;
      if (rel > SW) rel = rel - SW < (360 - SW) / 2 ? SW : 0;
      const { min, max, step } = rng();
      return clamp(Math.round((min + (rel / SW) * (max - min)) / step) * step, min, max);
    };
    dial.addEventListener('pointerdown', (ev) => {
      if (ev.button > 0 || st()?.attributes?.temperature == null || st()?.state === 'off') return;
      drag = true; localAt = Date.now(); dial.setPointerCapture(ev.pointerId); dial.classList.add('drag');
      val = fromPointer(ev); draw(val);
    });
    dial.addEventListener('pointermove', (ev) => { if (!drag) return; const nv = fromPointer(ev); if (nv !== val) { val = nv; draw(val); try { navigator.vibrate?.(4); } catch (e2) { /* never mind */ } } });
    const up = () => { if (!drag) return; drag = false; dial.classList.remove('drag'); commit(val); };
    dial.addEventListener('pointerup', up);
    dial.addEventListener('pointercancel', up);
    dial.addEventListener('keydown', (ev) => { const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[ev.key]; if (d) { ev.preventDefault(); nudge(d); } });
    // HVAC modes as a segmented control
    const hv = w.querySelector('.hvac');
    let modesKey = '';
    upd.push(() => {
      const s = st(), a = s?.attributes || {};
      w.querySelector('.tn2 span').textContent = unavailable(s) ? t('offline') : tf(`act_${this._climAction(s)}`, '');
      if (!drag && Date.now() - localAt > 2500) val = a.temperature != null ? +a.temperature : null;
      if (!drag) draw(val);
      const modes = HVAC_ORDER.filter((m) => (a.hvac_modes || []).includes(m)).slice(0, 4);
      const key = modes.join();
      if (key !== modesKey) {
        modesKey = key;
        hv.innerHTML = `<i class="knob"></i>${modes.map((m) => `<button data-m="${m}">${icon(HVAC_ICON[m] || 'thermo')}<span>${esc(tf(`hvac_${m}`, m))}</span></button>`).join('')}`;
        hv.style.setProperty('--n', Math.max(1, modes.length));
        hv.hidden = modes.length < 2;
        hv.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
          this._call('climate', 'set_hvac_mode', { entity_id: eid, hvac_mode: b.dataset.m }).catch(() => {});
          const i = modes.indexOf(b.dataset.m);
          hv.style.setProperty('--i', i);
          hv.querySelectorAll('button').forEach((x, j) => x.classList.toggle('act', j === i));
        }));
      }
      const i = modes.indexOf(s?.state);
      hv.classList.toggle('none', i < 0);
      hv.style.setProperty('--i', Math.max(0, i));
      hv.querySelectorAll('button').forEach((x, j) => x.classList.toggle('act', j === i));
      w.querySelectorAll('.dialw .cbtn').forEach((b) => { b.disabled = unavailable(s) || s.state === 'off'; });
    });
    return w;
  },
});
