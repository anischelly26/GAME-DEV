"""
Synthesises The Stormworks Escape's sound effects as 16-bit mono WAV files (no recordings, no
licences: every sound is made here from noise, sines and envelopes).

    python tools/unreal/make_stormworks_sounds.py [out_dir]

Default out_dir: ../ItTakesOne-Unreal/Import/Stormworks/Audio (next to the repository). The level
builder (build_stormworks.py) imports them as /Game/ItTakesOne/Stormworks/Audio/S_TOS_*.
"""
import math
import os
import random
import struct
import sys
import wave

RATE = 44100
rng = random.Random(1975)


def secs(n):
    return int(n * RATE)


def noise(n):
    return [rng.uniform(-1.0, 1.0) for _ in range(n)]


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be a number or a per-sample list."""
    y, out = 0.0, []
    for i, v in enumerate(x):
        c = cutoff[i] if isinstance(cutoff, list) else cutoff
        a = 1.0 - math.exp(-2.0 * math.pi * c / RATE)
        y += a * (v - y)
        out.append(y)
    return out


def highpass(x, cutoff):
    lp = lowpass(x, cutoff)
    return [a - b for a, b in zip(x, lp)]


def bandpass(x, lo, hi):
    return lowpass(highpass(x, lo), hi)


def env(n, attack, decay_time, shape=1.0):
    """Attack then exponential decay (decay_time: seconds to fall to ~1/e^4)."""
    a = max(1, secs(attack))
    out = []
    for i in range(n):
        if i < a:
            out.append(i / a)
        else:
            t = (i - a) / RATE
            out.append(math.exp(-4.0 * (t / max(decay_time, 1e-3)) ** shape))
    return out


def tone(n, freq, phase=0.0, kind="sine"):
    """freq: number or per-sample list."""
    out, p = [], phase
    for i in range(n):
        f = freq[i] if isinstance(freq, list) else freq
        p += 2.0 * math.pi * f / RATE
        if kind == "sine":
            out.append(math.sin(p))
        elif kind == "saw":
            out.append(2.0 * ((p / (2 * math.pi)) % 1.0) - 1.0)
        elif kind == "square":
            out.append(1.0 if math.sin(p) >= 0 else -1.0)
    return out


def ramp(n, a, b, curve=1.0):
    return [a + (b - a) * (i / max(1, n - 1)) ** curve for i in range(n)]


def mul(*xs):
    return [math.prod(v) for v in zip(*xs)]


def add(*xs):
    n = max(len(x) for x in xs)
    return [sum(x[i] if i < len(x) else 0.0 for x in xs) for i in range(n)]


def gain(x, g):
    return [v * g for v in x]


def fade(x, fin=0.005, fout=0.02):
    n = len(x)
    a, b = secs(fin), secs(fout)
    return [v * min(1.0, i / max(1, a)) * min(1.0, (n - i) / max(1, b)) for i, v in enumerate(x)]


def normalise(x, peak=0.89):
    m = max(1e-9, max(abs(v) for v in x))
    return [v * peak / m for v in x]


def loopable(x, overlap):
    """Crossfade the tail into the head so the sound loops without a click."""
    o = secs(overlap)
    head, body, tail = x[:o], x[o:-o], x[-o:]
    mixed = [tail[i] * (1 - i / o) + head[i] * (i / o) for i in range(o)]
    return body + mixed


def write(out_dir, name, x):
    path = os.path.join(out_dir, name + ".wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(max(-1.0, min(1.0, v)) * 32767)) for v in x))
    print("%-22s %5.2f s" % (name, len(x) / RATE))


def metal_hit(n, freqs, decay):
    parts = [gain(mul(tone(n, f), env(n, 0.001, decay * (1.0 - 0.12 * k))), 1.0 / (k + 1)) for k, f in enumerate(freqs)]
    return add(*parts)


def build(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    S = {}

    # The hook leaving: a quick rising whoosh with a click.
    n = secs(0.32)
    S["S_TOS_Fire"] = add(
        mul(bandpass(noise(n), 800, 5000), ramp(n, 0.2, 1.0, 0.5), env(n, 0.02, 0.32)),
        gain(mul(noise(secs(0.012)), env(secs(0.012), 0.0005, 0.01)), 1.2),
    )
    # Latching: a bright clank of brass.
    n = secs(0.6)
    S["S_TOS_Latch"] = add(metal_hit(n, [520, 1310, 2180, 3470], 0.35), gain(mul(highpass(noise(n), 2000), env(n, 0.0005, 0.03)), 0.8))
    # Carried along the cable: a whirr that climbs.
    n = secs(1.1)
    f = ramp(n, 120, 340, 0.7)
    S["S_TOS_Reel"] = mul(add(gain(tone(n, f, kind="saw"), 0.4), gain(lowpass(noise(n), 1200), 0.6)), env(n, 0.03, 1.1, 2.0))
    # Refused: a dull thunk and a slack twang.
    n = secs(0.35)
    S["S_TOS_Refuse"] = add(mul(tone(n, ramp(n, 210, 120)), env(n, 0.002, 0.3)), gain(mul(lowpass(noise(n), 500), env(n, 0.001, 0.08)), 0.7))
    # A machine running along its track: grinding metal on a low rumble.
    n = secs(1.8)
    grind = mul(bandpass(noise(n), 300, 2400), [0.6 + 0.4 * math.sin(i / RATE * 2 * math.pi * 13) for i in range(n)])
    S["S_TOS_Grind"] = mul(add(grind, gain(tone(n, 52), 0.35)), env(n, 0.06, 1.8, 3.0))
    # Arriving: a heavy clunk.
    n = secs(0.7)
    S["S_TOS_Clunk"] = add(mul(tone(n, ramp(n, 95, 55)), env(n, 0.002, 0.45)), metal_hit(n, [310, 740], 0.25), gain(mul(lowpass(noise(n), 900), env(n, 0.001, 0.06)), 0.8))
    # Set down after the cable.
    n = secs(0.3)
    S["S_TOS_Land"] = add(mul(tone(n, ramp(n, 120, 70)), env(n, 0.002, 0.2)), gain(mul(lowpass(noise(n), 700), env(n, 0.001, 0.08)), 0.6))
    # A catwalk segment about to go: a straining creak.
    n = secs(0.9)
    f = [260 + 60 * math.sin(i / RATE * 9) + rng.uniform(-25, 25) for i in range(n)]
    S["S_TOS_Creak"] = mul(bandpass(tone(n, f, kind="saw"), 200, 1800), env(n, 0.15, 0.9, 2.0))
    # ...and gone: a long tearing crash into the sea.
    n = secs(1.8)
    S["S_TOS_Crash"] = add(
        mul(lowpass(noise(n), ramp(n, 6000, 400)), env(n, 0.005, 1.6)),
        metal_hit(n, [180, 410, 960, 1730], 0.9),
        gain(mul(tone(n, ramp(n, 70, 38)), env(n, 0.01, 1.2)), 0.8),
    )
    # The collapse starting: a deep rumble.
    n = secs(2.6)
    S["S_TOS_Rumble"] = mul(add(lowpass(noise(n), 160), gain(tone(n, 41), 0.4)), env(n, 0.3, 2.6, 2.0))
    # The storm engine's alarm: a two-tone klaxon (loops).
    n = secs(2.0)
    f = [620 if (i // secs(0.5)) % 2 == 0 else 470 for i in range(n)]
    S["S_TOS_Alarm"] = gain(lowpass(tone(n, f, kind="square"), 2200), 0.6)
    # The engine coming on: a long rising mechanical drone.
    n = secs(3.4)
    f = ramp(n, 32, 96, 0.6)
    S["S_TOS_EngineStart"] = mul(add(gain(tone(n, f, kind="saw"), 0.5), gain(tone(n, [v * 2.01 for v in f]), 0.3), gain(lowpass(noise(n), 400), 0.4)), env(n, 0.8, 3.4, 4.0))
    # Thunder: crackle, then a long roll.
    n = secs(4.0)
    roll = mul(lowpass(noise(n), 180), env(n, 0.25, 4.0, 1.5), [0.7 + 0.3 * math.sin(i / RATE * 5.3) for i in range(n)])
    crack = mul(bandpass(noise(n), 800, 4000), env(n, 0.003, 0.35))
    S["S_TOS_Thunder"] = add(gain(roll, 1.0), gain(crack, 0.5))
    # Wind and rain over the sea (loops): gusting low noise and a hiss of rain.
    n = secs(12.0)
    gust = [0.55 + 0.25 * math.sin(i / RATE * 0.7) + 0.2 * math.sin(i / RATE * 1.9 + 1.3) for i in range(n)]
    wind = mul(lowpass(noise(n), [350 + 250 * g for g in gust]), gust)
    rain = gain(highpass(noise(n), 3000), 0.12)
    S["S_TOS_Wind"] = loopable(add(wind, rain), 1.0)
    # Small rewards.
    n = secs(1.2)
    S["S_TOS_Pickup"] = add(mul(tone(n, 880), env(n, 0.005, 1.0)), gain(mul(tone(n, 1320), env(n, 0.12, 0.9)), 0.7), gain(mul(tone(n, 1760), env(n, 0.24, 0.8)), 0.5))
    n = secs(0.9)
    S["S_TOS_Checkpoint"] = add(mul(tone(n, 660), env(n, 0.005, 0.8)), gain(mul(tone(n, 990), env(n, 0.09, 0.7)), 0.6))
    n = secs(2.2)
    S["S_TOS_Complete"] = add(*[gain(mul([0.0] * secs(0.16 * k) + tone(n - secs(0.16 * k), f), [0.0] * secs(0.16 * k) + env(n - secs(0.16 * k), 0.005, 1.6)), 0.8 - 0.1 * k) for k, f in enumerate([523, 659, 784, 1047])])
    # Paper, and the sea.
    n = secs(0.45)
    S["S_TOS_Paper"] = mul(highpass(noise(n), 2500), [abs(math.sin(i / RATE * 40)) for i in range(n)], env(n, 0.01, 0.45))
    n = secs(1.0)
    S["S_TOS_Splash"] = add(mul(lowpass(noise(n), ramp(n, 4000, 300)), env(n, 0.005, 0.9)), gain(mul(tone(n, ramp(n, 140, 60)), env(n, 0.002, 0.3)), 0.5))

    for name, x in S.items():
        looped = name in ("S_TOS_Wind", "S_TOS_Alarm")
        write(out_dir, name, normalise(x if looped else fade(x)))


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    default = os.path.normpath(os.path.join(here, "..", "..", "..", "ItTakesOne-Unreal", "Import", "Stormworks", "Audio"))
    build(sys.argv[1] if len(sys.argv) > 1 else default)
