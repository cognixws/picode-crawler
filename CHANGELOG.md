# Changelog

## 0.1.2 — 2026-10-06

- **Descend mode** (`data-descend`, or `descend: true` / `{speed}` from
  script): the creature walks down a long page, never turned more than 90°
  from straight down and never walking back up, and the page scrolls to keep
  it near the middle of the view, carrying it along.
- Fixed: on a scrolled page the creature found nothing to stand on. A long
  post or a column that starts far above the view was skipped whole, with
  everything on screen inside it.

## 0.1.1 — 2026-10-06

- Legs fan out in order around the body (knees along their rest directions,
  footholds in each leg's own sector): about 80% fewer crossing legs.
- A foot in the air stays at its rest distance from the hip, so a leg no
  longer folds into a V or curls into a hook.
- A longer stride among many boxes, such as a table (legs span about 280 px
  there instead of 175), so fewer legs lie across values.
- The body rests at a spot that covers no small box (an icon, a counter) when
  there is room: on a still page it sits over one about half as often. On a
  page that scrolls, boxes still pass under it, and a table has no free spot.

## 0.1.0 — 2026-10-06

- First version: the Crawler page (a reply thread with the creature, kept
  choices, reduced-motion aware), `ui/crawler.js` for any page, the
  `show.attach` tool and the `crawler` skill.
