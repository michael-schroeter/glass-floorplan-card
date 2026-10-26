---
name: floorplan-setup
description: Turns a picture of a floor plan (photo, screenshot, architect plan, hand sketch) into a ready-to-import file for the Glass Floorplan Card for Home Assistant. Use whenever someone shares a floor plan image and mentions Glass Floorplan, their Home Assistant floor plan / dashboard, or asks to convert a floor plan into rooms. The result is a downloadable .floorplan.json file the user imports in the card's floor plan editor.
---

# Floor plan picture → Glass Floorplan file

The user gives you **a picture of their floor plan**. Never ask for Home Assistant data or entity ids.
Deliver **one file** named `<home>.floorplan.json` that the user imports in Home Assistant:
*card → Open floor plan editor → Template → Import a floor plan file*. The editor links the rooms to the user's
Home Assistant areas by name (also across languages, *Living* ↔ *Wohnzimmer*) and puts every area's devices into its
room – at the spots this file names, where it names them.

Answer in the user's language. Keep the chat answers short.

## Steps

1. **Look at the picture.** Find every room and its name as written on the plan, without area numbers: `LIVING 22.4 m²` → `Living`.
   Also find printed dimensions, windows, doors between rooms, the front door and furniture symbols. Note how far the
   picture is skewed. For phone photos taken at an angle, work with what is reasonable and mention it.
2. **Find the scale** (centimetres per picture pixel):
   - from a printed dimension (`10,00 m`, `4.50`, `3'6"`) along a wall → `"scale": "measured"`
   - from a room area printed in the plan (m²) divided by its pixel area → `"scale": "measured"`
   - otherwise estimate from typical sizes (door 80–90 cm, double bed 160–180 × 200 cm, bathtub 170 × 75 cm) → `"scale": "estimated"`.
     The editor then asks the user for one real length.
3. **Ask once before you build the file** – one short message, every question optional. Start with the rooms you
   found (names, so the user can correct them), then ask:
   - **Furniture:** where their furniture stands, e.g. *sofa under the living room window, bed against the left wall*
     (skip this question if the plan already shows the furniture clearly).
   - **Lamps and devices:** where they are, e.g. *ceiling light in the middle of the living room, floor lamp next to the
     sofa, TV opposite the sofa, thermostat under the bedroom window, blinds on the living room windows*.
   - **Typical furniture:** whether you should add typical pieces (bed, sofa, kitchen, bath …) where nothing is known,
     or leave them out.

   The user may answer in one line or skip (*“just do it”*): then use typical furniture and no device positions.
   If the user already told you all of this, don't ask – go on.
4. **Get exact room rectangles** for clean plans with code execution:
   `python3 scripts/detect_rooms.py plan.png --cm-per-px <scale> --debug check.png`
   It prints room rectangles and door gaps in picture pixels. Look at `check.png`, then match each rectangle to its name
   by where the label sits, and fix or add what is missing (small closets, rooms split by text). For messy photos or
   sketches where the script fails, read the rectangles from the picture yourself.
5. **Write a draft** (`draft.json`, all coordinates in **picture pixels**). The format is in `reference/format.md`:
   rooms (name, rect, furniture), windows on outer walls, doors between rooms, entrance (front door), devices, `image`
   size, `cm_per_px` and `scale`.
   - Rooms are axis-aligned rectangles. Split L-shaped rooms into two rectangles: `Living` + `Living 2`.
   - **Furniture** (only for the looks, kinds in `reference/format.md`): what the plan shows, plus what the user told you.
     With typical furniture wanted, add typical pieces to every room you know nothing about – or to all rooms if the user
     gave no furniture at all (bed + wardrobe in bedrooms, sofa + TV + small table in living rooms, counter + fridge in
     kitchens, bath or shower + toilet + sink in bathrooms, desk in offices). Without it, only the plan's and the user's
     pieces. Keep the top-left ~1.7 × 0.9 m of each room free for the room name.
   - **Devices** the user described, one entry each: `{"name": "Floor lamp", "kind": "light", "icon": "floorlamp", "at": [x, y]}`.
     `name` in the user's words, `kind` one of `light`, `tv`, `speaker`, `thermostat`, `radiator`, `sensor`, `blind`,
     `vacuum` (its station). For lamps add `icon` if the kind of lamp is clear. `at` is a point inside its room. The editor
     gives each entry to a device of the same kind in that room's area; names decide when there are several.
6. **Build the file:** `python3 scripts/build_plan.py draft.json <home>.floorplan.json`
   This converts to centimetres, lets neighbouring rooms share one wall line, puts windows, doors and the entrance onto the
   walls, keeps furniture and devices inside their rooms and adds where the picture lies, so the photo lines up as a
   template in the editor. Read its warnings and fix the draft if rooms overlap or segments were skipped.
7. **Hand it over.** Save the file where the user can download it (the outputs folder) and reply with:
   - one line: rooms found (names), total floor area, whether the scale was measured or estimated, how many furniture
     pieces and device spots
   - anything uncertain (guessed rooms, unreadable parts, skewed photo)
   - the import: *edit the card → Open floor plan editor → Template → Import a floor plan file*. Rooms named like an
     area are linked by themselves; drag any other area onto its room. Then *Next* through the steps – the devices are
     in their rooms when the user gets to *Devices*.

Without code execution, do steps 1–5 in your head and output the final JSON (format in `reference/format.md`, already in
centimetres) in one ```json block. The editor's *Paste text* option reads it directly.

## Optional: real entity ids

Only if the user gives you their Home Assistant entities, add `"entities": [{"entity": "light.x", "at": [x, y]}]`
with centimetre positions in the final file. Use real entity ids only, never invented ones. Otherwise describe devices
with `devices` (above): the editor finds the matching entities itself.
