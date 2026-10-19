---
name: floorplan-setup
description: Set up the Glass Floorplan Card for Home Assistant from a photo, screenshot or sketch of a floor plan plus the user's Home Assistant entities. Produces a ready card configuration (YAML) with rooms, windows, doors, furniture, placed devices and layers. Use when someone wants to build their floor plan dashboard with this card, asks to convert a floor plan image into the card config, or wants help placing lamps, thermostats, covers or a Roborock vacuum on the plan.
---

# Floor plan setup for the Glass Floorplan Card

Goal: turn **a picture of a floor plan** and **the user's Home Assistant entities** into a configuration for
`custom:glass-floorplan-card`. The user then pastes it into the card (YAML mode) and fine-tunes everything in the
card's visual editor (*Open floor plan editor*).

Read-only rule: never change anything in Home Assistant. Reading states, areas and entities is fine; never call
services that switch devices, never create or edit automations, scenes, helpers or dashboards unless the user
explicitly asks for that specific change.

## 1. Collect the inputs

1. **Floor plan picture.** It can be an architect plan, a screenshot from a real-estate listing, or a hand sketch. Ask for one
   real length if no dimensions are printed (e.g. "the living room is 4.5 m wide").
2. **Entities by area.** Use one of these sources:
   - With a Home Assistant MCP server or API access: list areas and their entities (read-only).
   - Without access: ask the user to paste the output of this template from *Developer tools → Template*:

```jinja
{% for a in areas() %}## {{ a }} | {{ area_name(a) }}
{% for e in area_entities(a) | select('match', '^(light|climate|cover|media_player|vacuum|sensor|binary_sensor|switch|fan|lock|button|event|input_number)\\.') | list %}{{ e }} | {{ state_attr(e, 'friendly_name') }} | {{ state_attr(e, 'device_class') }}
{% endfor %}{% endfor %}
```

3. Optional preferences: language (`en`/`de`), which layers they want, a front door opener or doorbell, a Roborock vacuum,
   and own layers (e.g. *Night = lights + covers + front door lock + window contacts*).

## 2. Geometry (centimetres)

- Coordinates are **centimetres** with x to the right and y downwards. The origin is the top-left corner of the outer walls.
- Work out the scale: pixels per cm from a printed dimension or the length the user gave you. Measure along the **wall centre lines**.
- **Rooms** are axis-aligned rectangles `rect: [x1, y1, x2, y2]` and are stored **edge to edge**. Neighbouring rooms share
  exactly the same coordinate on the common wall, with no gaps or overlaps, because the card draws the wall gaps itself. Round to 5 cm.
  - Split L-shaped rooms into two rectangles with the same name plus " 2", or use the larger part.
  - Hallways and corridors are rooms too, since the vacuum drives through them.
  - Balconies and terraces are optional rooms.
- **Windows** are segments on outer walls: `[x1, y, x2, y]` (horizontal wall) or `[x, y1, x, y2]` (vertical wall).
  The coordinate must lie exactly on the room edge.
- **Doors / passages** (`doors:`) are segments on the shared wall between two rooms, usually 80–100 cm. They show the vacuum its route.
- **Entrance** (`entrance:`) is one segment on the outer wall with the front door.
- **Furniture** (optional, only for the looks): `[x1, y1, x2, y2, kind]` inside its room. Kinds and typical sizes (cm):
  `sofa 220×90, armchair 85×85, bed 180×200, bed_single 90×200, table 160×90, round_table 110, chair 46, desk 140×70,
  wardrobe 200×60, shelf 100×36, sideboard 160×45, tv 130×14, counter 240×62, fridge 62×66, bath 170×75, shower 90×90,
  toilet 40×62, sink 60×46, washer 60×60, plant 50, rug 200×140, stairs 100×260`. Rotate by swapping width and depth.
  Keep the top-left ~170 × 90 cm of every room free, because the room name sits there (or set `label: bottom`).

## 3. Devices

