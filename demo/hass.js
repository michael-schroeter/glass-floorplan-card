/* Simulated Home Assistant for the demo: states, entity/area registry, services that change the simulated states.
 * Nothing leaves the browser. window.GFC_HASS(scene, lang, onChange) → { hass(), S, calls } */
window.GFC_HASS = (SCENE = 'evening', LANG = 'en', onChange = () => {}) => {
  const de = LANG === 'de';
  const N = (en, d) => (de ? d : en);
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const S = {};
  const ENT = {};
  const AREAS = {};
  const set = (id, state, attributes = {}) => { S[id] = { entity_id: id, state: String(state), attributes, last_changed: iso(now - 3600e3), last_updated: iso(now) }; };
  const reg = (id, extra = {}) => { ENT[id] = { entity_id: id, labels: [], ...ENT[id], ...extra }; };
  const ev = SCENE === 'evening' || SCENE === 'playing';
  const day = SCENE === 'day';
  const cold = SCENE === 'cold';

  for (const [id, en, d] of [['kitchen', 'Kitchen', 'Küche'], ['bathroom', 'Bath', 'Bad'], ['bedroom', 'Bedroom', 'Schlafzimmer'], ['living_room', 'Living room', 'Wohnzimmer'],
    ['hallway', 'Hall', 'Flur'], ['office', 'Office', 'Büro'], ['guest_room', 'Guest room', 'Gästezimmer']]) AREAS[id] = { area_id: id, name: N(en, d) };

  // lights
  const light = (id, name, modes, on, extra = {}, area) => {
    set(id, on ? 'on' : 'off', { friendly_name: name, supported_color_modes: modes, color_mode: on ? (extra.color_mode || modes[0]) : null, ...(on ? extra : {}), min_color_temp_kelvin: 2202, max_color_temp_kelvin: 6535, supported_features: 40 });
    reg(id, { device_id: `dev_${id}`, area_id: area, platform: 'hue' });
  };
  light('light.bedroom_ceiling', N('Ceiling', 'Deckenlicht'), ['color_temp'], false, {}, 'bedroom');
  light('light.bedroom_bedside', N('Bedside lamp', 'Nachttischlampe'), ['brightness'], ev, { brightness: 90 }, 'bedroom');
  light('light.office_desk', N('Desk lamp', 'Schreibtischlampe'), ['color_temp'], ev, { brightness: 230, color_mode: 'color_temp', color_temp_kelvin: 4000 }, 'office');
  light('light.office_ceiling', N('Ceiling', 'Deckenlicht'), ['brightness'], false, {}, 'office');
  light('light.living_room_ceiling', N('Chandelier', 'Kronleuchter'), ['brightness'], ev, { brightness: 204 }, 'living_room');
  light('light.living_room_floor_lamp', N('Floor lamp', 'Stehlampe'), ['onoff'], ev, {}, 'living_room');
  light('light.living_room_tv_strip', N('TV strip', 'TV-Leiste'), ['color_temp', 'xy'], ev, { brightness: 160, color_mode: 'xy', rgb_color: [120, 90, 255] }, 'living_room');
  light('light.dining_pendant', N('Dining pendant', 'Esstisch'), ['color_temp'], ev, { brightness: 150, color_mode: 'color_temp', color_temp_kelvin: 2700 }, 'living_room');
  light('light.kitchen_ceiling', N('Ceiling', 'Deckenlicht'), ['brightness'], false, {}, 'kitchen');
  light('light.kitchen_counter', N('Counter strip', 'Arbeitsplatte'), ['brightness'], ev, { brightness: 140 }, 'kitchen');
  light('light.hallway_spot_1', 'Spot 1', ['brightness'], ev, { brightness: 191 }, 'hallway');
  light('light.hallway_spot_2', 'Spot 2', ['brightness'], false, {}, 'hallway');
  light('light.hallway_spot_3', 'Spot 3', ['brightness'], ev, { brightness: 120 }, 'hallway');
  light('light.bathroom_mirror', N('Mirror light', 'Spiegellicht'), ['color_temp'], false, {}, 'bathroom');
  light('light.guest_room_lamp', N('Reading lamp', 'Leselampe'), ['brightness'], false, {}, 'guest_room');
  set('input_number.hallway_night_brightness', 20, { friendly_name: N('Night brightness', 'Nachthelligkeit'), min: 5, max: 100, step: 5, unit_of_measurement: '%', mode: 'slider' });
  reg('input_number.hallway_night_brightness', { area_id: 'hallway' });

  // media
  const playing = SCENE === 'playing';
  set('media_player.living_room_tv', playing ? 'playing' : ev ? 'idle' : 'off', { friendly_name: 'TV', device_class: 'tv', supported_features: 250303, app_name: playing ? 'Netflix' : undefined, media_title: playing ? 'Glass Onion' : undefined, media_artist: playing ? 'Rian Johnson' : undefined, volume_level: 0.32, source: ev ? 'HDMI 1' : undefined });
  reg('media_player.living_room_tv', { device_id: 'dev_tv', area_id: 'living_room' });

  // climate
  const therm = (id, name, cur, target, mode, hum, area) => {
    set(id, mode, { friendly_name: name, current_temperature: cur, temperature: target, current_humidity: hum, hvac_modes: ['off', 'heat', 'auto'], min_temp: 7, max_temp: 30, target_temp_step: 0.5, hvac_action: mode === 'off' ? 'off' : cur < target - 0.2 ? 'heating' : 'idle', supported_features: 385 });
    reg(id, { device_id: `dev_${id}`, area_id: area, platform: 'tado' });
  };
  therm('climate.living_room', N('Living room', 'Wohnzimmer'), cold ? 18.4 : 21.6, 22, 'heat', 46, 'living_room');
  therm('climate.bedroom', N('Bedroom', 'Schlafzimmer'), cold ? 16.2 : 18.6, 18, 'heat', 52, 'bedroom');
  therm('climate.office', N('Office', 'Büro'), cold ? 17.5 : 20.4, 21, 'auto', 44, 'office');
  therm('climate.bathroom', N('Bath', 'Bad'), cold ? 19.1 : 23.2, 23, 'heat', 61, 'bathroom');
  set('sensor.kitchen_temperature', cold ? 17.8 : 21.1, { friendly_name: N('Kitchen temperature', 'Küche Temperatur'), device_class: 'temperature', unit_of_measurement: '°C' });
  set('sensor.guest_room_temperature', cold ? 15.6 : 17.4, { friendly_name: N('Guest room temperature', 'Gästezimmer Temperatur'), device_class: 'temperature', unit_of_measurement: '°C' });
  set('sensor.kitchen_humidity', 49, { friendly_name: N('Kitchen humidity', 'Küche Luftfeuchte'), device_class: 'humidity', unit_of_measurement: '%' });
  reg('sensor.kitchen_temperature', { area_id: 'kitchen', device_id: 'dev_kitchen_sensor' });
  reg('sensor.kitchen_humidity', { area_id: 'kitchen', device_id: 'dev_kitchen_sensor' });
  reg('sensor.guest_room_temperature', { area_id: 'guest_room' });

  // covers
  const cover = (id, name, pos, area) => {
    set(id, pos > 0 ? 'open' : 'closed', { friendly_name: name, current_position: pos, supported_features: 15, device_class: 'shutter' });
    reg(id, { device_id: `dev_${id}`, area_id: area, platform: 'shelly' });
  };
  const night = ev || SCENE === 'playing';
  cover('cover.bedroom', N('Bedroom', 'Schlafzimmer'), night ? 0 : 100, 'bedroom');
  cover('cover.office', N('Office', 'Büro'), night ? 30 : 100, 'office');
  cover('cover.living_room_left', N('Left', 'Links'), night ? 0 : 100, 'living_room');
  cover('cover.living_room_right', N('Right', 'Rechts'), night ? 45 : 100, 'living_room');
  cover('cover.kitchen', N('Kitchen', 'Küche'), 100, 'kitchen');
  cover('cover.guest_room', N('Guest room', 'Gästezimmer'), night ? 0 : 60, 'guest_room');

  // security + devices
  set('lock.front_door', 'locked', { friendly_name: N('Front door lock', 'Türschloss'), supported_features: 1 });
  reg('lock.front_door', { device_id: 'dev_lock', area_id: 'hallway' });
  set('binary_sensor.living_room_window', ev ? 'on' : 'off', { friendly_name: N('Living room window', 'Fenster Wohnzimmer'), device_class: 'window' });
  set('binary_sensor.kitchen_window', 'off', { friendly_name: N('Kitchen window', 'Fenster Küche'), device_class: 'window' });
  set('binary_sensor.hallway_motion', 'off', { friendly_name: N('Hallway motion', 'Bewegung Flur'), device_class: 'motion' });
  set('fan.bedroom_fan', 'off', { friendly_name: N('Ceiling fan', 'Ventilator'), percentage: 0, supported_features: 1 });
  for (const id of ['binary_sensor.living_room_window', 'binary_sensor.kitchen_window', 'binary_sensor.hallway_motion', 'fan.bedroom_fan']) reg(id, { device_id: `dev_${id}` });
  S['binary_sensor.living_room_window'].last_changed = iso(now - 25 * 60e3);
  set('switch.coffee_machine', 'off', { friendly_name: N('Coffee machine', 'Kaffeemaschine'), device_class: 'outlet' });
  reg('switch.coffee_machine', { device_id: 'dev_coffee', area_id: 'kitchen' });

  // front door
  set('button.front_door_open', iso(now - 16 * 3600e3), { friendly_name: N('Open front door', 'Haustür öffnen') });
  set('event.front_door_doorbell', iso(now - 3 * 864e5 - 5 * 3600e3), { friendly_name: N('Doorbell', 'Klingel'), event_types: ['ring'], event_type: 'ring', device_class: 'doorbell' });
  reg('button.front_door_open', { device_id: 'dev_door_station' });
  reg('event.front_door_doorbell', { device_id: 'dev_door_station' });

  // weather + sun
  set('weather.home', day ? 'partlycloudy' : cold ? 'snowy' : 'cloudy', { friendly_name: N('Home', 'Zuhause'), temperature: cold ? -2.4 : 10.7, apparent_temperature: cold ? -6 : 9.6, humidity: 81, wind_speed: 13.6, wind_speed_unit: 'km/h', wind_bearing: 74, supported_features: 3 });
  const el = day ? 28 : -24;
  const nextAt = (h, m) => { const d = new Date(now); d.setHours(h, m, 0, 0); if (d.getTime() < now) d.setDate(d.getDate() + 1); return d.toISOString(); };
  set('sun.sun', el > 0 ? 'above_horizon' : 'below_horizon', { elevation: el, azimuth: day ? 200 : 300, next_rising: nextAt(7, 34), next_setting: nextAt(18, 21) });

  // vacuum (Roborock-like)
  const cleaning = SCENE === 'cleaning';
  const V = 'roborock_s8';
  set(`vacuum.${V}`, cleaning ? 'cleaning' : 'docked', { friendly_name: 'Roborock S8', fan_speed: 'balanced', fan_speed_list: ['off', 'quiet', 'balanced', 'turbo', 'max', 'custom', 'max_plus'], supported_features: 13180 });
  const vsens = {
    status: [cleaning ? 'segment_cleaning' : 'charging'], battery: [cleaning ? 84 : 100, { unit_of_measurement: '%', device_class: 'battery' }],
    cleaning_progress: [cleaning ? 42 : 0, { unit_of_measurement: '%' }], current_room: [cleaning ? N('Living room', 'Wohnzimmer') : N('Hall', 'Flur'), { device_class: 'enum', options: Object.values(AREAS).map((a) => a.name) }],
    vacuum_error: ['none'], cleaning_area: [cleaning ? 11.5 : 9.0, { unit_of_measurement: 'm²' }], cleaning_time: [cleaning ? 9 : 13, { unit_of_measurement: 'min' }],
  };
  for (const [k, [v, a]] of Object.entries(vsens)) { set(`sensor.${V}_${k}`, v, a || {}); reg(`sensor.${V}_${k}`, { device_id: 'dev_robot', platform: 'roborock', translation_key: k }); }
  set(`binary_sensor.${V}_charging`, cleaning ? 'off' : 'on', { device_class: 'battery_charging' });
  reg(`binary_sensor.${V}_charging`, { device_id: 'dev_robot', platform: 'roborock', translation_key: 'charging' });
  set(`select.${V}_cleaning_mode`, 'vacuum', { options: ['vacuum', 'vac_and_mop', 'mop'] });
  reg(`select.${V}_cleaning_mode`, { device_id: 'dev_robot', platform: 'roborock', translation_key: 'cleaning_mode' });
  set(`select.${V}_mop_intensity`, 'medium', { options: ['off', 'low', 'medium', 'high', 'custom'] });
  reg(`select.${V}_mop_intensity`, { device_id: 'dev_robot', platform: 'roborock', translation_key: 'mop_intensity' });
  reg(`vacuum.${V}`, { device_id: 'dev_robot', platform: 'roborock', area_id: 'hallway' });

  // modes: scenes / scripts with the label "Dashboard mode"
  if (SCENE !== 'nomodes') {
    set('scene.evening', iso(now - 2 * 3600e3), { friendly_name: N('Evening', 'Abend'), icon: 'mdi:weather-sunset', entity_id: ['light.living_room_ceiling', 'light.dining_pendant'] });
    set('scene.movie', iso(now - 3 * 864e5), { friendly_name: N('Movie', 'Film'), icon: 'mdi:movie-open', entity_id: ['light.living_room_ceiling', 'light.living_room_tv_strip', 'cover.living_room_left'] });
    set('scene.reading', 'unknown', { friendly_name: N('Reading', 'Lesen'), icon: 'mdi:book-open-variant', entity_id: ['light.living_room_floor_lamp'] });
    set('script.good_night', 'off', { friendly_name: N('9 Good night', '9 Gute Nacht'), icon: 'mdi:power-sleep', last_triggered: null });
    for (const id of ['scene.evening', 'scene.movie', 'scene.reading', 'script.good_night']) reg(id, { labels: ['dashboard_mode'] });
  }

  const calls = [];
  const timers = [];
  const push = () => onChange();
  const later = (ms, fn) => timers.push(setTimeout(() => { fn(); push(); }, ms));
  const upd = (id, patch) => { const s = S[id]; if (!s) return; S[id] = { ...s, ...patch, attributes: { ...s.attributes, ...(patch.attributes || {}) }, last_updated: new Date().toISOString() }; if (patch.state && patch.state !== s.state) S[id].last_changed = new Date().toISOString(); };

  function moveCover(id, target) {
    const s = S[id];
    const from = s.attributes.current_position ?? (s.state === 'open' ? 100 : 0);
    if (from === target) return;
    upd(id, { state: target > from ? 'opening' : 'closing' });
    const steps = 8;
    for (let i = 1; i <= steps; i++) later(i * 220, () => {
      const p = Math.round(from + ((target - from) * i) / steps);
      upd(id, { state: i === steps ? (p > 0 ? 'open' : 'closed') : target > from ? 'opening' : 'closing', attributes: { current_position: p } });
    });
  }
  function climateAction(id) {
    const a = S[id].attributes;
    upd(id, { attributes: { hvac_action: S[id].state === 'off' ? 'off' : a.current_temperature < a.temperature - 0.2 ? 'heating' : 'idle' } });
  }
  function vacuumRun(rooms) {
    upd(`vacuum.${V}`, { state: 'cleaning' });
    upd(`binary_sensor.${V}_charging`, { state: 'off' });
    upd(`sensor.${V}_status`, { state: 'segment_cleaning' });
    rooms.forEach((r, i) => later(1200 + i * 9000, () => {
      upd(`sensor.${V}_current_room`, { state: AREAS[r]?.name || r });
      upd(`sensor.${V}_cleaning_progress`, { state: String(Math.round(((i + 0.5) / rooms.length) * 100)) });
    }));
    later(1200 + rooms.length * 9000, () => { if (S[`vacuum.${V}`].state === 'cleaning') { upd(`vacuum.${V}`, { state: 'returning' }); upd(`sensor.${V}_status`, { state: 'returning_home' }); } });
    later(1200 + rooms.length * 9000 + 7000, () => { if (S[`vacuum.${V}`].state === 'returning') vacuumDock(); });
  }
  function vacuumDock() {
    upd(`vacuum.${V}`, { state: 'docked' });
    upd(`sensor.${V}_status`, { state: 'charging' });
    upd(`binary_sensor.${V}_charging`, { state: 'on' });
    upd(`sensor.${V}_current_room`, { state: N('Hall', 'Flur') });
    upd(`sensor.${V}_cleaning_progress`, { state: '0' });
  }

  function callService(domain, service, data = {}) {
    console.log('[demo] callService', domain, service, JSON.stringify(data));
    calls.push([domain, service, data]);
    const ids = [].concat(data.entity_id || []);
    for (const id of ids) {
      const s = S[id];
      if (!s) continue;
      const d = id.split('.')[0];
      const svc = domain === 'homeassistant' ? service : service;
      if (d === 'light' && (domain === 'light' || domain === 'homeassistant')) {
        const on = svc === 'turn_on' || (svc === 'toggle' && s.state !== 'on');
        const a = {};
        if (on) {
          if (data.brightness_pct != null) a.brightness = Math.round(data.brightness_pct * 2.55);
          else if (s.attributes.brightness == null && !(s.attributes.supported_color_modes || []).includes('onoff')) a.brightness = 255;
          if (data.color_temp_kelvin) { a.color_temp_kelvin = data.color_temp_kelvin; a.color_mode = 'color_temp'; }
          if (data.rgb_color) { a.rgb_color = data.rgb_color; a.color_mode = 'xy'; }
          if (!s.attributes.color_mode && !a.color_mode) a.color_mode = (s.attributes.supported_color_modes || ['onoff'])[0];
        }
        upd(id, { state: on ? 'on' : 'off', attributes: a });
      } else if (['switch', 'fan', 'input_boolean'].includes(d)) {
        const on = svc === 'turn_on' || (svc === 'toggle' && s.state !== 'on');
        upd(id, { state: on ? 'on' : 'off', attributes: d === 'fan' ? { percentage: on ? 66 : 0 } : {} });
      } else if (d === 'cover') {
        if (service === 'open_cover') moveCover(id, 100);
        else if (service === 'close_cover') moveCover(id, 0);
        else if (service === 'set_cover_position') moveCover(id, data.position);
        else if (service === 'stop_cover') upd(id, { state: s.attributes.current_position > 0 ? 'open' : 'closed' });
      } else if (d === 'climate') {
        if (service === 'set_temperature' && data.temperature != null) upd(id, { attributes: { temperature: data.temperature } });
        if (service === 'set_hvac_mode') upd(id, { state: data.hvac_mode });
        if (service === 'turn_off') upd(id, { state: 'off' });
        climateAction(id);
      } else if (d === 'media_player') {
        if (service === 'media_play_pause') upd(id, { state: s.state === 'playing' ? 'paused' : 'playing' });
        if (service === 'turn_off') upd(id, { state: 'off' });
        if (service === 'turn_on') upd(id, { state: 'idle' });
        if (service === 'volume_set') upd(id, { attributes: { volume_level: data.volume_level } });
      } else if (d === 'lock') {
        if (service === 'unlock' || service === 'open') { upd(id, { state: 'unlocking' }); later(700, () => upd(id, { state: 'unlocked' })); }
        if (service === 'lock') { upd(id, { state: 'locking' }); later(700, () => upd(id, { state: 'locked' })); }
      } else if (d === 'button' && service === 'press') upd(id, { state: new Date().toISOString() });
      else if (d === 'scene' && service === 'turn_on') upd(id, { state: new Date().toISOString() });
      else if (d === 'script' && service === 'turn_on') upd(id, { attributes: { last_triggered: new Date().toISOString() } });
      else if ((d === 'input_number' || d === 'number') && service === 'set_value') upd(id, { state: String(data.value) });
      else if (d === 'select' && service === 'select_option') upd(id, { state: data.option });
      else if (d === 'vacuum') {
        if (service === 'set_fan_speed') upd(id, { attributes: { fan_speed: data.fan_speed } });
        if (service === 'clean_area') vacuumRun([].concat(data.cleaning_area_id));
        if (service === 'send_command') vacuumRun([].concat(data.params?.[0]?.segments || []).map((n) => Object.keys(AREAS)[n - 16]));
        if (service === 'pause') upd(id, { state: 'paused' });
        if (service === 'start') upd(id, { state: 'cleaning' });
        if (service === 'return_to_base') { upd(id, { state: 'returning' }); later(6000, () => vacuumDock()); }
      }
    }
    setTimeout(push, 160);
    return Promise.resolve();
  }

  const fcHourly = Array.from({ length: 30 }, (_, i) => {
    const tt = new Date(now); tt.setMinutes(0, 0, 0); tt.setHours(tt.getHours() + i + 1);
    return { datetime: tt.toISOString(), condition: ['cloudy', 'cloudy', 'rainy', 'rainy', 'cloudy', 'partlycloudy'][i % 6], temperature: (cold ? -2 : 11) - i * 0.4, precipitation_probability: [0, 10, 40, 55, 20, 0][i % 6] };
  });
  const fcDaily = [[14, 8, 'cloudy', 49], [12, 6, 'partlycloudy', 0], [11, 5, 'sunny', 0], [13, 7, 'partlycloudy', 10], [15, 9, 'rainy', 80], [12, 8, 'rainy', 65], [10, 4, 'cloudy', 20], [11, 3, 'sunny', 0]]
    .map(([hi, lo, c, pp], i) => ({ datetime: iso(now + i * 864e5), condition: c, temperature: cold ? hi - 12 : hi, templow: cold ? lo - 12 : lo, precipitation_probability: pp }));

  const hass = () => ({
    states: { ...S },
    entities: ENT,
    areas: AREAS,
    devices: {},
    services: { vacuum: { clean_area: {}, start: {}, pause: {}, return_to_base: {} }, light: {}, cover: {}, climate: {} },
    user: { is_admin: true, name: 'Demo' },
    language: LANG,
    locale: { language: LANG === 'de' ? 'de' : 'en', number_format: 'language', time_format: 'language' },
    callService,
    callWS: (msg) => {
      if (msg.type === 'config/label_registry/list') return Promise.resolve([{ label_id: 'dashboard_mode', name: 'Dashboard mode' }]);
      if (msg.type === 'call_service' && msg.domain === 'roborock') {
        const rooms = Object.fromEntries(Object.values(AREAS).map((a, i) => [String(16 + i), a.name]));
        return Promise.resolve({ response: { [`vacuum.${V}`]: { maps: [{ flag: 0, name: 'Home', rooms }] } } });
      }
      return Promise.reject(new Error('not simulated'));
    },
    connection: {
      subscribeMessage(cb, msg) {
        setTimeout(() => cb({ type: msg.forecast_type, forecast: msg.forecast_type === 'hourly' ? fcHourly : fcDaily }), 60);
        return Promise.resolve(() => {});
      },
    },
    hassUrl: (p) => p,
  });
  return { hass, S, calls, set: (id, state, attrs) => { upd(id, { state: String(state), attributes: attrs || {} }); push(); }, stop: () => timers.forEach(clearTimeout) };
};
