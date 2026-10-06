import { test } from "node:test";
import assert from "node:assert/strict";
import { createCreature, update, frame, search, wrongSide, clearSpot, shift, solveChain, gripPoint, distToRect, neighbours, random } from "../lib/core.mjs";

// A page of boxes in rows, like a reply thread: rows hold small leaves.
// `dy` scrolls everything, the way a page scroll moves every box.
function page({ rows = 30, dy = 0 } = {}) {
  let id = 1;
  const root = { id: 0, children: [] };
  const rects = new Map();
  // Sections of 10 rows above the rows, as a page has: the search skips a
  // whole section with one read.
  let section = null;
  for (let r = 0; r < rows; r++) {
    if (r % 10 === 0) {
      section = { id: id++, children: [] };
      rects.set(section, { x: 90, y: 30 + r * 70, w: 620, h: 10 * 70 });
      root.children.push(section);
    }
    const row = { id: id++, children: [] };
    rects.set(row, { x: 100, y: 40 + r * 70, w: 600, h: 60 });
    for (let k = 0; k < 4; k++) {
      const leaf = { id: id++, children: null };
      rects.set(leaf, { x: 110 + k * 140, y: 50 + r * 70, w: 90, h: 18 });
      row.children.push(leaf);
    }
    section.children.push(row);
  }
  const tree = { root, reads: 0, dy, rect(n) { this.reads++; const b = rects.get(n); return b ? { x: b.x, y: b.y + this.dy, w: b.w, h: b.h } : null; } };
  return { tree, rects };
}

test("a point's distance to a box is 0 inside and euclidean outside", () => {
  const r = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(distToRect(r, 5, 5), 0);
  assert.equal(distToRect(r, 13, 14), 5);
});

test("a foot grips the border of a box, never its middle", () => {
  const r = { x: 0, y: 0, w: 100, h: 20 };
  assert.deepEqual(gripPoint(r, 50, 4), { x: 50, y: 0 });
  assert.deepEqual(gripPoint(r, 150, 10), { x: 100, y: 10 });
});

test("the search finds the nearest free leaf and prunes far rows", () => {
  const { tree } = page({ rows: 200 });
  const { best, visited } = search(tree, { x: 260, y: 190 }, 60, null, {});
  assert.ok(best, "found a leaf");
  assert.equal(best.rect.y, 190); // the row starting at y = 190 + 10
  assert.ok(tree.reads < 60, `read ${tree.reads} boxes of 1000`);
  assert.ok(visited.length > 0 && visited.length < 30);
  const again = search(tree, { x: 260, y: 190 }, 60, null, { taken: new Set([best.node.id]) });
  assert.notEqual(again.best.node.id, best.node.id, "a taken leaf is skipped");
});

test("a chain keeps its lengths, reaches what it can and stretches toward what it cannot", () => {
  const pts = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
  const L = [40, 35, 25];
  assert.equal(solveChain(pts, L, { x: 60, y: 30 }, { x: 10, y: -40 }), true);
  assert.ok(Math.hypot(pts[3].x - 60, pts[3].y - 30) < 0.5);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) - L[i]) < 0.01);
  assert.equal(solveChain(pts, L, { x: 500, y: 0 }, null), false);
  assert.ok(Math.abs(pts[3].x - 100) < 0.01 && Math.abs(pts[3].y) < 0.01);
});

test("neighbouring legs are the ones beside it and the one across", () => {
  assert.deepEqual(neighbours(0, 8).sort(), [1, 4]);
  assert.deepEqual(neighbours(5, 8).sort(), [4, 6, 1].sort());
});

test("the same seed walks the same way", () => {
  const run = () => {
    const { tree } = page();
    const c = createCreature({ seed: 7, home: { x: 400, y: 600 } });
    for (let i = 0; i < 240; i++) update(c, tree);
    return c.legs.map((l) => [Math.round(l.foot.x), Math.round(l.foot.y)]).flat().concat([Math.round(c.body.x), Math.round(c.body.y)]);
  };
  assert.deepEqual(run(), run());
  const a = random(1)(), b = random(2)();
  assert.notEqual(a, b);
});

test("two neighbouring legs are never in the air at once, and feet stand on boxes", () => {
  const { tree } = page();
  const c = createCreature({ seed: 3, home: { x: 400, y: 600 } });
  let planted = 0;
  for (let i = 0; i < 600; i++) {
    update(c, tree);
    for (const leg of c.legs) {
      if (!leg.step) continue;
      for (const j of neighbours(leg.i, 8)) assert.equal(c.legs[j].step, null, `legs ${leg.i} and ${j} flew together at step ${i}`);
    }
    planted += c.legs.filter((l) => l.anchor).length;
  }
  assert.ok(planted / 600 >= 4, `on average ${planted / 600} feet stood on boxes`);
});

test("a scroll carries the planted feet with their boxes, then the legs step", () => {
  const { tree } = page();
  const c = createCreature({ seed: 5, home: { x: 400, y: 600 } });
  for (let i = 0; i < 120; i++) update(c, tree);
  const leg = c.legs.find((l) => l.anchor && !l.step);
  assert.ok(leg, "a planted leg");
  const before = { ...leg.foot };
  tree.dy -= 12;
  update(c, tree);
  if (leg.anchor) assert.ok(Math.abs(leg.foot.y - (before.y - 12)) < 0.01, "the foot moved with its box");
  let steps = 0;
  for (let i = 0; i < 300; i++) { tree.dy -= 1.2; update(c, tree); steps += c.legs.filter((l) => l.step && l.step.t < 0.1).length; }
  assert.ok(steps > 10, `the legs stepped ${steps} times while the page scrolled`);
});

