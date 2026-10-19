/* ================================================================== Pop-ups, controls, menu */
Object.assign(GlassFloorplanCard.prototype, {

  /* ---------------------------------------------------------------- Open / close
   * The pop-up grows out of the tapped element (the glass shell morphs position, size and radius, the content
   * zooms along and sharpens), the background blurs, turns matte and slightly darker. Closing runs backwards. */
  _openRoom(k, opts = {}) {
    const L = this._layer(), r = this._M.byRoom[k];
    if (!r || L.type === 'vacuum' || !this._roomHas(k, L)) return;
    let info = {};
    this._showPop((upd) => { const v = this._roomView(k, L, upd); info = v._info || {}; return v; }, { from: opts.from, cls: () => info.cls || '', label: r.name, kind: `room:${k}` });
    if (opts.focus) {
      const el = this._pop.querySelector(`[data-focus="${CSS.escape(opts.focus)}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  },

  _openDoor(from) {
    this._showPop((upd) => this._doorView(upd), { from, cls: 'narrow', label: this._M.door?.name || t('frontDoor'), kind: 'door' });
  },

  _openWeather(from) {
    this._showPop((upd) => this._weatherView(upd), { from, cls: 'wide wxp', label: t('weather'), kind: 'weather' });
  },

  /* visible part of the card in the window (below the Home Assistant header) */
  _placeOverlay() {
    const r = this.getBoundingClientRect();
    if (this._hdr == null) this._hdr = Math.max(0, Math.round(r.top + (window.scrollY || 0)));
    const left = Math.max(0, r.left), right = Math.min(window.innerWidth, r.right);
    const top = Math.max(r.top, Math.min(this._hdr, 120)), bottom = Math.min(window.innerHeight, r.bottom);
    const O = { left, top: Math.max(0, top), width: Math.max(0, right - left), height: Math.max(0, bottom - Math.max(0, top)) };
    Object.assign(this._popWrap.style, { left: `${O.left}px`, top: `${O.top}px`, width: `${O.width}px`, height: `${O.height}px` });
    this._O = O;
    return O;
  },

  /* target rectangle: centred in the visible area (phones: a sheet at the bottom) */
  _popTarget(O) {
    const pop = this._pop;
    if (this._m) {
      const m = 8, bottom = m + (this._safeB || 0);
      pop.style.width = `${O.width - 2 * m}px`;
      pop.style.maxHeight = `${Math.max(260, O.height - bottom - 34)}px`;
      const w = pop.offsetWidth, h = pop.offsetHeight;
      return { l: m, t: O.height - bottom - h, w, h };
    }
    pop.style.maxHeight = `${Math.max(240, O.height - 36)}px`;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    return { l: Math.round((O.width - w) / 2), t: Math.round((O.height - h) / 2), w, h };
  },

  _srcRect(from, O, T) {
    const fr = from?.isConnected ? from.getBoundingClientRect() : null;
    if (!fr || !fr.width) return { l: T.l + T.w * 0.04, t: T.t + T.h * 0.04 + 24, w: T.w * 0.92, h: T.h * 0.92, r: 30 };
    const cs = getComputedStyle(from).borderTopLeftRadius;
    const r = cs.endsWith('%') ? Math.min(fr.width, fr.height) / 2 : parseFloat(cs) || 14;
    return { l: fr.left - O.left, t: fr.top - O.top, w: fr.width, h: fr.height, r };
  },

  _setShell(R, radius) {
    Object.assign(this._shell.style, { left: `${R.l}px`, top: `${R.t}px`, width: `${R.w}px`, height: `${R.h}px`, borderRadius: `${radius}px` });
  },

  _showPop(build, { from, cls = '', label = '', kind = '' } = {}) {
    this._closeMenu();
    this._hideTip();
    const pop = this._pop, wrap = this._popWrap, shell = this._shell, scrim = this._scrim;
    for (const el of [pop, shell, scrim]) el.getAnimations().forEach((an) => an.cancel());
    clearTimeout(this._popDoneT);
    this._upd = [];
    pop.innerHTML = '';
    pop.setAttribute('aria-label', label);
    this._popKind = kind;
    const content = build(this._upd);
    pop.className = `pop ${typeof cls === 'function' ? cls() : cls}`.trim();
    if (this._m) {
      content.prepend(mk('i', 'grab'));
      // tiles: 4 as 2 × 2, otherwise up to 3 side by side
      content.querySelectorAll('.tiles').forEach((tl) => { const n = tl.querySelectorAll('.tile').length; tl.style.setProperty('--cols', n === 4 ? 2 : Math.min(3, Math.max(1, n))); });
    }
    pop.append(content);
    this._upd.forEach((f) => f());
    const O = this._placeOverlay();
    wrap.classList.add('open', 'vis');
    const T = this._popTarget(O);
    Object.assign(pop.style, { left: `${T.l}px`, top: `${T.t}px` });
    pop.scrollTop = 0;
    this._setShell(T, 32);
    this._popFrom = from || null;
    this._popT = T;
    this._popOpen = true;
    this._watchPop();
    pop.focus({ preventScroll: true });
    if (this._reduced) return;
    this._animOpen(this._srcRect(from, O, T), T);
    for (const el of [pop, shell, scrim]) el.getAnimations().forEach((an) => an.finished.then(() => { if (this._popOpen) an.cancel(); }).catch(() => {}));
  },

  _closePop() {
    const pop = this._pop, wrap = this._popWrap, shell = this._shell, scrim = this._scrim;
    if (!this._popOpen) return;
    this._popOpen = false;
    this._popRO?.disconnect();
    this._closeMenu();
    wrap.classList.remove('open');
    const done = () => {
      if (this._popOpen) return;
      for (const el of [pop, shell, scrim]) {
        el.getAnimations().forEach((an) => an.cancel());
        for (const p of ['transform', 'opacity', 'filter', 'backdropFilter', 'webkitBackdropFilter', 'backgroundColor']) el.style[p] = '';
      }
      wrap.classList.remove('vis');
      pop.innerHTML = '';
      this._upd = [];
      this._popKind = '';
    };
    if (this._reduced) { done(); return; }
    const O = this._O || this._placeOverlay();
    const T = { l: pop.offsetLeft, t: pop.offsetTop, w: pop.offsetWidth, h: pop.offsetHeight };
    const S = this._srcRect(this._popFrom, O, T);
    // hold running animations where they are, then run back from there
    for (const el of [pop, shell, scrim]) el.getAnimations().forEach((an) => { try { an.commitStyles(); } catch (e) { /* never mind */ } an.cancel(); });
    this._popDoneT = setTimeout(done, this._animClose(S, T) + 40);
  },

  /* Open: the shell morphs position, size and radius from the element to its final size, the content zooms along
   * and sharpens, the background blurs. Phones use a transform-only variant (no layout per frame). */
  _animOpen(S, T) {
    const pop = this._pop, shell = this._shell, scrim = this._scrim;
    const D = SPRINGS.morph.ms, E = ease('morph', 'cubic-bezier(.3,1.15,.4,1)');
    if (this._m) {
      const s0 = clamp(S.w / T.w, 0.22, 0.9);
      const dx = S.l + S.w / 2 - (T.l + T.w / 2), dy = S.t + S.h / 2 - (T.t + T.h / 2);
      const from = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s0.toFixed(3)})`;
      scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2, .7, .2, 1)', fill: 'both' });
      shell.animate([{ transform: from, opacity: 0 }, { opacity: 1, offset: 0.14 }, { transform: 'none', opacity: 1 }], { duration: D, easing: E, fill: 'both' });
      pop.animate([{ transform: from, opacity: 0 }, { opacity: 0, offset: 0.12 }, { transform: 'none', opacity: 1 }], { duration: D, easing: E, fill: 'both' });
      [...(pop.querySelector('.pv')?.children || [])].forEach((c, i) => c.animate(
        [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
        { duration: 460, delay: 60 + i * 36, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' }));
    } else {
      scrim.animate([
        { backdropFilter: 'blur(0px) saturate(100%) brightness(1)', backgroundColor: 'rgba(10, 11, 15, 0)' },
        { backdropFilter: 'blur(22px) saturate(140%) brightness(.78)', backgroundColor: 'rgba(10, 11, 15, .18)' },
      ], { duration: 520, easing: 'cubic-bezier(.2, .7, .2, 1)', fill: 'both' });
      shell.animate([
        { left: `${S.l}px`, top: `${S.t}px`, width: `${S.w}px`, height: `${S.h}px`, borderRadius: `${S.r}px`, opacity: 0.35 },
        { opacity: 1, offset: 0.12 },
        { left: `${T.l}px`, top: `${T.t}px`, width: `${T.w}px`, height: `${T.h}px`, borderRadius: '32px', opacity: 1 },
      ], { duration: D, easing: E, fill: 'both' });
      const s0 = clamp(Math.min(S.w / T.w, S.h / T.h), 0.12, 0.95);
      const dx = S.l + S.w / 2 - (T.l + T.w / 2), dy = S.t + S.h / 2 - (T.t + T.h / 2);
      pop.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(${s0})`, opacity: 0, filter: 'blur(12px)' },
        { opacity: 0, filter: 'blur(10px)', offset: 0.16 },
        { transform: 'none', opacity: 1, filter: 'blur(0px)' },
      ], { duration: D, easing: E, fill: 'both' });
      [...(pop.querySelector('.pv')?.children || [])].forEach((c, i) => c.animate(
        [{ opacity: 0, transform: 'translateY(10px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }],
        { duration: 520, delay: 70 + i * 42, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' }));
    }
    pop.querySelector('.x')?.animate([{ transform: 'scale(.4) rotate(-90deg)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: SPRINGS.pop.ms, delay: 120, easing: ease('pop', 'ease-out'), fill: 'backwards' });
  },

  /* Close: everything runs back into the element; returns the duration in ms */
  _animClose(S, T) {
    const pop = this._pop, shell = this._shell, scrim = this._scrim;
    const D = SPRINGS.close.ms, E = ease('close', 'cubic-bezier(.4, 0, .2, 1)');
    const dx = S.l + S.w / 2 - (T.l + T.w / 2), dy = S.t + S.h / 2 - (T.t + T.h / 2);
    if (this._m) {
      const s0 = clamp(S.w / T.w, 0.22, 0.9);
      const to = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s0.toFixed(3)})`;
      pop.animate([{ opacity: 0, offset: 0.35 }, { transform: to, opacity: 0 }], { duration: D, easing: E, fill: 'forwards' });
      shell.animate([{ opacity: 1, offset: 0.6 }, { transform: to, opacity: 0 }], { duration: D, easing: E, fill: 'forwards' });
      scrim.animate([{ opacity: 0 }], { duration: D, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
      return D;
    }
    const s0 = clamp(Math.min(S.w / T.w, S.h / T.h), 0.12, 0.95);
    pop.animate([
      { opacity: 0, filter: 'blur(8px)', offset: 0.4 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s0})`, opacity: 0, filter: 'blur(12px)' },
    ], { duration: D, easing: E, fill: 'forwards' });
    shell.animate([
      { opacity: 1, offset: 0.7 },
      { left: `${S.l}px`, top: `${S.t}px`, width: `${S.w}px`, height: `${S.h}px`, borderRadius: `${S.r}px`, opacity: 0 },
    ], { duration: D, easing: E, fill: 'forwards' });
    scrim.animate([{ backdropFilter: 'blur(0px) saturate(100%) brightness(1)', backgroundColor: 'rgba(10, 11, 15, 0)' }],
      { duration: D * 1.1, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' });
    return D * 1.1;
  },

  /* the shell follows the content when its size changes (e.g. the volume slider appears) */
  _watchPop() {
    this._popRO?.disconnect();
    let first = true;
    this._popRO = new ResizeObserver(() => {
      if (first) { first = false; return; }
      this._syncPop(true);
    });
    this._popRO.observe(this._pop);
  },

  _syncPop(animate) {
    if (!this._popOpen) return;
    const O = this._placeOverlay();
    const pop = this._pop, shell = this._shell;
    if (shell.getAnimations().some((an) => an.playState === 'running')) return;
    const T = this._popTarget(O);
    const from = { l: pop.offsetLeft, t: pop.offsetTop };
    Object.assign(pop.style, { left: `${T.l}px`, top: `${T.t}px` });
    const prev = { l: parseFloat(shell.style.left), t: parseFloat(shell.style.top), w: parseFloat(shell.style.width), h: parseFloat(shell.style.height) };
    this._setShell(T, 32);
    if (!animate || this._reduced) return;
    const E = ease('snap', 'ease-out');
    shell.animate([{ left: `${prev.l}px`, top: `${prev.t}px`, width: `${prev.w}px`, height: `${prev.h}px` }, { left: `${T.l}px`, top: `${T.t}px`, width: `${T.w}px`, height: `${T.h}px` }], { duration: SPRINGS.snap.ms, easing: E });
    pop.animate([{ transform: `translate(${from.l - T.l}px, ${from.t - T.t}px)` }, { transform: 'none' }], { duration: SPRINGS.snap.ms, easing: E });
  },

  _head(title, sub) {
    const head = mk('div', 'ph', `<div><h2>${esc(title)}</h2><p>${esc(sub || '')}</p></div><button class="x" aria-label="${esc(t('close'))}">${icon('close')}</button>`);
    head.querySelector('.x').addEventListener('click', () => this._closePop());
    return head;
  },

  /* ---------------------------------------------------------------- Weather */
  _weatherView(upd) {
    const v = mk('div', 'pv');
    const head = this._head(t('weather'));
    const grid = mk('div', 'wgrid', `<div class="wnow"><div class="wbig"><span class="wi"></span><b></b></div><div class="whl"></div><div class="wstats"></div>
        <div class="whrs"><div class="sec"><span>${esc(t('hourly'))}</span></div><div class="hrs"></div></div></div>
      <div class="wdays"><div class="sec first"><span>${esc(t('days8'))}</span></div><div class="days"></div></div>`);
    const hrs = grid.querySelector('.hrs');
    hrs.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { hrs.scrollBy({ left: e.deltaY, behavior: 'auto' }); e.preventDefault(); } }, { passive: false });
    v.append(head, grid);
    const dir = (b) => (b == null ? '' : t('compass')[Math.round(b / 45) % 8]);
    const tm = (iso) => (iso ? new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' }) : '–');
    upd.push(() => {
      const w = this._hass.states[this._M.weather];
      if (!w) return;
      const a = w.attributes, label = tf(`wx_${w.state}`, w.state);
      head.querySelector('p').textContent = [label, a.apparent_temperature != null ? t('feelsLike', Math.round(a.apparent_temperature)) : ''].filter(Boolean).join(' · ');
      const ic = this._wxIcon(w.state), wi = grid.querySelector('.wbig .wi');
      if (wi.dataset.ic !== ic) { wi.dataset.ic = ic; wi.innerHTML = icon(ic); }
      grid.querySelector('.wbig b').textContent = a.temperature != null ? `${Math.round(a.temperature)}°` : '–';
      const days = (this._fc.daily || []).slice(0, 8);
      const d0 = days[0];
      grid.querySelector('.whl').textContent = d0 ? t('lowHigh', Math.round(d0.templow ?? d0.temperature), Math.round(d0.temperature)) : '';
      const sun = this._hass.states['sun.sun']?.attributes || {};
      const ws = a.wind_speed != null ? `${Math.round(a.wind_speed)} ${a.wind_speed_unit || 'km/h'} ${dir(a.wind_bearing)}` : '–';
      const stats = [
        ['humid', t('humidity'), a.humidity != null ? `${Math.round(a.humidity)} %` : '–'],
        ['wind', t('wind'), ws],
        ['sunrise', t('sunrise'), tm(sun.next_rising)],
        ['sunset', t('sunset'), tm(sun.next_setting)],
      ];
      grid.querySelector('.wstats').innerHTML = stats.map(([i, k, val]) => `<div>${icon(i)}<span>${esc(k)}</span><b>${esc(val)}</b></div>`).join('');
      // 8 days with temperature range (like Apple Weather)
      const dkey = days.map((d) => `${d.datetime}${d.temperature}${d.templow}${d.condition}${d.precipitation_probability}`).join('|') + Math.round(a.temperature ?? 0);
      const dEl = grid.querySelector('.days');
      if (dEl.dataset.k !== dkey) {
        dEl.dataset.k = dkey;
        const lo = Math.min(...days.map((d) => d.templow ?? d.temperature)), hi = Math.max(...days.map((d) => d.temperature)), span = hi - lo || 1;
        dEl.innerHTML = days.map((d, i) => {
          const l = d.templow ?? d.temperature, hh = d.temperature;
          const name = i === 0 ? t('today') : new Date(d.datetime).toLocaleDateString(LOCALE, { weekday: 'short' }).replace('.', '');
          const pp = d.precipitation_probability >= 20 ? `<small>${Math.round(d.precipitation_probability)} %</small>` : '';
          const dot = i === 0 && a.temperature != null ? `<i class="now" style="left:${clamp(((a.temperature - lo) / span) * 100, 0, 100).toFixed(1)}%"></i>` : '';
          return `<div class="day"><span class="dn">${esc(name)}</span><span class="di">${icon(this._wxIcon(d.condition, 12))}${pp}</span><span class="lo">${Math.round(l)}°</span>`
            + `<span class="bar"><i style="left:${(((l - lo) / span) * 100).toFixed(1)}%;right:${(100 - ((hh - lo) / span) * 100).toFixed(1)}%"></i>${dot}</span><span class="hi">${Math.round(hh)}°</span></div>`;
        }).join('') || `<div class="muted">${esc(t('loadingForecast'))}</div>`;
      }
      // hourly (24 h), starting with "Now"
      const hours = (this._fc.hourly || []).filter((f) => new Date(f.datetime).getTime() > Date.now()).slice(0, 24);
      const hkey = hours.map((f) => `${f.datetime}${f.temperature}${f.condition}${f.precipitation_probability}`).join('|') + w.state + a.temperature;
      grid.querySelector('.whrs').hidden = !hours.length;
      if (hrs.dataset.k !== hkey) {
        hrs.dataset.k = hkey;
        const cell = (tt, i2, pp, temp) => `<div><span>${tt}</span>${icon(i2)}<small>${pp >= 20 ? `${Math.round(pp)} %` : ''}</small><b>${temp}</b></div>`;
        hrs.innerHTML = cell(esc(t('now')), ic, 0, a.temperature != null ? `${Math.round(a.temperature)}°` : '–')
          + hours.map((f) => { const hr = new Date(f.datetime).getHours(); return cell(String(hr).padStart(2, '0'), this._wxIcon(f.condition, hr), f.precipitation_probability, `${Math.round(f.temperature)}°`); }).join('');
      }
    });
    return v;
  },

  /* ---------------------------------------------------------------- Room
   * The room view collects the sections of the current layer: lights, media, front door, climate, covers,
   * devices, helpers. One section → one column; the first section on top, the others in two columns. */
  _roomView(k, L, upd) {
    const r = this._M.byRoom[k];
    const v = mk('div', 'pv');
    const head = this._head(r.name);
    v.append(head);
    const lights = this._roomEnts(k, L, 'light'), media = this._roomEnts(k, L, 'media'), clim = this._roomEnts(k, L, 'climate');
    const covers = this._roomEnts(k, L, 'cover'), others = this._roomEnts(k, L, 'other');
    const hasDoor = L.kinds.has('door') && this._M.door?.room === k;
    const helpers = L.kinds.has('light') ? r.helpers.filter((h) => this._hass.states[h]) : [];
    const S = {};
    if (lights.length) S.lights = () => this._lightsSection(lights, upd);
    if (clim.length) S.climate = () => this._climateSection(clim, upd);
    if (covers.length) S.covers = () => this._coverSection(covers, upd);
    if (media.length) S.media = () => {
      const w = mk('div', 'psec'), tv = media.every((e) => this._hass.states[e.entity]?.attributes?.device_class === 'tv');
      w.append(this._secHead(t(tv ? 'mediaTv' : 'mediaGeneric'), true));
      media.forEach((e) => w.append(this._mediaSection(e, upd)));
      return w;
    };
    if (others.length) S.devices = () => this._devicesSection(others, upd);
    if (helpers.length) S.helpers = () => this._helperSection(helpers, upd);
    if (hasDoor) S.door = () => this._doorSection(upd);
    const order = { light: ['lights', 'media', 'helpers', 'door', 'devices', 'climate', 'covers'], climate: ['climate', 'devices', 'lights'], cover: ['covers', 'devices', 'lights'] }[L.type]
      || ['lights', 'climate', 'covers', 'media', 'devices', 'door', 'helpers'];
    const keys = order.filter((x) => S[x]);
    const secs = keys.map((x) => S[x]());
    const tilesIn = (el) => el.querySelectorAll('.tile').length;
    let cls = 'narrow';
    if (secs.length === 1) {
      const n = tilesIn(secs[0]);
      cls = keys[0] === 'climate' && clim.filter((e) => domainOf(e.entity) === 'climate').length > 1 ? '' : n > 3 ? '' : 'narrow';
      if (keys[0] === 'lights' && n === 1 && !secs[0].querySelector('.crow')) cls += ' one';
      const w = mk('div', 'pfull');
      w.append(secs[0]);
      v.append(w);
    } else if (secs.length === 2 && tilesIn(secs[0]) <= 4) {
      cls = 'wide';
      const cols = mk('div', 'pcols'), a = mk('div', 'pcol'), b = mk('div', 'pcol');
      a.append(secs[0]); b.append(secs[1]); cols.append(a, b); v.append(cols);
    } else {
      cls = secs.length > 2 || tilesIn(secs[0]) > 4 ? 'wide' : '';
      const top = mk('div', 'pfull');
      top.append(secs[0]);
      v.append(top);
      if (secs.length > 1) {
        const cols = mk('div', 'pcols'), a = mk('div', 'pcol'), b = mk('div', 'pcol');
        secs.slice(1).forEach((s, i) => (i % 2 ? b : a).append(s));
        cols.append(a, b);
        if (!b.children.length) { cols.style.gridTemplateColumns = 'minmax(0, 1fr)'; cls = tilesIn(secs[0]) > 4 ? 'wide' : ''; }
        v.append(cols);
      }
    }
    upd.push(() => { head.querySelector('p').textContent = this._roomSubtitle(k, L, { lights, clim, covers, others }); });

    // footer: everything off / covers up & down
    const foot = mk('div', 'pf');
    const offable = [...lights, ...others].map((e) => e.entity).filter((id) => TOGGLE_DOMAINS.includes(domainOf(id)));
    if (offable.length > 1 && L.type !== 'cover' && L.type !== 'climate') {
      const off = mk('button', 'pbtn', `${icon('power')}<span>${esc(t('allOff'))}</span>`);
      off.addEventListener('click', () => this._allOff(offable));
      upd.push(() => { off.disabled = !offable.some((id) => isOn(this._st(id))); });
      foot.append(off);
    }
    if (covers.length > 1 && (L.type === 'cover' || !offable.length)) {
      const ids = covers.map((e) => e.entity);
      const up = mk('button', 'pbtn', `${icon('up')}<span>${esc(t('openAll'))}</span>`), dn = mk('button', 'pbtn', `${icon('down')}<span>${esc(t('closeAll'))}</span>`);
      up.addEventListener('click', () => this._coverAll(ids, true));
      dn.addEventListener('click', () => this._coverAll(ids, false));
      foot.append(up, dn);
    }
    if (foot.children.length) v.append(foot);
    v._info = { cls };
    return v;
  },

  _roomSubtitle(k, L, { lights, clim, covers, others }) {
    const r = this._M.byRoom[k], parts = [];
    if (L.type === 'climate' || (!lights.length && clim.length)) {
      const c = this._climateOf(clim.map((e) => e.entity));
      if (c.t != null) parts.push(`${fmt(c.t, 1)}°`);
      if (c.h != null) parts.push(t('humidityPct', Math.round(c.h)));
    } else if (L.type === 'cover' || (!lights.length && covers.length)) {
      parts.push(this._roomCoverLabel(k, L) || '');
    } else if (lights.length) {
      const n = lights.filter((l) => isOn(this._st(l.entity))).length;
      parts.push(n ? t('nOfLightsOn', n, lights.length) : lights.length === 1 ? t('lightOff') : t('allLightsOff'));
    } else if (others.length) parts.push(this._roomCustomLabel(k, L));
    if (r.m2) parts.push(`${t('approx')} ${fmt(r.m2, 0)} m²`);
    return parts.filter(Boolean).join(' · ');
  },

  _secHead(title, first) { return mk('div', `sec${first ? ' first' : ''}`, `<span>${esc(title)}</span>`); },

  _lightsSection(lights, upd) {
    const w = mk('div', 'psec');
    w.append(this._secHead(t('layer_light'), true));
    const tiles = mk('div', 'tiles');
    // light groups whose members are in the room come first, with a divider
    const groups = lights.filter((l) => Array.isArray(this._hass.states[l.entity]?.attributes?.entity_id));
    const rest = lights.filter((l) => !groups.includes(l));
    groups.forEach((l) => tiles.append(this._tile({ ...l, group: true }, upd)));
    if (groups.length && rest.length) tiles.append(mk('i', 'tdiv'));
    rest.forEach((l) => tiles.append(this._tile(l, upd)));
    w.append(tiles);
    lights.forEach((l) => { const c = this._colorRow(l, upd); if (c) w.append(c); });
    return w;
  },

  /* vertical slider like in Control Centre: drag = dim, tap = switch */
  _tile(l, upd) {
    const el = mk('div', `tile${l.group ? ' grp' : ''}`, `<div class="tb" role="slider" tabindex="0" aria-label="${esc(this._name(l))}"><i class="fill"></i>${this._iconHtml(l.icon || 'bulb')}</div><div class="tn">${esc(this._name(l))}</div><div class="tv"></div>`);
    el.dataset.focus = l.entity;
    const tb = el.querySelector('.tb'), tv = el.querySelector('.tv');
    const st = () => this._st(l.entity);
    let down = false, moved = false, held = false, holdT = 0, sy = 0, start = 0, v = 0, sent = 0;
    const show = (val, on) => { tb.style.setProperty('--v', `${val}%`); tb.classList.toggle('on', on); tb.classList.toggle('lo', val < 22); };
    // press and hold (without dragging) → device page in Home Assistant
    const hold = () => { held = true; down = false; tb.classList.remove('pressed', 'drag'); this._openDevice(l.entity, tb); };
    tb.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!held) { clearTimeout(holdT); hold(); } });
    tb.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      down = true; moved = false; held = false; sy = e.clientY;
      clearTimeout(holdT);
      holdT = setTimeout(() => { if (down && !moved) hold(); }, 520);
      const s = st();
      start = isOn(s) ? (dimmable(s) ? briPct(s) : 100) : 0; v = start;
      tb.setPointerCapture(e.pointerId);
      tb.classList.add('pressed');
    });
    tb.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dy = sy - e.clientY;
      if (!moved && Math.abs(dy) > 5 && dimmable(st())) { moved = true; clearTimeout(holdT); tb.classList.remove('pressed'); tb.classList.add('drag'); }
      if (!moved) return;
      v = clamp(Math.round(start + (dy / tb.clientHeight) * 100), 0, 100);
      show(v, v > 0);
      tv.textContent = v ? `${v} %` : t('off');
      if (Date.now() - sent > 320) { sent = Date.now(); this._setBri(l.entity, v); }
    });
    const end = (go) => {
      clearTimeout(holdT);
      if (!down || held) return;
      down = false;
      tb.classList.remove('pressed', 'drag');
      if (!go) return;
      if (moved) this._setBri(l.entity, v);
      else if (l.group) this._toggle(l.entity);
      else this._toggleLamp(l);
    };
    tb.addEventListener('pointerup', () => end(true));
    tb.addEventListener('pointercancel', () => end(false));
    tb.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (l.group) this._toggle(l.entity); else this._toggleLamp(l); return; }
      const d = { ArrowUp: 10, ArrowRight: 10, ArrowDown: -10, ArrowLeft: -10 }[e.key];
      if (d && dimmable(st())) { e.preventDefault(); this._setBri(l.entity, clamp(briPct(st()) + d, 0, 100)); }
    });
    upd.push(() => {
      if (down && moved) return;
      const s = st(), on = isOn(s), rgb = lightRgb(l, s);
      tb.style.setProperty('--c', rgb.join(','));
      tb.style.setProperty('--cl', lighten(rgb, 0.5).join(','));
      tb.classList.toggle('dk', lum(rgb) < 0.5);
      show(on ? (dimmable(s) ? briPct(s) : 100) : 0, on);
      tv.textContent = unavailable(s) ? t('offline') : on ? (dimmable(s) ? `${briPct(s)} %` : t('on')) : t('off');
      el.classList.toggle('na', unavailable(s));
    });
    return el;
  },

  _colorRow(l, upd) {
    const st0 = this._hass.states[l.entity];
    if (!hasTemp(st0) && !hasColor(st0)) return null;
    const w = mk('div', '', `<div class="sec"><span>${esc(this._name(l))} · ${esc(hasColor(st0) ? t('colour') : t('whiteTone'))}</span></div>`);
    const row = mk('div', 'crow');
    if (hasColor(st0)) {
      const sws = mk('div', 'sws');
      for (const rgb of SWATCHES) {
        const b = mk('button', 'sw');
        b.style.background = `radial-gradient(circle at 35% 30%, rgba(255,255,255,.5), rgb(${rgb.join(',')}) 62%)`;
        b.setAttribute('aria-label', t('pickColour'));
        b.addEventListener('click', () => this._call('light', 'turn_on', { entity_id: l.entity, rgb_color: rgb }).catch(() => {}));
        sws.append(b);
      }
      row.append(sws);
    }
    if (hasTemp(st0)) {
      const a = st0.attributes;
      const min = a.min_color_temp_kelvin || 2200, max = Math.min(a.max_color_temp_kelvin || 6500, 6500);
      const ks = mk('div', 'ks', '<i class="kn"></i>');
      ks.setAttribute('role', 'slider');
      ks.setAttribute('aria-label', t('whiteTone'));
      ks.tabIndex = 0;
      let drag = false, val = 0, sent = 0;
      const pos = (k) => `${clamp(((k - min) / (max - min)) * 100, 0, 100)}%`;
      const atX = (e) => { const r = ks.getBoundingClientRect(); return Math.round(min + clamp((e.clientX - r.left - 14) / (r.width - 28), 0, 1) * (max - min)); };
      const set = (k) => this._call('light', 'turn_on', { entity_id: l.entity, color_temp_kelvin: Math.round(k) }).catch(() => {});
      ks.addEventListener('pointerdown', (e) => { drag = true; ks.setPointerCapture(e.pointerId); ks.classList.add('drag'); val = atX(e); ks.style.setProperty('--v', pos(val)); });
      ks.addEventListener('pointermove', (e) => { if (!drag) return; val = atX(e); ks.style.setProperty('--v', pos(val)); if (Date.now() - sent > 380) { sent = Date.now(); set(val); } });
      const up = () => { if (!drag) return; drag = false; ks.classList.remove('drag'); set(val); };
      ks.addEventListener('pointerup', up);
      ks.addEventListener('pointercancel', up);
      ks.addEventListener('keydown', (e) => {
        const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
        if (!d) return;
        e.preventDefault();
        set(clamp((this._hass.states[l.entity]?.attributes?.color_temp_kelvin || (min + max) / 2) + d * 250, min, max));
      });
      upd.push(() => {
        if (drag) return;
        const s = this._hass.states[l.entity], k = s?.attributes?.color_temp_kelvin;
        ks.style.setProperty('--v', k && s?.attributes?.color_mode === 'color_temp' ? pos(k) : pos((min + max) / 2));
        ks.querySelector('.kn').style.opacity = k && s?.attributes?.color_mode === 'color_temp' ? '1' : '.55';
      });
      row.append(ks);
    }
    w.append(row);
    return w;
  },

  /* ---------------------------------------------------------------- Media player */
  _mediaSection(e, upd) {
    const F = { PAUSE: 1, VOLUME_SET: 4, PREV: 16, NEXT: 32, ON: 128, OFF: 256, PLAY: 16384 };
    const E = e.entity, nm = this._name(e);
    const w = mk('div', 'media');
    w.dataset.focus = E;
    w.innerHTML = `<div class="np"><div class="art">${icon('tv')}</div><div><div class="t1"></div><div class="t2"></div></div><button class="cbtn pw" aria-label="${esc(t('power'))}">${icon('power')}</button></div>
      <div class="ctrls"><button class="cbtn pv" aria-label="${esc(t('previous'))}">${icon('prev')}</button><button class="cbtn lg pp" aria-label="${esc(t('playPause'))}">${icon('play')}</button><button class="cbtn nx" aria-label="${esc(t('next'))}">${icon('next')}</button></div>
      <div class="hs vol" role="slider" aria-label="${esc(t('volume'))}" tabindex="0"><i class="fl"></i>${icon('speaker')}</div>`;
    const call = (svc, data = {}) => this._call('media_player', svc, { entity_id: E, ...data }).catch(() => {});
    const offState = (s) => unavailable(s) || ['off', 'standby'].includes(s?.state);
    this._hold(w.querySelector('.np'), E);
    w.querySelector('.pw').addEventListener('click', () => call(offState(this._hass.states[E]) ? 'turn_on' : 'turn_off'));
    w.querySelector('.pv').addEventListener('click', () => call('media_previous_track'));
    w.querySelector('.pp').addEventListener('click', () => call('media_play_pause'));
    w.querySelector('.nx').addEventListener('click', () => call('media_next_track'));
    const vol = w.querySelector('.vol');
    let drag = false, vv = 0, sent = 0;
    const atX = (ev) => { const r = vol.getBoundingClientRect(); return Math.round(clamp((ev.clientX - r.left) / r.width, 0, 1) * 100); };
    vol.addEventListener('pointerdown', (ev) => { drag = true; vol.setPointerCapture(ev.pointerId); vol.classList.add('drag'); vv = atX(ev); vol.style.setProperty('--v', `${vv}%`); });
    vol.addEventListener('pointermove', (ev) => { if (!drag) return; vv = atX(ev); vol.style.setProperty('--v', `${vv}%`); if (Date.now() - sent > 350) { sent = Date.now(); call('volume_set', { volume_level: vv / 100 }); } });
    const up = () => { if (!drag) return; drag = false; vol.classList.remove('drag'); call('volume_set', { volume_level: vv / 100 }); };
    vol.addEventListener('pointerup', up);
    vol.addEventListener('pointercancel', up);
    vol.addEventListener('keydown', (ev) => {
      const d = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[ev.key];
      if (!d) return;
      ev.preventDefault();
      call('volume_set', { volume_level: clamp((this._hass.states[E]?.attributes?.volume_level || 0) + d / 100, 0, 1) });
    });
    upd.push(() => {
      const s = this._hass.states[E], a = s?.attributes || {}, f = a.supported_features || 0;
      const off = offState(s);
      const playing = ['playing', 'paused'].includes(s?.state);
      w.querySelector('.t1').textContent = unavailable(s) ? t('notReachableShort') : playing ? (a.media_title || a.app_name || t('playing')) : nm;
      w.querySelector('.t2').textContent = unavailable(s) ? '' : playing ? ([a.media_artist || a.media_series_title, a.app_name].filter(Boolean).join(' · ') || this._mediaLabel(s))
        : [this._mediaLabel(s), a.source].filter(Boolean).join(' · ');
      const art = w.querySelector('.art');
      if (playing && a.entity_picture) { art.style.backgroundImage = `url("${this._hass.hassUrl ? this._hass.hassUrl(a.entity_picture) : a.entity_picture}")`; art.innerHTML = ''; }
      else { art.style.backgroundImage = ''; if (!art.firstChild) art.innerHTML = icon('tv'); }
      w.querySelector('.pw').classList.toggle('on', !off);
      w.querySelector('.pw').hidden = !(f & (F.ON | F.OFF));
      w.querySelector('.pp').innerHTML = icon(s?.state === 'playing' ? 'pause' : 'play');
      w.querySelector('.pv').disabled = off || !(f & F.PREV);
      w.querySelector('.nx').disabled = off || !(f & F.NEXT);
      w.querySelector('.pp').disabled = off || !(f & (F.PAUSE | F.PLAY));
      w.querySelector('.ctrls').hidden = !(f & (F.PAUSE | F.PLAY | F.PREV | F.NEXT));
      const hasVol = !!(f & F.VOLUME_SET) && a.volume_level != null && !off;
      vol.hidden = !hasVol;
      if (hasVol && !drag) vol.style.setProperty('--v', `${Math.round(a.volume_level * 100)}%`);
    });
    return w;
  },

  /* ---------------------------------------------------------------- Front door */
  _bellText() {
    const ring = this._hass.states[this._M.door?.bell];
    if (!ring) return '';
    const when = isTime(ring.state) ? ring.state : domainOf(this._M.door.bell) === 'binary_sensor' ? ring.last_changed : null;
    return when ? relTime(when) : '';
  },

  /* "Slide to open" – only opens when pushed all the way to the right */
  _doorSlide(upd, whenEl) {
    const D = this._M.door, label = whenEl ? t('openDoor') : t('slideToOpen');
    const lockish = domainOf(D.open) === 'lock';
    const info = `<div class="dinfo">${D.bell ? `<div class="drow ring">${icon('bell')}<span>${esc(t('rang'))}</span><b></b></div>` : ''}<div class="drow open">${icon('door')}<span>${esc(t('opened'))}</span><b></b></div></div>`;
    const w = mk('div', 'dwrap', `${whenEl ? '' : info}<div class="slide"><div class="tx">${esc(label)}</div><div class="kb">${icon('chevR')}</div></div>`);
    const slide = w.querySelector('.slide'), kb = slide.querySelector('.kb'), tx = slide.querySelector('.tx');
    if (!whenEl) { this._hold(w.querySelector('.dinfo .ring'), D.bell); this._hold(w.querySelector('.dinfo .open'), D.open); }
    let drag = false, sx = 0, x = 0, done = false;
    const pad = () => kb.offsetLeft;
    const maxX = () => slide.clientWidth - kb.offsetWidth - 2 * pad();
    const reset = () => { done = false; x = 0; slide.classList.remove('done', 'ok'); slide.style.setProperty('--x', '0px'); slide.style.setProperty('--p', '0'); kb.innerHTML = icon('chevR'); tx.textContent = label; };
    kb.addEventListener('pointerdown', (e) => { if (done || e.button > 0) return; drag = true; sx = e.clientX - x; kb.setPointerCapture(e.pointerId); slide.classList.add('drag'); e.stopPropagation(); });
    kb.addEventListener('pointermove', (e) => {
      if (!drag) return;
      x = clamp(e.clientX - sx, 0, maxX());
      slide.style.setProperty('--x', `${x}px`);
      slide.style.setProperty('--p', (x / maxX()).toFixed(3));
    });
    const up = () => {
      if (!drag) return;
      drag = false;
      slide.classList.remove('drag');
      if (x >= maxX() * 0.92) {
        done = true; x = maxX();
        slide.style.setProperty('--x', `${x}px`);
        slide.style.setProperty('--p', '1');
        slide.classList.add('done');
        kb.innerHTML = icon('doorOpen');
        tx.textContent = t('opening');
        const d = domainOf(D.open);
        const p = d === 'lock' ? this._call('lock', 'open', { entity_id: D.open }).catch(() => this._call('lock', 'unlock', { entity_id: D.open }))
          : PRESS_DOMAINS.includes(d) ? this._pressEntity(D.open) : this._call('homeassistant', 'turn_on', { entity_id: D.open });
        p.then(() => { slide.classList.add('ok'); tx.textContent = t('doorOpen'); setTimeout(reset, 3200); }).catch(() => reset());
      } else { x = 0; slide.style.setProperty('--x', '0px'); slide.style.setProperty('--p', '0'); }
    };
    kb.addEventListener('pointerup', up);
    kb.addEventListener('pointercancel', up);
    w.addEventListener('click', (e) => e.stopPropagation());
    upd.push(() => {
      const s = this._hass.states[D.open];
      const when = s && isTime(s.state) ? s.state : lockish ? s?.last_changed : null;
      if (whenEl) whenEl.textContent = when && !lockish ? relTime(when) : this._bellText();
      else {
        const rows = w.querySelector('.dinfo');
        const ring = this._hass.states[D.bell];
        const rang = ring && isTime(ring.state) ? ring.state : ring && domainOf(D.bell) === 'binary_sensor' ? ring.last_changed : null;
        if (D.bell) {
          rows.querySelector('.ring b').textContent = rang ? whenText(rang) : t('never');
          rows.querySelector('.ring').classList.toggle('new', !!rang && Date.now() - Date.parse(rang) < 10 * 60e3);
        }
        rows.querySelector('.open b').textContent = lockish ? this._stateText(D.open, s) : when ? whenText(when) : t('never');
      }
    });
    return w;
  },

  _doorSection(upd, standalone) {
    const w = mk('div', 'psec');
    w.dataset.focus = '__door';
    if (!standalone) w.append(this._secHead(this._M.door.name || t('frontDoor'), true));
    if (this._M.door.open) w.append(this._doorSlide(upd));
    else {
      const r = mk('div', 'dinfo', `<div class="drow ring">${icon('bell')}<span>${esc(t('rang'))}</span><b></b></div>`);
      this._hold(r.querySelector('.ring'), this._M.door.bell);
      upd.push(() => { const ring = this._hass.states[this._M.door.bell]; r.querySelector('b').textContent = ring && isTime(ring.state) ? whenText(ring.state) : t('never'); });
      w.append(r);
    }
    return w;
  },

  _doorView(upd) {
    const v = mk('div', 'pv');
    v.append(this._head(this._M.door.name || t('frontDoor'), this._M.door.room ? this._M.byRoom[this._M.door.room]?.name : ''));
    const sec = this._doorSection(upd, true);
    sec.style.marginTop = '22px';
    v.append(sec);
    return v;
  },

  /* ---------------------------------------------------------------- Helpers (input_number) as sliders */
  _helperSection(ids, upd) {
    const w = mk('div', 'psec');
    w.append(this._secHead(t('settings'), true));
    const rows = mk('div', 'nrows');
    ids.forEach((id) => rows.append(this._numRow(id, upd)));
    w.append(rows);
    return w;
  },

  _numRow(eid, upd) {
    const d = domainOf(eid);
    if (d !== 'input_number' && d !== 'number') {
      const row = this._deviceRow(eid, upd);
      return row;
    }
    const name = this._nameOf(eid);
    const w = mk('div', 'nrow', `<div class="nk"><span>${esc(name)}</span><b></b></div><div class="hs" role="slider" tabindex="0" aria-label="${esc(name)}"><i class="fl"></i></div>`);
    const bar = w.querySelector('.hs'), out = w.querySelector('b');
    const st = () => this._hass.states[eid];
    this._hold(w.querySelector('.nk'), eid);
    const range = () => { const a = st()?.attributes || {}; return { min: Number.isFinite(+a.min) ? +a.min : 0, max: Number.isFinite(+a.max) ? +a.max : 100, step: +a.step || 1, unit: a.unit_of_measurement || '' }; };
    const show = (v) => {
      const { min, max, step, unit } = range();
      bar.style.setProperty('--v', `${(((v - min) / (max - min || 1)) * 100).toFixed(1)}%`);
      out.textContent = `${fmt(v, step < 1 ? 1 : 0)}${unit ? ` ${unit}` : ''}`;
      bar.setAttribute('aria-valuenow', v);
    };
    const pick = (x) => { const r = bar.getBoundingClientRect(), { min, max, step } = range(); return clamp(Math.round((min + clamp((x - r.left) / r.width, 0, 1) * (max - min)) / step) * step, min, max); };
    let drag = false, cur = null;
    const commit = () => { if (cur != null && cur !== num(st())) this._call(d, 'set_value', { entity_id: eid, value: cur }).catch(() => { cur = null; upd.forEach((f) => f()); }); };
    bar.addEventListener('pointerdown', (e) => { if (e.button > 0) return; drag = true; bar.setPointerCapture(e.pointerId); bar.classList.add('drag'); cur = pick(e.clientX); show(cur); });
    bar.addEventListener('pointermove', (e) => { if (drag) { cur = pick(e.clientX); show(cur); } });
    const up = () => { if (!drag) return; drag = false; bar.classList.remove('drag'); commit(); };
    bar.addEventListener('pointerup', up);
    bar.addEventListener('pointercancel', up);
    bar.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
      e.preventDefault();
      const { min, max, step } = range(), dd = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : step;
      cur = clamp((cur ?? num(st()) ?? min) + dd, min, max); show(cur); commit();
    });
    upd.push(() => {
      const s = st();
      w.classList.toggle('na', unavailable(s));
      if (!drag) { const v = num(s); if (v != null) { cur = v; show(v); } }
    });
    return w;
  },

  /* ---------------------------------------------------------------- To Home Assistant: device / info
   * Admins go straight to the device page (Settings → Devices); entities without a device (groups, helpers)
   * or users without admin rights get the Home Assistant info dialog. */
  _openDevice(eid, el, infoOnly) {
    const h = this._hass, dev = h?.entities?.[eid]?.device_id;
    try { navigator.vibrate?.(10); } catch (e) { /* never mind */ }
    if (el && !this._reduced) el.animate([{ transform: 'scale(.93)' }, { transform: 'scale(1.02)', offset: 0.6 }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
    if (dev && h.user?.is_admin && !infoOnly) {
      setTimeout(() => {
        const r = this._reduced; this._reduced = true; this._closePop(); this._reduced = r;
        history.pushState(null, '', `/config/devices/device/${dev}`);
        window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
      }, 140);
      return;
    }
    fire(this, 'hass-more-info', { entityId: eid });
  },

  /* press and hold (≈ ½ s, without moving) or right-click on a row → _openDevice */
  _hold(el, eid) {
    if (!el || !eid) return;
    el.classList.add('hold');
    let tm = 0, sx = 0, sy = 0, fired = false;
    const cancel = () => { clearTimeout(tm); el.classList.remove('holding'); };
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || e.target.closest('button, .hs, .slide, .ks, .sws, .tgl, .dial, .hvac')) return;
      fired = false; sx = e.clientX; sy = e.clientY;
      el.classList.add('holding');
      tm = setTimeout(() => { fired = true; el.classList.remove('holding'); this._openDevice(eid, el); }, 520);
    });
    el.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) cancel(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => el.addEventListener(n, cancel));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); if (!fired) { fired = true; this._openDevice(eid, el); } });
  },

  /* ---------------------------------------------------------------- Menu */
  _openMenu(anchor, items) {
    const m = this._menu;
    m.innerHTML = '';
    for (const it of items) {
      if (it.sep) { m.append(mk('div', 'msep')); continue; }
      if (it.head) { m.append(mk('div', 'mh', esc(it.head))); continue; }
      if (it.note) { m.append(mk('div', 'mnote', esc(it.note))); continue; }
      if (it.seg) {
        const s = mk('div', 'mseg', `<i class="knob"></i>${it.seg.options.map((o) => `<button data-v="${esc(o.v)}">${esc(o.t)}</button>`).join('')}`);
        s.style.setProperty('--n', it.seg.options.length);
        const sync = (val) => {
          const i = Math.max(0, it.seg.options.findIndex((o) => o.v === val));
          s.style.setProperty('--i', i);
          s.querySelectorAll('button').forEach((b, j) => b.classList.toggle('act', j === i));
        };
        sync(it.seg.value);
        s.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { sync(b.dataset.v); it.seg.onChange(b.dataset.v); }));
        m.append(s);
        continue;
      }
      const b = mk('button', `mi${it.act ? ' act' : ''}${it.placeholder ? ' ph' : ''}`, `<i class="mic">${it.iconHtml || icon(it.icon || 'sparkle')}</i><span>${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>${it.check ? icon('check', 'chk') : ''}`);
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', () => { if (!it.keep) this._closeMenu(); it.onClick?.(); });
      m.append(b);
    }
    // above (or below) the button
    const rr = this._root.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
    m.style.minWidth = `${Math.max(250, ar.width)}px`;
    const mw = m.offsetWidth, mh = m.offsetHeight;
    const left = clamp(ar.left - rr.left, 12, rr.width - mw - 12);
    const above = ar.top - rr.top - mh - 10 > 8;
    const top = above ? ar.top - rr.top - mh - 10 : ar.bottom - rr.top + 10;
    m.style.left = `${left}px`;
    m.style.top = `${top}px`;
    m.style.setProperty('--ox', `${ar.left - rr.left - left + ar.width / 2}px`);
    m.style.setProperty('--oy', above ? '100%' : '0%');
    this._menuAnchor = anchor;
    anchor.classList.add('open');
    anchor.setAttribute('aria-expanded', 'true');
    m.getAnimations().forEach((an) => an.cancel());
    m.classList.add('open');
    if (this._reduced) return;
    const oy = above ? 10 : -10;
    m.animate([{ opacity: 0, transform: `translateY(${oy}px) scale(.9)`, filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }],
      { duration: SPRINGS.sp.ms, easing: ease('sp', 'ease-out') });
    [...m.children].forEach((c, i) => c.animate([{ opacity: 0, transform: `translateY(${oy / 2}px)` }, { opacity: 1, transform: 'none' }],
      { duration: 360, delay: 30 + i * 22, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'backwards' }));
  },

  _closeMenu() {
    const m = this._menu;
    if (!m || !m.classList.contains('open')) return;
    if (this._menuAnchor) { this._menuAnchor.classList.remove('open'); this._menuAnchor.setAttribute('aria-expanded', 'false'); }
    this._menuAnchor = null;
    if (this._reduced) { m.classList.remove('open'); return; }
    m.getAnimations().forEach((an) => an.cancel());
    const an = m.animate([{ opacity: 1, transform: 'none', filter: 'blur(0px)' }, { opacity: 0, transform: 'scale(.96)', filter: 'blur(4px)' }],
      { duration: 170, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
    an.onfinish = () => { m.classList.remove('open'); an.cancel(); };
  },

  /* ---------------------------------------------------------------- Modes: scenes + scripts with a label in Home Assistant */
  _loadLabels() {
    if (!this._labelsP) {
      this._labelsP = this._hass?.callWS
        ? this._hass.callWS({ type: 'config/label_registry/list' }).then((l) => { this._labels = l || []; }).catch(() => { this._labels = []; })
        : Promise.resolve();
    }
    return this._labelsP;
  },

  /* label id of the modes label (configurable; "Dashboard mode" and "Dashboard-Modus" are found by default) */
  _modeLabelIds() {
    const names = this._config.modes_label ? [String(this._config.modes_label)] : MODE_LABELS;
    const ids = [];
    for (const name of names) {
      const hit = (this._labels || []).find((l) => l.label_id === name || String(l.name).toLowerCase() === name.toLowerCase());
      // without read access to the label list (no admin): Home Assistant derives the id from the name
      ids.push(hit ? hit.label_id : slug(name));
    }
    return ids;
  },

  _modes() {
    const cfg = Array.isArray(this._config.modes) && this._config.modes.length ? this._config.modes : null;
    if (cfg) return cfg.map((m) => ({ ...m, name: m.name || this._nameOf(m.scene || m.script), placeholder: !(m.scene || m.script || m.service) }));
    const h = this._hass, lids = this._modeLabelIds();
    const found = Object.values(h?.entities || {})
      .filter((e) => /^(scene|script)\./.test(e.entity_id) && (e.labels || []).some((l) => lids.includes(l)) && h.states[e.entity_id] && !e.hidden)
      .map((e) => {
        const st = h.states[e.entity_id], scene = e.entity_id.startsWith('scene.');
        const full = String(st.attributes.friendly_name || e.entity_id);
        const last = Date.parse(scene ? st.state : st.attributes.last_triggered);
        const n = (st.attributes.entity_id || []).length;
        return {
          full, name: full.replace(/^\s*\d+(?:\s*[.)\-:_]\s*|\s+)/, '') || full, mdi: e.icon || st.attributes.icon,
          [scene ? 'scene' : 'script']: e.entity_id, at: Number.isFinite(last) ? last : 0,
          sub: scene ? (n ? t('nDevices', n) : t('scene')) : t('script'),
        };
      })
      .sort((x, y) => x.full.localeCompare(y.full, LOCALE, { numeric: true }));
    return found.length ? found : t('defaultModes').map(([name, ic]) => ({ name, icon: ic, placeholder: true }));
  },

  _modeIcon(m) {
    if (m.icon && ICONS[m.icon]) return icon(m.icon);
    if (m.mdi && MDI_MAP[m.mdi]) return icon(MDI_MAP[m.mdi]);
    const mdi = m.mdi || (String(m.icon || '').includes(':') ? m.icon : null);
    if (mdi && customElements.get('ha-icon')) return `<ha-icon icon="${esc(mdi)}"></ha-icon>`;
    return icon(m.script ? 'play' : 'sparkle');
  },

  async _openModes(anchor) {
    await this._loadLabels();
    const modes = this._modes();
    const last = modes.filter((m) => !m.placeholder && m.at).sort((x, y) => y.at - x.at)[0];
    const items = modes.map((m) => ({
      iconHtml: this._modeIcon(m), label: m.name || t('mode'), placeholder: m.placeholder, check: !m.placeholder, act: m === last,
      sub: m.placeholder ? t('notSetUp') : m === last ? `${t('last')} · ${relTime(new Date(m.at).toISOString())}` : m.sub || '',
      onClick: () => this._runMode(m),
    }));
    if (modes.every((m) => m.placeholder)) items.push({ sep: true }, { note: t('modesHint', this._config.modes_label || MODE_LABELS[LANG === 'de' ? 1 : 0]) });
    this._openMenu(anchor, items);
  },

  _runMode(m) {
    if (m.placeholder) { this._toast(t('modeNotSetUp', m.name)); return; }
    let p;
    if (m.scene) p = this._call('scene', 'turn_on', { entity_id: m.scene });
    else if (m.script) p = this._call('script', 'turn_on', { entity_id: m.script });
    else if (m.service) { const [d, s] = String(m.service).split('.'); p = this._call(d, s, m.data || {}, m.target); }
    p?.then(() => this._toast(t(m.script ? 'started' : 'activated', m.name))).catch(() => {});
  },
});
const MODE_LABELS = ['Dashboard mode', 'Dashboard-Modus'];
const SWATCHES = [[255, 170, 70], [255, 214, 150], [255, 80, 60], [255, 55, 145], [175, 90, 240], [70, 130, 255], [45, 205, 175], [255, 214, 50]];
