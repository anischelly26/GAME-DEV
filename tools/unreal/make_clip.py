"""
Turns the frames saved by a -StormClip self-test run into a short looping GIF.

    powershell -File tools/unreal/run_selftest.ps1 -Clip
    python tools/unreal/make_clip.py [<clip folder>] [<out.gif>] [--width 480]

The frames are 0.1 s apart in game time, so 10 fps plays back at real speed. Needs Pillow.
"""
import argparse
import glob
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_CLIP = os.path.normpath(os.path.join(HERE, "..", "..", "..", "ItTakesOne-Unreal", "e", "Saved", "StormworksSelfTest", "clip"))
DEFAULT_OUT = os.path.normpath(os.path.join(HERE, "..", "..", "docs", "evidence", "stormworks", "climax.gif"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clip", nargs="?", default=DEFAULT_CLIP)
    ap.add_argument("out", nargs="?", default=DEFAULT_OUT)
    ap.add_argument("--width", type=int, default=480)
    ap.add_argument("--fps", type=float, default=10.0)
    args = ap.parse_args()

    paths = sorted(glob.glob(os.path.join(args.clip, "frame_*.png")))
    if not paths:
        raise SystemExit("no frames in %s: run run_selftest.ps1 -Clip first" % args.clip)
    frames = []
    for p in paths:
        im = Image.open(p).convert("RGB")
        h = round(im.height * args.width / im.width)
        im = im.resize((args.width, h), Image.LANCZOS)
        # One palette per frame: the storm is mostly blue-grey, the tether teal, the lamps amber.
        frames.append(im.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    frames[0].save(args.out, save_all=True, append_images=frames[1:], duration=round(1000 / args.fps), loop=0, optimize=True)
    print("%d frames -> %s (%.1f s, %d KB)" % (len(frames), args.out, len(frames) / args.fps, os.path.getsize(args.out) // 1024))


if __name__ == "__main__":
    main()
