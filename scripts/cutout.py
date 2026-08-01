#!/usr/bin/env python3
"""Gör bakgrunden genomskinlig på genererade sprites.

Bildmodellen kan inte producera alfa, så vi ber om en enfärgad bakgrund och
skalar bort den här.

Ren flödesfyllning från kanten räcker inte: modellen ritar ibland tunna
ramlinjer tvärs över bilden, och då spärras vägen och ett helt band blir
kvar mitt i motivet. Vi tar därför alla sammanhängande bakgrundsområden vars
ram nuddar bildkanten — då spelar det ingen roll att en linje delar
bakgrunden i flera delar. Områden som ligger helt inne i motivet behålls,
för de är hål och inte bakgrund.

    python3 scripts/cutout.py public/assets/*.png [--force]
"""
import sys
from collections import deque

from PIL import Image, ImageFilter

TOLERANCE = 46 * 3      # summerat kanalavstånd till hörnfärgen
FEATHER = 1.1           # mjukar upp kanten
SIZE = 512              # allt normaliseras till samma kvadrat


def cut(path, force=False):
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    px = im.load()

    # Redan klippt? Beskärningen lämnar genomskinlig utfyllnad i hörnen, så
    # vi kollar mitten av överkanten i stället.
    if not force and px[w // 2, 2][3] == 0:
        return -1

    # Hörnen kan redan vara genomskinliga från en tidigare körning; då säger
    # deras RGB ingenting. Vi samplar den yttersta ramen och tar bara pixlar
    # som fortfarande är ogenomskinliga.
    ring = []
    for x in range(0, w, 7):
        for y in (0, h - 1):
            if px[x, y][3] > 200:
                ring.append(px[x, y])
    for y in range(0, h, 7):
        for x in (0, w - 1):
            if px[x, y][3] > 200:
                ring.append(px[x, y])
    if not ring:
        return -1
    br = sum(c[0] for c in ring) / len(ring)
    bg = sum(c[1] for c in ring) / len(ring)
    bb = sum(c[2] for c in ring) / len(ring)

    is_bg = bytearray(w * h)
    for y in range(h):
        row = y * w
        for x in range(w):
            r, g, b, _ = px[x, y]
            if abs(r - br) + abs(g - bg) + abs(b - bb) <= TOLERANCE:
                is_bg[row + x] = 1

    clear = bytearray(w * h)
    seen = bytearray(w * h)
    for start in range(w * h):
        if not is_bg[start] or seen[start]:
            continue
        comp = []
        touches = False
        q = deque([start])
        seen[start] = 1
        while q:
            i = q.popleft()
            comp.append(i)
            x, y = i % w, i // w
            if x == 0 or y == 0 or x == w - 1 or y == h - 1:
                touches = True
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    j = ny * w + nx
                    if is_bg[j] and not seen[j]:
                        seen[j] = 1
                        q.append(j)
        if touches:
            for i in comp:
                clear[i] = 1

    mask = Image.new("L", (w, h), 255)
    mp = mask.load()
    n = 0
    for i, v in enumerate(clear):
        if v:
            mp[i % w, i // w] = 0
            n += 1
    mask = mask.filter(ImageFilter.GaussianBlur(FEATHER))
    im.putalpha(mask)

    # Beskär till motivet och centrera i en kvadrat så skalningen i spelet
    # blir förutsägbar oavsett hur modellen ramade in bilden.
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
        side = max(im.size)
        square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        square.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
        im = square.resize((SIZE, SIZE), Image.LANCZOS)

    im.save(path)
    return round(100 * n / (w * h))


if __name__ == "__main__":
    args = sys.argv[1:]
    force = "--force" in args
    files = [a for a in args if not a.startswith("--")]
    if not files:
        sys.exit("Ange filer: python3 scripts/cutout.py public/assets/*.png")
    for f in files:
        if f.endswith("terrain-ground.png"):
            continue
        try:
            pct = cut(f, force)
            print(f"  {f.split('/')[-1]}: " +
                  ("redan klippt" if pct < 0 else f"{pct} % bortklippt"))
        except Exception as e:
            print(f"  {f.split('/')[-1]}: MISSLYCKADES — {e}")
