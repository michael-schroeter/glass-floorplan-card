/* ================================================================== Covers layer: shutters, blinds, curtains */
const COVER_RGB = [206, 226, 255];

Object.assign(GlassFloorplanCard.prototype, {

  /* open position 0 … 100 */
  _coverPos(st) {
    const a = st?.attributes || {};
    if (Number.isFinite(+a.current_position) && a.current_position !== null) return clamp(+a.current_position, 0, 100);
    if (!st || unavailable(st)) return 0;
    return { open: 100, closed: 0, opening: 50, closing: 50 }[st.state] ?? 0;
  },
  _coverMoving(st) { return st?.state === 'opening' || st?.state === 'closing'; },
  _coverText(st) {
    if (unavailable(st)) return t('offline');
    if (st.state === 'opening') return t('opening2');
    if (st.state === 'closing') return t('closing');
    const p = this._coverPos(st);
    return p >= 99 ? t('coverOpen') : p <= 1 ? t('coverClosed') : t('pctOpen', Math.round(p));
  },

  _updCoverMarker(e, el) {
    const st = this._hass.states[e.entity], p = this._coverPos(st);
    el.classList.toggle('on', p > 1);
    el.classList.toggle('na', unavailable(st));
    el.classList.toggle('mv', this._coverMoving(st));
    el.style.setProperty('--c', COVER_RGB.join(','));
    el.style.setProperty('--cl', lighten(COVER_RGB, 0.6).join(','));
    const c = el.querySelector('.ring circle');
    const part = p > 1 && p < 99;
    c.setAttribute('stroke-dasharray', part ? `${Math.round(p)} 100` : '0 100');
    c.style.opacity = part ? '1' : '0';
    if (!e.icon) {
      const ic = p > 1 ? 'blindsOpen' : 'blinds';
      if (el.dataset.ic !== ic) { el.dataset.ic = ic; el.querySelector('.ic')?.remove(); el.insertAdjacentHTML('beforeend', icon(ic)); }
    }
    this._updCoverWindows(e);
  },

  /* a closed shutter dims the window and the daylight behind it */
  _updCoverWindows(e) {
    const p = this._coverPos(this._hass.states[e.entity]) / 100;
    for (const el of this.shadowRoot.querySelectorAll(`[data-cover="${CSS.escape(e.entity)}"]`)) el.style.setProperty('--op', p.toFixed(2));
  },

  _coverToggle(eid) {
    const st = this._hass.states[eid];
    if (unavailable(st)) { this._toast(t('notReachable', this._nameOf(eid))); return; }
    const f = st.attributes.supported_features || 0;
    if (this._coverMoving(st) && f & 8) { this._call('cover', 'stop_cover', { entity_id: eid }).catch(() => {}); return; }
    this._call('cover', this._coverPos(st) > 1 ? 'close_cover' : 'open_cover', { entity_id: eid }).catch(() => {});
  },
  _coverAll(ids, open) {
    if (!ids.length) return;
    this._call('cover', open ? 'open_cover' : 'close_cover', { entity_id: ids })
      .then(() => this._toast(t(open ? 'coversOpening' : 'coversClosing', ids.length))).catch(() => {});
  },

  _roomCoverLabel(k, L) {
    const cs = this._roomEnts(k, L, 'cover').map((e) => this._hass.states[e.entity]);
    if (!cs.length) return '';
    if (cs.some((s) => this._coverMoving(s))) return t(cs.some((s) => s.state === 'opening') ? 'opening2' : 'closing');
    const ps = cs.map((s) => this._coverPos(s)), open = ps.filter((p) => p > 1).length;
    if (cs.length === 1) return this._coverText(cs[0]);
    return open === 0 ? t('allClosed') : open === cs.length && ps.every((p) => p >= 99) ? t('allOpen') : t('nOfOpen', open, cs.length);
  },

  /* ---------------------------------------------------------------- Layer card */
  _coverGap(L, upd) {
    const covers = this._ents(L, 'cover');
    const ids = covers.map((e) => e.entity);
    const v = mk('div', 'gv sub', `<div class="gk"><span>${esc(this._layerName(L))}</span></div>
      <div class="gt"><b></b><span class="w"></span></div><div class="gs"></div>
      <div class="segs">${covers.map((e) => `<i class="part" data-e="${esc(e.entity)}"></i>`).join('')}</div>
      <div class="gbtns"><button class="gbtn glass up">${icon('up')}<span>${esc(t('open'))}</span></button><button class="gbtn white dn">${icon('down')}<span>${esc(t('close'))}</span></button></div>`);
    v.querySelector('.up').addEventListener('click', () => this._coverAll(ids.filter((id) => this._coverPos(this._hass.states[id]) < 99), true));
    v.querySelector('.dn').addEventListener('click', () => this._coverAll(ids.filter((id) => this._coverPos(this._hass.states[id]) > 1), false));
    upd.push(() => {
      const sts = ids.map((id) => this._hass.states[id]), ps = sts.map((s) => this._coverPos(s));
      const open = ps.filter((p) => p > 1).length, moving = sts.filter((s) => this._coverMoving(s)).length;
      v.querySelector('.gt b').textContent = !covers.length ? t('noCovers') : open === 0 ? t('allClosed') : open === covers.length && ps.every((p) => p >= 99) ? t('allOpen') : t('nOfOpen', open, covers.length);
      v.querySelector('.gt .w').textContent = covers.length ? `Ø ${Math.round(avg(ps))} %` : '';
      v.querySelector('.gs').textContent = moving ? t('nMoving', moving) : this._sunText();
      covers.forEach((e, i) => {
        const seg = v.querySelector(`.segs i[data-e="${CSS.escape(e.entity)}"]`);
        seg.style.setProperty('--p', `${ps[i]}%`);
        seg.style.setProperty('--c', COVER_RGB.join(','));
      });
      v.querySelector('.up').disabled = !ps.some((p) => p < 99);
      v.querySelector('.dn').disabled = !ps.some((p) => p > 1);
    });
    return v;
  },

  /* "Sunset 18:42" / "Sunrise 07:11" as context for the covers */
  _sunText() {
    const s = this._hass.states['sun.sun']?.attributes;
    if (!s) return '';
    const up = this._hass.states['sun.sun'].state === 'above_horizon';
    const iso = up ? s.next_setting : s.next_rising;
    return iso ? `${t(up ? 'sunset' : 'sunrise')} ${new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}` : '';
  },

  /* ---------------------------------------------------------------- Room pop-up: covers as tiles (drag = position, tap = open / close) */
  _coverSection(ents, upd) {
    const w = mk('div', 'psec');
    w.append(this._secHead(t('layer_cover'), true));
    const tiles = mk('div', 'tiles');
    ents.forEach((e) => tiles.append(this._coverTile(e, upd)));
    w.append(tiles);
    return w;
  },

  _coverTile(e, upd) {
    const eid = e.entity;
    const el = mk('div', 'tile cov', `<div class="tb" role="slider" tabindex="0" aria-label="${esc(this._name(e))}"><i class="fill"></i>${this._iconHtml(e.icon || 'blindsOpen')}</div><div class="tn">${esc(this._name(e))}</div><div class="tv"></div>`);
    el.dataset.focus = eid;
    const tb = el.querySelector('.tb'), tv = el.querySelector('.tv');
    const st = () => this._hass.states[eid];
    const canPos = () => !!((st()?.attributes?.supported_features || 0) & 4);
    let down = false, moved = false, held = false, holdT = 0, sy = 0, start = 0, v = 0;
    const show = (p) => { tb.style.setProperty('--v', `${p}%`); tb.classList.toggle('lo', p < 30); };
    const hold = () => { held = true; down = false; tb.classList.remove('pressed', 'drag'); this._openDevice(eid, tb); };
    tb.addEventListener('contextmenu', (ev) => { ev.preventDefault(); if (!held) { clearTimeout(holdT); hold(); } });
    tb.addEventListener('pointerdown', (ev) => {
      if (ev.button > 0) return;
      down = true; moved = false; held = false; sy = ev.clientY;
      clearTimeout(holdT);
      holdT = setTimeout(() => { if (down && !moved) hold(); }, 520);
      start = this._coverPos(st()); v = start;
      tb.setPointerCapture(ev.pointerId);
      tb.classList.add('pressed');
    });
    tb.addEventListener('pointermove', (ev) => {
      if (!down) return;
      const dy = ev.clientY - sy;
      if (!moved && Math.abs(dy) > 5 && canPos()) { moved = true; clearTimeout(holdT); tb.classList.remove('pressed'); tb.classList.add('drag'); }
      if (!moved) return;
      // dragging down lowers the shutter
      v = clamp(Math.round(start - (dy / tb.clientHeight) * 100), 0, 100);
      show(v);
      tv.textContent = v >= 99 ? t('coverOpen') : v <= 1 ? t('coverClosed') : `${v} %`;
    });
    const end = (go) => {
      clearTimeout(holdT);
      if (!down || held) return;
      down = false;
      tb.classList.remove('pressed', 'drag');
      if (!go) return;
      if (moved) this._call('cover', 'set_cover_position', { entity_id: eid, position: v }).catch(() => {});
      else this._coverToggle(eid);
    };
    tb.addEventListener('pointerup', () => end(true));
    tb.addEventListener('pointercancel', () => end(false));
    tb.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this._coverToggle(eid); return; }
      const d = { ArrowUp: 10, ArrowRight: 10, ArrowDown: -10, ArrowLeft: -10 }[ev.key];
      if (d && canPos()) { ev.preventDefault(); this._call('cover', 'set_cover_position', { entity_id: eid, position: clamp(this._coverPos(st()) + d, 0, 100) }).catch(() => {}); }
    });
    upd.push(() => {
      if (down && moved) return;
      const s = st(), p = this._coverPos(s);
      show(p);
      tv.textContent = this._coverText(s);
      el.classList.toggle('na', unavailable(s));
    });
    return el;
  },
});
