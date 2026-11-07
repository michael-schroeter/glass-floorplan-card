# Configuration

← [Back to the README](../README.md)

Everything can be set in the floor plan editor. This page walks through it and is the reference for the YAML it writes.

## The editor step by step

1. Create a dashboard view of type **Panel** (best) or **Sections**, then add the card *Glass Floorplan Card*. It starts empty.
2. In the card editor, click **Open floor plan editor**. It shows your card live, at the size of your screen (switch between *Laptop* and *Phone* at the top). Tapping a lamp there opens its settings instead of switching it.
3. **Template**: pick one of three ways – load a picture of your floor plan (**1 · Scale**: measure one wall, **2 · Rooms**: **Find rooms automatically** or trace them), import a file from the [Claude skill](claude-skill.md), or start with one room per Home Assistant area. **Next** at the bottom of every step leads on. **Start over** (bottom left) empties everything. The editor opens again the way you left it. A template picture only shows once you choose it, and it stays in this browser.
4. **Rooms**: rooms named like an area are linked by themselves (on import and when you type a name, also across languages: *Living* ↔ *Wohnzimmer*); drag any other area onto its room. A linked room takes the area's name – rename it as you like, linking again names it again. Without a template, drag a room to move it and draw new ones on free space. While you build the plan (template, rooms, furniture, windows) devices stay hidden.
5. **Furniture**, **Windows & doors**: optional, purely for the looks. *Add typical furniture* fills empty rooms by their kind (bed, sofa and TV, kitchen, bath …). Tap a window or the front door to pick its **contact** – see [Window and door contacts](#window-and-door-contacts).
6. **Devices**: every linked area's devices are in their room already (once – what you remove stays away; lamps and the TV where a floor plan file says). Drag to move, tap for settings, drag more from the list. Under *More entities* any other entity can join a built-in layer (search, by area or label). The front door opener and doorbell are set under **Tiles**.
   In a device's settings, **Actions** sets what tapping, holding and double tapping do – the same choices as everywhere in Home Assistant (toggle, more info, open a dashboard page or website, perform any action …). Inside Home Assistant this is Home Assistant's own action editor. *Default* keeps the card's own behaviour.
7. **Layers**: switch built-in layers on or off, or create your own, e.g. *Night = Light + Covers + front door lock + window contacts*.
8. **Tiles**: weather, inside climate, front door – and **your own tiles**: a few values of your choice (the first one large, e.g. power now + energy today), **buttons** like the ones on the plan (each switches a device of your choice or runs its own action, e.g. *open a dashboard page*; a larger tile holds more buttons) or **any Home Assistant card** (camera, graph, thermostat, a card from HACS …) in a glass frame. They find a free corner of the plan like the others; drag them to place them yourself.
   The **layer card** (the overview with *Mode* and *All off*) comes in three sizes – *normal*, *small* (round buttons beside the state), *smaller* (without the strip as well) – and leaves out what does not fit; the **layer bar** is *vertical* or *horizontal*. Laptop and phone are arranged separately (*Arranging for* at the top of the list): on a phone the layer card sits below the plan and the layer bar at the bottom of the screen until you put them into the plan.
9. Click **Done**, then **Save**.

## Window and door contacts

A window or door contact shows **on its window**, not as a button: when the window is open, its sash glows orange and swings into the room (a wide window as two sashes, the front door wide open and its frame orange too). A tilted window shows its sash a little inside, parallel to the frame. The window line itself keeps showing the shutter: bright when open, a dark slat when closed. This works in every layer. Tap the window for the contact's details.

- **Automatic**: a `binary_sensor` with the device class `window`, `door`, `garage_door` or `opening`, or a handle sensor that reports `open` / `tilted` / `closed`, sits on the drawn window (or front door) nearest to it in its room. A door contact prefers the front door, a window contact a window. When the editor places the devices of your areas, it puts contacts straight onto a free window of their room.
- **By hand**: in the editor, tap a window and choose its *Contact*, or drag a contact onto another window. In a device's settings, *Assign to window / door* is *Automatic*, *On* (any entity, e.g. a sensor without a device class, onto the nearest window) or *Off* (a normal button in its layers). In YAML that is `opening: true` / `opening: false`.
- A contact in a room without a drawn window stays a button. Draw the window under **Windows & doors** and it moves there.
- **Devices that open something** can show there too (*On*): a door opener (button) swings the door open in green for a minute after it was pressed, a lock while it reports *open*, a switch (e.g. a window drive) while it is on. Like contacts they show only there, without a round button.

## Modes

Give scenes or scripts the label **Dashboard mode** (or `Dashboard-Modus`) in Home Assistant. They appear under *Mode* with their name and icon. A leading number (`1 Evening`) only sets the order.

## Vacuum (Roborock)

Only the vacuum entity is needed. Status, battery, current room, cleaning mode and mop intensity are found on the same device. Rooms are cleaned with `vacuum.clean_area` using the rooms' Home Assistant areas. Without areas, the card falls back to Roborock segment ids (`roborock.get_maps` + `app_segment_clean`). The robot's room names are matched to your rooms by name, or mapped in the editor. Other brands may work for start/stop, but are not targeted yet.

## Departures (Berlin and Brandenburg)

A layer with the next trains and buses at stops nearby – a view of its own: the plan, the tiles and the layer card make way, only the layer bar stays. Each stop is a glass card with its lines in their own colours, each direction with an arrow, the next departure large and the ones after it; late ones in orange, cancelled ones struck through. Set it up in YAML:

```yaml
departures:
  stops:
    - { id: 900100003, name: Alexanderplatz, lines: [U2, U5, U8] }   # fetched by the card (public VBB interface)
    - { entity: sensor.my_stop, name: Market }                       # or a sensor of the integration below
  per: 3                     # departures per line and direction (1–5)
```

| Stop option | Meaning |
|---|---|
| `id` | VBB stop id. The card asks the public [VBB transport.rest](https://v6.vbb.transport.rest/) interface every 30 s while the layer is shown. Find ids with `https://v6.vbb.transport.rest/locations?query=…` |
| `entity` | Instead of `id`: a sensor of the integration [Berlin (BVG) and Brandenburg (VBB) transport](https://github.com/vas3k/home-assistant-berlin-transport) (attribute `departures`) – then Home Assistant fetches, not every browser |
| `name` | Name on the board |
| `lines`, `exclude` | Only these lines / not these lines, e.g. `[U2, 142]` |

The layer appears by itself; if you list your `layers`, add `departures` there.

### Live map

A second view of the same stops: the streets around them drawn like the floor plan – blocks as glass tiles, parks and water tinted, the nearby streets named – with the lines of the stops, each direction on its own side of the street, and every bus and train live on its way. Each side of a stop shows what comes next there (the arrow is the direction of travel on that side); a station under the street gets one plate with a row per direction – its arrow, where it goes and the minutes. Vehicles still out of view wait as a hint at the edge where they will come in. Tap a stop's minutes for the next three departures of every line and direction there.

```yaml
departures:
  stops:
    - { id: 900100003, name: Alexanderplatz, lines: [U2, U5] }
  map: true                  # or { radius: 300 } – metres of street around the stops that are always in view
```

| Map option | Meaning |
|---|---|
| `radius` | Metres around the stops that are always in view (default 300; a phone shows a little less) |
| `overpass` | Overpass server for the map (default `https://overpass-api.de/api/interpreter`) |
| `attribution` | Another source note than “© OpenStreetMap contributors” (only for other map data) |
| `center` | The middle of the view: `home` (Home Assistant's home location) or `[lat, lon]`; without it the middle between the stops. The stops stay in view; the map data are still asked for around the stops |

- Only stops with an `id` are on the map. `at: [lat, lon]` on a stop moves it, if the timetable's position is off.
- The map data come from [OpenStreetMap](https://www.openstreetmap.org/copyright) through the Overpass API: the browser asks once for the area around your stops (so the Overpass server sees that area) and keeps the result for 30 days. The vehicles are where the departures (every 30 s while the map is shown) say they are; the card moves them on so that each reaches the stop at its time – nothing else is fetched.
- Positions are estimated from the timetable and live delays between stops (no GPS); the subway's even more so – its line is dashed.
- The layer appears by itself; with your own `layers` list add `departures_map`.

## YAML

The editor writes everything for you. For reference, all coordinates are **centimetres**, with x to the right and y downwards. Rooms are stored edge to edge, and the card draws the wall gaps itself.

```yaml
type: custom:glass-floorplan-card
language: auto            # auto (Home Assistant's language, otherwise English) | en | de
rooms:
  - id: living
    name: Living room
    area: living_room     # Home Assistant area id (vacuum, auto placement)
    rect: [0, 320, 580, 660]    # x1, y1, x2, y2
    label: bottom         # room name at the top (default) or bottom
    furniture:
      - [70, 580, 290, 652, sofa]      # x1, y1, x2, y2, kind
      - [100, 430, 180, 520, round_table]
  - id: hallway
    name: Hall
    area: hallway
    rect: [580, 420, 1180, 560]
    helpers: [input_number.hallway_night_brightness]   # sliders in the pop-up
windows: [[100, 660, 480, 660], [0, 400, 0, 600]]     # segments on walls
doors: [[580, 460, 580, 540]]                         # passages between rooms
entrance: [1180, 450, 1180, 530]                      # front door on an outer wall
entities:
  - entity: light.living_room_ceiling
    at: [300, 470]        # position on the plan
    icon: chandelier      # glass symbol or mdi:… icon
    watt: 24              # rated power for the estimate
  - { entity: light.hallway_spot_1, at: [660, 490], icon: spot, beams: 3, kelvin: 3400 }
  - { entity: light.living_room_ceiling_2, at: [300, 470], plan: false }   # glow + tile, no button
  - { entity: media_player.living_room_tv, at: [210, 392] }
  - { entity: climate.living_room, at: [250, 630] }
  - { entity: cover.living_room_left, at: [50, 500] }
  - { entity: binary_sensor.living_room_window, at: [15, 500] }   # a contact: shows on the nearest window of its room
  - entity: lock.front_door
    at: [1140, 490]
    tap_action: { action: toggle, confirmation: true }   # Home Assistant's action schema
    hold_action: { action: more-info }
layers:
  - type: light                          # a built-in layer …
    entities: [media_player.living_room_tv]   # … plus any extra entities (TV, switch, sensor …)
  - climate
  - cover
  - vacuum
  - name: Night
    icon: moon
    show: [light, cover]                 # whole categories: light, media, door, climate, cover
    entities: [lock.front_door, binary_sensor.living_room_window]
door: { open: button.front_door_open, doorbell: event.front_door_doorbell, at: [1140, 490] }
vacuum:
  entity: vacuum.roborock_s8
  dock: [960, 536]
  rooms: { "Wohnzimmer": living }        # optional: robot room name → room id
weather: weather.home      # default: first weather entity; false hides the tile
indoor: [sensor.kitchen_temperature]   # default: all placed climate entities; false hides the tile
tiles:                     # own tiles
  - id: energy
    name: Energy
    icon: bolt
    entities: [sensor.home_power, { entity: sensor.energy_today, name: Today }]   # the first one large
    tap_action: { action: navigate, navigation_path: /energy }
  - id: camera
    card: { type: picture-entity, entity: camera.front_door }   # any Home Assistant card
    size: [1, 2]           # width, height in tiles (a card: 2 high by default)
  - id: living
    name: Living room      # optional heading
    buttons:               # three per tile of width, one row per tile of height
      - light.living_room_ceiling
      - { entity: scene.movie_time, name: Movie, icon: tv }
      - { name: Energy, icon: bolt, tap_action: { action: navigate, navigation_path: /energy } }
    size: [1, 1]
modes_label: Dashboard mode
layout: auto               # auto | desktop | mobile
fit: screen                # screen (fill the visible height) | width
widgets:                   # laptop: optional fixed positions of the tiles (normally automatic)
  card: { rect: [0, 660, 580, 900], size: small }     # the layer card: normal | small | mini; a bare [x1, y1, x2, y2] is fine too
  bar: { direction: horizontal }                      # the layer bar: vertical (default) | horizontal
  energy: [580, 660, 760, 900]                        # own tiles by their id
mobile:
  rotate: auto             # auto | 0 | 90 | -90
  widgets:                 # phone: its own places, in the turned plan (the editor sets them)
    card: { place: plan, size: mini }      # below (default) | plan – a rect puts it into the plan as well
    bar: { place: plan, direction: vertical }   # bottom (default) | plan; horizontal by default
```

| Entity option | Meaning |
|---|---|
| `at` | Position in cm. Without `at`, the entity only appears in its room's pop-up (`room:` needed). |
| `room` | Room id. By default it is the room under the marker. |
| `name`, `icon` | Override the name and symbol. Symbols include `bulb`, `ceiling`, `chandelier`, `pendant`, `lamp`, `floorlamp`, `desklamp`, `strip`, `spot`, `wall`, `sprout`, `candle`, `plug`, `fan`, `lock`, `blinds`, `thermo` …, or any `mdi:` icon. |
| `watt`, `power` | Rated power (estimate × brightness) or a power sensor |
| `kelvin`, `color` | Display colour for lamps without colour information |
| `beams` | 1–6 light cones (spots) instead of a round glow |
| `reach` | Glow radius in cm |
| `plan: false` | No button on the plan (glow and pop-up tile only) |
| `opening` | Window and door contacts: shown on the nearest window / front door of their room automatically. `true` puts any entity there (door opener, lock, switch …), `false` keeps it a round button. |
| `tap_action`, `hold_action`, `double_tap_action` | What tapping, holding and double tapping the button do, in [Home Assistant's action schema](https://www.home-assistant.io/dashboards/actions/): `toggle`, `more-info`, `navigate`, `url`, `perform-action`, `assist`, `fire-dom-event`, `none`, each with an optional `confirmation`. Without them: a tap switches lamps and switches, moves covers, runs scenes and opens the room for everything else; holding opens the room. A hold action also applies in the room pop-up (instead of the device page). |

| Tile option | Meaning |
|---|---|
| `id` | Name for its position under `widgets` (the editor sets it) |
| `name`, `icon` | Title and symbol. Default: the first value's name and symbol. |
| `entities` | Values: entity ids or `{ entity, name }`. The first one is shown large. A tap opens its info dialog, holding its device page. |
| `buttons` | Buttons instead of values: entity ids or `{ entity, name, icon, tap_action, hold_action, double_tap_action }` – without an entity only the action. A tap switches the device like on the plan (lamps, switches, covers, scenes …, else its info), holding opens its device page. |
| `card` | Any Home Assistant card instead of values. It keeps its own look, without its background. |
| `size` | `[width, height]` in tiles |
| `tap_action`, `hold_action`, `double_tap_action` | As for entities |

Furniture kinds: `sofa armchair bed bed_single table round_table chair desk wardrobe shelf sideboard tv counter fridge bath shower toilet sink washer plant rug stairs block`. A `tv` piece glows while a media player in the room is on.