test("calm mode does not wander; steps land at once", () => {
  const { tree } = page();
  const c = createCreature({ seed: 9, home: { x: 400, y: 600 } });
  c.calm = true;
  for (let i = 0; i < 300; i++) update(c, tree);
  assert.equal(Math.round(c.body.x), 400);
  assert.equal(Math.round(c.body.y), 600);
  assert.ok(c.legs.every((l) => !l.step));
  const f = frame(c, tree);
  assert.equal(f.legs.length, 8);
});

test("no planted foot stays on the far side of the body", () => {
  const { tree } = page();
  const c = createCreature({ seed: 4, home: { x: 400, y: 600 } });
  let worst = 0;
  for (let i = 0; i < 900; i++) {
    tree.dy -= 0.6;
    update(c, tree);
    // A step to fix it takes a few frames; a foot may not stay wrong longer.
    for (const leg of c.legs) {
      leg.wrongFor = leg.anchor && wrongSide(c, leg, leg.foot) ? (leg.wrongFor || 0) + 1 : 0;
      worst = Math.max(worst, leg.wrongFor);
    }
  }
  assert.ok(worst <= 30, `a foot stayed on the far side for ${worst} frames`);
});

function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

test("planted legs rarely cross one another", () => {
  const { tree } = page();
  const c = createCreature({ seed: 2, home: { x: 400, y: 600 } });
  let crossings = 0, frames = 0;
  for (let i = 0; i < 600; i++) {
    update(c, tree);
    if (i < 120) continue;
    frames++;
    const legs = c.legs.filter((l) => l.anchor);
    for (let a = 0; a < legs.length; a++) for (let b = a + 1; b < legs.length; b++) {
      const A = legs[a].joints, B = legs[b].joints;
      let hit = false;
      for (let i2 = 1; i2 < A.length && !hit; i2++) for (let j = 1; j < B.length && !hit; j++) hit = segmentsCross(A[i2 - 1], A[i2], B[j - 1], B[j]);
      if (hit) crossings++;
    }
  }
  // Measured 2026-10-06: 4.61 crossing pairs per frame before the knees
  // followed the rest directions, 0.89 after.
  assert.ok(crossings / frames < 1.2, `${(crossings / frames).toFixed(2)} crossing pairs per frame`);
});

test("a swinging foot never comes under its hip", () => {
  const { tree } = page();
  const c = createCreature({ seed: 6, home: { x: 400, y: 600 } });
  let closest = Infinity;
  for (let i = 0; i < 600; i++) {
    tree.dy -= 0.8;
    update(c, tree);
    // A step that just began still stands where it was planted; measure it in flight.
    for (const leg of c.legs) if (leg.step && leg.step.t > 0) closest = Math.min(closest, Math.hypot(leg.foot.x - leg.hip.x, leg.foot.y - leg.hip.y));
  }
  assert.ok(closest >= c.o.reach * 0.62 - 0.01, `a foot in the air came ${closest.toFixed(1)} px from its hip`);
});

test("the body comes to rest off small boxes when there is room", () => {
  const { tree } = page();
  const c = createCreature({ seed: 8, home: { x: 400, y: 600 } });
  let clear = 0, picks = 0, last = null;
  for (let i = 0; i < 1800; i++) {
    update(c, tree);
    if (c.waypoint !== last) { last = c.waypoint; picks++; if (clearSpot(c, tree, c.waypoint)) clear++; }
  }
  assert.ok(picks > 5 && clear / picks > 0.8, `${clear} of ${picks} resting spots were clear`);
});

test("descending: never turned more than 90° from down, never walking back up", () => {
  const { tree } = page({ rows: 60 });
  const c = createCreature({ seed: 12, home: { x: 400, y: 300 }, heading: { toward: Math.PI / 2, within: Math.PI / 2 } });
  c.body.a = Math.PI / 2;
  let worst = 0, up = 0;
  for (let i = 0; i < 1200; i++) {
    const home = { x: 400, y: 300 + i * 0.6 };
    const y0 = c.body.y;
    update(c, tree, { home });
    const off = Math.abs(Math.atan2(Math.sin(c.body.a - Math.PI / 2), Math.cos(c.body.a - Math.PI / 2)));
    worst = Math.max(worst, off);
    if (c.body.y < y0 - 1e-9) up++;
  }
  assert.ok(worst <= Math.PI / 2 + 1e-9, `turned ${(worst * 180 / Math.PI).toFixed(1)}° from down`);
  assert.equal(up, 0, "the body moved up");
  assert.ok(c.body.y > 600, `it went down the page (y ${c.body.y.toFixed(0)})`);
});

test("a scroll shift moves the creature but not the feet its boxes hold", () => {
  const { tree } = page();
  const c = createCreature({ seed: 3, home: { x: 400, y: 600 } });
  for (let i = 0; i < 120; i++) update(c, tree);
  const held = c.legs.find((l) => l.anchor && !l.step), free = c.legs.find((l) => !l.anchor);
  const b = { ...c.body }, h = { ...held.foot }, f = free && { ...free.foot };
  shift(c, 0, -50);
  assert.equal(c.body.y, b.y - 50);
  assert.deepEqual(held.foot, h, "a held foot stays with its box");
  if (f) assert.equal(free.foot.y, f.y - 50);
});
