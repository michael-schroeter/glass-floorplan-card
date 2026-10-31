/* Simulated public transport for the demo – no network, nothing leaves the browser.
 * A made-up little town around "Null Island" (latitude 0, longitude 0): streets, parks, a river and a railway, answered
 * like the Overpass API (OpenStreetMap JSON), and four lines – U2, U5, tram M8 and bus 142 – that run on a timetable
 * along their routes, answered like the VBB / BVG REST interface (stop, departures, radar, trip).
 * fetch() to the two demo addresses below is answered here after a short pause, everything else goes out as usual.
 * window.GFC_TRANSIT_SIM = { handle(method, url, body, nowMs) → { status, json }, city, lines, stops, API, OVERPASS } */
(function () {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const API = 'https://transit.demo.invalid';
  const OVERPASS = 'https://overpass.demo.invalid/api/interpreter';
  const HOST_API = 'transit.demo.invalid', HOST_OVP = 'overpass.demo.invalid';
  // names follow the demo's language (?lang=de), English without a page around
  const de = (() => {
    try {
      const q = String(G.location.search || '');
      return (typeof URLSearchParams === 'function' ? new URLSearchParams(q).get('lang') : (/[?&]lang=([^&#]*)/.exec(q) || [])[1]) === 'de';
    } catch (e) { return false; }
  })();
  const N = (en, d) => (de ? d : en);

  try {
    G.GFC_TRANSIT_SIM = makeSim();
  } catch (e) {
    // a broken simulator must not break the demo: every request then answers with the error
    const msg = String((e && e.message) || e);
    if (G.console) G.console.error('transit.js:', e);
    G.GFC_TRANSIT_SIM = { API, OVERPASS, error: msg, handle: () => ({ status: 500, json: { error: msg } }), city: null, lines: [], stops: {} };
  }
  installFetch();

  function makeSim() {
    // ---------------------------------------------------------------- geometry (metres: x east, y north, 0/0 = lat 0, lon 0)
    const LAT = 1 / 110574, LON = 1 / 111320;
    const r5 = (v) => Math.round(v * 1e5) / 1e5, r6 = (v) => Math.round(v * 1e6) / 1e6, r7 = (v) => Math.round(v * 1e7) / 1e7;
    const COVER = { s: -0.011, w: -0.013, n: 0.011, e: 0.013 };   // what the map data covers (ways run a little beyond)
    const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
    const rev = (p) => p.slice().reverse();
    const unit = (a, b) => { const l = dist(a, b) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    const span = (a, b, step) => { const r = []; for (let x = a; x <= b + 1e-6; x += step) r.push(x); return r; };
    // the polyline moved sideways by d metres: to the left of its direction, negative = to the right
    const offset = (p, d) => p.map((q, i) => {
      const a = unit(p[Math.max(0, i - 1)], p[Math.max(1, i)]), b = unit(p[Math.min(i, p.length - 2)], p[Math.min(i + 1, p.length - 1)]);
      const m = [-(a[1] + b[1]), a[0] + b[0]], ml = Math.hypot(m[0], m[1]) || 1, cos = (m[0] * -a[1] + m[1] * a[0]) / ml;
      return [q[0] + (m[0] / ml) * (d / cos), q[1] + (m[1] / ml) * (d / cos)];
    });
    const atX = (p, x) => {
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        if (a[0] !== b[0] && (x - a[0]) * (x - b[0]) <= 0) return [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
      }
      return null;
    };
    // nearest point of a polyline: segment i, position t on it, distance d, point p
    const project = (p, q) => {
      let best = null;
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
        const t = l2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2)) : 0;
        const x = a[0] + dx * t, y = a[1] + dy * t, d = Math.hypot(x - q[0], y - q[1]);
        if (!best || d < best.d) best = { i, t, d, p: [x, y] };
      }
      return best;
    };
    // where the line from a through b first meets the polyline p beyond a (streets that end at another street)
    const hit = (a, b, p) => {
      let best = null;
      for (let i = 0; i < p.length - 1; i++) {
        const c = p[i], d = p[i + 1], rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1], den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
        if (u >= 0 && u <= 1 && t > 0.05 && (!best || t < best.t)) best = { t, p: [a[0] + rx * t, a[1] + ry * t] };
      }
      return best;
    };
    // two segments that really cross (not just touch at an end)
    const cross = (a, b, c, d) => {
      const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1], den = rx * sy - ry * sx, E = 1e-7;
      if (Math.abs(den) < 1e-9) return null;
      const s = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den, t = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
      return s > E && s < 1 - E && t > E && t < 1 - E ? { s, t, p: [a[0] + rx * s, a[1] + ry * s] } : null;
    };
    // a made-up continuation beyond the map: from p outwards in direction ang, turning by `bend` over its length
    const extend = (p, ang, len, bend) => {
      const n = Math.max(2, Math.round(len / 150)), step = len / n, out = [p.slice()];
      let x = p[0], y = p[1];
      for (let i = 0; i < n; i++) { const a = ang + (bend * (i + 0.5)) / n; x += Math.cos(a) * step; y += Math.sin(a) * step; out.push([x, y]); }
      return out;
    };
    // a little variety without Math.random (same town on every load)
    const hash = (n) => { let h = Math.imul(n ^ 0x5bd1e995, 0x2c1b3c6d); h ^= h >>> 13; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
    const rect = (x1, y1, x2, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
    const oval = (cx, cy, rx, ry, n, wob, seed) => Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2, k = 1 + wob * (hash(seed * 97 + i) - 0.5);
      return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k];
    });
    const close = (p) => [...p, p[0]];

    // ---------------------------------------------------------------- the town
    const DEFS = [], BY = {}, AREAS = [];
    const STREET = {
      primary: { maxspeed: '50', surface: 'asphalt', lit: 'yes' },
      secondary: { lanes: '2', maxspeed: '50', surface: 'asphalt', lit: 'yes' },
      tertiary: { lanes: '2', maxspeed: '50', surface: 'asphalt', lit: 'yes' },
      residential: { maxspeed: '30', surface: 'asphalt', lit: 'yes' },
      living_street: { surface: 'paving_stones', lit: 'yes' },
      pedestrian: { surface: 'paving_stones', lit: 'yes' },
      service: { surface: 'asphalt' },
    };
    const way = (key, tags, pts, o = {}) => {
      const d = { key, tags, pts: pts.map((p) => p.slice()), from: o.from, to: o.to, cuts: o.cuts || [], ns: o.ns || 'road', st: 0 };
      DEFS.push(d); BY[key] = d;
      return d;
    };
    const street = (key, highway, name, pts, o = {}) => way(key, { highway, ...(name ? { name } : {}), ...STREET[highway], ...(o.tags || {}) }, pts, o);
    const area = (tags, pts) => { const a = { tags, pts: close(pts) }; AREAS.push(a); return a; };

    // the river along the south edge, a quiet street along its north bank
    const bankN = (x) => -968 + 20 * Math.sin((x + 300) / 380) + 8 * Math.sin(x / 170);
    const bankS = (x) => bankN(x) - 80 - 10 * Math.sin((x - 200) / 450);
    const LSQ = [-234, 177];   // Linden Square: a small roundabout, U2 and U5 below it
    const CB = [[-1540, -80], [-900, -104], [-250, -133], [290, -150], [800, -168], [1540, -206]];   // Elm Boulevard, centre line
    const hx = (y) => 300 + (18 * (-700 - y)) / 610;   // Harbour Road south of y = -700
    const yB1 = bankN(306) + 15, yB2 = bankS(310) - 18;   // Harbour Bridge: from the north bank to the south bank
    const HN = [[332, 1310], [322, 900], [308, 420], [296, 40], [290, -150]];
    const HS = [[290, -150], [294, -420], [300, -700], [hx(yB1), yB1]];
    const HB = [[hx(yB1), yB1], [hx(yB2), yB2]];
    const HSB = [[hx(yB2), yB2], [318, -1310]];
    const BRIDGE = { bridge: 'yes', layer: '1' };
    const BLVD = { lanes: '2', oneway: 'yes', dual_carriageway: 'yes' };
    const ELM = N('Elm Boulevard', 'Ulmenallee'), HARB = N('Harbour Road', 'Hafenstraße'), CHURCH = N('Church Street', 'Kirchstraße');
    const MARKET = N('Market Street', 'Marktstraße'), LINDEN = N('Linden Avenue', 'Lindenallee'), FORGE = N('Forge Street', 'Schmiedestraße');
    const HILL = N('Hill Street', 'Bergstraße'), ORCH = N('Orchard Lane', 'Obstgartenweg'), BRICK = N('Brick Lane', 'Ziegelstraße');

    // the divided boulevard: one carriageway per direction (right-hand traffic), bus 142 runs on it
    street('blvdS', 'primary', ELM, offset(CB, -11), { tags: BLVD, cuts: [[-600, -125], [1000, -190]] });   // eastbound
    street('blvdN', 'primary', ELM, offset(rev(CB), -11), { tags: BLVD, cuts: [[1000, -168], [-600, -105]] });   // westbound
    // Harbour Road: two-way, tram M8 in the middle, over the river on a bridge
    street('harbourN', 'secondary', HARB, HN);
    street('harbourS', 'secondary', HARB, HS);
    street('harbourBridge', 'secondary', N('Harbour Bridge', 'Hafenbrücke'), HB, { tags: BRIDGE });
    street('harbourSB', 'secondary', HARB, HSB);
    // Linden Square and the six streets that meet there
    street('ring', 'tertiary', N('Linden Square', 'Lindenplatz'), Array.from({ length: 17 }, (_, i) => {
      const a = ((i % 16) / 16) * Math.PI * 2;
      return [LSQ[0] + 32 * Math.cos(a), LSQ[1] + 32 * Math.sin(a)];
    }), { tags: { junction: 'roundabout', lanes: '1', maxspeed: '30' } });
    street('churchN', 'tertiary', CHURCH, [LSQ, [-240, 420], [-250, 700], [-262, 1310]], { from: 'ring' });
    street('churchS', 'tertiary', CHURCH, [LSQ, [-222, -140], [-200, -420], [-176, -760], [-160, -1000]], { from: 'ring', to: 'riverside' });
    street('marketW', 'tertiary', MARKET, [[-1540, 232], [-930, 207], [-500, 190], LSQ], { to: 'ring' });
    street('marketE', 'tertiary', MARKET, [LSQ, [100, 170], [330, 163], [700, 170], [1100, 195], [1540, 262]], { from: 'ring' });
    // the diagonal avenue, over the railway on a bridge in the north-east
    street('lindenSW', 'secondary', LINDEN, [LSQ, [-640, -330], [-1080, -900]], { from: 'ring', to: 'riverside' });
    street('lindenNE1', 'secondary', LINDEN, [LSQ, [350, 640], [870, 1024.8]], { from: 'ring' });
    street('lindenBridge', 'secondary', LINDEN, [[870, 1024.8], [920, 1061.8]], { tags: BRIDGE });
    street('lindenNE3', 'secondary', LINDEN, [[920, 1061.8], [1150, 1232], [1540, 1400]]);
    street('riverside', 'tertiary', N('Riverside', 'Uferstraße'), span(-1540, 1540, 140).map((x) => [x, bankN(x) + 30]), { tags: { maxspeed: '30' } });
    street('stationRd', 'tertiary', N('Station Road', 'Bahnhofstraße'), [[1150, -1000], [1165, -180], [1180, 300], [1195, 815], [1210, 1310]], { from: 'riverside', to: 'lindenNE3' });
    street('brook', 'tertiary', N('Brook Street', 'Bachstraße'), [[-905, -1000], [-918, -420], [-930, 200], [-945, 800], [-955, 1310]], { from: 'riverside' });
    street('school', 'tertiary', N('School Lane', 'Schulweg'), [[-1360, 462], [-700, 470], [-245, 478], [300, 486], [800, 492], [1300, 498]], { from: 'meadow', to: 'stationRd', tags: { maxspeed: '30' } });
    // the west
    street('meadow', 'residential', N('Meadow Lane', 'Wiesenweg'), [[-1345, -1000], [-1338, -400], [-1312, 0], [-1322, 420], [-1345, 820], [-1330, 1310]], { from: 'riverside' });
    street('forgeN', 'residential', FORGE, [[-1128, -200], [-1112, 600], [-1100, 1310]], { from: 'blvdN' });
    street('forgeS', 'residential', FORGE, [[-1160, -1000], [-1150, -100]], { from: 'riverside', to: 'blvdS' });
    street('garden', 'residential', N('Garden Street', 'Gartenstraße'), [[-505, 150], [-512, 600], [-530, 820], [-570, 1020], [-600, 1310]], { from: 'marketW' });
    street('lantern', 'residential', N('Lantern Lane', 'Laternenweg'), [[-385, 150], [-392, 640]], { from: 'marketW', to: 'chestnut' });
    street('ivy', 'residential', N('Ivy Crescent', 'Efeubogen'), [[-1065, 900], [-1060, 760], [-1035, 712], [-1000, 705], [-975, 720], [-962, 760], [-958, 900]], { from: 'orchardW', to: 'orchardW', tags: { maxspeed: '20' } });
    street('rose', 'residential', N('Rose Lane', 'Rosenweg'), [[-718, 150], [-725, 700]], { from: 'marketW', to: 'chestnut', tags: { oneway: 'yes' } });
    street('hillW', 'residential', HILL, [[-1540, 1110], [-800, 1122], [-300, 1135]], { to: 'churchN' });
    street('hillE', 'residential', HILL, [[-200, 1090], [332, 1075]], { from: 'churchN', to: 'harbourN' });
    street('tower', 'residential', N('Tower Street', 'Turmstraße'), [[-1360, 930], [-600, 952], [100, 975], [560, 962]], { from: 'meadow' });   // ends in a dead end
    street('orchardW', 'residential', ORCH, [[-1360, 812], [-700, 820], [-200, 826]], { from: 'meadow', to: 'churchN' });
    street('orchardE', 'residential', ORCH, [[250, 830], [560, 822]], { from: 'harbourN', to: 'lindenNE1' });
    street('chestnut', 'residential', N('Chestnut Street', 'Kastanienstraße'), [[-1540, 600], [-1100, 612], [-900, 640], [-600, 628], [-300, 632]], { to: 'churchN' });
    street('cloister', 'residential', N('Cloister Lane', 'Klostergasse'), [[-95, 200], [-100, 500], [-108, 990]], { from: 'lindenNE1', to: 'tower' });
    street('saddler', 'residential', N('Saddler Street', 'Sattlergasse'), [[190, 120], [192, 400]], { from: 'marketE', to: 'mill' });
    street('glass', 'residential', N('Glass Street', 'Glasergasse'), [[480, 120], [484, 500]], { from: 'marketE', to: 'school' });
    street('mill', 'residential', N('Mill Lane', 'Mühlenweg'), [[-1200, 322], [-700, 328], [-240, 334], [0, 336], [400, 338], [700, 336], [1100, 340]], { from: 'forgeN', to: 'stationRd' });
    // south of the boulevard
    street('weaver', 'residential', N('Weaver Street', 'Webergasse'), [[-1360, -330], [-900, -334], [-500, -338], [-180, -336], [300, -322], [700, -318], [1300, -314], [1540, -312]], { from: 'meadow' });
    street('ferry', 'residential', N('Ferry Lane', 'Fährgasse'), [[-1200, -530], [-800, -536], [-160, -542]], { from: 'forgeS', to: 'churchS' });
    street('salt', 'residential', N('Salt Street', 'Salzstraße'), [[-100, -560], [300, -563], [700, -560], [1300, -555], [1540, -552]], { from: 'churchS' });
    street('brick', 'residential', BRICK, [[-1360, -718], [-960, -722]], { from: 'meadow', to: 'lindenSW' });
    street('tanner', 'residential', N('Tanner Street', 'Gerberstraße'), [[40, -100], [45, -600], [52, -1000]], { from: 'blvdS', to: 'riverside' });
    street('brickE', 'residential', BRICK, [[-100, -740], [300, -752], [700, -760], [1100, -765]], { from: 'churchS', to: 'stationRd' });
    street('cobbler', 'residential', N('Cobbler Lane', 'Schusterweg'), [[165, -100], [170, -500], [176, -1000]], { from: 'blvdS', to: 'riverside' });
    street('oldLane', 'residential', N('Old Lane', 'Alter Weg'), [[650, -290], [800, -590]], { from: 'weaver', to: 'salt' });
    // around Town Hall
    street('baker', 'residential', N('Baker Street', 'Bäckerstraße'), [[40, -100], [45, 300], [52, 700], [60, 948]], { from: 'blvdN', to: 'tower' });
    street('bell', 'living_street', N('Bell Street', 'Glockengasse'), [[-300, 62], [100, 58]], { from: 'churchS', to: 'baker', tags: { oneway: 'yes' } });
    street('townHallSq', 'pedestrian', N('Town Hall Square', 'Rathausplatz'), [[0, -58], [320, -62]], { from: 'baker', to: 'harbourN' });
    // the east
    street('dock', 'residential', N('Dock Street', 'Werftstraße'), [[612, -1000], [622, -400], [632, -150], [640, 200]], { from: 'riverside', to: 'marketE' });
    street('potter', 'residential', N('Potter Street', 'Töpferstraße'), [[660, 120], [650, 500], [640, 900]], { from: 'marketE', to: 'lindenNE1' });
    street('cooper', 'residential', N('Cooper Lane', 'Böttcherweg'), [[870, -600], [880, -170], [890, 250], [898, 700]], { from: 'salt', to: 'roseCourt' });
    street('brewery', 'residential', N('Brewery Lane', 'Brauereigasse'), [[1000, 120], [1005, 700]], { from: 'marketE' });   // ends in a dead end
    street('roseCourt', 'living_street', N('Rose Court', 'Rosenhof'), [[600, 620], [1050, 628]], { from: 'potter', to: 'brewery' });
    street('kiln', 'residential', N('Kiln Lane', 'Ofenweg'), [[1380, -1000], [1352, -640], [1338, -300], [1350, 300]], { from: 'riverside', to: 'marketE' });
    street('service', 'service', null, [[1100, 722], [1330, 655]], { from: 'stationRd' });
    street('quay', 'residential', N('Quay Street', 'Kaistraße'), span(180, 1540, 170).map((x) => [x, bankS(x) - 28]), { from: 'harbourSB' });

    // railways: a main line across the north-east corner (level crossing at Station Road, bridge at Linden Avenue),
    // the tram along Harbour Road, two subway lines in tunnels with one track per direction
    way('rail', { railway: 'rail', usage: 'main', name: N('North Line', 'Nordbahn'), electrified: 'contact_line', gauge: '1435', maxspeed: '100', operator: 'Demo Rail' },
      [[540, 1330], [780, 1140], [1000, 958], [1250, 750], [1560, 515]]);
    const TRAM = { railway: 'tram', electrified: 'contact_line', gauge: '1435', operator: 'Demo Transit' };
    way('tramN', TRAM, HN, { ns: 'tram' });
    way('tramS', TRAM, HS, { ns: 'tram' });
    way('tramB', { ...TRAM, ...BRIDGE }, HB, { ns: 'tram' });
    way('tramSB', TRAM, HSB, { ns: 'tram' });
    const SUB = (name, layer) => ({ railway: 'subway', name, tunnel: 'yes', layer, electrified: 'rail', gauge: '1435', operator: 'Demo Transit' });
    const U2C = [[-262, 1310], [-250, 700], [-234, 177], [-212, -420], [-170, -900], [-120, -1310]];   // north → south
    const U5C = [[-1540, 262], [-930, 208], [-234, 177], [330, 160], [1000, 182], [1540, 248]];   // west → east
    way('u2s', SUB('U2', '-1'), offset(U2C, -4), { ns: 'u2', cuts: [[-245, 520], [-224, -170]] });   // southbound track
    way('u2n', SUB('U2', '-1'), offset(rev(U2C), -4), { ns: 'u2', cuts: [[-245, 520], [-224, -170]] });   // northbound track
    way('u5e', SUB('U5', '-2'), offset(U5C, -4), { ns: 'u5', cuts: [[-600, 192], [650, 170]] });   // eastbound track
    way('u5w', SUB('U5', '-2'), offset(rev(U5C), -4), { ns: 'u5', cuts: [[-600, 192], [650, 170]] });   // westbound track

    // green, water, a few landmarks
    area({ natural: 'water', water: 'river', name: N('Silver River', 'Silberfluss') },
      [...span(-1660, 1660, 166).map((x) => [x, bankN(x)]), ...rev(span(-1660, 1660, 166)).map((x) => [x, bankS(x)])]);
    const PARK = { tags: { type: 'multipolygon', leisure: 'park', name: N('Town Park', 'Stadtpark') }, outer: close([[-830, -50], [-700, -56], [-575, -48], [-568, 60], [-590, 132], [-760, 136], [-826, 120]]) };
    PARK.pond = area({ natural: 'water', water: 'pond', name: N('Duck Pond', 'Ententeich') }, oval(-690, 30, 48, 30, 20, 0.22, 3));
    area({ leisure: 'playground' }, rect(-612, 84, -588, 110));
    area({ leisure: 'playground' }, rect(-1062, 380, -1032, 408));
    area({ leisure: 'playground' }, rect(948, -462, 980, -432));
    area({ leisure: 'garden', name: N('Town Hall Garden', 'Rathausgarten') }, rect(118, 22, 236, 112));
    area({ leisure: 'garden', name: N('Sunny Gardens', 'Sonnengärten') }, [[662, -905], [842, -898], [838, -790], [664, -794]]);
    area({ landuse: 'cemetery', name: N('Old Cemetery', 'Alter Friedhof') }, [[-850, 978], [-660, 984], [-655, 1092], [-846, 1097]]);
    area({ landuse: 'grass' }, oval(LSQ[0], LSQ[1], 22, 22, 16, 0, 1));
    area({ landuse: 'grass', name: N('Linden Green', 'Lindenanger') }, [[-420, 660], [-290, 662], [-288, 790], [-422, 786]]);
    area({ landuse: 'grass', name: N('Riverside Meadow', 'Uferwiese') }, [...span(-1660, 250, 191).map((x) => [x, bankS(x) - 6]), [250, -1330], [-1660, -1330]]);
    area({ landuse: 'recreation_ground', name: N('Sports Field', 'Sportplatz') }, rect(-1300, -500, -1190, -372));
    area({ natural: 'wood', name: N('Fox Wood', 'Fuchswald') }, [[1240, 900], [1330, 800], [1480, 720], [1600, 660], [1600, 1010], [1450, 1080], [1290, 1060]]);
    area({ building: 'civic', amenity: 'townhall', name: N('Town Hall', 'Rathaus') }, rect(120, -42, 236, 8));
    area({ building: 'retail', name: N('Market Hall', 'Markthalle') }, rect(352, 186, 450, 238));
    area({ building: 'church', amenity: 'place_of_worship', name: N('Linden Church', 'Lindenkirche') }, [[-322, 530], [-282, 530], [-282, 590], [-302, 600], [-322, 590]]);
    area({ building: 'school', amenity: 'school', name: N('Brook School', 'Bachschule') }, rect(-880, 500, -780, 556));
    area({ building: 'yes', name: N('Old Mill', 'Alte Mühle') }, rect(-420, -922, -384, -900));

    // ---------------------------------------------------------------- the lines
    // stops on the map: [id, x, y] in the travel order of the first direction ([…, x, y] of the other direction when it differs);
    // ends: [where the first direction starts, where it ends], each with the stops beyond the map, outwards, the last one the terminus
    const NAMES = {
      linden_square: ['Linden Square', 'Lindenplatz'], town_hall: ['Town Hall', 'Rathaus'], market_hall: ['Market Hall', 'Markthalle'],
      orchard_lane: ['Orchard Lane', 'Obstgartenweg'], ferry_lane: ['Ferry Lane', 'Fährgasse'], riverside_meadow: ['Riverside Meadow', 'Uferwiese'],
      brook_street: ['Brook Street', 'Bachstraße'], brewery_lane: ['Brewery Lane', 'Brauereigasse'], forge_street: ['Forge Street', 'Schmiedestraße'],
      town_park: ['Town Park', 'Stadtpark'], church_street: ['Church Street', 'Kirchstraße'], dock_street: ['Dock Street', 'Werftstraße'],
      station_road: ['Station Road', 'Bahnhofstraße'], harbour_bridge: ['Harbour Bridge', 'Hafenbrücke'], salt_street: ['Salt Street', 'Salzstraße'],
      linden_avenue: ['Linden Avenue', 'Lindenallee'], hill_street: ['Hill Street', 'Bergstraße'],
    };
    const cy = (x) => atX(CB, x)[1];
    const LINES = [
      { ref: 'U2', product: 'subway', bg: '#e8432f', fg: '#fff', every: 5, off: 1, kmh: 32, key: 'linden_square',
        ways: [[['u2n']], [['u2s']]],
        stops: [['riverside_meadow', -139, -1150], ['ferry_lane', -203, -520], ['linden_square', -234, 177], ['orchard_lane', -253, 840]],
        ends: [{ len: 3200, bend: 0.4, names: [['Willow Bank', 'Weidenufer'], ["Fisher's Row", 'Fischerzeile'], ['Lighthouse Road', 'Leuchtturmweg'], ['Sand Hill', 'Sandberg'], ['Lake Street', 'Seestraße']] },
          { len: 3600, bend: -0.3, names: [['Poplar Road', 'Pappelweg'], ['Fair Grounds', 'Messegelände'], ['Water Tower', 'Wasserturm'], ['Sports Park', 'Sportpark'], ['Northgate', 'Nordtor'], ['North Park', 'Nordpark']] }] },
      { ref: 'U5', product: 'subway', bg: '#8a6340', fg: '#fff', every: 6, off: 3, kmh: 32, key: 'linden_square',
        ways: [[['u5w']], [['u5e']]],
        stops: [['brewery_lane', 1000, 182], ['market_hall', 330, 160], ['linden_square', -234, 177], ['brook_street', -930, 208]],
        ends: [{ len: 3400, bend: 0.3, names: [['Clay Pits', 'Lehmkuhle'], ['Birch Road', 'Birkenweg'], ["Hunters' Lodge", 'Jägerhof'], ['Pine Hill', 'Kiefernberg'], ['Moor Lane', 'Moorweg'], ['Forest Estate', 'Waldsiedlung']] },
          { len: 4200, bend: -0.25, names: [['Iron Bridge', 'Eiserne Brücke'], ['Museum', 'Museum'], ['Opera', 'Oper'], ['Castle Garden', 'Schlossgarten'], ['University', 'Universität'], ['Exchange Square', 'Börsenplatz'], ['Central Station', 'Hauptbahnhof']] }] },
      { ref: '142', product: 'bus', every: 6, off: 4, kmh: 17, key: 'town_hall',
        ways: [[['blvdS']], [['blvdN']]],
        stops: [['forge_street', -1180, cy(-1180)], ['town_park', -700, cy(-700)], ['church_street', -250, cy(-250)], ['town_hall', 250, cy(250)], ['dock_street', 700, cy(700)], ['station_road', 1215, cy(1215)]],
        ends: [{ len: 3800, bend: 0.3, names: [['Dyer Street', 'Färberstraße'], ['Hay Market', 'Heumarkt'], ['Guild Hall', 'Gildehaus'], ['Fountain Street', 'Brunnenstraße'], ['Library', 'Bibliothek'], ['Theatre', 'Theater'], ['Corn Exchange', 'Kornbörse'], ['Old Town Gate', 'Altes Tor'], ['Market Square', 'Marktplatz']] },
          { len: 3100, bend: -0.35, names: [['Elm Court', 'Ulmenhof'], ['Gasworks', 'Gaswerk'], ['Canal Bridge', 'Kanalbrücke'], ['Printing Works', 'Druckerei'], ['Sawmill', 'Sägewerk'], ['Freight Yard', 'Güterbahnhof'], ['East Station', 'Bahnhof Ost']] }] },
      { ref: 'M8', product: 'tram', every: 6, off: 2, kmh: 19, key: 'town_hall',
        ways: [[['tramSB', 1], ['tramB', 1], ['tramS', 1], ['tramN', 1]], [['tramN'], ['tramS'], ['tramB'], ['tramSB']]],
        stops: [['harbour_bridge', hx(-1120), -1120], ['salt_street', 298, -590], ['town_hall', 291, -116, 291.5, -102], ['market_hall', 302, 245], ['linden_avenue', 315, 650], ['hill_street', 326, 1060]],
        ends: [{ len: 3200, bend: 0.45, names: [['Grain Silo', 'Kornspeicher'], ['Customs House', 'Zollhaus'], ['Fish Market', 'Fischmarkt'], ['Lock Gate', 'Schleuse'], ['Container Quay', 'Containerkai'], ['Harbour', 'Hafen']] },
          { len: 3500, bend: -0.3, names: [['Rose Garden', 'Rosengarten'], ['Observatory', 'Sternwarte'], ['Swimming Baths', 'Stadtbad'], ['Allotments', 'Kleingärten'], ['Mill Pond', 'Mühlenteich'], ['College', 'Hochschule'], ['Hospital', 'Klinikum']] }] },
    ];
    const KIND = {
      subway: { productName: 'U', mode: 'train', label: '' },
      tram: { productName: 'Tram', mode: 'train', label: 'Tram ' },
      bus: { productName: 'Bus', mode: 'bus', label: 'Bus ' },
    };
    const DWELL = 25;   // seconds at every stop

    // ---------------------------------------------------------------- build: snap street ends, split, junctions, nodes
    const ISSUES = [];
    const resolve = (d) => {
      if (d.st) return;
      d.st = 1;
      const snap = (key, end) => {
        const t = BY[key];
        if (!t) return ISSUES.push(`unknown street ${key}`);
        resolve(t);
        const p = d.pts, n = p.length, h = end ? hit(p[n - 2], p[n - 1], t.pts) : hit(p[1], p[0], t.pts);
        if (!h) return ISSUES.push(`${d.key} does not reach ${key}`);
        p[end ? n - 1 : 0] = h.p;
      };
      if (d.from) snap(d.from, false);
      if (d.to) snap(d.to, true);
      d.st = 2;
    };
    DEFS.forEach(resolve);

    // ways are split where a route changes from one to the next (a few pieces per carriageway and track)
    const split = (p, cuts) => {
      let parts = [p];
      for (const c of cuts) {
        let best = null;
        parts.forEach((q, qi) => { const h = project(q, c); if (!best || h.d < best.h.d) best = { qi, h }; });
        const q = parts[best.qi], { i, t, p: x } = best.h;
        if (best.h.d > 30 || (i === 0 && t < 1e-6) || (i === q.length - 2 && t > 1 - 1e-6)) { ISSUES.push('cut misses'); continue; }
        parts.splice(best.qi, 1, [...q.slice(0, i + 1), x], [x, ...q.slice(i + 1)]);
      }
      return parts;
    };
    const W = [];
    DEFS.forEach((d) => {
      d.pieces = split(d.pts, d.cuts).map((pts) => {
        const w = { d, pts, ns: d.ns, layer: +(d.tags.layer || 0), tags: d.tags, ins: [] };
        W.push(w);
        return w;
      });
    });

    // stop positions become nodes of the ways the lines run on
    const pin = (pieces, q) => {
      let best = null;
      for (const w of pieces) { const h = project(w.pts, q); if (!best || h.d < best.h.d) best = { w, h }; }
      best.w.ins.push({ k: best.h.i + best.h.t, p: best.h.p });
      if (best.h.d > 15) ISSUES.push(`stop ${q} is ${Math.round(best.h.d)} m off its way`);
      return { w: best.w, p: best.h.p };
    };
    LINES.forEach((L, li) => {
      L.id = `demo-${L.product === 'subway' ? '' : `${L.product}-`}${L.ref.toLowerCase()}`;
      L.dirs = [0, 1].map((di) => {
        const pieces = [];
        for (const [key, r] of L.ways[di]) { const ps = BY[key].pieces; (r ? rev(ps) : ps).forEach((w) => pieces.push({ w, r: !!r })); }
        const list = di ? rev(L.stops) : L.stops;
        return { L, li, di, pieces, pins: list.map((s) => ({ id: s[0], pin: pin(pieces.map((x) => x.w), di && s.length > 3 ? [s[3], s[4]] : [s[1], s[2]]) })) };
      });
    });

    // junctions: ways of the same kind and level share a node where they cross or where one ends on the other
    const bb = (p) => p.reduce((b, q) => [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[0]), Math.max(b[3], q[1])], [Infinity, Infinity, -Infinity, -Infinity]);
    W.forEach((w) => { w.bb = bb(w.pts); });
    const touch = (A, B) => A.pts.forEach((v) => {
      for (let b = 0; b < B.pts.length - 1; b++) {
        const h = project([B.pts[b], B.pts[b + 1]], v);
        if (h.d < 0.25 && h.t > 1e-6 && h.t < 1 - 1e-6) B.ins.push({ k: b + h.t, p: v.slice() });
      }
    });
    for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) {
      const A = W[i], B = W[j];
      if (A.ns !== B.ns || A.layer !== B.layer || A.bb[0] > B.bb[2] + 1 || B.bb[0] > A.bb[2] + 1 || A.bb[1] > B.bb[3] + 1 || B.bb[1] > A.bb[3] + 1) continue;
      for (let a = 0; a < A.pts.length - 1; a++) for (let b = 0; b < B.pts.length - 1; b++) {
        const x = cross(A.pts[a], A.pts[a + 1], B.pts[b], B.pts[b + 1]);
        if (x) { A.ins.push({ k: a + x.s, p: x.p }); B.ins.push({ k: b + x.t, p: x.p }); }
      }
      touch(A, B);
      touch(B, A);
    }

    // nodes: points closer than 30 cm (of the same kind of way) are one node
    const NODES = [], GRID = new Map();
    const nodeAt = (ns, x, y, make = true) => {
      const gx = Math.floor(x), gy = Math.floor(y);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const n of GRID.get(`${ns}|${gx + i}|${gy + j}`) || []) if (Math.hypot(n.x - x, n.y - y) < 0.3) return n;
      if (!make) return null;
      const n = { id: 10000001 + NODES.length, x, y, lat: r7(y * LAT), lon: r7(x * LON) };
      NODES.push(n);
      const k = `${ns}|${gx}|${gy}`;
      if (!GRID.has(k)) GRID.set(k, []);
      GRID.get(k).push(n);
      return n;
    };
    let wayId = 20000001;
    const nodesOf = (ns, pts) => {
      const out = [];
      for (const q of pts) { const n = nodeAt(ns, q.p[0], q.p[1]); if (out[out.length - 1] !== n) out.push(n); }
      return out;
    };
    W.forEach((w) => {
      w.id = wayId++;
      w.nodes = nodesOf(w.ns, w.pts.map((p, k) => ({ k, p })).concat(w.ins).sort((a, b) => a.k - b.k));
    });
    AREAS.forEach((a, i) => { a.id = wayId++; a.nodes = nodesOf(`a${i}`, a.pts.map((p) => ({ p }))); });
    PARK.id = wayId++;
    PARK.nodes = nodesOf('park', PARK.outer.map((p) => ({ p })));

    // ---------------------------------------------------------------- OSM elements of the map
    const geo = (ns) => ns.map((n) => ({ lat: n.lat, lon: n.lon }));
    const bounds = (g) => {
      const b = g.reduce((o, p) => (p ? [Math.min(o[0], p.lat), Math.min(o[1], p.lon), Math.max(o[2], p.lat), Math.max(o[3], p.lon)] : o), [Infinity, Infinity, -Infinity, -Infinity]);
      return b[0] === Infinity ? null : { minlat: b[0], minlon: b[1], maxlat: b[2], maxlon: b[3] };
    };
    const wayEl = (id, nodes, tags) => { const g = geo(nodes); return { type: 'way', id, bounds: bounds(g), nodes: nodes.map((n) => n.id), geometry: g, tags }; };
    W.forEach((w) => { w.el = wayEl(w.id, w.nodes, w.tags); });
    AREAS.forEach((a) => { a.el = wayEl(a.id, a.nodes, a.tags); });
    const parkMembers = [{ type: 'way', ref: PARK.id, role: 'outer', geometry: geo(PARK.nodes) }, { type: 'way', ref: PARK.pond.id, role: 'inner', geometry: PARK.pond.el.geometry }];
    const MAP = [...W.map((w) => w.el), ...AREAS.map((a) => a.el),
      { type: 'relation', id: 30000101, bounds: bounds(parkMembers[0].geometry), members: parkMembers, tags: PARK.tags }];

    // ---------------------------------------------------------------- the routes in full: on the map and beyond
    const slug = (s) => s.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const STOP_AT = {}, STOP_PROD = {}, STOP_NAME = {};
    const seen = (id, name, p, product) => {
      (STOP_AT[id] = STOP_AT[id] || []).push(p);
      (STOP_PROD[id] = STOP_PROD[id] || new Set()).add(product);
      STOP_NAME[id] = name;
    };
    const DIRS = [];
    LINES.forEach((L) => L.dirs.forEach((d) => {
      // the nodes the route runs over on the map, in travel order
      const chain = [];
      for (const { w, r } of d.pieces) (r ? rev(w.nodes) : w.nodes).forEach((n, i) => {
        if (i === 0 && chain.length) { if (chain[chain.length - 1] !== n) ISSUES.push(`${L.ref}: ways do not join`); else return; }
        chain.push(n);
      });
      const a = chain[0], a1 = chain[1], z = chain[chain.length - 1], z1 = chain[chain.length - 2];
      const E0 = L.ends[d.di ? 1 : 0], E1 = L.ends[d.di ? 0 : 1];
      const ext0 = extend([a.x, a.y], Math.atan2(a.y - a1.y, a.x - a1.x), E0.len, E0.bend);   // drawn outwards from the start
      const ext1 = extend([z.x, z.y], Math.atan2(z.y - z1.y, z.x - z1.x), E1.len, E1.bend);
      const pts = [...rev(ext0), ...chain.slice(1).map((n) => [n.x, n.y]), ...ext1.slice(1)];
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
      const at = (s) => {
        let lo = 0, hi = cum.length - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
        const t = cum[hi] > cum[lo] ? Math.max(0, Math.min(1, (s - cum[lo]) / (cum[hi] - cum[lo]))) : 0;
        return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * t, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * t];
      };
      const right = (s, m) => { const p = at(Math.max(0, s - 3)), q = at(s + 3), u = unit(p, q); return [(p[0] + q[0]) / 2 + u[1] * m, (p[1] + q[1]) / 2 - u[0] * m]; };
      const off = ext0.length - 1;
      const inmap = d.pins.map((x) => {
        const n = nodeAt(x.pin.w.ns, x.pin.p[0], x.pin.p[1], false), ci = chain.indexOf(n);
        if (ci < 0) ISSUES.push(`${L.ref}: stop ${x.id} not on the route`);
        return { id: x.id, name: N(...NAMES[x.id]), s: cum[off + Math.max(0, ci)], node: n };
      });
      const first = inmap[0].s, last = inmap[inmap.length - 1].s, total = cum[cum.length - 1];
      const before = E0.names.map((nm, i) => ({ id: slug(nm[0]), name: N(...nm), s: first - (first * (i + 1)) / E0.names.length })).reverse();
      const after = E1.names.map((nm, i) => ({ id: slug(nm[0]), name: N(...nm), s: last + ((total - last) * (i + 1)) / E1.names.length }));
      if (first / E0.names.length <= first - cum[off] || (total - last) / E1.names.length <= cum[off + chain.length - 1] - last) ISSUES.push(`${L.ref}: a stop beyond the map lies on the map`);
      const kmh = L.kmh / 3.6, wide = { bus: 6, tram: 5, subway: 0 }[L.product];
      const stops = [...before, ...inmap, ...after].map((st) => {
        const p = at(st.s);
        if (!st.node) { st.node = nodeAt('ext', p[0], p[1]); st.pf = nodeAt('ext', ...right(st.s, 5)); } else if (wide) st.pf = nodeAt('pf', ...right(st.s, wide));
        st.p = p;
        seen(st.id, st.name, p, L.product);
        return st;
      });
      // timetable in whole seconds after the trip leaves its first stop
      const arr = [0], dep = [0];
      for (let i = 1; i < stops.length; i++) {
        arr.push(Math.round(dep[i - 1] + (stops[i].s - stops[i - 1].s) / kmh));
        dep.push(i === stops.length - 1 ? null : arr[i] + DWELL);
      }
      Object.assign(d, {
        line: L, o: L.off + d.di * 3, chain, pts, cum, at, stops, arr, dep, total: arr[arr.length - 1],
        key: stops.findIndex((s) => s.id === L.key), dest: stops[stops.length - 1].name, wayIds: [],
        ext: [{ id: wayId++, geo: rev(ext0).map((p) => ({ lat: r7(p[1] * LAT), lon: r7(p[0] * LON) })) }, { id: wayId++, geo: ext1.map((p) => ({ lat: r7(p[1] * LAT), lon: r7(p[0] * LON) })) }],
        relId: 30000001 + d.li * 2 + d.di,
      });
      const from = stops[0].name, to = d.dest;
      d.relTags = { type: 'route', route: L.product, ref: L.ref, name: `${KIND[L.product].label}${L.ref}: ${from} => ${to}`, from, to,
        network: 'Demo', operator: 'Demo Transit', 'public_transport:version': '2', ...(L.bg ? { colour: L.bg } : {}) };
      DIRS.push(d);
    }));
    // subway stations: one island platform between the two tracks
    LINES.filter((L) => L.product === 'subway').forEach((L) => L.dirs[0].stops.forEach((st) => {
      if (st.pf) return;
      const o = L.dirs[1].stops.find((x) => x.id === st.id);
      const pf = nodeAt('pf', (st.node.x + o.node.x) / 2, (st.node.y + o.node.y) / 2);
      st.pf = o.pf = pf;
    }));

    // the stops as the interface describes them
    const FIXED = { linden_square: [0.0016, -0.0021], town_hall: [-0.0012, 0.0024] };
    const STOPS = {};
    for (const id of Object.keys(STOP_AT)) {
      const ps = STOP_AT[id], c = [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length];
      const [lat, lon] = FIXED[id] || [r6(c[1] * LAT), r6(c[0] * LON)], pr = STOP_PROD[id];
      STOPS[id] = { type: 'stop', id, name: STOP_NAME[id], location: { type: 'location', id, latitude: lat, longitude: lon },
        products: { suburban: false, subway: pr.has('subway'), tram: pr.has('tram'), bus: pr.has('bus'), ferry: false, express: false, regional: false } };
    }

    // ---------------------------------------------------------------- the timetable
    const OPERATOR = { type: 'operator', id: 'demo-transit', name: 'Demo Transit' };
    const pad = (n) => String(n).padStart(2, '0');
    // ISO time with the local offset, as the interface sends it
    const iso = (ms) => {
      if (ms == null) return null;
      const t = new Date(ms), o = -t.getTimezoneOffset();
      return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}${o < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)}`;
    };
    const loc = (p) => ({ type: 'location', latitude: r6(p[1] * LAT), longitude: r6(p[0] * LON) });
    // speed up and slow down between stops (the time from stop to stop stays the same)
    const ease = (u) => {
      const a = 0.15, v = 1 / (1 - a);
      if (u <= 0) return 0;
      if (u >= 1) return 1;
      return u < a ? (v * u * u) / (2 * a) : u > 1 - a ? 1 - (v * (1 - u) * (1 - u)) / (2 * a) : v * (u - a / 2);
    };
    // where a trip is, tau seconds after it left its first stop: position s along the route, last stop o, next stop d
    const where = (d, tau) => {
      const A = d.arr, D = d.dep, S = d.stops, n = S.length;
      if (tau <= 0) return { s: S[0].s, o: 0, d: 1, wait: true };
      for (let i = 1; i < n; i++) {
        if (tau < A[i]) return { s: S[i - 1].s + ease((tau - D[i - 1]) / (A[i] - D[i - 1])) * (S[i].s - S[i - 1].s), o: i - 1, d: i };
        if (i < n - 1 && tau < D[i]) return { s: S[i].s, o: i, d: i + 1 };
      }
      return { s: S[n - 1].s, o: n - 2, d: n - 1, end: true };
    };
    // trip k of a direction reaches the line's key stop (Linden Square, Town Hall) at minute k · every + offset;
    // every 5th trip is two minutes late, every 13th bus does not run – the two directions at different times (the same rules
    // as the departures sensors in hass.js)
    const dmy = (ms) => { const t = new Date(ms); return `${pad(t.getDate())}${pad(t.getMonth() + 1)}${t.getFullYear()}`; };
    const trip = (d, k) => {
      const ev = d.line.every, m = k * ev + d.o, n = Math.round(m / ev);
      const delay = n % 5 === 0 ? 120 : 0, plannedKey = m * 60000, plannedStart = plannedKey - d.arr[d.key] * 1000;
      return { k, n, delay, cancelled: d.line.product === 'bus' && (n + 6 * d.di) % 13 === 0, plannedKey, plannedStart, start: plannedStart + delay * 1000,
        id: `1|${k}${d.li}${d.di}|0|86|${dmy(plannedStart)}`, fahrtNr: String(1000 + ((((k * 37 + d.li * 101 + d.di * 7) % 9000) + 9000) % 9000)) };
    };
    // the trips whose planned time at the key stop lies between two moments
    const tripsBetween = (d, fromKey, toKey) => {
      const out = [], ev = d.line.every;
      for (let k = Math.floor((fromKey / 60000 - d.o) / ev) - 1, k1 = Math.ceil((toKey / 60000 - d.o) / ev) + 1; k <= k1; k++) out.push(trip(d, k));
      return out;
    };
    const stopObj = (id) => STOPS[id];
    const lineObj = (L, t) => ({ type: 'line', id: L.id, fahrtNr: t ? t.fahrtNr : null, name: L.ref, public: true, ...(t ? { adminCode: 'DEMO--' } : {}),
      productName: KIND[L.product].productName, mode: KIND[L.product].mode, product: L.product, operator: OPERATOR, ...(L.bg ? { color: { fg: L.fg, bg: L.bg } } : {}) });
    const stopover = (d, t, j) => {
      const n = d.stops.length, dl = t.cancelled ? null : t.delay;
      const pa = j > 0 ? t.plannedStart + d.arr[j] * 1000 : null, pd = j < n - 1 ? t.plannedStart + d.dep[j] * 1000 : null;
      const late = (ms) => (ms == null || t.cancelled ? null : ms + t.delay * 1000);
      return { stop: stopObj(d.stops[j].id), arrival: iso(late(pa)), plannedArrival: iso(pa), arrivalDelay: pa == null ? null : dl, arrivalPlatform: null,
        arrivalPrognosisType: pa == null || t.cancelled ? null : 'prognosed', plannedArrivalPlatform: null,
        departure: iso(late(pd)), plannedDeparture: iso(pd), departureDelay: pd == null ? null : dl, departurePlatform: null,
        departurePrognosisType: pd == null || t.cancelled ? null : 'prognosed', plannedDeparturePlatform: null, ...(t.cancelled ? { cancelled: true } : {}) };
    };
    const posNow = (d, t, now) => (t.cancelled ? d.stops[0].p : d.at(where(d, (now - t.start) / 1000).s));

    // GET /stops/:id/departures
    const departures = (id, q, now) => {
      if (!STOPS[id]) return null;
      const from = (q.when && Date.parse(q.when)) || now;
      const dur = Math.max(1, Math.min(1440, +q.duration || 10)) * 60000, max = Math.max(1, Math.round(+q.results || 100));
      const out = [];
      for (const d of DIRS) d.stops.forEach((st, j) => {
        if (st.id !== id || j === d.stops.length - 1) return;
        const rel = (d.arr[j] - d.arr[d.key]) * 1000;   // from the key stop to this one
        for (const t of tripsBetween(d, from - rel - 120000, from + dur - rel)) {
          const plan = t.plannedKey + rel, at = t.cancelled ? null : plan + t.delay * 1000, ref = at == null ? plan : at;
          if (ref < from || ref > from + dur) continue;
          const dep = { tripId: t.id, stop: stopObj(id), when: iso(at), plannedWhen: iso(plan), delay: t.cancelled ? null : t.delay, platform: null, plannedPlatform: null,
            prognosisType: t.cancelled ? null : 'prognosed', direction: d.dest, provenance: null, line: lineObj(d.line, t), remarks: [],
            origin: stopObj(d.stops[0].id), destination: stopObj(d.stops[d.stops.length - 1].id), currentTripPosition: loc(posNow(d, t, now)) };
          if (t.cancelled) dep.cancelled = true;
          out.push([ref, d.li * 10 + d.di, dep]);
        }
      });
      out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      return { departures: out.slice(0, max).map((x) => x[2]), realtimeDataUpdatedAt: Math.floor(now / 1000) };
    };

    // GET /radar: the vehicles in a box now, with where they will be in the next seconds
    const num = (v, dflt) => (v != null && v !== '' && Number.isFinite(+v) ? +v : dflt);
    const radar = (q, now) => {
      const box = { n: num(q.north, 90), s: num(q.south, -90), w: num(q.west, -180), e: num(q.east, 180) };
      const dur = Math.max(1, num(q.duration, 30)), frames = Math.max(1, Math.min(20, Math.round(num(q.frames, 3)))), max = Math.max(1, Math.round(num(q.results, 256)));
      const out = [];
      for (const d of DIRS) {
        if (String(q[d.line.product]) === 'false') continue;
        for (const t of tripsBetween(d, now - (d.total - d.arr[d.key]) * 1000 - 120000, now + d.arr[d.key] * 1000)) {
          const tau = (now - t.start) / 1000;
          if (t.cancelled || tau <= 0 || tau >= d.total) continue;
          const w = where(d, tau), p = loc(d.at(w.s));
          if (p.latitude > box.n || p.latitude < box.s || p.longitude < box.w || p.longitude > box.e) continue;
          const fr = [], feats = [];
          for (let i = 0; i <= frames; i++) {
            const ms = (dur * 1000 * i) / frames, f = where(d, tau + ms / 1000), fp = d.at(f.s);
            fr.push({ origin: stopObj(d.stops[f.o].id), destination: stopObj(d.stops[f.d].id), t: Math.round(ms) });
            feats.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [r5(fp[0] * LON), r5(fp[1] * LAT)] } });
          }
          const last = d.stops.length - 1, idx = [...new Set([0, w.o, w.d, last])].filter((j) => j >= 0 && j <= last).sort((a, b) => a - b);
          out.push({ direction: d.dest, tripId: t.id, line: lineObj(d.line, null), location: p, nextStopovers: idx.map((j) => stopover(d, t, j)),
            frames: fr, polyline: { type: 'FeatureCollection', features: feats } });
        }
      }
      return { movements: out.slice(0, max), realtimeDataUpdatedAt: Math.floor(now / 1000) };
    };

    // GET /trips/:id (not needed by the card, there for completeness)
    const tripInfo = (id, q, now) => {
      const m = /^1\|(\d+)(\d)(\d)\|0\|86\|\d+$/.exec(id), L = m && LINES[+m[2]], d = L && L.dirs[+m[3]];
      if (!d) return null;
      const t = trip(d, +m[1]);
      if (t.id !== id) return null;
      const n = d.stops.length, so = d.stops.map((_, j) => stopover(d, t, j));
      const res = { origin: stopObj(d.stops[0].id), destination: stopObj(d.stops[n - 1].id), departure: so[0].departure, plannedDeparture: so[0].plannedDeparture,
        departureDelay: so[0].departureDelay, arrival: so[n - 1].arrival, plannedArrival: so[n - 1].plannedArrival, arrivalDelay: so[n - 1].arrivalDelay,
        line: lineObj(d.line, t), direction: d.dest, currentLocation: loc(posNow(d, t, now)), arrivalPlatform: null, plannedArrivalPlatform: null,
        arrivalPrognosisType: so[n - 1].arrivalPrognosisType, departurePlatform: null, plannedDeparturePlatform: null, departurePrognosisType: so[0].departurePrognosisType,
        stopovers: so, id };
      if (t.cancelled) res.cancelled = true;
      if (String(q.polyline) === 'true') {
        const pts = d.pts.map((p, i) => [d.cum[i], { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [r5(p[0] * LON), r5(p[1] * LAT)] } }]);
        d.stops.forEach((st) => pts.push([st.s, { type: 'Feature', properties: stopObj(st.id), geometry: { type: 'Point', coordinates: [r5(st.p[0] * LON), r5(st.p[1] * LAT)] } }]));
        res.polyline = { type: 'FeatureCollection', features: pts.sort((a, b) => a[0] - b[0]).map((x) => x[1]) };
      }
      return { trip: res, realtimeDataUpdatedAt: Math.floor(now / 1000) };
    };

    // ---------------------------------------------------------------- Overpass
    // route relations as "out geom(bbox)" sends them: members outside the box without coordinates – except the first node
    // outside next to one inside, so that a segment across the edge stays whole
    const relation = (d, box) => {
      const inBox = (p) => p.lat >= box.s && p.lat <= box.n && p.lon >= box.w && p.lon <= box.e;
      const members = [], all = [];
      for (const st of d.stops) for (const [role, n] of [['stop', st.node], ['platform', st.pf]]) {
        const m = { type: 'node', ref: n.id, role };
        if (inBox(n)) { m.lat = n.lat; m.lon = n.lon; all.push(n); }
        members.push(m);
      }
      const ways = [d.ext[0], ...d.pieces.map(({ w }) => ({ id: w.id, geo: w.el.geometry })), d.ext[1]];
      for (const w of ways) {
        const b = bounds(w.geo), near = !(b.minlat > box.n || b.maxlat < box.s || b.minlon > box.e || b.maxlon < box.w);
        const keep = (p, i, a) => inBox(p) || (i > 0 && inBox(a[i - 1])) || (i < a.length - 1 && inBox(a[i + 1]));
        const g = near ? w.geo.map((p, i, a) => (keep(p, i, a) ? { lat: p.lat, lon: p.lon } : null)) : [];
        g.forEach((p) => p && all.push(p));
        members.push({ type: 'way', ref: w.id, role: '', geometry: g });
      }
      return { type: 'relation', id: d.relId, bounds: bounds(all), members, tags: d.relTags };
    };
    // the query is read as far as the demo needs: the tag filters of its statements ([k], [!k], [k=v], [k!=v], [k~"re"],
    // [k!~"re"], ",i"), the global [bbox:…] and the box of "out geom(…)"; a query without any of that gets the whole town
    const filters = (q) => {
      const out = [], re = /\b(node|way|rel|relation|nwr)\s*(?:\([^)]*\)\s*)*((?:\[[^\]]*\]\s*)+)/g;
      let m;
      while ((m = re.exec(q))) {
        const tests = [], fr = /\[([^\]]*)\]/g;
        let f;
        while ((f = fr.exec(m[2]))) {
          const x = /^\s*(!?)\s*"?([^"=!~]+?)"?\s*(?:(=|!=|~|!~)\s*"?(.*?)"?\s*(,\s*i)?)?\s*$/.exec(f[1]);
          if (!x) continue;
          const [, not, key, op, val, ci] = x;
          let rx = null;
          if (op === '~' || op === '!~') try { rx = new RegExp(val, ci ? 'i' : ''); } catch (e) { rx = /$^/; }
          tests.push((t) => {
            const has = Object.prototype.hasOwnProperty.call(t, key), v = has ? String(t[key]) : null;
            if (!op) return not ? !has : has;
            if (op === '=') return v === val;
            if (op === '!=') return v !== val;
            return (has && rx.test(v)) === (op === '~');
          });
        }
        out.push({ kind: m[1] === 'way' ? 'way' : m[1] === 'node' ? 'node' : m[1] === 'nwr' ? 'any' : 'relation', tests });
      }
      return out;
    };
    const BOX = (re, q) => { const g = re.exec(q); return g ? { s: +g[1], w: +g[2], n: +g[3], e: +g[4] } : null; };
    const overpass = (query, now) => {
      const q = String(query || ''), st = filters(q);
      const wanted = (e) => !st.length || st.some((x) => (x.kind === 'any' || x.kind === e.type) && x.tests.every((t) => t(e.tags)));
      const N4 = '\\s*([-\\d.]+)\\s*,\\s*([-\\d.]+)\\s*,\\s*([-\\d.]+)\\s*,\\s*([-\\d.]+)\\s*';
      const area = BOX(new RegExp(`\\[\\s*bbox\\s*:${N4}\\]`), q), clip = BOX(new RegExp(`out[^;]*?geom\\s*\\(${N4}\\)`), q) || area || COVER;
      const meets = (b) => !area || !b || !(b.minlat > area.n || b.maxlat < area.s || b.minlon > area.e || b.maxlon < area.w);
      const elements = MAP.filter((e) => wanted(e) && meets(e.bounds));
      DIRS.forEach((d) => { if (wanted({ type: 'relation', tags: d.relTags })) elements.push(relation(d, clip)); });
      return { version: 0.6, generator: 'demo', osm3s: { timestamp_osm_base: new Date(now).toISOString().replace(/\.\d+Z$/, 'Z'), copyright: 'Made-up demo town, not OpenStreetMap data.' }, elements };
    };

    // ---------------------------------------------------------------- requests
    const dec = (s) => { try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); } catch (e) { return String(s); } };
    const params = (s) => {
      const o = {};
      String(s || '').replace(/^\?/, '').split('&').forEach((kv) => { if (!kv) return; const i = kv.indexOf('='); o[dec(i < 0 ? kv : kv.slice(0, i))] = i < 0 ? '' : dec(kv.slice(i + 1)); });
      return o;
    };
    const nf = (error = 'not simulated') => ({ status: 404, json: { error } });
    const handle = (method, url, body, nowMs) => {
      const m = /^(?:https?:)?\/\/([^/?#]+)([^?#]*)(\?[^#]*)?/i.exec(String(url || ''));
      if (!m) return nf();
      const host = m[1].toLowerCase(), path = (m[2] || '/').replace(/\/+$/, '') || '/', q = params(m[3]), now = Number.isFinite(+nowMs) ? +nowMs : Date.now();
      const verb = String(method || 'GET').toUpperCase();
      try {
        if (host === HOST_OVP) {
          if (path !== '/api/interpreter') return nf();
          const data = verb === 'POST' ? params(typeof body === 'string' ? body : body == null ? '' : String(body)).data : q.data;
          return { status: 200, json: overpass(data, now) };
        }
        if (host !== HOST_API || verb !== 'GET') return nf();
        let r = null, x;
        if ((x = /^\/stops\/([^/]+)$/.exec(path))) r = STOPS[dec(x[1])] || null;
        else if ((x = /^\/stops\/([^/]+)\/departures$/.exec(path))) r = departures(dec(x[1]), q, now);
        else if (path === '/radar') r = radar(q, now);
        else if ((x = /^\/trips\/([^/]+)$/.exec(path))) r = tripInfo(dec(x[1]), q, now);
        return r ? { status: 200, json: r } : nf();
      } catch (e) {
        return { status: 500, json: { error: String((e && e.message) || e) } };
      }
    };

    return {
      API, OVERPASS, handle,
      city: { name: N('Demo Town', 'Musterstadt'), bbox: { south: COVER.s, west: COVER.w, north: COVER.n, east: COVER.e }, center: { lat: 0, lon: 0 },
        elements: MAP, overpass: (query, nowMs) => overpass(query, nowMs || Date.now()), issues: ISSUES },
      lines: LINES.map((L) => ({ id: L.id, ref: L.ref, product: L.product, every: L.every, offset: L.off, color: L.bg ? { fg: L.fg, bg: L.bg } : null,
        directions: L.dirs.map((d) => ({ direction: d.dest, offset: d.o, relation: d.relId, key: d.key, length: Math.round(d.cum[d.cum.length - 1]), duration: d.total,
          stops: d.stops.map((st, j) => ({ id: st.id, name: st.name, s: Math.round(st.s), arr: d.arr[j], dep: d.dep[j], node: st.node.id })) })) })),
      stops: STOPS,
    };
  }

  // fetch() to the two demo addresses is answered by the simulator, after a short pause like a real answer
  function installFetch() {
    if (typeof G.fetch !== 'function' || G.fetch.__gfcTransit) return;
    const orig = G.fetch;
    const ours = (url) => /^(?:https?:)?\/\/(transit|overpass)\.demo\.invalid(?:[/?#:]|$)/i.test(url);
    const bodyText = (b) => {
      if (b == null) return '';
      if (typeof b === 'string') return b;
      if (typeof URLSearchParams === 'function' && b instanceof URLSearchParams) return b.toString();
      if (typeof FormData === 'function' && b instanceof FormData) return `data=${encodeURIComponent(String(b.get('data') || ''))}`;
      return String(b);
    };
    const wrapped = function (input, init) {
      const opt = init || {};
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      if (!ours(url)) return orig.apply(this, arguments);
      const method = String(opt.method || (input && input.method) || 'GET').toUpperCase();
      const signal = opt.signal || (input && input.signal);
      const body = opt.body != null ? Promise.resolve(bodyText(opt.body))
        : input && typeof input === 'object' && typeof input.clone === 'function' && method !== 'GET' && method !== 'HEAD' ? input.clone().text() : Promise.resolve('');
      return body.then((text) => new Promise((resolve, reject) => {
        const abort = () => reject(typeof DOMException === 'function' ? new DOMException('The operation was aborted.', 'AbortError') : new Error('AbortError'));
        if (signal && signal.aborted) return abort();
        const r = G.GFC_TRANSIT_SIM.handle(method, url, text, Date.now());
        const onAbort = () => { clearTimeout(timer); abort(); };
        const timer = setTimeout(() => {
          if (signal) signal.removeEventListener('abort', onAbort);
          resolve(new Response(JSON.stringify(r.json), { status: r.status, headers: { 'content-type': 'application/json' } }));
        }, 120);
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
      }));
    };
    wrapped.__gfcTransit = true;
    G.fetch = wrapped;
  }
})();
