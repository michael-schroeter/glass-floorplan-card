#!/usr/bin/env python3
"""Find rectangular rooms and door gaps in a floor plan picture.

Works best for clean plans (screenshots, architect plans, neat sketches): dark pixels are walls, letters and small
symbols are ignored, door openings are closed by growing the walls, every enclosed area becomes a room.

Usage:  python3 detect_rooms.py plan.png [--cm-per-px 1.0] [--debug out.png]
Prints JSON with pixel coordinates of the ORIGINAL image:
  {"image": [w, h], "rooms": [[x1, y1, x2, y2], ...], "doors": [[x1, y1, x2, y2], ...], "wall_px": n}
Needs Pillow only.
"""
import argparse, json, sys
from PIL import Image


def otsu(hist, total):
    s = sum(i * h for i, h in enumerate(hist))
    sb = wb = 0
    best, thr = -1, 128
    for i in range(256):
        wb += hist[i]
        if not wb:
            continue
        wf = total - wb
        if not wf:
            break
        sb += i * hist[i]
        mb, mf = sb / wb, (s - sb) / wf
        between = wb * wf * (mb - mf) ** 2
        if between > best:
            best, thr = between, i
    return thr


def dilate(m, W, H, r):
    tmp = bytearray(W * H)
    for y in range(H):
        row = y * W
        last = -10 ** 9
        for x in range(W):
            if m[row + x]:
                last = x
            if x - last <= r:
                tmp[row + x] = 1
        last = 10 ** 9
        for x in range(W - 1, -1, -1):
            if m[row + x]:
                last = x
            if last - x <= r:
                tmp[row + x] = 1
    out = bytearray(W * H)
    for x in range(W):
        last = -10 ** 9
        for y in range(H):
            if tmp[y * W + x]:
                last = y
            if y - last <= r:
                out[y * W + x] = 1
        last = 10 ** 9
        for y in range(H - 1, -1, -1):
            if tmp[y * W + x]:
                last = y
            if last - y <= r:
                out[y * W + x] = 1
    return out


