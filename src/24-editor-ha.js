/* ================================================================== Home Assistant card editor, automatic first setup, YAML */

/* A first floor plan from the Home Assistant areas: one room per area (with devices), packed edge to edge,
 * lights / thermostats / covers / media / temperature sensors placed inside. A starting point for the editor. */
function autoConfig(hass, { lang } = {}) {
  const h = hass || {};
  const areaOf = (id) => h.entities?.[id]?.area_id || h.devices?.[h.entities?.[id]?.device_id]?.area_id || null;
  const ok = (id) => {
    const st = h.states?.[id], d = domainOf(id), reg = h.entities?.[id];
    if (!st || reg?.hidden || reg?.entity_category) return false;
    if (['light', 'climate', 'cover', 'media_player', 'vacuum'].includes(d)) return !Array.isArray(st.attributes?.entity_id);
    return d === 'sensor' && st.attributes?.device_class === 'temperature';
  };
  const by = new Map();
  for (const id of Object.keys(h.states || {})) {
    if (!ok(id)) continue;
    const a = areaOf(id);
    if (!a || !h.areas?.[a]) continue;
    if (!by.has(a)) by.set(a, []);
    by.get(a).push(id);
  }
  // rooms with a thermostat don't need an extra temperature sensor marker
  for (const [a, ids] of by) if (ids.some((x) => domainOf(x) === 'climate')) by.set(a, ids.filter((x) => domainOf(x) !== 'sensor'));
  // every area becomes a room – a floor plan also has rooms without smart devices
  for (const a of Object.keys(h.areas || {})) if (!by.has(a)) by.set(a, []);
  const areas = [...by.keys()].sort((x, y) => String(h.areas[x].name).localeCompare(String(h.areas[y].name), lang || 'en')).slice(0, 20);
  const cols = Math.min(4, Math.max(1, Math.ceil(Math.sqrt(areas.length))));
  // bigger rooms for areas with many devices (rows share one height)
  const size = (a) => (by.get(a).filter((x) => domainOf(x) !== 'vacuum').length > 6 ? 520 : 420);
  const rooms = [], entities = [];
  let y = 0;
  for (let r = 0; r * cols < areas.length; r++) {
    const row = areas.slice(r * cols, r * cols + cols), H = Math.max(...row.map(size)) - 40;
    let x = 0;
    row.forEach((a, j) => {
    const W = size(a), rect = [x, y, x + W, y + H], i = r * cols + j;
    x += W;
    rooms.push({ id: slug(a) || `room_${i + 1}`, name: h.areas[a].name, area: a, rect });
    const taken = [];
    for (const id of by.get(a).filter((q) => domainOf(q) !== 'vacuum').sort()) {
      const at = freeSpot(rect, taken);
      taken.push(at);
      const e = { entity: id, at };
      if (domainOf(id) === 'light') e.icon = guessLampIcon(id, h.states[id]);
      entities.push(e);
    }
    });
    y += H;
  }
  const cfg = { type: `custom:${CARD_TAG}`, rooms, entities };
  const vac = Object.keys(h.states || {}).find((id) => domainOf(id) === 'vacuum' && h.entities?.[id]?.platform === 'roborock');
  if (vac && rooms.length) {
    const room = rooms.find((r) => r.area === areaOf(vac)) || rooms[rooms.length - 1];
    cfg.vacuum = { entity: vac, dock: freeSpot(room.rect, entities.filter((e) => inRect(room.rect, e.at)).map((e) => e.at)) };
  }
  return cfg;
}

/* Small YAML writer for the configuration (flow style for coordinates) */
function toYaml(data) {
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const sc = (x) => {
    if (typeof x === 'number' || typeof x === 'boolean') return String(x);
    if (x == null) return 'null';
    const s = String(x);
    return /^[\p{L}_][\p{L}\p{N}_.\-:/ ]*$/u.test(s) && !/^(true|false|null|yes|no|on|off|y|n|~)$/i.test(s) && s.trim() === s && !s.includes(': ') ? s : JSON.stringify(s);
  };
  const flat = (a) => a.every((x) => !isObj(x) && !Array.isArray(x));
  const flow = (a) => `[${a.map((x) => (Array.isArray(x) ? flow(x) : sc(x))).join(', ')}]`;
  const block = (v, ind) => {
    const pad = '  '.repeat(ind);
    if (Array.isArray(v)) {
      return v.map((x) => {
        if (isObj(x)) return `${pad}- ${block(x, ind + 1).slice((ind + 1) * 2)}`;
        return `${pad}- ${Array.isArray(x) ? flow(x) : sc(x)}`;
      }).join('\n');
    }
    return Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => {
      const key = `${pad}${sc(k)}:`;
      if (isObj(x)) return Object.keys(x).length ? `${key}\n${block(x, ind + 1)}` : `${key} {}`;
      if (Array.isArray(x)) {
        if (!x.length) return `${key} []`;
        if ((flat(x) || x.every((y) => Array.isArray(y) && flat(y))) && flow(x).length <= 100 - pad.length) return `${key} ${flow(x)}`;
        return `${key}\n${block(x, ind + 1)}`;
      }
      return `${key} ${sc(x)}`;
    }).join('\n');
  };
  return `${block(data, 0)}\n`;
}

/* ---------------------------------------------------------------- the card editor inside Home Assistant
 * Shows a small preview of the plan and opens the full screen floor plan editor. */
class GfcCardEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  setConfig(config) { this._config = config || {}; this._render(); }
  set hass(h) { const first = !this._hass; this._hass = h; if (first) this._render(); }
  get hass() { return this._hass; }

  _render() {
    if (!this._config) return;
    const h = this._hass, c = this._config;
    LANG = String(c.language && c.language !== 'auto' ? c.language : h?.locale?.language || h?.language || 'en').startsWith('de') ? 'de' : 'en';
    LOCALE = h?.locale?.language || LANG;
    const rooms = (c.rooms || []).filter((r) => normRect(r.rect));
    const B = bboxOf(rooms.map((r) => normRect(r.rect)));
    let svg = '';
    if (B) {
      const pad = 20, vb = `${B[0] - pad} ${B[1] - pad} ${B[2] - B[0] + 2 * pad} ${B[3] - B[1] + 2 * pad}`;
      const g = Math.sqrt((B[2] - B[0]) * (B[3] - B[1])) / 935 * 6.5;
      svg = `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${rooms.map((r) => { const q = normRect(r.rect); return `<rect x="${q[0] + g}" y="${q[1] + g}" width="${q[2] - q[0] - 2 * g}" height="${q[3] - q[1] - 2 * g}" rx="${g * 2}" class="rm"/>${(r.furniture || []).map(normFurn).filter(Boolean).map((f) => `<rect x="${f.r[0]}" y="${f.r[1]}" width="${f.r[2] - f.r[0]}" height="${f.r[3] - f.r[1]}" rx="${f.circle ? (f.r[2] - f.r[0]) / 2 : g}" class="fu"/>`).join('')}`; }).join('')}
        ${(c.entities || []).filter((e) => Array.isArray(e.at)).map((e) => `<circle cx="${e.at[0]}" cy="${e.at[1]}" r="${g * 2.6}" class="mk ${domainOf(e.entity)}"/>`).join('')}</svg>`;
    }
    const nDev = (c.entities || []).filter((e) => e.at).length;
    this.shadowRoot.innerHTML = `<style>
      :host { display: block; }
      .box { border-radius: 16px; overflow: hidden; background: #0d0e12; color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif; box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
      .pv { height: 220px; display: grid; place-items: center; padding: 14px; background: radial-gradient(80% 80% at 20% 0%, rgba(46, 64, 120, .35), transparent 70%), radial-gradient(60% 60% at 90% 100%, rgba(120, 80, 40, .25), transparent 70%); }
      .pv svg { width: 100%; height: 100%; }
      .rm { fill: rgba(255,255,255,.06); stroke: rgba(255,255,255,.28); stroke-width: 2; vector-effect: non-scaling-stroke; }
      .fu { fill: rgba(255,255,255,.06); stroke: rgba(255,255,255,.14); stroke-width: 1; vector-effect: non-scaling-stroke; }
      .mk { fill: rgba(255,255,255,.5); } .mk.light { fill: #f6c859; } .mk.climate { fill: #ff9a4a; } .mk.cover { fill: #cfe2ff; } .mk.media_player { fill: #96b9ff; }
      .empty { font-size: 14px; color: rgba(235,235,245,.6); text-align: center; line-height: 1.5; max-width: 320px; }
      .body { padding: 16px 18px 18px; }
      .body p { margin: 0 0 14px; font-size: 13.5px; line-height: 1.45; color: rgba(235,235,245,.66); }
      .stats { font-size: 13px; font-weight: 600; color: rgba(235,235,245,.85); margin-bottom: 8px; }
      button { width: 100%; height: 46px; border: 0; border-radius: 14px; font: inherit; font-size: 15px; font-weight: 650; cursor: pointer; color: #0c0c0e; background: linear-gradient(180deg, #fff, #e9e9ee); box-shadow: 0 6px 18px rgba(0,0,0,.35); display: flex; align-items: center; justify-content: center; gap: 8px; }
      button:active { transform: scale(.98); }
      svg.ic { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
    </style>
    <div class="box"><div class="pv">${svg || `<div class="empty">${esc(t('ed_ha_empty'))}</div>`}</div>
      <div class="body">${rooms.length ? `<div class="stats">${esc(t('ed_summary', rooms.length, nDev))}</div>` : ''}<p>${esc(t('ed_ha_lead'))}</p>
      <button class="open"><svg class="ic" viewBox="0 0 24 24">${ICONS.pencil}</svg>${esc(t('ed_ha_open'))}</button></div></div>`;
    this.shadowRoot.querySelector('.open').addEventListener('click', () => this._open());
  }

  /* the editor lives inside this element: inside Home Assistant's own (modal) edit dialog it stays usable,
   * its <dialog> still covers the whole screen (top layer) */
  _open() {
    const ed = document.createElement('glass-floorplan-editor');
    this.shadowRoot.append(ed);
    ed.open({
      config: this._config,
      hass: () => this._hass,
      onSave: (cfg) => {
        this._config = cfg;
        this._render();
        fire(this, 'config-changed', { config: cfg });
      },
    });
  }
}

