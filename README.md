# Crawler

A PiCode extension: a small procedural creature that walks over a page's
boxes while an agent works on it. Its feet grip names, dates, counters and
table cells; the page can scroll under it and the feet ride along.

**It is an illustration.** It shows that an agent is working on a page, never
what the agent reads. Agents are told so, and the tool says so in its answer.

| Part | What it does |
|---|---|
| Page **Crawler** (Apps tile and tab, phone in More → Apps) | A reply thread that scrolls by itself with the creature on it. Pause, scroll speed, search lines, fills and a new creature; the choices are kept |
| Tool `show.attach` (all nine CLIs) | Copies an HTML file and the local files it links into a new folder with the crawler added, ready for the artifact tool |
| Skill `crawler` (Pi, Omp, Claude Code) | The flow: attach, publish before working, work, reply |

It asks PiCode for nothing: no permissions, no background process.

## Example

You drop `vendas.html` in the workspace and ask the agent to analyse it. The
agent calls `show.attach`, publishes the folder as an artifact with
`capabilities: ["picode"]`, and the page opens beside you with the creature
walking over the table while the agent works. When the agent stops working
the creature fades out (once you allow the `picode` door; without it, it keeps
walking until the page is replaced).

## Any page

`ui/crawler.js` runs on any page:

```html
<script src="crawler.js" data-crawler></script>
```

| Attribute | Effect |
|---|---|
| `data-agent="<id>"` | Leave when that agent stops working (needs the artifact's `picode` door) |
| `data-highlights` | Fill the boxes it stands on (off by default: a fill reads as "this was read") |
| `data-scan="off"` | No search lines |
| `data-motion="always"` | Animate even when the system asks for reduced motion |
| `data-descend` | Walk down the page, never turning more than 90° from down; the page scrolls to follow |

From script: `Crawler.start({seed, home, scan, highlights, motion, root, descend, scroller})`
returns `{pause, resume, set, stop}`. An element with `data-crawler-ignore`
(and everything inside it) is never stepped on.

**Reduced motion.** When the system asks for less motion the creature stands
still and its feet follow the page without animation; the demo page offers
**Animate anyway**.

## How it walks

`lib/core.mjs` has no DOM: a tree of boxes, a hierarchical search that skips
whole regions that are out of reach, legs solved with FABRIK (three segments,
knees bent away from the body), and a gait that never lifts two neighbouring
legs together. It advances in fixed 1/60 s steps from a seed, so a scene
replays the same way. `lib/dom.mjs` builds the tree from the page, draws on one
canvas (no pointer events, `aria-hidden`) with PiCode's `--pc-*` tokens, and
stops when the page is hidden. The measurements behind the numbers are in
[docs/calibration.md](docs/calibration.md).

## Develop

```bash
node scripts/build.mjs        # lib/ → ui/crawler.js (committed; the test checks it)
node --test test/*.test.mjs
```

Install from this folder in PiCode: Extensions → Install → the folder path.

## Credit

The idea of a creature crawling over a page's DOM comes from an art
experiment posted by [@rybinfx](https://x.com/rybinfx/status/2107245547556163669).
This is an independent implementation: no code or assets from it.

## License

Apache-2.0
