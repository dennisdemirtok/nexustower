#!/usr/bin/env python3
"""Färglägger om markbilden mot spelets egen palett.

Bilden var målad i varm sand och gräsgrönt, vilket låg helt vid sidan av
det mörkblå gränssnittet — marken sköt fram och tornen försvann in i den.
I stället för att generera om den mappas ljusheten genom två ramper: en
indigo för jorden och en teal för mossan. Vilken ramp en pixel hamnar på
avgörs av hur grön den var, så mossa och jord fortsätter läsa som två
olika material i stället för att smälta ihop till en enda platta.

Körs en gång och checkas in — inget av det här sker i realtid.
"""
import sys
import numpy as np
from PIL import Image, ImageFilter

# Ramperna. Stoppen är (position, #hex) och interpoleras linjärt.
JORD = [(0.00, '#060a12'), (0.32, '#0e1826'), (0.58, '#18293c'),
        (0.80, '#273c52'), (1.00, '#3d5468')]
MOSSA = [(0.00, '#05100d'), (0.32, '#0b2620'), (0.58, '#134036'),
         (0.80, '#1e5f4a'), (1.00, '#368a6b')]


def ramp(stops, n=256):
    xs = np.array([s[0] for s in stops])
    cs = np.array([[int(s[1][i:i + 2], 16) for i in (1, 3, 5)] for s in stops], float)
    t = np.linspace(0, 1, n)
    return np.stack([np.interp(t, xs, cs[:, ch]) for ch in range(3)], 1)


def regrade(src, dst):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im, dtype=np.float32) / 255.0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]

    lum = 0.299 * r + 0.587 * g + 0.114 * b

    # Kaklingen syntes som ett rutmönster eftersom originalet har mörka
    # kanter. En kraftigt suddad kopia delas bort så bara den lokala
    # strukturen blir kvar och storskaliga ljushetsskillnader planas ut.
    blur = np.asarray(Image.fromarray((lum * 255).astype(np.uint8))
                      .filter(ImageFilter.GaussianBlur(70)), np.float32) / 255.0
    lum = np.clip(lum * (lum.mean() / np.maximum(blur, 0.04)), 0, 1)

    # Kontrasten dras isär lite så ramperna får något att arbeta med.
    lum = np.clip((lum - 0.5) * 1.18 + 0.46, 0, 1)

    # Hur grön var pixeln? Det avgör vilken ramp den hamnar på.
    gron = np.clip((g - (r + b) * 0.5) * 3.2, 0, 1)[..., None]

    idx = (lum * 255).astype(np.uint8)
    out = ramp(JORD)[idx] * (1 - gron) + ramp(MOSSA)[idx] * gron

    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(dst)
    print(f'{dst}  medelljushet {out.mean() / 255:.3f}')


if __name__ == '__main__':
    regrade(sys.argv[1], sys.argv[2])
