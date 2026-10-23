# Floor plan from a picture with Claude

← [Back to the README](../README.md)


For phone photos at an angle, hand sketches or busy listing plans, the Claude skill in [`skills/floorplan-setup`](../skills/floorplan-setup/SKILL.md) turns **just the picture** into a floor plan file. The skill reads the room names and dimensions, finds the exact rectangles with a small script, and adds windows, doors and furniture. You don't need Home Assistant data or any explanation.

1. Install the skill once:
   - **claude.ai** (web/desktop/app): download `floorplan-setup-skill.zip` from the [latest release](https://github.com/michael-schroeter/glass-floorplan-card/releases/latest) and add it under *Settings → Capabilities → Skills* (code execution must be on).
   - **Claude Code**: copy the folder to `~/.claude/skills/floorplan-setup/`.
2. Send Claude your floor plan picture with a short note such as *“Glass Floorplan”*. You get `<home>.floorplan.json` to download.
3. In Home Assistant: edit the card → **Open floor plan editor** → **Template** → **Import a floor plan file**. You can also paste Claude's answer with *Paste text*.
4. **Rooms** → **Link by name**: rooms whose names match your areas are linked and their devices placed. Drag any remaining area onto its room.

If the size was only estimated, the editor asks for one real length and rescales everything. If you load the same picture as template, it lines up exactly under the plan. [`demo/sketch-example.png`](../demo/sketch-example.png) and [`demo/sketch-example.floorplan.json`](../demo/sketch-example.floorplan.json) show the whole round trip.

