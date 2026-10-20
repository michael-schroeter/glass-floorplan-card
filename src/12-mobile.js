/* ================================================================== Phone: layout, layer bar at the bottom, sheets from below
 * The same card switches to this layout below 700 px width. A landscape plan is turned upright (see rotateModel),
 * the layer card sits full width under the plan (where the thumb is), the layers float in a glass bar at the bottom,
 * pop-ups come up as sheets that close by dragging them down. Open/close only animates transform + opacity. */
const STYLES_M = `
/* extras shared by both layouts */
.srow .ri2 { flex: none; display: grid; place-items: center; font-size: 21px; --mdc-icon-size: 21px; }
.dev.val.sens .disc { box-shadow: inset 0 0 0 1.5px rgba(var(--c, 255, 255, 255), .55), inset 0 1px 0 rgba(255, 255, 255, .1), 0 5px 14px rgba(0, 0, 0, .3); }
.dev.val.clim.off .vt { opacity: .55; }
.dev.cov.mv .ring circle { animation: covmv 1.2s ease-in-out infinite; }
@keyframes covmv { 50% { opacity: .35; } }
.root[data-type="cover"] .dev.cov:not(.on) .disc { background: rgba(255, 255, 255, .08); }

/* ---------------------------------------------------------------- phone */
.m .lamp { --ls: max(32px, calc(52 * var(--u))); }
.m .dev { --ls: max(27px, calc(44 * var(--u))); }
.m .dev.val { --ls: max(31px, calc(50 * var(--u))); }
.m .dev.val .vt { font-size: 11px; }
.m .rl { left: 9px; right: 5px; top: 8px; }
.m .rl b { font-size: 12px; }
.m .rl span { font-size: 10.5px; margin-top: 1px; }
.m .room.lb .rl { top: 8px; bottom: auto; }
.m .room { border-radius: 11px; }
.m .badge { top: 7px; right: 7px; width: 20px; height: 20px; font-size: 11px; }
.m .bot { --bs: 22px; }

/* info tiles that did not fit into the plan: a row under it */
.m .mside { position: absolute; z-index: 7; display: flex; gap: 8px; }
.m .mside .card { position: relative; flex: 1 1 0; height: 100%; }
/* info tiles inside the plan */
.m .card { padding: 10px 11px 10px 12px; border-radius: 16px; }
.m .card .k { font-size: 12px; gap: 4px; }
.m .card .k .ic { font-size: 15px; }
.m .card .v { font-size: 25px; }
.m .card .s { margin-top: 2px; font-size: 11.5px; }
.m .card.dr .when { font-size: 11px; }
.m .card .dslot { margin: auto -3px -2px; }
.m .card .slide { --sh: 40px; }
.m .card .slide .tx { font-size: 12.5px; padding-left: calc(var(--sh) - 6px); }

/* layer card under the plan (full width, thumb area) */
.m .gcard { padding: 15px 16px 14px; border-radius: 24px; }
.m .gk { font-size: 11px; }
.m .gk .bat { font-size: 12px; }
.m .gt { margin-top: 3px; }
.m .gt b { font-size: 23px; }
.m .gt span, .m .gt button.lnk { font-size: 14px; }
.m .gs { margin-top: 2px; font-size: 13px; }
.m .segs { gap: 5px; padding-top: 10px; }
.m .segs i { height: 6px; }
.m .prog { height: 6px; }
.m .gbtns { gap: 10px; margin-top: 13px; }
.m .gv.sub .gbtns { margin-top: 11px; }
.m .gv.sub .segs { padding-top: 8px; }
.m .gv.cv .prog:not([hidden]) + .gbtns { margin-top: 13px; }
.m .gbtn { height: 46px; border-radius: 15px; font-size: 15px; }
/* switching layers: the card fades in without a blur filter (cheaper on phones) */
.m .gcard > .gv { animation-name: fadeinm; }
@keyframes fadeinm { from { opacity: 0; transform: translateY(8px) scale(.99); } to { opacity: 1; transform: none; } }

/* layers: floating glass bar at the bottom, like the iPhone tab bar */
.m .tabs { position: fixed; z-index: 40; left: 50%; top: auto; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%);
  flex-direction: row; gap: 4px; padding: 5px; max-width: calc(100vw - 20px); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .14), inset 0 1px 0 rgba(255, 255, 255, .1), 0 14px 40px rgba(0, 0, 0, .45);
  background: linear-gradient(165deg, rgba(255, 255, 255, .14), rgba(255, 255, 255, .06)), rgba(22, 22, 28, .5); -webkit-backdrop-filter: blur(30px) saturate(180%); backdrop-filter: blur(30px) saturate(180%); }
.m .tabs button { width: var(--tw, 86px); height: 50px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 0 4px; }
.m .tabs button .ic, .m .tabs button ha-icon { font-size: 21px; --mdc-icon-size: 21px; }
.m .tabs button span { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px; font-weight: 600; letter-spacing: 0; }
.m .tabs .knob { top: 5px; bottom: 5px; left: 0; right: auto; height: auto; width: 0; transition: transform var(--sp-ms) var(--sp), width var(--sp-ms) var(--sp); }

/* in Home Assistant's card preview the bar stays inside the card */
.m.pv .tabs { position: absolute; bottom: 12px; }
/* pop-ups as a floating glass sheet from below (slightly smaller blur radii: just as soft on a phone screen, but cheaper) */
.m .scrim { -webkit-backdrop-filter: blur(18px) saturate(140%) brightness(.78); backdrop-filter: blur(18px) saturate(140%) brightness(.78); }
.m .pshell { -webkit-backdrop-filter: blur(28px) saturate(200%) brightness(1.06); backdrop-filter: blur(28px) saturate(200%) brightness(1.06); }
.m .pop { padding: 26px 20px 20px; border-radius: 32px;
  -webkit-mask-image: linear-gradient(180deg, transparent 0, #000 16px, #000 calc(100% - 16px), transparent); mask-image: linear-gradient(180deg, transparent 0, #000 16px, #000 calc(100% - 16px), transparent); }
.m .pop .grab { position: absolute; left: 50%; top: 7px; width: 38px; height: 5px; margin-left: -19px; border-radius: 99px; background: rgba(255, 255, 255, .26); pointer-events: none; }
.m .pop .ph { touch-action: none; }
.m .ph h2 { font-size: 25px; }
.m .ph p { font-size: 14px; }
.m .pcols { grid-template-columns: minmax(0, 1fr) !important; gap: 0; margin-top: 18px; }
.m .pcol + .pcol, .m .psec + .psec { margin-top: 24px; }
.m .pfull { margin-top: 18px; }
.m .tiles { display: grid; grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr)); gap: 12px; }
.m .tiles .tdiv { display: none; }
.m .tile { max-width: none; min-width: 0; }
.m .tile .tb { height: 132px; border-radius: 24px; }
.m .pop.one .tiles { grid-template-columns: 124px; justify-content: center; }
.m .pop.one .tile { max-width: none; }
.m .pop.one .tile .tb { height: 168px; border-radius: 28px; }
.m .crow { flex-direction: column; align-items: stretch; gap: 14px; }
.m .sws { justify-content: space-between; }
.m .ks { min-width: 0; flex: none; }
.m .wgrid { grid-template-columns: minmax(0, 1fr); gap: 0; margin-top: 16px; }
.m .wdays .sec.first { margin-top: 24px; }
.m .wbig .wi .ic { font-size: 50px; }
.m .wbig b { font-size: 66px; }
.m .hrs div { width: 54px; }
.m .pbtn { height: 46px; font-size: 14.5px; }
.m .dialw { gap: 8px; }
.m .dial { width: 190px; height: 178px; }
.m .dial .mid { top: 46px; }
.m .dial .mid b { font-size: 42px; }
.m .hvac button span { display: none; }
.m .toast { bottom: calc(86px + env(safe-area-inset-bottom, 0px)); }

/* touch: no hover frame "stuck" after tapping */
@media (hover: none) {
  .m .room:hover::after { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .11), inset 0 1px 0 rgba(255, 255, 255, .05); }
  .m .room.lit:hover::after { box-shadow: inset 0 0 0 1px rgba(var(--lc), .58), inset 0 0 calc(18 * var(--u)) rgba(var(--lc), .07); }
  .m .card.tap:hover { background: linear-gradient(160deg, rgba(46, 46, 54, .58), rgba(22, 23, 28, .64)); }
  .m .tabs button:not(.act):hover { background: none; }
  .m .lamp:hover, .m .dev:hover { transform: none; }
}
`;

