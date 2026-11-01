"""
Measures a WAV of the game's own output: integrated loudness (ITU-R BS.1770, gated), peak, and the
loudness of named stretches of it. It reports numbers; it does not say whether anything sounds good.

    python tools/unreal/measure_audio.py <output.wav> [results.txt]

With the bot's results.txt, each "-- step" line marks a stretch of the recording.
"""
import re
import sys
import wave

import numpy as np
from scipy.signal import lfilter


def load(path):
    with wave.open(path, "rb") as w:
        rate, channels, width, frames = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
        raw = w.readframes(frames)
    if width == 2:
        x = np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768.0
    elif width == 4:
        x = np.frombuffer(raw, dtype=np.int32).astype(np.float64) / 2147483648.0
    else:
        raise SystemExit("unsupported sample width %d" % width)
    return x.reshape(-1, channels), rate


def k_weight(x, rate):
    # The BS.1770 pre-filter and RLB filter, derived for this sample rate.
    f0, g, q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    k = np.tan(np.pi * f0 / rate)
    vh, vb = 10 ** (g / 20), 10 ** (g / 20) ** 0.4996667741545416
    a0 = 1 + k / q + k * k
    b1 = [(vh + vb * k / q + k * k) / a0, 2 * (k * k - vh) / a0, (vh - vb * k / q + k * k) / a0]
    a1 = [1, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]
    f0, q = 38.13547087602444, 0.5003270373238773
    k = np.tan(np.pi * f0 / rate)
    a0 = 1 + k / q + k * k
    b2, a2 = [1, -2, 1], [1, 2 * (k * k - 1) / a0, (1 - k / q + k * k) / a0]
    return lfilter(b2, a2, lfilter(b1, a1, x, axis=0), axis=0)


def block_powers(w, rate, block=0.4, step=0.1):
    n, h = int(block * rate), int(step * rate)
    power = np.sum(w ** 2, axis=1)
    cum = np.concatenate(([0.0], np.cumsum(power)))
    starts = np.arange(0, max(len(power) - n, 1), h)
    return (cum[starts + n] - cum[starts]) / n


def lufs(w, rate):
    if len(w) < int(0.4 * rate):
        return float("nan")
    z = block_powers(w, rate)
    z = z[z > 0]
    if len(z) == 0:
        return float("-inf")
    loud = -0.691 + 10 * np.log10(z)
    z = z[loud > -70]
    if len(z) == 0:
        return float("-inf")
    relative = -0.691 + 10 * np.log10(z.mean()) - 10
    z2 = z[-0.691 + 10 * np.log10(z) > relative]
    return -0.691 + 10 * np.log10(z2.mean()) if len(z2) else float("-inf")


def main():
    x, rate = load(sys.argv[1])
    w = k_weight(x, rate)
    print("%.1f s, %d Hz, %d channels" % (len(x) / rate, rate, x.shape[1]))
    print("integrated %.1f LUFS, sample peak %.1f dBFS" % (lufs(w, rate), 20 * np.log10(max(np.abs(x).max(), 1e-9))))
    if len(sys.argv) > 2:
        marks = []
        for line in open(sys.argv[2], encoding="utf-8"):
            m = re.match(r"\[\s*([\d.]+)\]\s+-- (.+)", line)
            if m:
                marks.append((float(m.group(1)), m.group(2).strip()))
        for (t0, name), (t1, _) in zip(marks, marks[1:] + [(len(x) / rate, "")]):
            a, b = int(t0 * rate), int(t1 * rate)
            if b - a >= int(1.0 * rate):
                print("  %6.1f-%6.1f  %6.1f LUFS  %s" % (t0, t1, lufs(w[a:b], rate), name))


if __name__ == "__main__":
    main()
