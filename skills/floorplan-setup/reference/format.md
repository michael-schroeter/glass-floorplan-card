# Glass Floorplan file format (`glass-floorplan`, version 1)

A small JSON file with the floor plan only, without any Home Assistant data. Coordinates are **centimetres**, with x to the
right and y downwards. The origin is the top-left corner of the rooms.

```json
{
 "format": "glass-floorplan",
 "version": 1,
 "scale": "measured",
 "rooms": [
  { "name": "Wohnen", "rect": [0, 0, 555, 425],
    "furniture": [[35, 255, 255, 345, "sofa"], [305, 205, 405, 305, "round_table"]] },
  { "name": "Schlafen", "rect": [555, 0, 990, 425], "furniture": [[675, 35, 855, 235, "bed"]] },
  { "name": "Küche", "rect": [0, 425, 375, 690], "label": "bottom" }
 ],
 "windows": [[115, 0, 415, 0], [635, 0, 895, 0]],
 "doors": [[555, 215, 555, 295], [145, 425, 235, 425]],
 "entrance": [990, 600, 990, 680],
 "image_rect": [-46, -46, 1034, 734]
}
```

| Key | Meaning |
|---|---|
| `scale` | `measured` (from a printed dimension or area) or `estimated`. If estimated, the editor asks for one real length. |
| `rooms[].name` | Room name as written in the plan, without areas or numbers |
| `rooms[].rect` | `[x1, y1, x2, y2]` of the room. Neighbouring rooms share the same wall coordinate, with no gap and no overlap. |
| `rooms[].label` | `bottom` puts the room name at the bottom (when the top-left corner is crowded) |
| `rooms[].furniture` | `[x1, y1, x2, y2, kind]` inside the room |
| `windows` | Segments on outer walls: `[x1, y, x2, y]` or `[x, y1, x, y2]` |
| `doors` | Passages on the wall between two rooms (80–100 cm) |
| `entrance` | The front door on an outer wall |
| `image_rect` | Where the whole picture lies in plan coordinates (lines the photo up as a template) |
| `entities` | Optional, only with real entity ids: `[{"entity": "light.x", "at": [x, y], "icon": "ceiling"}]` |

In the draft for `scripts/build_plan.py`, the same keys hold **picture pixels**, plus `"image": [width, height]` and
`"cm_per_px": n`. The script removes these two and computes `image_rect` itself.

## Furniture kinds and typical sizes (cm)

`sofa` 220×90 · `armchair` 85×85 · `bed` 180×200 · `bed_single` 90×200 · `table` 160×90 · `round_table` 110 ·
`chair` 46 · `desk` 140×70 · `wardrobe` 200×60 · `shelf` 100×36 · `sideboard` 160×45 · `tv` 130×14 ·
`counter` 240×62 (kitchen) · `fridge` 62×66 · `bath` 170×75 · `shower` 90×90 · `toilet` 40×62 · `sink` 60×46 ·
`washer` 60×60 · `plant` 50 · `rug` 200×140 · `stairs` 100×260 · `block` (anything else)

To rotate a piece, swap its width and depth.