Object.assign(GlassFloorplanCard.prototype, {
  _mobileInit() {
    // safe areas (home indicator / notch)
    const probe = mk('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    this._root.append(probe);
    this._safe = probe;
    const tabs = this.$('.tabs');
    if (tabs) {
      const n = this._M.layers.length;
      tabs.hidden = n < 2;
      tabs.style.setProperty('--tw', `${clamp(Math.floor((Math.min(window.innerWidth, 430) - 40) / Math.max(1, n)), 58, 96)}px`);
    }
    this._wireSheet();
  },

  /* width sets the scale (the plan may shrink a little so card + bar still fit on screen);
   * the layer card goes below the plan, room for the layer bar at the bottom */
  _layoutMobile(W) {
    const cs = this._safe ? getComputedStyle(this._safe) : null;
    this._safeB = cs ? parseFloat(cs.paddingBottom) || 0 : 0;
    const M = this._M, S = M.stage, D = M.D, B = M.bbox;
    const pad = clamp(Math.round(W * 0.022), 6, 18);
    const top = this.getBoundingClientRect().top + (window.scrollY || 0);
    const preview = this._inPreview();
    const avail = this._ev ? this._ev.h : preview ? 0 : Math.max(360, Math.floor(window.innerHeight - Math.max(0, top) - (this._inEditMode() ? 64 : 0)));
    const gH = this._M.layers.length ? 156 : 0, tabsH = M.layers.length > 1 ? 78 + this._safeB : 16, sy = 4;
    let pu = (W - 2 * pad) / S.w;
    if (avail) pu = Math.min(pu, Math.max(pu * 0.74, (avail - gH - 8 - tabsH - sy - 6 - (this._sideEl ? 106 : 0)) / S.h));
    const u = Math.min(pu * D, 0.62);
    pu = u / D;
    const sw = S.w * pu, sh = S.h * pu, sx = Math.round((W - sw) / 2);
    const rowH = this._sideEl ? 96 : 0;
    const gTop = Math.round(sy + sh + 8 + (rowH ? rowH + 10 : 0));
    const H = Math.max(avail, gTop + gH + tabsH);
    if (this._h !== H) { this._h = H; this.style.height = `${H}px`; }
    const s = this._root.style;
    s.setProperty('--u', `${u.toFixed(4)}px`);
    s.setProperty('--sw', `${sw.toFixed(1)}px`);
    s.setProperty('--sh', `${sh.toFixed(1)}px`);
    s.setProperty('--sx', `${sx}px`);
    s.setProperty('--sy', `${sy}px`);
    s.setProperty('--dx', `${(sx + (B[0] - S.x) * pu).toFixed(1)}px`);
    s.setProperty('--dy', `${(sy + (B[1] - S.y) * pu).toFixed(1)}px`);
    const g = 13 * u, l = sx + (B[0] - S.x) * pu + g / 2, w = (B[2] - B[0]) * pu - g;
    if (this._gcard) Object.assign(this._gcard.style, { left: `${l.toFixed(1)}px`, top: `${gTop}px`, width: `${w.toFixed(1)}px`, height: `${gH}px` });
    if (this._sideEl) Object.assign(this._sideEl.style, { left: `${l.toFixed(1)}px`, top: `${Math.round(sy + sh + 8)}px`, width: `${w.toFixed(1)}px`, height: `${rowH}px` });
    this._u = u;
    this._pu = pu;
    this._lv = { S, pu, sx, sy, H };
    this._placeKnob(true);
    this._fitLabels();
    this._declutter();
  },

  /* drag the sheet down by its header to close it (like on the iPhone) */
  _wireSheet() {
    const pop = this._pop, shell = this._shell, scrim = this._scrim;
    let st = null;
    const set = (dy) => {
      const tr = dy ? `translateY(${dy}px)` : '';
      pop.style.transform = shell.style.transform = tr;
      scrim.style.opacity = dy ? String(clamp(1 - dy / 420, 0.25, 1)) : '';
    };
    pop.addEventListener('pointerdown', (e) => {
      if (!this._m || !this._popOpen || e.button > 0 || !e.target.closest('.ph, .grab') || e.target.closest('button')) return;
      if ([pop, shell].some((el) => el.getAnimations().some((a) => a.playState === 'running'))) return;
      st = { y: e.clientY, t: performance.now(), dy: 0, id: e.pointerId, v: 0 };
      pop.setPointerCapture(e.pointerId);
    });
    pop.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      const raw = e.clientY - st.y, now = performance.now();
      const dy = raw > 0 ? raw : raw / 5;
      st.v = (dy - st.dy) / Math.max(1, now - st.t);
      st.t = now;
      st.dy = dy;
      set(dy);
    });
    const up = (e) => {
      if (!st || e.pointerId !== st.id) return;
      const { dy, v } = st;
      st = null;
      if (dy > 110 || (dy > 24 && v > 0.45)) { this._dismissSheet(dy); return; }
      if (!dy) return;
      set(0);
      const E = ease('snap', 'ease-out');
      for (const el of [pop, shell]) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: SPRINGS.snap.ms, easing: E });
      scrim.animate([{ opacity: clamp(1 - dy / 420, 0.25, 1) }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
    };
    pop.addEventListener('pointerup', up);
    pop.addEventListener('pointercancel', up);
  },

  _dismissSheet(dy) {
    if (!this._popOpen) return;
    const pop = this._pop, shell = this._shell, scrim = this._scrim, wrap = this._popWrap;
    this._popOpen = false;
    this._popRO?.disconnect();
    this._closeMenu();
    wrap.classList.remove('open');
    for (const el of [pop, shell, scrim]) el.getAnimations().forEach((an) => an.cancel());
    const dist = (this._O?.height || window.innerHeight) - (this._popT?.t || 0) + 24;
    const D = 380, E = 'cubic-bezier(.25, .7, .3, 1)';
    for (const el of [pop, shell]) el.animate([{ transform: `translateY(${dy}px)` }, { transform: `translateY(${dist}px)` }], { duration: D, easing: E, fill: 'forwards' });
    scrim.animate([{ opacity: scrim.style.opacity || 1 }, { opacity: 0 }], { duration: D, easing: 'ease-out', fill: 'forwards' });
    clearTimeout(this._popDoneT);
    this._popDoneT = setTimeout(() => {
      if (this._popOpen) return;
      for (const el of [pop, shell, scrim]) {
        el.getAnimations().forEach((an) => an.cancel());
        for (const p of ['transform', 'opacity', 'filter', 'backdropFilter', 'webkitBackdropFilter', 'backgroundColor']) el.style[p] = '';
      }
      wrap.classList.remove('vis');
      pop.innerHTML = '';
      this._upd = [];
      this._popKind = '';
    }, D + 40);
  },
});
