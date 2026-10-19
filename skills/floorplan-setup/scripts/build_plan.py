#!/usr/bin/env python3
"""Turn a draft (picture pixels) into a clean Glass Floorplan file (centimetres).

Usage:  python3 build_plan.py draft.json out.floorplan.json

Draft (all coordinates in pixels of the picture):
{
  "image": [1080, 780],            # picture size
  "cm_per_px": 1.0,                # scale (from a printed dimension; otherwise estimated)
  "scale": "measured",             # "measured" | "estimated"
  "rooms": [ {"name": "Wohnen", "rect": [x1, y1, x2, y2],
              "furniture": [[x1, y1, x2, y2, "sofa"], ...]}, ... ],
  "windows": [[x1, y1, x2, y2], ...],   # on outer walls
  "doors": [[x1, y1, x2, y2], ...],     # passages between two rooms
  "entrance": [x1, y1, x2, y2]          # optional, front door on an outer wall
}

What the script does: converts to cm with the top-left room corner as origin, rounds to 5 cm, lets neighbouring rooms
share exactly one wall line, puts windows / doors / the entrance exactly onto the nearest wall, keeps furniture inside
its room and adds "image_rect" (where the picture lies in plan coordinates, so it lines up as a template in the editor).
Warnings go to stderr. Standard library only.
"""
import json, re, sys

KINDS = {"sofa", "armchair", "bed", "bed_single", "table", "round_table", "chair", "desk", "wardrobe", "shelf", "sideboard", "tv",
         "counter", "fridge", "bath", "shower", "toilet", "sink", "washer", "plant", "rug", "stairs", "block"}
warn = lambda *a: print("warning:", *a, file=sys.stderr)


def norm_rect(r):
    x1, y1, x2, y2 = (float(v) for v in r[:4])
    return [min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)]


def snap5(v):
    return int(round(v / 5.0) * 5)


def main(src, dst):
    d = json.load(open(src, encoding="utf-8"))
    s = float(d.get("cm_per_px") or 1.0)
    rooms = [r for r in d.get("rooms", []) if r.get("rect")]
    if not rooms:
        sys.exit("no rooms in the draft")
    R = [norm_rect(r["rect"]) for r in rooms]
    ox, oy = min(q[0] for q in R), min(q[1] for q in R)
    cm = lambda x, y: ((x - ox) * s, (y - oy) * s)
    rect_cm = lambda q: [*cm(q[0], q[1]), *cm(q[2], q[3])]
    R = [rect_cm(q) for q in R]

    # one line per wall: cluster nearly equal x / y values (tolerance ~ a wall thickness)
    tol = 25.0
    def cluster(vals):
        vals = sorted(vals)
        groups, cur = [], [vals[0]]
        for v in vals[1:]:
            if v - cur[-1] <= tol:
                cur.append(v)
            else:
                groups.append(cur)
                cur = [v]
        groups.append(cur)
        return {v: snap5(sum(g) / len(g)) for g in groups for v in g}
    cx = cluster([v for q in R for v in (q[0], q[2])])
    cy = cluster([v for q in R for v in (q[1], q[3])])
    R = [[cx[q[0]], cy[q[1]], cx[q[2]], cy[q[3]]] for q in R]
    for i, q in enumerate(R):
        if q[2] - q[0] < 40 or q[3] - q[1] < 40:
            warn(f"room {rooms[i].get('name')!r} is very small: {q}")
    for i in range(len(R)):
        for j in range(i + 1, len(R)):
            a, b = R[i], R[j]
            ix, iy = min(a[2], b[2]) - max(a[0], b[0]), min(a[3], b[3]) - max(a[1], b[1])
            if ix > 10 and iy > 10:
                warn(f"rooms {rooms[i].get('name')!r} and {rooms[j].get('name')!r} overlap ({ix:.0f} × {iy:.0f} cm)")

    edges = []  # (axis, line, lo, hi, room index)
    for i, q in enumerate(R):
        edges += [("h", q[1], q[0], q[2], i), ("h", q[3], q[0], q[2], i), ("v", q[0], q[1], q[3], i), ("v", q[2], q[1], q[3], i)]

    def on_wall(seg, want_shared):
        """put a segment onto the nearest wall; shared = between two rooms (doors), else an outer wall"""
        x1, y1, x2, y2 = rect_cm(norm_rect(seg))
        horiz = (x2 - x1) >= (y2 - y1)
        mid = ((x1 + x2) / 2, (y1 + y2) / 2)
        best = None
        for ax, line, lo, hi, i in edges:
            if (ax == "h") != horiz:
                continue
            along = mid[0] if horiz else mid[1]
            across = mid[1] if horiz else mid[0]
            dist = abs(across - line) + max(0, lo - along, along - hi)
            shared = sum(1 for e in edges if e[0] == ax and e[1] == line and e[2] < along < e[3]) > 1
            if want_shared is not None and shared != want_shared:
                dist += 400
            if not best or dist < best[0]:
                best = (dist, ax, line, lo, hi)
        if not best or best[0] > 150:
            warn(f"segment {seg} is far from every wall – skipped")
            return None
        _, ax, line, lo, hi = best
        a, b = (x1, x2) if horiz else (y1, y2)
        a, b = max(lo, snap5(a)), min(hi, snap5(b))
        if b - a < 20:
            return None
        return [a, line, b, line] if horiz else [line, a, line, b]

    out_rooms = []
    for i, r in enumerate(rooms):
        q = R[i]
        room = {"name": str(r.get("name") or f"Room {i + 1}").strip(), "rect": q}
        if r.get("label") == "bottom":
            room["label"] = "bottom"
        furn = []
        for f in r.get("furniture", []) or []:
            kind = f[4] if len(f) > 4 else "block"
            if kind not in KINDS:
                warn(f"unknown furniture kind {kind!r} → block")
                kind = "block"
            a = rect_cm(norm_rect(f))
            a = [max(q[0] + 5, snap5(a[0])), max(q[1] + 5, snap5(a[1])), min(q[2] - 5, snap5(a[2])), min(q[3] - 5, snap5(a[3]))]
            if a[2] - a[0] >= 10 and a[3] - a[1] >= 10:
                furn.append([*a, kind])
        if furn:
            room["furniture"] = furn
        out_rooms.append(room)

    out = {"format": "glass-floorplan", "version": 1, "scale": "measured" if d.get("scale") == "measured" else "estimated", "rooms": out_rooms}
    out["windows"] = [w for w in (on_wall(x, False) for x in d.get("windows", []) or []) if w]
    out["doors"] = [w for w in (on_wall(x, True) for x in d.get("doors", []) or []) if w]
    if d.get("entrance"):
        e = on_wall(d["entrance"], False)
        if e:
            out["entrance"] = e
    if d.get("image"):
        w, h = d["image"][:2]
        out["image_rect"] = [round(-ox * s), round(-oy * s), round((w - ox) * s), round((h - oy) * s)]
    txt = json.dumps(out, indent=1, ensure_ascii=False)
    txt = re.sub(r"\[\s+([^\[\]{}]*?)\s+\]", lambda m: "[" + re.sub(r"\s+", " ", m.group(1)) + "]", txt)  # number lists on one line
    open(dst, "w", encoding="utf-8").write(txt + "\n")
    total = sum((q[2] - q[0]) * (q[3] - q[1]) for q in R) / 1e4
    print(f"{dst}: {len(out_rooms)} rooms ({total:.1f} m²), {len(out['doors'])} doors, {len(out['windows'])} windows, "
          f"{sum(len(r.get('furniture', [])) for r in out_rooms)} furniture, scale {out['scale']}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
