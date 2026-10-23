# Development

← [Back to the README](../README.md)

## Try it without Home Assistant

The `demo/` folder contains a made-up flat with simulated devices, and nothing is switched for real.

```bash
python3 -m http.server 8765 --bind 127.0.0.1
# open http://127.0.0.1:8765/demo/        (?lang=de, ?scene=day|cleaning|playing|cold, ?tab=climate, ?open=living, ?blank=1)
#      http://127.0.0.1:8765/demo/phone.html
```

Use **Edit floor plan** in the demo sidebar to try the editor ([`demo/sketch-example.png`](../demo/sketch-example.png) is a sketch to practise with).

## Build

No build tools besides Python 3 are needed.

```bash
python3 tools/build.py          # src/*.js → dist/glass-floorplan-card.js (+ syntax check on macOS)
python3 tools/build.py 0.2.0    # with a version
```

| File | Content |
|---|---|
| `src/01-util.js` … `03-icons.js` | helpers, texts (en/de), glass icons |
| `src/04-model.js` | config → geometry, layers, automatic tile layout, room graph for the robot |
| `src/05-styles.js` | all styles (everything scales with `--u`) |
| `src/06-card.js` … `12-mobile.js` | card, pop-ups, climate, covers, other devices, vacuum, phone layout |
| `src/20-…25-editor*.js` | floor plan editor, room detection, card editor for Home Assistant |
| `demo/` | demo page with simulated `hass` |

