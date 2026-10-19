/*! Glass Floorplan Card – a glassy, Apple-style floor plan for Home Assistant.
 * MIT License · https://github.com/michael-schroeter/glass-floorplan-card
 * Built from src/*.js by tools/build.py – edit the sources, not dist/. */
(() => {
const VERSION = '0.1.0';
const CARD_TAG = 'glass-floorplan-card';

/* ================================================================== Helpers */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const isOn = (st) => !!st && st.state === 'on';
const unavailable = (st) => !st || st.state === 'unavailable' || st.state === 'unknown';
const num = (st) => { const v = parseFloat(st?.state); return Number.isFinite(v) ? v : null; };
const dimmable = (st) => (st?.attributes?.supported_color_modes || []).some((m) => m !== 'onoff');
const hasTemp = (st) => (st?.attributes?.supported_color_modes || []).includes('color_temp');
const hasColor = (st) => (st?.attributes?.supported_color_modes || []).some((m) => ['xy', 'hs', 'rgb', 'rgbw', 'rgbww'].includes(m));
const briPct = (st) => (isOn(st) ? (st.attributes.brightness != null ? Math.max(1, Math.round(st.attributes.brightness / 2.55)) : 100) : 0);
const domainOf = (eid) => String(eid || '').split('.')[0];
const isTime = (s) => typeof s === 'string' && /^\d{4}-\d\d-\d\dT/.test(s);
const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const uid = () => Math.random().toString(36).slice(2, 8);

/* Display colour of a lamp: whites as gold → cool white, coloured light in its colour */
const WHITE_STOPS = [[2000, [245, 172, 64]], [2700, [246, 200, 89]], [3500, [248, 218, 140]], [4500, [246, 234, 196]], [6500, [218, 232, 255]]];
function whiteRgb(k) {
  let i = 0;
  while (i < WHITE_STOPS.length - 2 && k > WHITE_STOPS[i + 1][0]) i++;
  const [k1, c1] = WHITE_STOPS[i], [k2, c2] = WHITE_STOPS[i + 1];
  return lerp3(c1, c2, clamp((k - k1) / (k2 - k1), 0, 1)).map(Math.round);
}
function lightRgb(cfg, st) {
  const a = st?.attributes || {};
  if (cfg?.color) return cfg.color;
  if (a.color_mode && ['xy', 'hs', 'rgb', 'rgbw', 'rgbww'].includes(a.color_mode) && a.rgb_color) {
    // brighten colours a little so they glow on dark glass
    const [r, g, b] = a.rgb_color, m = Math.max(r, g, b, 1);
    return [r, g, b].map((v) => Math.round(clamp((v / m) * 255 * 0.92 + 20, 0, 255)));
  }
  if (a.color_temp_kelvin) return whiteRgb(a.color_temp_kelvin);
  return whiteRgb(cfg?.kelvin || 2700);
}
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const lighten = (c, t) => c.map((v) => Math.round(v + (255 - v) * t));

/* Room temperature → colour (cold blue · comfortable mint · warm amber · hot red) */
const TEMP_STOPS = [[15, [86, 150, 255]], [18.5, [96, 200, 250]], [21, [122, 222, 178]], [23.5, [255, 196, 92]], [27, [255, 104, 72]]];
function tempRgb(v) {
  if (v == null) return [150, 156, 170];
  let i = 0;
  while (i < TEMP_STOPS.length - 2 && v > TEMP_STOPS[i + 1][0]) i++;
  const [a, c1] = TEMP_STOPS[i], [b, c2] = TEMP_STOPS[i + 1];
  return lerp3(c1, c2, clamp((v - a) / (b - a), 0, 1)).map(Math.round);
}

/* Seeded random (same spot directions on every load) */
function seeded(str) {
  let h = 2166136261;
  for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
}
/* Start angles of a spot's light cones: random, but never on top of each other */
function spotAngles(id, n = 3) {
  const r = seeded(`spot:${id}`), a = [r() * 360];
  for (let i = 1; i < n; i++) a.push(a[i - 1] + 360 / n - 15 + r() * 40);
  return a.map((v) => Math.round(v % 360));
}

/* Springs as CSS easing (linear()) */
function springEasing(stiffness, damping) {
  const w0 = Math.sqrt(stiffness), z = damping / (2 * Math.sqrt(stiffness));
  const wd = z < 1 ? w0 * Math.sqrt(1 - z * z) : 0;
  const f = (t) => (z < 1 ? 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t)) : 1 - (1 + w0 * t) * Math.exp(-w0 * t));
  const env = (t) => (z < 1 ? Math.exp(-z * w0 * t) / Math.sqrt(1 - z * z) : (1 + w0 * t) * Math.exp(-w0 * t));
  let dur = 0.1;
  while (dur < 2.5 && env(dur) > 0.002) dur += 0.02;
  const pts = Array.from({ length: 61 }, (_, i) => +f((i / 60) * dur).toFixed(4));
  pts[60] = 1;
  return { easing: `linear(${pts.join(',')})`, ms: Math.round(dur * 1000) };
}
const LINEAR_OK = typeof CSS !== 'undefined' && CSS.supports?.('transition-timing-function', 'linear(0, 1)');
const SPRINGS = {
  sp: springEasing(300, 26), soft: springEasing(140, 22), pop: springEasing(520, 24), snap: springEasing(420, 34),
  morph: springEasing(250, 24), close: springEasing(560, 47),
};
const ease = (name, fb) => (LINEAR_OK ? SPRINGS[name].easing : fb);
function springVars() {
  const v = (name, s, fb) => `--${name}:${LINEAR_OK ? s.easing : fb};--${name}-ms:${LINEAR_OK ? s.ms : 520}ms;`;
  return v('sp', SPRINGS.sp, 'cubic-bezier(.34,1.3,.64,1)') + v('soft', SPRINGS.soft, 'cubic-bezier(.22,1,.36,1)')
    + v('pop', SPRINGS.pop, 'cubic-bezier(.34,1.6,.64,1)') + v('snap', SPRINGS.snap, 'cubic-bezier(.2,.9,.3,1)');
}

/* Fires an event the way Home Assistant expects (bubbles out of shadow roots) */
function fire(node, type, detail) {
  node.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
}

/* ================================================================== Texts (English, German) + number / time formats from hass.locale */
let LANG = 'en';
let LOCALE = 'en';
const pl = (n, one, many) => (n === 1 ? one : many);

const STR = {
  en: {
    layer: 'Layer', layer_light: 'Light', layer_climate: 'Climate', layer_cover: 'Covers', layer_vacuum: 'Vacuum',
    on: 'On', off: 'Off', open: 'Open', close: 'Close', offline: 'Offline', running: 'Running', ready: 'Ready', standby: 'Standby',
    playing: 'Playing', paused: 'Paused', approx: 'approx.', min: 'min', all: 'All', none: 'None', now: 'Now', today: 'Today', never: 'Never', last: 'Last',
    error: (m) => `Error: ${m}`, notReachable: (n) => `${n} is not reachable`, notReachableShort: 'Not reachable',
    activated: (n) => `“${n}” activated`, started: (n) => `“${n}” started`,
    emptyTitle: 'No floor plan yet', emptyText: 'Open the card editor and draw your home: rooms, furniture, lamps and devices – or let a photo of your floor plan guide you.',
    nOn: (n) => `${n} on`, nActive: (n) => `${n} active`, lightsOn: (n) => `${n} ${pl(n, 'light', 'lights')} on`, allOffState: 'All off',
    modes: 'Modes', mode: 'Mode', allOff: 'All off', switchedOff: (n, lights) => `${n} ${lights ? pl(n, 'light', 'lights') : pl(n, 'device', 'devices')} switched off`,
    outside: 'Outside', inside: 'Inside', insideAvg: 'Inside Ø', weather: 'Weather', weatherForecast: 'Weather – forecast for the week',
    humidityPct: (n) => `${n} % humidity`, noReadings: 'No readings', frontDoor: 'Front door',
    close_: 'Close', hourly: 'Hourly', days8: '8 days', compass: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
    feelsLike: (n) => `feels like ${n}°`, lowHigh: (l, h) => `Low ${l}°  ·  High ${h}°`, humidity: 'Humidity', wind: 'Wind', sunrise: 'Sunrise', sunset: 'Sunset',
    loadingForecast: 'Loading forecast …',
    nOfLightsOn: (n, m) => `${n} of ${m} ${pl(m, 'light', 'lights')} on`, lightOff: 'Light off', allLightsOff: 'All lights off',
    colour: 'Colour', whiteTone: 'White', pickColour: 'Pick colour', power: 'On / off', previous: 'Previous', playPause: 'Play / pause', next: 'Next', volume: 'Volume',
    openDoor: 'Open door', slideToOpen: 'Slide to open', rang: 'Rang', opened: 'Opened', opening: 'Opening …', doorOpen: 'Door is open',
    settings: 'Settings', nDevices: (n) => `${n} ${pl(n, 'device', 'devices')}`, scene: 'Scene', script: 'Script', devices: 'Devices', sensors: 'Sensors',
    defaultModes: [['Evening', 'sunset'], ['Movie', 'film'], ['Reading', 'book'], ['Night', 'moon']], notSetUp: 'Not set up yet',
    modesHint: (l) => `Give scenes or scripts the label “${l}” in Home Assistant – they show up here automatically.`, modeNotSetUp: (n) => `“${n}” is not set up yet`,
    openAll: 'Open all', closeAll: 'Close all', run: 'Run', tapToConfirm: 'Tap again', unlock: 'Unlock', lock: 'Lock',
    nAlerts: (n) => `${n} ${pl(n, 'alert', 'alerts')}`, allClear: 'All clear',
    // climate
    coolTo: 'Cooling to', heatTo: 'Heating to', heatingTo: 'Heating to', target: 'Target', currently: (v) => `Now ${v}°`,
    thermostatsOff: (n) => `${n} ${pl(n, 'thermostat', 'thermostats')} switched off`, nHeating: (n) => `${n} heating`, nCooling: (n) => `${n} cooling`,
    allThermostatsOff: 'All thermostats off', allAtTemp: 'All at temperature', nRoomsMeasured: (n) => `${n} ${pl(n, 'room', 'rooms')} measured`,
    colder: 'Colder', warmer: 'Warmer', targetTemp: 'Target temperature',
    hvac_off: 'Off', hvac_heat: 'Heat', hvac_cool: 'Cool', hvac_heat_cool: 'Heat/Cool', hvac_auto: 'Auto', hvac_dry: 'Dry', hvac_fan_only: 'Fan',
    act_heating: 'Heating', act_preheating: 'Preheating', act_cooling: 'Cooling', act_idle: 'Idle', act_off: 'Off', act_drying: 'Drying', act_fan: 'Fan', act_defrosting: 'Defrosting',
    // covers
    opening2: 'Opening …', closing: 'Closing …', coverOpen: 'Open', coverClosed: 'Closed', pctOpen: (n) => `${n} % open`,
    coversOpening: (n) => `Opening ${n} ${pl(n, 'cover', 'covers')}`, coversClosing: (n) => `Closing ${n} ${pl(n, 'cover', 'covers')}`,
    allClosed: 'All closed', allOpen: 'All open', nOfOpen: (n, m) => `${n} of ${m} open`, noCovers: 'No covers', nMoving: (n) => `${n} moving`,
    // vacuum
    cleaningRoom: (r) => `Cleaning ${r}`, cleaning: 'Cleaning', returning: 'Returning to dock', charging: 'Charging', docked: 'Docked', needsHelp: 'Needs help',
    beingCleaned: 'Being cleaned', cleaningRunning: 'Cleaning is running', returnTrip: 'Returning', cleaningPct: (p) => `Cleaning · ${p} %`, toDock: 'To dock',
    onTheWay: 'On the way', resume: 'Resume', pause: 'Pause', nRooms: (n) => `${n} ${pl(n, 'room', 'rooms')}`, pickRooms: 'Pick rooms', tapRooms: 'Tap the rooms on the plan',
    start: 'Start', starting: 'Starting …', suction: 'Suction', water: 'Water', noVacOptions: 'This robot has no further options.',
    noRoomMapping: 'No room mapping – assign HA areas to the rooms or map the robot rooms in the editor', cleaningStarted: 'Cleaning started', startFailed: (m) => `Start failed: ${m}`,
    mode_vacuum: 'Vacuum', mode_vac_and_mop: 'Vacuum & mop', mode_mop: 'Mop',
    fan_quiet: 'Quiet', fan_balanced: 'Normal', fan_turbo: 'Turbo', fan_max: 'Max', fan_max_plus: 'Max+', fan_gentle: 'Gentle', fan_off: 'Off',
    water_low: 'Low', water_mild: 'Low', water_medium: 'Medium', water_moderate: 'Medium', water_high: 'High', water_intense: 'High',
    vs_charging: 'Charging', vs_charging_complete: 'Docked', vs_cleaning: 'Cleaning', vs_segment_cleaning: 'Cleaning', vs_zoned_cleaning: 'Cleaning zone', vs_spot_cleaning: 'Spot cleaning',
    vs_returning_home: 'Returning', vs_docking: 'Docking', vs_paused: 'Paused', vs_idle: 'Ready', vs_sleeping: 'Sleeping', vs_error: 'Error', vs_emptying_the_bin: 'Emptying the bin',
    vs_washing_the_mop: 'Washing the mop', vs_going_to_wash_the_mop: 'Going to wash the mop', vs_mapping: 'Mapping', vs_device_offline: 'Offline', vs_charging_problem: 'Charging problem',
    // weather
    wx_sunny: 'Sunny', 'wx_clear-night': 'Clear', wx_cloudy: 'Cloudy', wx_partlycloudy: 'Partly cloudy', wx_fog: 'Fog', wx_hail: 'Hail', wx_lightning: 'Thunderstorm',
    'wx_lightning-rainy': 'Thunderstorm', wx_pouring: 'Heavy rain', wx_rainy: 'Rain', wx_snowy: 'Snow', 'wx_snowy-rainy': 'Sleet', wx_windy: 'Windy', 'wx_windy-variant': 'Windy', wx_exceptional: 'Severe weather',
    // binary sensors / locks
    bs_door_on: 'Open', bs_door_off: 'Closed', bs_window_on: 'Open', bs_window_off: 'Closed', bs_opening_on: 'Open', bs_opening_off: 'Closed', bs_garage_door_on: 'Open', bs_garage_door_off: 'Closed',
    bs_motion_on: 'Motion', bs_motion_off: 'Clear', bs_occupancy_on: 'Occupied', bs_occupancy_off: 'Clear', bs_presence_on: 'Home', bs_presence_off: 'Away',
    bs_moisture_on: 'Wet', bs_moisture_off: 'Dry', bs_smoke_on: 'Smoke!', bs_smoke_off: 'Clear', bs_gas_on: 'Gas!', bs_gas_off: 'Clear', bs_carbon_monoxide_on: 'CO!', bs_carbon_monoxide_off: 'Clear',
    bs_lock_on: 'Unlocked', bs_lock_off: 'Locked', bs_plug_on: 'Plugged in', bs_plug_off: 'Unplugged', bs_power_on: 'Power', bs_power_off: 'No power', bs_connectivity_on: 'Connected', bs_connectivity_off: 'Disconnected',
    bs_problem_on: 'Problem', bs_problem_off: 'OK', bs_safety_on: 'Unsafe', bs_safety_off: 'Safe', bs_tamper_on: 'Tampering', bs_tamper_off: 'OK', bs_vibration_on: 'Vibration', bs_vibration_off: 'Clear',
    bs_battery_on: 'Low', bs_battery_off: 'Normal', bs_light_on: 'Light', bs_light_off: 'Dark', bs_running_on: 'Running', bs_running_off: 'Not running',
    lock_locked: 'Locked', lock_unlocked: 'Unlocked', lock_locking: 'Locking …', lock_unlocking: 'Unlocking …', lock_jammed: 'Jammed', lock_open: 'Open', lock_opening: 'Opening …',
    // relative time
    justNow: 'just now', yesterday: 'yesterday', at: (tm) => tm,
    mediaTv: 'TV', mediaSpeaker: 'Speaker', mediaGeneric: 'Media',
    dom_climate: 'Thermostat', dom_cover: 'Cover', dom_light: 'Light', dom_media_player: 'Media', dom_sensor: 'Sensor', dom_fan: 'Fan', dom_lock: 'Lock', dom_switch: 'Switch', dom_binary_sensor: 'Sensor',
  },
  de: {
    layer: 'Ebene', layer_light: 'Licht', layer_climate: 'Klima', layer_cover: 'Rollläden', layer_vacuum: 'Roboter',
    on: 'An', off: 'Aus', open: 'Öffnen', close: 'Schließen', offline: 'Offline', running: 'Läuft', ready: 'Bereit', standby: 'Standby',
    playing: 'Spielt', paused: 'Pausiert', approx: 'ca.', min: 'Min.', all: 'Alle', none: 'Keine', now: 'Jetzt', today: 'Heute', never: 'Noch nie', last: 'Zuletzt',
    error: (m) => `Fehler: ${m}`, notReachable: (n) => `${n} ist nicht erreichbar`, notReachableShort: 'Nicht erreichbar',
    activated: (n) => `„${n}“ aktiviert`, started: (n) => `„${n}“ gestartet`,
    emptyTitle: 'Noch kein Grundriss', emptyText: 'Öffne den Karten-Editor und zeichne deine Wohnung: Räume, Möbel, Lampen und Geräte – gern mit einem Foto deines Grundrisses als Vorlage.',
    nOn: (n) => `${n} an`, nActive: (n) => `${n} aktiv`, lightsOn: (n) => `${n} ${pl(n, 'Licht', 'Lichter')} an`, allOffState: 'Alles aus',
    modes: 'Modi', mode: 'Modus', allOff: 'Alle aus', switchedOff: (n, lights) => `${n} ${lights ? pl(n, 'Licht', 'Lichter') : pl(n, 'Gerät', 'Geräte')} ausgeschaltet`,
    outside: 'Außen', inside: 'Innen', insideAvg: 'Innen Ø', weather: 'Wetter', weatherForecast: 'Wetter – Vorhersage für die Woche',
    humidityPct: (n) => `${n} % Luftfeuchte`, noReadings: 'Keine Messwerte', frontDoor: 'Haustür',
    hourly: 'Stündlich', days8: '8 Tage', compass: ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'],
    feelsLike: (n) => `gefühlt ${n}°`, lowHigh: (l, h) => `Tief ${l}°  ·  Hoch ${h}°`, humidity: 'Luftfeuchte', wind: 'Wind', sunrise: 'Sonnenaufgang', sunset: 'Sonnenuntergang',
    loadingForecast: 'Vorhersage wird geladen …',
    nOfLightsOn: (n, m) => `${n} von ${m} ${pl(m, 'Licht', 'Lichtern')} an`, lightOff: 'Licht aus', allLightsOff: 'Alle Lichter aus',
    colour: 'Farbe', whiteTone: 'Weißton', pickColour: 'Farbe wählen', power: 'Ein/Aus', previous: 'Zurück', playPause: 'Wiedergabe', next: 'Weiter', volume: 'Lautstärke',
    openDoor: 'Tür öffnen', slideToOpen: 'Zum Öffnen schieben', rang: 'Geklingelt', opened: 'Geöffnet', opening: 'Wird geöffnet …', doorOpen: 'Tür ist offen',
    settings: 'Einstellungen', nDevices: (n) => `${n} ${pl(n, 'Gerät', 'Geräte')}`, scene: 'Szene', script: 'Skript', devices: 'Geräte', sensors: 'Sensoren',
    defaultModes: [['Abend', 'sunset'], ['Film', 'film'], ['Lesen', 'book'], ['Nacht', 'moon']], notSetUp: 'Noch nicht eingerichtet',
    modesHint: (l) => `Lege in Home Assistant Szenen oder Skripte mit dem Label „${l}“ an – sie erscheinen hier automatisch.`, modeNotSetUp: (n) => `„${n}“ ist noch nicht eingerichtet`,
    openAll: 'Alle öffnen', closeAll: 'Alle schließen', run: 'Ausführen', tapToConfirm: 'Nochmal tippen', unlock: 'Aufsperren', lock: 'Absperren',
    nAlerts: (n) => `${n} ${pl(n, 'Hinweis', 'Hinweise')}`, allClear: 'Alles in Ordnung',
    coolTo: 'Kühlen auf', heatTo: 'Heizen auf', heatingTo: 'Heizt auf', target: 'Ziel', currently: (v) => `Aktuell ${v}°`,
    thermostatsOff: (n) => `${n} ${pl(n, 'Thermostat', 'Thermostate')} ausgeschaltet`, nHeating: (n) => `${n} ${pl(n, 'heizt', 'heizen')}`, nCooling: (n) => `${n} ${pl(n, 'kühlt', 'kühlen')}`,
    allThermostatsOff: 'Alle Thermostate aus', allAtTemp: 'Alle auf Temperatur', nRoomsMeasured: (n) => `${n} ${pl(n, 'Raum', 'Räume')} gemessen`,
    colder: 'Kälter', warmer: 'Wärmer', targetTemp: 'Zieltemperatur',
    hvac_off: 'Aus', hvac_heat: 'Heizen', hvac_cool: 'Kühlen', hvac_heat_cool: 'Heizen/Kühlen', hvac_auto: 'Auto', hvac_dry: 'Entfeuchten', hvac_fan_only: 'Lüfter',
    act_heating: 'Heizt', act_preheating: 'Heizt vor', act_cooling: 'Kühlt', act_idle: 'Bereit', act_off: 'Aus', act_drying: 'Entfeuchtet', act_fan: 'Lüftet', act_defrosting: 'Taut ab',
    opening2: 'Öffnet …', closing: 'Schließt …', coverOpen: 'Offen', coverClosed: 'Geschlossen', pctOpen: (n) => `${n} % offen`,
    coversOpening: (n) => `${n} ${pl(n, 'Rollladen öffnet', 'Rollläden öffnen')}`, coversClosing: (n) => `${n} ${pl(n, 'Rollladen schließt', 'Rollläden schließen')}`,
    allClosed: 'Alle geschlossen', allOpen: 'Alle offen', nOfOpen: (n, m) => `${n} von ${m} offen`, noCovers: 'Keine Rollläden', nMoving: (n) => `${n} in Bewegung`,
    cleaningRoom: (r) => `Reinigt ${r}`, cleaning: 'Reinigt', returning: 'Fährt zur Station', charging: 'Lädt', docked: 'In der Station', needsHelp: 'Braucht Hilfe',
    beingCleaned: 'Wird gereinigt', cleaningRunning: 'Die Reinigung läuft gerade', returnTrip: 'Rückfahrt', cleaningPct: (p) => `Reinigt · ${p} %`, toDock: 'Zur Station',
    onTheWay: 'Unterwegs', resume: 'Weiter', pause: 'Pause', nRooms: (n) => `${n} ${pl(n, 'Raum', 'Räume')}`, pickRooms: 'Räume wählen', tapRooms: 'Tippe im Plan auf die Räume',
    start: 'Starten', starting: 'Startet …', suction: 'Saugkraft', water: 'Wassermenge', noVacOptions: 'Dieser Roboter hat keine weiteren Optionen.',
    noRoomMapping: 'Keine Raumzuordnung – den Räumen HA-Bereiche geben oder die Roboter-Räume im Editor zuordnen', cleaningStarted: 'Reinigung gestartet', startFailed: (m) => `Start fehlgeschlagen: ${m}`,
    mode_vacuum: 'Saugen', mode_vac_and_mop: 'Saugen & Wischen', mode_mop: 'Wischen',
    fan_quiet: 'Leise', fan_balanced: 'Normal', fan_turbo: 'Turbo', fan_max: 'Max', fan_max_plus: 'Max+', fan_gentle: 'Sanft', fan_off: 'Aus',
    water_low: 'Wenig', water_mild: 'Wenig', water_medium: 'Mittel', water_moderate: 'Mittel', water_high: 'Viel', water_intense: 'Viel',
    vs_charging: 'Lädt', vs_charging_complete: 'In der Station', vs_cleaning: 'Reinigt', vs_segment_cleaning: 'Reinigt', vs_zoned_cleaning: 'Reinigt Zone', vs_spot_cleaning: 'Punktreinigung',
    vs_returning_home: 'Fährt zur Station', vs_docking: 'Dockt an', vs_paused: 'Pausiert', vs_idle: 'Bereit', vs_sleeping: 'Ruht', vs_error: 'Fehler', vs_emptying_the_bin: 'Leert den Behälter',
    vs_washing_the_mop: 'Wäscht den Mopp', vs_going_to_wash_the_mop: 'Fährt zum Moppwaschen', vs_mapping: 'Kartiert', vs_device_offline: 'Offline', vs_charging_problem: 'Ladeproblem',
    wx_sunny: 'Sonnig', 'wx_clear-night': 'Klar', wx_cloudy: 'Bewölkt', wx_partlycloudy: 'Teils bewölkt', wx_fog: 'Nebel', wx_hail: 'Hagel', wx_lightning: 'Gewitter',
    'wx_lightning-rainy': 'Gewitter', wx_pouring: 'Starkregen', wx_rainy: 'Regen', wx_snowy: 'Schnee', 'wx_snowy-rainy': 'Schneeregen', wx_windy: 'Windig', 'wx_windy-variant': 'Windig', wx_exceptional: 'Unwetter',
    bs_door_on: 'Offen', bs_door_off: 'Zu', bs_window_on: 'Offen', bs_window_off: 'Zu', bs_opening_on: 'Offen', bs_opening_off: 'Zu', bs_garage_door_on: 'Offen', bs_garage_door_off: 'Zu',
    bs_motion_on: 'Bewegung', bs_motion_off: 'Ruhig', bs_occupancy_on: 'Belegt', bs_occupancy_off: 'Frei', bs_presence_on: 'Zuhause', bs_presence_off: 'Weg',
    bs_moisture_on: 'Nass', bs_moisture_off: 'Trocken', bs_smoke_on: 'Rauch!', bs_smoke_off: 'OK', bs_gas_on: 'Gas!', bs_gas_off: 'OK', bs_carbon_monoxide_on: 'CO!', bs_carbon_monoxide_off: 'OK',
    bs_lock_on: 'Offen', bs_lock_off: 'Verriegelt', bs_plug_on: 'Eingesteckt', bs_plug_off: 'Ausgesteckt', bs_power_on: 'Strom', bs_power_off: 'Kein Strom', bs_connectivity_on: 'Verbunden', bs_connectivity_off: 'Getrennt',
    bs_problem_on: 'Problem', bs_problem_off: 'OK', bs_safety_on: 'Unsicher', bs_safety_off: 'Sicher', bs_tamper_on: 'Manipulation', bs_tamper_off: 'OK', bs_vibration_on: 'Vibration', bs_vibration_off: 'Ruhig',
    bs_battery_on: 'Schwach', bs_battery_off: 'Normal', bs_light_on: 'Hell', bs_light_off: 'Dunkel', bs_running_on: 'Läuft', bs_running_off: 'Läuft nicht',
    lock_locked: 'Verriegelt', lock_unlocked: 'Entriegelt', lock_locking: 'Verriegelt …', lock_unlocking: 'Entriegelt …', lock_jammed: 'Blockiert', lock_open: 'Offen', lock_opening: 'Öffnet …',
    justNow: 'gerade eben', yesterday: 'gestern', at: (tm) => `${tm} Uhr`,
    mediaTv: 'Fernseher', mediaSpeaker: 'Lautsprecher', mediaGeneric: 'Medien',
    dom_climate: 'Thermostat', dom_cover: 'Rollladen', dom_light: 'Licht', dom_media_player: 'Medien', dom_sensor: 'Sensor', dom_fan: 'Ventilator', dom_lock: 'Schloss', dom_switch: 'Schalter', dom_binary_sensor: 'Sensor',
  },
};

function t(key, ...args) {
  const s = STR[LANG]?.[key] ?? STR.en[key];
  if (s == null) return key;
  return typeof s === 'function' ? s(...args) : s;
}
/* text with a fallback when the key is unknown */
function tf(key, fallback) {
  const s = STR[LANG]?.[key] ?? STR.en[key];
  return s == null ? fallback : typeof s === 'function' ? s() : s;
}
const fmt = (v, d = 0) => Number(v).toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });

function relTime(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s)) return '';
  if (s < 60) return t('justNow');
  let rtf;
  try { rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto', style: 'short' }); } catch (e) { rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' }); }
  const m = s / 60; if (m < 60) return rtf.format(-Math.round(m), 'minute');
  const h = m / 60; if (h < 24) return rtf.format(-Math.round(h), 'hour');
  const d = h / 24; return d < 2 ? t('yesterday') : rtf.format(-Math.round(d), 'day');
}

/* "3 days ago · Wed 19:22" – relative time plus clock time (from one hour on) */
function whenText(iso) {
  const d = new Date(iso), s = (Date.now() - d.getTime()) / 1000;
  if (!Number.isFinite(s)) return '';
  const hm = d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
  if (s < 3600) return relTime(iso);
  if (s < 86400 && d.toDateString() === new Date().toDateString()) return `${relTime(iso)} · ${t('at', hm)}`;
  if (s < 6 * 86400) return `${relTime(iso)} · ${d.toLocaleDateString(LOCALE, { weekday: 'short' })} ${hm}`;
  return `${relTime(iso)} · ${d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}`;
}

/* ================================================================== Icons (24 grid, lines, round caps, milky glass gradient) */
const ICONS = {
  /* lamps – every lamp can have its own icon */
  bulb: '<path d="M9.2 18.2h5.6M10.2 21h3.6"/><path d="M8.5 15.2c-1.6-1.3-2.7-3.2-2.7-5.4a6.2 6.2 0 0 1 12.4 0c0 2.2-1.1 4.1-2.7 5.4z"/>',
  bulbOff: '<path d="M9.2 18.2h5.6M10.2 21h3.6"/><path d="M8.5 15.2c-1.6-1.3-2.7-3.2-2.7-5.4a6.2 6.2 0 0 1 12.4 0c0 2.2-1.1 4.1-2.7 5.4z"/><path d="M4 3.4l16 16"/>',
  ceiling: '<path d="M12 2.4v4.2"/><path d="M5.2 13.4a6.8 6.8 0 0 1 13.6 0z"/><path d="M9.8 16.4a2.2 2.2 0 0 0 4.4 0"/>',
  chandelier: '<path d="M12 2.4v3.8"/><path d="M4.6 12.2c0 3.5 14.8 3.5 14.8 0"/><path d="M4.6 12.2V9.6M12 14.8V9.6M19.4 12.2V9.6"/><circle cx="4.6" cy="7.7" r="1.25"/><circle cx="12" cy="7.7" r="1.25"/><circle cx="19.4" cy="7.7" r="1.25"/><path d="M12 14.8v3.4"/><path d="M10.2 20.8h3.6"/>',
  pendant: '<path d="M12 2.4v5"/><path d="M4.2 15.4a7.8 7.8 0 0 1 15.6 0z"/><path d="M9.8 18.4a2.2 2.2 0 0 0 4.4 0"/>',
  lamp: '<path d="M8.4 3.4h7.2l3.4 8.4H5z"/><path d="M12 11.8v7.4"/><path d="M8 20.4h8"/>',
  floorlamp: '<path d="M9 3h6l2.4 6.4H6.6z"/><path d="M12 9.4v11.2"/><path d="M8.6 20.6h6.8"/>',
  desklamp: '<path d="M4.4 20.6h9"/><path d="M8.9 20.6l3.3-7.6-4.7-4.3"/><path d="M6.2 10l2.3-5.8 7.1 3-1.5 1.7z"/><path d="M12.7 8.6l1.4 2.7"/>',
  strip: '<rect x="2.8" y="8.8" width="18.4" height="6.4" rx="3.2"/><circle cx="7.5" cy="12" r="1.05" class="f"/><circle cx="12" cy="12" r="1.05" class="f"/><circle cx="16.5" cy="12" r="1.05" class="f"/>',
  spot: '<circle cx="12" cy="12" r="7.8"/><circle cx="12" cy="12" r="3.2"/>',
  wall: '<path d="M6 3.4v17.2"/><path d="M6 8.2h4.4a5 5 0 0 1 0 10H6"/><path d="M15.4 13.2h4.2M14.6 8.6l3.2-1.8M14.6 17.8l3.2 1.8"/>',
  sprout: '<path d="M12 20.6v-8"/><path d="M12 12.6c0-4.4 2.9-7.1 7.8-7.1 0 4.4-2.9 7.1-7.8 7.1z"/><path d="M12 15c0-3.5-2.5-5.8-6.6-5.8 0 3.5 2.5 5.8 6.6 5.8z"/><path d="M7.8 20.6h8.4"/>',
  candle: '<path d="M9.4 10.6h5.2v10H9.4z"/><path d="M12 3.2c1.4 1.6 2 2.7 2 3.7a2 2 0 0 1-4 0c0-1 .6-2.1 2-3.7z"/>',
  /* devices */
  tv: '<rect x="2.6" y="4.4" width="18.8" height="12.6" rx="2.4"/><path d="M8.4 20.4h7.2"/>',
  speaker: '<path d="M4.4 9.4h3.6l4.6-4v13.2l-4.6-4H4.4z"/><path d="M16 9a4.2 4.2 0 0 1 0 6"/><path d="M18.6 6.6a7.6 7.6 0 0 1 0 10.8"/>',
  door: '<path d="M6.4 21V4.3c0-.7.6-1.3 1.3-1.3h8.6c.7 0 1.3.6 1.3 1.3V21"/><path d="M3.8 21h16.4"/><circle cx="14.4" cy="12.2" r="1" class="f"/>',
  doorOpen: '<path d="M6.4 21V4.3c0-.7.6-1.3 1.3-1.3h8.6c.7 0 1.3.6 1.3 1.3V21"/><path d="M3.8 21h16.4"/><path d="M6.4 21l6.6-1.7V4.9L6.4 3.2"/>',
  robot: '<circle cx="12" cy="12" r="8.6"/><circle cx="12" cy="9.3" r="2.5"/><path d="M6.6 14.6a6.6 6.6 0 0 0 10.8 0"/>',
  vacmop: '<circle cx="10.2" cy="11" r="6.6"/><circle cx="10.2" cy="9" r="1.9"/><path d="M18.6 13.4c1.3 1.5 2 2.6 2 3.6a2 2 0 0 1-4 0c0-1 .7-2.1 2-3.6z"/>',
  drop: '<path d="M12 3.4c3.1 3.7 5.6 6.8 5.6 10a5.6 5.6 0 0 1-11.2 0c0-3.2 2.5-6.3 5.6-10z"/>',
  dock: '<path d="M3.8 11.2 12 4.4l8.2 6.8"/><path d="M6.2 9.4v10.2h11.6V9.4"/><path d="M12.6 10.4l-2.2 3.4h3.2l-2.2 3.4"/>',
  blinds: '<path d="M3.2 4h17.6"/><path d="M4.8 4v16h14.4V4"/><path d="M4.8 8h14.4M4.8 12h14.4M4.8 16h14.4"/>',
  blindsOpen: '<path d="M3.2 4h17.6"/><path d="M4.8 4v16M19.2 4v16"/><path d="M4.8 7.6h14.4"/><path d="M12 7.6v5.6"/><circle cx="12" cy="14.6" r="1.1" class="f"/>',
  window: '<rect x="4.4" y="3.4" width="15.2" height="17.2" rx="2"/><path d="M12 3.4v17.2M4.4 12h15.2"/>',
  windowOpen: '<rect x="4.4" y="3.4" width="15.2" height="17.2" rx="2"/><path d="M12 3.4v17.2"/><path d="M12 3.4l5 3v14.2l-5-2.6"/>',
  fan: '<circle cx="12" cy="12" r="1.7"/><path d="M12 10.3c-.9-3.3.3-6.3 2.7-6.6 2.4-.3 3.4 2.4 1.5 4.3-1.1 1.1-2.6 1.7-4.2 2.3z"/><path d="M12 10.3c-.9-3.3.3-6.3 2.7-6.6 2.4-.3 3.4 2.4 1.5 4.3-1.1 1.1-2.6 1.7-4.2 2.3z" transform="rotate(120 12 12)"/><path d="M12 10.3c-.9-3.3.3-6.3 2.7-6.6 2.4-.3 3.4 2.4 1.5 4.3-1.1 1.1-2.6 1.7-4.2 2.3z" transform="rotate(240 12 12)"/>',
  plug: '<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="5"/><circle cx="12" cy="12" r="4.6"/><circle cx="10.2" cy="12" r=".9" class="f"/><circle cx="13.8" cy="12" r=".9" class="f"/>',
  toggle: '<rect x="2.8" y="7" width="18.4" height="10" rx="5"/><circle cx="16.2" cy="12" r="2.8" class="f"/>',
  lock: '<rect x="5" y="10.4" width="14" height="10.2" rx="2.6"/><path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8"/><circle cx="12" cy="15.4" r="1" class="f"/>',
  unlock: '<rect x="5" y="10.4" width="14" height="10.2" rx="2.6"/><path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.3-1.4"/><circle cx="12" cy="15.4" r="1" class="f"/>',
  motion: '<circle cx="12" cy="12" r="2"/><path d="M8 8a5.7 5.7 0 0 0 0 8M16 8a5.7 5.7 0 0 1 0 8M5.2 5.2a9.6 9.6 0 0 0 0 13.6M18.8 5.2a9.6 9.6 0 0 1 0 13.6"/>',
  shield: '<path d="M12 3.2 5 5.8v5.6c0 4.4 3 8 7 9.4 4-1.4 7-5 7-9.4V5.8z"/>',
  shieldOk: '<path d="M12 3.2 5 5.8v5.6c0 4.4 3 8 7 9.4 4-1.4 7-5 7-9.4V5.8z"/><path d="M9 12.2l2.2 2.2 4-4.2"/>',
  coffee: '<path d="M5 9h11v5.2a4.6 4.6 0 0 1-4.6 4.6h-1.8A4.6 4.6 0 0 1 5 14.2z"/><path d="M16 10.4h1.4a2.4 2.4 0 0 1 0 4.8H16"/><path d="M8.4 3.6v2.6M11.6 3.6v2.6"/>',
  washer: '<rect x="4.4" y="3" width="15.2" height="18" rx="2.6"/><circle cx="12" cy="13" r="4.4"/><path d="M7.6 6.4h2.4"/>',
  press: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="3.4" class="f"/>',
  gauge: '<path d="M4.2 16.4a8.4 8.4 0 1 1 15.6 0"/><path d="M12 14.2l3.6-4.6"/><circle cx="12" cy="14.6" r="1.3" class="f"/>',
  dot: '<circle cx="12" cy="12" r="4" class="f"/>',
  alert: '<path d="M12 3.6 2.8 19.6h18.4z"/><path d="M12 9.6v4.6"/><circle cx="12" cy="16.8" r=".9" class="f"/>',
  camera: '<rect x="3" y="7" width="13.2" height="10.4" rx="2.4"/><path d="M16.2 10.6 21 8v8.4l-4.8-2.6"/>',
  /* controls */
  power: '<path d="M12 3.2v8"/><path d="M6.8 6.8a7.3 7.3 0 1 0 10.4 0"/>',
  play: '<path d="M8 5.4v13.2c0 .6.7 1 1.2.6l10-6.6c.5-.3.5-.9 0-1.2l-10-6.6C8.7 4.4 8 4.8 8 5.4z" class="f"/>',
  pause: '<rect x="6.6" y="5" width="3.8" height="14" rx="1.2" class="f"/><rect x="13.6" y="5" width="3.8" height="14" rx="1.2" class="f"/>',
  stop: '<rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2.6" class="f"/>',
  prev: '<path d="M19.4 6.6v10.8c0 .5-.6.8-1 .5l-8-5.4a.6.6 0 0 1 0-1l8-5.4c.4-.3 1 0 1 .5z" class="f"/><path d="M6 6.4v11.2"/>',
  next: '<path d="M4.6 6.6v10.8c0 .5.6.8 1 .5l8-5.4a.6.6 0 0 0 0-1l-8-5.4c-.4-.3-1 0-1 .5z" class="f"/><path d="M18 6.4v11.2"/>',
  close: '<path d="M7 7l10 10M17 7 7 17"/>',
  chevR: '<path d="M9.4 5.8l6.2 6.2-6.2 6.2"/>',
  chevL: '<path d="M14.6 5.8 8.4 12l6.2 6.2"/>',
  chevD: '<path d="M6.6 9.4 12 14.8l5.4-5.4"/>',
  chevU: '<path d="M6.6 14.6 12 9.2l5.4 5.4"/>',
  up: '<path d="M12 19.4V5"/><path d="M6.4 10.6 12 5l5.6 5.6"/>',
  down: '<path d="M12 4.6V19"/><path d="M6.4 13.4 12 19l5.6-5.6"/>',
  check: '<path d="M5.4 12.6l4.2 4.2 9-9.6"/>',
  minus: '<path d="M5.5 12h13"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  back: '<path d="M10.2 6.2 4.4 12l5.8 5.8"/><path d="M5 12h14.6"/>',
  home: '<path d="M3.8 11.2 12 4.4l8.2 6.8"/><path d="M6.2 9.4v10.2h11.6V9.4"/>',
  bell: '<path d="M6.4 16.6h11.2l-1.4-2V10.2a4.2 4.2 0 0 0-8.4 0v4.4z"/><path d="M10.2 19.1a1.9 1.9 0 0 0 3.6 0"/><path d="M12 4.3v1.7"/>',
  /* modes */
  sunrise: '<path d="M12 2.8v5"/><path d="M9.6 5.2 12 2.8l2.4 2.4"/><path d="M4.9 9.6l1.4 1.4M19.1 9.6l-1.4 1.4"/><path d="M2.8 17.6h18.4"/><path d="M6.8 17.6a5.2 5.2 0 0 1 10.4 0"/><path d="M8 21h8"/>',
  sunset: '<path d="M12 3.2v3.2"/><path d="M4.9 8.6l1.6 1.6M19.1 8.6l-1.6 1.6"/><path d="M2.8 17.6h18.4"/><path d="M6.8 17.6a5.2 5.2 0 0 1 10.4 0"/><path d="M8 21h8"/>',
  film: '<rect x="3.4" y="5" width="17.2" height="14" rx="2.6"/><path d="M8 5v14M16 5v14M3.4 9.6H8M3.4 14.4H8M16 9.6h4.6M16 14.4h4.6"/>',
  book: '<path d="M12 6.6C10 5 7.4 4.6 4.4 5v13c3-.4 5.6 0 7.6 1.6 2-1.6 4.6-2 7.6-1.6V5c-3-.4-5.6 0-7.6 1.6z"/><path d="M12 6.6v13"/>',
  sparkle: '<path d="M12 3.2l1.9 5.2 5.2 1.9-5.2 1.9L12 17.4l-1.9-5.2-5.2-1.9 5.2-1.9z"/><path d="M18.6 16.2l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  /* weather + climate */
  sun: '<circle cx="12" cy="12" r="4.1"/><path d="M12 2.4v2.1M12 19.5v2.1M2.4 12h2.1M19.5 12h2.1M5.2 5.2l1.5 1.5M17.3 17.3l1.5 1.5M5.2 18.8l1.5-1.5M17.3 6.7l1.5-1.5"/>',
  moon: '<path d="M19.6 14.6A8.2 8.2 0 0 1 9.4 4.4a8.2 8.2 0 1 0 10.2 10.2z"/>',
  cloud: '<path d="M7.2 18.6h10a4.3 4.3 0 0 0 .5-8.6 5.8 5.8 0 0 0-11.2 1.5 3.6 3.6 0 0 0 .7 7.1z"/>',
  partly: '<path d="M8.6 2.8v1.4M3 8.4h1.4M4.6 4.4l1 1M12.6 4.4l-1 1"/><path d="M5.3 11.4A3.6 3.6 0 0 1 11.8 7"/><path d="M8.8 20h8.8a3.8 3.8 0 0 0 .4-7.6 5 5 0 0 0-9.6 1.3 3.2 3.2 0 0 0 .4 6.3z"/>',
  partlyNight: '<path d="M12.2 6.4A4.2 4.2 0 0 1 6.6 11a4.2 4.2 0 1 0 5.6-4.6z"/><path d="M8.8 20h8.8a3.8 3.8 0 0 0 .4-7.6 5 5 0 0 0-9.6 1.3 3.2 3.2 0 0 0 .4 6.3z"/>',
  rain: '<path d="M7.2 15h10a4.3 4.3 0 0 0 .5-8.6 5.8 5.8 0 0 0-11.2 1.5A3.6 3.6 0 0 0 7.2 15z"/><path d="M8.6 18.2l-1 2.4M12.6 18.2l-1 2.4M16.6 18.2l-1 2.4"/>',
  snow: '<path d="M7.2 15h10a4.3 4.3 0 0 0 .5-8.6 5.8 5.8 0 0 0-11.2 1.5A3.6 3.6 0 0 0 7.2 15z"/><path d="M8.5 19h.01M12 20.5h.01M15.5 19h.01" stroke-width="2.6"/>',
  fog: '<path d="M4 8.6h16M6 12.6h13M4 16.6h14"/>',
  wind: '<path d="M3.5 9.5h10.6a2.6 2.6 0 1 0-2.6-2.6"/><path d="M3.5 14h14.2a2.8 2.8 0 1 1-2.8 2.8"/>',
  bolt: '<path d="M13.2 2.6 5.6 13.4H12l-1.2 8 7.6-10.8H12z"/>',
  thermo: '<path d="M10 14.4V5.2a2 2 0 0 1 4 0v9.2a3.8 3.8 0 1 1-4 0z"/><path d="M12 15.4V9"/>',
  humid: '<path d="M12 3.4c3.1 3.7 5.6 6.8 5.6 10a5.6 5.6 0 0 1-11.2 0c0-3.2 2.5-6.3 5.6-10z"/><path d="M9.4 14.2a2.6 2.6 0 0 0 2.6 2.6"/>',
  flame: '<path d="M12 21c-3.7 0-6.3-2.6-6.3-6 0-3.3 2.3-5.2 3.7-7.7.4 1.7 1.3 2.7 2.3 3.1.1-3.4 1.5-6.2 3.6-7.6-.3 2.7.6 4.5 1.8 6.2 1.1 1.6 1.9 3.3 1.9 5.3 0 3.9-3 6.7-7 6.7z"/>',
  snowflake: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.6 4.6 12 7l2.4-2.4M9.6 19.4 12 17l2.4 2.4"/>',
  autoMode: '<circle cx="12" cy="12" r="8.6"/><path d="M8.8 16.2 12 7.6l3.2 8.6M10 13.2h4"/>',
  leaf: '<path d="M5 19c0-8 5-13.6 14.6-14.6C19 14 13 19 5 19z"/><path d="M5 19c3-4 6-6.6 9.6-8.6"/>',
  battery: '<rect x="2.6" y="7.4" width="16.6" height="9.2" rx="2.6"/><path d="M21.6 10.6v2.8"/>',
  /* editor */
  layers: '<path d="M12 3.6 3.4 8.2 12 12.8l8.6-4.6z"/><path d="M3.4 12.2 12 16.8l8.6-4.6"/><path d="M3.4 16.2 12 20.8l8.6-4.6"/>',
  plan: '<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="2.2"/><path d="M11 3.4v6.4M11 13.4v7.2M3.4 11.6h4.4M14.4 11.6h6.2"/>',
  sofa: '<path d="M5.4 10.6V8a2.4 2.4 0 0 1 2.4-2.4h8.4A2.4 2.4 0 0 1 18.6 8v2.6"/><path d="M3.4 12.4a1.8 1.8 0 0 1 3.6 0v1.8h10v-1.8a1.8 1.8 0 0 1 3.6 0v5.2H3.4z"/><path d="M5.6 17.6v1.6M18.4 17.6v1.6"/>',
  bed: '<path d="M3.4 19.4V6"/><path d="M3.4 15.2h17.2v4.2"/><path d="M3.4 11.6h6.4v3.6"/><path d="M9.8 10.4h7.6a3.2 3.2 0 0 1 3.2 3.2v1.6"/>',
  table: '<path d="M3.4 9h17.2"/><path d="M6 9v10.4M18 9v10.4"/><path d="M6 13.6h12"/>',
  round: '<circle cx="12" cy="12" r="7.6"/><circle cx="12" cy="12" r="2.4"/>',
  chair: '<path d="M8 3.6v16.8"/><path d="M8 12.4h8.4v8"/><path d="M8 3.6h2"/>',
  desk: '<path d="M3.4 8.4h17.2"/><path d="M5.2 8.4v11.2M18.8 8.4v11.2"/><path d="M13 8.4v6.4h5.8M15.2 11.6h1.4"/>',
  wardrobe: '<rect x="4.6" y="3.4" width="14.8" height="17.2" rx="1.8"/><path d="M12 3.4v17.2M10 11v2M14 11v2"/>',
  shelf: '<rect x="4.4" y="3.4" width="15.2" height="17.2" rx="1.6"/><path d="M4.4 9.2h15.2M4.4 14.8h15.2"/>',
  bath: '<path d="M3.4 12h17.2v2.2a5 5 0 0 1-5 5H8.4a5 5 0 0 1-5-5z"/><path d="M6 12V6.2a2.2 2.2 0 0 1 4.2-.9"/><path d="M7 19.2l-.8 1.6M17 19.2l.8 1.6"/>',
  shower: '<path d="M5 20.6V8a4.6 4.6 0 0 1 9.2 0"/><path d="M10.4 8h7.6"/><path d="M11.6 11.4l-.6 1.2M14.2 11.4v1.4M16.8 11.4l.6 1.2M11 14.8l-.6 1.2M14.2 14.8v1.4M17.4 14.8l.6 1.2"/>',
  toilet: '<path d="M6.6 3.4h6.6v6.6H6.6z"/><path d="M5.4 10h13.2c0 3.8-2.6 6.4-6.2 6.6l.8 4H9.2l.4-4.2C7.2 15.8 5.4 13.4 5.4 10z"/>',
  sink: '<path d="M3.6 11.6h16.8a8.4 6.6 0 0 1-16.8 0z"/><path d="M12 11.6V5.4a1.8 1.8 0 0 1 3.6 0"/>',
  counter: '<rect x="3.4" y="7.4" width="17.2" height="12.4" rx="1.8"/><path d="M3.4 11.2h17.2"/><circle cx="8.2" cy="15.6" r="1.6"/><path d="M13.6 15.6h3.4"/>',
  fridge: '<rect x="5.6" y="2.8" width="12.8" height="18.4" rx="2.4"/><path d="M5.6 9.4h12.8M8.6 5.4v1.8M8.6 12.2v3"/>',
  rug: '<rect x="4" y="5.6" width="16" height="12.8" rx="1.6"/><path d="M7.4 9h9.2M7.4 12h9.2M7.4 15h9.2"/>',
  stairs: '<path d="M3.6 20.4h4.6v-4.4h4.4v-4.4H17V7.2h3.4"/>',
  pass: '<path d="M3.4 12h3.8M16.8 12h3.8"/><path d="M7.2 6.8v10.4M16.8 6.8v10.4"/><path d="M9.8 12h1.2M13 12h1.2"/>',
  entrance: '<path d="M10.4 3.4h7.4c.7 0 1.2.5 1.2 1.2v14.8c0 .7-.5 1.2-1.2 1.2h-7.4"/><path d="M3.6 12h10.2"/><path d="M10.4 8.6 13.8 12l-3.4 3.4"/>',
  widget: '<rect x="3.4" y="3.4" width="7.6" height="7.6" rx="2"/><rect x="13" y="3.4" width="7.6" height="7.6" rx="2"/><rect x="3.4" y="13" width="17.2" height="7.6" rx="2"/>',
  image: '<rect x="3.4" y="4.4" width="17.2" height="15.2" rx="2.6"/><circle cx="9" cy="9.6" r="1.6"/><path d="M3.8 17.4l5-4.8 3.8 3.4 3-2.6 4.6 4.2"/>',
  pencil: '<path d="M4.4 19.6l1-4.2L15.6 5.2a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.6 18.6z"/><path d="M13.8 7l3.2 3.2"/>',
  trash: '<path d="M4.4 6.6h15.2"/><path d="M9.4 6.6V4.4h5.2v2.2"/><path d="M6.4 6.6l.9 12.6c.1 1 .9 1.6 1.8 1.6h5.8c1 0 1.7-.7 1.8-1.6l.9-12.6"/>',
  undo: '<path d="M8.6 5.4 4.4 9.6l4.2 4.2"/><path d="M4.8 9.6h9.4a5.4 5.4 0 0 1 0 10.8H9.8"/>',
  redo: '<path d="M15.4 5.4l4.2 4.2-4.2 4.2"/><path d="M19.2 9.6H9.8a5.4 5.4 0 0 0 0 10.8h4.4"/>',
  rotate: '<path d="M19.4 12a7.4 7.4 0 1 1-2.2-5.2"/><path d="M19.6 3.8v4.4h-4.4"/>',
  search: '<circle cx="10.6" cy="10.6" r="6.2"/><path d="M15.2 15.2l5 5"/>',
  wand: '<path d="M4.4 19.6 15 9"/><path d="M15.6 3.4v2.4M19.4 7.2h-2.4M18.4 4.4l-1.6 1.6M12.6 4.4l1.2 1.2M18.6 10.2l-1.2-1.2"/>',
  sliders: '<path d="M4 7.4h9.6M17.6 7.4H20M4 16.6h2.4M10.4 16.6H20"/><circle cx="15.6" cy="7.4" r="2"/><circle cx="8.4" cy="16.6" r="2"/>',
  eye: '<path d="M2.8 12s3.4-6.4 9.2-6.4 9.2 6.4 9.2 6.4-3.4 6.4-9.2 6.4S2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.8"/>',
  copy: '<rect x="8.4" y="8.4" width="11.8" height="11.8" rx="2.4"/><path d="M15.6 8.4V6a2.2 2.2 0 0 0-2.2-2.2H6A2.2 2.2 0 0 0 3.8 6v7.4a2.2 2.2 0 0 0 2.2 2.2h2.4"/>',
  fit: '<path d="M4 9V5.4C4 4.6 4.6 4 5.4 4H9M15 4h3.6c.8 0 1.4.6 1.4 1.4V9M20 15v3.6c0 .8-.6 1.4-1.4 1.4H15M9 20H5.4c-.8 0-1.4-.6-1.4-1.4V15"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v5.4"/><circle cx="12" cy="7.8" r=".9" class="f"/>',
  grip: '<circle cx="9" cy="6.6" r="1.2" class="f"/><circle cx="15" cy="6.6" r="1.2" class="f"/><circle cx="9" cy="12" r="1.2" class="f"/><circle cx="15" cy="12" r="1.2" class="f"/><circle cx="9" cy="17.4" r="1.2" class="f"/><circle cx="15" cy="17.4" r="1.2" class="f"/>',
};
const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.dot}</svg>`;

/* Material Design icons from Home Assistant → own glass icons (same style); other mdi icons are drawn by HA itself */
const MDI_MAP = {
  'mdi:movie': 'film', 'mdi:movie-open': 'film', 'mdi:movie-roll': 'film', 'mdi:filmstrip': 'film', 'mdi:popcorn': 'film',
  'mdi:television': 'tv', 'mdi:television-classic': 'tv', 'mdi:weather-sunset': 'sunset', 'mdi:weather-sunset-down': 'sunset',
  'mdi:weather-sunset-up': 'sunrise', 'mdi:weather-night': 'moon', 'mdi:moon-waning-crescent': 'moon', 'mdi:power-sleep': 'moon',
  'mdi:sleep': 'moon', 'mdi:bed': 'moon', 'mdi:book': 'book', 'mdi:book-open': 'book', 'mdi:book-open-variant': 'book',
  'mdi:book-open-page-variant': 'book', 'mdi:lightbulb': 'bulb', 'mdi:lightbulb-on': 'bulb', 'mdi:lightbulb-group': 'bulb',
  'mdi:lightbulb-off': 'bulbOff', 'mdi:lightbulb-group-off': 'bulbOff', 'mdi:power': 'power', 'mdi:weather-sunny': 'sun',
  'mdi:white-balance-sunny': 'sun', 'mdi:robot-vacuum': 'robot', 'mdi:home': 'home', 'mdi:creation': 'sparkle', 'mdi:auto-fix': 'sparkle',
  'mdi:ceiling-light': 'ceiling', 'mdi:chandelier': 'chandelier', 'mdi:floor-lamp': 'floorlamp', 'mdi:desk-lamp': 'desklamp',
  'mdi:lamp': 'lamp', 'mdi:led-strip': 'strip', 'mdi:led-strip-variant': 'strip', 'mdi:spotlight': 'spot', 'mdi:track-light': 'spot',
  'mdi:wall-sconce': 'wall', 'mdi:coffee': 'coffee', 'mdi:coffee-maker': 'coffee', 'mdi:washing-machine': 'washer', 'mdi:fan': 'fan',
  'mdi:thermostat': 'thermo', 'mdi:thermometer': 'thermo', 'mdi:radiator': 'flame', 'mdi:fire': 'flame', 'mdi:snowflake': 'snowflake',
  'mdi:blinds': 'blinds', 'mdi:roller-shade': 'blinds', 'mdi:window-shutter': 'blinds', 'mdi:lock': 'lock', 'mdi:lock-open': 'unlock',
  'mdi:shield-home': 'shield', 'mdi:shield': 'shield', 'mdi:leaf': 'leaf', 'mdi:sprout': 'sprout', 'mdi:speaker': 'speaker',
};
/* Icons offered in the editor for placed devices */
const LAMP_ICONS = ['bulb', 'ceiling', 'chandelier', 'pendant', 'lamp', 'floorlamp', 'desklamp', 'strip', 'spot', 'wall', 'sprout', 'candle'];
const DEVICE_ICONS = ['plug', 'toggle', 'fan', 'coffee', 'washer', 'tv', 'speaker', 'lock', 'door', 'window', 'blinds', 'thermo', 'flame', 'humid', 'motion', 'bolt', 'gauge', 'leaf', 'shield', 'camera', 'bell', 'press', 'robot', 'sparkle'];

/* ================================================================== Model: card configuration → geometry, devices, layers
 * Coordinates are plan units – centimetres by default (`scale: n` = centimetres per unit for traced plans).
 * Rooms are stored edge to edge; the card draws them as glass tiles with a small gap (the walls).
 * UI sizes (fonts, buttons, radii) use design units: 935 design units ≈ the plan's diagonal size (√(w·h)),
 * so the card looks the same for a studio flat and for a house. */

const FURN_KINDS = {
  sofa: { w: 220, h: 90, r: 14, icon: 'sofa' },
  armchair: { w: 85, h: 85, r: 12, icon: 'sofa' },
  bed: { w: 180, h: 200, r: 12, icon: 'bed' },
  bed_single: { w: 90, h: 200, r: 10, icon: 'bed' },
  table: { w: 160, h: 90, r: 8, icon: 'table' },
  round_table: { w: 110, h: 110, c: true, icon: 'round' },
  chair: { w: 46, h: 46, c: true, icon: 'chair' },
  desk: { w: 140, h: 70, r: 8, icon: 'desk' },
  wardrobe: { w: 200, h: 60, r: 8, icon: 'wardrobe' },
  shelf: { w: 100, h: 36, r: 6, icon: 'shelf' },
  sideboard: { w: 160, h: 45, r: 7, icon: 'shelf' },
  tv: { w: 130, h: 14, r: 6, icon: 'tv' },
  counter: { w: 240, h: 62, r: 8, icon: 'counter' },
  fridge: { w: 62, h: 66, r: 6, icon: 'fridge' },
  bath: { w: 170, h: 75, r: 22, icon: 'bath' },
  shower: { w: 90, h: 90, r: 14, icon: 'shower' },
  toilet: { w: 40, h: 62, r: 14, icon: 'toilet' },
  sink: { w: 60, h: 46, r: 14, icon: 'sink' },
  washer: { w: 60, h: 60, r: 8, icon: 'washer' },
  plant: { w: 50, h: 50, c: true, icon: 'sprout' },
  rug: { w: 200, h: 140, r: 16, icon: 'rug' },
  stairs: { w: 100, h: 260, r: 6, icon: 'stairs' },
  block: { w: 80, h: 80, r: 8, icon: 'grip' },
};

/* Built-in layers: which kinds of placed devices they show */
const LAYER_TYPES = {
  light: { icon: 'bulb', kinds: ['light', 'media', 'door'] },
  climate: { icon: 'thermo', kinds: ['climate'] },
  cover: { icon: 'blinds', kinds: ['cover'] },
  vacuum: { icon: 'robot', kinds: ['vacuum'] },
};
const SHOW_KINDS = ['light', 'media', 'door', 'climate', 'cover'];

function kindOf(eid, st) {
  const d = domainOf(eid), dc = st?.attributes?.device_class;
  if (d === 'light') return 'light';
  if (d === 'media_player') return 'media';
  if (d === 'climate' || d === 'water_heater' || d === 'humidifier') return 'climate';
  if (d === 'sensor' && (dc === 'temperature' || dc === 'humidity')) return 'climate';
  if (d === 'cover') return 'cover';
  return 'other';
}

const normPt = (a) => (Array.isArray(a) && a.length >= 2 && a.slice(0, 2).every((v) => Number.isFinite(+v)) ? [+a[0], +a[1]] : null);
function normRect(a) {
  if (!Array.isArray(a) || a.length < 4) return null;
  const [x1, y1, x2, y2] = a.slice(0, 4).map(Number);
  if (![x1, y1, x2, y2].every(Number.isFinite) || x1 === x2 || y1 === y2) return null;
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}
/* Wall segment, always axis-aligned: [x1, y, x2, y] or [x, y1, x, y2]; [x1, x2, y] is accepted as well */
function normSeg(a) {
  if (!Array.isArray(a)) return null;
  let v = a.map(Number);
  if (v.length === 3) v = [v[0], v[2], v[1], v[2]];
  if (v.length < 4 || !v.slice(0, 4).every(Number.isFinite)) return null;
  const [x1, y1, x2, y2] = v;
  if (Math.abs(x2 - x1) >= Math.abs(y2 - y1)) { const y = (y1 + y2) / 2; return [Math.min(x1, x2), y, Math.max(x1, x2), y]; }
  const x = (x1 + x2) / 2;
  return [x, Math.min(y1, y2), x, Math.max(y1, y2)];
}
const segH = (s) => s[1] === s[3];
function normFurn(f) {
  if (!f) return null;
  let rect, kind = 'block', rad = null, circle = false;
  if (Array.isArray(f)) {
    rect = normRect(f);
    const k = f[4];
    if (k === 'c') circle = true;
    else if (typeof k === 'number') rad = k;
    else if (typeof k === 'string') kind = k;
    if (typeof f[5] === 'string') kind = f[5];
  } else {
    rect = normRect(f.rect);
    kind = f.kind || 'block';
    if (f.radius != null) rad = +f.radius;
  }
  if (!rect) return null;
  const def = FURN_KINDS[kind] || FURN_KINDS.block;
  if (def.c) circle = true;
  return { r: rect, kind, rad: rad ?? def.r ?? 8, circle };
}
function normEntity(e) {
  if (typeof e === 'string') e = { entity: e };
  if (!e || typeof e.entity !== 'string' || !e.entity.includes('.')) return null;
  return {
    entity: e.entity, at: normPt(e.at), room: e.room != null ? String(e.room) : null, name: e.name || null, icon: e.icon || null,
    watt: +e.watt || null, power: e.power || null, kelvin: +e.kelvin || null, beams: Math.max(0, Math.min(6, e.beams | 0)),
    plan: e.plan !== false, reach: +e.reach || null, color: Array.isArray(e.color) ? e.color.map(Number) : null,
  };
}

const rectArea = (r) => (r[2] - r[0]) * (r[3] - r[1]);
const inRect = (r, [x, y], m = 0) => x >= r[0] - m && x <= r[2] + m && y >= r[1] - m && y <= r[3] + m;
const rectDist = (r, [x, y]) => Math.hypot(Math.max(r[0] - x, 0, x - r[2]), Math.max(r[1] - y, 0, y - r[3]));
const center = (r) => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
function bboxOf(rects) {
  if (!rects.length) return null;
  return rects.reduce((b, r) => [Math.min(b[0], r[0]), Math.min(b[1], r[1]), Math.max(b[2], r[2]), Math.max(b[3], r[3])], [Infinity, Infinity, -Infinity, -Infinity]);
}

/* Rotates every coordinate of the model by ±90° (portrait phones) */
function rotateModel(M, dir) {
  const B = bboxOf(M.rooms.map((r) => r.r));
  if (!B) return;
  const P = dir > 0 ? ([x, y]) => [B[0] + (B[3] - y), B[1] + (x - B[0])] : ([x, y]) => [B[0] + (y - B[1]), B[1] + (B[2] - x)];
  const R = (r) => { const a = P([r[0], r[1]]), b = P([r[2], r[3]]); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; };
  const S = (s) => { const a = P([s[0], s[1]]), b = P([s[2], s[3]]); return normSeg([a[0], a[1], b[0], b[1]]); };
  for (const r of M.rooms) { r.r = R(r.r); for (const f of r.furn) f.r = R(f.r); }
  M.windows = M.windows.map(S);
  M.passages = M.passages.map(S);
  if (M.entrance) M.entrance = S(M.entrance);
  for (const e of M.ents) if (e.at) e.at = P(e.at);
  if (M.door?.at) M.door.at = P(M.door.at);
  if (M.vac?.dock) M.vac.dock = P(M.vac.dock);
  M.rot = dir;
}

function buildModel(cfg, hass, { mobile = false } = {}) {
  cfg = cfg || {};
  const st = (id) => hass?.states?.[id];
  const ids = new Set();
  const rooms = [];
  (Array.isArray(cfg.rooms) ? cfg.rooms : []).forEach((r, i) => {
    const rect = normRect(r?.rect);
    if (!rect) return;
    let id = String(r.id || slug(r.name) || `room_${i + 1}`);
    while (ids.has(id)) id += '_';
    ids.add(id);
    rooms.push({
      id, name: r.name ?? id, area: r.area || null, r: rect, lb: r.label === 'bottom', m2: +r.m2 || null,
      furn: (Array.isArray(r.furniture) ? r.furniture : []).map(normFurn).filter(Boolean),
      helpers: [].concat(r.helpers || []).filter((h) => typeof h === 'string'),
    });
  });
  const seen = new Set();
  const ents = (Array.isArray(cfg.entities) ? cfg.entities : []).map(normEntity).filter((e) => e && !seen.has(e.entity) && seen.add(e.entity));
  const d = cfg.door;
  const door = d && (d.open || d.doorbell) ? { open: d.open || null, bell: d.doorbell || null, at: normPt(d.at), room: d.room || null, name: d.name || null } : null;
  const v = cfg.vacuum;
  const vac = v && v.entity ? { ...v, dock: normPt(v.dock) } : null;
  const M = {
    cfg, rooms, ents, door, vac, rot: 0,
    windows: (cfg.windows || []).map(normSeg).filter(Boolean),
    passages: (cfg.doors || []).map(normSeg).filter(Boolean),
    entrance: normSeg(cfg.entrance),
    scale: +cfg.scale > 0 ? +cfg.scale : 1,
  };
  for (const e of ents) e.kind = kindOf(e.entity, st(e.entity));
  // weather + indoor sensors (auto-detected unless switched off)
  M.weather = cfg.weather === false ? null : cfg.weather || Object.keys(hass?.states || {}).find((k) => k.startsWith('weather.')) || null;

  const landscape = (() => { const B = bboxOf(rooms.map((r) => r.r)); return B && (B[2] - B[0]) > (B[3] - B[1]) * 1.08; })();
  const mr = cfg.mobile?.rotate ?? 'auto';
  if (mobile && rooms.length) {
    const dir = mr === 'auto' ? (landscape ? 1 : 0) : +mr === 90 ? 1 : +mr === -90 || +mr === 270 ? -1 : 0;
    if (dir) rotateModel(M, dir);
  }
  finishModel(M, hass, mobile);
  return M;
}

function finishModel(M, hass, mobile) {
  const B = bboxOf(M.rooms.map((r) => r.r)) || [0, 0, 1200, 800];
  M.bbox = B;
  M.D = Math.sqrt((B[2] - B[0]) * (B[3] - B[1])) / 935;
  const D = M.D;
  for (const r of M.rooms) {
    r.m2 = r.m2 || (rectArea(r.r) * M.scale * M.scale) / 1e4;
  }
  // devices → room (explicit, else the room under the marker, else the nearest one)
  const byId = Object.fromEntries(M.rooms.map((r) => [r.id, r]));
  const roomFor = (pt, explicit) => {
    if (explicit && byId[explicit]) return explicit;
    if (!pt || !M.rooms.length) return null;
    const hits = M.rooms.filter((r) => inRect(r.r, pt));
    if (hits.length) return hits.sort((a, b) => rectArea(a.r) - rectArea(b.r))[0].id;
    return M.rooms.slice().sort((a, b) => rectDist(a.r, pt) - rectDist(b.r, pt))[0].id;
  };
  M.roomAt = (pt) => roomFor(pt);
  for (const e of M.ents) {
    e.room = roomFor(e.at, e.room);
    if (!e.room && hass?.entities?.[e.entity]) {
      const area = hass.entities[e.entity].area_id || hass.devices?.[hass.entities[e.entity].device_id]?.area_id;
      e.room = M.rooms.find((r) => r.area && r.area === area)?.id || null;
    }
    const rm = byId[e.room];
    e.reach = e.reach || (rm ? clamp(0.8 * Math.sqrt(rectArea(rm.r)), 110 * D, 300 * D) : 200 * D);
  }
  if (M.door) M.door.room = roomFor(M.door.at, M.door.room);
  M.byRoom = byId;

  // indoor climate: configured sensors, else every placed temperature / humidity source
  const ic = M.cfg.indoor;
  M.indoor = ic === false ? [] : Array.isArray(ic) && ic.length ? ic : M.ents.filter((e) => e.kind === 'climate').map((e) => e.entity);
  M.layers = buildLayers(M);
  M.widgets = placeWidgets(M, mobile);
  const all = [B, ...['card', 'weather', 'indoor', 'door', 'bar'].map((k) => M.widgets[k]).filter(Boolean)];
  const U = bboxOf(all), m = 6 * D;
  M.stage = { x: U[0] - m, y: U[1] - m, w: U[2] - U[0] + 2 * m, h: U[3] - U[1] + 2 * m };
}

function buildLayers(M) {
  let list = M.cfg.layers;
  if (!Array.isArray(list) || !list.length) {
    list = [];
    if (M.ents.some((e) => e.kind === 'light' || e.kind === 'media') || M.door) list.push('light');
    if (M.ents.some((e) => e.kind === 'climate')) list.push('climate');
    if (M.ents.some((e) => e.kind === 'cover')) list.push('cover');
    if (M.vac) list.push('vacuum');
    if (!list.length) list.push('light');
  }
  const out = [], used = new Set();
  list.forEach((l, i) => {
    let L;
    if (typeof l === 'string' || (l && LAYER_TYPES[l.type] && !l.show && !l.entities)) {
      const type = typeof l === 'string' ? l : l.type;
      if (!LAYER_TYPES[type]) return;
      L = { id: type, type, name: l.name || null, icon: l.icon || LAYER_TYPES[type].icon, kinds: new Set(LAYER_TYPES[type].kinds), ents: new Set() };
    } else if (l && typeof l === 'object') {
      L = {
        id: String(l.id || `layer_${slug(l.name) || i + 1}`), type: 'custom', name: l.name || null, icon: l.icon || 'layers',
        kinds: new Set([].concat(l.show || []).filter((k) => SHOW_KINDS.includes(k))), ents: new Set([].concat(l.entities || [])),
      };
    }
    if (!L || used.has(L.id) || (L.type === 'vacuum' && !M.vac)) return;
    used.add(L.id);
    out.push(L);
  });
  if (!out.length) out.push({ id: 'light', type: 'light', name: null, icon: 'bulb', kinds: new Set(LAYER_TYPES.light.kinds), ents: new Set() });
  return out;
}
const inLayer = (L, e) => !!L && (L.kinds.has(e.kind) || L.ents.has(e.entity));

/* ---------------------------------------------------------------- Free-space layout for the info tiles
 * Tiles (weather, indoor, front door), the layer card and the layer bar go into empty corners of the plan –
 * like the hand-made original. A coarse grid marks the rooms; every widget takes the best free spot,
 * grows into the space around it and snaps its edges to the walls. What does not fit goes next to the plan. */
function placeWidgets(M, mobile) {
  const B = M.bbox, D = M.D, cfgW = (!mobile && M.cfg.widgets) || {};
  const out = { card: null, weather: null, indoor: null, door: null, bar: null, side: null };
  const tiles = ['weather', 'indoor', 'door'].filter((k) => (k === 'weather' ? M.weather : k === 'indoor' ? M.indoor.length : M.door) && cfgW[k] !== false);
  const needBar = !mobile && M.layers.length > 1;
  if (!M.rooms.length) return out;

  const nx = clamp(Math.round((B[2] - B[0]) / (7 * D)), 8, 260), ny = clamp(Math.round((B[3] - B[1]) / (7 * D)), 8, 260);
  const cw = (B[2] - B[0]) / nx, ch = (B[3] - B[1]) / ny;
  const occ = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = [B[0] + (i + 0.5) * cw, B[1] + (j + 0.5) * ch];
    if (M.rooms.some((r) => inRect(r.r, p))) occ[j * nx + i] = 1;
  }
  let P;
  const sums = () => {
    P = new Int32Array((nx + 1) * (ny + 1));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) P[(j + 1) * (nx + 1) + i + 1] = occ[j * nx + i] + P[j * (nx + 1) + i + 1] + P[(j + 1) * (nx + 1) + i] - P[j * (nx + 1) + i];
  };
  sums();
  const free = (i, j, w, h) => i >= 0 && j >= 0 && i + w <= nx && j + h <= ny
    && P[(j + h) * (nx + 1) + i + w] - P[j * (nx + 1) + i + w] - P[(j + h) * (nx + 1) + i] + P[j * (nx + 1) + i] === 0;
  const cells = (v, c) => Math.max(1, Math.ceil(v / c));
  const toRect = ({ i, j, w, h }) => [B[0] + i * cw, B[1] + j * ch, B[0] + (i + w) * cw, B[1] + (j + h) * ch];
  const mark = ({ i, j, w, h }) => { for (let y = j; y < j + h; y++) for (let x = i; x < i + w; x++) occ[y * nx + x] = 1; sums(); };
  // best free spot for a minimum size, scored by preference
  const find = (wMin, hMin, score) => {
    const w = cells(wMin, cw), h = cells(hMin, ch);
    let best = null;
    for (let j = 0; j + h <= ny; j++) for (let i = 0; i + w <= nx; i++) {
      if (!free(i, j, w, h)) continue;
      const s = score(i, j, w, h);
      if (!best || s > best.s) best = { i, j, w, h, s };
    }
    return best;
  };
  // grow into the free space around it, up to a maximum size
  const grow = (c, wMax, hMax) => {
    const W = cells(wMax, cw), H = cells(hMax, ch);
    let changed = true;
    while (changed) {
      changed = false;
      if (c.w < W && free(c.i + c.w, c.j, 1, c.h)) { c.w++; changed = true; }
      if (c.h < H && free(c.i, c.j + c.h, c.w, 1)) { c.h++; changed = true; }
      if (c.w < W && free(c.i - 1, c.j, 1, c.h)) { c.i--; c.w++; changed = true; }
      if (c.h < H && free(c.i, c.j - 1, c.w, 1)) { c.j--; c.h++; changed = true; }
    }
    return c;
  };
  // snap edges onto nearby walls / plan edges (the grid is coarse)
  const xs = [B[0], B[2], ...M.rooms.flatMap((r) => [r.r[0], r.r[2]])], ys = [B[1], B[3], ...M.rooms.flatMap((r) => [r.r[1], r.r[3]])];
  const snap = (r) => {
    const s = (v, list, tol) => { let b = v, d = tol; for (const q of list) { const dd = Math.abs(q - v); if (dd < d) { d = dd; b = q; } } return b; };
    return [s(r[0], xs, cw * 1.6), s(r[1], ys, ch * 1.6), s(r[2], xs, cw * 1.6), s(r[3], ys, ch * 1.6)];
  };
  const edge = (c) => ({ l: c.i === 0, r: c.i + c.w === nx, t: c.j === 0, b: c.j + c.h === ny });

  const g = 13 * D;
  // phones draw the tiles with fixed pixel fonts: they need more room in design units
  const TILE = mobile ? { w: 290 + g, h: 225 + g, minW: 240 + g, minH: 196 + g, maxW: 380 + g, maxH: 280 + g }
    : { w: 209 + g, h: 118 + g, minW: 158 + g, minH: 92 + g, maxW: 300 + g, maxH: 150 + g };
  const CARD = { w: 446 + g, h: 212 + g, minW: 318 + g, minH: 180 + g, maxW: 560 + g, maxH: 250 + g };
  const BAR = { w: 76 + g, h: Math.max(1, M.layers.length) * 64 + 12 + g };

  for (const k of ['card', 'weather', 'indoor', 'door', 'bar']) if (Array.isArray(cfgW[k])) out[k] = normRect(cfgW[k]);

  // layer card (desktop): prefers the bottom right
  if (!mobile && !out.card) {
    const c = find(CARD.minW, CARD.minH, (i, j, w, h) => (j + h / 2) / ny * 2 + (i + w / 2) / nx + (j + h === ny ? 2 : 0) + (i + w === nx ? 1 : 0));
    if (c) { grow(c, CARD.maxW, CARD.maxH); out.card = snap(toRect(c)); mark(c); }
  }
  // info tiles: as one column, else as one row, else one by one
  const todo = tiles.filter((k) => !out[k]);
  if (todo.length) {
    const n = todo.length;
    const colScore = mobile ? (i, j, w, h) => -(i + w / 2) / nx + (j + h / 2) / ny : (i, j, w, h) => (i + w / 2) / nx * 2 - (j / ny) * 0.5 + (i + w === nx ? 2 : 0) + (j === 0 ? 1 : 0);
    let c = find(TILE.minW, n * TILE.minH, colScore), dir = 'col';
    if (!c && n > 1) { c = find(n * TILE.minW, TILE.minH, colScore); dir = 'row'; }
    if (c) {
      grow(c, dir === 'col' ? TILE.maxW : n * TILE.maxW, dir === 'col' ? n * TILE.maxH : TILE.maxH);
      const R = snap(toRect(c));
      mark(c);
      const weights = todo.map((k) => (k === 'door' ? 1.18 : 1)), sum = weights.reduce((a, b) => a + b, 0);
      let pos = dir === 'col' ? R[1] : R[0];
      todo.forEach((k, idx) => {
        const len = ((dir === 'col' ? R[3] - R[1] : R[2] - R[0]) * weights[idx]) / sum;
        out[k] = dir === 'col' ? [R[0], pos, R[2], pos + len] : [pos, R[1], pos + len, R[3]];
        pos += len;
      });
    } else {
      for (const k of todo) {
        const t = find(TILE.minW, TILE.minH, colScore);
        if (!t) continue;
        grow(t, TILE.maxW, TILE.maxH * (k === 'door' ? 1.18 : 1));
        out[k] = snap(toRect(t));
        mark(t);
      }
    }
  }
  // layer bar (desktop): a free strip on the left
  if (needBar && !out.bar) {
    const c = find(BAR.w, BAR.h, (i, j, w, h) => -(i + w / 2) / nx * 3 + (i === 0 ? 2 : 0) - Math.abs((j + h / 2) / ny - 0.36));
    if (c) out.bar = toRect(c);
  }

  // what did not fit goes into a column next to the plan (desktop) or a row under it (phone), drawn at a readable size
  const left = tiles.filter((k) => !out[k]);
  if (left.length || (!mobile && !out.card)) out.side = { tiles: left, card: !mobile && !out.card };
  if (needBar && !out.bar) { const cy = B[1] + (B[3] - B[1]) * 0.36; out.bar = [B[0] - BAR.w, cy - BAR.h / 2, B[0], cy + BAR.h / 2]; }
  return out;
}

/* ---------------------------------------------------------------- Room graph (robot routes)
 * Doors connect rooms; without drawn doors, rooms that share a long enough wall count as connected. */
function roomGraph(M) {
  if (M._graph) return M._graph;
  const D = M.D, tol = 5 * D, edges = [];
  const touching = (s) => M.rooms.filter((r) => {
    const q = r.r;
    if (segH(s)) return (Math.abs(q[1] - s[1]) < tol || Math.abs(q[3] - s[1]) < tol) && (s[0] + s[2]) / 2 > q[0] && (s[0] + s[2]) / 2 < q[2];
    return (Math.abs(q[0] - s[0]) < tol || Math.abs(q[2] - s[0]) < tol) && (s[1] + s[3]) / 2 > q[1] && (s[1] + s[3]) / 2 < q[3];
  });
  const add = (a, b, door, horiz) => {
    const o = 30 * D, ca = center(a.r), cb = center(b.r);
    const off = (r, c) => (horiz ? [door[0], door[1] + Math.sign(c[1] - door[1]) * o] : [door[0] + Math.sign(c[0] - door[0]) * o, door[1]]);
    edges.push({ a: a.id, b: b.id, door, ina: off(a, ca), inb: off(b, cb) });
  };
  for (const s of M.passages) {
    const rs = touching(s);
    if (rs.length >= 2) add(rs[0], rs[1], [(s[0] + s[2]) / 2, (s[1] + s[3]) / 2], segH(s));
  }
  const linked = (id) => edges.some((e) => e.a === id || e.b === id);
  for (let i = 0; i < M.rooms.length; i++) for (let j = i + 1; j < M.rooms.length; j++) {
    const a = M.rooms[i], b = M.rooms[j];
    if (M.passages.length && linked(a.id) && linked(b.id)) continue;
    const A = a.r, Bq = b.r;
    const ov = (p1, p2, q1, q2) => [Math.max(p1, q1), Math.min(p2, q2)];
    if (Math.abs(A[2] - Bq[0]) < tol || Math.abs(Bq[2] - A[0]) < tol) {
      const [y1, y2] = ov(A[1], A[3], Bq[1], Bq[3]);
      if (y2 - y1 > 60 * D) add(a, b, [Math.abs(A[2] - Bq[0]) < tol ? A[2] : A[0], (y1 + y2) / 2], false);
    } else if (Math.abs(A[3] - Bq[1]) < tol || Math.abs(Bq[3] - A[1]) < tol) {
      const [x1, x2] = ov(A[0], A[2], Bq[0], Bq[2]);
      if (x2 - x1 > 60 * D) add(a, b, [(x1 + x2) / 2, Math.abs(A[3] - Bq[1]) < tol ? A[3] : A[1]], true);
    }
  }
  M._graph = edges;
  return edges;
}

/* Waypoints from a point in one room to a point in another (rooms are rectangles, so straight lines stay inside) */
function routeBetween(M, fromRoom, toRoom) {
  if (!fromRoom || !toRoom || fromRoom === toRoom) return [];
  const E = roomGraph(M), prev = { [fromRoom]: null }, q = [fromRoom];
  while (q.length) {
    const k = q.shift();
    if (k === toRoom) break;
    for (const e of E) {
      const n = e.a === k ? e.b : e.b === k ? e.a : null;
      if (n && !(n in prev)) { prev[n] = { k, e }; q.push(n); }
    }
  }
  if (!(toRoom in prev)) return [];
  const hops = [];
  for (let k = toRoom; prev[k]; k = prev[k].k) hops.unshift(prev[k]);
  const pts = [];
  for (const { k, e } of hops) pts.push(...(e.a === k ? [e.ina, e.door, e.inb] : [e.inb, e.door, e.ina]));
  return pts.map((p) => [...p]);
}

/* ================================================================== Styles (everything scales with --u = px per design unit) */
const STYLES = `
:host { display: block; }
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
button:focus-visible, [tabindex]:focus-visible { outline: 2px solid rgba(var(--blue), .9); outline-offset: 2px; }
.ic { width: 1em; height: 1em; fill: none; stroke: var(--ip, url(#gfcg)); stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; flex: none; display: block; }
.ic .f { fill: var(--ip, url(#gfcg)); stroke: none; }
.defs { position: absolute; width: 0; height: 0; overflow: hidden; }
ha-icon, ha-state-icon { display: grid; place-items: center; color: rgba(232, 234, 240, .86); }

.root {
  --t1: #f5f5f7; --t2: rgba(235, 235, 245, .6); --t3: rgba(235, 235, 245, .36);
  --gold: 246, 200, 89; --blue: 10, 132, 255; --green: 48, 209, 88; --red: 255, 69, 58; --orange: 255, 159, 10;
  --u: .66px; --gap: calc(13 * var(--u)); --warm: 0; --day: 0;
  position: relative; height: 100%; overflow: hidden; isolation: isolate;
  background: #08090c; color: var(--t1);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Inter, system-ui, sans-serif;
  font-size: 14px; line-height: 1.25; letter-spacing: -.01em;
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
}
.root.boot *, .root.boot *::before, .root.boot *::after { transition: none !important; animation: none !important; }

/* ---------------------------------------------------------------- Background */
.bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
.bg i { position: absolute; inset: 0; transition: opacity 1.8s ease; }
.bg .g1 { background: radial-gradient(62% 80% at 2% 22%, rgba(132, 104, 44, .62), rgba(100, 78, 32, .26) 42%, rgba(60, 46, 20, 0) 76%); opacity: var(--warm); }
.bg .g2 { background: radial-gradient(50% 62% at 66% 100%, rgba(118, 64, 42, .55), rgba(86, 46, 30, .2) 46%, rgba(60, 30, 20, 0) 78%); opacity: calc(var(--warm) * .95); }
.bg .g3 { background: radial-gradient(70% 70% at 8% 6%, rgba(46, 64, 120, .30), rgba(30, 40, 80, 0) 70%), radial-gradient(60% 60% at 80% 100%, rgba(36, 46, 96, .24), rgba(30, 40, 80, 0) 70%); opacity: calc((1 - var(--warm)) * (1 - var(--day) * .6)); }
.bg .g4 { background: radial-gradient(90% 80% at 30% 0%, rgba(130, 150, 180, .2), rgba(80, 90, 110, 0) 72%), linear-gradient(180deg, rgba(40, 46, 58, .5), rgba(20, 22, 28, 0)); opacity: calc(var(--day) * (1 - var(--warm) * .5)); }
.bg .g5 { background: radial-gradient(60% 70% at 20% 10%, rgba(40, 90, 120, .34), rgba(30, 60, 90, 0) 70%), radial-gradient(60% 60% at 90% 90%, rgba(120, 70, 40, .26), rgba(80, 40, 20, 0) 70%); opacity: 0; }
.root[data-type="climate"] .bg .g5 { opacity: 1; }
.root[data-type="climate"] .bg .g1, .root[data-type="climate"] .bg .g2 { opacity: calc(var(--warm) * .35); }
.bg .dots { background-image: radial-gradient(circle, rgba(255, 255, 255, .08) .8px, rgba(255, 255, 255, 0) 1.25px); background-size: calc(27.6 * var(--u)) calc(27.6 * var(--u)); background-position: var(--dx, 0) var(--dy, 0); }

/* ---------------------------------------------------------------- Layout */
.lay { position: absolute; inset: 0; z-index: 1; }
.stage { position: absolute; left: var(--sx, 24px); top: var(--sy, 20px); width: var(--sw, 700px); height: var(--sh, 640px); }

/* ---------------------------------------------------------------- Floor plan */
.glows { position: absolute; inset: 0; z-index: 0; pointer-events: none; transition: opacity .6s ease; }
.glows i { position: absolute; border-radius: 50%; transform: translate(-50%, -50%); width: calc(var(--r) * 3.1 * var(--u)); height: calc(var(--r) * 3.1 * var(--u));
  background: radial-gradient(closest-side, rgba(var(--c), .3), rgba(var(--c), .1) 52%, rgba(var(--c), 0)); opacity: 0;
  transform: translate(-50%, -50%) scale(.6); transition: opacity 1.1s ease, transform 1.6s cubic-bezier(.16, .8, .24, 1); }
.glows i.on { opacity: var(--o, 1); transform: translate(-50%, -50%) scale(1); }

.pas { position: absolute; z-index: 0; border-radius: calc(4 * var(--u)); background: rgba(255, 255, 255, .13); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .05); pointer-events: none; }
.win { position: absolute; z-index: 4; height: max(2px, calc(3.4 * var(--u))); transform: translateY(-50%); border-radius: 4px; pointer-events: none;
  background: rgb(calc(196 + 59 * var(--day)), calc(208 + 47 * var(--day)), calc(232 + 23 * var(--day)));
  box-shadow: 0 0 calc(6 * var(--u)) rgba(200, 220, 255, calc(.35 + .4 * var(--day))), 0 0 calc(18 * var(--u)) rgba(200, 220, 255, calc(.12 + .3 * var(--day)));
  opacity: calc(.22 + .78 * var(--op, 1)); transition: opacity .8s ease; }
.win.v { height: auto; width: max(2px, calc(3.4 * var(--u))); transform: translateX(-50%); }
.win.fd { height: max(3px, calc(4.6 * var(--u))); background: #fff; opacity: 1; box-shadow: 0 0 calc(8 * var(--u)) rgba(255, 255, 255, .6), 0 0 calc(20 * var(--u)) rgba(255, 255, 255, .18); transition: background .4s, box-shadow .4s; }
.win.v.fd { height: auto; width: max(3px, calc(4.6 * var(--u))); }
.win.fd.open { background: rgb(var(--green)); box-shadow: 0 0 calc(10 * var(--u)) rgba(var(--green), .8), 0 0 calc(26 * var(--u)) rgba(var(--green), .4); }
/* shutters: in the covers layer a closed window shows a dark slat instead of daylight */
.win.cv::after { content: ''; position: absolute; inset: -1px; border-radius: inherit; background: rgba(30, 32, 40, .92); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .25);
  transform: scaleX(calc(1 - var(--op, 1))); transform-origin: 50% 50%; opacity: 0; transition: transform .8s var(--soft), opacity .4s; }
.win.v.cv::after { transform: scaleY(calc(1 - var(--op, 1))); }
.root[data-type="cover"] .win.cv { opacity: 1; }
.root[data-type="cover"] .win.cv::after { opacity: 1; }

.room { position: absolute; z-index: 1; border-radius: calc(15 * var(--u)); overflow: hidden; cursor: pointer; outline: none;
  background: linear-gradient(165deg, rgba(255, 255, 255, .055), rgba(255, 255, 255, .02) 55%, rgba(255, 255, 255, .015)), rgba(16, 16, 20, .42);
  -webkit-backdrop-filter: blur(10px) saturate(130%); backdrop-filter: blur(10px) saturate(130%);
  box-shadow: 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0, 0, 0, .18);
  transition: box-shadow .6s ease, background .5s ease, transform var(--sp-ms) var(--sp); }
.room::after { content: ''; position: absolute; inset: 0; z-index: 5; border-radius: inherit; pointer-events: none;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .11), inset 0 1px 0 rgba(255, 255, 255, .05); transition: box-shadow .5s ease; }
.room .ri { position: absolute; inset: calc(var(--gap) / -2); pointer-events: none; }
.room.lit { box-shadow: 0 0 calc(26 * var(--u)) rgba(var(--lc), .12), 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0, 0, 0, .18); }
.room.lit::after { box-shadow: inset 0 0 0 1px rgba(var(--lc), .58), inset 0 0 calc(18 * var(--u)) rgba(var(--lc), .07); }
.room:hover::after { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .28), inset 0 1px 0 rgba(255, 255, 255, .08); }
.room.lit:hover::after { box-shadow: inset 0 0 0 1px rgba(var(--lc), .85), inset 0 0 calc(18 * var(--u)) rgba(var(--lc), .1); }
.room:active { transform: scale(.994); }
.room:focus-visible::after { box-shadow: inset 0 0 0 2px rgba(var(--blue), .9); }
/* rooms without anything to show in the current layer are just floor plan (no pop-up, no hover) */
.room.idle { cursor: default; }
.room.idle:hover::after { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .11), inset 0 1px 0 rgba(255, 255, 255, .05); }
.room.lit.idle:hover::after { box-shadow: inset 0 0 0 1px rgba(var(--lc), .58), inset 0 0 calc(18 * var(--u)) rgba(var(--lc), .07); }
.room.idle:active { transform: none; }

.rgl { position: absolute; inset: 0; z-index: 0; pointer-events: none; transition: opacity .6s ease; }
.rgl i { position: absolute; border-radius: 50%; transform: translate(-50%, -50%); width: calc(var(--r) * 2 * var(--u)); height: calc(var(--r) * 2 * var(--u));
  background: radial-gradient(closest-side, rgba(var(--c), .74), rgba(var(--c), .4) 30%, rgba(var(--c), .14) 66%, rgba(var(--c), 0)); opacity: 0;
  transform: translate(-50%, -50%) scale(.72); transition: opacity .9s ease, transform 1.4s cubic-bezier(.16, .8, .24, 1); }
.rgl i.on { opacity: var(--o, 1); transform: translate(-50%, -50%) scale(1); }
/* spot light cones: 100° beams, brightest in the middle, soft towards the edges and with distance */
.rgl i.cone { border-radius: 0;
  --cb: rgba(var(--c), 0), rgba(var(--c), .34) 5deg, rgba(var(--c), .5) 18deg, rgba(var(--c), .62) 50deg, rgba(var(--c), .5) 82deg, rgba(var(--c), .34) 95deg, rgba(var(--c), 0) 100deg, rgba(var(--c), 0);
  background: var(--cones);
  -webkit-mask: radial-gradient(closest-side, #000 10%, rgba(0, 0, 0, .78) 30%, rgba(0, 0, 0, .34) 62%, rgba(0, 0, 0, .1) 84%, transparent);
  mask: radial-gradient(closest-side, #000 10%, rgba(0, 0, 0, .78) 30%, rgba(0, 0, 0, .34) 62%, rgba(0, 0, 0, .1) 84%, transparent);
  transform: translate(-50%, -50%) scale(.45) rotate(-14deg); transition: opacity 1s ease, transform 1.5s cubic-bezier(.16, .8, .24, 1); }
.rgl i.cone.on { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
/* daylight through the windows (direction = wall of the window) */
.rgl i.dl { border-radius: 0; transform: none; width: auto; height: auto; opacity: calc(var(--dli, 0) * var(--op, 1)); transition: opacity 2s ease;
  background: radial-gradient(50% 100% at 50% 0%, rgba(var(--dlc, 226, 236, 255), .2), rgba(var(--dlc, 226, 236, 255), .07) 55%, rgba(var(--dlc, 226, 236, 255), 0)); }
.rgl i.dl.up { background: radial-gradient(50% 100% at 50% 100%, rgba(var(--dlc, 226, 236, 255), .2), rgba(var(--dlc, 226, 236, 255), .07) 55%, rgba(var(--dlc, 226, 236, 255), 0)); }
.rgl i.dl.r { background: radial-gradient(100% 50% at 100% 50%, rgba(var(--dlc, 226, 236, 255), .2), rgba(var(--dlc, 226, 236, 255), .07) 55%, rgba(var(--dlc, 226, 236, 255), 0)); }
.rgl i.dl.l { background: radial-gradient(100% 50% at 0% 50%, rgba(var(--dlc, 226, 236, 255), .2), rgba(var(--dlc, 226, 236, 255), .07) 55%, rgba(var(--dlc, 226, 236, 255), 0)); }
/* climate layer: the room glows in its temperature colour */
.ctint { position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: 0; transition: opacity .7s ease, background .7s ease;
  background: radial-gradient(120% 90% at 30% 20%, rgba(var(--tc), .26), rgba(var(--tc), .1) 55%, rgba(var(--tc), .04)); }
.root[data-type="climate"] .room.tt .ctint, .root[data-show-climate] .room.tt .ctint { opacity: 1; }
.root[data-type="climate"] .room.tt::after { box-shadow: inset 0 0 0 1px rgba(var(--tc), .55), inset 0 0 calc(22 * var(--u)) rgba(var(--tc), .1); }
.root[data-type="climate"] .room.tt { box-shadow: 0 0 calc(26 * var(--u)) rgba(var(--tc), .1), 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0, 0, 0, .18); }

.fu { position: absolute; z-index: 1; pointer-events: none; border-radius: calc(var(--fr, 8) * var(--u));
  background: linear-gradient(165deg, rgba(255, 255, 255, .075), rgba(255, 255, 255, .03));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .12), inset 0 1px 0 rgba(255, 255, 255, .05); transition: background .5s, box-shadow .5s; }
.fu.c { border-radius: 50%; }
.fu.rug { background: rgba(255, 255, 255, .025); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07); }
.fu.tv.on { background: linear-gradient(180deg, rgba(190, 210, 255, .55), rgba(120, 160, 255, .35)); box-shadow: inset 0 0 0 1px rgba(200, 220, 255, .75), 0 0 calc(16 * var(--u)) rgba(120, 165, 255, .7); }

.rl { position: absolute; z-index: 3; left: calc(16 * var(--u)); right: calc(8 * var(--u)); top: calc(13 * var(--u)); pointer-events: none; text-shadow: 0 1px 10px rgba(0, 0, 0, .3); }
.rl b { display: block; font-weight: 650; font-size: max(11px, calc(17 * var(--u))); letter-spacing: -.012em; line-height: 1.15; color: var(--t1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rl span { display: block; margin-top: calc(3 * var(--u)); font-weight: 500; font-size: max(10.5px, calc(14 * var(--u))); color: var(--t2); min-height: 1em; transition: color .4s; white-space: nowrap; font-variant-numeric: tabular-nums; }
.room.lit .rl span { color: rgba(235, 235, 245, .66); }
.room.lb .rl { top: auto; bottom: calc(14 * var(--u)); }
.badge { position: absolute; z-index: 4; top: calc(11 * var(--u)); right: calc(11 * var(--u)); width: max(20px, calc(28 * var(--u))); height: max(20px, calc(28 * var(--u)));
  border-radius: 50%; display: grid; place-items: center; background: rgb(var(--blue)); color: #fff; font-size: max(11px, calc(14 * var(--u))); font-weight: 700;
  box-shadow: 0 4px 12px rgba(var(--blue), .45); transform: scale(0); transition: transform var(--pop-ms) var(--pop); }

/* Markers: lamps and devices as glowing glass buttons */
.lamp, .dev { position: absolute; z-index: 6; --ls: max(34px, calc(52 * var(--u))); width: var(--ls); height: var(--ls); margin: calc(var(--ls) / -2) 0 0 calc(var(--ls) / -2);
  border-radius: 50%; display: grid; place-items: center; transition: transform var(--sp-ms) var(--sp), opacity .35s ease, left .55s var(--soft), top .55s var(--soft); }
.dev { --ls: max(30px, calc(44 * var(--u))); }
.lamp > i, .dev > i { position: absolute; border-radius: 50%; pointer-events: none; }
.lamp .disc, .dev .disc { inset: 0; background: rgba(255, 255, 255, .12);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .17), inset 0 1px 0 rgba(255, 255, 255, .12), 0 5px 14px rgba(0, 0, 0, .3);
  -webkit-backdrop-filter: blur(14px) saturate(150%); backdrop-filter: blur(14px) saturate(150%); transition: background .35s ease, box-shadow .45s ease; }
.lamp .halo, .dev .halo { inset: calc(var(--ls) * -.62); background: radial-gradient(closest-side, rgba(var(--c), .46), rgba(var(--c), .16) 55%, rgba(var(--c), 0));
  opacity: 0; transform: scale(.55); transition: opacity .5s ease, transform var(--soft-ms) var(--soft); }
.lamp.on .halo, .dev.on .halo { opacity: 1; transform: scale(1); }
.lamp.on .disc, .dev.on .disc { background: radial-gradient(circle at 50% 28%, rgb(var(--cl)), rgb(var(--c)) 72%);
  box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .3), inset 0 -2px 6px rgba(0, 0, 0, .08), 0 0 0 calc(var(--ls) * .12) rgba(var(--c), .13), 0 3px 16px rgba(var(--c), .42); }
/* fixed size (not via inset): Safari/iOS would not stretch the SVG and the ring would sit off-centre */
.lamp .ring, .dev .ring { position: absolute; left: 6.5%; top: 6.5%; width: 87%; height: 87%; transform: rotate(-90deg); overflow: visible; pointer-events: none; }
.lamp .ring circle, .dev .ring circle { fill: none; stroke-width: 2.4; stroke-linecap: round; stroke: rgba(0, 0, 0, .34); vector-effect: non-scaling-stroke;
  transition: stroke-dasharray .7s var(--soft), stroke .35s, opacity .35s; }
.lamp.on .ring circle { stroke: rgba(40, 26, 0, .36); }
.lamp.on.dk .ring circle, .dev.on.dk .ring circle { stroke: rgba(255, 255, 255, .5); }
.dev .ring circle { stroke: rgba(255, 255, 255, .78); }
.dev.on .ring circle { stroke: rgba(10, 24, 60, .45); }
.lamp > .ic, .dev > .ic, .dev > ha-icon, .dev > ha-state-icon { position: relative; font-size: calc(var(--ls) * .48); stroke-width: 1.95; transition: color .3s ease; pointer-events: none; }
.dev > .ic { font-size: calc(var(--ls) * .46); }
.dev > ha-icon, .dev > ha-state-icon { --mdc-icon-size: calc(var(--ls) * .5); }
.lamp.on > .ic { --ip: currentColor; color: rgba(44, 30, 2, .9); }
.lamp.on.dk > .ic { color: #fff; }
.dev.on > .ic { --ip: currentColor; color: rgba(10, 24, 60, .88); }
.dev.on > ha-icon, .dev.on > ha-state-icon { color: rgba(10, 24, 60, .88); }
.dev.on.dk > .ic, .dev.on.dk > ha-icon, .dev.on.dk > ha-state-icon { color: #fff; }
.lamp.na, .dev.na { opacity: .45; }
.lamp:hover, .dev:hover { transform: scale(1.08); }
.lamp.pressed, .dev.pressed { transform: scale(.9); transition-duration: .12s; }
.lamp .rip, .dev .rip { inset: 0; border: 1.5px solid rgba(var(--c), .9); box-shadow: 0 0 calc(var(--ls) * .25) rgba(var(--c), .5), inset 0 0 calc(var(--ls) * .2) rgba(var(--c), .35); opacity: 0; }
.dev.door.open .disc { background: rgb(var(--green)); box-shadow: 0 0 0 calc(var(--ls) * .14) rgba(var(--green), .18), 0 0 18px rgba(var(--green), .6); }
.dev.door.open > .ic { --ip: currentColor; color: #04210c; }
/* value markers (thermostats, sensors): the reading instead of an icon */
.dev.val { --ls: max(34px, calc(50 * var(--u))); }
.dev.val .vt { position: relative; font-size: max(11px, calc(16 * var(--u))); font-weight: 650; letter-spacing: -.03em; font-variant-numeric: tabular-nums; pointer-events: none; transition: color .3s; }
.dev.val .vt small { font-size: .72em; font-weight: 600; opacity: .7; }
.dev.val.sens { --ls: max(30px, calc(44 * var(--u))); }
.dev.val.sens .vt { font-size: max(10px, calc(14 * var(--u))); }
.dev.val.sens .disc { background: rgba(255, 255, 255, .07); }
.dev.val.on .vt { color: rgba(30, 14, 0, .9); }
.dev.val.on.dk .vt { color: #fff; }
.dev .act { position: absolute; right: -6%; bottom: -6%; width: 40%; height: 40%; border-radius: 50%; display: grid; place-items: center; font-size: calc(var(--ls) * .22);
  background: rgba(28, 28, 34, .9); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .2); opacity: 0; transform: scale(.4); transition: opacity .3s, transform var(--pop-ms) var(--pop); }
.dev .act .ic { --ip: rgb(var(--c)); stroke-width: 2.2; }
.dev.on .act { opacity: 1; transform: none; }
/* markers of other layers fade out */
.lamp.hid, .dev.hid { opacity: 0; transform: scale(.5); pointer-events: none; }
.root[data-glow="dim"] .rgl, .root[data-glow="dim"] .glows { opacity: .3; }
.root[data-glow="dim"] .room.lit::after { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .14); }
.root[data-glow="dim"] .room.lit { box-shadow: 0 calc(10 * var(--u)) calc(30 * var(--u)) rgba(0, 0, 0, .18); }

/* Tooltip */
.tip { position: absolute; z-index: 30; left: 0; top: 0; pointer-events: none; padding: 7px 11px 7px; border-radius: 11px; white-space: nowrap;
  font-size: 12.5px; font-weight: 600; color: var(--t1); background: rgba(36, 36, 42, .8);
  -webkit-backdrop-filter: blur(24px) saturate(180%); backdrop-filter: blur(24px) saturate(180%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .12), 0 10px 28px rgba(0, 0, 0, .4);
  opacity: 0; transform: translate(-50%, calc(-100% - 8px)) scale(.9); transform-origin: 50% 100%; transition: opacity .14s ease, transform .3s var(--snap); }
.tip.show { opacity: 1; transform: translate(-50%, calc(-100% - 12px)) scale(1); }
.tip.side { transform: translate(6px, -50%) scale(.9); transform-origin: 0 50%; }
.tip.side.show { transform: translate(12px, -50%) scale(1); }
.tip small { font-size: 12.5px; font-weight: 500; color: var(--t2); margin-left: 6px; font-variant-numeric: tabular-nums; }

/* Layers: vertical glass toolbar, a white knob springs to the chosen layer */
.tabs { position: absolute; z-index: 8; display: flex; flex-direction: column; gap: calc(4 * var(--u)); padding: max(4px, calc(6 * var(--u)));
  border-radius: 999px; transform: translate(-50%, -50%);
  background: linear-gradient(165deg, rgba(255, 255, 255, .1), rgba(255, 255, 255, .05));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .13), inset 0 1px 0 rgba(255, 255, 255, .08), 0 10px 30px rgba(0, 0, 0, .25);
  -webkit-backdrop-filter: blur(26px) saturate(160%); backdrop-filter: blur(26px) saturate(160%); }
.tabs button { position: relative; z-index: 1; display: grid; place-items: center; width: max(38px, calc(60 * var(--u))); height: max(38px, calc(60 * var(--u)));
  border-radius: 999px; color: rgba(235, 235, 245, .8); transition: color .35s ease, background .25s ease, transform .3s var(--snap); }
.tabs button .ic, .tabs button ha-icon { font-size: max(19px, calc(27 * var(--u))); --mdc-icon-size: max(19px, calc(27 * var(--u))); }
.tabs button span { display: none; }
.tabs button:not(.act):hover { background: rgba(255, 255, 255, .07); }
.tabs button:active { transform: scale(.92); }
.tabs button.act { color: #0c0c0e; }
.tabs button.act .ic { --ip: currentColor; }
.tabs button.act ha-icon { color: #0c0c0e; }
.tabs .knob { position: absolute; z-index: 0; top: 0; left: max(4px, calc(6 * var(--u))); right: max(4px, calc(6 * var(--u))); height: 0; border-radius: 999px;
  background: linear-gradient(180deg, #fff, #ececf0); box-shadow: 0 2px 10px rgba(0, 0, 0, .25), inset 0 -1px 0 rgba(0, 0, 0, .06);
  transition: transform var(--sp-ms) var(--sp), height var(--sp-ms) var(--sp); }

/* Layer card in the gap */
.gcard { position: absolute; z-index: 7; display: flex; flex-direction: column; border-radius: calc(26 * var(--u)); overflow: hidden;
  padding: max(12px, calc(20 * var(--u))) calc(24 * var(--u)) max(12px, calc(22 * var(--u)));
  background: linear-gradient(150deg, rgba(var(--g1, 44, 44, 50), .64), rgba(var(--g2, 30, 30, 36), .66));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), inset 0 1px 0 rgba(255, 255, 255, .08), 0 22px 50px rgba(0, 0, 0, .34);
  -webkit-backdrop-filter: blur(30px) saturate(150%); backdrop-filter: blur(30px) saturate(150%); transition: background 1s ease; }
.gcard > .gv { display: flex; flex-direction: column; height: 100%; animation: fadein .5s cubic-bezier(.2, .8, .2, 1) both; }
@keyframes fadein { from { opacity: 0; transform: translateY(10px) scale(.985); filter: blur(6px); } to { opacity: 1; transform: none; filter: blur(0); } }
.gk { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: max(11px, calc(14 * var(--u))); font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--t2); }
.gk > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.gk .bat { display: flex; align-items: center; gap: 5px; letter-spacing: 0; text-transform: none; font-variant-numeric: tabular-nums; }
.gk .bat .ic { font-size: 1.25em; stroke-width: 1.6; }
.gt { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-top: calc(4 * var(--u)); }
.gt b { font-size: max(17px, calc(29 * var(--u))); font-weight: 700; letter-spacing: -.025em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.gt span { flex: none; font-size: max(12.5px, calc(16 * var(--u))); color: var(--t2); font-variant-numeric: tabular-nums; }
.gs { margin-top: calc(3 * var(--u)); font-size: max(12px, calc(15 * var(--u))); color: var(--t2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gt button.lnk { font-size: max(12.5px, calc(16 * var(--u))); font-weight: 600; color: rgb(100, 170, 255); }
.segs { display: flex; gap: calc(6 * var(--u)); margin: auto 0 0; padding-top: calc(10 * var(--u)); }
.segs i { position: relative; flex: 1; height: max(4px, calc(7 * var(--u))); border-radius: 99px; background: rgba(255, 255, 255, .13); overflow: hidden; transition: background .45s ease, box-shadow .45s ease; }
.segs i.on { background: rgb(var(--c)); box-shadow: 0 0 calc(10 * var(--u)) rgba(var(--c), .5); }
.segs i.part::after { content: ''; position: absolute; inset: 0 auto 0 0; width: var(--p, 0%); border-radius: inherit; background: rgb(var(--c)); box-shadow: 0 0 calc(10 * var(--u)) rgba(var(--c), .5); transition: width .6s var(--soft); }
.prog { margin: auto 0 0; flex: none; height: max(5px, calc(7 * var(--u))); border-radius: 99px; background: rgba(255, 255, 255, .12); overflow: hidden; }
.prog i { display: block; height: 100%; width: var(--p, 0%); border-radius: inherit; background: linear-gradient(90deg, #64d2ff, rgb(var(--blue))); box-shadow: 0 0 12px rgba(var(--blue), .6); transition: width .8s var(--soft); }
.gbtns { display: flex; gap: calc(10 * var(--u)); margin-top: calc(16 * var(--u)); flex: none; }
/* cards with a subtitle line (climate, covers, own layers): a little tighter */
.gv.sub .gt { margin-top: calc(2 * var(--u)); }
.gv.sub .gs { margin-top: calc(1 * var(--u)); }
.gv.sub .segs { padding-top: calc(8 * var(--u)); }
.gv.sub .gbtns { margin-top: calc(12 * var(--u)); }
.gv.cv .gbtns { margin-top: auto; }
.gv.cv .prog:not([hidden]) + .gbtns { margin-top: calc(16 * var(--u)); }
.gbtn { flex: 1; min-width: 0; height: max(34px, calc(56 * var(--u))); border-radius: max(12px, calc(18 * var(--u))); display: flex; align-items: center; justify-content: center; gap: 7px;
  font-weight: 600; font-size: max(13.5px, calc(18 * var(--u))); letter-spacing: -.015em; white-space: nowrap;
  transition: transform .3s var(--snap), background .3s ease, opacity .3s ease, filter .2s; }
.gbtn > span { overflow: hidden; text-overflow: ellipsis; }
.gbtn .ic { font-size: 1.12em; }
.gbtn .ic.sm { font-size: .9em; opacity: .7; margin-left: -2px; }
.gbtn.glass { background: rgba(255, 255, 255, .1); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .13), inset 0 1px 0 rgba(255, 255, 255, .06); color: var(--t1); }
.gbtn.glass:hover { background: rgba(255, 255, 255, .15); }
.gbtn.white { background: linear-gradient(180deg, #fff, #ebebef); color: #0c0c0e; box-shadow: 0 4px 14px rgba(0, 0, 0, .2); }
.gbtn.blue { background: linear-gradient(180deg, #2b95ff, rgb(var(--blue))); color: #fff; box-shadow: 0 6px 18px rgba(var(--blue), .35); }
.gbtn.white .ic, .gbtn.blue .ic { --ip: currentColor; }
.gbtn:hover { filter: brightness(1.06); }
.gbtn:active { transform: scale(.96); }
.gbtn:disabled { opacity: .38; cursor: default; filter: none; transform: none; }
.gbtn.open { background: rgba(255, 255, 255, .2); }

/* Vacuum: room selection + robot */
.room.sel { background: linear-gradient(165deg, rgba(var(--blue), .3), rgba(var(--blue), .13)), rgba(16, 16, 20, .42); }
.root .room.sel::after, .root .room.lit.sel::after { box-shadow: inset 0 0 0 1.5px rgba(80, 160, 255, .95), inset 0 0 calc(24 * var(--u)) rgba(var(--blue), .2); }
.room.sel .badge { transform: scale(1); }
.room.sel .fu { background: rgba(255, 255, 255, .1); box-shadow: inset 0 0 0 1px rgba(170, 205, 255, .3); }
.root .room.cur::after, .root .room.lit.cur::after { animation: curpulse 2.2s ease-in-out infinite; }
@keyframes curpulse { 0%, 100% { box-shadow: inset 0 0 0 1.5px rgba(80, 160, 255, .95), inset 0 0 calc(30 * var(--u)) rgba(var(--blue), .28); } 50% { box-shadow: inset 0 0 0 1.5px rgba(80, 160, 255, .45), inset 0 0 calc(12 * var(--u)) rgba(var(--blue), .1); } }
.room.cur { background: linear-gradient(165deg, rgba(var(--blue), .22), rgba(var(--blue), .08)), rgba(16, 16, 20, .42); }
.root[data-type="vacuum"] .room.busy { cursor: default; }
.root:not([data-type="vacuum"]) .trail { opacity: 0; }

.trail { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 2; pointer-events: none; transition: opacity 1.6s ease; }
.trail.fade { opacity: 0; }
.trail polyline { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.trail .t1 { stroke: rgba(10, 132, 255, .18); }
.trail .t2 { stroke: rgba(120, 190, 255, .55); }
.bot { position: absolute; z-index: 5; --bs: max(20px, calc(34 * var(--u))); width: var(--bs); height: var(--bs); margin: calc(var(--bs) / -2) 0 0 calc(var(--bs) / -2);
  border-radius: 50%; pointer-events: none; opacity: 0; transform: scale(.6); transition: opacity .45s ease, transform var(--sp-ms) var(--sp); }
.bot.show { opacity: 1; transform: scale(1); }
.bot .bd { position: absolute; inset: 0; border-radius: 50%; transform: rotate(var(--rot, 0deg));
  background: radial-gradient(circle at 50% 30%, #fbfbfd, #cfd2da 72%, #b4b8c2);
  box-shadow: 0 3px 10px rgba(0, 0, 0, .5), inset 0 0 0 1px rgba(255, 255, 255, .7), inset 0 -2px 4px rgba(0, 0, 0, .15); }
.bot .bd::before { content: ''; position: absolute; left: 50%; top: 16%; width: 36%; height: 36%; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(circle at 50% 40%, #4a4f5a, #22252c); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .3); }
.bot .bd::after { content: ''; position: absolute; left: 50%; top: 4%; width: 18%; height: 7%; transform: translateX(-50%); border-radius: 9px; background: rgba(var(--blue), .9); }
.bot .bp { position: absolute; inset: -40%; border-radius: 50%; border: 2px solid rgba(var(--pc, 10, 132, 255), .7); opacity: 0; }
.bot.moving .bp { animation: botpulse 2s ease-out infinite; }
.bot.charging .bp { --pc: 48, 209, 88; animation: botpulse 2.6s ease-out infinite; }
/* invisible robot: no pulse in the background */
.bot:not(.show) .bp { animation: none; }
@keyframes botpulse { 0% { transform: scale(.45); opacity: .9; } 100% { transform: scale(1.15); opacity: 0; } }
.dockm { position: absolute; z-index: 4; --ds: max(22px, calc(36 * var(--u))); width: var(--ds); height: calc(var(--ds) * .8); margin: calc(var(--ds) * -.4) 0 0 calc(var(--ds) / -2);
  border-radius: calc(var(--ds) * .22); pointer-events: none; opacity: 0; transition: opacity .45s ease;
  background: linear-gradient(165deg, rgba(255, 255, 255, .12), rgba(255, 255, 255, .05)); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .16); }
.root[data-type="vacuum"] .dockm { opacity: 1; }

/* ---------------------------------------------------------------- Info tiles (same scale as the plan) */
.card { position: absolute; z-index: 7; min-width: 0; display: flex; flex-direction: column; overflow: hidden;
  border-radius: calc(22 * var(--u)); padding: calc(17 * var(--u)) calc(19 * var(--u)) calc(16 * var(--u));
  background: linear-gradient(160deg, rgba(46, 46, 54, .58), rgba(22, 23, 28, .64));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .095), inset 0 1px 0 rgba(255, 255, 255, .07), 0 calc(14 * var(--u)) calc(36 * var(--u)) rgba(0, 0, 0, .26);
  -webkit-backdrop-filter: blur(30px) saturate(160%); backdrop-filter: blur(30px) saturate(160%); transition: transform .4s var(--snap), box-shadow .3s ease, background .3s ease; }
.card { container-type: inline-size; }
.card.tap { cursor: pointer; }
/* narrow tiles (small plans, phones): less text */
@container (max-width: 84px) {
  .dslot .slide .tx { opacity: 0 !important; }
}
@container (max-width: 112px) {
  .k .when { display: none; }
  .dslot .slide .tx { font-size: 11px !important; letter-spacing: -.02em; padding-left: calc(var(--sh) - 10px) !important; }
}
.card.tap:hover { background: linear-gradient(160deg, rgba(56, 56, 64, .62), rgba(28, 29, 35, .68)); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .16), inset 0 1px 0 rgba(255, 255, 255, .09), 0 calc(16 * var(--u)) calc(40 * var(--u)) rgba(0, 0, 0, .3); }
.card.tap.pressed { transform: scale(.975); transition-duration: .12s; }
.card .k { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: max(12px, calc(14.5 * var(--u))); font-weight: 500; color: var(--t2); white-space: nowrap; }
.card .k .ic { font-size: max(16px, calc(21 * var(--u))); stroke-width: 1.8; }
.card .bot-row { margin-top: auto; min-width: 0; }
.card .v { font-size: max(22px, calc(31 * var(--u))); font-weight: 700; letter-spacing: -.03em; line-height: 1.08; font-variant-numeric: tabular-nums; white-space: nowrap; }
.card .s { margin-top: calc(4 * var(--u)); font-size: max(11.5px, calc(14.5 * var(--u))); font-weight: 500; color: var(--t2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.25; }
.card.dr .when { font-size: max(11px, calc(13 * var(--u))); color: var(--t3); font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; }
.batring { position: relative; flex: none; width: 42px; height: 42px; }
.batring svg:not(.ic) { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.batring svg:not(.ic) circle { fill: none; stroke-width: 3.4; stroke-linecap: round; }
.batring .tk { stroke: rgba(255, 255, 255, .12); }
.batring .vl { stroke: rgba(235, 238, 245, .85); transition: stroke-dasharray .8s var(--soft); }
.batring > .ic { position: absolute; inset: 0; margin: auto; width: 42%; height: 42%; }
.art { flex: none; width: 46px; height: 46px; border-radius: 12px; display: grid; place-items: center; font-size: 22px;
  background: rgba(255, 255, 255, .08) center / cover no-repeat; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08); }
.cbtn { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; font-size: 17px; color: var(--t1);
  background: rgba(255, 255, 255, .1); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1); transition: transform .3s var(--snap), background .2s, color .2s; }
.cbtn:hover { background: rgba(255, 255, 255, .16); }
.cbtn:active { transform: scale(.9); }
.cbtn:disabled { opacity: .35; cursor: default; }
.cbtn.lg { width: 46px; height: 46px; font-size: 20px; }
.cbtn.on { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .3), 0 0 14px rgba(255, 255, 255, .14); background: rgba(255, 255, 255, .18); }

/* tiles + layer card that did not fit into the plan: a column next to it, at a readable size */
.side { position: absolute; z-index: 7; display: flex; flex-direction: column; gap: max(10px, calc(13 * var(--su, .7px))); --u: var(--su, .7px); }
.side .card { position: relative; flex: 1 1 0; min-height: 0; max-height: calc(150 * var(--u)); }
.side .card.dr { flex-grow: 1.18; max-height: calc(176 * var(--u)); }
.side .gcard { position: relative; flex: none; height: calc(218 * var(--u)); margin-top: auto; }

/* Empty plan */
.empty-plan { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; text-align: center; z-index: 2; }
.empty-plan > div { max-width: 420px; padding: 30px 32px; border-radius: 28px; background: linear-gradient(160deg, rgba(46, 46, 54, .58), rgba(22, 23, 28, .64));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), 0 22px 50px rgba(0, 0, 0, .34); }
.empty-plan .ic { font-size: 44px; margin: 0 auto 14px; stroke-width: 1.4; }
.empty-plan b { display: block; font-size: 20px; font-weight: 700; letter-spacing: -.02em; }
.empty-plan p { margin: 8px 0 0; color: var(--t2); font-size: 14px; line-height: 1.45; }

/* ---------------------------------------------------------------- Pop-up */
/* shown/hidden via display (inherited visibility is not always recomputed in Chrome after cancelled animations) */
.pop-wrap { position: fixed; z-index: 50; left: 0; top: 0; width: 0; height: 0; pointer-events: none; display: none; }
.pop-wrap.vis { display: block; }
.pop-wrap.open { pointer-events: auto; }
/* backdrop: softly blurred and a little darker – no grain, so nothing looks pixelated */
.scrim { position: absolute; inset: 0; background: rgba(10, 11, 15, .18);
  -webkit-backdrop-filter: blur(22px) saturate(140%) brightness(.78); backdrop-filter: blur(22px) saturate(140%) brightness(.78); }
/* glass shell: clear and tinted, light edge top left, reflection on the top edge */
.pshell { position: absolute; left: 0; top: 0; width: 0; height: 0; border-radius: 32px; overflow: hidden; pointer-events: none; contain: layout style;
  background: linear-gradient(165deg, rgba(255, 255, 255, .13), rgba(255, 255, 255, .045) 36%, rgba(255, 255, 255, .02) 68%, rgba(255, 255, 255, .055)), rgba(26, 26, 32, .4);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .3), inset 0 -1px 0 rgba(255, 255, 255, .06), inset 0 0 28px rgba(255, 255, 255, .04),
    0 40px 120px rgba(0, 0, 0, .5), 0 12px 34px rgba(0, 0, 0, .28);
  -webkit-backdrop-filter: blur(34px) saturate(210%) brightness(1.06); backdrop-filter: blur(34px) saturate(210%) brightness(1.06); }
.pshell::before { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1.2px; pointer-events: none;
  background: linear-gradient(145deg, rgba(255, 255, 255, .62), rgba(255, 255, 255, .16) 26%, rgba(255, 255, 255, .05) 52%, rgba(255, 255, 255, .1) 78%, rgba(255, 255, 255, .32));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; }
.pshell::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 60%; border-radius: inherit; pointer-events: none;
  background: radial-gradient(85% 75% at 22% 0%, rgba(255, 255, 255, .1), rgba(255, 255, 255, .03) 45%, rgba(255, 255, 255, 0) 72%); }
.pop:focus { outline: none; }
.pop { position: absolute; left: 0; top: 0; width: min(620px, calc(100% - 48px)); overflow: auto; overscroll-behavior: contain; border-radius: 32px;
  padding: 26px 28px 26px; scrollbar-width: none; transform-origin: 50% 50%; }
.pop::-webkit-scrollbar { display: none; }
.pop.wide { width: min(920px, calc(100% - 48px)); }
.pop.narrow { width: min(440px, calc(100% - 48px)); }
.pop.wxp { width: min(880px, calc(100% - 48px)); }
.ph { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.ph h2 { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -.03em; line-height: 1.1; }
.ph p { margin: 5px 0 0; font-size: 14.5px; color: var(--t2); font-weight: 500; }
.x { flex: none; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-size: 17px; color: var(--t2);
  background: rgba(255, 255, 255, .1); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08); transition: background .2s, color .2s, transform .3s var(--snap); }
.x:hover { background: rgba(255, 255, 255, .17); color: var(--t1); }
.x:active { transform: scale(.9); }
.wgrid { display: grid; grid-template-columns: minmax(0, .92fr) minmax(0, 1.08fr); gap: 34px; margin-top: 20px; }
.wbig { display: flex; align-items: center; gap: 16px; }
.wbig .wi .ic { font-size: 58px; stroke-width: 1.5; }
.wbig b { font-size: 78px; font-weight: 200; letter-spacing: -.045em; line-height: .95; font-variant-numeric: tabular-nums; }
.whl { margin-top: 8px; font-size: 15px; font-weight: 500; color: var(--t2); }
.wstats { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 22px; }
.wstats div { display: grid; grid-template-columns: auto 1fr; column-gap: 11px; align-items: center; padding: 12px 14px; border-radius: 16px;
  background: rgba(255, 255, 255, .055); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06); }
.wstats .ic { grid-row: span 2; font-size: 21px; }
.wstats span { font-size: 12px; color: var(--t2); font-weight: 500; }
.wstats b { font-size: 15.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
.days { display: flex; flex-direction: column; }
.day { display: grid; grid-template-columns: 52px 40px 34px minmax(0, 1fr) 34px; align-items: center; gap: 12px; height: 41px; font-size: 15px; font-weight: 500;
  border-top: 1px solid rgba(255, 255, 255, .07); font-variant-numeric: tabular-nums; }
.day:first-child { border-top: 0; }
.day .dn { font-weight: 600; }
.day .di { display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 21px; line-height: 1; }
.day .di small { margin-top: 2px; font-size: 10.5px; font-weight: 600; color: var(--t2); }
.day .lo { text-align: right; color: var(--t2); }
.day .bar { position: relative; height: 6px; border-radius: 99px; background: rgba(255, 255, 255, .09); box-shadow: inset 0 0 0 .5px rgba(255, 255, 255, .05); }
.day .bar i { position: absolute; top: 0; bottom: 0; border-radius: 99px; background: linear-gradient(90deg, rgba(225, 230, 240, .55), rgba(250, 251, 253, .95)); box-shadow: 0 0 8px rgba(255, 255, 255, .18); }
.day .bar .now { width: 10px; height: 10px; top: -2px; margin-left: -5px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2.5px rgba(40, 40, 46, .95); }
.whrs { margin-top: 2px; }
.wnow { min-width: 0; }
.wnow .sec { margin-top: 22px; }
.hrs { display: flex; gap: 0; overflow-x: auto; scrollbar-width: none; padding: 2px 0 4px; margin: 0 -6px;
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 34px), transparent); mask-image: linear-gradient(90deg, transparent, #000 14px, #000 calc(100% - 34px), transparent); }
.hrs::-webkit-scrollbar { display: none; }
.hrs div { flex: none; width: 60px; display: flex; flex-direction: column; align-items: center; gap: 7px; font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
.hrs span { font-size: 13px; font-weight: 500; color: var(--t2); }
.hrs div:first-child span { color: var(--t1); font-weight: 600; }
.hrs .ic { font-size: 25px; stroke-width: 1.6; }
.hrs small { height: 12px; margin-top: -4px; font-size: 10.5px; font-weight: 600; color: var(--t2); }
.pcols { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr); gap: 30px; margin-top: 22px; }
.pcol { min-width: 0; }
.pfull { margin-top: 22px; }
.sec { margin: 24px 0 12px; font-size: 12.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--t3); display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.pcol > .psec:first-child > .sec:first-child, .pfull > .psec:first-child > .sec:first-child, .sec.first { margin-top: 0; }
.psec + .psec { margin-top: 4px; }

.tiles { display: flex; flex-wrap: wrap; gap: 14px; }
.tile { flex: 1 1 0; min-width: 78px; max-width: 116px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.tile .tb { position: relative; width: 100%; height: 164px; border-radius: 26px; overflow: hidden; cursor: pointer; touch-action: none;
  background: rgba(255, 255, 255, .09); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), inset 0 1px 0 rgba(255, 255, 255, .06);
  transition: transform .35s var(--snap), box-shadow .3s; }
.tile .tb:hover { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .18), inset 0 1px 0 rgba(255, 255, 255, .08); }
.tile .tb.pressed { transform: scale(.96); }
/* hold → device page: the tile slowly presses in until the device opens */
.tile .tb.pressed:not(.drag) { transform: scale(.93); transition: transform .52s cubic-bezier(.3, .7, .4, 1), box-shadow .3s; }
.hold { border-radius: 14px; transition: transform .52s cubic-bezier(.3, .7, .4, 1), background .3s; }
.hold.holding { transform: scale(.97); background: rgba(255, 255, 255, .05); }
.drow.hold.holding, .nk.hold.holding { background: none; }
.tile .tb.drag { transform: scale(1.03); }
.tile .fill { position: absolute; left: 0; right: 0; bottom: 0; height: var(--v, 0%); background: linear-gradient(0deg, rgb(var(--c)), rgb(var(--cl)));
  box-shadow: 0 -1px 0 rgba(255, 255, 255, .35) inset; transition: height .5s var(--soft); }
.tile .tb.drag .fill { transition: none; }
.tile .tb > .ic, .tile .tb > ha-icon, .tile .tb > ha-state-icon { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); font-size: 27px; --mdc-icon-size: 27px; transition: color .25s; }
.tile .tb.on:not(.lo) > .ic { --ip: currentColor; color: rgba(44, 30, 2, .85); }
.tile .tb.on.dk:not(.lo) > .ic { color: #fff; }
.tile .tb.on:not(.lo) > ha-icon, .tile .tb.on:not(.lo) > ha-state-icon { color: rgba(44, 30, 2, .85); }
.tile .tn { margin-top: 10px; font-size: 13.5px; font-weight: 600; line-height: 1.2; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tile .tv { margin-top: 2px; font-size: 12.5px; color: var(--t2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.tile.na { opacity: .45; }
.tile.grp .tb { background: rgba(255, 255, 255, .06); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .16); }
.tiles .tdiv { flex: none; width: 1px; align-self: stretch; margin: 8px 2px 34px; background: rgba(255, 255, 255, .1); }
/* cover tiles: the shutter comes down from the top */
.tile.cov .fill { top: 0; bottom: auto; height: calc(100% - var(--v, 0%)); background: repeating-linear-gradient(180deg, rgba(210, 216, 228, .5) 0 9px, rgba(150, 156, 170, .5) 9px 10px);
  box-shadow: 0 1px 0 rgba(255, 255, 255, .45), 0 4px 12px rgba(0, 0, 0, .25); transition: height .6s var(--soft); }
.tile.cov .tb { background: linear-gradient(180deg, rgba(190, 215, 255, .26), rgba(120, 160, 230, .12)); }
.tile.cov .tb > .ic { --ip: currentColor; color: rgba(245, 247, 255, .92); }
.tile.cov .tb.lo > .ic { --ip: url(#gfcg); }
.pop.one .tiles { justify-content: center; }
.pop.one .tile { max-width: 128px; }
.pop.one .tile .tb { height: 196px; border-radius: 30px; }
.pop.one .tile .tb > .ic { font-size: 32px; bottom: 20px; }

.crow { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.sws { display: flex; gap: 9px; flex-wrap: wrap; }
.sw { width: 28px; height: 28px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .25), 0 2px 8px rgba(0, 0, 0, .3); transition: transform .3s var(--snap); }
.sw:hover { transform: scale(1.12); }
.sw:active { transform: scale(.92); }
.ks { position: relative; flex: 1; min-width: 180px; height: 34px; border-radius: 999px; cursor: pointer; touch-action: none;
  background: linear-gradient(90deg, rgb(255, 160, 60), rgb(255, 205, 135) 35%, rgb(255, 240, 222) 62%, rgb(214, 228, 255));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .2), inset 0 1px 3px rgba(0, 0, 0, .2); }
.ks .kn { position: absolute; top: 50%; left: var(--v, 50%); width: 28px; height: 28px; margin: -14px 0 0 -14px; border-radius: 50%; background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, .35), inset 0 0 0 1px rgba(0, 0, 0, .06); transition: left .35s var(--soft); }
.ks.drag .kn { transition: none; transform: scale(1.08); }
.hs { position: relative; height: 34px; border-radius: 999px; overflow: hidden; cursor: pointer; touch-action: none; background: rgba(255, 255, 255, .1); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08); }
.hs .fl { position: absolute; inset: 0 auto 0 0; width: var(--v, 0%); background: rgba(255, 255, 255, .88); transition: width .35s var(--soft); }
.hs.drag .fl { transition: none; }
.hs .ic { --ip: currentColor; position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 16px; color: rgba(20, 20, 24, .75); }

.np { display: flex; align-items: center; gap: 14px; }
.np .art { width: 60px; height: 60px; border-radius: 15px; font-size: 26px; }
.np .t1 { font-size: 16px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.np .t2 { margin-top: 2px; font-size: 13.5px; color: var(--t2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.np > div:not(.art) { min-width: 0; flex: 1; }
.ctrls { display: flex; align-items: center; justify-content: center; gap: 18px; margin: 16px 0 14px; }
.lgrow { display: flex; align-items: center; gap: 12px; margin-top: 14px; padding: 12px 12px 12px 14px; border-radius: 18px; background: rgba(255, 255, 255, .06); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07); }
.lgrow > .ic { font-size: 22px; }
.lgrow > div { flex: 1; min-width: 0; }
.lgrow b { display: block; font-size: 14.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lgrow span { display: block; font-size: 13px; color: var(--t2); margin-top: 1px; }
.media + .media { margin-top: 22px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, .07); }

.dwrap { display: flex; flex-direction: column; gap: 12px; }
.slide { --sh: 56px; --p: 0; position: relative; height: var(--sh); border-radius: 999px; overflow: hidden; touch-action: none;
  background: linear-gradient(180deg, rgba(255, 255, 255, .06), rgba(255, 255, 255, .1)); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .12), inset 0 1px 2px rgba(0, 0, 0, .25);
  transition: background .4s ease, box-shadow .4s ease; }
.slide::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: calc(var(--x, 0px) + var(--sh)); border-radius: 999px;
  background: linear-gradient(90deg, rgba(255, 255, 255, .04), rgba(255, 255, 255, .14)); opacity: calc(var(--p) * 1.4); transition: width .5s var(--sp), opacity .3s; }
.slide.drag::before { transition: none; }
.slide .tx { position: absolute; inset: 0; display: grid; place-items: center; padding-left: calc(var(--sh) * .7); font-size: 15px; font-weight: 600; letter-spacing: -.01em; white-space: nowrap;
  background: linear-gradient(90deg, rgba(235, 235, 245, .42) 0%, rgba(255, 255, 255, .95) 50%, rgba(235, 235, 245, .42) 100%) 0 0 / 240% 100%;
  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; animation: shimmer 2.8s linear infinite;
  opacity: calc(1 - var(--p) * .9); transition: opacity .2s; }
@keyframes shimmer { from { background-position: 120% 0; } to { background-position: -120% 0; } }
.slide .kb { position: absolute; left: 4px; top: 4px; width: calc(var(--sh) - 8px); height: calc(var(--sh) - 8px); border-radius: 50%; display: grid; place-items: center;
  font-size: calc(var(--sh) * .4); color: #1c1c1e; cursor: grab; background: linear-gradient(180deg, #ffffff, #dcdee4);
  box-shadow: 0 3px 10px rgba(0, 0, 0, .35), inset 0 -1px 0 rgba(0, 0, 0, .08), inset 0 1px 0 #fff; transform: translateX(var(--x, 0px)); transition: transform .55s var(--sp), background .4s ease; }
.slide .kb .ic { --ip: currentColor; stroke-width: 2.2; }
.slide.drag .kb { transition: none; cursor: grabbing; }
.slide.done .tx { animation: none; -webkit-text-fill-color: rgba(255, 255, 255, .92); opacity: 1; padding-left: 0; padding-right: calc(var(--sh) * .7); }
.slide.ok { background: linear-gradient(180deg, rgba(var(--green), .26), rgba(var(--green), .18)); box-shadow: inset 0 0 0 1px rgba(var(--green), .45); }
.slide.ok .kb { background: linear-gradient(180deg, #5de68b, rgb(var(--green))); color: #fff; }
.card .dslot { margin: auto calc(-10 * var(--u)) calc(-6 * var(--u)); }
.card .slide { --sh: max(36px, calc(48 * var(--u))); }
.card .slide .tx { font-size: max(11.5px, calc(14 * var(--u))); padding-left: calc(var(--sh) - 8px); }
.muted { font-size: 13.5px; color: var(--t2); }
/* front door: doorbell + opened as info rows */
.dinfo { display: flex; flex-direction: column; gap: 2px; }
.drow { display: flex; align-items: center; gap: 10px; min-height: 30px; font-size: 14px; font-weight: 500; }
.drow .ic { font-size: 18px; flex: none; }
.drow span { flex: 1; min-width: 0; color: var(--t2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drow b { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.drow.new b { color: rgb(var(--orange)); }
/* helper sliders (input_number) */
.nrows { display: flex; flex-direction: column; gap: 14px; }
.nrow .nk { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 7px; font-size: 14px; font-weight: 500; color: var(--t2); }
.nrow .nk b { color: var(--t1); font-weight: 600; font-variant-numeric: tabular-nums; }
.nrow .hs { --c: 248, 216, 134; --cl: 252, 240, 210; }
.nrow .hs .fl { background: linear-gradient(90deg, rgb(var(--c)), rgb(var(--cl))); box-shadow: inset -1px 0 0 rgba(255, 255, 255, .5); }
.nrow .hs.drag { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .2); }
.nrow.na { opacity: .45; pointer-events: none; }
/* sensor / device rows */
.srows { display: flex; flex-direction: column; gap: 8px; }
.srow { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 9px 12px 9px 14px; border-radius: 18px; background: rgba(255, 255, 255, .055); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06); }
.srow > .ic, .srow > ha-icon, .srow > ha-state-icon { font-size: 21px; --mdc-icon-size: 21px; flex: none; }
.srow > div { flex: 1; min-width: 0; }
.srow b { display: block; font-size: 14.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.srow span { display: block; margin-top: 1px; font-size: 13px; color: var(--t2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.srow .sv { flex: none; font-size: 16px; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -.01em; }
.srow.on .sv { color: rgb(var(--orange)); }
.srow.na { opacity: .5; }
.tgl { position: relative; flex: none; width: 51px; height: 31px; border-radius: 99px; background: rgba(120, 120, 128, .32); transition: background .3s ease; }
.tgl::after { content: ''; position: absolute; left: 2px; top: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; box-shadow: 0 3px 8px rgba(0, 0, 0, .25); transition: transform .35s var(--snap); }
.tgl.on { background: rgb(var(--green)); }
.tgl.on::after { transform: translateX(20px); }

.vrow { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 20px; background: rgba(255, 255, 255, .05); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06); }
.vrow .batring { width: 60px; height: 60px; }
.vrow b { display: block; font-size: 17px; font-weight: 650; }
.vrow span { display: block; margin-top: 2px; font-size: 13.5px; color: var(--t2); }
.empty { display: flex; align-items: center; gap: 12px; margin-top: 22px; padding: 16px 18px; border-radius: 18px; background: rgba(255, 255, 255, .05); color: var(--t2); font-size: 14px; }
.empty .ic { font-size: 22px; flex: none; }
.pf { display: flex; gap: 10px; margin-top: 26px; }
.pbtn { flex: 1; height: 48px; border-radius: 16px; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 600; font-size: 15px;
  background: rgba(255, 255, 255, .1); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .11), inset 0 1px 0 rgba(255, 255, 255, .06); transition: transform .3s var(--snap), background .2s, opacity .3s; }
.pbtn:hover { background: rgba(255, 255, 255, .15); }
.pbtn:active { transform: scale(.97); }
.pbtn:disabled { opacity: .38; cursor: default; }
.pbtn .ic { font-size: 18px; }

/* Thermostat: arc dial (drag the knob or use − / +) */
.therm + .therm { margin-top: 22px; padding-top: 22px; border-top: 1px solid rgba(255, 255, 255, .07); }
.therm .tn2 { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 4px; font-size: 15px; font-weight: 600; }
.therm .tn2 span { font-size: 13px; font-weight: 500; color: var(--t2); }
.dialw { display: flex; align-items: center; justify-content: center; gap: 16px; }
.dial { position: relative; width: 210px; height: 196px; flex: none; touch-action: none; cursor: pointer; }
.dial svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.dial .trk { fill: none; stroke: rgba(255, 255, 255, .1); stroke-width: 16; stroke-linecap: round; }
.dial .arc { fill: none; stroke: url(#gfcdial); stroke-width: 16; stroke-linecap: round; opacity: .95; transition: opacity .3s; }
.dial.off .arc { opacity: .18; }
.dial .kn2 { fill: #fff; filter: drop-shadow(0 2px 6px rgba(0, 0, 0, .45)); transition: r .2s; }
.dial.drag .kn2 { r: 13; }
.dial .cur { fill: rgba(255, 255, 255, .9); }
.dial .mid { position: absolute; left: 0; right: 0; top: 52px; text-align: center; pointer-events: none; }
.dial .mid small { display: block; font-size: 12.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--t2); }
.dial .mid b { display: block; margin-top: 2px; font-size: 48px; font-weight: 250; letter-spacing: -.04em; line-height: 1; font-variant-numeric: tabular-nums; }
.dial .mid b sup { font-size: .42em; font-weight: 400; vertical-align: .9em; margin-left: 1px; }
.dial .mid span { display: block; margin-top: 6px; font-size: 13px; color: var(--t2); font-variant-numeric: tabular-nums; }
.hvac { position: relative; display: flex; margin-top: 12px; padding: 3px; border-radius: 13px; background: rgba(0, 0, 0, .25); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .05); }
.hvac button { position: relative; z-index: 1; flex: 1; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--t2); transition: color .25s; }
.hvac button .ic { font-size: 16px; }
.hvac button.act { color: var(--t1); }
.hvac button.act .ic { --ip: currentColor; }
.hvac .knob { position: absolute; z-index: 0; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / var(--n)); border-radius: 10px; background: rgba(255, 255, 255, .17);
  box-shadow: 0 2px 6px rgba(0, 0, 0, .25), inset 0 0 0 1px rgba(255, 255, 255, .08); transform: translateX(calc(100% * var(--i, 0))); transition: transform var(--sp-ms) var(--sp); }
.hvac.none .knob { opacity: 0; }

/* ---------------------------------------------------------------- Menu */
.menu { position: absolute; z-index: 60; left: 0; top: 0; min-width: 250px; max-width: 320px; max-height: 70vh; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; padding: 6px; border-radius: 18px;
  background: linear-gradient(160deg, rgba(62, 62, 70, .82), rgba(40, 40, 46, .86));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .13), inset 0 1px 0 rgba(255, 255, 255, .08), 0 26px 70px rgba(0, 0, 0, .55);
  -webkit-backdrop-filter: blur(40px) saturate(190%); backdrop-filter: blur(40px) saturate(190%);
  transform-origin: var(--ox, 50%) var(--oy, 100%); pointer-events: none; visibility: hidden; }
.menu.open { pointer-events: auto; visibility: visible; }
.mi { display: flex; align-items: center; gap: 12px; width: 100%; padding: 9px 12px 9px 11px; border-radius: 12px; text-align: left; font-size: 14.5px; font-weight: 500; color: var(--t1); transition: background .15s; }
.mi:hover { background: rgba(255, 255, 255, .1); }
.mi:active { background: rgba(255, 255, 255, .16); }
.mi .mic { flex: none; width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; font-size: 18px;
  background: linear-gradient(160deg, rgba(255, 255, 255, .14), rgba(255, 255, 255, .06)); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1); }
.mi > span { flex: 1; min-width: 0; }
.mi small { display: block; margin-top: 1px; font-size: 12px; font-weight: 400; color: var(--t3); }
.mi .chk { flex: none; font-size: 16px; opacity: 0; stroke-width: 2.2; }
.mi .mic ha-icon { --mdc-icon-size: 1.05em; }
.mi.act .chk { opacity: 1; }
.mi.ph .mic { opacity: .7; }
.mh { padding: 10px 12px 6px; font-size: 11.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--t3); }
.msep { height: 1px; margin: 6px 10px; background: rgba(255, 255, 255, .1); }
.mseg { position: relative; display: flex; margin: 2px 6px 8px; padding: 3px; border-radius: 11px; background: rgba(0, 0, 0, .25); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .05); }
.mseg button { position: relative; z-index: 1; flex: 1; height: 30px; border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--t2); transition: color .25s; white-space: nowrap; padding: 0 6px; }
.mseg button.act { color: var(--t1); }
.mseg .knob { position: absolute; z-index: 0; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / var(--n)); border-radius: 8px; background: rgba(255, 255, 255, .17);
  box-shadow: 0 2px 6px rgba(0, 0, 0, .25), inset 0 0 0 1px rgba(255, 255, 255, .08); transform: translateX(calc(100% * var(--i, 0))); transition: transform var(--sp-ms) var(--sp); }
.mnote { padding: 8px 12px 6px; font-size: 12px; line-height: 1.4; color: var(--t3); }

/* ---------------------------------------------------------------- Toast */
.toast { position: fixed; left: 50%; bottom: 26px; z-index: 70; padding: 12px 20px; border-radius: 999px; font-size: 14px; font-weight: 600; white-space: nowrap;
  background: rgba(50, 50, 56, .82); -webkit-backdrop-filter: blur(30px) saturate(180%); backdrop-filter: blur(30px) saturate(180%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .13), 0 18px 44px rgba(0, 0, 0, .45);
  opacity: 0; transform: translate(-50%, 24px) scale(.96); transition: opacity .25s ease, transform .5s var(--sp); pointer-events: none; }
.toast.show { opacity: 1; transform: translate(-50%, 0) scale(1); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
`;

/* ================================================================== Card: build, stage, markers, layers, info tiles */
function geo(S) {
  const px = (x) => (((x - S.x) / S.w) * 100).toFixed(3);
  const py = (y) => (((y - S.y) / S.h) * 100).toFixed(3);
  const pw = (w) => ((w / S.w) * 100).toFixed(3);
  const ph = (h) => ((h / S.h) * 100).toFixed(3);
  return {
    px, py, pw, ph,
    at: ([x, y]) => `left:${px(x)}%;top:${py(y)}%`,
    box: ([a, b, c, d]) => `left:${px(a)}%;top:${py(b)}%;width:${pw(c - a)}%;height:${ph(d - b)}%`,
    /* glass tile: half a wall gap on every side */
    tile: ([a, b, c, d]) => `left:calc(${px(a)}% + var(--gap) / 2);top:calc(${py(b)}% + var(--gap) / 2);width:calc(${pw(c - a)}% - var(--gap));height:calc(${ph(d - b)}% - var(--gap))`,
  };
}
/* position inside a room (percent of the room's wall-to-wall rectangle) */
const inRoom = (r, [a, b, c, d]) => {
  const [x1, y1, x2, y2] = r, w = x2 - x1, h = y2 - y1;
  return `left:${(((a - x1) / w) * 100).toFixed(3)}%;top:${(((b - y1) / h) * 100).toFixed(3)}%;width:${(((c - a) / w) * 100).toFixed(3)}%;height:${(((d - b) / h) * 100).toFixed(3)}%`;
};
const inRoomAt = (r, [x, y]) => `left:${(((x - r[0]) / (r[2] - r[0])) * 100).toFixed(3)}%;top:${(((y - r[1]) / (r[3] - r[1])) * 100).toFixed(3)}%`;
const RING = '<svg class="ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18.4" pathLength="100" stroke-dasharray="0 100"/></svg>';
const TOGGLE_DOMAINS = ['switch', 'input_boolean', 'fan', 'light', 'humidifier', 'siren', 'automation', 'remote'];
const PRESS_DOMAINS = ['button', 'input_button', 'scene', 'script'];

/* Which wall of which room a window / door segment sits on */
function wallOf(M, s) {
  const tol = 6 * M.D;
  for (const r of M.rooms) {
    const q = r.r;
    if (segH(s)) {
      const mx = (s[0] + s[2]) / 2;
      if (mx < q[0] || mx > q[2]) continue;
      if (Math.abs(s[1] - q[1]) < tol) return { room: r, side: 't' };
      if (Math.abs(s[1] - q[3]) < tol) return { room: r, side: 'b' };
    } else {
      const my = (s[1] + s[3]) / 2;
      if (my < q[1] || my > q[3]) continue;
      if (Math.abs(s[0] - q[0]) < tol) return { room: r, side: 'l' };
      if (Math.abs(s[0] - q[2]) < tol) return { room: r, side: 'r' };
    }
  }
  return null;
}
const segDist = (s, [x, y]) => Math.hypot(Math.max(s[0] - x, 0, x - s[2]), Math.max(s[1] - y, 0, y - s[3]));

class GlassFloorplanCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._last = {};
    this._sel = [];
    this._upd = [];
    this._trail = [];
    this._fc = {};
    this._optimistic = {};
    this._reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  static getConfigElement() { return document.createElement(`${CARD_TAG}-editor`); }
  static getStubConfig(hass) { return typeof autoConfig === 'function' ? autoConfig(hass) : { rooms: [] }; }
  setConfig(config) {
    if (!config || typeof config !== 'object') throw new Error('Invalid configuration');
    this._config = JSON.parse(JSON.stringify(config));
    this._restore();
    if (this._built) this._rebuild();
  }
  getCardSize() { return 12; }
  getGridOptions() { return { columns: 'full', rows: 'auto', min_columns: 6 }; }
  set preview(v) { this._previewFlag = !!v; }
  get preview() { return !!this._previewFlag; }

  connectedCallback() {
    if (!this._onResize) this._onResize = (e) => { if (e?.type === 'resize') this._layout(); if (this._popOpen) this._syncPop(); };
    window.addEventListener('resize', this._onResize);
    window.addEventListener('scroll', this._onResize, { passive: true });
    clearInterval(this._clockT);
    this._clockT = setInterval(() => this._tick(), 10000);
    if (this._built) {
      this._ro?.observe(this);
      this._layout();
      this._subscribeForecast();
      this._kickRobot?.();
    }
  }

  disconnectedCallback() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('scroll', this._onResize);
    window.removeEventListener('keydown', this._onKey);
    clearInterval(this._clockT);
    this._ro?.disconnect();
    this._unsubscribeForecast();
    cancelAnimationFrame(this._rraf);
    this._rraf = null;
    this._wiredKey = false;
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._useLang();
    if (!this._built) this._build();
    else if (first) this._rebuild();
    if (!this._fcSub) this._subscribeForecast();
    this._loadLabels();
    this._update();
  }
  get hass() { return this._hass; }

  _useLang() {
    const h = this._hass, c = this._config.language;
    const l = c && c !== 'auto' ? c : h?.locale?.language || h?.language || navigator.language || 'en';
    LANG = String(l).toLowerCase().startsWith('de') ? 'de' : 'en';
    LOCALE = h?.locale?.language || h?.language || (LANG === 'de' ? 'de-DE' : 'en');
  }

  /* per-viewer conveniences (chosen layer, cleaning mode) */
  _storeKey() { return `${CARD_TAG}:${this._config.id || this._config.title || 'default'}`; }
  _restore() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(this._storeKey()) || '{}'); } catch (e) { /* private mode */ }
    this._tab = this._tab || s.tab || null;
    this._mode = this._mode || s.mode || null;
    this._fan = this._fan || s.fan || null;
    this._water = this._water || s.water || null;
  }
  _save() {
    try { localStorage.setItem(this._storeKey(), JSON.stringify({ tab: this._tab, mode: this._mode, fan: this._fan, water: this._water })); } catch (e) { /* never mind */ }
  }

  _inPreview() {
    if (this._previewFlag) return true;
    for (let n = this; n; n = n.parentNode || n.host) {
      const tag = n.localName || '';
      if (tag === 'hui-card-preview' || tag === 'hui-dialog-edit-card' || tag === 'hui-card-picker' || n.classList?.contains?.('gfc-preview')) return true;
    }
    return false;
  }
  _wantMobile(W) {
    const l = this._config.layout;
    if (l === 'mobile') return true;
    if (l === 'desktop') return false;
    return W > 0 && W < 700;
  }

  /* ---------------------------------------------------------------- Build */
  _rebuild() {
    if (!this._hass) return;
    if (this._popOpen) { const r = this._reduced; this._reduced = true; this._closePop(); this._reduced = r; }
    cancelAnimationFrame(this._rraf);
    this._rraf = null;
    this._robot = null;
    this._trail = [];
    this._last = {};
    this._gapKind = null;
    this._decl = false;
    this._ro?.disconnect();
    this._build();
    this._update(true);
  }

  _build() {
    this._built = true;
    this._useLang();
    const W = this.getBoundingClientRect().width || this.parentElement?.getBoundingClientRect().width || window.innerWidth;
    this._m = this._wantMobile(W);
    const M = this._M = buildModel(this._config, this._hass, { mobile: this._m });
    if (!M.layers.some((l) => l.id === this._tab)) this._tab = M.layers[0].id;
    this._sel = this._sel.filter((k) => M.byRoom[k]);
    const S = M.stage, G = this._G = geo(S), D = M.D;
    const lights = M.ents.filter((e) => e.kind === 'light' && e.at);

    // covers darken the window next to them
    this._winCover = M.windows.map((w) => {
      let best = null, bd = 150 * D;
      for (const e of M.ents) if (e.kind === 'cover' && e.at) { const d = segDist(w, e.at); if (d < bd) { bd = d; best = e.entity; } }
      return best;
    });

    const rooms = M.rooms.map((r) => {
      const furn = r.furn.map((f) => `<i class="fu${f.circle ? ' c' : ''} ${esc(f.kind)}" style="${inRoom(r.r, f.r)}${f.circle ? '' : `;--fr:${f.rad}`}"></i>`).join('');
      // lamps: spots get a small halo + light cones, all others a round glow
      const glows = lights.filter((l) => l.room === r.id).map((l) => {
        const rr = (l.reach / D).toFixed(1);
        if (!l.beams) return `<i data-e="${esc(l.entity)}" style="${inRoomAt(r.r, l.at)};--r:${rr}"></i>`;
        const cones = spotAngles(l.entity, l.beams).map((a) => `conic-gradient(from ${a}deg, var(--cb))`).join(',');
        return `<i data-e="${esc(l.entity)}" style="${inRoomAt(r.r, l.at)};--r:62"></i><i class="cone" data-e="${esc(l.entity)}" style="${inRoomAt(r.r, l.at)};--r:${rr};--cones:${cones}"></i>`;
      }).join('') + M.ents.filter((e) => e.kind === 'media' && e.room === r.id && e.at).map((e) => {
        const tv = r.furn.find((f) => f.kind === 'tv');
        return `<i data-e="${esc(e.entity)}" data-tvglow style="${inRoomAt(r.r, tv ? center(tv.r) : e.at)};--r:150;--c:120,160,255"></i>`;
      }).join('');
      // daylight through this room's windows
      const day = M.windows.map((w, i) => ({ w, i, at: wallOf(M, w) })).filter((x) => x.at && x.at.room === r) .map(({ w, i, at: { side } }) => {
        const q = r.r, len = (segH(w) ? w[2] - w[0] : w[3] - w[1]) * 3.2;
        const cov = this._winCover[i] ? ` data-cover="${esc(this._winCover[i])}"` : '';
        if (side === 't' || side === 'b') {
          const cx = (w[0] + w[2]) / 2, d = Math.min(230 * D, (q[3] - q[1]) * 0.75);
          return `<i class="dl${side === 'b' ? ' up' : ''}"${cov} style="${inRoom(q, [cx - len / 2, side === 't' ? q[1] : q[3] - d, cx + len / 2, side === 't' ? q[1] + d : q[3]])}"></i>`;
        }
        const cy = (w[1] + w[3]) / 2, d = Math.min(230 * D, (q[2] - q[0]) * 0.75);
        return `<i class="dl ${side}"${cov} style="${inRoom(q, [side === 'l' ? q[0] : q[2] - d, cy - len / 2, side === 'l' ? q[0] + d : q[2], cy + len / 2])}"></i>`;
      }).join('');
      return `<div class="room${r.lb ? ' lb' : ''}" data-room="${esc(r.id)}" style="${G.tile(r.r)}" role="button" tabindex="0" aria-label="${esc(r.name)}">
        <div class="ctint"></div><div class="ri"><div class="rgl">${day}${glows}</div>${furn}</div><div class="rl"><b>${esc(r.name)}</b><span></span></div><div class="badge"></div></div>`;
    }).join('');

    const glows = lights.map((l) => `<i data-e="${esc(l.entity)}" style="${G.at(l.at)};--r:${l.beams ? 120 : (l.reach / D).toFixed(1)}"></i>`).join('')
      + M.ents.filter((e) => e.kind === 'media' && e.at).map((e) => `<i data-e="${esc(e.entity)}" data-tvglow style="${G.at(e.at)};--r:120;--c:120,160,255"></i>`).join('');
    // windows + front door hug the outside of the glass tile
    const segEl = (s, cls, extra = '') => {
      const w = wallOf(M, s), sgn = !w ? 0 : w.side === 't' || w.side === 'l' ? 1 : -1;
      const off = sgn ? ` + ${sgn} * (var(--gap) / 2 - 1.7 * var(--u))` : '';
      return segH(s)
        ? `<i class="${cls}"${extra} style="left:${G.px(s[0])}%;width:${G.pw(s[2] - s[0])}%;top:calc(${G.py(s[1])}%${off})"></i>`
        : `<i class="${cls} v"${extra} style="top:${G.py(s[1])}%;height:${G.ph(s[3] - s[1])}%;left:calc(${G.px(s[0])}%${off})"></i>`;
    };
    const wins = M.windows.map((w, i) => segEl(w, `win${this._winCover[i] ? ' cv' : ''}`, this._winCover[i] ? ` data-cover="${esc(this._winCover[i])}"` : '')).join('')
      + (M.entrance ? segEl(M.entrance, 'win fd') : '');
    // passages: glass bridges across the wall gap
    const pas = M.passages.map((s) => (segH(s)
      ? `<i class="pas" style="left:${G.px(s[0])}%;width:${G.pw(s[2] - s[0])}%;top:calc(${G.py(s[1])}% - var(--gap) / 2 + var(--u));height:calc(var(--gap) - 2 * var(--u))"></i>`
      : `<i class="pas" style="top:${G.py(s[1])}%;height:${G.ph(s[3] - s[1])}%;left:calc(${G.px(s[0])}% - var(--gap) / 2 + var(--u));width:calc(var(--gap) - 2 * var(--u))"></i>`)).join('');

    const markers = M.ents.filter((e) => e.at && e.plan && e.kind !== 'vacuum').map((e) => this._markerHtml(e)).join('')
      + (M.door?.at ? `<button class="dev door" data-e="__door" data-k="door" style="${G.at(M.door.at)}" aria-label="${esc(M.door.name || t('frontDoor'))}"><i class="rip"></i><i class="halo"></i><i class="disc"></i>${icon('door')}</button>` : '');
    const vac = M.vac ? `<svg class="trail" viewBox="${S.x} ${S.y} ${S.w} ${S.h}" preserveAspectRatio="none"><polyline class="t1" points=""/><polyline class="t2" points=""/></svg>
      ${M.vac.dock ? `<i class="dockm" style="${G.at(M.vac.dock)}"></i>` : ''}<div class="bot" style="${G.at(M.vac.dock || center(M.rooms[0]?.r || [0, 0, 0, 0]))}"><i class="bp"></i><i class="bd"></i></div>` : '';
    const bar = M.widgets.bar || this._m ? `<div class="tabs" role="tablist" aria-orientation="${this._m ? 'horizontal' : 'vertical'}" style="${M.widgets.bar && !this._m ? G.at(center(M.widgets.bar)) : ''}"><i class="knob"></i>
      ${M.layers.map((L) => `<button data-tab="${esc(L.id)}" role="tab" aria-label="${esc(this._layerName(L))}">${this._iconHtml(L.icon)}<span>${esc(this._layerName(L))}</span></button>`).join('')}</div>` : '';
    const empty = !M.rooms.length ? `<div class="empty-plan"><div>${icon('plan')}<b>${esc(t('emptyTitle'))}</b><p>${esc(t('emptyText'))}</p></div></div>` : '';

    this.shadowRoot.innerHTML = `<style>${STYLES}${STYLES_M}</style>
<div class="root boot${this._m ? ' m' : ''}" style="${springVars()}">
  <svg class="defs" width="0" height="0" aria-hidden="true"><defs>
    <linearGradient id="gfcg" gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="22"><stop offset="0" stop-color="#fbfbfd" stop-opacity=".94"/><stop offset=".55" stop-color="#d8dae1" stop-opacity=".8"/><stop offset="1" stop-color="#9ca1ad" stop-opacity=".7"/></linearGradient>
    <linearGradient id="gfcdial" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5aa8ff"/><stop offset=".5" stop-color="#7fe0c0"/><stop offset="1" stop-color="#ff9f45"/></linearGradient>
  </defs></svg>
  <div class="bg"><i class="g3"></i><i class="g4"></i><i class="g5"></i><i class="g1"></i><i class="g2"></i><i class="dots"></i></div>
  <div class="lay">
    <div class="stage">
      <div class="glows">${glows}</div>
      ${pas}${rooms}${wins}${vac}${markers}${this._m ? '' : bar}
      ${M.widgets.card && !this._m ? `<div class="gcard" style="${G.tile(M.widgets.card)}"></div>` : ''}
      <div class="tip"></div>
    </div>
    ${M.widgets.side ? `<div class="${this._m ? 'mside' : 'side'}">${M.widgets.side.card ? '<div class="gcard"></div>' : ''}</div>` : ''}
    ${this._m ? '<div class="gcard"></div>' : ''}
    ${empty}
  </div>
  ${this._m ? bar : ''}
  <div class="pop-wrap"><div class="scrim"></div><div class="pshell"></div><div class="pop" role="dialog" aria-modal="true" tabindex="-1"></div></div>
  <div class="menu" role="menu"></div>
  <div class="toast" role="status"></div>
</div>`;

    const $ = (s) => this.shadowRoot.querySelector(s);
    this.$ = $;
    this._root = $('.root');
    this._stage = $('.stage');
    this._gcard = $('.gcard');
    this._sideEl = $('.side, .mside');
    this._shell = $('.pshell');
    this._scrim = $('.scrim');
    this._tip = $('.tip');
    this._pop = $('.pop');
    this._popWrap = $('.pop-wrap');
    this._menu = $('.menu');
    this._botEl = $('.bot');
    this._mk = {};
    this.shadowRoot.querySelectorAll('.lamp, .dev').forEach((el) => { this._mk[el.dataset.e] = el; });
    this._roomEls = {};
    this.shadowRoot.querySelectorAll('.room').forEach((el) => { this._roomEls[el.dataset.room] = el; });
    this._watch = this._watchList();

    this._buildSide();
    this._wire();
    if (this._m) this._mobileInit();
    this._ro = new ResizeObserver(() => this._layout());
    this._ro.observe(this);
    this._layout();
    this._applyTab(false);
    requestAnimationFrame(() => { this._layout(); requestAnimationFrame(() => this._root?.classList.remove('boot')); });
  }

  _markerHtml(e) {
    const at = this._G.at(e.at), id = esc(e.entity), name = esc(this._name(e));
    if (e.kind === 'light') return `<button class="lamp" data-e="${id}" data-k="light" style="${at}" aria-label="${name}"><i class="rip"></i><i class="halo"></i><i class="disc"></i>${RING}${this._iconHtml(e.icon || 'bulb')}</button>`;
    const st = this._hass?.states?.[e.entity], d = domainOf(e.entity);
    if (e.kind === 'climate' && (d === 'climate' || d === 'sensor')) {
      const sens = d === 'sensor';
      return `<button class="dev val${sens ? ' sens' : ' clim'}" data-e="${id}" data-k="climate" style="${at}" aria-label="${name}"><i class="halo"></i><i class="disc"></i><span class="vt"></span>${sens ? '' : `<i class="act">${icon('flame')}</i>`}</button>`;
    }
    const ring = e.kind === 'cover' ? RING : '';
    return `<button class="dev ${e.kind === 'media' ? 'tv' : e.kind === 'cover' ? 'cov' : 'oth'}" data-e="${id}" data-k="${e.kind}" style="${at}" aria-label="${name}"><i class="rip"></i><i class="halo"></i><i class="disc"></i>${ring}${this._iconHtml(e.icon || this._autoIcon(e.entity, st))}</button>`;
  }

  /* Glass icon by name, or a Home Assistant icon (mdi:…) */
  _iconHtml(name) {
    if (name && ICONS[name]) return icon(name);
    if (name && MDI_MAP[name]) return icon(MDI_MAP[name]);
    if (name && String(name).includes(':') && customElements.get('ha-icon')) return `<ha-icon icon="${esc(name)}"></ha-icon>`;
    return icon('dot');
  }
  _autoIcon(eid, st) {
    const d = domainOf(eid), a = st?.attributes || {}, dc = a.device_class, on = st?.state;
    if (a.icon && MDI_MAP[a.icon]) return MDI_MAP[a.icon];
    if (d === 'light') return 'bulb';
    if (d === 'media_player') return dc === 'speaker' || dc === 'receiver' ? 'speaker' : 'tv';
    if (d === 'cover') return on === 'closed' ? 'blinds' : 'blindsOpen';
    if (d === 'climate') return 'thermo';
    if (d === 'fan') return 'fan';
    if (d === 'switch') return dc === 'outlet' ? 'plug' : 'toggle';
    if (d === 'input_boolean') return 'toggle';
    if (d === 'lock') return on === 'unlocked' || on === 'open' ? 'unlock' : 'lock';
    if (d === 'vacuum') return 'robot';
    if (d === 'scene') return 'sparkle';
    if (d === 'script') return 'play';
    if (d === 'button' || d === 'input_button') return 'press';
    if (d === 'camera') return 'camera';
    if (d === 'humidifier') return 'humid';
    if (d === 'siren') return 'bell';
    if (d === 'alarm_control_panel') return 'shield';
    if (d === 'binary_sensor') {
      if (['door', 'garage_door'].includes(dc)) return isOn(st) ? 'doorOpen' : 'door';
      if (['window', 'opening'].includes(dc)) return isOn(st) ? 'windowOpen' : 'window';
      if (['motion', 'occupancy', 'presence'].includes(dc)) return 'motion';
      if (dc === 'moisture') return 'drop';
      if (['smoke', 'gas', 'carbon_monoxide', 'safety', 'problem'].includes(dc)) return 'alert';
      if (dc === 'lock') return isOn(st) ? 'unlock' : 'lock';
      return 'dot';
    }
    if (d === 'sensor') {
      return { temperature: 'thermo', humidity: 'humid', power: 'bolt', energy: 'bolt', current: 'bolt', voltage: 'bolt', illuminance: 'sun', carbon_dioxide: 'leaf', pm25: 'leaf', volatile_organic_compounds: 'leaf', battery: 'battery', moisture: 'drop' }[dc] || 'gauge';
    }
    return 'dot';
  }

  _watchList() {
    const M = this._M, ids = new Set(['sun.sun']);
    for (const e of M.ents) { ids.add(e.entity); if (e.power) ids.add(e.power); }
    for (const r of M.rooms) r.helpers.forEach((h) => ids.add(h));
    if (M.door) { ids.add(M.door.open); ids.add(M.door.bell); }
    if (M.weather) ids.add(M.weather);
    M.indoor.forEach((i) => ids.add(i));
    if (M.vac) Object.values(this._vacEnts()).forEach((i) => ids.add(i));
    for (const L of M.layers) L.ents.forEach((i) => ids.add(i));
    ids.delete(null); ids.delete(undefined);
    return [...ids];
  }

  /* Everything at a glance: the plan gets as large as width AND visible window height allow; the card fills
   * exactly the space below the header – the page does not scroll. "fit: width" scales by width only. */
  _layout() {
    const W = this._root?.clientWidth;
    if (!W) return;
    if (this._wantMobile(W) !== this._m && this._hass) { clearTimeout(this._rbT); this._rbT = setTimeout(() => this._rebuild(), 30); return; }
    if (this._m) { this._layoutMobile(W); return; }
    const S = this._M.stage, D = this._M.D, B = this._M.bbox, side = this._sideEl;
    const padX = clamp(Math.round(W * 0.02), 12, 34);
    const sideW = side ? clamp(Math.round(W * 0.2), 220, 320) : 0, sgap = side ? clamp(Math.round(W * 0.014), 12, 22) : 0;
    let pu = (W - 2 * padX - sideW - sgap) / S.w, avail = 0, padY;
    const screen = this._config.fit !== 'width' && !this._inPreview();
    if (screen) {
      const top = this.getBoundingClientRect().top + (window.scrollY || 0);
      avail = Math.max(420, Math.floor(window.innerHeight - Math.max(0, top)));
      padY = clamp(Math.round(avail * 0.018), 8, 22);
      pu = Math.min(pu, (avail - 2 * padY) / S.h);
    }
    const u = clamp(pu * D, 0.4, 1.45);
    pu = u / D;
    if (!screen) padY = clamp(Math.round(14 * u), 8, 22);
    const sw = S.w * pu, sh = S.h * pu;
    const H = avail || Math.round(sh + 2 * padY);
    const sx = Math.round((W - sw - sideW - sgap) / 2), sy = Math.round((H - sh) / 2);
    if (this._h !== H) { this._h = H; this.style.height = `${H}px`; }
    if (side) {
      const g = 13 * u, top = sy + (B[1] - S.y) * pu + g / 2, h = (B[3] - B[1]) * pu - g;
      Object.assign(side.style, { left: `${sx + sw + sgap}px`, top: `${top.toFixed(1)}px`, width: `${sideW}px`, height: `${Math.max(h, 200).toFixed(1)}px` });
      side.style.setProperty('--su', `${clamp(sideW / 400, 0.56, 0.86).toFixed(4)}px`);
    }
    const s = this._root.style;
    s.setProperty('--u', `${u.toFixed(4)}px`);
    s.setProperty('--sw', `${sw.toFixed(1)}px`);
    s.setProperty('--sh', `${sh.toFixed(1)}px`);
    s.setProperty('--sx', `${sx}px`);
    s.setProperty('--sy', `${sy}px`);
    // dot grid aligned with the floor plan
    s.setProperty('--dx', `${(sx + (B[0] - S.x) * pu).toFixed(1)}px`);
    s.setProperty('--dy', `${(sy + (B[1] - S.y) * pu).toFixed(1)}px`);
    this._u = u;
    this._pu = pu;
    this._placeKnob(true);
    this._declutter();
  }

  /* Markers of one layer must not cover each other or a room name: overlapping ones are pushed apart
   * (a few relaxation steps, each marker stays in its room and close to its spot). Positions in the config stay. */
  _declutter() {
    const M = this._M, sr = this._stage?.getBoundingClientRect();
    if (!sr?.width || !this._pu) return;
    const S = M.stage, pu = this._pu, g = 13 * this._u;
    const items = [];
    for (const [eid, el] of Object.entries(this._mk)) {
      const e = eid === '__door' ? M.door : M.ents.find((x) => x.entity === eid);
      if (!e?.at) continue;
      const x0 = (e.at[0] - S.x) * pu, y0 = (e.at[1] - S.y) * pu;
      if (el.classList.contains('hid')) { el.style.left = `${this._G.px(e.at[0])}%`; el.style.top = `${this._G.py(e.at[1])}%`; continue; }
      const rm = M.byRoom[e.room]?.r;
      items.push({ el, e, x0, y0, x: x0, y: y0, r: el.offsetWidth / 2 + 2, room: rm && [(rm[0] - S.x) * pu + g / 2, (rm[1] - S.y) * pu + g / 2, (rm[2] - S.x) * pu - g / 2, (rm[3] - S.y) * pu - g / 2] });
    }
    const boxes = [];
    for (const el of this.shadowRoot.querySelectorAll('.rl b, .rl span')) {
      if (!el.textContent) continue;
      const rg = document.createRange();
      rg.selectNodeContents(el);
      const b = rg.getBoundingClientRect();
      if (b.width) boxes.push([b.left - sr.left - 3, b.top - sr.top - 2, b.right - sr.left + 3, b.bottom - sr.top + 2]);
    }
    for (let it = 0; it < 48; it++) {
      let moved = false;
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        const min = a.r + b.r;
        if (d >= min) continue;
        if (d < 0.01) { dx = j % 2 ? 1 : -1; dy = 0.3; d = Math.hypot(dx, dy); }
        const k = (min - d) / 2 / d;
        a.x -= dx * k; a.y -= dy * k; b.x += dx * k; b.y += dy * k;
        moved = true;
      }
      for (const a of items) for (const [l, tp, r, bt] of boxes) {
        const nx = clamp(a.x, l, r), ny = clamp(a.y, tp, bt), dx = a.x - nx, dy = a.y - ny, d = Math.hypot(dx, dy);
        if (d >= a.r) continue;
        if (d < 0.01) { const down = bt - a.y + a.r, right = r - a.x + a.r; if (down < right) a.y += down; else a.x += right; }
        else { a.x += (dx / d) * (a.r - d); a.y += (dy / d) * (a.r - d); }
        moved = true;
      }
      for (const a of items) {
        const lim = a.r * 2.4, vx = a.x - a.x0, vy = a.y - a.y0, v = Math.hypot(vx, vy);
        if (v > lim) { a.x = a.x0 + (vx / v) * lim; a.y = a.y0 + (vy / v) * lim; }
        // stay inside the room
        if (a.room) { const m = a.r * 0.92; a.x = clamp(a.x, a.room[0] + m, Math.max(a.room[0] + m, a.room[2] - m)); a.y = clamp(a.y, a.room[1] + m, Math.max(a.room[1] + m, a.room[3] - m)); }
      }
      if (!moved) break;
    }
    const sw = S.w * pu, sh = S.h * pu;
    for (const a of items) {
      a.el.style.left = `${((a.x / sw) * 100).toFixed(3)}%`;
      a.el.style.top = `${((a.y / sh) * 100).toFixed(3)}%`;
    }
  }

  /* ---------------------------------------------------------------- Interaction */
  _press(el, onTap, onHold) {
    let timer, held = false, sx = 0, sy = 0, moved = false, active = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      active = true; held = false; moved = false; sx = e.clientX; sy = e.clientY;
      el.classList.add('pressed');
      if (onHold) timer = setTimeout(() => { held = true; el.classList.remove('pressed'); onHold(); }, 480);
    });
    el.addEventListener('pointermove', (e) => { if (active && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) { moved = true; clearTimeout(timer); el.classList.remove('pressed'); } });
    const cancel = () => { active = false; clearTimeout(timer); el.classList.remove('pressed'); };
    el.addEventListener('pointerup', (e) => { if (!active) return; const go = !held && !moved; cancel(); if (go) { e.stopPropagation(); onTap(); } });
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('click', (e) => e.stopPropagation());
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (onHold) { cancel(); onHold(); } });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } });
  }

  _wire() {
    const sr = this.shadowRoot, M = this._M;
    sr.querySelectorAll('.tabs button').forEach((b) => {
      const L = M.layers.find((x) => x.id === b.dataset.tab);
      b.addEventListener('click', () => { this._hideTip(); this._setTab(b.dataset.tab); });
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !this._m) this._showTip(b, this._layerName(L), null, true); });
      b.addEventListener('pointerleave', () => this._hideTip());
    });
    for (const [eid, el] of Object.entries(this._mk)) {
      if (eid === '__door') {
        this._press(el, () => { this._hideTip(); this._openDoor(el); });
        el.addEventListener('pointerenter', () => this._showTip(el, M.door.name || t('frontDoor'), t('open') + ' …'));
        el.addEventListener('pointerleave', () => this._hideTip());
        continue;
      }
      const e = M.ents.find((x) => x.entity === eid);
      const room = () => { this._hideTip(); this._openRoom(e.room, { from: this._roomEls[e.room], focus: e.entity }); };
      this._press(el, () => this._markerTap(e, el), room);
      el.addEventListener('pointerenter', () => this._showTip(el, this._name(e), this._valueText(e)));
      el.addEventListener('pointerleave', () => this._hideTip());
    }
    for (const [k, el] of Object.entries(this._roomEls)) {
      el.addEventListener('click', () => this._roomTap(k));
      el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this._roomTap(k); } });
    }
    sr.querySelector('.scrim').addEventListener('click', () => this._closePop());
    this._root.addEventListener('pointerdown', (e) => {
      if (this._menu.classList.contains('open') && !e.composedPath().some((n) => n === this._menu || n === this._menuAnchor)) this._closeMenu();
    });
    if (!this._onKey) {
      this._onKey = (e) => {
        if (e.key !== 'Escape' || !this.isConnected || !this._root) return;
        if (this._menu.classList.contains('open')) this._closeMenu(); else this._closePop();
      };
    }
    window.removeEventListener('keydown', this._onKey);
    window.addEventListener('keydown', this._onKey);
  }

  _markerTap(e, el) {
    const d = domainOf(e.entity), st = this._hass.states[e.entity];
    if (e.kind === 'light') { this._toggleLamp(e); return; }
    if (e.kind === 'cover') { this._hideTip(); this._coverToggle(e.entity); this._ripple(el); return; }
    if (e.kind === 'media' || e.kind === 'climate' || d === 'lock' || d === 'sensor' || d === 'binary_sensor' || d === 'camera' || d === 'alarm_control_panel') {
      this._hideTip();
      if (d === 'camera' || (!this._roomHas(e.room, this._layer()) && e.room)) { this._openDevice(e.entity, el, true); return; }
      this._openRoom(e.room, { from: this._roomEls[e.room], focus: e.entity });
      return;
    }
    if (unavailable(st)) { this._toast(t('notReachable', this._name(e))); return; }
    if (TOGGLE_DOMAINS.includes(d)) {
      const want = !isOn(st);
      this._optimistic[e.entity] = { on: want, until: Date.now() + 2500 };
      this._kickOptimistic();
      if (want) this._ignite(el);
      this._showTip(el, this._name(e), want ? t('on') : t('off'));
      this._call('homeassistant', want ? 'turn_on' : 'turn_off', { entity_id: e.entity }).catch(() => { this._optimistic = {}; this._update(true); });
      return;
    }
    if (PRESS_DOMAINS.includes(d)) {
      this._ripple(el);
      this._pressEntity(e.entity).then(() => this._toast(t(d === 'scene' ? 'activated' : 'started', this._name(e)))).catch(() => {});
      return;
    }
    this._openDevice(e.entity, el, true);
  }
  _pressEntity(eid) {
    const d = domainOf(eid);
    if (d === 'button' || d === 'input_button') return this._call(d, 'press', { entity_id: eid });
    return this._call(d, 'turn_on', { entity_id: eid });
  }
  _kickOptimistic() {
    clearTimeout(this._optT);
    this._optT = setTimeout(() => { this._optimistic = {}; this._update(true); }, 2600);
    this._update(true);
  }

  _layer(id = this._tab) { return this._M.layers.find((l) => l.id === id) || this._M.layers[0]; }
  _layerName(L) {
    if (!L) return '';
    return L.name || (L.type === 'custom' ? t('layer') : t(`layer_${L.type}`));
  }
  _ents(L, kind) { return this._M.ents.filter((e) => inLayer(L, e) && (!kind || e.kind === kind)); }
  _roomEnts(k, L, kind) { return this._ents(L, kind).filter((e) => e.room === k); }
  _roomHas(k, L) {
    if (!k || !L) return false;
    if (L.type === 'vacuum') return true;
    if (this._roomEnts(k, L).length) return true;
    if (L.kinds.has('door') && this._M.door?.room === k) return true;
    return L.kinds.has('light') && (this._M.byRoom[k]?.helpers || []).length > 0;
  }

  _roomTap(k) {
    const L = this._layer();
    if (L.type === 'vacuum') { this._vacRoomTap(k); return; }
    if (this._roomHas(k, L)) this._openRoom(k, { from: this._roomEls[k] });
  }

  _call(domain, service, data, target) {
    let p;
    try { p = Promise.resolve(target ? this._hass.callService(domain, service, data, target) : this._hass.callService(domain, service, data)); } catch (e) { p = Promise.reject(e); }
    return p.catch((e) => { this._toast(t('error', e?.message || e)); throw e; });
  }
  _toggle(entity) { return this._call(domainOf(entity) === 'light' ? 'light' : 'homeassistant', 'toggle', { entity_id: entity }).catch(() => {}); }
  _setBri(entity, v) {
    return (v <= 0 ? this._call('light', 'turn_off', { entity_id: entity }) : this._call('light', 'turn_on', { entity_id: entity, brightness_pct: v })).catch(() => {});
  }

  /* Tap a lamp on the plan: switches visibly at once, the real state follows from Home Assistant */
  _toggleLamp(l) {
    const st = this._hass.states[l.entity];
    if (unavailable(st)) { this._toast(t('notReachable', this._name(l))); return; }
    const want = !isOn(st);
    this._optimistic[l.entity] = { on: want, until: Date.now() + 2500 };
    this._kickOptimistic();
    const el = this._mk[l.entity];
    if (want && el) this._ignite(el);
    if (el) this._showTip(el, this._name(l), want ? (dimmable(st) && st.attributes.brightness ? `${Math.round(st.attributes.brightness / 2.55)} %` : t('on')) : t('off'));
    this._call('light', want ? 'turn_on' : 'turn_off', { entity_id: l.entity }).catch(() => { this._optimistic = {}; this._update(true); });
  }

  /* Switch-on effect: the disc springs, a soft ring of light runs outwards */
  _ignite(el) {
    if (this._reduced || !el) return;
    el.querySelector('.disc')?.animate([{ transform: 'scale(.8)' }, { transform: 'scale(1)' }], { duration: SPRINGS.pop.ms, easing: ease('pop', 'ease-out') });
    el.querySelector('.rip')?.animate([{ transform: 'scale(.9)', opacity: 0.7 }, { transform: 'scale(2.7)', opacity: 0 }], { duration: 950, easing: 'cubic-bezier(.15, .7, .25, 1)' });
  }
  _ripple(el) {
    if (this._reduced || !el) return;
    el.querySelector('.disc')?.animate([{ transform: 'scale(.86)' }, { transform: 'scale(1)' }], { duration: SPRINGS.pop.ms, easing: ease('pop', 'ease-out') });
  }

  /* state with the optimistic switch applied */
  _st(eid) {
    const st = this._hass?.states?.[eid];
    const o = this._optimistic[eid];
    if (o && o.until > Date.now() && isOn(st) !== o.on) return { ...st, state: o.on ? 'on' : 'off', attributes: { ...(st?.attributes || {}) } };
    return st;
  }
  /* entity name without the room name in front ("Living room Ceiling" → "Ceiling") */
  _name(e) {
    if (e?.name) return e.name;
    const full = this._nameOf(e?.entity), rn = e?.room && this._M?.byRoom[e.room]?.name;
    if (rn) {
      const a = full.toLowerCase(), b = String(rn).toLowerCase();
      if (a === b) return tf(`dom_${domainOf(e.entity)}`, full);
      if (a.startsWith(`${b} `)) { const rest = full.slice(b.length + 1).trim(); return rest.charAt(0).toUpperCase() + rest.slice(1); }
    }
    return full;
  }
  _nameOf(eid) {
    const st = this._hass?.states?.[eid];
    return st?.attributes?.friendly_name || this._hass?.entities?.[eid]?.name || String(eid || '').split('.').pop().replace(/_/g, ' ');
  }

  /* text for tooltips and tiles */
  _valueText(e) {
    const st = this._st(e.entity), d = domainOf(e.entity);
    if (unavailable(st)) return t('offline');
    if (e.kind === 'light') return isOn(st) ? (dimmable(st) ? `${briPct(st)} %` : t('on')) : t('off');
    if (e.kind === 'media') return this._mediaLabel(st);
    if (e.kind === 'cover') return this._coverText(st);
    if (d === 'climate') return this._climText(st);
    return this._stateText(e.entity, st);
  }
  _stateText(eid, st) {
    const d = domainOf(eid), a = st?.attributes || {};
    if (unavailable(st)) return t('offline');
    if (d === 'sensor' || (d === 'input_number' || d === 'number')) {
      const v = num(st);
      if (v == null) return String(st.state);
      const dig = Math.abs(v) < 10 && v % 1 ? 1 : a.device_class === 'temperature' ? 1 : 0;
      return `${fmt(v, dig)}${a.unit_of_measurement ? (a.unit_of_measurement === '°C' || a.unit_of_measurement === '°F' ? '°' : ` ${a.unit_of_measurement}`) : ''}`;
    }
    if (d === 'binary_sensor') return tf(`bs_${a.device_class || 'default'}_${isOn(st) ? 'on' : 'off'}`, t(isOn(st) ? 'on' : 'off'));
    if (d === 'lock') return tf(`lock_${st.state}`, st.state);
    if (PRESS_DOMAINS.includes(d)) return isTime(st.state) ? relTime(st.state) : d === 'script' && isOn(st) ? t('running') : '';
    if (['on', 'off'].includes(st.state)) return t(st.state);
    return this._hass.formatEntityState ? this._hass.formatEntityState(st) : String(st.state);
  }

  /* Tooltip above the element – or with side to the right of it (layer bar) */
  _showTip(el, name, value, side) {
    if (this._m || !this._tip) return;
    const tp = this._tip, sr = this._stage.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (tp.classList.contains('side') !== !!side && !tp.classList.contains('show')) {
      tp.style.transition = 'none'; tp.classList.toggle('side', !!side); void tp.offsetWidth; tp.style.transition = '';
    } else tp.classList.toggle('side', !!side);
    tp.innerHTML = `${esc(name)}${value ? `<small>${esc(value)}</small>` : ''}`;
    tp.style.left = `${(side ? r.right : r.left + r.width / 2) - sr.left}px`;
    tp.style.top = `${(side ? r.top + r.height / 2 : r.top) - sr.top}px`;
    tp.classList.add('show');
  }
  _hideTip() { this._tip?.classList.remove('show'); }

  _toast(text) {
    const tt = this.$('.toast'), r = this.getBoundingClientRect();
    if (!tt) return;
    tt.style.left = `${Math.max(0, r.left) + (Math.min(window.innerWidth, r.right) - Math.max(0, r.left)) / 2}px`;
    tt.textContent = text;
    tt.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => tt.classList.remove('show'), 2800);
  }

  /* ---------------------------------------------------------------- Layers */
  _setTab(tab) {
    if (tab === this._tab) return;
    this._tab = tab;
    this._save();
    this._closeMenu();
    this._hideTip();
    this._applyTab(true);
  }

  _applyTab(animate) {
    const L = this._layer();
    this._root.dataset.tab = L.id;
    this._root.dataset.type = L.type;
    this._root.dataset.glow = L.kinds.has('light') ? 'full' : 'dim';
    this.shadowRoot.querySelectorAll('.tabs button').forEach((b) => { const a = b.dataset.tab === L.id; b.classList.toggle('act', a); b.setAttribute('aria-selected', a); });
    for (const [eid, el] of Object.entries(this._mk)) {
      const show = eid === '__door' ? L.kinds.has('door') : inLayer(L, this._M.ents.find((e) => e.entity === eid));
      el.classList.toggle('hid', !show);
      el.tabIndex = show ? 0 : -1;
    }
    for (const [k, el] of Object.entries(this._roomEls)) el.classList.toggle('idle', L.type !== 'vacuum' && !this._roomHas(k, L));
    this._placeKnob(!animate);
    this._gapKind = null;
    if (this._hass) { this._renderGap(); this._updClean(); this._updRobot(); this._updAmbient(); this._updRooms(); }
    this._declutter();
  }

  _placeKnob(instant) {
    const b = this.shadowRoot.querySelector(`.tabs button[data-tab="${CSS.escape(this._tab || '')}"]`), k = this.$('.tabs .knob');
    if (!b || !k) return;
    if (instant) k.style.transition = 'none';
    if (this._m) { k.style.height = ''; k.style.width = `${b.offsetWidth}px`; k.style.transform = `translateX(${b.offsetLeft}px)`; }
    else { k.style.height = `${b.offsetHeight}px`; k.style.transform = `translateY(${b.offsetTop}px)`; }
    if (instant) { void k.offsetWidth; k.style.transition = ''; }
  }

  /* ---------------------------------------------------------------- Updates */
  _update(force) {
    const h = this._hass;
    if (!h || !this._built || !this._root) return;
    const changed = force || this._watch.some((id) => h.states[id] !== this._last[id]);
    if (!changed) return;
    this._watch.forEach((id) => { this._last[id] = h.states[id]; });
    this._useLang();
    this._updLights();
    this._updMarkers();
    this._updRooms();
    this._updAmbient();
    this._renderGap();
    this._updSide();
    this._updClean();
    this._updRobot();
    this._upd.forEach((f) => f());
    if (!this._decl) { this._decl = true; requestAnimationFrame(() => this._declutter()); }
  }

  _updLights() {
    const sr = this.shadowRoot;
    for (const l of this._M.ents) {
      if (l.kind !== 'light') continue;
      const st = this._st(l.entity);
      const on = isOn(st), b = on ? briPct(st) : 0, rgb = lightRgb(l, st), dim = dimmable(st);
      const el = this._mk[l.entity];
      if (el) {
        const wasOn = el.classList.contains('on');
        el.classList.toggle('on', on);
        el.classList.toggle('na', unavailable(st));
        el.classList.toggle('dk', on && lum(rgb) < 0.5);
        el.style.setProperty('--c', rgb.join(','));
        el.style.setProperty('--cl', lighten(rgb, 0.42).join(','));
        const c = el.querySelector('.ring circle');
        c.setAttribute('stroke-dasharray', on && dim ? `${b} 100` : '0 100');
        c.style.opacity = on && dim ? '1' : '0';
        el.setAttribute('aria-pressed', on);
        if (on && !wasOn && this._shown) this._ignite(el);
      }
      const o = (0.5 + 0.5 * (dim ? b / 100 : 1)).toFixed(2);
      for (const g of sr.querySelectorAll(`.rgl i[data-e="${CSS.escape(l.entity)}"], .glows i[data-e="${CSS.escape(l.entity)}"]`)) {
        g.style.setProperty('--c', rgb.join(','));
        g.style.setProperty('--o', o);
        g.classList.toggle('on', on);
      }
    }
    this._shown = true;
  }

  /* media, door, climate, covers and other devices on the plan */
  _updMarkers() {
    const sr = this.shadowRoot, h = this._hass;
    for (const e of this._M.ents) {
      const el = this._mk[e.entity];
      if (e.kind === 'media') {
        const st = h.states[e.entity], playing = st?.state === 'playing', active = this._mediaOn(st);
        if (el) {
          el.classList.toggle('on', playing || st?.state === 'paused');
          el.style.setProperty('--c', '150,185,255');
          el.style.setProperty('--cl', '220,232,255');
          el.classList.toggle('na', unavailable(st));
        }
        for (const g of sr.querySelectorAll(`[data-tvglow][data-e="${CSS.escape(e.entity)}"]`)) { g.classList.toggle('on', active); g.style.setProperty('--o', playing ? '0.9' : '0.5'); }
        sr.querySelector(`.room[data-room="${CSS.escape(e.room || '')}"] .fu.tv`)?.classList.toggle('on', active);
        continue;
      }
      if (!el) { if (e.kind === 'cover') this._updCoverWindows(e); continue; }
      if (e.kind === 'climate') this._updClimMarker(e, el);
      else if (e.kind === 'cover') this._updCoverMarker(e, el);
      else this._updOtherMarker(e, el);
    }
    // front door: shows as opened for a minute
    const door = this._mk.__door, M = this._M;
    if (M.door) {
      const ds = h.states[M.door.open];
      const age = ds && isTime(ds.state) ? Date.now() - new Date(ds.state).getTime() : Infinity;
      const open = (age >= 0 && age < 60000) || (domainOf(M.door.open) === 'lock' && ['unlocked', 'open', 'opening'].includes(ds?.state));
      if (door) {
        door.classList.toggle('open', open);
        door.style.setProperty('--c', open ? '48,209,88' : '255,255,255');
        const ic = door.querySelector('.ic');
        if (ic && ic.dataset.o !== String(open)) { ic.outerHTML = icon(open ? 'doorOpen' : 'door'); door.querySelector('.ic').dataset.o = String(open); }
      }
      sr.querySelector('.win.fd')?.classList.toggle('open', open);
      clearTimeout(this._doorT);
      if (open && age < 60000) this._doorT = setTimeout(() => this._update(true), 60000 - age + 250);
    }
  }

  _mediaOn(st) { return !!st && ['playing', 'paused', 'on', 'idle', 'buffering'].includes(st.state); }
  _mediaLabel(st) {
    if (unavailable(st)) return t('offline');
    return { playing: t('playing'), paused: t('paused'), idle: t('ready'), on: t('on'), off: t('off'), standby: t('standby'), buffering: t('playing') }[st.state] || st.state;
  }

  _updOtherMarker(e, el) {
    const st = this._st(e.entity), d = domainOf(e.entity), a = st?.attributes || {};
    let on = false, c = [255, 214, 150];
    if (TOGGLE_DOMAINS.includes(d)) { on = isOn(st); c = d === 'fan' ? [120, 220, 255] : d === 'humidifier' ? [110, 200, 255] : [255, 214, 120]; }
    else if (d === 'binary_sensor') { on = isOn(st); c = ['motion', 'occupancy', 'presence'].includes(a.device_class) ? [120, 200, 255] : [255, 170, 70]; }
    else if (d === 'lock') { on = ['unlocked', 'open', 'opening', 'jammed'].includes(st?.state); c = st?.state === 'jammed' ? [255, 90, 70] : [255, 170, 70]; }
    else if (d === 'alarm_control_panel') { on = String(st?.state).startsWith('armed') || st?.state === 'triggered'; c = st?.state === 'triggered' ? [255, 80, 60] : [48, 209, 88]; }
    else if (d === 'script') { on = isOn(st); c = [120, 200, 255]; }
    el.classList.toggle('on', on);
    el.classList.toggle('na', unavailable(st));
    el.classList.toggle('dk', on && lum(c) < 0.55);
    el.style.setProperty('--c', c.join(','));
    el.style.setProperty('--cl', lighten(c, 0.5).join(','));
    if (!e.icon) {
      const ic = this._autoIcon(e.entity, st);
      if (el.dataset.ic !== ic) { el.dataset.ic = ic; el.querySelector('.ic')?.remove(); el.insertAdjacentHTML('beforeend', icon(ic)); }
    }
  }

  _updRooms() {
    const L = this._layer();
    for (const [k, el] of Object.entries(this._roomEls)) {
      const ls = this._M.ents.filter((e) => e.kind === 'light' && e.room === k && e.at);
      const onL = ls.filter((l) => isOn(this._st(l.entity)));
      el.classList.toggle('lit', onL.length > 0);
      if (onL.length) {
        const c = onL.map((l) => lightRgb(l, this._st(l.entity))).reduce((a, c2) => a.map((v, i) => v + c2[i] / onL.length), [0, 0, 0]).map(Math.round);
        el.style.setProperty('--lc', c.join(','));
      }
      const tc = this._roomClimate(k);
      el.classList.toggle('tt', tc.t != null);
      if (tc.t != null) el.style.setProperty('--tc', tempRgb(tc.t).join(','));
      let s = '';
      if (L.type === 'vacuum') s = this._roomCleanLabel(k);
      else if (L.type === 'climate') s = [tc.t != null ? `${fmt(tc.t, 1)}°` : '', tc.h != null ? `${Math.round(tc.h)} %` : ''].filter(Boolean).join(' · ');
      else if (L.type === 'cover') s = this._roomCoverLabel(k, L);
      else if (L.type === 'light') {
        const lit = this._roomEnts(k, L, 'light');
        if (lit.length) s = onL.length ? t('nOn', onL.length) : t('off');
      } else s = this._roomCustomLabel(k, L);
      el.querySelector('.rl span').textContent = s;
    }
  }

  _updAmbient() {
    const h = this._hass;
    let w = 0;
    for (const l of this._M.ents) {
      if (l.kind !== 'light') continue;
      const st = this._st(l.entity);
      if (isOn(st)) w += 0.22 + 0.2 * (dimmable(st) ? briPct(st) / 100 : 1);
    }
    const sun = h.states['sun.sun'];
    const el = sun?.attributes?.elevation ?? (sun?.state === 'above_horizon' ? 20 : -20);
    const day = clamp((el + 4) / 16, 0, 1);
    this._root.style.setProperty('--warm', clamp(w, 0, 1).toFixed(2));
    this._root.style.setProperty('--day', day.toFixed(2));
    // daylight colour: low sun warm, otherwise cool white; clouds dampen
    const clouds = { cloudy: 0.55, rainy: 0.6, pouring: 0.7, fog: 0.65, 'lightning-rainy': 0.7, snowy: 0.5, 'snowy-rainy': 0.6, partlycloudy: 0.25 }[h.states[this._M.weather]?.state] ?? 0.1;
    const warmSun = clamp(1 - (el - 2) / 14, 0, 1);
    this._root.style.setProperty('--dlc', lerp3([226, 236, 255], [255, 196, 140], warmSun).map(Math.round).join(','));
    this._root.style.setProperty('--dli', (day * (1 - clouds * 0.6)).toFixed(2));
    if (!this._gcard) return;
    const L = this._layer(), lit = this._M.ents.some((l) => l.kind === 'light' && isOn(this._st(l.entity)));
    const tint = L.type === 'vacuum' ? ['30, 52, 92', '20, 30, 58']
      : L.type === 'climate' ? this._climTint()
        : L.type === 'cover' ? ['44, 54, 72', '28, 32, 44']
          : lit && L.kinds.has('light') ? ['112, 72, 54', '92, 52, 36'] : ['46, 46, 54', '30, 30, 36'];
    this._gcard.style.setProperty('--g1', tint[0]);
    this._gcard.style.setProperty('--g2', tint[1]);
  }

  /* ---------------------------------------------------------------- Layer card */
  _renderGap() {
    if (!this._gcard) return;
    const L = this._layer(), kind = `${L.id}`;
    if (this._gapKind !== kind) {
      this._gapKind = kind;
      this._gapUpd = [];
      this._gcard.innerHTML = '';
      const v = L.type === 'vacuum' ? this._cleanGap(this._gapUpd) : L.type === 'climate' ? this._climateGap(L, this._gapUpd)
        : L.type === 'cover' ? this._coverGap(L, this._gapUpd) : L.type === 'light' ? this._lightGap(L, this._gapUpd) : this._customGap(L, this._gapUpd);
      this._gcard.append(v);
    }
    this._gapUpd.forEach((f) => f());
  }

  _lightGap(L, upd) {
    const lights = this._ents(L, 'light');
    const v = mk('div', 'gv', `<div class="gk"><span>${esc(this._layerName(L))}</span></div>
      <div class="gt"><b></b><span class="w"></span></div>
      <div class="segs">${lights.map((l) => `<i data-e="${esc(l.entity)}"></i>`).join('')}</div>
      <div class="gbtns"><button class="gbtn glass modes" aria-haspopup="menu">${icon('sparkle')}<span>${esc(t('modes'))}</span>${icon('chevU', 'sm')}</button><button class="gbtn white off">${icon('power')}<span>${esc(t('allOff'))}</span></button></div>`);
    const modes = v.querySelector('.modes');
    modes.addEventListener('click', () => (this._menuAnchor === modes && this._menu.classList.contains('open') ? this._closeMenu() : this._openModes(modes)));
    v.querySelector('.off').addEventListener('click', () => this._allOff(lights.map((l) => l.entity)));
    upd.push(() => {
      const on = lights.filter((l) => isOn(this._st(l.entity)));
      v.querySelector('.gt b').textContent = on.length ? t('lightsOn', on.length) : t('allOffState');
      const p = this._lightPower(lights);
      v.querySelector('.gt .w').textContent = on.length && p.w ? `${p.est ? '≈ ' : ''}${fmt(p.w, p.w < 10 ? 1 : 0)} W` : '';
      for (const l of lights) {
        const seg = v.querySelector(`.segs i[data-e="${CSS.escape(l.entity)}"]`), st = this._st(l.entity);
        seg.classList.toggle('on', isOn(st));
        seg.style.setProperty('--c', lightRgb(l, st).join(','));
      }
      v.querySelector('.off').disabled = !on.length;
    });
    return v;
  }

  /* power: measured where sensors exist, otherwise rated power × brightness */
  _lightPower(lights) {
    let w = 0, est = false;
    for (const l of lights) {
      const st = this._st(l.entity);
      if (!isOn(st)) continue;
      const m = l.power ? num(this._hass.states[l.power]) : null;
      if (m != null) w += m;
      else if (l.watt) { w += l.watt * (dimmable(st) ? Math.max(0.12, briPct(st) / 100) : 1); est = true; }
    }
    return { w, est };
  }

  /* switches off everything switchable in the list (lights, switches, fans …) */
  _allOff(eids) {
    const on = eids.filter((id) => isOn(this._st(id)));
    if (!on.length) return;
    for (const id of on) this._optimistic[id] = { on: false, until: Date.now() + 2500 };
    this._kickOptimistic();
    const lights = on.filter((id) => domainOf(id) === 'light'), rest = on.filter((id) => domainOf(id) !== 'light');
    Promise.all([
      lights.length ? this._call('light', 'turn_off', { entity_id: lights }) : null,
      rest.length ? this._call('homeassistant', 'turn_off', { entity_id: rest }) : null,
    ]).then(() => this._toast(t('switchedOff', on.length, lights.length === on.length))).catch(() => { this._optimistic = {}; this._update(true); });
  }

  /* ---------------------------------------------------------------- Info tiles: outside, inside, front door */
  _buildSide() {
    const S = this._stage, W = this._M.widgets, G = this._G;
    this._sideUpd = [];
    const sideTiles = W.side?.tiles || [];
    const add = (cls, rect, html) => {
      const el = mk('div', `card ${cls}`, html);
      if (rect) { el.setAttribute('style', G.tile(rect)); S.insertBefore(el, this._tip); }
      else this._sideEl.insertBefore(el, this._sideEl.querySelector('.gcard'));
      return el;
    };
    if (W.weather || sideTiles.includes('weather')) {
      const wx = add('wx tap', W.weather, `<div class="k"><span>${esc(t('outside'))}</span><span class="wi"></span></div><div class="bot-row"><div class="v"></div><div class="s"></div></div>`);
      wx.setAttribute('role', 'button');
      wx.setAttribute('aria-label', t('weatherForecast'));
      wx.tabIndex = 0;
      this._press(wx, () => this._openWeather(wx));
    }
    if (W.indoor || sideTiles.includes('indoor')) add('in', W.indoor, `<div class="k"><span class="lbl">${esc(t('inside'))}</span>${icon('thermo')}</div><div class="bot-row"><div class="v"></div><div class="s"></div></div>`);
    if (W.door || sideTiles.includes('door')) {
      const dr = add('dr', W.door, `<div class="k"><span>${esc(this._M.door.name || t('frontDoor'))}</span><span class="when"></span></div><div class="dslot"></div>`);
      if (this._M.door.open) dr.querySelector('.dslot').append(this._doorSlide(this._sideUpd, dr.querySelector('.when')));
      else this._sideUpd.push(() => { dr.querySelector('.when').textContent = this._bellText(); });
    }
  }

  _tick() {
    if (this._hass && this._root) this._updSide();
  }

  _wxIcon(cond, hour) {
    const night = hour == null ? (this._hass?.states['sun.sun']?.attributes?.elevation ?? 0) < -2 : hour < 7 || hour >= 19;
    const ic = WX_ICON[cond] || 'cloud';
    return ic === 'sun' && night ? 'moon' : ic === 'partly' && night ? 'partlyNight' : ic;
  }

  /* average indoor temperature / humidity of the given entities */
  _climateOf(eids) {
    const h = this._hass, ts = [], hs = [];
    for (const id of eids) {
      const st = h.states[id];
      if (unavailable(st) && domainOf(id) !== 'climate') continue;
      const a = st?.attributes || {}, d = domainOf(id);
      if (d === 'climate' || d === 'humidifier' || d === 'water_heater') {
        if (Number.isFinite(+a.current_temperature) && a.current_temperature !== null) ts.push(+a.current_temperature);
        if (Number.isFinite(+a.current_humidity) && a.current_humidity !== null) hs.push(+a.current_humidity);
      } else if (a.device_class === 'temperature') { const v = num(st); if (v != null) ts.push(v); }
      else if (a.device_class === 'humidity') { const v = num(st); if (v != null) hs.push(v); }
    }
    return { t: avg(ts), h: avg(hs), n: ts.length };
  }
  _roomClimate(k) { return this._climateOf(this._M.ents.filter((e) => e.room === k && e.kind === 'climate').map((e) => e.entity)); }

  _updSide() {
    const h = this._hass, S = this.shadowRoot, M = this._M;
    if (!h || !this._stage) return;
    const wx = S.querySelector('.card.wx'), w = h.states[M.weather];
    if (wx && w) {
      const ic = this._wxIcon(w.state), wi = wx.querySelector('.wi');
      if (wi.dataset.ic !== ic) { wi.dataset.ic = ic; wi.innerHTML = icon(ic); }
      wx.querySelector('.v').textContent = w.attributes.temperature != null ? `${Math.round(w.attributes.temperature)}°` : '–';
      const d = this._fc.daily?.[0];
      const hl = d && d.temperature != null ? ` · ${d.templow != null ? `${Math.round(d.templow)}° / ` : ''}${Math.round(d.temperature)}°` : '';
      wx.querySelector('.s').textContent = `${tf(`wx_${w.state}`, w.state)}${hl}`;
    }
    const inn = S.querySelector('.card.in');
    if (inn) {
      const c = this._climateOf(M.indoor);
      inn.querySelector('.lbl').textContent = c.n > 1 ? t('insideAvg') : t('inside');
      inn.querySelector('.v').textContent = c.t != null ? `${fmt(c.t, 1)}°` : '–';
      inn.querySelector('.s').textContent = c.h != null ? t('humidityPct', Math.round(c.h)) : t('noReadings');
    }
    this._sideUpd?.forEach((f) => f());
    if (this._popKind === 'weather') this._upd.forEach((f) => f());
  }

  /* weather forecast (daily for low/high, hourly for the strip) */
  _subscribeForecast() {
    const h = this._hass;
    if (!h?.connection?.subscribeMessage || this._fcSub || !this.isConnected || !this._M?.weather) return;
    const st = h.states[this._M.weather];
    if (!st) return;
    const feat = st.attributes.supported_features || 0;
    this._fcSub = [];
    const sub = (type) => h.connection.subscribeMessage((msg) => { this._fc[type] = msg?.forecast || []; this._updSide(); },
      { type: 'weather/subscribe_forecast', forecast_type: type, entity_id: this._M.weather })
      .then((un) => { if (this._fcSub) this._fcSub.push(un); else un(); })
      .catch(() => {});
    if (feat & 1) sub('daily');
    if (feat & 2) sub('hourly');
  }
  _unsubscribeForecast() {
    (this._fcSub || []).forEach((un) => { try { un(); } catch (e) { /* never mind */ } });
    this._fcSub = null;
  }
}
const WX_ICON = {
  'clear-night': 'moon', cloudy: 'cloud', fog: 'fog', hail: 'rain', lightning: 'bolt', 'lightning-rainy': 'bolt', partlycloudy: 'partly', pouring: 'rain',
  rainy: 'rain', snowy: 'snow', 'snowy-rainy': 'snow', sunny: 'sun', windy: 'wind', 'windy-variant': 'wind', exceptional: 'bolt',
};

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
    if (media.length) S.media = () => { const w = mk('div', 'psec'); media.forEach((e) => w.append(this._mediaSection(e, upd))); return w; };
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
    const dc = this._hass.states[E]?.attributes?.device_class;
    w.innerHTML = `<div class="sec first"><span>${esc(t(dc === 'tv' ? 'mediaTv' : dc === 'speaker' || dc === 'receiver' ? 'mediaSpeaker' : 'mediaGeneric'))}</span></div>
      <div class="np"><div class="art">${icon('tv')}</div><div><div class="t1"></div><div class="t2"></div></div><button class="cbtn pw" aria-label="${esc(t('power'))}">${icon('power')}</button></div>
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
    const avail = preview ? 0 : Math.max(360, Math.floor(window.innerHeight - Math.max(0, top)));
    const gH = this._M.layers.length ? 166 : 0, tabsH = M.layers.length > 1 ? 78 + this._safeB : 16, sy = 4;
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
    this._placeKnob(true);
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

/* ================================================================== Floor plan editor: styles (same glass language as the card) */
const EDITOR_STYLES = `
dialog.ed { position: fixed; inset: 0; width: 100vw; height: 100vh; max-width: none; max-height: none; margin: 0; padding: 0; border: 0; background: #08090c; color: var(--t1); overflow: hidden; }
dialog.ed::backdrop { background: rgba(0, 0, 0, .6); }
dialog.ed[open] { display: block; }
.ew { position: absolute; inset: 0; display: grid; grid-template-columns: 84px minmax(0, 1fr) 340px; grid-template-rows: 60px minmax(0, 1fr); }
.ew .bg { z-index: 0; }

/* top bar */
.etop { grid-column: 1 / -1; position: relative; z-index: 5; display: flex; align-items: center; gap: 10px; padding: 0 14px 0 18px;
  background: linear-gradient(180deg, rgba(30, 30, 36, .82), rgba(22, 22, 28, .7)); box-shadow: inset 0 -1px 0 rgba(255, 255, 255, .07);
  -webkit-backdrop-filter: blur(30px) saturate(160%); backdrop-filter: blur(30px) saturate(160%); }
.etop h1 { margin: 0 auto 0 6px; font-size: 17px; font-weight: 650; letter-spacing: -.015em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.etop h1 small { margin-left: 10px; font-size: 13px; font-weight: 500; color: var(--t3); }
.ebtn { height: 36px; padding: 0 14px; border-radius: 11px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; font-size: 14px; font-weight: 600; white-space: nowrap;
  background: rgba(255, 255, 255, .09); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1); color: var(--t1); transition: background .2s, transform .3s var(--snap), opacity .2s; }
.ebtn:hover { background: rgba(255, 255, 255, .15); }
.ebtn:active { transform: scale(.96); }
.ebtn:disabled { opacity: .35; cursor: default; transform: none; }
.ebtn .ic { font-size: 17px; }
.ebtn.icon { width: 36px; padding: 0; }
.ebtn.white { background: linear-gradient(180deg, #fff, #ebebef); color: #0c0c0e; box-shadow: 0 4px 14px rgba(0, 0, 0, .25); }
.ebtn.white .ic, .ebtn.blue .ic { --ip: currentColor; }
.ebtn.blue { background: linear-gradient(180deg, #2b95ff, rgb(var(--blue))); color: #fff; box-shadow: 0 6px 18px rgba(var(--blue), .3); }
.ebtn.red { color: rgb(255, 120, 110); }
.ebtn.sm { height: 30px; padding: 0 11px; font-size: 13px; border-radius: 9px; }
.ebtn.wide { width: 100%; }
.esep { width: 1px; height: 24px; background: rgba(255, 255, 255, .1); margin: 0 4px; }

/* tool rail */
.erail { position: relative; z-index: 4; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 0; overflow-y: auto; scrollbar-width: none;
  background: linear-gradient(90deg, rgba(24, 24, 30, .7), rgba(20, 20, 26, .5)); box-shadow: inset -1px 0 0 rgba(255, 255, 255, .06); }
.erail button { width: 68px; min-height: 58px; padding: 7px 2px 6px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  color: rgba(235, 235, 245, .75); transition: background .2s, color .2s, transform .3s var(--snap); }
.erail button .ic { font-size: 23px; }
.erail button span { font-size: 10.5px; font-weight: 600; letter-spacing: -.005em; line-height: 1.1; text-align: center; }
.erail button:hover { background: rgba(255, 255, 255, .07); color: var(--t1); }
.erail button:active { transform: scale(.94); }
.erail button.act { background: linear-gradient(180deg, #fff, #ececf0); color: #0c0c0e; box-shadow: 0 4px 14px rgba(0, 0, 0, .3); }
.erail button.act .ic { --ip: currentColor; }
.erail .rsep { width: 40px; height: 1px; margin: 6px 0; background: rgba(255, 255, 255, .08); flex: none; }

/* canvas */
.ecv { position: relative; z-index: 1; overflow: hidden; touch-action: none; cursor: default; background: radial-gradient(80% 70% at 30% 10%, rgba(46, 64, 120, .18), rgba(30, 40, 80, 0) 70%); }
.ecv.pan, .ecv.panning { cursor: grab; }
.ecv.panning { cursor: grabbing; }
.ecv.draw { cursor: crosshair; }
.ecv .grid { position: absolute; inset: 0; pointer-events: none; background-image: radial-gradient(circle, rgba(255, 255, 255, .1) .9px, rgba(255, 255, 255, 0) 1.3px); }
.ecv .ul { position: absolute; pointer-events: none; transform-origin: 0 0; user-select: none; -webkit-user-drag: none; }
.world { position: absolute; inset: 0; pointer-events: none; }
.world > * { pointer-events: auto; }
.eroom { position: absolute; border-radius: 10px; overflow: hidden;
  background: linear-gradient(165deg, rgba(255, 255, 255, .07), rgba(255, 255, 255, .025)), rgba(22, 22, 28, .55);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .16), 0 6px 18px rgba(0, 0, 0, .2); }
.ul-on .eroom { background: rgba(30, 32, 40, .38); box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .55); }
.eroom .en { position: absolute; left: 9px; top: 7px; right: 6px; font-size: 13px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; text-shadow: 0 1px 6px rgba(0, 0, 0, .5); }
.eroom .en small { display: block; margin-top: 1px; font-size: 11px; font-weight: 500; color: var(--t2); }
.eroom.lb .en { top: auto; bottom: 7px; }
.eroom.hot { box-shadow: inset 0 0 0 1.5px rgba(var(--blue), .9), 0 0 0 4px rgba(var(--blue), .18); }
.eroom.dim { opacity: .55; }
.eroom.ghost { pointer-events: none; background: rgba(var(--blue), .08); box-shadow: none; outline: 1.5px dashed rgba(100, 170, 255, .9); outline-offset: -2px; }
.efu { position: absolute; border-radius: calc(var(--fr, 8) * 1px); background: linear-gradient(165deg, rgba(255, 255, 255, .1), rgba(255, 255, 255, .04)); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .17); }
.efu.c { border-radius: 50%; }
.efu.rug { background: rgba(255, 255, 255, .03); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1); }
.efu.tv { background: linear-gradient(180deg, rgba(190, 210, 255, .3), rgba(120, 160, 255, .2)); }
.efu .fic { position: absolute; inset: 0; display: grid; place-items: center; font-size: min(22px, 70%); opacity: .55; pointer-events: none; }
.tool-furniture .efu:hover, .tool-furniture .efu.sel { box-shadow: inset 0 0 0 1.5px rgba(var(--blue), .9); }
.tool-furniture .efu { cursor: move; }
.eopen { position: absolute; border-radius: 4px; cursor: pointer; }
.eopen.win { background: rgb(205, 222, 248); box-shadow: 0 0 8px rgba(200, 220, 255, .55); }
.eopen.pas { background: rgba(255, 255, 255, .5); box-shadow: 0 0 0 1px rgba(255, 255, 255, .3); }
.eopen.ent { background: #fff; box-shadow: 0 0 10px rgba(255, 255, 255, .7); }
.eopen.ghost { opacity: .55; pointer-events: none; }
.eopen.sel { box-shadow: 0 0 0 2px rgb(var(--blue)), 0 0 12px rgba(var(--blue), .6); }
.emk { position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; display: grid; place-items: center; cursor: grab; touch-action: none;
  background: rgba(255, 255, 255, .14); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .25), 0 4px 12px rgba(0, 0, 0, .35); transition: transform .25s var(--snap), opacity .2s; }
.emk .ic { font-size: 18px; pointer-events: none; }
.emk.light { background: radial-gradient(circle at 50% 28%, rgb(252, 236, 196), rgb(246, 200, 89) 72%); }
.emk.light .ic { --ip: currentColor; color: rgba(44, 30, 2, .9); }
.emk.cover { background: radial-gradient(circle at 50% 28%, #fff, rgb(206, 226, 255) 72%); }
.emk.cover .ic, .emk.climate .ic, .emk.dock .ic, .emk.door .ic { --ip: currentColor; color: rgba(10, 24, 60, .85); }
.emk.climate { background: radial-gradient(circle at 50% 28%, rgb(255, 214, 170), rgb(255, 150, 62) 72%); }
.emk.dock { background: radial-gradient(circle at 50% 28%, #fff, #c8ccd6 72%); border-radius: 30%; }
.emk.door { background: radial-gradient(circle at 50% 28%, #e8ffe9, rgb(48, 209, 88) 75%); }
.emk.media { background: radial-gradient(circle at 50% 28%, rgb(220, 232, 255), rgb(150, 185, 255) 72%); }
.emk.media .ic { --ip: currentColor; color: rgba(10, 24, 60, .85); }
.emk.other { background: rgba(255, 255, 255, .2); }
.emk.off { opacity: .28; transform: scale(.82); }
.emk:hover { transform: scale(1.1); }
.emk.sel { box-shadow: 0 0 0 3px rgb(var(--blue)), 0 0 0 7px rgba(var(--blue), .25), 0 6px 16px rgba(0, 0, 0, .45); }
.emk.drag { cursor: grabbing; transform: scale(1.15); }
.emk.warn::after { content: '!'; position: absolute; right: -4px; top: -4px; width: 15px; height: 15px; border-radius: 50%; background: rgb(var(--orange)); color: #1a0e00; font-size: 11px; font-weight: 800; display: grid; place-items: center; }
.ewid { position: absolute; border-radius: 14px; display: grid; place-items: center; text-align: center; font-size: 12px; font-weight: 600; color: var(--t2); cursor: move;
  background: repeating-linear-gradient(135deg, rgba(255, 255, 255, .05) 0 8px, rgba(255, 255, 255, .02) 8px 16px); box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .22); }
.ewid .ic { font-size: 20px; margin: 0 auto 3px; }
.ewid.sel { box-shadow: inset 0 0 0 2px rgb(var(--blue)); color: var(--t1); }
.ewid.auto { box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .14); }
.ehd { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: #fff; box-shadow: 0 0 0 2px rgb(var(--blue)), 0 2px 6px rgba(0, 0, 0, .4); z-index: 20; touch-action: none; }
.ehd.e, .ehd.w { cursor: ew-resize; } .ehd.n, .ehd.s { cursor: ns-resize; } .ehd.nw, .ehd.se { cursor: nwse-resize; } .ehd.ne, .ehd.sw { cursor: nesw-resize; }
.esel { position: absolute; pointer-events: none; border-radius: 10px; box-shadow: 0 0 0 2px rgb(var(--blue)), 0 0 0 6px rgba(var(--blue), .18); z-index: 19; }
.eguide { position: absolute; pointer-events: none; background: rgba(255, 70, 200, .85); z-index: 18; }
.eguide.v { width: 1px; top: 0; bottom: 0; } .eguide.h { height: 1px; left: 0; right: 0; }
.edraw { position: absolute; pointer-events: none; border-radius: 10px; background: rgba(var(--blue), .14); box-shadow: inset 0 0 0 1.5px rgba(var(--blue), .9); z-index: 17; }
.edim { position: absolute; z-index: 21; pointer-events: none; padding: 3px 8px; border-radius: 7px; font-size: 11.5px; font-weight: 650; font-variant-numeric: tabular-nums; white-space: nowrap;
  background: rgba(var(--blue), .92); color: #fff; transform: translate(-50%, -130%); }
.emeas { position: absolute; z-index: 21; pointer-events: none; }
.emeas i { position: absolute; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; background: rgb(255, 70, 200); box-shadow: 0 0 0 2px #fff; }
.ezoom { position: absolute; right: 14px; bottom: 14px; z-index: 6; display: flex; gap: 4px; padding: 4px; border-radius: 14px;
  background: rgba(30, 30, 36, .75); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1), 0 10px 28px rgba(0, 0, 0, .4); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); }
.ezoom button { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; font-size: 17px; }
.ezoom button:hover { background: rgba(255, 255, 255, .1); }
.ehint { position: absolute; left: 50%; bottom: 16px; z-index: 6; transform: translateX(-50%); max-width: min(560px, calc(100% - 140px)); padding: 9px 16px; border-radius: 999px; font-size: 13px; font-weight: 500; color: var(--t2);
  background: rgba(30, 30, 36, .75); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1); -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px); text-align: center; pointer-events: none; transition: opacity .3s; }
.ehint:empty { opacity: 0; }

/* floating toolbar next to the selected furniture */
.efloat { position: absolute; z-index: 25; display: flex; align-items: center; gap: 2px; padding: 4px 4px 4px 12px; border-radius: 14px; white-space: nowrap;
  background: rgba(36, 36, 42, .86); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .13), 0 12px 30px rgba(0, 0, 0, .45); -webkit-backdrop-filter: blur(24px) saturate(170%); backdrop-filter: blur(24px) saturate(170%); }
.efloat span { font-size: 12px; font-weight: 600; color: var(--t2); margin-right: 6px; font-variant-numeric: tabular-nums; }
.efloat button { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; font-size: 17px; }
.efloat button:hover { background: rgba(255, 255, 255, .12); }
.efloat button[data-act="del"] .ic { --ip: rgb(255, 120, 110); }
.ecv:focus { outline: none; }

/* inspector */
.eins { position: relative; z-index: 4; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; padding: 18px 18px 30px;
  background: linear-gradient(270deg, rgba(24, 24, 30, .78), rgba(20, 20, 26, .6)); box-shadow: inset 1px 0 0 rgba(255, 255, 255, .06); }
.eins h2 { margin: 0 0 4px; font-size: 20px; font-weight: 700; letter-spacing: -.02em; }
.eins h3 { margin: 22px 0 9px; font-size: 11.5px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--t3); display: flex; align-items: center; justify-content: space-between; }
.eins p.lead { margin: 0 0 14px; font-size: 13.5px; line-height: 1.45; color: var(--t2); }
.eins p.small { margin: 8px 0 0; font-size: 12px; line-height: 1.45; color: var(--t3); }
.efield { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
.efield > label { font-size: 12.5px; font-weight: 600; color: var(--t2); }
.efield.row { flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; }
.einp, .esel2 { width: 100%; height: 38px; padding: 0 12px; border-radius: 11px; border: 0; outline: none; font: inherit; font-size: 14px; color: var(--t1);
  background: rgba(255, 255, 255, .08); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .1); transition: box-shadow .2s, background .2s; -webkit-user-select: text; user-select: text; }
.einp:focus, .esel2:focus { box-shadow: inset 0 0 0 1.5px rgba(var(--blue), .9); background: rgba(255, 255, 255, .1); }
.einp.num { width: 92px; text-align: right; font-variant-numeric: tabular-nums; }
.esel2 { appearance: none; -webkit-appearance: none; padding-right: 30px; background-image: linear-gradient(45deg, transparent 50%, rgba(235, 235, 245, .6) 50%), linear-gradient(135deg, rgba(235, 235, 245, .6) 50%, transparent 50%);
  background-position: calc(100% - 17px) 17px, calc(100% - 12px) 17px; background-size: 5px 5px; background-repeat: no-repeat; }
.esel2 option { background: #26262c; color: #f5f5f7; }
.eseg { position: relative; display: flex; padding: 3px; border-radius: 12px; background: rgba(0, 0, 0, .28); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06); }
.eseg button { position: relative; z-index: 1; flex: 1; min-width: 0; height: 32px; border-radius: 9px; font-size: 12.5px; font-weight: 600; color: var(--t2); display: flex; align-items: center; justify-content: center; gap: 5px; transition: color .2s, background .2s; white-space: nowrap; padding: 0 6px; }
.eseg button .ic { font-size: 15px; }
.eseg button.act { color: var(--t1); background: rgba(255, 255, 255, .16); box-shadow: 0 2px 6px rgba(0, 0, 0, .25), inset 0 0 0 1px rgba(255, 255, 255, .08); }
.eseg button.act .ic { --ip: currentColor; }
.erange { width: 100%; accent-color: #fff; }
.etgl { position: relative; flex: none; width: 46px; height: 28px; border-radius: 99px; background: rgba(120, 120, 128, .32); transition: background .25s; }
.etgl::after { content: ''; position: absolute; left: 2px; top: 2px; width: 24px; height: 24px; border-radius: 50%; background: #fff; box-shadow: 0 2px 6px rgba(0, 0, 0, .3); transition: transform .3s var(--snap); }
.etgl.on { background: rgb(var(--green)); }
.etgl.on::after { transform: translateX(18px); }
.ebtns { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.ebtns .ebtn { flex: 1; }
.echips { display: flex; flex-wrap: wrap; gap: 6px; }
.echip { height: 32px; padding: 0 11px; border-radius: 99px; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--t2);
  background: rgba(255, 255, 255, .07); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .09); transition: background .2s, color .2s; }
.echip .ic { font-size: 15px; }
.echip:hover { background: rgba(255, 255, 255, .12); color: var(--t1); }
.echip.act { background: #fff; color: #0c0c0e; box-shadow: none; }
.echip.act .ic { --ip: currentColor; }
.echip.chk.act { background: rgba(var(--blue), .9); color: #fff; }
.epal { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.epal button { height: 74px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; font-size: 11.5px; font-weight: 600; color: var(--t2);
  background: rgba(255, 255, 255, .06); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08); cursor: grab; transition: background .2s, transform .3s var(--snap), color .2s; touch-action: none; }
.epal button .ic { font-size: 25px; }
.epal button:hover { background: rgba(255, 255, 255, .11); color: var(--t1); }
.epal button:active { transform: scale(.95); }
.eicons { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; }
.eicons button { height: 40px; border-radius: 11px; display: grid; place-items: center; font-size: 20px; background: rgba(255, 255, 255, .05); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .06); }
.eicons button:hover { background: rgba(255, 255, 255, .11); }
.eicons button.act { background: #fff; }
.eicons button.act .ic { --ip: #0c0c0e; }
.esearch { position: relative; }
.esearch .ic { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); font-size: 16px; opacity: .7; pointer-events: none; }
.esearch .einp { padding-left: 34px; }
.elist { display: flex; flex-direction: column; gap: 2px; margin-top: 10px; }
.egrp { margin: 12px 4px 4px; font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--t3); display: flex; justify-content: space-between; align-items: center; }
.egrp button { font-size: 11.5px; font-weight: 600; letter-spacing: 0; text-transform: none; color: rgb(100, 170, 255); }
.erow { display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 6px 8px 6px 10px; border-radius: 12px; cursor: grab; touch-action: none; transition: background .15s; }
.erow:hover { background: rgba(255, 255, 255, .07); }
.erow .ei { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 16px; background: rgba(255, 255, 255, .08); }
.erow > div { flex: 1; min-width: 0; }
.erow b { display: block; font-size: 13.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.erow small { display: block; margin-top: 1px; font-size: 11.5px; color: var(--t3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.erow .eadd { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-size: 16px; background: rgba(255, 255, 255, .08); }
.erow .eadd:hover { background: rgba(255, 255, 255, .16); }
.erow.placed .ei { background: rgba(var(--green), .22); }
.erow.placed .eadd { background: none; color: rgb(var(--green)); cursor: pointer; }
.erow.placed .eadd .ic { --ip: currentColor; }
.erow.on { background: rgba(var(--blue), .16); }
.eempty { padding: 16px; border-radius: 14px; background: rgba(255, 255, 255, .04); font-size: 13px; line-height: 1.45; color: var(--t2); }
.ecard { margin-top: 10px; padding: 12px 14px; border-radius: 16px; background: rgba(255, 255, 255, .05); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .07); }
.ecard.drop { box-shadow: inset 0 0 0 1.5px rgba(var(--blue), .7); }
.elayer { display: flex; align-items: center; gap: 10px; min-height: 48px; }
.elayer .ei { flex: none; width: 34px; height: 34px; border-radius: 11px; display: grid; place-items: center; font-size: 19px; background: rgba(255, 255, 255, .09); }
.elayer > div { flex: 1; min-width: 0; }
.elayer b { display: block; font-size: 14px; font-weight: 600; }
.elayer small { display: block; font-size: 12px; line-height: 1.35; color: var(--t3); }
.elayer .mv { display: flex; gap: 2px; }
.elayer .mv button { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; font-size: 14px; color: var(--t2); }
.elayer .mv button:hover { background: rgba(255, 255, 255, .1); }
.edrag-ghost { position: fixed; z-index: 1000; pointer-events: none; width: 40px; height: 40px; margin: -20px 0 0 -20px; border-radius: 50%; display: grid; place-items: center; font-size: 20px;
  background: rgba(255, 255, 255, .9); box-shadow: 0 10px 30px rgba(0, 0, 0, .5); }
.edrag-ghost .ic { --ip: #0c0c0e; }
.edrag-ghost.sq { border-radius: 12px; }
.edrag-ghost.pill { width: auto; height: 36px; margin: -18px 0 0 -18px; padding: 0 14px 0 10px; gap: 7px; display: flex; border-radius: 99px; font-size: 13.5px; font-weight: 650; color: #0c0c0e; }
.edrag-ghost.pill .ic { font-size: 17px; }
.echip.area { cursor: grab; touch-action: none; }
.echip.area small { margin-left: 2px; padding: 1px 6px; border-radius: 99px; font-size: 11px; font-weight: 700; background: rgba(255, 255, 255, .12); color: var(--t1); }
.echip.area.done { color: rgb(var(--green)); background: rgba(var(--green), .1); box-shadow: inset 0 0 0 1px rgba(var(--green), .3); }
.echip.area.done .ic { --ip: currentColor; }
.echip.area.empty { opacity: .55; }
.eroom .en em { display: block; margin-top: 2px; font-style: normal; font-size: 10.5px; font-weight: 600; color: rgb(var(--orange)); }

/* preview */
.eprev { position: absolute; inset: 60px 0 0 0; z-index: 30; display: none; background: #08090c; }
.eprev.on { display: block; }
.eprev .pbar { position: absolute; left: 50%; top: 12px; z-index: 3; transform: translateX(-50%); }
.eprev .frame { position: absolute; inset: 60px 0 0 0; overflow: auto; }
.eprev .frame.phone { inset: 60px 0 0 0; display: flex; justify-content: center; align-items: flex-start; overflow: hidden; }
.eprev .phonebox { width: 390px; height: min(780px, calc(100% - 20px)); border-radius: 40px; overflow-y: auto; overflow-x: hidden; box-shadow: 0 0 0 10px #000, 0 0 0 12px #3a3b40, 0 30px 80px rgba(0, 0, 0, .6); scrollbar-width: none; }

/* toast */
.etoast { position: absolute; left: 50%; top: 74px; z-index: 40; padding: 10px 18px; border-radius: 999px; font-size: 13.5px; font-weight: 600; white-space: nowrap;
  background: rgba(50, 50, 56, .9); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .13), 0 18px 44px rgba(0, 0, 0, .45); opacity: 0; transform: translate(-50%, -10px); transition: opacity .25s, transform .4s var(--sp); pointer-events: none; }
.etoast.show { opacity: 1; transform: translate(-50%, 0); }

/* narrow screens: rail at the bottom, inspector as a sheet */
@media (max-width: 760px) {
  .ew { grid-template-columns: minmax(0, 1fr); grid-template-rows: 56px minmax(0, 1fr) auto 72px; }
  .etop h1 small { display: none; }
  .ecv { grid-row: 2; }
  .eins { grid-row: 3; max-height: 42vh; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .08); }
  .erail { grid-row: 4; flex-direction: row; overflow-x: auto; padding: 6px 8px; justify-content: flex-start; }
  .erail button { width: 64px; min-height: 56px; flex: none; }
  .erail .rsep { width: 1px; height: 36px; margin: 0 4px; }
  .etop { padding: 0 10px; gap: 6px; }
  .etop h1 { display: none; }
  .etop .undo { margin-left: auto; }
  .etop .ebtn.lbl span { display: none; }
  .etop .ebtn.lbl { padding: 0 11px; }
  .etop .esep { display: none; }
  .emk { width: 26px; height: 26px; margin: -13px 0 0 -13px; }
  .emk .ic { font-size: 14px; }
  .ehint { display: none; }
}
`;

/* ================================================================== Floor plan editor (full screen)
 * Draw the home on top of a photo/sketch of the floor plan: rooms as rectangles (snap to each other), furniture
 * from a palette, windows / passages / the front door by clicking a wall, devices dragged from a list of
 * Home Assistant entities (grouped by area) onto the plan. Everything is stored in the card configuration. */
const ED_GRID = 5;
const ED_TOOLS = [
  ['sketch', 'image'], ['rooms', 'plan'], ['furniture', 'sofa'], ['openings', 'window'], ['devices', 'bulb'], null, ['layers', 'layers'], ['tiles', 'widget'], ['settings', 'sliders'],
];
const OPEN_KINDS = { window: { key: 'windows', len: 100 }, door: { key: 'doors', len: 80 }, entrance: { key: 'entrance', len: 90 } };
const NO_DEVICE_DOMAINS = ['sun', 'zone', 'person', 'update', 'tts', 'stt', 'conversation', 'todo', 'weather', 'tag', 'device_tracker', 'image', 'notify', 'ai_task', 'wake_word', 'assist_satellite', 'calendar', 'event', 'persistent_notification', 'group', 'counter', 'timer', 'schedule', 'input_text', 'input_datetime', 'date', 'time', 'datetime', 'text'];
const LAYER_FILTER = {
  light: (d) => d === 'light' || d === 'media_player',
  climate: (d, dc) => ['climate', 'water_heater', 'humidifier'].includes(d) || (d === 'sensor' && ['temperature', 'humidity'].includes(dc)),
  cover: (d) => d === 'cover',
  vacuum: (d) => d === 'vacuum',
  custom: (d) => !NO_DEVICE_DOMAINS.includes(d),
};
const r0 = (v) => Math.round(v);
const deep = (o) => JSON.parse(JSON.stringify(o ?? null));

class GfcEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._undo = [];
    this._redo = [];
    this._tool = 'rooms';
    this._s = null;
    this._openKind = 'window';
    this._layerSel = 'light';
    this._q = '';
    this._v = { x: 0, y: 0, z: 0.6 };
  }

  /* ---------------------------------------------------------------- open / close */
  open({ config, hass, onSave, onClose } = {}) {
    this._hs = typeof hass === 'function' ? hass : () => hass;
    this._onSave = onSave;
    this._onClose = onClose;
    this._c = normEditorConfig(deep(config) || {});
    this._orig = JSON.stringify(this._c);
    this._useLang();
    this._tool = this._c.rooms.length ? 'rooms' : 'sketch';
    this._loadUnderlay();
    this._shell();
    if (!this.isConnected) document.body.append(this);
    this._dlg.showModal();
    this._cv.focus({ preventScroll: true });
    requestAnimationFrame(() => { this._fit(); this._draw(); this._panel(); requestAnimationFrame(() => { if (!this._viewTouched) { this._fit(); this._draw(); } }); });
  }

  _useLang() {
    const h = this._hs?.(), c = this._c?.language;
    const l = c && c !== 'auto' ? c : h?.locale?.language || h?.language || navigator.language || 'en';
    LANG = String(l).toLowerCase().startsWith('de') ? 'de' : 'en';
    LOCALE = h?.locale?.language || h?.language || (LANG === 'de' ? 'de-DE' : 'en');
  }

  _close(save) {
    if (save) this._onSave?.(cleanConfig(this._c));
    this._dlg?.close();
    window.removeEventListener('keydown', this._onKey, true);
    this._onClose?.();
    this.remove();
  }

  _dirty() { return JSON.stringify(this._c) !== this._orig; }

  /* ---------------------------------------------------------------- shell */
  _shell() {
    this.shadowRoot.innerHTML = `<style>${STYLES}${EDITOR_STYLES}</style>
<dialog class="ed"><div class="root ew" style="${springVars()}">
  <svg class="defs" width="0" height="0" aria-hidden="true"><defs><linearGradient id="gfcg" gradientUnits="userSpaceOnUse" x1="0" y1="2" x2="0" y2="22"><stop offset="0" stop-color="#fbfbfd" stop-opacity=".94"/><stop offset=".55" stop-color="#d8dae1" stop-opacity=".8"/><stop offset="1" stop-color="#9ca1ad" stop-opacity=".7"/></linearGradient></defs></svg>
  <div class="etop">
    <h1>${esc(t('ed_title'))}<small></small></h1>
    <button class="ebtn icon undo" title="${esc(t('ed_undo'))}">${icon('undo')}</button>
    <button class="ebtn icon redo" title="${esc(t('ed_redo'))}">${icon('redo')}</button>
    <i class="esep"></i>
    <button class="ebtn lbl prev">${icon('eye')}<span>${esc(t('ed_preview'))}</span></button>
    <button class="ebtn lbl cancel">${esc(t('ed_cancel'))}</button>
    <button class="ebtn white save">${icon('check')}<span>${esc(t('ed_done'))}</span></button>
  </div>
  <nav class="erail">${ED_TOOLS.map((x) => (x ? `<button data-tool="${x[0]}">${icon(x[1])}<span>${esc(t(`ed_tool_${x[0]}`))}</span></button>` : '<i class="rsep"></i>')).join('')}</nav>
  <div class="ecv" tabindex="-1" autofocus><div class="grid"></div><img class="ul" alt="" hidden><div class="world"></div>
    <div class="ezoom"><button class="zo" title="−">${icon('minus')}</button><button class="zf" title="${esc(t('ed_fit'))}">${icon('fit')}</button><button class="zi" title="+">${icon('plus')}</button></div>
    <div class="ehint"></div></div>
  <aside class="eins"></aside>
  <div class="eprev"><div class="pbar"></div><div class="frame"></div></div>
  <div class="etoast"></div>
</div></dialog>`;
    const $ = (s) => this.shadowRoot.querySelector(s);
    this.$ = $;
    this._dlg = $('dialog');
    this._cv = $('.ecv');
    this._world = $('.world');
    this._ins = $('.eins');
    this._ulEl = $('.ul');
    // keys and clicks stay in the editor (Home Assistant's edit dialog must not react to them, e.g. close on Escape)
    for (const type of ['keydown', 'keyup', 'click', 'pointerdown', 'wheel']) this._dlg.addEventListener(type, (e) => e.stopPropagation());
    this._dlg.addEventListener('cancel', (e) => { e.preventDefault(); if (this.$('.eprev.on')) this._preview(false); else if (this._s) { this._s = null; this._draw(); this._panel(); } else this._tryClose(); });
    $('.undo').addEventListener('click', () => this._doUndo());
    $('.redo').addEventListener('click', () => this._doRedo());
    $('.save').addEventListener('click', () => this._close(true));
    $('.cancel').addEventListener('click', () => this._tryClose());
    $('.prev').addEventListener('click', () => this._preview(!this.$('.eprev.on')));
    $('.zi').addEventListener('click', () => this._zoomBy(1.25));
    $('.zo').addEventListener('click', () => this._zoomBy(0.8));
    $('.zf').addEventListener('click', () => { this._fit(); this._draw(); });
    this.shadowRoot.querySelectorAll('.erail button').forEach((b) => b.addEventListener('click', () => this._setTool(b.dataset.tool)));
    this._wireCanvas();
    if (this._onKey) window.removeEventListener('keydown', this._onKey, true);
    this._ro?.disconnect();
    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey, true);
    this._ro = new ResizeObserver(() => { if (!this._viewTouched) this._fit(); this._draw(); });
    this._ro.observe(this._cv);
    this._syncTop();
  }

  _tryClose() {
    if (this._dirty() && !this._confirmClose) {
      this._confirmClose = true;
      this._toast(t('ed_unsaved'));
      setTimeout(() => { this._confirmClose = false; }, 3500);
      return;
    }
    this._close(false);
  }

  _toast(text) {
    const el = this.$('.etoast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._tT);
    this._tT = setTimeout(() => el.classList.remove('show'), 2600);
  }

  _setTool(tool) {
    if (this._tool === tool) return;
    this._tool = tool;
    this._s = null;
    this._measure = null;
    this._draw();
    this._panel();
  }

  _syncTop() {
    this.shadowRoot.querySelectorAll('.erail button').forEach((b) => b.classList.toggle('act', b.dataset.tool === this._tool));
    this.$('.undo').disabled = !this._undo.length;
    this.$('.redo').disabled = !this._redo.length;
    const n = this._c.rooms.length, e = this._c.entities.filter((x) => x.at).length;
    this.$('.etop h1 small').textContent = n ? t('ed_summary', n, e) : '';
    this._cv.className = `ecv tool-${this._tool}${this._ulSrc ? ' ul-on' : ''}${this._tool === 'rooms' || (this._tool === 'sketch' && this._measure) ? ' draw' : ''}`;
  }

  /* ---------------------------------------------------------------- undo / redo */
  _snap() {
    const s = JSON.stringify(this._c);
    if (this._undo[this._undo.length - 1] !== s) this._undo.push(s);
    if (this._undo.length > 120) this._undo.shift();
    this._redo = [];
  }
  _doUndo() {
    if (!this._undo.length) return;
    this._redo.push(JSON.stringify(this._c));
    this._c = JSON.parse(this._undo.pop());
    this._s = null;
    this._draw(); this._panel();
  }
  _doRedo() {
    if (!this._redo.length) return;
    this._undo.push(JSON.stringify(this._c));
    this._c = JSON.parse(this._redo.pop());
    this._s = null;
    this._draw(); this._panel();
  }
  _change(fn, opts = {}) {
    this._snap();
    fn();
    if (!opts.keepSel && this._s && !this._selObj()) this._s = null;
    this._draw();
    if (opts.panel !== false) this._panel();
  }

  /* ---------------------------------------------------------------- view */
  _bounds() {
    const rects = [...this._c.rooms.map((r) => r.rect), ...(this._pending?.rooms || []).map((r) => r.rect)];
    if (this._c.underlay?.rect && this._ulSrc) rects.push(this._c.underlay.rect);
    return bboxOf(rects) || [0, 0, 1200, 800];
  }
  _fit() {
    const r = this._cv.getBoundingClientRect();
    if (!r.width) return;
    const narrow = r.width < 600, B = this._bounds(), pad = narrow ? 18 : 70, hint = narrow ? 0 : 30;
    const z = clamp(Math.min((r.width - 2 * pad) / (B[2] - B[0]), (r.height - 2 * pad - hint) / (B[3] - B[1])), 0.05, 4);
    this._v = { z, x: (B[0] + B[2]) / 2 - r.width / 2 / z, y: (B[1] + B[3]) / 2 - (r.height - hint) / 2 / z };
  }
  _zoomBy(k, cx, cy) {
    this._viewTouched = true;
    const r = this._cv.getBoundingClientRect(), v = this._v;
    const px = cx ?? r.width / 2, py = cy ?? r.height / 2;
    const wx = v.x + px / v.z, wy = v.y + py / v.z;
    v.z = clamp(v.z * k, 0.05, 6);
    v.x = wx - px / v.z;
    v.y = wy - py / v.z;
    this._draw();
  }
  X(x) { return (x - this._v.x) * this._v.z; }
  Y(y) { return (y - this._v.y) * this._v.z; }
  _pt(e) {
    const r = this._cv.getBoundingClientRect();
    return [this._v.x + (e.clientX - r.left) / this._v.z, this._v.y + (e.clientY - r.top) / this._v.z];
  }
  _boxPx([a, b, c, d]) { return `left:${this.X(a).toFixed(1)}px;top:${this.Y(b).toFixed(1)}px;width:${((c - a) * this._v.z).toFixed(1)}px;height:${((d - b) * this._v.z).toFixed(1)}px`; }

  /* the model the card would build (for auto placed tiles, rooms of devices …) */
  _model() {
    try { return buildModel(cleanConfig(this._c), this._hs()); } catch (e) { return null; }
  }

  /* ---------------------------------------------------------------- draw */
  _draw() {
    if (!this._world) return;
    this._syncTop();
    const v = this._v, c = this._c, z = v.z;
    const g = this.$('.grid'), step = 50 * z;
    g.style.backgroundSize = `${step}px ${step}px`;
    g.style.backgroundPosition = `${(-v.x * z) % step}px ${(-v.y * z) % step}px`;
    // underlay
    const ul = this._ulEl;
    if (this._ulSrc && c.underlay?.rect) {
      if (ul.getAttribute('src') !== this._ulSrc) ul.src = this._ulSrc;
      ul.hidden = false;
      const [a, b, cc, d] = c.underlay.rect;
      Object.assign(ul.style, { left: `${this.X(a)}px`, top: `${this.Y(b)}px`, width: `${(cc - a) * z}px`, height: `${(d - b) * z}px`, opacity: String(c.underlay.opacity ?? 0.6),
        filter: c.underlay.invert ? 'invert(1) hue-rotate(180deg) contrast(1.1)' : '' });
    } else ul.hidden = true;

    const tool = this._tool, sel = this._s, M = this._model();
    const hs = this._hs() || {};
    let html = '';
    // rooms
    const hasAreas = Object.keys(hs.areas || {}).length > 0;
    c.rooms.forEach((r, i) => {
      const [a, b, cc, d] = r.rect, w = (cc - a) / 100, h = (d - b) / 100;
      const on = (sel?.t === 'room' && sel.i === i) || this._dropRoom === i;
      const an = r.area ? hs.areas?.[r.area]?.name || r.area : null;
      const area = an && an !== r.name ? ` · ${esc(an)}` : '';
      html += `<div class="eroom${r.label === 'bottom' ? ' lb' : ''}${on ? ' hot' : ''}" data-k="room" data-i="${i}" style="${this._boxPx([a + 1.5 / z, b + 1.5 / z, cc - 1.5 / z, d - 1.5 / z])}">
        <div class="en">${esc(r.name || t('ed_room'))}<small>${fmt(w, 1)} × ${fmt(h, 1)} m${area}</small>${!r.area && hasAreas && tool === 'rooms' ? `<em>${esc(t('ed_noAreaYet'))}</em>` : ''}</div></div>`;
    });
    // a floor plan waiting to be imported: dashed outlines
    for (const r of this._pending?.rooms || []) html += `<div class="eroom ghost" style="${this._boxPx(r.rect)}"><div class="en">${esc(r.name)}</div></div>`;
    // furniture
    c.rooms.forEach((r, ri) => (r.furniture || []).forEach((f, fi) => {
      const F = normFurn(f);
      if (!F) return;
      const on = sel?.t === 'furn' && sel.r === ri && sel.i === fi;
      const def = FURN_KINDS[F.kind] || FURN_KINDS.block, small = Math.min(F.r[2] - F.r[0], F.r[3] - F.r[1]) * z;
      html += `<div class="efu ${esc(F.kind)}${F.circle ? ' c' : ''}${on ? ' sel' : ''}" data-k="furn" data-r="${ri}" data-i="${fi}" style="${this._boxPx(F.r)};--fr:${(F.rad * z * 1.3).toFixed(1)}">${small > 26 && tool === 'furniture' ? `<span class="fic">${icon(def.icon)}</span>` : ''}</div>`;
    }));
    // openings
    const th = Math.max(5, 9 * z);
    const segBox = (s) => (s[1] === s[3]
      ? `left:${this.X(s[0])}px;top:${this.Y(s[1]) - th / 2}px;width:${(s[2] - s[0]) * z}px;height:${th}px`
      : `left:${this.X(s[0]) - th / 2}px;top:${this.Y(s[1])}px;width:${th}px;height:${(s[3] - s[1]) * z}px`);
    for (const [kind, { key }] of Object.entries(OPEN_KINDS)) {
      const list = key === 'entrance' ? (c.entrance ? [c.entrance] : []) : c[key];
      list.forEach((s0, i) => {
        const s = normSeg(s0);
        if (!s) return;
        const on = sel?.t === 'open' && sel.k === kind && sel.i === i;
        html += `<div class="eopen ${kind === 'window' ? 'win' : kind === 'door' ? 'pas' : 'ent'}${on ? ' sel' : ''}" data-k="open" data-o="${kind}" data-i="${i}" style="${segBox(s)}" title="${esc(t(`ed_open_${kind}`))}"></div>`;
      });
    }
    if (this._hover && tool === 'openings') html += `<div class="eopen ghost ${this._openKind === 'window' ? 'win' : this._openKind === 'door' ? 'pas' : 'ent'}" style="${segBox(this._hover.seg)}"></div>`;
    // tiles (auto or manual)
    if (tool === 'tiles' && M) {
      for (const k of ['card', 'weather', 'indoor', 'door', 'bar']) {
        const R = M.widgets[k];
        if (!R) continue;
        const manual = Array.isArray(c.widgets?.[k]), on = sel?.t === 'wid' && sel.k === k;
        html += `<div class="ewid${manual ? '' : ' auto'}${on ? ' sel' : ''}" data-k="wid" data-w="${k}" style="${this._boxPx([R[0] + 6 * M.D, R[1] + 6 * M.D, R[2] - 6 * M.D, R[3] - 6 * M.D])}"><div>${icon({ card: 'widget', weather: 'partly', indoor: 'thermo', door: 'door', bar: 'layers' }[k])}${esc(t(`ed_tile_${k}`))}</div></div>`;
      }
    }
    // device markers
    const L = this._layerSel, layer = this._layerDef(L);
    c.entities.forEach((e, i) => {
      if (!e.at) return;
      const st = hs.states?.[e.entity], kind = kindOf(e.entity, st);
      const vis = tool === 'devices' && layer && this._inLayerDef(layer, e.entity, kind);
      const on = sel?.t === 'ent' && sel.i === i;
      const ic = e.icon && ICONS[e.icon] ? e.icon : e.icon && MDI_MAP[e.icon] ? MDI_MAP[e.icon] : kind === 'light' ? 'bulb' : GlassFloorplanCard.prototype._autoIcon(e.entity, st);
      const out = !c.rooms.some((r) => inRect(r.rect, e.at));
      html += `<div class="emk ${kind}${vis ? '' : ' off'}${on ? ' sel' : ''}${out && vis ? ' warn' : ''}" data-k="mk" data-i="${i}" style="left:${this.X(e.at[0])}px;top:${this.Y(e.at[1])}px;${vis ? '' : 'pointer-events:none;'}" title="${esc(e.name || st?.attributes?.friendly_name || e.entity)}">${icon(ic)}</div>`;
    });
    if (c.door?.at) {
      const vis = tool === 'devices' && L === 'light';
      html += `<div class="emk door${vis ? '' : ' off'}${sel?.t === 'door' ? ' sel' : ''}" data-k="mk" data-m="door" style="left:${this.X(c.door.at[0])}px;top:${this.Y(c.door.at[1])}px;${vis ? '' : 'pointer-events:none;'}">${icon('door')}</div>`;
    }
    if (c.vacuum?.entity && c.vacuum.dock) {
      const vis = tool === 'devices' && L === 'vacuum';
      html += `<div class="emk dock${vis ? '' : ' off'}${sel?.t === 'dock' ? ' sel' : ''}" data-k="mk" data-m="dock" style="left:${this.X(c.vacuum.dock[0])}px;top:${this.Y(c.vacuum.dock[1])}px;${vis ? '' : 'pointer-events:none;'}">${icon('dock')}</div>`;
    }
    // selection handles
    const hd = (x, y, cls, extra = '') => `<i class="ehd ${cls}" data-k="hd" data-h="${cls}"${extra} style="left:${x}px;top:${y}px"></i>`;
    const rectHandles = (R, list = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se']) => {
      const [a, b, cc, d] = [this.X(R[0]), this.Y(R[1]), this.X(R[2]), this.Y(R[3])], mx = (a + cc) / 2, my = (b + d) / 2;
      const P = { n: [mx, b], s: [mx, d], e: [cc, my], w: [a, my], nw: [a, b], ne: [cc, b], sw: [a, d], se: [cc, d] };
      return `<i class="esel" style="left:${a}px;top:${b}px;width:${cc - a}px;height:${d - b}px"></i>${list.map((k) => hd(P[k][0], P[k][1], k)).join('')}`;
    };
    const so = this._selObj();
    if (so) {
      if (sel.t === 'room') html += sel.fresh ? `<i class="esel" style="${this._boxPx(so.rect)};opacity:.55"></i>` : rectHandles(so.rect);
      else if (sel.t === 'furn') html += rectHandles(normFurn(so).r);
      else if (sel.t === 'wid') html += rectHandles(so);
      else if (sel.t === 'ul') html += rectHandles(so.rect, ['nw', 'ne', 'sw', 'se']);
      else if (sel.t === 'open') {
        const s = normSeg(so);
        html += hd(this.X(s[0]), this.Y(s[1]), segH(s) ? 'w' : 'n', ' data-end="0"') + hd(this.X(s[2]), this.Y(s[3]), segH(s) ? 'e' : 's', ' data-end="1"');
      }
    }
    if (sel?.t === 'furn' && so) {
      const R = normFurn(so).r, top = this.Y(R[1]), below = top < 56;
      html += `<div class="efloat" style="left:${this.X((R[0] + R[2]) / 2)}px;top:${below ? this.Y(R[3]) + 14 : top - 14}px;transform:translate(-50%, ${below ? '0' : '-100%'})">
        <span>${esc(t(`furn_${normFurn(so).kind}`))} · ${r0(R[2] - R[0])} × ${r0(R[3] - R[1])}</span>
        <button data-act="rot" title="${esc(t('ed_rotate'))} (R)">${icon('rotate')}</button><button data-act="dup" title="${esc(t('ed_duplicate'))}">${icon('copy')}</button><button data-act="del" title="${esc(t('ed_delete'))}">${icon('trash')}</button></div>`;
    }
    if (this._drawRect) html += `<div class="edraw" style="${this._boxPx(this._drawRect)}"></div><div class="edim" style="left:${this.X((this._drawRect[0] + this._drawRect[2]) / 2)}px;top:${this.Y(this._drawRect[1])}px">${fmt((this._drawRect[2] - this._drawRect[0]) / 100, 2)} × ${fmt((this._drawRect[3] - this._drawRect[1]) / 100, 2)} m</div>`;
    for (const gx of this._guides?.x || []) html += `<i class="eguide v" style="left:${this.X(gx)}px"></i>`;
    for (const gy of this._guides?.y || []) html += `<i class="eguide h" style="top:${this.Y(gy)}px"></i>`;
    if (this._measure?.a) {
      const [a, b] = [this._measure.a, this._measure.b || this._measure.cur];
      html += `<svg class="emeas" style="left:0;top:0;width:100%;height:100%;overflow:visible">${b ? `<line x1="${this.X(a[0])}" y1="${this.Y(a[1])}" x2="${this.X(b[0])}" y2="${this.Y(b[1])}" stroke="rgb(255,70,200)" stroke-width="2" stroke-dasharray="6 4"/>` : ''}</svg><div class="emeas"><i style="left:${this.X(a[0])}px;top:${this.Y(a[1])}px"></i>${this._measure.b ? `<i style="left:${this.X(this._measure.b[0])}px;top:${this.Y(this._measure.b[1])}px"></i>` : ''}</div>`;
    }
    this._world.innerHTML = html;
    this._world.querySelectorAll('.efloat button').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.act === 'rot') this._rotateFurn(); else if (b.dataset.act === 'dup') this._duplicateSel(); else this._deleteSel();
    }));
    this.$('.ehint').textContent = this._hint();
  }

  _hint() {
    if (this._measure) return this._measure.b ? t('ed_hint_measure3') : this._measure.a ? t('ed_hint_measure2') : t('ed_hint_measure1');
    const tool = this._tool;
    if (tool === 'rooms') return this._c.rooms.length ? t('ed_hint_rooms') : t('ed_hint_rooms0');
    if (tool === 'openings') return t(`ed_hint_open_${this._openKind}`);
    if (tool === 'furniture') return t('ed_hint_furniture');
    if (tool === 'devices') return t('ed_hint_devices');
    if (tool === 'tiles') return t('ed_hint_tiles');
    if (tool === 'sketch') return this._ulSrc ? t('ed_hint_sketch') : '';
    return '';
  }

  _selObj() {
    const s = this._s, c = this._c;
    if (!s) return null;
    if (s.t === 'room') return c.rooms[s.i] || null;
    if (s.t === 'furn') return c.rooms[s.r]?.furniture?.[s.i] || null;
    if (s.t === 'open') return s.k === 'entrance' ? c.entrance : c[OPEN_KINDS[s.k].key][s.i] || null;
    if (s.t === 'ent') return c.entities[s.i] || null;
    if (s.t === 'door') return c.door || null;
    if (s.t === 'dock') return c.vacuum || null;
    if (s.t === 'wid') return this._model()?.widgets[s.k] || null;
    if (s.t === 'ul') return c.underlay?.rect ? c.underlay : null;
    return null;
  }

  /* ---------------------------------------------------------------- snapping */
  _snapV(v, axis, skip, tol) {
    const c = this._c, cand = [];
    c.rooms.forEach((r, i) => { if (i !== skip) cand.push(axis === 'x' ? r.rect[0] : r.rect[1], axis === 'x' ? r.rect[2] : r.rect[3]); });
    let best = null, bd = tol ?? 9 / this._v.z;
    for (const q of cand) { const d = Math.abs(q - v); if (d < bd) { bd = d; best = q; } }
    return best != null ? { v: best, guide: true } : { v: Math.round(v / ED_GRID) * ED_GRID, guide: false };
  }

  /* walls under the pointer: nearest room edge (for windows, passages, the front door) */
  _wallAt(p) {
    const tol = 16 / this._v.z;
    let best = null;
    this._c.rooms.forEach((r) => {
      const [a, b, c, d] = r.rect;
      const edges = [[a, b, c, b], [a, d, c, d], [a, b, a, d], [c, b, c, d]];
      for (const s of edges) {
        const dist = segDist(s, p);
        if (dist < tol && (!best || dist < best.d)) best = { s, d: dist };
      }
    });
    return best?.s || null;
  }
  _openingOn(wall, p, len) {
    const h = wall[1] === wall[3];
    const lo = h ? wall[0] : wall[1], hi = h ? wall[2] : wall[3];
    const L = Math.min(len, hi - lo), mid = clamp(Math.round((h ? p[0] : p[1]) / ED_GRID) * ED_GRID, lo + L / 2, hi - L / 2);
    return h ? [r0(mid - L / 2), wall[1], r0(mid + L / 2), wall[1]] : [wall[0], r0(mid - L / 2), wall[0], r0(mid + L / 2)];
  }

  /* ---------------------------------------------------------------- canvas pointer handling */
  _wireCanvas() {
    const cv = this._cv;
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) this._zoomBy(Math.exp(-e.deltaY * 0.0045), e.clientX - r.left, e.clientY - r.top);
      else { this._viewTouched = true; this._v.x += e.deltaX / this._v.z; this._v.y += e.deltaY / this._v.z; this._draw(); }
    }, { passive: false });
    cv.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
    cv.addEventListener('drop', (e) => { const f = e.dataTransfer?.files?.[0]; if (!f) return; e.preventDefault(); this._readDropped(f); });
    cv.addEventListener('pointerdown', (e) => this._down(e));
    cv.addEventListener('pointermove', (e) => this._move(e));
    cv.addEventListener('pointerup', (e) => this._up(e));
    cv.addEventListener('pointercancel', (e) => this._up(e, true));
    cv.addEventListener('dblclick', (e) => {
      const el = e.target.closest('[data-k="room"]');
      if (el) { this._tool = 'rooms'; this._s = { t: 'room', i: +el.dataset.i }; this._draw(); this._panel(); this._ins.querySelector('.einp')?.focus(); }
    });
    // pinch zoom (two fingers)
    this._touches = new Map();
  }

  _down(e) {
    if (e.button === 2 || e.target.closest('.efloat')) return;
    this._cv.setPointerCapture(e.pointerId);
    this._touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (this._touches.size === 2) {
      const [a, b] = [...this._touches.values()];
      this._d = { mode: 'pinch', dist: Math.hypot(a[0] - b[0], a[1] - b[1]), z: this._v.z, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v: { ...this._v } };
      return;
    }
    const p = this._pt(e), el = e.target.closest('[data-k]'), k = el?.dataset.k;
    const base = { sx: e.clientX, sy: e.clientY, p, moved: false, id: e.pointerId };
    if (e.button === 1 || this._space) { this._d = { ...base, mode: 'pan', v: { ...this._v } }; return; }
    if (this._measure) { this._d = { ...base, mode: 'measure' }; return; }
    if (k === 'hd') { this._d = { ...base, mode: 'resize', h: el.dataset.h, end: el.dataset.end, orig: deep(this._selObj()) }; return; }
    // rooms tool: dragging always draws a new room (also across others – tracing a plan); a selected room moves,
    // a short click on an unselected room selects it
    if (k === 'room' && this._tool === 'rooms' && !(this._s?.t === 'room' && this._s.i === +el.dataset.i && !this._s.fresh)) {
      const s = [this._snapV(p[0], 'x').v, this._snapV(p[1], 'y').v];
      this._d = { ...base, mode: 'draw', a: s, click: +el.dataset.i };
      return;
    }
    if (k === 'room' && (this._tool === 'rooms' || this._tool === 'sketch' || this._tool === 'settings' || this._tool === 'layers')) {
      const i = +el.dataset.i;
      this._select({ t: 'room', i }, 'rooms');
      const R = this._c.rooms[i].rect;
      // everything inside the room moves along with it
      const ents = this._c.entities.map((x, j) => (x.at && inRect(R, x.at) ? j : -1)).filter((j) => j >= 0);
      const onWall = (s) => { const q = normSeg(s); return q && ((segH(q) && (q[1] === R[1] || q[1] === R[3]) && q[0] >= R[0] - 1 && q[2] <= R[2] + 1) || (!segH(q) && (q[0] === R[0] || q[0] === R[2]) && q[1] >= R[1] - 1 && q[3] <= R[3] + 1)); };
      const shared = (s) => this._c.rooms.some((o, j) => j !== i && segDist(o.rect, [(s[0] + s[2]) / 2, (s[1] + s[3]) / 2]) < 1);
      this._d = { ...base, mode: 'move-room', i, orig: deep(this._c.rooms[i]), ents: ents.map((j) => [j, [...this._c.entities[j].at]]),
        wins: this._c.windows.map((s, j) => (onWall(s) && !shared(normSeg(s)) ? [j, deep(s)] : null)).filter(Boolean),
        door: this._c.door?.at && inRect(R, this._c.door.at) ? [...this._c.door.at] : null, dock: this._c.vacuum?.dock && inRect(R, this._c.vacuum.dock) ? [...this._c.vacuum.dock] : null,
        ent: this._c.entrance && onWall(this._c.entrance) ? deep(this._c.entrance) : null };
      return;
    }
    if (k === 'furn' && this._tool !== 'devices') {
      this._select({ t: 'furn', r: +el.dataset.r, i: +el.dataset.i }, 'furniture');
      this._d = { ...base, mode: 'move-furn', orig: deep(this._selObj()) };
      return;
    }
    if (k === 'open') {
      this._select({ t: 'open', k: el.dataset.o, i: +el.dataset.i }, 'openings');
      this._d = { ...base, mode: 'move-open', orig: normSeg(this._selObj()) };
      return;
    }
    if (k === 'mk') {
      const m = el.dataset.m;
      this._select(m ? { t: m } : { t: 'ent', i: +el.dataset.i }, 'devices');
      const at = m === 'door' ? this._c.door.at : m === 'dock' ? this._c.vacuum.dock : this._c.entities[+el.dataset.i].at;
      this._d = { ...base, mode: 'move-mk', orig: [...at] };
      return;
    }
    if (k === 'wid') {
      this._select({ t: 'wid', k: el.dataset.w }, 'tiles');
      this._d = { ...base, mode: 'move-wid', orig: deep(this._selObj()) };
      return;
    }
    // empty space
    if (this._tool === 'rooms') { const s = [this._snapV(p[0], 'x').v, this._snapV(p[1], 'y').v]; this._d = { ...base, mode: 'draw', a: s }; return; }
    if (this._tool === 'openings' && this._hover) { this._addOpening(this._hover.seg); return; }
    if (this._tool === 'sketch' && this._ulSrc && this._c.underlay?.rect && inRect(this._c.underlay.rect, p)) {
      this._select({ t: 'ul' }, 'sketch');
      this._d = { ...base, mode: 'move-ul', orig: deep(this._c.underlay.rect) };
      return;
    }
    this._d = { ...base, mode: 'pan', v: { ...this._v }, deselect: true };
  }

  _select(s, tool) {
    const changedTool = tool && this._tool !== tool;
    if (changedTool) this._tool = tool;
    const same = JSON.stringify(s) === JSON.stringify(this._s) || (s?.t === 'room' && this._s?.t === 'room' && s.i === this._s.i);
    this._s = s;
    if (s?.t === 'ent') {
      const e = this._c.entities[s.i], st = this._hs()?.states?.[e.entity], kind = kindOf(e.entity, st);
      const cur = this._layerDef(this._layerSel);
      if (!cur || !this._inLayerDef(cur, e.entity, kind)) this._layerSel = this._layersFor(e.entity, kind)[0] || this._layerSel;
    }
    if (s?.t === 'door') this._layerSel = 'light';
    if (s?.t === 'dock') this._layerSel = 'vacuum';
    this._draw();
    if (!same || changedTool) this._panel();
  }

  _move(e) {
    if (this._touches?.has(e.pointerId)) this._touches.set(e.pointerId, [e.clientX, e.clientY]);
    const d = this._d;
    const p = this._pt(e);
    if (!d) {
      if (this._tool === 'openings') {
        const wall = !e.target.closest('[data-k="open"],[data-k="hd"]') && this._wallAt(p);
        const hv = wall ? { seg: this._openingOn(wall, p, OPEN_KINDS[this._openKind].len) } : null;
        if (JSON.stringify(hv) !== JSON.stringify(this._hover)) { this._hover = hv; this._draw(); }
      } else if (this._measure?.a && !this._measure.b) { this._measure.cur = p; this._draw(); }
      return;
    }
    if (d.mode === 'pinch') {
      if (this._touches.size < 2) return;
      const [a, b] = [...this._touches.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const r = this._cv.getBoundingClientRect(), mx = d.mid[0] - r.left, my = d.mid[1] - r.top;
      const wx = d.v.x + mx / d.v.z, wy = d.v.y + my / d.v.z;
      this._v.z = clamp(d.z * (dist / d.dist), 0.05, 6);
      this._v.x = wx - mx / this._v.z; this._v.y = wy - my / this._v.z;
      this._draw();
      return;
    }
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
    if (!d.moved) { d.moved = true; if (!['pan', 'draw', 'measure'].includes(d.mode)) this._snap(); }
    const dx = p[0] - d.p[0], dy = p[1] - d.p[1], c = this._c;
    this._guides = null;
    if (d.mode === 'pan') {
      this._viewTouched = true;
      this._cv.classList.add('panning');
      this._v.x = d.v.x - (e.clientX - d.sx) / d.v.z;
      this._v.y = d.v.y - (e.clientY - d.sy) / d.v.z;
    } else if (d.mode === 'draw') {
      const sx = this._snapV(p[0], 'x'), sy = this._snapV(p[1], 'y');
      this._drawRect = normRect([d.a[0], d.a[1], sx.v, sy.v]) || [d.a[0], d.a[1], d.a[0] + 1, d.a[1] + 1];
      this._guides = { x: [d.a[0], sx.v].filter((x, i) => i === 0 ? this._snapV(d.a[0], 'x').guide : sx.guide), y: [d.a[1], sy.v].filter((y, i) => i === 0 ? this._snapV(d.a[1], 'y').guide : sy.guide) };
    } else if (d.mode === 'move-room') {
      const o = d.orig.rect, w = o[2] - o[0], h = o[3] - o[1];
      const L = this._snapV(o[0] + dx, 'x', d.i), Rr = this._snapV(o[2] + dx, 'x', d.i);
      const T = this._snapV(o[1] + dy, 'y', d.i), B = this._snapV(o[3] + dy, 'y', d.i);
      const nx = L.guide || !Rr.guide ? L.v : Rr.v - w, ny = T.guide || !B.guide ? T.v : B.v - h;
      const ddx = nx - o[0], ddy = ny - o[1];
      const room = c.rooms[d.i];
      room.rect = [nx, ny, nx + w, ny + h];
      room.furniture = (d.orig.furniture || []).map((f) => shiftFurn(f, ddx, ddy));
      for (const [j, at] of d.ents) c.entities[j].at = [r0(at[0] + ddx), r0(at[1] + ddy)];
      for (const [j, s] of d.wins) c.windows[j] = shiftSeg(s, ddx, ddy);
      if (d.door) c.door.at = [r0(d.door[0] + ddx), r0(d.door[1] + ddy)];
      if (d.dock) c.vacuum.dock = [r0(d.dock[0] + ddx), r0(d.dock[1] + ddy)];
      if (d.ent) c.entrance = shiftSeg(d.ent, ddx, ddy);
      this._guides = { x: [L.guide ? L.v : null, Rr.guide ? Rr.v : null].filter((x) => x != null), y: [T.guide ? T.v : null, B.guide ? B.v : null].filter((x) => x != null) };
    } else if (d.mode === 'move-furn') {
      const F = normFurn(d.orig), [a, b, cc, dd] = F.r, rd = (v) => Math.round(v / ED_GRID) * ED_GRID;
      const nx = rd(a + dx), ny = rd(b + dy);
      setFurnRect(this._selObj(), [nx, ny, nx + cc - a, ny + dd - b]);
    } else if (d.mode === 'move-open') {
      const s = d.orig, h = segH(s);
      const wall = this._wallAt(p), len = h ? s[2] - s[0] : s[3] - s[1];
      let n;
      if (wall && (wall[1] === wall[3]) === h) n = this._openingOn(wall, p, len);
      else n = h ? [r0(s[0] + dx), s[1], r0(s[2] + dx), s[3]] : [s[0], r0(s[1] + dy), s[2], r0(s[3] + dy)];
      this._setOpening(this._s, n);
    } else if (d.mode === 'move-mk') {
      const n = [r0(d.orig[0] + dx), r0(d.orig[1] + dy)];
      if (this._s.t === 'door') c.door.at = n; else if (this._s.t === 'dock') c.vacuum.dock = n; else c.entities[this._s.i].at = n;
    } else if (d.mode === 'move-wid') {
      const o = d.orig, w = o[2] - o[0], h = o[3] - o[1], rd = (v) => Math.round(v / ED_GRID) * ED_GRID;
      c.widgets = { ...(c.widgets || {}), [this._s.k]: [rd(o[0] + dx), rd(o[1] + dy), rd(o[0] + dx) + w, rd(o[1] + dy) + h].map(r0) };
    } else if (d.mode === 'move-ul') {
      const o = d.orig;
      c.underlay.rect = [o[0] + dx, o[1] + dy, o[2] + dx, o[3] + dy].map(r0);
    } else if (d.mode === 'resize') this._resize(d, p);
    else if (d.mode === 'measure') return;
    this._draw();
  }

  _resize(d, p) {
    const s = this._s, c = this._c, h = d.h;
    if (s.t === 'open') {
      const o = d.orig, hz = segH(o), v = Math.round((hz ? p[0] : p[1]) / ED_GRID) * ED_GRID;
      const n = [...o];
      if (hz) { if (d.end === '0') n[0] = Math.min(v, o[2] - 20); else n[2] = Math.max(v, o[0] + 20); }
      else if (d.end === '0') n[1] = Math.min(v, o[3] - 20); else n[3] = Math.max(v, o[1] + 20);
      this._setOpening(s, n);
      return;
    }
    const orig = s.t === 'room' ? d.orig.rect : s.t === 'furn' ? normFurn(d.orig).r : s.t === 'ul' ? d.orig.rect : d.orig;
    let [a, b, cc, dd] = orig;
    const min = s.t === 'furn' ? 10 : 40;
    const sx = s.t === 'room' ? this._snapV(p[0], 'x', s.i) : { v: Math.round(p[0] / ED_GRID) * ED_GRID };
    const sy = s.t === 'room' ? this._snapV(p[1], 'y', s.i) : { v: Math.round(p[1] / ED_GRID) * ED_GRID };
    if (s.t === 'ul') {
      // keep the aspect ratio of the image
      const ar = (orig[3] - orig[1]) / (orig[2] - orig[0]);
      const ax = h.includes('w') ? orig[2] : orig[0], ay = h.includes('n') ? orig[3] : orig[1];
      const w = Math.max(100, Math.abs(p[0] - ax)), hh = w * ar;
      a = h.includes('w') ? ax - w : ax; cc = h.includes('w') ? ax : ax + w;
      b = h.includes('n') ? ay - hh : ay; dd = h.includes('n') ? ay : ay + hh;
      c.underlay.rect = [a, b, cc, dd].map(r0);
      return;
    }
    if (h.includes('w')) a = Math.min(sx.v, cc - min);
    if (h.includes('e')) cc = Math.max(sx.v, a + min);
    if (h.includes('n')) b = Math.min(sy.v, dd - min);
    if (h.includes('s')) dd = Math.max(sy.v, b + min);
    const R = [a, b, cc, dd].map(r0);
    if (s.t === 'room') { c.rooms[s.i].rect = R; this._guides = { x: sx.guide ? [sx.v] : [], y: sy.guide ? [sy.v] : [] }; }
    else if (s.t === 'furn') setFurnRect(this._selObj(), R);
    else if (s.t === 'wid') c.widgets = { ...(c.widgets || {}), [s.k]: R };
  }

  _up(e, cancel) {
    this._touches?.delete(e.pointerId);
    const d = this._d;
    this._d = null;
    this._cv.classList.remove('panning');
    this._guides = null;
    if (!d) return;
    if (d.mode === 'pinch') return;
    if (d.mode === 'measure' && !cancel) { this._measureClick(this._pt(e)); return; }
    if (d.mode === 'draw') {
      const R = this._drawRect;
      this._drawRect = null;
      if (R && d.moved && !cancel && R[2] - R[0] >= 40 && R[3] - R[1] >= 40) this._addRoom(R);
      else if (!d.moved && d.click != null) this._select({ t: 'room', i: d.click });
      else if (!d.moved && this._s) { this._s = null; this._draw(); this._panel(); }
      else this._draw();
      return;
    }
    if (d.mode === 'pan' && !d.moved && d.deselect) { if (this._s) { this._s = null; this._panel(); } this._draw(); return; }
    if (d.moved && d.mode === 'move-furn') this._reparentFurn();
    if (d.moved) { this._draw(); this._panel(); }
  }

  /* furniture moved into another room belongs to that room from now on */
  _reparentFurn() {
    const s = this._s;
    if (s?.t !== 'furn') return;
    const f = this._selObj(), F = normFurn(f), cpt = center(F.r);
    const ri = this._c.rooms.findIndex((r) => inRect(r.rect, cpt));
    if (ri < 0 || ri === s.r) return;
    this._c.rooms[s.r].furniture.splice(s.i, 1);
    (this._c.rooms[ri].furniture = this._c.rooms[ri].furniture || []).push(f);
    this._s = { t: 'furn', r: ri, i: this._c.rooms[ri].furniture.length - 1 };
  }

  _setOpening(s, seg) {
    if (s.k === 'entrance') this._c.entrance = seg;
    else this._c[OPEN_KINDS[s.k].key][s.i] = seg;
  }

  _key(e) {
    if (!this._dlg?.open) return;
    const typing = e.composedPath().some((n) => n.tagName === 'INPUT' || n.tagName === 'SELECT' || n.tagName === 'TEXTAREA');
    if (e.key === ' ' && !typing) { this._space = e.type === 'keydown'; }
    if (typing) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) this._doRedo(); else this._doUndo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this._doRedo(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && this._s) { e.preventDefault(); e.stopPropagation(); this._deleteSel(); return; }
    if (mod && e.key.toLowerCase() === 'd' && this._s) { e.preventDefault(); this._duplicateSel(); return; }
    if ((e.key === 'r' || e.key === 'R') && this._s?.t === 'furn') { e.preventDefault(); this._rotateFurn(); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (arrows && this._s) { e.preventDefault(); this._nudge(arrows[0] * (e.shiftKey ? 50 : ED_GRID), arrows[1] * (e.shiftKey ? 50 : ED_GRID)); }
  }
  _nudge(dx, dy) {
    const s = this._s, o = this._selObj();
    if (!o) return;
    this._change(() => {
      if (s.t === 'room') { o.rect = [o.rect[0] + dx, o.rect[1] + dy, o.rect[2] + dx, o.rect[3] + dy]; o.furniture = (o.furniture || []).map((f) => shiftFurn(f, dx, dy)); }
      else if (s.t === 'furn') setFurnRect(o, normFurn(o).r.map((v, i) => v + (i % 2 ? dy : dx)));
      else if (s.t === 'open') this._setOpening(s, shiftSeg(normSeg(o), dx, dy));
      else if (s.t === 'ent') o.at = [o.at[0] + dx, o.at[1] + dy];
      else if (s.t === 'door') o.at = [o.at[0] + dx, o.at[1] + dy];
      else if (s.t === 'dock') o.dock = [o.dock[0] + dx, o.dock[1] + dy];
    }, { keepSel: true, panel: false });
  }

  /* ---------------------------------------------------------------- object operations */
  _addRoom(R) {
    const n = this._c.rooms.length + 1;
    this._change(() => {
      this._c.rooms.push({ id: this._uniqueRoomId(`room_${n}`), name: `${t('ed_room')} ${n}`, rect: R.map(r0), furniture: [] });
      // a new room shows its handles only after a tap – so the next room can start right at its edge
      this._s = { t: 'room', i: this._c.rooms.length - 1, fresh: true };
    });
    requestAnimationFrame(() => { const inp = this._ins.querySelector('.einp'); inp?.focus(); inp?.select(); });
  }
  _uniqueRoomId(base) {
    let id = slug(base) || 'room', k = 2;
    const ids = new Set(this._c.rooms.map((r) => r.id));
    const b = id;
    while (ids.has(id)) id = `${b}_${k++}`;
    return id;
  }
  _addOpening(seg) {
    const k = this._openKind;
    this._change(() => {
      if (k === 'entrance') { this._c.entrance = seg; this._s = { t: 'open', k, i: 0 }; }
      else { this._c[OPEN_KINDS[k].key].push(seg); this._s = { t: 'open', k, i: this._c[OPEN_KINDS[k].key].length - 1 }; }
    });
  }
  _addFurniture(kind, at) {
    const def = FURN_KINDS[kind];
    const c = this._c;
    let ri = at ? c.rooms.findIndex((r) => inRect(r.rect, at)) : this._s?.t === 'room' ? this._s.i : this._s?.t === 'furn' ? this._s.r : -1;
    if (ri < 0 && at) ri = c.rooms.map((r, i) => [rectDist(r.rect, at), i]).sort((a, b) => a[0] - b[0])[0]?.[1] ?? -1;
    if (ri < 0) ri = 0;
    const room = c.rooms[ri];
    if (!room) { this._toast(t('ed_needRoom')); return; }
    const p = at || center(room.rect);
    const x = Math.round((p[0] - def.w / 2) / ED_GRID) * ED_GRID, y = Math.round((p[1] - def.h / 2) / ED_GRID) * ED_GRID;
    this._change(() => {
      (room.furniture = room.furniture || []).push([x, y, x + def.w, y + def.h, kind]);
      this._s = { t: 'furn', r: ri, i: room.furniture.length - 1 };
      this._tool = 'furniture';
    });
  }
  _rotateFurn() {
    const f = this._selObj();
    if (!f) return;
    const [a, b, c, d] = normFurn(f).r, [cx, cy] = center([a, b, c, d]), w = c - a, h = d - b;
    this._change(() => setFurnRect(f, [cx - h / 2, cy - w / 2, cx + h / 2, cy + w / 2].map(r0)), { keepSel: true });
  }
  _deleteSel() {
    const s = this._s, c = this._c;
    if (!s) return;
    this._change(() => {
      if (s.t === 'room') c.rooms.splice(s.i, 1);
      else if (s.t === 'furn') c.rooms[s.r].furniture.splice(s.i, 1);
      else if (s.t === 'open') { if (s.k === 'entrance') delete c.entrance; else c[OPEN_KINDS[s.k].key].splice(s.i, 1); }
      else if (s.t === 'ent') {
        const eid = c.entities[s.i].entity;
        c.entities.splice(s.i, 1);
        for (const L of c.layers || []) if (L && typeof L === 'object' && Array.isArray(L.entities)) L.entities = L.entities.filter((x) => x !== eid);
      } else if (s.t === 'door') delete c.door.at;
      else if (s.t === 'dock') delete c.vacuum.dock;
      else if (s.t === 'wid' && c.widgets) delete c.widgets[s.k];
      else if (s.t === 'ul') { delete c.underlay; this._setUnderlay(null); }
      this._s = null;
    });
  }
  _duplicateSel() {
    const s = this._s, c = this._c, o = this._selObj();
    if (!o) return;
    this._change(() => {
      if (s.t === 'furn') { const f = deep(o); setFurnRect(f, normFurn(f).r.map((v) => v + 20)); c.rooms[s.r].furniture.push(f); this._s = { t: 'furn', r: s.r, i: c.rooms[s.r].furniture.length - 1 }; }
      else if (s.t === 'room') {
        const R = o.rect, w = R[2] - R[0];
        c.rooms.push({ ...deep(o), id: this._uniqueRoomId(o.id || 'room'), name: `${o.name} 2`, rect: [R[2], R[1], R[2] + w, R[3]], furniture: (o.furniture || []).map((f) => shiftFurn(f, w, 0)) });
        this._s = { t: 'room', i: c.rooms.length - 1 };
      }
    });
  }

  /* Home Assistant area → room: the room gets the area's name (if it still has a default name) and,
   * if wanted, the area's lights, thermostats, covers, media players are placed in it */
  _assignArea(i, areaId) {
    const c = this._c, room = c.rooms[i], h = this._hs() || {};
    if (!room || !areaId) return;
    let placed = 0;
    this._change(() => {
      room.area = areaId;
      const an = h.areas?.[areaId]?.name;
      if (an && (!room.name || new RegExp(`^(${t('ed_room')}|Room|Raum)( \\d+)?$`).test(room.name))) room.name = an;
      if (this._withDevices === false) return;
      let ids = Object.keys(h.states || {}).filter((id) => this._areaOf(id) === areaId && this._isPlaceable(id) && !c.entities.some((e) => e.entity === id && e.at));
      if (ids.some((id) => domainOf(id) === 'climate')) ids = ids.filter((id) => domainOf(id) !== 'sensor');
      const taken = c.entities.filter((e) => e.at).map((e) => e.at);
      for (const id of ids.sort()) {
        const at = freeSpot(room.rect, taken);
        taken.push(at);
        if (domainOf(id) === 'vacuum') { if (!c.vacuum?.entity) c.vacuum = { entity: id, dock: at }; continue; }
        const j = c.entities.findIndex((x) => x.entity === id);
        if (j >= 0) c.entities[j].at = at;
        else c.entities.push({ entity: id, at, ...(domainOf(id) === 'light' ? { icon: guessLampIcon(id, h.states[id]) } : {}) });
        placed++;
      }
    });
    this._toast(placed ? t('ed_assignedPlaced', room.name, placed) : t('ed_assigned', room.name));
  }
  /* rooms whose name matches an area's name get that area */
  _matchAreasByName() {
    const pairs = this._nameMatches();
    if (!pairs.length) return;
    const keep = this._withDevices;
    pairs.forEach(([i, a]) => this._assignArea(i, a));
    this._withDevices = keep;
    this._toast(t('ed_matched', pairs.length));
  }
  /* exact names first, then the same word stem without "room / zimmer / raum" ("Wohnen" ↔ "Wohnzimmer", "Bath" ↔ "Bathroom",
   * "Bad" ↔ "Badezimmer") – only when exactly one area fits */
  _nameMatches() {
    const used = new Set(this._c.rooms.map((r) => r.area).filter(Boolean));
    const free = () => this._areas().filter((x) => !used.has(x.area_id));
    const stem = (s) => {
      let x = normName(s).replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
      for (let k = 0; k < 2; k++) x = x.replace(/(zimmer|raum|room|bereich|area)$/, '');
      return x.replace(/(en|e|s)$/, '');
    };
    const out = [];
    const open = this._c.rooms.map((r, i) => (r.area ? null : i)).filter((i) => i != null);
    for (const pass of [0, 1]) for (const i of open) {
      if (out.some(([j]) => j === i)) continue;
      const n = normName(this._c.rooms[i].name);
      if (!n) continue;
      const st = stem(this._c.rooms[i].name);
      const hits = free().filter((x) => (pass === 0 ? normName(x.name) === n : st.length >= 3 && stem(x.name) === st));
      if (hits.length === 1) { out.push([i, hits[0].area_id]); used.add(hits[0].area_id); }
    }
    return out;
  }

  /* ---------------------------------------------------------------- devices */
  _layerDefs() {
    const list = this._c.layers?.length ? this._c.layers : (this._model()?.layers || []).map((L) => L.id);
    const out = list.map((l, i) => {
      if (typeof l === 'string') return LAYER_TYPES[l] ? { id: l, type: l, name: t(`layer_${l}`), icon: LAYER_TYPES[l].icon, kinds: LAYER_TYPES[l].kinds, ents: [] } : null;
      if (l && LAYER_TYPES[l.type] && !l.show && !l.entities) return { id: l.type, type: l.type, name: l.name || t(`layer_${l.type}`), icon: l.icon || LAYER_TYPES[l.type].icon, kinds: LAYER_TYPES[l.type].kinds, ents: [] };
      return l ? { id: String(l.id || `layer_${slug(l.name) || i + 1}`), type: 'custom', name: l.name || t('layer'), icon: l.icon || 'layers', kinds: [].concat(l.show || []), ents: [].concat(l.entities || []), raw: l } : null;
    }).filter(Boolean);
    // built-in layers are always offered for placing devices
    for (const type of ['light', 'climate', 'cover', 'vacuum']) if (!out.some((L) => L.id === type)) out.push({ id: type, type, name: t(`layer_${type}`), icon: LAYER_TYPES[type].icon, kinds: LAYER_TYPES[type].kinds, ents: [], hidden: true });
    return out;
  }
  _layerDef(id) { return this._layerDefs().find((L) => L.id === id); }
  _inLayerDef(L, eid, kind) { return L.kinds.includes(kind) || L.ents.includes(eid); }
  _layersFor(eid, kind) { return this._layerDefs().filter((L) => this._inLayerDef(L, eid, kind)).map((L) => L.id); }

  _areaOf(eid) {
    const h = this._hs() || {}, e = h.entities?.[eid];
    return e?.area_id || h.devices?.[e?.device_id]?.area_id || null;
  }

  /* where a new device goes: its HA area's room (free spot), else the visible centre */
  _spotFor(eid) {
    const c = this._c, area = this._areaOf(eid);
    let room = c.rooms.find((r) => r.area && r.area === area);
    if (!room && this._s?.t === 'room') room = c.rooms[this._s.i];
    const R = room?.rect;
    if (!R) {
      const r = this._cv.getBoundingClientRect();
      return [r0(this._v.x + r.width / 2 / this._v.z), r0(this._v.y + r.height / 2 / this._v.z)];
    }
    return freeSpot(R, c.entities.filter((x) => x.at).map((x) => x.at));
  }

  _placeEntity(eid, at) {
    const c = this._c;
    const L = this._layerDef(this._layerSel);
    const st = this._hs()?.states?.[eid], kind = kindOf(eid, st);
    if (domainOf(eid) === 'vacuum') { this._change(() => { c.vacuum = { ...(c.vacuum || {}), entity: eid, dock: at || c.vacuum?.dock || this._spotFor(eid) }; this._s = { t: 'dock' }; }); return; }
    const i = c.entities.findIndex((x) => x.entity === eid);
    this._change(() => {
      const pos = at || this._spotFor(eid);
      if (i >= 0) { c.entities[i].at = pos; this._s = { t: 'ent', i }; }
      else {
        const e = { entity: eid, at: pos };
        if (kind === 'light') e.icon = guessLampIcon(eid, st);
        c.entities.push(e);
        this._s = { t: 'ent', i: c.entities.length - 1 };
      }
      // devices added in an own layer belong to it
      if (L?.type === 'custom' && !L.kinds.includes(kind)) this._addToLayer(L.id, eid);
      this._ensureLayer(L);
    });
  }
  /* built-in layers appear as soon as something is placed for them */
  _ensureLayer(L) {
    if (!L || L.type === 'custom' || !this._c.layers?.length) return;
    if (!this._c.layers.some((l) => (typeof l === 'string' ? l : l.type) === L.type && !l.show)) this._c.layers.push(L.type);
  }
  _addToLayer(id, eid) {
    const l = (this._c.layers || []).find((x) => typeof x === 'object' && String(x.id || `layer_${slug(x.name)}`) === id);
    if (l && !(l.entities || []).includes(eid)) l.entities = [...(l.entities || []), eid];
  }
  _autoPlace(eids) {
    if (!eids.length) return;
    this._change(() => {
      for (const eid of eids) {
        const st = this._hs()?.states?.[eid], kind = kindOf(eid, st);
        if (this._c.entities.some((x) => x.entity === eid && x.at)) continue;
        const e = { entity: eid, at: this._spotFor(eid) };
        if (kind === 'light') e.icon = guessLampIcon(eid, st);
        const i = this._c.entities.findIndex((x) => x.entity === eid);
        if (i >= 0) this._c.entities[i].at = e.at; else this._c.entities.push(e);
        const L = this._layerDef(this._layerSel);
        if (L?.type === 'custom' && !L.kinds.includes(kind)) this._addToLayer(L.id, eid);
      }
    });
    this._toast(t('ed_placed', eids.length));
  }

  /* drag from a list (devices, furniture palette) onto the plan */
  _dragFrom(el, onDrop, ghostIcon, square, extra = {}) {
    let st = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || e.target.closest('.eadd')) return;
      st = { x: e.clientX, y: e.clientY, id: e.pointerId, ghost: null };
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      if (!st.ghost && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 6) {
        st.ghost = mk('div', `edrag-ghost${square ? ' sq' : ''}${extra.label ? ' pill' : ''}`, `${icon(ghostIcon)}${extra.label ? `<span>${esc(extra.label)}</span>` : ''}`);
        this.$('.ew').append(st.ghost);
      }
      if (st.ghost) {
        st.ghost.style.left = `${e.clientX}px`; st.ghost.style.top = `${e.clientY}px`;
        if (extra.hover) { const r = this._cv.getBoundingClientRect(), inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; extra.hover(inside ? this._pt(e) : null); }
      }
    });
    const end = (e, cancel) => {
      if (!st || e.pointerId !== st.id) return;
      const g = st.ghost;
      st = null;
      if (!g) return;
      g.remove();
      extra.hover?.(null);
      const r = this._cv.getBoundingClientRect();
      if (!cancel && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) onDrop(this._pt(e).map(r0));
    };
    el.addEventListener('pointerup', (e) => end(e));
    el.addEventListener('pointercancel', (e) => end(e, true));
  }

  /* ---------------------------------------------------------------- underlay (photo / sketch of the floor plan) */
  _ulKey() { return `${CARD_TAG}:underlay:${this._c.id || 'default'}`; }
  _loadUnderlay() {
    if (!this._c.underlay?.rect) { this._ulSrc = null; return; }
    let src = this._c.underlay?.image || null;
    if (!src) try { src = localStorage.getItem(this._ulKey()); } catch (e) { /* private mode */ }
    this._ulSrc = src || null;
  }
  _setUnderlay(src) {
    this._ulSrc = src;
    try { if (src && src.startsWith('data:')) localStorage.setItem(this._ulKey(), src); else localStorage.removeItem(this._ulKey()); } catch (e) { this._toast(t('ed_ulNotStored')); }
  }
  _readImage(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        // shrink big photos so they fit into the browser storage
        const k = Math.min(1, 1800 / Math.max(img.width, img.height));
        const cvs = document.createElement('canvas');
        cvs.width = Math.round(img.width * k); cvs.height = Math.round(img.height * k);
        cvs.getContext('2d').drawImage(img, 0, 0, cvs.width, cvs.height);
        const url = cvs.toDataURL('image/jpeg', 0.82);
        // bright paper would glare in the dark editor: invert it (lines light on dark)
        const sm = document.createElement('canvas'); sm.width = 32; sm.height = 32;
        const sc = sm.getContext('2d', { willReadFrequently: true }); sc.drawImage(cvs, 0, 0, 32, 32);
        const dd = sc.getImageData(0, 0, 32, 32).data; let L = 0;
        for (let i = 0; i < dd.length; i += 4) L += 0.2126 * dd[i] + 0.7152 * dd[i + 1] + 0.0722 * dd[i + 2];
        const bright = L / 1024 > 150;
        const B = this._c.rooms.length ? bboxOf(this._c.rooms.map((r) => r.rect)) : null;
        const w = B ? B[2] - B[0] : 1200, h = (w * img.height) / img.width;
        this._change(() => { this._c.underlay = { rect: [B ? B[0] : 0, B ? B[1] : 0, (B ? B[0] : 0) + w, (B ? B[1] : 0) + h].map(r0), opacity: bright ? 0.5 : 0.6, ...(bright ? { invert: true } : {}) }; });
        this._setUnderlay(url);
        this._fit();
        this._draw();
        this._panel();
        this._toast(t('ed_ulLoaded'));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  _measureClick(p) {
    const m = this._measure;
    if (!m) return;
    if (!m.a) m.a = p;
    else if (!m.b) { m.b = p; this._panel(); }
    this._draw();
  }
  _applyMeasure(lenCm) {
    const m = this._measure, u = this._c.underlay;
    if (!m?.a || !m.b || !u?.rect || !(lenCm > 0)) return;
    const d = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]);
    if (d < 1) return;
    const k = lenCm / d, [ax, ay] = m.a;
    this._change(() => { u.rect = u.rect.map((v, i) => r0((i % 2 ? ay : ax) + (v - (i % 2 ? ay : ax)) * k)); });
    this._measure = null;
    this._fit();
    this._draw();
    this._panel();
    this._toast(t('ed_measured'));
  }

  /* ---------------------------------------------------------------- live preview with the real card */
  _preview(on) {
    const P = this.$('.eprev');
    P.classList.toggle('on', on);
    this.$('.prev').classList.toggle('blue', on);
    if (!on) { P.querySelector('.frame').innerHTML = ''; return; }
    const mode = this._prevMode || 'laptop';
    P.querySelector('.pbar').innerHTML = `<div class="eseg">${['laptop', 'phone'].map((m) => `<button data-m="${m}" class="${m === mode ? 'act' : ''}">${esc(t(`ed_prev_${m}`))}</button>`).join('')}</div>`;
    P.querySelectorAll('.pbar button').forEach((b) => b.addEventListener('click', () => { this._prevMode = b.dataset.m; this._preview(true); }));
    const fr = P.querySelector('.frame');
    fr.className = `frame${mode === 'phone' ? ' phone' : ''}`;
    fr.innerHTML = mode === 'phone' ? '<div class="phonebox"></div>' : '';
    const card = document.createElement(CARD_TAG);
    card.setConfig({ ...cleanConfig(this._c), layout: mode === 'phone' ? 'mobile' : 'desktop' });
    (mode === 'phone' ? fr.querySelector('.phonebox') : fr).append(card);
    card.hass = this._hs();
    clearInterval(this._prevT);
    this._prevT = setInterval(() => { if (!card.isConnected) { clearInterval(this._prevT); return; } const h = this._hs(); if (h !== card.hass) card.hass = h; }, 400);
  }
}

/* ---------------------------------------------------------------- helpers shared by editor and auto setup */
function normEditorConfig(c) {
  c.rooms = (Array.isArray(c.rooms) ? c.rooms : []).filter((r) => normRect(r?.rect)).map((r, i) => ({ ...r, id: r.id || slug(r.name) || `room_${i + 1}`, rect: normRect(r.rect).map(r0), furniture: Array.isArray(r.furniture) ? r.furniture : [] }));
  c.windows = (c.windows || []).map(normSeg).filter(Boolean);
  c.doors = (c.doors || []).map(normSeg).filter(Boolean);
  if (c.entrance) c.entrance = normSeg(c.entrance);
  c.entities = (Array.isArray(c.entities) ? c.entities : []).map((e) => (typeof e === 'string' ? { entity: e } : e)).filter((e) => e?.entity);
  return c;
}

function cleanConfig(c0) {
  const c = deep(c0);
  if (!c.type) c.type = `custom:${CARD_TAG}`;
  for (const k of ['windows', 'doors', 'entities']) if (Array.isArray(c[k]) && !c[k].length) delete c[k];
  if (c.door && !c.door.open && !c.door.doorbell) delete c.door;
  if (c.vacuum && !c.vacuum.entity) delete c.vacuum;
  if (c.widgets && !Object.keys(c.widgets).length) delete c.widgets;
  if (Array.isArray(c.layers) && !c.layers.length) delete c.layers;
  for (const r of c.rooms || []) { if (!r.furniture?.length) delete r.furniture; if (!r.area) delete r.area; if (!r.label || r.label === 'top') delete r.label; if (!r.helpers?.length) delete r.helpers; }
  if (c.underlay) { c.underlay = { ...c.underlay }; if (String(c.underlay.image || '').startsWith('data:')) delete c.underlay.image; }
  // key order like in the docs
  const order = ['type', 'language', 'title', 'rooms', 'windows', 'doors', 'entrance', 'entities', 'layers', 'door', 'vacuum', 'weather', 'indoor', 'widgets', 'modes_label', 'layout', 'fit', 'mobile', 'scale', 'underlay'];
  const out = {};
  for (const k of order) if (c[k] !== undefined) out[k] = c[k];
  for (const k of Object.keys(c)) if (!(k in out)) out[k] = c[k];
  return out;
}

function shiftFurn(f, dx, dy) {
  if (Array.isArray(f)) return [r0(f[0] + dx), r0(f[1] + dy), r0(f[2] + dx), r0(f[3] + dy), ...f.slice(4)];
  return { ...f, rect: [r0(f.rect[0] + dx), r0(f.rect[1] + dy), r0(f.rect[2] + dx), r0(f.rect[3] + dy)] };
}
function setFurnRect(f, R) {
  if (!f) return;
  if (Array.isArray(f)) { f[0] = r0(R[0]); f[1] = r0(R[1]); f[2] = r0(R[2]); f[3] = r0(R[3]); } else f.rect = R.map(r0);
}
const shiftSeg = (s, dx, dy) => [r0(s[0] + dx), r0(s[1] + dy), r0(s[2] + dx), r0(s[3] + dy)];

/* a free spot in a room: grid positions away from the room name and from other markers */
function freeSpot(R, taken) {
  const [a, b, c, d] = R, w = c - a, h = d - b, m = Math.min(70, w / 4, h / 4);
  let best = null;
  for (let iy = 0; iy < 6; iy++) for (let ix = 0; ix < 6; ix++) {
    const p = [a + m + ((w - 2 * m) * (ix + 0.5)) / 6, b + m + ((h - 2 * m) * (iy + 0.5)) / 6];
    if (p[0] < a + Math.min(170, w * 0.6) && p[1] < b + Math.min(90, h * 0.35)) continue;
    const dist = Math.min(...taken.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])), 1e9);
    const score = Math.min(dist, 140) - Math.hypot(p[0] - (a + c) / 2, p[1] - (b + d) / 2) * 0.15;
    if (!best || score > best.s) best = { p, s: score };
  }
  return (best?.p || center(R)).map(r0);
}

function guessLampIcon(eid, st) {
  const n = `${eid} ${st?.attributes?.friendly_name || ''}`.toLowerCase();
  const pairs = [['chandelier|kronleuchter|luster|lüster', 'chandelier'], ['pendant|pendel|esstisch|dining', 'pendant'], ['strip|stripe|leiste|led_|lightstrip|band', 'strip'], ['spot|strahler|downlight', 'spot'],
    ['desk|schreibtisch', 'desklamp'], ['floor|steh', 'floorlamp'], ['bedside|nacht|lamp|lampe|leselampe|reading', 'lamp'], ['wall|wand|mirror|spiegel|sconce', 'wall'], ['plant|pflanz', 'sprout'], ['ceiling|decke', 'ceiling'], ['candle|kerze', 'candle']];
  for (const [re, ic] of pairs) if (new RegExp(re).test(n)) return ic;
  return 'bulb';
}

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

/* ================================================================== Example home (made up, ~85 m², centimetres) – demo + "load example" in the editor */
function exampleConfig(lang = 'en') {
  const de = lang === 'de';
  const N = (en, d) => (de ? d : en);
  return {
    type: 'custom:glass-floorplan-card',
    language: lang,
    rooms: [
      { id: 'kitchen', name: N('Kitchen', 'Küche'), area: 'kitchen', rect: [0, 0, 400, 320],
        furniture: [[10, 10, 330, 72, 'counter'], [338, 10, 396, 76, 'fridge'], [140, 180, 280, 262, 'table'], [100, 203, 136, 239, 'chair'], [284, 203, 320, 239, 'chair']] },
      { id: 'bathroom', name: N('Bath', 'Bad'), area: 'bathroom', rect: [400, 0, 580, 320],
        furniture: [[410, 140, 485, 310, 'bath'], [500, 10, 560, 56, 'sink'], [528, 248, 568, 310, 'toilet']] },
      { id: 'bedroom', name: N('Bedroom', 'Schlafzimmer'), area: 'bedroom', rect: [580, 0, 940, 420],
        furniture: [[670, 30, 850, 230, 'bed'], [626, 34, 666, 74, 'sideboard'], [854, 34, 894, 74, 'sideboard'], [600, 352, 820, 410, 'wardrobe'], [880, 352, 930, 402, 'plant']] },
      { id: 'living', name: N('Living room', 'Wohnzimmer'), area: 'living_room', rect: [0, 320, 580, 660],
        furniture: [[56, 400, 236, 560, 'rug'], [120, 328, 300, 368, 'sideboard'], [140, 336, 280, 350, 'tv'], [70, 580, 290, 652, 'sofa'], [100, 430, 180, 520, 'round_table'],
          [380, 400, 540, 490, 'table'], [350, 427, 386, 463, 'chair'], [534, 427, 570, 463, 'chair'], [400, 556, 485, 641, 'armchair']] },
      { id: 'hallway', name: N('Hallway', 'Flur'), area: 'hallway', rect: [580, 420, 1180, 560],
        helpers: ['input_number.hallway_night_brightness'], furniture: [[1000, 522, 1150, 554, 'sideboard']] },
      { id: 'office', name: N('Office', 'Büro'), area: 'office', rect: [580, 560, 860, 900],
        furniture: [[600, 580, 760, 650, 'desk'], [657, 660, 703, 706, 'chair'], [820, 600, 856, 820, 'shelf'], [600, 806, 685, 891, 'armchair']] },
      { id: 'guest', name: N('Guest room', 'Gästezimmer'), area: 'guest_room', rect: [860, 560, 1180, 900],
        furniture: [[1080, 600, 1170, 800, 'bed_single'], [880, 580, 1040, 625, 'sideboard'], [880, 826, 1000, 890, 'desk']] },
    ],
    windows: [[80, 0, 320, 0], [0, 80, 0, 240], [440, 0, 540, 0], [650, 0, 880, 0], [0, 400, 0, 600], [100, 660, 480, 660], [640, 900, 800, 900], [920, 900, 1120, 900], [1180, 620, 1180, 820]],
    doors: [[140, 320, 260, 320], [580, 120, 580, 200], [580, 460, 580, 540], [800, 420, 880, 420], [640, 560, 720, 560], [900, 560, 980, 560]],
    entrance: [1180, 450, 1180, 530],
    entities: [
      { entity: 'light.kitchen_ceiling', at: [230, 140], icon: 'ceiling', watt: 12 },
      { entity: 'light.kitchen_counter', at: [250, 42], icon: 'strip', watt: 6 },
      { entity: 'light.bathroom_mirror', at: [530, 82], icon: 'wall', watt: 8 },
      { entity: 'light.bedroom_ceiling', at: [760, 300], icon: 'ceiling', watt: 12 },
      { entity: 'light.bedroom_bedside', at: [874, 54], icon: 'lamp', watt: 5 },
      { entity: 'light.living_room_ceiling', at: [300, 470], icon: 'chandelier', watt: 24 },
      { entity: 'light.living_room_floor_lamp', at: [320, 610], icon: 'floorlamp', watt: 10 },
      { entity: 'light.living_room_tv_strip', at: [90, 370], icon: 'strip', watt: 9 },
      { entity: 'light.dining_pendant', at: [460, 445], icon: 'pendant', watt: 9 },
      { entity: 'light.hallway_spot_1', at: [660, 490], icon: 'spot', beams: 3, kelvin: 3400, watt: 7 },
      { entity: 'light.hallway_spot_2', at: [880, 490], icon: 'spot', beams: 3, kelvin: 3400, watt: 7 },
      { entity: 'light.hallway_spot_3', at: [1060, 490], icon: 'spot', beams: 3, kelvin: 3400, watt: 7 },
      { entity: 'light.office_desk', at: [740, 610], icon: 'desklamp', watt: 8 },
      { entity: 'light.office_ceiling', at: [740, 770], icon: 'ceiling', watt: 14 },
      { entity: 'light.guest_room_lamp', at: [1010, 600], icon: 'lamp', watt: 6 },
      { entity: 'media_player.living_room_tv', at: [210, 392] },
      { entity: 'climate.living_room', at: [250, 630] },
      { entity: 'climate.bedroom', at: [900, 200] },
      { entity: 'climate.office', at: [820, 860] },
      { entity: 'climate.bathroom', at: [545, 160] },
      { entity: 'sensor.kitchen_temperature', at: [360, 270] },
      { entity: 'sensor.guest_room_temperature', at: [1130, 850] },
      { entity: 'cover.kitchen', at: [140, 110] },
      { entity: 'cover.bedroom', at: [765, 60] },
      { entity: 'cover.living_room_left', at: [50, 500] },
      { entity: 'cover.living_room_right', at: [290, 620] },
      { entity: 'cover.office', at: [720, 860] },
      { entity: 'cover.guest_room', at: [1020, 860] },
      { entity: 'lock.front_door', at: [1140, 490] },
      { entity: 'binary_sensor.living_room_window', at: [50, 600] },
      { entity: 'binary_sensor.kitchen_window', at: [50, 220] },
      { entity: 'binary_sensor.hallway_motion', at: [970, 490] },
      { entity: 'fan.bedroom_fan', at: [700, 300] },
    ],
    door: { open: 'button.front_door_open', doorbell: 'event.front_door_doorbell', at: [1140, 490] },
    vacuum: { entity: 'vacuum.roborock_s8', dock: [960, 536] },
    weather: 'weather.home',
    layers: ['light', 'climate', 'cover', 'vacuum',
      { name: N('Night', 'Nacht'), icon: 'moon', show: ['light', 'cover'], entities: ['lock.front_door', 'binary_sensor.living_room_window', 'binary_sensor.kitchen_window', 'binary_sensor.hallway_motion', 'fan.bedroom_fan'] }],
  };
}

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
  const areas = [...by.keys()].sort((x, y) => String(h.areas[x].name).localeCompare(String(h.areas[y].name), lang || 'en')).slice(0, 16);
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
  ed_selected: 'Selected', ed_importBad: 'No floor plan found in this file / text', ed_imported: (n) => `${n} ${pl(n, 'room', 'rooms')} imported`, ed_importReady: 'Floor plan ready to import', ed_importSummary: (r, d, w, f) => `${r} ${pl(r, 'room', 'rooms')} · ${d} ${pl(d, 'passage', 'passages')} · ${w} ${pl(w, 'window', 'windows')} · ${f} pieces of furniture`, ed_importReplaces: 'Replaces the rooms drawn so far – placed devices stay.', ed_importApply: 'Import', ed_scaleTitle: 'Check the size', ed_scaleText: 'The size was estimated from the picture. Enter one real length and everything is adjusted.', ed_scaleOk: 'Size is right', ed_pastePlaceholder: 'Paste the answer or the file content from Claude here …', ed_importRead: 'Read', ed_importTitle: 'Import a floor plan file', ed_importSub: 'e.g. from the Claude skill – file or pasted text', ed_importFile: 'Choose file', ed_importPaste: 'Paste text', ed_export: 'Save floor plan as file', ed_roomList: 'Rooms', ed_areasHead: 'Home Assistant areas', ed_areasHelp: 'Drag an area onto its room – the name and the devices come along.', ed_withDevices: 'Place the area’s devices too', ed_assigned: (r) => `“${r}” linked`, ed_assignedPlaced: (r, n) => `“${r}” linked · ${n} ${pl(n, 'device', 'devices')} placed`, ed_areaDrag: 'Drag the area onto a room on the plan', ed_areaDropRoom: 'Drop the area onto a room', ed_areaIn: (r) => `Linked with ${r}`, ed_noAreaYet: 'no area yet', ed_matchByName: (n) => `Link ${n} ${pl(n, 'room', 'rooms')} by name`, ed_matched: (n) => `${n} ${pl(n, 'room', 'rooms')} linked by name`, ed_detectedAreas: (n, d) => `${n} ${pl(n, 'room', 'rooms')} and ${d} ${pl(d, 'passage', 'passages')} found – now drag your areas onto them`, ed_invert: 'Invert colours', ed_detect: 'Find rooms automatically', ed_detectHelp: 'Set the scale first (Measure). Works best with clean plans – check the result and adjust the rooms.', ed_detectFail: 'The picture could not be analysed', ed_detectNone: 'No rooms found – draw them by hand', ed_detectNothingNew: 'No new rooms found', ed_detected: (n, d) => `${n} ${pl(n, 'room', 'rooms')} and ${d} ${pl(d, 'passage', 'passages')} found – now name them`, ed_title: 'Floor plan', ed_undo: 'Undo', ed_redo: 'Redo', ed_preview: 'Preview', ed_cancel: 'Cancel', ed_done: 'Done', ed_fit: 'Fit to screen',
  ed_unsaved: 'Unsaved changes – press Cancel again to discard them', ed_summary: (r, d) => `${r} ${pl(r, 'room', 'rooms')} · ${d} ${pl(d, 'device', 'devices')}`,
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
  ed_example: 'Load example flat', ed_exampleLoaded: 'Example loaded', ed_clear: 'Start over', ed_claudeTip: 'Tip: the Claude skill in the repository turns a photo of your floor plan into a ready configuration.',
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
  ed_layerDesc_light: 'Lights, media, front door', ed_layerDesc_climate: 'Thermostats, temperatures', ed_layerDesc_cover: 'Shutters, blinds', ed_layerDesc_vacuum: 'Roborock vacuum',
  ed_layerEmpty: 'Nothing chosen yet', ed_layerShows: 'Shows all', ed_layerShowsHelp: 'Pick whole categories – plus any single devices below.',
  ed_layerDevices: (n) => `More devices (${n})`, ed_addDevices: 'Add devices', ed_kind_media: 'Media',
  ed_tiles_lead: 'Weather, inside climate, front door and the layer card arrange themselves in free corners of your plan. Drag them to put them elsewhere.',
  ed_autoArrange: 'Arrange automatically', ed_tileManual: 'Placed by you.', ed_tileAuto: 'Placed automatically – drag it to change.',
  ed_language: 'Language', ed_weather: 'Weather', ed_layout: 'Layout', ed_layout_help: 'Automatic: phone layout below 700 px card width.', ed_rotate_phone: 'Turn the plan on phones',
  ed_height: 'Height', ed_fit_screen: 'Fill the screen', ed_fit_width: 'By width', ed_modesLabel: 'Label for modes', ed_modes_help: 'Scenes and scripts with this label appear under “Modes”.',
  ed_ha_open: 'Open floor plan editor', ed_ha_lead: 'Draw rooms, furniture, windows and doors, then drag your devices onto the plan – everything is saved in this card.',
  ed_ha_empty: 'No floor plan yet. Open the editor and draw your home – a photo of your floor plan helps.',
  furn_sofa: 'Sofa', furn_armchair: 'Armchair', furn_bed: 'Bed', furn_bed_single: 'Single bed', furn_table: 'Table', furn_round_table: 'Round table', furn_chair: 'Chair', furn_desk: 'Desk',
  furn_wardrobe: 'Wardrobe', furn_shelf: 'Shelf', furn_sideboard: 'Sideboard', furn_tv: 'TV', furn_counter: 'Kitchen', furn_fridge: 'Fridge', furn_bath: 'Bathtub', furn_shower: 'Shower',
  furn_toilet: 'Toilet', furn_sink: 'Sink', furn_washer: 'Washer', furn_plant: 'Plant', furn_rug: 'Rug', furn_stairs: 'Stairs', furn_block: 'Block',
});
Object.assign(STR.de, {
  ed_selected: 'Ausgewählt', ed_importBad: 'In dieser Datei / diesem Text wurde kein Grundriss gefunden', ed_imported: (n) => `${n} ${pl(n, 'Raum', 'Räume')} importiert`, ed_importReady: 'Grundriss bereit zum Import', ed_importSummary: (r, d, w, f) => `${r} ${pl(r, 'Raum', 'Räume')} · ${d} ${pl(d, 'Durchgang', 'Durchgänge')} · ${w} Fenster · ${f} Möbel`, ed_importReplaces: 'Ersetzt die bisher gezeichneten Räume – platzierte Geräte bleiben.', ed_importApply: 'Importieren', ed_scaleTitle: 'Größe prüfen', ed_scaleText: 'Die Größe wurde aus dem Bild geschätzt. Gib eine echte Länge ein, dann wird alles angepasst.', ed_scaleOk: 'Größe stimmt', ed_pastePlaceholder: 'Antwort oder Dateiinhalt von Claude hier einfügen …', ed_importRead: 'Einlesen', ed_importTitle: 'Grundriss-Datei importieren', ed_importSub: 'z. B. vom Claude-Skill – Datei oder eingefügter Text', ed_importFile: 'Datei wählen', ed_importPaste: 'Text einfügen', ed_export: 'Grundriss als Datei sichern', ed_roomList: 'Räume', ed_areasHead: 'Home-Assistant-Bereiche', ed_areasHelp: 'Ziehe einen Bereich auf seinen Raum – Name und Geräte kommen mit.', ed_withDevices: 'Geräte des Bereichs gleich platzieren', ed_assigned: (r) => `„${r}“ verknüpft`, ed_assignedPlaced: (r, n) => `„${r}“ verknüpft · ${n} ${pl(n, 'Gerät', 'Geräte')} platziert`, ed_areaDrag: 'Ziehe den Bereich auf einen Raum im Plan', ed_areaDropRoom: 'Den Bereich auf einen Raum ziehen', ed_areaIn: (r) => `Verknüpft mit ${r}`, ed_noAreaYet: 'noch kein Bereich', ed_matchByName: (n) => `${n} ${pl(n, 'Raum', 'Räume')} nach Namen verknüpfen`, ed_matched: (n) => `${n} ${pl(n, 'Raum', 'Räume')} nach Namen verknüpft`, ed_detectedAreas: (n, d) => `${n} ${pl(n, 'Raum', 'Räume')} und ${d} ${pl(d, 'Durchgang', 'Durchgänge')} erkannt – jetzt deine Bereiche auf die Räume ziehen`, ed_invert: 'Farben umkehren', ed_detect: 'Räume automatisch erkennen', ed_detectHelp: 'Vorher den Maßstab setzen (Ausmessen). Klappt am besten mit sauberen Plänen – Ergebnis prüfen und Räume anpassen.', ed_detectFail: 'Das Bild konnte nicht ausgewertet werden', ed_detectNone: 'Keine Räume gefunden – bitte von Hand zeichnen', ed_detectNothingNew: 'Keine neuen Räume gefunden', ed_detected: (n, d) => `${n} ${pl(n, 'Raum', 'Räume')} und ${d} ${pl(d, 'Durchgang', 'Durchgänge')} erkannt – jetzt benennen`, ed_title: 'Grundriss', ed_undo: 'Rückgängig', ed_redo: 'Wiederholen', ed_preview: 'Vorschau', ed_cancel: 'Abbrechen', ed_done: 'Fertig', ed_fit: 'Einpassen',
  ed_unsaved: 'Nicht gespeichert – nochmal „Abbrechen“ verwirft die Änderungen', ed_summary: (r, d) => `${r} ${pl(r, 'Raum', 'Räume')} · ${d} ${pl(d, 'Gerät', 'Geräte')}`,
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
  ed_example: 'Beispielwohnung laden', ed_exampleLoaded: 'Beispiel geladen', ed_clear: 'Neu beginnen', ed_claudeTip: 'Tipp: Der Claude-Skill im Repository macht aus einem Foto deines Grundrisses eine fertige Konfiguration.',
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
  ed_layerDesc_light: 'Lichter, Medien, Haustür', ed_layerDesc_climate: 'Thermostate, Temperaturen', ed_layerDesc_cover: 'Rollläden, Jalousien', ed_layerDesc_vacuum: 'Roborock-Saugroboter',
  ed_layerEmpty: 'Noch nichts gewählt', ed_layerShows: 'Zeigt alle', ed_layerShowsHelp: 'Ganze Kategorien wählen – plus einzelne Geräte darunter.',
  ed_layerDevices: (n) => `Weitere Geräte (${n})`, ed_addDevices: 'Geräte hinzufügen', ed_kind_media: 'Medien',
  ed_tiles_lead: 'Wetter, Innenklima, Haustür und die Ebenen-Karte ordnen sich in freien Ecken deines Plans an. Zum Umsetzen einfach ziehen.',
  ed_autoArrange: 'Automatisch anordnen', ed_tileManual: 'Von dir platziert.', ed_tileAuto: 'Automatisch platziert – zum Ändern ziehen.',
  ed_language: 'Sprache', ed_weather: 'Wetter', ed_layout: 'Darstellung', ed_layout_help: 'Automatisch: Handy-Ansicht unter 700 px Kartenbreite.', ed_rotate_phone: 'Plan am Handy drehen',
  ed_height: 'Höhe', ed_fit_screen: 'Bildschirm füllen', ed_fit_width: 'Nach Breite', ed_modesLabel: 'Label für Modi', ed_modes_help: 'Szenen und Skripte mit diesem Label erscheinen unter „Modi“.',
  ed_ha_open: 'Grundriss-Editor öffnen', ed_ha_lead: 'Räume, Möbel, Fenster und Türen zeichnen, dann deine Geräte auf den Plan ziehen – alles wird in dieser Karte gespeichert.',
  ed_ha_empty: 'Noch kein Grundriss. Öffne den Editor und zeichne deine Wohnung – ein Foto deines Grundrisses hilft.',
  furn_sofa: 'Sofa', furn_armchair: 'Sessel', furn_bed: 'Bett', furn_bed_single: 'Einzelbett', furn_table: 'Tisch', furn_round_table: 'Runder Tisch', furn_chair: 'Stuhl', furn_desk: 'Schreibtisch',
  furn_wardrobe: 'Schrank', furn_shelf: 'Regal', furn_sideboard: 'Kommode', furn_tv: 'Fernseher', furn_counter: 'Küche', furn_fridge: 'Kühlschrank', furn_bath: 'Badewanne', furn_shower: 'Dusche',
  furn_toilet: 'WC', furn_sink: 'Waschbecken', furn_washer: 'Waschmaschine', furn_plant: 'Pflanze', furn_rug: 'Teppich', furn_stairs: 'Treppe', furn_block: 'Block',
});

/* ================================================================== Floor plan editor: find rooms in the template picture
 * Works best with clean plans (screenshots, architect plans, neat sketches): dark pixels are walls, letters are
 * ignored (small blobs), door gaps are closed by growing the walls, then every enclosed area becomes a room.
 * Rooms are snapped edge to edge; gaps in the shared walls become passages. */
function detectRooms(img, rectCm, opts = {}) {
  const maxW = 640, k = Math.min(1, maxW / img.width);
  const W = Math.max(40, Math.round(img.width * k)), H = Math.max(40, Math.round(img.height * k));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;
  const N = W * H, lum = new Float32Array(N);
  const hist = new Uint32Array(256);
  for (let i = 0; i < N; i++) { const v = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]; lum[i] = v; hist[v | 0]++; }
  // Otsu threshold; dark plans on light paper are the normal case, light lines on dark get inverted
  let sum = 0, sumB = 0, wB = 0, best = 0, thr = 128;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = N - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; thr = i; }
  }
  let dark = 0;
  for (let i = 0; i < N; i++) if (lum[i] < thr) dark++;
  const invert = dark > N * 0.5;
  const wall = new Uint8Array(N);
  for (let i = 0; i < N; i++) wall[i] = invert ? lum[i] > thr : lum[i] < thr;

  // drop small blobs (letters, dimension text, furniture symbols)
  const lab = new Int32Array(N).fill(-1), stack = new Int32Array(N);
  const keep = new Uint8Array(N);
  const minSpan = Math.max(W, H) * 0.12;
  for (let s0 = 0; s0 < N; s0++) {
    if (!wall[s0] || lab[s0] >= 0) continue;
    let sp = 0, x1 = W, y1 = H, x2 = 0, y2 = 0;
    const members = [];
    stack[sp++] = s0; lab[s0] = s0;
    while (sp) {
      const i = stack[--sp], x = i % W, y = (i / W) | 0;
      members.push(i);
      if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= N || lab[j] >= 0 || !wall[j]) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue;
        lab[j] = s0; stack[sp++] = j;
      }
    }
    if (Math.max(x2 - x1, y2 - y1) >= minSpan) for (const i of members) keep[i] = 1;
  }
  // close door openings: grow the walls by about half a door width
  const cmPerPx = (rectCm[2] - rectCm[0]) / W;
  const r = clamp(Math.round((opts.door || 48) / cmPerPx), 2, 40);
  const grown = dilate(keep, W, H, r);
  // everything reachable from the border is outside
  const outside = new Uint8Array(N);
  let sp = 0;
  const push = (i) => { if (!grown[i] && !outside[i]) { outside[i] = 1; stack[sp++] = i; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (sp) {
    const i = stack[--sp], x = i % W;
    if (x > 0) push(i - 1); if (x < W - 1) push(i + 1); if (i >= W) push(i - W); if (i < N - W) push(i + W);
  }
  // enclosed areas = rooms
  const seen = new Uint8Array(N), rooms = [];
  const minArea = (1.2e4 / (cmPerPx * cmPerPx)) * 0.4;
  for (let s0 = 0; s0 < N; s0++) {
    if (grown[s0] || outside[s0] || seen[s0]) continue;
    let n = 0, x1 = W, y1 = H, x2 = 0, y2 = 0;
    sp = 0; stack[sp++] = s0; seen[s0] = 1;
    while (sp) {
      const i = stack[--sp], x = i % W, y = (i / W) | 0;
      n++;
      if (x < x1) x1 = x; if (x > x2) x2 = x; if (y < y1) y1 = y; if (y > y2) y2 = y;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= N || seen[j] || grown[j] || outside[j]) continue;
        seen[j] = 1; stack[sp++] = j;
      }
    }
    const area = (x2 - x1 + 1) * (y2 - y1 + 1);
    if (n < minArea || n / area < 0.45 || area > N * 0.85) continue;
    // undo the growing (rooms shrank by r on every side)
    rooms.push([x1 - r, y1 - r, x2 + 1 + r, y2 + 1 + r]);
  }
  // to centimetres, edges on a 5 cm grid
  const toCm = (b) => [rectCm[0] + b[0] * cmPerPx, rectCm[1] + b[1] * cmPerPx, rectCm[0] + b[2] * cmPerPx, rectCm[1] + b[3] * cmPerPx];
  const R = rooms.map(toCm);
  // neighbours share one wall line (middle of the wall)
  const tol = Math.max(30, (r + 4) * cmPerPx * 0.9);
  for (let a = 0; a < R.length; a++) for (let b = 0; b < R.length; b++) {
    if (a === b) continue;
    const A = R[a], B = R[b];
    const oy = Math.min(A[3], B[3]) - Math.max(A[1], B[1]), ox = Math.min(A[2], B[2]) - Math.max(A[0], B[0]);
    if (oy > 40 && B[0] >= A[2] - tol && B[0] - A[2] < tol) { const m = (A[2] + B[0]) / 2; A[2] = m; B[0] = m; }
    if (ox > 40 && B[1] >= A[3] - tol && B[1] - A[3] < tol) { const m = (A[3] + B[1]) / 2; A[3] = m; B[1] = m; }
  }
  // align nearly equal edges (outer walls, rows of rooms)
  const xs = [], ys = [];
  for (const q of R) { xs.push(q[0], q[2]); ys.push(q[1], q[3]); }
  const align = (v, list) => { const near = list.filter((u) => Math.abs(u - v) < tol * 0.8); return near.reduce((s2, u) => s2 + u, 0) / near.length; };
  const out = R.map((q) => [align(q[0], xs), align(q[1], ys), align(q[2], xs), align(q[3], ys)].map((v) => Math.round(v / 5) * 5))
    .filter((q) => q[2] - q[0] >= 60 && q[3] - q[1] >= 60);
  // passages: a gap in the (un-grown) wall between two neighbours
  const doors = [];
  for (let a = 0; a < out.length; a++) for (let b = a + 1; b < out.length; b++) {
    const A = out[a], B = out[b];
    let seg = null;
    if (A[2] === B[0] || B[2] === A[0]) { const x = A[2] === B[0] ? A[2] : A[0]; seg = [x, Math.max(A[1], B[1]), x, Math.min(A[3], B[3])]; }
    else if (A[3] === B[1] || B[3] === A[1]) { const y = A[3] === B[1] ? A[3] : A[1]; seg = [Math.max(A[0], B[0]), y, Math.min(A[2], B[2]), y]; }
    if (!seg) continue;
    const h = seg[1] === seg[3], len = h ? seg[2] - seg[0] : seg[3] - seg[1];
    if (len < 60) continue;
    let run = 0, startV = 0, bestRun = null;
    for (let v = 0; v <= len; v += 5) {
      const cx = h ? seg[0] + v : seg[0], cy = h ? seg[1] : seg[1] + v;
      // only the wall line itself: probe with the un-grown mask, ±1 px around the line
      const x = Math.round((cx - rectCm[0]) / cmPerPx), y = Math.round((cy - rectCm[1]) / cmPerPx);
      let wl = false;
      for (let d = -Math.max(2, r); d <= Math.max(2, r); d++) { const xx = h ? x : x + d, yy = h ? y + d : y; if (xx >= 0 && yy >= 0 && xx < W && yy < H && keep[yy * W + xx]) { wl = true; break; } }
      if (!wl) { if (!run) startV = v; run += 5; if (!bestRun || run > bestRun[1]) bestRun = [startV, run]; } else run = 0;
    }
    if (bestRun && bestRun[1] >= 55 && bestRun[1] < len * 0.9) {
      const [s1, l] = bestRun;
      doors.push(h ? [seg[0] + s1, seg[1], seg[0] + s1 + l, seg[1]] : [seg[0], seg[1] + s1, seg[0], seg[1] + s1 + l]);
    }
  }
  return { rooms: out, doors, invert };
}

function dilate(m, W, H, r) {
  // separable square dilation (fast, good enough for walls)
  const tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    let last = -1e9;
    for (let x = 0; x < W; x++) { if (m[y * W + x]) last = x; if (x - last <= r) tmp[y * W + x] = 1; }
    last = 1e9;
    for (let x = W - 1; x >= 0; x--) { if (m[y * W + x]) last = x; if (last - x <= r) tmp[y * W + x] = 1; }
  }
  for (let x = 0; x < W; x++) {
    let last = -1e9;
    for (let y = 0; y < H; y++) { if (tmp[y * W + x]) last = y; if (y - last <= r) out[y * W + x] = 1; }
    last = 1e9;
    for (let y = H - 1; y >= 0; y--) { if (tmp[y * W + x]) last = y; if (last - y <= r) out[y * W + x] = 1; }
  }
  return out;
}

Object.assign(GfcEditor.prototype, {
  _detect() {
    const u = this._c.underlay;
    if (!this._ulSrc || !u?.rect) return;
    const img = new Image();
    img.onload = () => {
      let res;
      try { res = detectRooms(img, u.rect); } catch (e) { this._toast(t('ed_detectFail')); return; }
      // keep rooms that are already drawn, add only new areas
      const fresh = res.rooms.filter((q) => !this._c.rooms.some((r) => {
        const o = r.rect, ix = Math.min(o[2], q[2]) - Math.max(o[0], q[0]), iy = Math.min(o[3], q[3]) - Math.max(o[1], q[1]);
        return ix > 0 && iy > 0 && ix * iy > 0.3 * rectArea(q);
      }));
      if (!fresh.length) { this._toast(t(res.rooms.length ? 'ed_detectNothingNew' : 'ed_detectNone')); return; }
      fresh.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      this._change(() => {
        const n0 = this._c.rooms.length;
        fresh.forEach((q, i) => this._c.rooms.push({ id: this._uniqueRoomId(`room_${n0 + i + 1}`), name: `${t('ed_room')} ${n0 + i + 1}`, rect: q, furniture: [] }));
        for (const d of res.doors) if (!this._c.doors.some((x) => segDist(x, center([d[0], d[1], d[2], d[3]])) < 30)) this._c.doors.push(d.map(r0));
        if (u.invert == null && !res.invert) u.invert = true;
        this._tool = 'rooms';
        this._s = null;
      });
      this._toast(t(Object.keys(this._hs()?.areas || {}).length ? 'ed_detectedAreas' : 'ed_detected', fresh.length, res.doors.length));
    };
    img.src = this._ulSrc;
  },
});

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

/* ================================================================== Registration */
if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, GlassFloorplanCard);
if (!customElements.get(`${CARD_TAG}-editor`)) customElements.define(`${CARD_TAG}-editor`, GfcCardEditor);
if (!customElements.get('glass-floorplan-editor')) customElements.define('glass-floorplan-editor', GfcEditor);
/* for the demo page and the setup assistant */
window.GFC_EXAMPLE = exampleConfig;
window.GFC_TOYAML = toYaml;
window.GFC_AUTOCONFIG = autoConfig;
window.GFC_OPEN_EDITOR = (opts) => { const ed = document.createElement('glass-floorplan-editor'); ed.open(opts); return ed; };
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === CARD_TAG)) {
  window.customCards.push({
    type: CARD_TAG, name: 'Glass Floorplan Card', preview: false, documentationURL: 'https://github.com/michael-schroeter/glass-floorplan-card',
    description: 'Your home as a glass floor plan: lamps glow in their real colour, rooms open as pop-ups – with layers for light, climate, covers and a Roborock vacuum.',
  });
}
console.info(`%c GLASS FLOORPLAN %c ${VERSION} `, 'background:#f6c859;color:#1c1400;border-radius:6px 0 0 6px;padding:2px 8px;font-weight:700', 'background:#111827;color:#fff;border-radius:0 6px 6px 0;padding:2px 8px');

})();
