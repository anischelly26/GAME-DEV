"""
Synthesises the house slice's sounds (docs/STORY_HOUSE_AND_NACRE.md) as 16-bit mono WAV files, with
the same helpers as make_stormworks_sounds.py: no recordings, no licences.

    python tools/unreal/make_house_sounds.py [out_dir]

build_house.py runs this itself and imports the results as /Game/ItTakesOne/Stormworks/Audio/H_*.
LOOPS are the ones imported looping; NEAR and FAR are the ones heard in the world (with attenuation).
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_stormworks_sounds import (RATE, add, bandpass, env, fade, gain, highpass, loopable, lowpass,  # noqa: E402
                                    mul, noise, normalise, ramp, secs, tone, write)

rng = random.Random(1958)
LOOPS = ("H_Slither", "H_RoomTone", "H_MotifLow", "H_Searchlight", "H_Heartbeat", "H_Underwater")
NEAR = ("H_Slither", "H_Suction", "H_Slurp", "H_Exhale", "H_Sniff", "H_WaterClimb")
FAR = ("H_Searchlight",)

# Ivo's motif: four notes in the spiral's rhythm (long, short, short, long).
MOTIF = ((0.0, 587.3), (0.6, 740.0), (0.9, 880.0), (1.2, 659.3))


def at(n, start, x):
    """x placed start seconds into a buffer of n samples."""
    s = secs(start)
    return [0.0] * s + x[: max(0, n - s)]


def bell(n, f, decay=2.2, level=1.0):
    parts = [(1.0, 1.0, decay), (2.756, 0.4, decay * 0.5), (5.404, 0.15, decay * 0.25)]
    return gain(add(*[gain(mul(tone(n, f * r), env(n, 0.002, t)), g) for r, g, t in parts]), level)


def thump(n, f, decay):
    return mul(tone(n, ramp(n, f * 1.6, f, 0.3)), env(n, 0.004, decay))


def build(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    S = {}

    # --- Nacre: wet, close, a little comic.
    n = secs(2.0)
    wobble = [0.5 + 0.5 * math.sin(2 * math.pi * 1.7 * i / RATE) * math.sin(2 * math.pi * 0.6 * i / RATE + 1.0) for i in range(n)]
    clicks = [0.0] * n
    for _ in range(14):
        c = rng.randrange(0, n - secs(0.02))
        for k in range(secs(0.015)):
            clicks[c + k] += rng.uniform(-1, 1) * math.exp(-k / secs(0.004))
    S["H_Slither"] = loopable(add(mul(bandpass(noise(n), 300, 1400), wobble), gain(bandpass(clicks, 800, 3000), 0.6)), 0.3)
    n = secs(0.55)
    S["H_Suction"] = add(mul(lowpass(noise(n), ramp(n, 300, 2500)), env(n, 0.25, 0.3, 0.6)),
                         gain(mul(tone(n, ramp(n, 420, 110, 0.5)), [0.0] * secs(0.38) + env(n - secs(0.38), 0.002, 0.12)), 1.2))
    n = secs(0.85)
    gurgle = mul(tone(n, ramp(n, 260, 120)), [0.5 + 0.5 * math.sin(2 * math.pi * 24 * i / RATE) for i in range(n)])
    S["H_Slurp"] = add(mul(lowpass(noise(n), ramp(n, 3000, 250)), env(n, 0.02, 0.8)), gain(mul(gurgle, env(n, 0.05, 0.7)), 0.8))
    n = secs(0.9)
    S["H_Exhale"] = mul(lowpass(noise(n), ramp(n, 900, 350)), env(n, 0.3, 0.7, 0.8))
    n = secs(0.6)
    sniff = add(mul(highpass(noise(n), 1500), at(n, 0.0, env(secs(0.18), 0.12, 0.08))),
                mul(highpass(noise(n), 1800), at(n, 0.25, env(secs(0.22), 0.15, 0.1))))
    S["H_Sniff"] = sniff
    n = secs(1.6)
    plinks = [0.0] * n
    for _ in range(18):
        s = rng.uniform(0.0, 1.3)
        f = rng.uniform(1400, 3200)
        plinks = add(plinks, gain(at(n, s, mul(tone(secs(0.12), ramp(secs(0.12), f, f * 1.25)), env(secs(0.12), 0.002, 0.08))), 0.4))
    S["H_WaterClimb"] = add(plinks, gain(mul(bandpass(noise(n), 900, 2500), env(n, 0.3, 1.4)), 0.25))

    # --- The house: room tone with the clock in it; the lighthouse's hum carrying the motif.
    # 4.2 s, cross-faded by 0.2 s: a 4.0 s loop, so the clock ticks stay a second apart.
    n = secs(4.2)
    ticks = [0.0] * n
    for k in range(4):
        click = mul(bandpass(noise(secs(0.03)), 2000, 5000), env(secs(0.03), 0.001, 0.02))
        ticks = add(ticks, gain(at(n, k + (0.0 if k % 2 == 0 else 0.03), click), 0.35 if k % 2 == 0 else 0.25))
    S["H_RoomTone"] = loopable(add(gain(lowpass(noise(n), 260), 0.4), ticks), 0.2)
    n = secs(8.5)
    hum = add(gain(tone(n, 55.0), 0.5), gain(tone(n, 110.0), 0.25), gain(tone(n, 165.0), 0.1))
    low = [0.0] * n
    for t, f in MOTIF:
        low = add(low, at(n, 2.0 + t * 1.6, bell(secs(3.0), f / 4.0, 2.6, 0.5)))
    S["H_MotifLow"] = loopable(add(gain(hum, 0.4), low), 0.5)
    n = secs(3.4)
    motif = [0.0] * n
    for t, f in MOTIF:
        motif = add(motif, at(n, t, bell(secs(2.2), f, 2.0, 1.0 if t in (0.0, 1.2) else 0.75)))
    S["H_Motif"] = motif

    # --- The Watch: a far horn; the house shaking; the searchlight's hum.
    n = secs(2.2)
    horn = add(*[gain(tone(n, [180 * h * (1 + 0.006 * math.sin(2 * math.pi * 5 * i / RATE)) for i in range(n)]), 1.0 / h) for h in (1, 2, 3, 4)])
    horn = mul(lowpass(horn, 900), env(n, 0.15, 2.0, 0.5))
    S["H_Horn"] = add(horn, gain(at(n, 0.35, horn), 0.35))
    n = secs(2.2)
    rattle = [0.0] * n
    for _ in range(60):
        rattle = add(rattle, gain(at(n, rng.uniform(0, 1.9), mul(bandpass(noise(secs(0.02)), 1500, 6000), env(secs(0.02), 0.001, 0.015))), rng.uniform(0.2, 0.6)))
    S["H_Shake"] = add(mul(lowpass(noise(n), 120), env(n, 0.2, 2.0, 0.6)), gain(rattle, 0.5))
    n = secs(2.0)
    S["H_Searchlight"] = loopable(add(gain(tone(n, 100.0), 0.4), gain(tone(n, 200.0), 0.2), gain(tone(n, 300.0), 0.1), gain(bandpass(noise(n), 2000, 6000), 0.05)), 0.2)

    # --- The grab and the deep.
    n = secs(3.0)
    S["H_Grab"] = add(mul(lowpass(noise(n), ramp(n, 6000, 200)), env(n, 0.05, 2.8)), gain(mul(tone(n, ramp(n, 90, 40)), env(n, 0.01, 1.5)), 0.8))
    # One swimming stroke: a soft push of water.
    n = secs(0.5)
    S["H_Stroke"] = add(mul(bandpass(noise(n), 180, 900), env(n, 0.09, 0.38, 0.7)), gain(mul(tone(n, ramp(n, 160, 90)), env(n, 0.06, 0.3)), 0.25))
    # The bubble closing over her head: a rubbery wobble.
    n = secs(0.9)
    wob = [170.0 * (1 + 0.3 * math.sin(2 * math.pi * 7 * i / RATE) * math.exp(-i / secs(0.35))) for i in range(n)]
    S["H_Wobble"] = add(mul(tone(n, wob), env(n, 0.01, 0.8)), gain(mul(lowpass(noise(n), 400), env(n, 0.005, 0.25)), 0.4))
    n = secs(0.8)
    beat = add(thump(n, 55.0, 0.18), gain(at(n, 0.22, thump(secs(0.5), 50.0, 0.15)), 0.7))
    S["H_Heartbeat"] = beat
    n = secs(4.0)
    bubbles = [0.0] * n
    for _ in range(12):
        f = rng.uniform(500, 1200)
        bubbles = add(bubbles, gain(at(n, rng.uniform(0.1, 3.7), mul(tone(secs(0.08), ramp(secs(0.08), f, f * 2.2)), env(secs(0.08), 0.004, 0.05))), 0.25))
    S["H_Underwater"] = loopable(add(gain(lowpass(noise(n), 140), 1.0), bubbles), 0.4)

    for name, x in S.items():
        write(out_dir, name, normalise(x if name in LOOPS else fade(x)))
    return sorted(S)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    default = os.path.normpath(os.path.join(here, "..", "..", "unreal", "Intermediate", "HouseAudio"))
    build(sys.argv[1] if len(sys.argv) > 1 else default)