def components(mask, W, H, want):
    """yield (pixels, bbox) of 4-connected areas where mask[i] == want"""
    seen = bytearray(W * H)
    for s in range(W * H):
        if mask[s] != want or seen[s]:
            continue
        stack, pix = [s], []
        seen[s] = 1
        x1, y1, x2, y2 = W, H, 0, 0
        while stack:
            i = stack.pop()
            pix.append(i)
            x, y = i % W, i // W
            x1, y1, x2, y2 = min(x1, x), min(y1, y), max(x2, x), max(y2, y)
            for j in ((i - 1) if x > 0 else -1, (i + 1) if x < W - 1 else -1, i - W, i + W):
                if 0 <= j < W * H and not seen[j] and mask[j] == want:
                    seen[j] = 1
                    stack.append(j)
        yield pix, (x1, y1, x2, y2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--cm-per-px", type=float, default=0, help="scale of the picture, if known (closes door gaps up to ~1 m)")
    ap.add_argument("--door-px", type=float, default=0, help="half a door width in original pixels (default: from --cm-per-px, else 5%% of the image)")
    ap.add_argument("--debug", help="write a picture with the found rooms")
    a = ap.parse_args()

    src = Image.open(a.image).convert("L")
    k = min(1.0, 640 / max(src.size))
    W, H = max(40, round(src.width * k)), max(40, round(src.height * k))
    img = src.resize((W, H))
    px = img.load()
    lum = [px[x, y] for y in range(H) for x in range(W)]
    hist = [0] * 256
    for v in lum:
        hist[v] += 1
    thr = otsu(hist, W * H)
    dark = sum(1 for v in lum if v < thr)
    invert = dark > W * H * 0.5
    wall = bytearray(1 if ((v > thr) if invert else (v < thr)) else 0 for v in lum)

    # drop small blobs (letters, dimensions, symbols)
    keep = bytearray(W * H)
    min_span = max(W, H) * 0.12
    for pix, (x1, y1, x2, y2) in components(wall, W, H, 1):
        if max(x2 - x1, y2 - y1) >= min_span:
            for i in pix:
                keep[i] = 1
    half_door = a.door_px or (52 / a.cm_per_px if a.cm_per_px else 0)
    r = max(2, min(48, round(half_door * k if half_door else max(W, H) * 0.05)))
    grown = dilate(keep, W, H, r)

    # outside = reachable from the border
    outside = bytearray(W * H)
    stack = [i for i in list(range(W)) + [(H - 1) * W + x for x in range(W)] + [y * W for y in range(H)] + [y * W + W - 1 for y in range(H)] if not grown[i]]
    for i in stack:
        outside[i] = 1
    while stack:
        i = stack.pop()
        x = i % W
        for j in ((i - 1) if x > 0 else -1, (i + 1) if x < W - 1 else -1, i - W, i + W):
            if 0 <= j < W * H and not grown[j] and not outside[j]:
                outside[j] = 1
                stack.append(j)
    inside = bytearray(0 if (grown[i] or outside[i]) else 1 for i in range(W * H))
    rooms = []
    min_area = W * H * 0.004
    for pix, (x1, y1, x2, y2) in components(inside, W, H, 1):
        area = (x2 - x1 + 1) * (y2 - y1 + 1)
        if len(pix) < min_area or len(pix) / area < 0.45 or area > W * H * 0.85:
            continue
        rooms.append([x1 - r, y1 - r, x2 + 1 + r, y2 + 1 + r])

    # neighbours share the middle of the wall between them
    tol = r + 4
    for A in rooms:
        for B in rooms:
            if A is B:
                continue
            oy = min(A[3], B[3]) - max(A[1], B[1])
            ox = min(A[2], B[2]) - max(A[0], B[0])
            if oy > 6 and A[2] - tol <= B[0] < A[2] + tol:
                m = (A[2] + B[0]) / 2
                A[2] = B[0] = m
            if ox > 6 and A[3] - tol <= B[1] < A[3] + tol:
                m = (A[3] + B[1]) / 2
                A[3] = B[1] = m

    # nearly equal edges become one line (rows of rooms, outer walls)
    xs = [v for q in rooms for v in (q[0], q[2])]
    ys = [v for q in rooms for v in (q[1], q[3])]
    def align(v, vals):
        near = [u for u in vals if abs(u - v) < tol * 0.8]
        return sum(near) / len(near)
    rooms = [[align(q[0], xs), align(q[1], ys), align(q[2], xs), align(q[3], ys)] for q in rooms]

    # door gaps in the shared walls (un-grown wall mask)
    doors = []
    for i, A in enumerate(rooms):
        for B in rooms[i + 1:]:
            seg = None
            if abs(A[2] - B[0]) < 1 or abs(B[2] - A[0]) < 1:
                x = A[2] if abs(A[2] - B[0]) < 1 else A[0]
                seg = (x, max(A[1], B[1]), x, min(A[3], B[3]))
            elif abs(A[3] - B[1]) < 1 or abs(B[3] - A[1]) < 1:
                y = A[3] if abs(A[3] - B[1]) < 1 else A[1]
                seg = (max(A[0], B[0]), y, min(A[2], B[2]), y)
            if not seg:
                continue
            hz = seg[1] == seg[3]
            length = (seg[2] - seg[0]) if hz else (seg[3] - seg[1])
            run = start = 0
            best = None
            v = 0.0
            while v <= length:
                cx, cy = (seg[0] + v, seg[1]) if hz else (seg[0], seg[1] + v)
                # probe only across the wall line
                wl = any(0 <= (xx := round(cx if hz else cx + d)) < W and 0 <= (yy := round(cy + d if hz else cy)) < H and keep[yy * W + xx]
                         for d in range(-max(2, r), max(2, r) + 1))
                if not wl:
                    if not run:
                        start = v
                    run += 1
                    if not best or run > best[1]:
                        best = (start, run)
                else:
                    run = 0
                v += 1
            if best and best[1] >= r * 1.2 and best[1] < length * 0.9:
                s, n = best
                doors.append([seg[0] + s, seg[1], seg[0] + s + n, seg[1]] if hz else [seg[0], seg[1] + s, seg[0], seg[1] + s + n])

    back = lambda q: [round(v / k, 1) for v in q]
    out = {"image": list(src.size), "rooms": [back(q) for q in rooms], "doors": [back(d) for d in doors], "wall_px": round(r / k, 1), "inverted": invert}
    if a.debug:
        from PIL import ImageDraw
        dbg = Image.open(a.image).convert("RGB")
        dr = ImageDraw.Draw(dbg)
        for i, q in enumerate(out["rooms"]):
            dr.rectangle(q, outline=(0, 120, 255), width=3)
            dr.text((q[0] + 6, q[1] + 4), str(i), fill=(0, 120, 255))
        for d in out["doors"]:
            dr.line(d, fill=(255, 60, 160), width=5)
        dbg.save(a.debug)
    json.dump(out, sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main()