- Give every room its Home Assistant area: `area: <area_id>`. The vacuum and the editor's auto placement use it.
- Place devices with `at: [x, y]` inside their room. Spread them out at least ~70 cm apart, close to their real
  position (ceiling light near the centre, bedside lamps at the bed, TV at the TV furniture, thermostats on an
  outer wall below a window, covers just inside their window).
- Light symbols (`icon:`): `ceiling`, `chandelier`, `pendant`, `lamp`, `floorlamp`, `desklamp`, `strip`, `spot`
  (with `beams: 3` for spot cones), `wall`, `sprout`, `candle`, `bulb`. You can add `watt:` for the power estimate.
- Leave out light groups whose members are already placed, or add them with `plan: false`.
- Climate: `climate.*` thermostats, plus `sensor.*` with device class temperature/humidity for rooms without a thermostat.
- Covers: `cover.*` near their window, so a closed cover darkens that window on the plan.
- Front door: `door: { open: button.…|lock.…, doorbell: event.…|binary_sensor.…, at: [x, y] }`, placed in the hallway near the `entrance`.
- Vacuum (Roborock only): `vacuum: { entity: vacuum.…, dock: [x, y] }`. If the robot's room names differ from the room
  names, add `rooms: { "<robot room name>": <room id> }`.
- Other entities (locks, window contacts, motion sensors, switches, fans, sensors) only appear in **own layers**.

## 4. Layers

```yaml
layers:
  - light        # lights + media + front door
  - climate
  - cover
  - vacuum       # only with a vacuum
  - name: Night
    icon: moon
    show: [light, cover]           # whole categories: light, media, door, climate, cover
    entities: [lock.front_door, binary_sensor.living_room_window]
```

Leave out layers without content. Keep it to at most 5–6 layers.

## 5. Output

1. Give the complete YAML in **one** code block, starting with `type: custom:glass-floorplan-card`. Use flow style
   for coordinate lists (`rect: [0, 0, 450, 400]`). Never invent entity ids: use only ids from the user's list.
2. Below it, add a short checklist: what was assumed (scale, uncertain rooms, guessed positions) and what to check in the
   editor (*Open floor plan editor → Devices*).
3. Tell the user how to apply it: edit the card → *Show code editor* → paste → *Save*. Then fine-tune in the visual
   editor, where markers can be dragged, rooms resized and furniture added.

## Example (small flat, 10 × 7 m)

```yaml
type: custom:glass-floorplan-card
language: en
rooms:
  - { id: living, name: Living room, area: living_room, rect: [0, 0, 560, 430],
      furniture: [[40, 250, 130, 410, sofa], [200, 280, 290, 370, round_table], [520, 260, 545, 390, tv]] }
  - { id: bedroom, name: Bedroom, area: bedroom, rect: [560, 0, 1000, 430], furniture: [[700, 40, 880, 240, bed]] }
  - { id: kitchen, name: Kitchen, area: kitchen, rect: [0, 430, 380, 700], furniture: [[10, 520, 72, 690, counter]] }
  - { id: bathroom, name: Bathroom, area: bathroom, rect: [380, 430, 700, 700], furniture: [[390, 600, 560, 680, bath]] }
  - { id: hallway, name: Hallway, area: hallway, rect: [700, 430, 1000, 700] }
windows: [[120, 0, 420, 0], [640, 0, 900, 0]]
doors: [[150, 430, 240, 430], [420, 430, 500, 430], [760, 430, 850, 430], [560, 220, 560, 300]]
entrance: [1000, 600, 1000, 680]
entities:
  - { entity: light.living_room_ceiling, at: [280, 210], icon: chandelier, watt: 20 }
  - { entity: light.bedroom_ceiling, at: [780, 300], icon: ceiling }
  - { entity: light.kitchen, at: [200, 560], icon: ceiling }
  - { entity: light.hallway, at: [850, 560], icon: spot, beams: 3 }
  - { entity: climate.living_room, at: [300, 40] }
  - { entity: cover.living_room, at: [200, 60] }
door: { open: button.front_door_open, at: [940, 640] }
layers: [light, climate, cover]
```
