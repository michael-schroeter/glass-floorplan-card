/* ================================================================== Window and door contacts on the plan
 * A window or the front door with a contact (assignOpenings in the model) opens on the plan: its sash glows orange and
 * swings into the room – a wide window as two sashes, the front door wide; a tilted sash moves a little inwards.
 * Shown in every layer of the plan. Tap: the contact's tap_action, else Home Assistant's dialog of the contact. */
const SASH_DEG = { open: 34, door: 66 };

Object.assign(GlassFloorplanCard.prototype, {
  /* the contacts' elements, one per window / front door with a contact (G = the stage's geometry) */
  _openingsHtml(G) {
    const M = this._M;
    return M.openings.filter((o) => o.sens.length).map((o) => {
      const s = o.s, h = segH(s), len = h ? s[2] - s[0] : s[3] - s[1];
      // on the line of the window (it hugs the outside of the glass tile)
      const out = o.side === 't' || o.side === 'l' ? 1 : o.side ? -1 : 0, off = out ? ` + ${out} * (var(--gap) / 2 - 1.7 * var(--u))` : '';
      const pos = h ? `left:${G.px(s[0])}%;width:${G.pw(len)}%;top:calc(${G.py(s[1])}%${off})` : `top:${G.py(s[1])}%;height:${G.ph(len)}%;left:calc(${G.px(s[0])}%${off})`;
      // the sash turns into the room: clockwise on the top and the right wall
      const sg = o.side === 'b' || o.side === 'l' ? -1 : 1, two = !o.door && len * M.scale > 125;
      return `<button class="wsn${h ? '' : ' v'}${o.door ? ' dr' : ''}${two ? ' two' : ''}" data-s="${esc(o.sens.join(' '))}" style="${pos};--sg:${sg}">`
        + `<i class="wl"></i><i class="sa"></i>${two ? '<i class="sa b"></i>' : ''}</button>`;
    }).join('');
  },

  /* which devices are contacts – a contact that only shows up later (Home Assistant still starting) needs a new plan */
  _openSig() {
    const h = this._hass;
    return this._M.ents.map((e) => (e.opening === false ? 0 : e.opening === true || openingSensor(e.entity, h?.states?.[e.entity]) ? 1 : 0)).join('');
  },

  /* How long ago a door opener was pressed, by this browser's clock: from when the change arrived here – the clocks of Home
   * Assistant and the browser differ a little (a press "in the future" looked closed until the page was reloaded) or a lot.
   * Seen first (page loaded): Home Assistant's time stamp, a press a moment ahead counts as now. */
  _pressAge(eid) {
    const st = this._hass?.states?.[eid];
    if (!st || !isTime(st.state)) return Infinity;
    const seen = this._pressSeen || (this._pressSeen = {}), was = seen[eid];
    if (was?.v !== st.state) seen[eid] = { v: st.state, at: was ? Date.now() : null };
    return seen[eid].at != null ? Date.now() - seen[eid].at : Math.max(0, Date.now() - new Date(st.state).getTime());
  },
  /* open / tilt / closed / na of a device on a window – a door opener by the browser's clock */
  _openOf(eid) {
    if (!PRESS_DOMAINS.includes(domainOf(eid))) return openState(eid, this._st(eid));
    const st = this._st(eid);
    return unavailable(st) ? 'na' : this._pressAge(eid) < OPENER_MS ? 'open' : 'closed';
  },

  _wsnEnts(el) { return el.dataset.s.split(' ').map((id) => this._M.ents.find((e) => e.entity === id)).filter(Boolean); },
  /* the contact that speaks for the window: an open one first */
  _wsnMain(el) {
    const l = this._wsnEnts(el);
    return l.find((e) => this._openOf(e.entity) === 'open') || l.find((e) => this._openOf(e.entity) === 'tilt') || l[0];
  },
  _wireOpenings() {
    for (const el of this.shadowRoot.querySelectorAll('.wsn')) {
      const run = (k) => { const e = this._wsnMain(el); this._hideTip(); this._act(e[k], { entity: e.entity, el, name: this._name(e), own: () => this._openDevice(e.entity, el, true) }); };
      this._press(el, () => run('tap'), () => run('hold'), this._wsnEnts(el).some((e) => e.dbl) && (() => run('dbl')));
      // the tooltip above the middle of the window (an upright one would cover the room's name with it at its top end)
      const mid = { getBoundingClientRect: () => { const r = el.getBoundingClientRect(), y = r.top + r.height / 2; return { left: r.left, right: r.right, width: r.width, top: y, bottom: y, height: 0 }; } };
      el.addEventListener('pointerenter', () => { const e = this._wsnMain(el); this._showTip(mid, this._name(e), this._openText(e)); });
      el.addEventListener('pointerleave', () => this._hideTip());
    }
  },
  /* "Open · 25 min ago" */
  _openText(e) {
    const st = this._st(e.entity), s = this._openOf(e.entity), d = domainOf(e.entity);
    // a door opener: "Opened · 20 s ago" for a minute, else when it was last used
    if (PRESS_DOMAINS.includes(d)) return s === 'open' ? `${t('opened')} · ${relTime(Date.now() - this._pressAge(e.entity))}` : s === 'na' ? t('offline') : this._stateText(e.entity, st);
    const txt = s === 'na' ? t('offline') : this._stateText(e.entity, st);
    const ago = (s === 'open' || s === 'tilt') && relTime(st.last_changed);
    return ago ? `${txt} · ${ago}` : txt;
  },

  _updOpenings() {
    clearTimeout(this._wsnT);
    let next = Infinity;
    for (const el of this.shadowRoot.querySelectorAll('.wsn')) {
      const ents = this._wsnEnts(el), sts = ents.map((e) => this._openOf(e.entity));
      const s = sts.includes('open') ? 'open' : sts.includes('tilt') ? 'tilt' : sts.every((x) => x === 'na') ? 'na' : 'closed';
      // opened by the door opener (not reported by a contact): green like the front door, closed again after a minute
      const press = ents.filter((x, i) => sts[i] === 'open' && PRESS_DOMAINS.includes(domainOf(x.entity)));
      el.classList.toggle('go', press.length > 0 && press.length === sts.filter((x) => x === 'open').length);
      for (const x of press) next = Math.min(next, OPENER_MS - this._pressAge(x.entity));
      const e = this._wsnMain(el);
      el.setAttribute('aria-label', `${this._name(e)}: ${this._openText(e)}`);
      if (el.dataset.st === s) continue;
      el.dataset.st = s;
      el.style.setProperty('--a', s === 'open' ? (el.classList.contains('dr') ? SASH_DEG.door : SASH_DEG.open) : 0);
    }
    if (next < Infinity) this._wsnT = setTimeout(() => this._update(true), Math.max(0, next) + 250);
  },
});
