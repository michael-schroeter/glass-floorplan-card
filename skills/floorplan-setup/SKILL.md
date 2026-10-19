---
name: floorplan-setup
description: Turns a picture of a floor plan (photo, screenshot, architect plan, hand sketch) into a ready-to-import file for the Glass Floorplan Card for Home Assistant. Use whenever someone shares a floor plan image and mentions Glass Floorplan, their Home Assistant floor plan / dashboard, or asks to convert a floor plan into rooms. The result is a downloadable .floorplan.json file the user imports in the card's floor plan editor.
---

# Floor plan picture → Glass Floorplan file

The user only gives you **a picture of their floor plan**. Do not ask for Home Assistant data, entities or explanations.
Deliver **one file** named `<home>.floorplan.json` that the user imports in Home Assistant:
*card → Open floor plan editor → Template → Import a floor plan file*. In the editor the rooms are then linked to the
user's Home Assistant areas, mostly automatically by name, and devices are placed.

Answer in the user's language. Keep the chat answer short.

## Steps

1. **Look at the picture.** Find every room and its name as written on the plan, without area numbers: `WOHNEN 22,4 m²` → `Wohnen`.
   Also find printed dimensions, windows, doors between rooms, the front door and furniture symbols. Note how far the
   picture is skewed. For phone photos taken at an angle, work with what is reasonable and mention it.
2. **Find the scale** (centimetres per picture pixel):
   - from a printed dimension (`10,00 m`, `4.50`, `3'6"`) along a wall → `"scale": "measured"`
   - from a room area printed in the plan (m²) divided by its pixel area → `"scale": "measured"`
   - otherwise estimate from typical sizes (door 80–90 cm, double bed 160–180 × 200 cm, bathtub 170 × 75 cm) → `"scale": "estimated"`.
     The editor then asks the user for one real length.
3. **Get exact room rectangles** for clean plans with code execution:
   `python3 scripts/detect_rooms.py plan.png --cm-per-px <scale> --debug check.png`
   It prints room rectangles and door gaps in picture pixels. Look at `check.png`, then match each rectangle to its name
   by where the label sits, and fix or add what is missing (small closets, rooms split by text). For messy photos or
   sketches where the script fails, read the rectangles from the picture yourself.
4. **Write a draft** (`draft.json`, all coordinates in **picture pixels**). The format is in `reference/format.md`:
   rooms (name, rect, optional furniture), windows on outer walls, doors between rooms, entrance (front door), `image`
   size, `cm_per_px` and `scale`.
   - Rooms are axis-aligned rectangles. Split L-shaped rooms into two rectangles: `Wohnen` + `Wohnen 2`.
   - Furniture is optional and only for the looks, using the kinds in `reference/format.md`. Draw what the plan shows; for empty
     plans add a few typical pieces per room type (bed in bedrooms, sofa + table in living rooms, counter in kitchens,
     bath/shower + toilet + sink in bathrooms). Keep the top-left ~1.7 × 0.9 m of each room free for the room name.
5. **Build the file:** `python3 scripts/build_plan.py draft.json <home>.floorplan.json`
   This converts to centimetres, lets neighbouring rooms share one wall line, puts windows, doors and the entrance onto the
   walls, and adds where the picture lies, so the photo lines up as a template in the editor. Read its warnings and fix the
   draft if rooms overlap or segments were skipped.
6. **Hand it over.** Save the file where the user can download it (the outputs folder) and reply with:
   - one line: rooms found (names), total floor area, whether the scale was measured or estimated
   - anything uncertain (guessed rooms, unreadable parts, skewed photo)
   - the four import steps: *edit the card → Open floor plan editor → Template → Import a floor plan file*, then
     *Rooms → link the Home Assistant areas* (automatic by name, otherwise drag an area onto its room)

Without code execution, do steps 1–4 in your head and output the final JSON (format in `reference/format.md`, already in
centimetres) in one ```json block. The editor's *Paste text* option reads it directly.

## Optional: devices

Only if the user also gives you their Home Assistant entities, add `"entities": [{"entity": "light.x", "at": [x, y]}]`
with centimetre positions in the final file. Use real entity ids only, never invented ones. Without that list, leave devices
out: the editor places them per area.
