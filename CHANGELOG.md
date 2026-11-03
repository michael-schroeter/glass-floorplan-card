# Changelog

## 0.2.0

Everything from v0.1.0 keeps working – updating adds to your card, your floor plan stays as it is.

**New**
- **Actions** for every device: `tap_action`, `hold_action`, `double_tap_action` (the Home Assistant ones, with confirmation), also inside room pop-ups
- **Own tiles** beside the plan: values of your choice, **buttons** like the ones on the plan, or any Home Assistant card in the glass look
- **Laptop and phone arranged separately** (`widgets` / `mobile.widgets`); on the phone, the layer card and layer bar can sit below or inside the plan
- Layer card in **three sizes** (`size: normal | small | mini`) that leave out what does not fit; layer bar vertical or horizontal
- **Departures** layer: the next trains and buses of your stops on a glass board (VBB / BVG, directly or from the VBB/BVG integration's sensors)
- **Live map** layer (`departures.map`): your stops' buses and trains moving on a glass map of the streets around you (OpenStreetMap)

**Editor**
- A clear way through – three ways to start side by side, numbered steps for a template picture (scale, then rooms), a **Next** button at the end of every step and **Done** after the devices
- While the plan itself is built (template, rooms, furniture, windows), no devices are shown; at **Devices** every linked area's devices are in their room by themselves (once – what you remove stays away, undo takes them back)
- A room linked to an area takes the area's name (rename it as you like – linking again names it again). Rooms are linked by name on import and when you type a name, also across languages (*Living* ↔ *Wohnzimmer*)
- Import without an extra question when nothing is drawn yet
- After an import with an estimated size only the size check shows, then it goes on to Rooms; a plan with devices opens at Devices
- Without a template, dragging a room moves it; new rooms are drawn on free space
- **Typical furniture** in one click for rooms without furniture (bed, sofa and TV, kitchen, bath …)
- Floor plan files may say where lamps and devices are (`devices`, without entity ids) – they go onto the matching devices of the room's area
- Claude skill: asks where furniture and devices are and whether to add typical furniture before it builds the file
- Opens again the way you left it: tool, phone or laptop view, selection, the size check after an import and an import still waiting
- The template picture only shows once you choose it. Before, a picture loaded earlier (for any card) could show up under an imported plan
- English by default wherever Home Assistant's language is unknown; the demo starts in English, the example sketch and skill examples are English

## 0.1.0 – first version

- Glass floor plan with rooms, furniture, windows, passages and front door (centimetres, edge-to-edge rooms)
- Layers: light (with media + front door), climate, covers, Roborock vacuum, own layers combining categories and single entities
- Room pop-ups (lights, colour, media, thermostat dial, cover tiles, device rows, helper sliders), weather, front door slider, modes from a label
- Phone layout in the same card (plan turned upright, layer bar at the bottom, sheets)
- Automatic layout of info tiles in free corners, otherwise a side column / row; markers of a layer never overlap
- Visual floor plan editor: template picture with scale, automatic room + passage detection, rooms from Home Assistant areas, furniture palette, windows/doors on walls, devices by drag & drop, layers, live preview, undo/redo
- Link Home Assistant areas to rooms by dragging, tapping or automatically by name
- Import a `.floorplan.json` file or pasted text (with a size check), export the floor plan
- Claude skill `floorplan-setup`: a picture of a floor plan in, a ready-to-import file out
- The editor shows the real card live at the real screen size (laptop / phone); tap a lamp to edit it, lights on / off / real
- Built-in layers take extra entities (picker with search, by area or label); the light layer lists lamps only
- English and German
