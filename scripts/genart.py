#!/usr/bin/env python3
"""Genererar spelgrafik med Geminis bildmodell och sparar till public/assets/.

Nyckeln läses från miljövariabeln GEMINI_API_KEY eller från en fil som pekas
ut med --key-file. Den hamnar aldrig i repot.

    export GEMINI_API_KEY=...
    python3 scripts/genart.py terrain
    python3 scripts/genart.py creeps towers
    python3 scripts/genart.py --only creep-boss

MCP-verktyget nano-banana går inte att använda: det har
gemini-2.5-flash-image-preview hårdkodad och den modellen är borttagen.
"""
import argparse
import base64
import json
import os
import sys
import time
import urllib.request

MODEL = "gemini-3-pro-image"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets")

# Samma stilrad på allt, annars glider bilderna isär i uttryck.
STYLE = (
    "hand-painted casual mobile game art style like Clash Royale or Brawl Stars, "
    "rich saturated colors, soft painted shading, thick dark outline, "
    "clean readable silhouette, light from the upper left, "
    "plain solid black background, centered, fills 85% of the frame, "
    "no text, no UI, no drop shadow on the ground, no border, no frame, no lines across the image"
)

TERRAIN = {
    "terrain-ground": (
        "Seamless tileable top-down terrain texture for a mobile tower defense game. "
        "Warm golden-brown packed dirt with subtle cracks and small pebbles, patches of "
        "vibrant green moss and grass, a few tiny orange flowers. Seamless on all four "
        "edges so it tiles without visible seams. Hand-painted casual mobile game art "
        "style, rich saturated colors, top-down orthographic view, no text, no "
        "characters, no grid lines, no vignette."
    ),
}

TOWERS = {
    "tower-wood": "a simple wooden palisade tower of sharpened logs bound with rope, small and humble",
    "tower-stone": "a low grey stone bastion with battlements and a dark open top",
    "tower-eld-1": "a fire tower: stone base with a glowing bed of orange embers on top",
    "tower-eld-2": "a fire tower: stone tower with a molten glowing core, cracked lava veins and a flaming cannon barrel pointing up",
    "tower-is-1": "an ice tower: stone base with a pale blue frost crystal growing out of it",
    "tower-is-2": "an ice tower: tall spire of jagged blue ice shards with frozen mist around the base",
    "tower-blixt-1": "a lightning tower: stone base with a small copper tesla coil crackling on top",
    "tower-blixt-2": "a lightning tower: tall violet spire with arcing electricity between metal prongs",
    "tower-ljus-1": "a light tower: stone base holding a warm golden lantern",
    "tower-ljus-2": "a light tower: tall white and gold cannon aimed upward with a radiant sun emblem",
    "tower-morker-1": "a dark tower: a purple obsidian obelisk with faint violet glow",
    "tower-morker-2": "a dark tower: a swirling shadow portal held in a black stone frame, purple energy",
}

CREEPS = {
    "creep-swarm": "a tiny fast orange insect creature with six legs, seen from directly above walking downward",
    "creep-grunt": "a compact red armored foot soldier monster, seen from directly above walking downward",
    "creep-runner": "a slender yellow sprinting creature with long legs, seen from directly above running downward",
    "creep-regen": "a green slime creature with a glowing regenerating core, seen from directly above",
    "creep-drone": "a light blue flying drone creature with two feathered wings spread wide, seen from directly above",
    "creep-brute": "a heavy purple armored brute with thick shoulder plates and a small head, seen from directly above walking downward",
    "creep-boss": "an enormous dark red armored boss monster with curved horns and glowing eyes, seen from directly above walking downward",
    "creep-shade": "a translucent teal wraith creature trailing mist, seen from directly above",
    "creep-titan": "a colossal stone golem with molten cracks, seen from directly above walking downward",
    "creep-warden": "a bulky blue armored guardian beast with a glowing healing rune on its back, seen from directly above walking downward",
    "creep-brood": "a large violet winged broodmother insect with four spread wings, seen from directly above flying",
}

GROUPS = {"terrain": TERRAIN, "towers": TOWERS, "creeps": CREEPS}


def key(args):
    if args.key_file:
        with open(args.key_file) as f:
            return f.read().strip()
    k = os.environ.get("GEMINI_API_KEY")
    if not k:
        sys.exit("Ingen nyckel. Sätt GEMINI_API_KEY eller använd --key-file.")
    return k


def generate(name, prompt, api_key, retries=3):
    body = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"responseModalities": ["IMAGE"]},
    }).encode()
    url = (f"https://generativelanguage.googleapis.com/v1beta/models/"
           f"{MODEL}:generateContent?key={api_key}")
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url, data=body, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=180) as r:
                data = json.load(r)
            for part in data["candidates"][0]["content"]["parts"]:
                inline = part.get("inlineData") or part.get("inline_data")
                if inline:
                    raw = base64.b64decode(inline["data"])
                    path = os.path.join(OUT, name + ".png")
                    with open(path, "wb") as f:
                        f.write(raw)
                    return len(raw)
            raise RuntimeError("inget bilddata i svaret")
        except Exception as e:
            if attempt == retries - 1:
                print(f"  {name}: MISSLYCKADES — {e}")
                return 0
            time.sleep(2 + attempt * 3)
    return 0


def main():
    p = argparse.ArgumentParser()
    p.add_argument("groups", nargs="*", default=[], help="terrain, towers, creeps")
    p.add_argument("--only", action="append", default=[], help="ett enskilt namn")
    p.add_argument("--key-file")
    p.add_argument("--force", action="store_true", help="skriv över befintliga")
    args = p.parse_args()

    api_key = key(args)
    os.makedirs(OUT, exist_ok=True)

    jobs = {}
    for g in args.groups:
        jobs.update(GROUPS.get(g, {}))
    for name in args.only:
        for grp in GROUPS.values():
            if name in grp:
                jobs[name] = grp[name]
    if not jobs:
        sys.exit("Inget att göra. Ange terrain/towers/creeps eller --only <namn>.")

    for name, desc in jobs.items():
        path = os.path.join(OUT, name + ".png")
        if os.path.exists(path) and not args.force:
            print(f"  {name}: finns redan, hoppar över")
            continue
        prompt = desc if name in TERRAIN else (
            f"Top-down view of {desc}, for a tower defense game. {STYLE}")
        n = generate(name, prompt, api_key)
        print(f"  {name}: {'sparad ' + str(n // 1024) + ' kB' if n else 'MISSLYCKADES'}")


if __name__ == "__main__":
    main()
