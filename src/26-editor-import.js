/* ================================================================== Floor plan editor: import / export of a floor plan file
 * The Claude skill turns a photo into a small JSON file ("glass-floorplan" format, centimetres): rooms with the names
 * read from the plan, windows, doors, the front door and furniture. The editor imports it (file or pasted text),
 * then rooms are linked to Home Assistant areas by name or by dragging. A whole card configuration works as well. */
const GFP_FORMAT = 'glass-floorplan';

/* text from a file or a chat answer → object (```json fences and text around it are ignored) */
function parsePlanText(text) {
  const s = String(text || '').trim();
  const tries = [s];
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) tries.push(fence[1]);
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) tries.push(s.slice(a, b + 1));
  for (const x of tries) { try { const o = JSON.parse(x); if (o && typeof o === 'object') return o; } catch (e) { /* next */ } }
  return null;
}

/* plan file or card configuration → what the editor can take over */
function readPlanData(o) {
  if (!o || typeof o !== 'object') return null;
  const rooms = (Array.isArray(o.rooms) ? o.rooms : []).map((r, i) => {
    const rect = normRect(r?.rect);
    if (!rect) return null;
    const room = { id: String(r.id || slug(r.name) || `room_${i + 1}`), name: String(r.name || `Room ${i + 1}`), rect: rect.map(r0) };
    if (r.area) room.area = String(r.area);
    if (r.label === 'bottom') room.label = 'bottom';
    const furn = (Array.isArray(r.furniture) ? r.furniture : []).map((f) => (normFurn(f) ? f : null)).filter(Boolean);
    if (furn.length) room.furniture = furn;
    return room;
  }).filter(Boolean);
  if (!rooms.length) return null;
  const segs = (k) => (Array.isArray(o[k]) ? o[k] : []).map(normSeg).filter(Boolean).map((s) => s.map(r0));
  const ents = (Array.isArray(o.entities) ? o.entities : []).map(normEntity).filter(Boolean)
    .map((e) => { const x = { entity: e.entity }; if (e.at) x.at = e.at.map(r0); if (e.icon) x.icon = e.icon; if (e.name) x.name = e.name; if (e.watt) x.watt = e.watt; if (e.beams) x.beams = e.beams; return x; });
  const ul = normRect(o.image_rect || o.underlay?.rect);
  return {
    isCard: String(o.type || '').includes(CARD_TAG),
    rooms, windows: segs('windows'), doors: segs('doors'), entrance: normSeg(o.entrance)?.map(r0) || null, entities: ents,
    estimated: o.format === GFP_FORMAT && o.scale !== 'measured', imageRect: ul ? ul.map(r0) : null, full: o,
  };
}

