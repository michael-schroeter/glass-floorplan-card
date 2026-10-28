# Configuration

← [Back to the README](../README.md)

Everything can be set in the floor plan editor. This page walks through it and is the reference for the YAML it writes.

## The editor step by step

1. Create a dashboard view of type **Panel** (best) or **Sections**, then add the card *Glass Floorplan Card*. It starts empty.
2. In the card editor, click **Open floor plan editor**. It shows your card live, at the size of your screen (switch between *Laptop* and *Phone* at the top). Tapping a lamp there opens its settings instead of switching it.
3. **Template**: pick one of three ways – load a picture of your floor plan (**1 · Scale**: measure one wall, **2 · Rooms**: **Find rooms automatically** or trace them), import a file from the [Claude skill](claude-skill.md), or start with one room per Home Assistant area. **Next** at the bottom of every step leads on. **Start over** (bottom left) empties everything. The editor opens again the way you left it. A template picture only shows once you choose it, and it stays in this browser.
4. **Rooms**: rooms named like an area are linked by themselves (on import and when you type a name, also across languages: *Living* ↔ *Wohnzimmer*); drag any other area onto its room. A linked room takes the area's name – rename it as you like, linking again names it again. Without a template, drag a room to move it and draw new ones on free space. While you build the plan (template, rooms, furniture, windows) devices stay hidden.
5. **Furniture**, **Windows & doors**: optional, purely for the looks. *Add typical furniture* fills empty rooms by their kind (bed, sofa and TV, kitchen, bath …).
6. **Devices**: every linked area's devices are in their room already (once – what you remove stays away; lamps and the TV where a floor plan file says). Drag to move, tap for settings, drag more from the list. Under *More entities* any other entity can join a built-in layer (search, by area or label). The front door opener and doorbell are set under **Tiles**.
   In a device's settings, **Actions** sets what tapping, holding and double tapping do – the same choices as everywhere in Home Assistant (toggle, more info, open a dashboard page or website, perform any action …). Inside Home Assistant this is Home Assistant's own action editor. *Default* keeps the card's own behaviour.
7. **Layers**: switch built-in layers on or off, or create your own, e.g. *Night = Light + Covers + front door lock + window contacts*.
8. **Tiles**: weather, inside climate, front door – and **your own tiles**: a few values of your choice (the first one large, e.g. power now + energy today) or **any Home Assistant card** (camera, graph, thermostat, a card from HACS …) in a glass frame. They find a free corner of the plan like the others; drag them to place them yourself.
9. Click **Done**, then **Save**.

## Modes

Give scenes or scripts the label **Dashboard mode** (or `Dashboard-Modus`) in Home Assistant. They appear under *Mode* with their name and icon. A leading number (`1 Evening`) only sets the order.

## Vacuum (Roborock)

Only the vacuum entity is needed. Status, battery, current room, cleaning mode and mop intensity are found on the same device. Rooms are cleaned with `vacuum.clean_area` using the rooms' Home Assistant areas. Without areas, the card falls back to Roborock segment ids (`roborock.get_maps` + `app_segment_clean`). The robot's room names are matched to your rooms by name, or mapped in the editor. Other brands may work for start/stop, but are not targeted yet.

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
modes_label: Dashboard mode
layout: auto               # auto | desktop | mobile
fit: screen                # screen (fill the visible height) | width
mobile: { rotate: auto }   # auto | 0 | 90 | -90
widgets:                   # optional fixed positions of the tiles (normally automatic)
  card: [0, 660, 580, 900]
  energy: [580, 660, 760, 900]   # own tiles by their id
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
| `tap_action`, `hold_action`, `double_tap_action` | What tapping, holding and double tapping the button do, in [Home Assistant's action schema](https://www.home-assistant.io/dashboards/actions/): `toggle`, `more-info`, `navigate`, `url`, `perform-action`, `assist`, `fire-dom-event`, `none`, each with an optional `confirmation`. Without them: a tap switches lamps and switches, moves covers, runs scenes and opens the room for everything else; holding opens the room. A hold action also applies in the room pop-up (instead of the device page). |

| Tile option | Meaning |
|---|---|
| `id` | Name for its position under `widgets` (the editor sets it) |
| `name`, `icon` | Title and symbol. Default: the first value's name and symbol. |
| `entities` | Values: entity ids or `{ entity, name }`. The first one is shown large. A tap opens its info dialog, holding its device page. |
| `card` | Any Home Assistant card instead of values. It keeps its own look, without its background. |
| `size` | `[width, height]` in tiles |
| `tap_action`, `hold_action`, `double_tap_action` | As for entities |

Furniture kinds: `sofa armchair bed bed_single table round_table chair desk wardrobe shelf sideboard tv counter fridge bath shower toilet sink washer plant rug stairs block`. A `tv` piece glows while a media player in the room is on.

