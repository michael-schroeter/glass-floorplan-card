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
