# Changelog

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
- English and German
