# Glass Floorplan Card

**A beautiful floor plan dashboard for Home Assistant.**
Your home as a plan made of frosted glass, where every lamp glows in its real colour.

[**▶ Try the live demo**](https://michael-schroeter.github.io/glass-floorplan-card/) · [Install](#install) · [Configuration](docs/configuration.md)

![Light layer on a laptop](docs/images/light.jpg)

<img src="docs/images/climate.jpg" alt="Climate layer" width="49.5%"> <img src="docs/images/popup.jpg" alt="Room pop-up" width="49.5%">

<img src="docs/images/phone.jpg" alt="Phone layout" width="165" align="right">

Tap a lamp to switch it. Tap a room and it opens as a pop-up with soft spring animations. Layers switch the plan between light, climate, covers, a Roborock vacuum or your own mix.

There is a phone mode too.

<br clear="right">

## Your floor plan, your way

You never write coordinates. Pick whatever you have at hand:

| You have … | Do this |
|---|---|
| 📷 **A picture** of your floor plan (listing, photo, screenshot, hand sketch) | Load it in the editor, measure one wall, click **Find rooms automatically**. Rooms and doorways appear on their own. |
| ✨ **A hard-to-read picture** (taken at an angle, busy, hand-drawn) | Send it to **Claude** with the [floor plan skill](docs/claude-skill.md). You get a file back and import it with one click. |
| 🏠 **Your Home Assistant areas** | One click creates a room for each area, with its devices already placed. Arrange the rooms and you're done. |
| ✏️ **Nothing but your memory** | Drag rectangles. Edges snap together, so the rooms line up like walls. |

![The editor finds the rooms in a sketch](docs/images/editor-sketch.jpg)

Then drag your Home Assistant areas onto the rooms (or link them by name), drag your devices onto the plan, and click **Done**. The editor always shows the real card at the real size of your screen.

## Simple by default, deep if you want

**Out of the box** link your rooms to Home Assistant areas and the rest falls into place: devices land in their rooms, lamps get the right symbol, and layers for light, climate, covers and your Roborock appear on their own.

**If you like**, you can fine-tune a lot: furniture, windows and the front door, symbols for each device, light cones for light, a door opener and doorbell, modes from your scenes and scripts, and your own layers such as *Night = lights + covers + front door lock*. All of it is in the editor. YAML is there if you want it, but you never need it.

## Install

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=michael-schroeter&repository=glass-floorplan-card&category=plugin)

Or in HACS: ⋮ → *Custom repositories* → `https://github.com/michael-schroeter/glass-floorplan-card`, category **Dashboard**. Install **Glass Floorplan Card** and reload the browser.

Then add the card to a dashboard view of type **Panel** (best) or **Sections**, and click **Open floor plan editor**.

<details>
<summary>Manual installation</summary>

Copy `glass-floorplan-card.js` from the [latest release](https://github.com/michael-schroeter/glass-floorplan-card/releases/latest) to `/config/www/` and add it under *Settings → Dashboards → ⋮ → Resources* as `/local/glass-floorplan-card.js` (*JavaScript module*).
</details>

## More

- [Configuration reference](docs/configuration.md): all options, modes, vacuum, YAML
- [Floor plan from a picture with Claude](docs/claude-skill.md)
- [Development](docs/development.md): build, local demo, file overview

English and German.


---

Built with Claude. It started as a private dashboard and became this card.
[MIT License](LICENSE)
