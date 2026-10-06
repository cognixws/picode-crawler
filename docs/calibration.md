# Calibration

Measured on 2026-10-05 from the reference video (11.2 s, 1358×1358, 30 fps;
frames at 1, 8 and 30 per second). The video is not in this repository.

| What | Observed | Here |
|---|---|---|
| Legs | 8, four per side | `legs: 8` |
| Segments per leg | 3 (two knees, then the foot) | `segments: 3` |
| A step | 3–4 frames at 30 fps (~100–130 ms) | `stepTime: 0.11` |
| Body | thin box along the heading, aspect ~1:2.7, an eye dot at the front | `bodyLength: 40`, `bodyWidth: 14` |
| Leg span vs body | legs 3–5 body lengths | `reach: 165` (≈4 bodies) |
| Footholds | small inline boxes (names, handles, dates, counters, avatars), gripped at an edge or corner | leaves ≤ 260×64, grip on the border |
| Body path | wanders near the middle of the view; does not follow the pointer | waypoints within 150 px of home |
| Scroll | feet ride their boxes; overstretched legs step | anchors relative to the box |
| Scan | thin lines to far boxes, outlined candidates, one thicker line to a far box | search lines fade in 1.1 s; a far look every 0.5–1.4 s |

Not settled: what each fill colour meant in the reference (several states),
so fills here mean one thing only: the box a foot stands on.