Object.assign(GfcEditor.prototype, {
  /* a dropped file: pictures become the template, JSON is imported */
  _readDropped(file) {
    if (!file) return;
    if (file.type.startsWith('image/')) this._readImage(file);
    else this._readPlanFile(file);
  },
  _readPlanFile(file) {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => this._importText(String(fr.result || ''));
    fr.readAsText(file);
  },
  _importText(text) {
    const d = readPlanData(parsePlanText(text));
    if (!d) { this._toast(t('ed_importBad')); return; }
    this._pending = d;
    this._pasting = false;
    this._tool = 'sketch';
    this._s = null;
    this._fit();
    this._draw();
    this._panel();
  },

  /* take the pending import over: the floor plan is replaced, placed devices and layers stay */
  _applyImport() {
    const d = this._pending;
    if (!d) return;
    this._pending = null;
    this._change(() => {
      const c = this._c;
      if (d.isCard) {
        // a whole card configuration: take everything
        const keepLang = c.language;
        for (const k of Object.keys(c)) delete c[k];
        Object.assign(c, normEditorConfig(deep(d.full)));
        if (keepLang && !c.language) c.language = keepLang;
      } else {
        c.rooms = d.rooms;
        c.windows = d.windows;
        c.doors = d.doors;
        if (d.entrance) c.entrance = d.entrance; else delete c.entrance;
        for (const e of d.entities) {
          const i = c.entities.findIndex((x) => x.entity === e.entity);
          if (i >= 0) Object.assign(c.entities[i], e); else c.entities.push(e);
        }
        if (d.imageRect) c.underlay = { ...(c.underlay || { opacity: 0.6 }), rect: d.imageRect };
        delete c.widgets;
      }
      this._tool = d.estimated ? 'sketch' : 'rooms';
    });
    this._scaleCheck = d.estimated && !d.isCard;
    this._fit();
    this._draw();
    this._panel();
    this._toast(t('ed_imported', d.rooms.length));
  },

  /* everything grows / shrinks around the top-left corner (wrong estimate of the size) */
  _rescale(k) {
    if (!(k > 0) || Math.abs(k - 1) < 0.001) return;
    const c = this._c, P = (p) => p && p.map((v) => r0(v * k)), R = (r) => r.map((v) => r0(v * k));
    this._change(() => {
      for (const r of c.rooms) { r.rect = R(r.rect); r.furniture = (r.furniture || []).map((f) => { const F = deep(f); setFurnRect(F, normFurn(f).r.map((v) => v * k)); return F; }); }
      c.windows = c.windows.map(R); c.doors = c.doors.map(R);
      if (c.entrance) c.entrance = R(c.entrance);
      for (const e of c.entities) if (e.at) e.at = P(e.at);
      if (c.door?.at) c.door.at = P(c.door.at);
      if (c.vacuum?.dock) c.vacuum.dock = P(c.vacuum.dock);
      if (c.underlay?.rect) c.underlay.rect = R(c.underlay.rect);
      if (c.widgets) for (const w of Object.keys(c.widgets)) if (Array.isArray(c.widgets[w])) c.widgets[w] = R(c.widgets[w]);
    });
    this._fit();
    this._draw();
  },

  /* the floor plan as a file (backup, sharing, a starting point for others) */
  _exportPlan() {
    const c = cleanConfig(this._c);
    const out = { format: GFP_FORMAT, version: 1, scale: 'measured', rooms: c.rooms || [], windows: c.windows || [], doors: c.doors || [], ...(c.entrance ? { entrance: c.entrance } : {}) };
    const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'grundriss.floorplan.json';
    this.shadowRoot.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },

  /* ---------------------------------------------------------------- panel parts (in the "Template" tool) */
  _importSection(I) {
    const d = this._pending;
    if (d) {
      const nf = d.rooms.reduce((n, r) => n + (r.furniture?.length || 0), 0);
      const box = this._el(`<b style="font-size:15px">${esc(t('ed_importReady'))}</b>
        <p class="small" style="margin:4px 0 0">${esc(t('ed_importSummary', d.rooms.length, d.doors.length, d.windows.length, nf))}</p>
        <p class="small" style="margin:6px 0 0;color:var(--t2)">${esc(d.rooms.map((r) => r.name).join(' · '))}</p>
        ${this._c.rooms.length && !d.isCard ? `<p class="small" style="margin:6px 0 0;color:rgb(var(--orange))">${esc(t('ed_importReplaces'))}</p>` : ''}`, 'ecard');
      box.style.boxShadow = 'inset 0 0 0 1.5px rgba(var(--blue), .7)';
      const row = mk('div', 'ebtns');
      row.append(this._btn(`${icon('check')}<span>${esc(t('ed_importApply'))}</span>`, 'blue', () => this._applyImport()), this._btn(esc(t('ed_cancel')), '', () => { this._pending = null; this._fit(); this._draw(); this._panel(); }));
      box.append(row);
      I.append(box);
      return;
    }
    if (this._scaleCheck) {
      const rooms = this._c.rooms;
      const big = rooms.slice().sort((a, b) => rectArea(b.rect) - rectArea(a.rect))[0];
      if (big) {
        let pick = rooms.indexOf(big), axis = 'w';
        const box = this._el(`<b style="font-size:15px">${esc(t('ed_scaleTitle'))}</b><p class="small" style="margin:4px 0 10px">${esc(t('ed_scaleText'))}</p>`, 'ecard');
        box.style.boxShadow = 'inset 0 0 0 1.5px rgba(var(--orange), .7)';
        const sel = mk('select', 'esel2');
        sel.innerHTML = rooms.map((r, i) => `<option value="${i}"${i === pick ? ' selected' : ''}>${esc(r.name)}</option>`).join('');
        const seg = this._segEl([['w', t('ed_width')], ['h', t('ed_depth')]], axis, (v) => { axis = v; seg.querySelectorAll('button').forEach((b) => b.classList.toggle('act', b.dataset.v === v)); upd(); });
        const inp = mk('input', 'einp num');
        inp.type = 'number'; inp.step = '0.01';
        const cur = () => { const r = rooms[pick].rect; return ((axis === 'w' ? r[2] - r[0] : r[3] - r[1]) / 100); };
        const upd = () => { inp.placeholder = fmt(cur(), 2); this._s = { t: 'room', i: pick, fresh: true }; this._draw(); };
        sel.addEventListener('change', () => { pick = +sel.value; upd(); });
        const apply = () => { const v = parseFloat(String(inp.value).replace(',', '.')); if (v > 0.3) { this._scaleCheck = false; this._s = null; this._rescale(v / cur()); this._toast(t('ed_measured')); this._panel(); } };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') apply(); });
        box.append(this._fieldEl('', sel), this._fieldEl('', seg));
        const row = mk('div', 'ebtns');
        row.append(inp, this._btn(`${icon('check')}<span>${esc(t('ed_apply'))}</span>`, 'blue', apply));
        box.append(row);
        const skip = mk('button', 'ebtn sm', esc(t('ed_scaleOk')));
        skip.style.marginTop = '8px';
        skip.addEventListener('click', () => { this._scaleCheck = false; this._s = null; this._tool = 'rooms'; this._draw(); this._panel(); });
        box.append(skip);
        I.append(box);
        upd();
      }
    }
    if (this._pasting) {
      const ta = mk('textarea', 'einp');
      ta.style.cssText = 'height:150px;padding:10px 12px;font:12px/1.4 ui-monospace,Menlo,monospace;resize:vertical';
      ta.placeholder = t('ed_pastePlaceholder');
      const row = mk('div', 'ebtns');
      row.append(this._btn(`${icon('check')}<span>${esc(t('ed_importRead'))}</span>`, 'blue', () => this._importText(ta.value)), this._btn(esc(t('ed_cancel')), '', () => { this._pasting = false; this._panel(); }));
      const box = mk('div', 'ecard');
      box.append(ta, row);
      I.append(box);
      requestAnimationFrame(() => ta.focus());
      return;
    }
    const file = mk('input');
    file.type = 'file'; file.accept = '.json,application/json,text/plain'; file.hidden = true;
    file.addEventListener('change', () => this._readPlanFile(file.files[0]));
    const box = this._el(`<div style="display:flex;align-items:center;gap:12px">${icon('sparkle')}<div><b style="font-size:14px">${esc(t('ed_importTitle'))}</b><div style="font-size:12px;color:var(--t3);margin-top:2px">${esc(t('ed_importSub'))}</div></div></div>`, 'ecard');
    box.querySelector('.ic').style.fontSize = '26px';
    const row = mk('div', 'ebtns');
    row.style.marginTop = '10px';
    row.append(this._btn(`${icon('copy')}<span>${esc(t('ed_importFile'))}</span>`, 'sm', () => file.click()), this._btn(`${icon('pencil')}<span>${esc(t('ed_importPaste'))}</span>`, 'sm', () => { this._pasting = true; this._panel(); }));
    box.append(file, row);
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('drop'); });
    box.addEventListener('dragleave', () => box.classList.remove('drop'));
    box.addEventListener('drop', (e) => { e.preventDefault(); box.classList.remove('drop'); this._readPlanFile(e.dataTransfer.files[0]); });
    I.append(box);
  },
});
