# Chapter One opening, beat by beat

Captured at commit `4bd9d1b` with:

```bash
node scripts/capture-opening.mjs --url http://localhost:5241 --channel msedge --size 1280x720 --quality low --format jpg --out docs/evidence/chapter-one
```

The environment was Edge on Windows 11, with the Intel UHD Graphics GPU and the Low preset (what
Auto picks on that GPU). The simulation is stepped deterministically with a render on every step,
so the times below are story time, not wall-clock time. These are still frames: they show
framing, poses and text, not motion quality or frame rate.

| File | Story time | Beat |
| --- | ---: | --- |
| `01-card-saltmere.jpg` | 2.5 s | Card 1: Saltmere, the night before |
| `02-card-asleep.jpg` | 8.5 s | Card 2: she refused, and fell asleep over the drawings |
| `03-card-woke-up.jpg` | 13.0 s | Card 3: she woke up somewhere else |
| `04-cell-asleep.jpg` | 15.6 s | Mara asleep on the cell floor; the Warden's horn |
| `05-getting-up.jpg` | 17.4 s | Getting up |
| `06-standing.jpg` | 19.0 s | Standing |
| `07-looking-around.jpg` | 20.6 s | Face on, looking around: "This isn't my workshop." |
| `08-breakwater.jpg` | 23.0 s | "I know this place. Breakwater." |
| `09-chapter-title.jpg` | 27.5 s | Chapter One, *The Quiet Cell* |
| `10-control.jpg` | 31.5 s | Control returned; objective and the fresh-copper line |