/* ---------------------------------------------------------------- editor texts */
Object.assign(STR.en, {
  ed_selected: 'Selected', ed_ulAligned: 'Template placed exactly under the imported plan', ed_importBad: 'No floor plan found in this file / text', ed_imported: (n) => `${n} ${pl(n, 'room', 'rooms')} imported`, ed_importReady: 'Floor plan ready to import', ed_importSummary: (r, d, w, f) => `${r} ${pl(r, 'room', 'rooms')} · ${d} ${pl(d, 'passage', 'passages')} · ${w} ${pl(w, 'window', 'windows')} · ${f} pieces of furniture`, ed_importReplaces: 'Replaces the rooms drawn so far – placed devices stay.', ed_importApply: 'Import', ed_scaleTitle: 'Check the size', ed_scaleText: 'The size was estimated from the picture. Enter one real length and everything is adjusted.', ed_scaleOk: 'Size is right', ed_pastePlaceholder: 'Paste the answer or the file content from Claude here …', ed_importRead: 'Read', ed_importTitle: 'Import a floor plan file', ed_importSub: 'e.g. from the Claude skill – file or pasted text', ed_importFile: 'Choose file', ed_importPaste: 'Paste text', ed_export: 'Save floor plan as file', ed_roomList: 'Rooms', ed_areasHead: 'Home Assistant areas', ed_areasHelp: 'Drag an area onto its room – the name and the devices come along.', ed_withDevices: 'Place the area’s devices too', ed_assigned: (r) => `“${r}” linked`, ed_assignedPlaced: (r, n) => `“${r}” linked · ${n} ${pl(n, 'device', 'devices')} placed`, ed_areaDrag: 'Drag the area onto a room on the plan', ed_areaDropRoom: 'Drop the area onto a room', ed_areaIn: (r) => `Linked with ${r}`, ed_noAreaYet: 'no area yet', ed_matchByName: (n) => `Link ${n} ${pl(n, 'room', 'rooms')} by name`, ed_matched: (n) => `${n} ${pl(n, 'room', 'rooms')} linked by name`, ed_detectedAreas: (n, d) => `${n} ${pl(n, 'room', 'rooms')} and ${d} ${pl(d, 'passage', 'passages')} found – now drag your areas onto them`, ed_invert: 'Invert colours', ed_detect: 'Find rooms automatically', ed_detectHelp: 'Set the scale first (Measure). Works best with clean plans – check the result and adjust the rooms.', ed_detectFail: 'The picture could not be analysed', ed_detectNone: 'No rooms found – draw them by hand', ed_detectNothingNew: 'No new rooms found', ed_detected: (n, d) => `${n} ${pl(n, 'room', 'rooms')} and ${d} ${pl(d, 'passage', 'passages')} found – now name them`, ed_title: 'Floor plan', ed_undo: 'Undo', ed_redo: 'Redo', ed_preview: 'Preview', ed_cancel: 'Cancel', ed_done: 'Done', ed_fit: 'Fit to screen',
  ed_summary: (r, d) => `${r} ${pl(r, 'room', 'rooms')} · ${d} ${pl(d, 'device', 'devices')}`,
  ed_tool_sketch: 'Template', ed_tool_rooms: 'Rooms', ed_tool_furniture: 'Furniture', ed_tool_openings: 'Windows & doors', ed_tool_devices: 'Devices', ed_tool_layers: 'Layers', ed_tool_tiles: 'Tiles', ed_tool_settings: 'Settings',
  ed_room: 'Room', ed_open_window: 'Window', ed_open_door: 'Passage', ed_open_entrance: 'Front door',
  ed_tile_card: 'Layer card', ed_tile_weather: 'Weather', ed_tile_indoor: 'Inside', ed_tile_door: 'Front door', ed_tile_bar: 'Layer bar',
  ed_hint_measure1: 'Click the start of a wall whose length you know', ed_hint_measure2: 'Now click the end of that wall', ed_hint_measure3: 'Enter the real length on the right',
  ed_hint_rooms: 'Drag to draw a room (also across others) · tap a room, then drag it to move · edges snap to each other', ed_hint_rooms0: 'Drag a rectangle to draw your first room – or start from your Home Assistant areas',
  ed_hint_open_window: 'Click on an outer wall to add a window', ed_hint_open_door: 'Click on a wall between two rooms to add a passage', ed_hint_open_entrance: 'Click on the wall with your front door',
  ed_hint_furniture: 'Drag furniture from the right into a room · R rotates · ⌫ deletes', ed_hint_devices: 'Drag devices from the list onto the plan – or let them be placed in their room',
  ed_hint_tiles: 'Drag the tiles where you like them', ed_hint_sketch: 'Drag the picture to move it, the corners to scale it',
  ed_needRoom: 'Draw a room first', ed_placed: (n) => `${n} ${pl(n, 'device', 'devices')} placed`, ed_ulNotStored: 'The picture is too large to keep in this browser',
  ed_ulLoaded: 'Template loaded – now set its size and trace the rooms', ed_measured: 'Scale set', ed_prev_laptop: 'Laptop', ed_prev_phone: 'Phone',
  ed_sketch_lead: 'Start with a photo, screenshot or sketch of your floor plan. Set its scale, then trace the rooms on top.',
  ed_ulReplace: 'Replace picture', ed_ulPick: 'Choose a picture', ed_ulDrop: 'or drop it here – JPG, PNG, screenshot', ed_opacity: 'Visibility', ed_ulWidth: 'Width of the picture (m)',
  ed_measure_len: 'How long is this distance in reality (m)?', ed_apply: 'Apply', ed_measure: 'Measure', ed_measure_stop: 'Stop measuring', ed_ulRemove: 'Remove',
  ed_ulNote: 'The template is only kept in this browser and never shown on the dashboard.', ed_quick: 'Quick start', ed_fromAreas: 'Rooms from Home Assistant areas',
  ed_example: 'Load example flat', ed_exampleLoaded: 'Example loaded', ed_clear: 'Start over', ed_claudeTip: 'Tip: hard-to-read photo or sketch? The Claude skill from the project page turns it into a floor plan file for “Import”.',
  ed_noAreas: 'No areas with devices found', ed_areasDone: 'All areas already have a room', ed_areasAdded: (n) => `${n} ${pl(n, 'room', 'rooms')} added – now arrange them`,
  ed_rooms_lead: 'Drag a rectangle on the plan for each room. Rooms snap to each other, so walls line up by themselves.', ed_rooms_empty: 'No rooms yet.',
  ed_name: 'Name', ed_area: 'Home Assistant area', ed_noArea: '— none —', ed_area_help: 'Used for the vacuum and to place this area’s devices automatically.',
  ed_label: 'Room name', ed_top: 'Top', ed_bottom: 'Bottom', ed_width: 'Width (m)', ed_depth: 'Depth (m)', ed_area_m2: (v) => `Floor area ≈ ${v} m²`,
  ed_placeArea: (n) => `Place ${n} ${pl(n, 'device', 'devices')} of this area`, ed_duplicate: 'Duplicate', ed_delete: 'Delete',
  ed_furn_drag: 'Drag into a room or click', ed_furn_lead: 'Purely for the looks: drag a piece into a room or tap it to add it to the selected room. Resize with the handles, R rotates.',
  ed_kind: 'Kind', ed_widthCm: 'Width (cm)', ed_depthCm: 'Depth (cm)', ed_rotate: 'Rotate', ed_moreFurniture: 'Add more',
  ed_open_lead_window: 'Hover over an outer wall and click – the window snaps onto the wall. Windows let daylight in and show your covers.',
  ed_open_lead_door: 'Click on the wall between two rooms. Passages are drawn as glass bridges and show the vacuum its way.',
  ed_open_lead_entrance: 'Click on the wall with your front door. It glows green when the door is opened.',
  ed_open_counts: (w, d, e) => `${w} ${pl(w, 'window', 'windows')} · ${d} ${pl(d, 'passage', 'passages')} · ${e ? 'front door set' : 'no front door'}`,
  ed_lengthCm: 'Length (cm)', ed_open_move: 'Drag it along the wall, the round handles change its length.',
  ed_ownLayer: 'Own layer', ed_dev_lead: 'Pick a layer, then drag devices onto the plan. Lamps, sensors and switches get the symbol you choose.',
  ed_search: 'Search devices …', ed_autoAll: (n) => `Place ${n} ${pl(n, 'device', 'devices')} automatically`, ed_noAreaGroup: 'Without area', ed_noMatch: 'Nothing found.', ed_noEntities: 'No matching devices in Home Assistant.',
  ed_customDevHint: (n) => `Devices you add here appear in the layer “${n}”.`, ed_showOnPlan: 'Show on the plan', ed_add: 'Place on the plan',
  ed_doorOpen: 'Door opener (button / lock)', ed_none: '— none —', ed_doorBell: 'Doorbell (event / sensor)', ed_doorPlace: 'Place the door button', ed_doorHelp: 'The door opens only after sliding all the way – never by accident.',
  ed_removeMarker: 'Remove from plan', ed_vac_lead: 'Works with every Roborock vacuum: pick it, place its station and check which robot room is which room.',
  ed_vac_entity: 'Vacuum', ed_notRoborock: 'not Roborock', ed_dockPlace: 'Place the station', ed_dockMove: 'Drag the station marker to where it stands.',
  ed_vac_rooms: 'Robot rooms', ed_vac_noRooms: 'The robot has not reported its rooms yet.', ed_auto: 'Automatic', ed_notUsed: 'not on the plan',
  ed_vac_area: 'Cleaning uses the Home Assistant areas of the rooms (vacuum.clean_area) or, if missing, the Roborock room ids.', ed_dock: 'Station',
  ed_missingEntity: 'This entity does not exist in Home Assistant (any more).', ed_icon: 'Symbol', ed_lampOptions: 'Lamp', ed_watt: 'Power (W)', ed_beams: 'Light cones',
  ed_glow: 'Glow', ed_kelvin: 'Light colour (K)', ed_planButton: 'Button on the plan', ed_estimate: 'Estimate from power', ed_powerSensor: 'Power sensor',
  ed_inLayers: 'In own layers', ed_viaKind: 'Shown through the layer’s categories', ed_removeFromPlan: 'Remove from plan', ed_outside: 'This marker is outside of all rooms.',
  ed_layerName: 'Layer', ed_layers_lead: 'The symbols next to the plan. Built-in layers show one category – own layers combine categories and any devices.',
  ed_up: 'Up', ed_down: 'Down', ed_edit: 'Edit', ed_layers_help: 'Order = order of the symbols. A layer only appears when it has something to show.',
  ed_layerDesc_light: 'Lights, front door', ed_layerDesc_climate: 'Thermostats, temperatures', ed_layerDesc_cover: 'Shutters, blinds', ed_layerDesc_vacuum: 'Roborock vacuum',
  ed_layerEmpty: 'Nothing chosen yet', ed_layerShows: 'Shows all', ed_layerShowsHelp: 'Pick whole categories – plus any single devices below.',
  ed_layerDevices: (n) => `More devices (${n})`, ed_addDevices: 'Add devices', ed_kind_media: 'Media',
  ed_tiles_lead: 'Weather, inside climate, front door and the layer card arrange themselves in free corners of your plan. Drag them to put them elsewhere.',
  ed_autoArrange: 'Arrange automatically', ed_tileManual: 'Placed by you.', ed_tileAuto: 'Placed automatically – drag it to change.',
  ed_language: 'Language', ed_weather: 'Weather', ed_layout: 'Layout', ed_layout_help: 'Automatic: phone layout below 700 px card width.', ed_rotate_phone: 'Turn the plan on phones',
  ed_height: 'Height', ed_fit_screen: 'Fill the screen', ed_fit_width: 'By width', ed_modesLabel: 'Label for Mode', ed_modes_help: 'Scenes and scripts with this label appear under “Mode”.',
  ed_ha_open: 'Open floor plan editor', ed_ha_lead: 'Draw rooms, furniture, windows and doors, then drag your devices onto the plan – everything is saved in this card.',
  ed_ha_empty: 'No floor plan yet. Open the editor and draw your home – a photo of your floor plan helps.',
  furn_sofa: 'Sofa', furn_armchair: 'Armchair', furn_bed: 'Bed', furn_bed_single: 'Single bed', furn_table: 'Table', furn_round_table: 'Round table', furn_chair: 'Chair', furn_desk: 'Desk',
  furn_wardrobe: 'Wardrobe', furn_shelf: 'Shelf', furn_sideboard: 'Sideboard', furn_tv: 'TV', furn_counter: 'Kitchen', furn_fridge: 'Fridge', furn_bath: 'Bathtub', furn_shower: 'Shower',
  furn_toilet: 'Toilet', furn_sink: 'Sink', furn_washer: 'Washer', furn_plant: 'Plant', furn_rug: 'Rug', furn_stairs: 'Stairs', furn_block: 'Block',
  ed_discardTitle: 'Discard changes?', ed_discardText: 'What you changed in the floor plan editor is not kept.', ed_discard: 'Discard', ed_keepEditing: 'Keep editing',
  ed_extras: 'More entities', ed_extrasNone: 'None yet – add any device that should also appear here.', ed_addEntity: 'Add an entity', ed_extrasHelp: (n) => `Any entity can join “${n}”, e.g. a TV, a switch or a sensor. It is placed in its room.`,
  ed_addEntityTo: (n) => `Add to “${n}”`, ed_pickLead: 'Tap an entity to add it to the layer – it lands in its room on the plan. Tap again to remove it.', ed_searchAll: 'Search entities, areas, labels …',
  ed_inLayerByKind: 'part of this layer anyway', ed_removeFromLayer: 'Remove from this layer', ed_addedTo: (e, l) => `“${e}” added to ${l}`,
  ed_reset: 'Start over', ed_resetTitle: 'Start over?', ed_resetText: 'Rooms, furniture, windows, devices, layers and the template are removed. You can still undo it.', ed_resetDone: 'Everything removed – start with a template or draw your rooms',
  ed_lightPreview: 'Show the lights', ed_light_on: 'On', ed_light_off: 'Off', ed_light_real: 'Real',
  ed_hint_layers: 'The layer bar of your card – tap a layer on the right to see it', ed_tiles_phone: 'On a phone the tiles arrange themselves – switch to Laptop to move them',
  ed_byArea: 'By area', ed_byLabel: 'By label', ed_noLabelGroup: 'Without label', ed_foldAll: 'Fold all', ed_unfoldAll: 'Unfold all',
  ed_removeFromLayers: 'Remove from all layers', ed_deleteLayer: 'Delete layer', ed_layerEditLead: 'What this layer shows: whole categories and single devices.',
});
Object.assign(STR.de, {
  ed_selected: 'Ausgewählt', ed_ulAligned: 'Vorlage liegt genau unter dem importierten Plan', ed_importBad: 'In dieser Datei / diesem Text wurde kein Grundriss gefunden', ed_imported: (n) => `${n} ${pl(n, 'Raum', 'Räume')} importiert`, ed_importReady: 'Grundriss bereit zum Import', ed_importSummary: (r, d, w, f) => `${r} ${pl(r, 'Raum', 'Räume')} · ${d} ${pl(d, 'Durchgang', 'Durchgänge')} · ${w} Fenster · ${f} Möbel`, ed_importReplaces: 'Ersetzt die bisher gezeichneten Räume – platzierte Geräte bleiben.', ed_importApply: 'Importieren', ed_scaleTitle: 'Größe prüfen', ed_scaleText: 'Die Größe wurde aus dem Bild geschätzt. Gib eine echte Länge ein, dann wird alles angepasst.', ed_scaleOk: 'Größe stimmt', ed_pastePlaceholder: 'Antwort oder Dateiinhalt von Claude hier einfügen …', ed_importRead: 'Einlesen', ed_importTitle: 'Grundriss-Datei importieren', ed_importSub: 'z. B. vom Claude-Skill – Datei oder eingefügter Text', ed_importFile: 'Datei wählen', ed_importPaste: 'Text einfügen', ed_export: 'Grundriss als Datei sichern', ed_roomList: 'Räume', ed_areasHead: 'Home-Assistant-Bereiche', ed_areasHelp: 'Ziehe einen Bereich auf seinen Raum – Name und Geräte kommen mit.', ed_withDevices: 'Geräte des Bereichs gleich platzieren', ed_assigned: (r) => `„${r}“ verknüpft`, ed_assignedPlaced: (r, n) => `„${r}“ verknüpft · ${n} ${pl(n, 'Gerät', 'Geräte')} platziert`, ed_areaDrag: 'Ziehe den Bereich auf einen Raum im Plan', ed_areaDropRoom: 'Den Bereich auf einen Raum ziehen', ed_areaIn: (r) => `Verknüpft mit ${r}`, ed_noAreaYet: 'noch kein Bereich', ed_matchByName: (n) => `${n} ${pl(n, 'Raum', 'Räume')} nach Namen verknüpfen`, ed_matched: (n) => `${n} ${pl(n, 'Raum', 'Räume')} nach Namen verknüpft`, ed_detectedAreas: (n, d) => `${n} ${pl(n, 'Raum', 'Räume')} und ${d} ${pl(d, 'Durchgang', 'Durchgänge')} erkannt – jetzt deine Bereiche auf die Räume ziehen`, ed_invert: 'Farben umkehren', ed_detect: 'Räume automatisch erkennen', ed_detectHelp: 'Vorher den Maßstab setzen (Ausmessen). Klappt am besten mit sauberen Plänen – Ergebnis prüfen und Räume anpassen.', ed_detectFail: 'Das Bild konnte nicht ausgewertet werden', ed_detectNone: 'Keine Räume gefunden – bitte von Hand zeichnen', ed_detectNothingNew: 'Keine neuen Räume gefunden', ed_detected: (n, d) => `${n} ${pl(n, 'Raum', 'Räume')} und ${d} ${pl(d, 'Durchgang', 'Durchgänge')} erkannt – jetzt benennen`, ed_title: 'Grundriss', ed_undo: 'Rückgängig', ed_redo: 'Wiederholen', ed_preview: 'Vorschau', ed_cancel: 'Abbrechen', ed_done: 'Fertig', ed_fit: 'Einpassen',
  ed_summary: (r, d) => `${r} ${pl(r, 'Raum', 'Räume')} · ${d} ${pl(d, 'Gerät', 'Geräte')}`,
  ed_tool_sketch: 'Vorlage', ed_tool_rooms: 'Räume', ed_tool_furniture: 'Möbel', ed_tool_openings: 'Fenster & Türen', ed_tool_devices: 'Geräte', ed_tool_layers: 'Ebenen', ed_tool_tiles: 'Kacheln', ed_tool_settings: 'Optionen',
  ed_room: 'Raum', ed_open_window: 'Fenster', ed_open_door: 'Durchgang', ed_open_entrance: 'Haustür',
  ed_tile_card: 'Ebenen-Karte', ed_tile_weather: 'Wetter', ed_tile_indoor: 'Innen', ed_tile_door: 'Haustür', ed_tile_bar: 'Ebenen-Leiste',
  ed_hint_measure1: 'Klicke auf den Anfang einer Wand, deren Länge du kennst', ed_hint_measure2: 'Jetzt auf das Ende dieser Wand klicken', ed_hint_measure3: 'Rechts die echte Länge eingeben',
  ed_hint_rooms: 'Ziehen = neuer Raum (auch über anderen) · Raum antippen, dann ziehen = verschieben · Kanten rasten ein', ed_hint_rooms0: 'Ziehe ein Rechteck für deinen ersten Raum – oder starte mit deinen Home-Assistant-Bereichen',
  ed_hint_open_window: 'Klicke auf eine Außenwand, um ein Fenster zu setzen', ed_hint_open_door: 'Klicke auf die Wand zwischen zwei Räumen für einen Durchgang', ed_hint_open_entrance: 'Klicke auf die Wand mit deiner Haustür',
  ed_hint_furniture: 'Möbel von rechts in einen Raum ziehen · R dreht · ⌫ löscht', ed_hint_devices: 'Geräte aus der Liste auf den Plan ziehen – oder automatisch in ihren Raum setzen lassen',
  ed_hint_tiles: 'Kacheln an die gewünschte Stelle ziehen', ed_hint_sketch: 'Bild ziehen zum Verschieben, Ecken ziehen zum Skalieren',
  ed_needRoom: 'Zeichne zuerst einen Raum', ed_placed: (n) => `${n} ${pl(n, 'Gerät', 'Geräte')} platziert`, ed_ulNotStored: 'Das Bild ist zu groß, um es in diesem Browser zu behalten',
  ed_ulLoaded: 'Vorlage geladen – jetzt Maßstab setzen und Räume nachzeichnen', ed_measured: 'Maßstab gesetzt', ed_prev_laptop: 'Laptop', ed_prev_phone: 'Handy',
  ed_sketch_lead: 'Starte mit einem Foto, Screenshot oder einer Skizze deines Grundrisses. Maßstab setzen, dann die Räume darüber nachzeichnen.',
  ed_ulReplace: 'Bild ersetzen', ed_ulPick: 'Bild auswählen', ed_ulDrop: 'oder hierher ziehen – JPG, PNG, Screenshot', ed_opacity: 'Sichtbarkeit', ed_ulWidth: 'Breite des Bildes (m)',
  ed_measure_len: 'Wie lang ist diese Strecke in echt (m)?', ed_apply: 'Übernehmen', ed_measure: 'Ausmessen', ed_measure_stop: 'Messen beenden', ed_ulRemove: 'Entfernen',
  ed_ulNote: 'Die Vorlage bleibt nur in diesem Browser und erscheint nie im Dashboard.', ed_quick: 'Schnellstart', ed_fromAreas: 'Räume aus Home-Assistant-Bereichen',
  ed_example: 'Beispielwohnung laden', ed_exampleLoaded: 'Beispiel geladen', ed_clear: 'Neu beginnen', ed_claudeTip: 'Tipp: Schwer lesbares Foto oder Skizze? Der Claude-Skill von der Projektseite macht daraus eine Grundriss-Datei zum Importieren.',
  ed_noAreas: 'Keine Bereiche mit Geräten gefunden', ed_areasDone: 'Alle Bereiche haben schon einen Raum', ed_areasAdded: (n) => `${n} ${pl(n, 'Raum', 'Räume')} angelegt – jetzt anordnen`,
  ed_rooms_lead: 'Ziehe für jeden Raum ein Rechteck auf. Räume rasten aneinander ein, so passen die Wände von selbst.', ed_rooms_empty: 'Noch keine Räume.',
  ed_name: 'Name', ed_area: 'Bereich in Home Assistant', ed_noArea: '— keiner —', ed_area_help: 'Für den Saugroboter und um die Geräte dieses Bereichs automatisch zu platzieren.',
  ed_label: 'Raumname', ed_top: 'Oben', ed_bottom: 'Unten', ed_width: 'Breite (m)', ed_depth: 'Tiefe (m)', ed_area_m2: (v) => `Fläche ≈ ${v} m²`,
  ed_placeArea: (n) => `${n} ${pl(n, 'Gerät', 'Geräte')} dieses Bereichs platzieren`, ed_duplicate: 'Duplizieren', ed_delete: 'Löschen',
  ed_furn_drag: 'In einen Raum ziehen oder antippen', ed_furn_lead: 'Rein fürs Auge: Möbel in einen Raum ziehen oder antippen (landet im gewählten Raum). Größe über die Griffe, R dreht.',
  ed_kind: 'Art', ed_widthCm: 'Breite (cm)', ed_depthCm: 'Tiefe (cm)', ed_rotate: 'Drehen', ed_moreFurniture: 'Weitere hinzufügen',
  ed_open_lead_window: 'Mit der Maus über eine Außenwand fahren und klicken – das Fenster rastet auf der Wand ein. Fenster lassen Tageslicht herein und zeigen die Rollläden.',
  ed_open_lead_door: 'Auf die Wand zwischen zwei Räumen klicken. Durchgänge erscheinen als Glasbrücken und zeigen dem Saugroboter den Weg.',
  ed_open_lead_entrance: 'Auf die Wand mit deiner Haustür klicken. Sie leuchtet grün, wenn die Tür geöffnet wurde.',
  ed_open_counts: (w, d, e) => `${w} Fenster · ${d} ${pl(d, 'Durchgang', 'Durchgänge')} · ${e ? 'Haustür gesetzt' : 'keine Haustür'}`,
  ed_lengthCm: 'Länge (cm)', ed_open_move: 'Entlang der Wand ziehen, die runden Griffe ändern die Länge.',
  ed_ownLayer: 'Eigene Ebene', ed_dev_lead: 'Ebene wählen, dann Geräte auf den Plan ziehen. Lampen, Sensoren und Schalter bekommen das Symbol, das du auswählst.',
  ed_search: 'Geräte suchen …', ed_autoAll: (n) => `${n} ${pl(n, 'Gerät', 'Geräte')} automatisch platzieren`, ed_noAreaGroup: 'Ohne Bereich', ed_noMatch: 'Nichts gefunden.', ed_noEntities: 'Keine passenden Geräte in Home Assistant.',
  ed_customDevHint: (n) => `Geräte, die du hier hinzufügst, erscheinen in der Ebene „${n}“.`, ed_showOnPlan: 'Im Plan zeigen', ed_add: 'Auf den Plan setzen',
  ed_doorOpen: 'Türöffner (Taste / Schloss)', ed_none: '— keiner —', ed_doorBell: 'Klingel (Ereignis / Sensor)', ed_doorPlace: 'Tür-Knopf platzieren', ed_doorHelp: 'Die Tür öffnet erst, wenn ganz durchgeschoben wurde – nie aus Versehen.',
  ed_removeMarker: 'Vom Plan entfernen', ed_vac_lead: 'Funktioniert mit jedem Roborock: auswählen, Station platzieren und prüfen, welcher Roboter-Raum welcher Raum ist.',
  ed_vac_entity: 'Saugroboter', ed_notRoborock: 'kein Roborock', ed_dockPlace: 'Station platzieren', ed_dockMove: 'Die Station dorthin ziehen, wo sie steht.',
  ed_vac_rooms: 'Roboter-Räume', ed_vac_noRooms: 'Der Roboter hat seine Räume noch nicht gemeldet.', ed_auto: 'Automatisch', ed_notUsed: 'nicht im Plan',
  ed_vac_area: 'Gereinigt wird über die Home-Assistant-Bereiche der Räume (vacuum.clean_area) oder, falls die fehlen, über die Roborock-Raum-IDs.', ed_dock: 'Station',
  ed_missingEntity: 'Diese Entität gibt es in Home Assistant (nicht mehr).', ed_icon: 'Symbol', ed_lampOptions: 'Lampe', ed_watt: 'Leistung (W)', ed_beams: 'Lichtkegel',
  ed_glow: 'Schein', ed_kelvin: 'Lichtfarbe (K)', ed_planButton: 'Knopf im Plan', ed_estimate: 'Aus Leistung schätzen', ed_powerSensor: 'Leistungssensor',
  ed_inLayers: 'In eigenen Ebenen', ed_viaKind: 'Über die Kategorien der Ebene enthalten', ed_removeFromPlan: 'Vom Plan entfernen', ed_outside: 'Dieser Knopf liegt außerhalb aller Räume.',
  ed_layerName: 'Ebene', ed_layers_lead: 'Die Symbole neben dem Plan. Eingebaute Ebenen zeigen eine Kategorie – eigene Ebenen kombinieren Kategorien und beliebige Geräte.',
  ed_up: 'Nach oben', ed_down: 'Nach unten', ed_edit: 'Bearbeiten', ed_layers_help: 'Reihenfolge = Reihenfolge der Symbole. Eine Ebene erscheint nur, wenn sie etwas zu zeigen hat.',
  ed_layerDesc_light: 'Lichter, Haustür', ed_layerDesc_climate: 'Thermostate, Temperaturen', ed_layerDesc_cover: 'Rollläden, Jalousien', ed_layerDesc_vacuum: 'Roborock-Saugroboter',
  ed_layerEmpty: 'Noch nichts gewählt', ed_layerShows: 'Zeigt alle', ed_layerShowsHelp: 'Ganze Kategorien wählen – plus einzelne Geräte darunter.',
  ed_layerDevices: (n) => `Weitere Geräte (${n})`, ed_addDevices: 'Geräte hinzufügen', ed_kind_media: 'Medien',
  ed_tiles_lead: 'Wetter, Innenklima, Haustür und die Ebenen-Karte ordnen sich in freien Ecken deines Plans an. Zum Umsetzen einfach ziehen.',
  ed_autoArrange: 'Automatisch anordnen', ed_tileManual: 'Von dir platziert.', ed_tileAuto: 'Automatisch platziert – zum Ändern ziehen.',
  ed_language: 'Sprache', ed_weather: 'Wetter', ed_layout: 'Darstellung', ed_layout_help: 'Automatisch: Handy-Ansicht unter 700 px Kartenbreite.', ed_rotate_phone: 'Plan am Handy drehen',
  ed_height: 'Höhe', ed_fit_screen: 'Bildschirm füllen', ed_fit_width: 'Nach Breite', ed_modesLabel: 'Label für Mode', ed_modes_help: 'Szenen und Skripte mit diesem Label erscheinen unter „Mode“.',
  ed_ha_open: 'Grundriss-Editor öffnen', ed_ha_lead: 'Räume, Möbel, Fenster und Türen zeichnen, dann deine Geräte auf den Plan ziehen – alles wird in dieser Karte gespeichert.',
  ed_ha_empty: 'Noch kein Grundriss. Öffne den Editor und zeichne deine Wohnung – ein Foto deines Grundrisses hilft.',
  furn_sofa: 'Sofa', furn_armchair: 'Sessel', furn_bed: 'Bett', furn_bed_single: 'Einzelbett', furn_table: 'Tisch', furn_round_table: 'Runder Tisch', furn_chair: 'Stuhl', furn_desk: 'Schreibtisch',
  furn_wardrobe: 'Schrank', furn_shelf: 'Regal', furn_sideboard: 'Kommode', furn_tv: 'Fernseher', furn_counter: 'Küche', furn_fridge: 'Kühlschrank', furn_bath: 'Badewanne', furn_shower: 'Dusche',
  furn_toilet: 'WC', furn_sink: 'Waschbecken', furn_washer: 'Waschmaschine', furn_plant: 'Pflanze', furn_rug: 'Teppich', furn_stairs: 'Treppe', furn_block: 'Block',
  ed_discardTitle: 'Änderungen verwerfen?', ed_discardText: 'Was du im Grundriss-Editor geändert hast, wird nicht übernommen.', ed_discard: 'Verwerfen', ed_keepEditing: 'Weiter bearbeiten',
  ed_extras: 'Weitere Entitäten', ed_extrasNone: 'Noch keine – füge Geräte hinzu, die hier zusätzlich erscheinen sollen.', ed_addEntity: 'Entität hinzufügen', ed_extrasHelp: (n) => `Jede Entität kann zu „${n}“ dazukommen, z. B. ein Fernseher, ein Schalter oder ein Sensor. Sie landet in ihrem Raum.`,
  ed_addEntityTo: (n) => `Zu „${n}“ hinzufügen`, ed_pickLead: 'Entität antippen, um sie der Ebene hinzuzufügen – sie landet in ihrem Raum im Plan. Nochmal antippen entfernt sie.', ed_searchAll: 'Entitäten, Bereiche, Labels suchen …',
  ed_inLayerByKind: 'gehört ohnehin zur Ebene', ed_removeFromLayer: 'Aus dieser Ebene entfernen', ed_addedTo: (e, l) => `„${e}“ zu ${l} hinzugefügt`,
  ed_reset: 'Neu beginnen', ed_resetTitle: 'Neu beginnen?', ed_resetText: 'Räume, Möbel, Fenster, Geräte, Ebenen und die Vorlage werden entfernt. Du kannst es noch rückgängig machen.', ed_resetDone: 'Alles entfernt – beginne mit einer Vorlage oder zeichne deine Räume',
  ed_lightPreview: 'Licht anzeigen', ed_light_on: 'An', ed_light_off: 'Aus', ed_light_real: 'Echt',
  ed_hint_layers: 'Die Ebenen-Leiste deiner Karte – rechts eine Ebene antippen, um sie zu sehen', ed_tiles_phone: 'Am Handy ordnen sich die Kacheln selbst an – zum Verschieben auf Laptop wechseln',
  ed_byArea: 'Nach Bereich', ed_byLabel: 'Nach Label', ed_noLabelGroup: 'Ohne Label', ed_foldAll: 'Alle zuklappen', ed_unfoldAll: 'Alle aufklappen',
  ed_removeFromLayers: 'Von allen Ebenen entfernen', ed_deleteLayer: 'Ebene löschen', ed_layerEditLead: 'Was diese Ebene zeigt: ganze Kategorien und einzelne Geräte.',
});
