// The crawler's engine, with no DOM: a tree of boxes, a hierarchical search
// for footholds, legs solved with FABRIK, and a gait that never lifts two
// neighbouring legs at once. Everything advances in fixed steps from a seed,
// so a scene replays the same way in a test and in a browser.

export const STEP = 1 / 60;
const SCAN_LIFE = 1.1;

export const DEFAULTS = Object.freeze({
  legs: 8,            // four per side, front to back
  segments: 3,        // hip → knee → ankle → foot
  bodyLength: 40,
  bodyWidth: 14,
  reach: 165,         // a fully stretched leg: about four bodies, as measured
  restReach: 0.62,    // where a foot wants to be, as a share of reach
  stepTime: 0.11,     // seconds a foot is in the air (measured: 3–4 frames at 30 fps)
  stepLift: 9,        // how far a step arcs away from the body
  stepError: 0.42,    // a foot this far from rest (share of reach) asks to step
  maxAirborne: 2,     // the reference keeps nearly every foot down
  wanderRadius: 150,  // how far the body strays from home
  speed: 70,          // body cruise speed, px/s
  searchSlack: 0.8,  // the search looks this far around the ideal foot (share of reach)
});

// mulberry32: small, fast and good enough to pick waypoints.
export function random(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hypot = Math.hypot;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// The distance from a point to a box; 0 inside.
export function distToRect(r, x, y) {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return hypot(dx, dy);
}

// The point on a box's border nearest to (x, y): a foot grips edges, the way
// it does in the reference, never the middle of a box.
export function gripPoint(r, x, y) {
  let gx = clamp(x, r.x, r.x + r.w);
  let gy = clamp(y, r.y, r.y + r.h);
  if (gx > r.x && gx < r.x + r.w && gy > r.y && gy < r.y + r.h) {
    const left = gx - r.x, right = r.x + r.w - gx, top = gy - r.y, bottom = r.y + r.h - gy;
    const m = Math.min(left, right, top, bottom);
    if (m === left) gx = r.x; else if (m === right) gx = r.x + r.w; else if (m === top) gy = r.y; else gy = r.y + r.h;
  }
  return { x: gx, y: gy };
}

// A tree is { root, rect(node) } where a node is { id, children } and
// rect(node) answers its box now ({x, y, w, h}) or null when it is gone or
// hidden. Leaves are nodes without children. `avoid(x, y)` says a point is
// off limits (a native page, the crawler's own controls).
//
// search() walks from the root and prunes every subtree whose box is farther
// than `radius` from the ideal point, so a page of thousands of boxes costs a
// few dozen reads. It returns the best free leaf and every node it looked at,
// which the renderer draws as the scan.
export function search(tree, ideal, radius, from, opts = {}) {
  const taken = opts.taken || new Set();
  const avoid = opts.avoid || (() => false);
  const maxW = opts.maxW || 260, maxH = opts.maxH || 64;
  const accept = opts.accept || (() => true);
  const visited = [];
  let best = null;
  let bestScore = Infinity;
  const stack = [tree.root];
  while (stack.length) {
    const node = stack.pop();
    const r = node === tree.root ? null : tree.rect(node);
    if (node !== tree.root) {
      if (!r || r.w < 1 || r.h < 1) continue;
      if (distToRect(r, ideal.x, ideal.y) > radius) continue;
      if (!node.children) visited.push(node);
    }
    if (node.children && node.children.length) {
      for (const c of node.children) stack.push(c);
      continue;
    }
    if (!r || taken.has(node.id)) continue;
    // Feet grip inline things (a name, a date, a counter), never a block.
    if (r.w > maxW || r.h > maxH) continue;
    const g = gripPoint(r, ideal.x, ideal.y);
    if (avoid(g.x, g.y) || !accept(g)) continue;
    if (from && hypot(g.x - from.x, g.y - from.y) > opts.reach) continue;
    // Near the ideal point first; small inline boxes (names, dates, counters)
    // beat wide blocks, the way the reference picks them.
    const score = hypot(g.x - ideal.x, g.y - ideal.y) + Math.min(r.w * r.h, 40000) * 0.0015;
    if (score < bestScore) { bestScore = score; best = { node, grip: g, rect: r }; }
  }
  return { best, visited };
}

// FABRIK on a chain of points with fixed segment lengths. `pole` bends the
// knees outward so a leg reads as a spider's, not a straight stick. Returns
// whether the target was reached.
export function solveChain(points, lengths, target, pole, iterations = 10) {
  const n = points.length;
  const base = { x: points[0].x, y: points[0].y };
  const total = lengths.reduce((a, b) => a + b, 0);
  const d = hypot(target.x - base.x, target.y - base.y);
  if (d >= total) {
    const ux = (target.x - base.x) / (d || 1), uy = (target.y - base.y) / (d || 1);
    let acc = 0;
    for (let i = 1; i < n; i++) { acc += lengths[i - 1]; points[i].x = base.x + ux * acc; points[i].y = base.y + uy * acc; }
    return false;
  }
  if (pole) {
    // Start every solve from a bent guess (hip → pole → target), so a knee
    // never flips to the inside from one frame to the next.
    const a = hypot(pole.x - base.x, pole.y - base.y), b = hypot(target.x - pole.x, target.y - pole.y);
    let acc = 0;
    for (let i = 1; i < n; i++) {
      acc += lengths[i - 1];
      const f = Math.min(1, acc / total) * (a + b);
      if (f <= a) { const k = f / (a || 1); points[i].x = base.x + (pole.x - base.x) * k; points[i].y = base.y + (pole.y - base.y) * k; }
      else { const k = (f - a) / (b || 1); points[i].x = pole.x + (target.x - pole.x) * k; points[i].y = pole.y + (target.y - pole.y) * k; }
    }
  }
  for (let it = 0; it < iterations; it++) {
    points[n - 1].x = target.x; points[n - 1].y = target.y;
    for (let i = n - 2; i >= 0; i--) {
      const dx = points[i].x - points[i + 1].x, dy = points[i].y - points[i + 1].y;
      const l = hypot(dx, dy) || 1, k = lengths[i] / l;
      points[i].x = points[i + 1].x + dx * k; points[i].y = points[i + 1].y + dy * k;
    }
    points[0].x = base.x; points[0].y = base.y;
    for (let i = 1; i < n; i++) {
      const dx = points[i].x - points[i - 1].x, dy = points[i].y - points[i - 1].y;
      const l = hypot(dx, dy) || 1, k = lengths[i - 1] / l;
      points[i].x = points[i - 1].x + dx * k; points[i].y = points[i - 1].y + dy * k;
    }
    if (hypot(points[n - 1].x - target.x, points[n - 1].y - target.y) < 0.25) break;
  }
  return true;
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Legs i = 0..3 are the left side front to back, 4..7 the right side.
function legLayout(i, legs) {
  const half = legs / 2;
  const side = i < half ? -1 : 1;
  const k = i % half;
  const along = half > 1 ? 0.42 - (k / (half - 1)) * 0.84 : 0;         // hip along the body
  const spread = half > 1 ? 0.62 + (k / (half - 1)) * 1.9 : Math.PI / 2; // rest angle from the heading
  return { side, k, along, spread };
}

export function neighbours(i, legs) {
  const half = legs / 2;
  const side = i < half ? 0 : 1;
  const k = i % half;
  const out = [];
  if (k > 0) out.push(side * half + k - 1);
  if (k < half - 1) out.push(side * half + k + 1);
  out.push((1 - side) * half + k);
  return out;
}

export function createCreature(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const rnd = random(o.seed ?? 1);
  const home = { x: o.home?.x ?? 400, y: o.home?.y ?? 300 };
  const c = {
    o, rnd, home,
    t: 0,
    body: { x: home.x, y: home.y, a: -Math.PI / 2, vx: 0, vy: 0 },
    waypoint: { x: home.x, y: home.y },
    nextWaypoint: 0,
    look: null, nextLook: 0.6,
    scan: [],      // { node, t } recently looked at
    legs: [],
    calm: false,   // reduced motion: no wandering, steps land at once
  };
  const lengths = [0.38, 0.34, 0.28].slice(0, o.segments).map((f) => f * o.reach);
  const sum = lengths.reduce((a, b) => a + b, 0);
  for (let j = 0; j < lengths.length; j++) lengths[j] *= o.reach / sum;
  for (let i = 0; i < o.legs; i++) {
    const lay = legLayout(i, o.legs);
    const joints = [];
    for (let j = 0; j <= o.segments; j++) joints.push({ x: home.x, y: home.y });
    c.legs.push({ i, ...lay, lengths, joints, foot: null, anchor: null, step: null, hip: { x: 0, y: 0 } });
  }
  return c;
}

function hipOf(c, leg) {
  const { body, o } = c;
  const ca = Math.cos(body.a), sa = Math.sin(body.a);
  const ax = leg.along * o.bodyLength, ay = leg.side * o.bodyWidth * 0.5;
  return { x: body.x + ca * ax - sa * ay, y: body.y + sa * ax + ca * ay };
}

function restOf(c, leg, hip, lead = 0) {
  const a = c.body.a + leg.side * leg.spread;
  const r = c.o.reach * c.o.restReach;
  return { x: hip.x + Math.cos(a) * r + c.body.vx * lead, y: hip.y + Math.sin(a) * r + c.body.vy * lead };
}

// Where an anchored foot is now: its box moved (a scroll), so the foot moved.
function anchorPoint(tree, anchor) {
  const r = tree.rect(anchor.node);
  if (!r || r.w < 1 || r.h < 1) return null;
  return { x: r.x + anchor.u * r.w, y: r.y + anchor.v * r.h, r };
}

function makeAnchor(hit) {
  const r = hit.rect;
  return { node: hit.node, u: (hit.grip.x - r.x) / (r.w || 1), v: (hit.grip.y - r.y) / (r.h || 1) };
}

function steer(c, dt) {
  const { body, o, rnd, home } = c;
  if (c.calm) { body.vx = 0; body.vy = 0; return; }
  if (c.t >= c.nextWaypoint || hypot(c.waypoint.x - body.x, c.waypoint.y - body.y) < 12) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * o.wanderRadius;
    c.waypoint = { x: home.x + Math.cos(a) * r, y: home.y + Math.sin(a) * r * 0.75 };
    c.nextWaypoint = c.t + 1.2 + rnd() * 1.8;
  }
  const dx = c.waypoint.x - body.x, dy = c.waypoint.y - body.y;
  const d = hypot(dx, dy) || 1;
  const want = Math.min(o.speed, d * 2.2);
  const tx = (dx / d) * want, ty = (dy / d) * want;
  const k = 1 - Math.exp(-dt * 3.2);
  body.vx += (tx - body.vx) * k; body.vy += (ty - body.vy) * k;
  body.x += body.vx * dt; body.y += body.vy * dt;
  const sp = hypot(body.vx, body.vy);
  if (sp > 8) {
    let da = Math.atan2(body.vy, body.vx) - body.a;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    body.a += clamp(da, -dt * 3, dt * 3);
  }
}

// Behind the body's long axis from the leg's own side, by more than half the
// body's width.
export function wrongSide(c, leg, p) {
  const hx = Math.cos(c.body.a), hy = Math.sin(c.body.a);
  return leg.side * (hx * (p.y - c.body.y) - hy * (p.x - c.body.x)) < -c.o.bodyWidth * 0.5;
}

// One fixed step of the whole creature.
export function update(c, tree, opts = {}) {
  const dt = STEP;
  const { o } = c;
  c.t += dt;
  if (opts.home) { c.home.x = opts.home.x; c.home.y = opts.home.y; }
  steer(c, dt);
  const avoid = opts.avoid;
  const taken = new Set();
  for (const leg of c.legs) {
    const a = leg.step ? leg.step.to : leg.anchor;
    if (a) taken.add(a.node.id);
  }
  let airborne = 0;
  for (const leg of c.legs) {
    leg.hip = hipOf(c, leg);
    if (leg.anchor) {
      const p = anchorPoint(tree, leg.anchor);
      // A box that vanished or jumped (recycled, re-laid out) lets go.
      if (!p || (leg.foot && hypot(p.x - leg.foot.x, p.y - leg.foot.y) > o.reach * 1.5)) leg.anchor = null;
      else leg.foot = { x: p.x, y: p.y };
    }
    if (!leg.foot) leg.foot = restOf(c, leg, leg.hip);
    if (leg.step) airborne++;
  }
  // Steps in flight: the landing box may move during the step; follow it.
  for (const leg of c.legs) {
    if (!leg.step) continue;
    const s = leg.step;
    s.t += c.calm ? 1 : dt / o.stepTime;
    const to = s.to ? anchorPoint(tree, s.to) : s.point;
    if (!to) { leg.step = null; leg.anchor = null; continue; }
    const e = ease(Math.min(1, s.t));
    const x = s.from.x + (to.x - s.from.x) * e, y = s.from.y + (to.y - s.from.y) * e;
    const nx = x - leg.hip.x, ny = y - leg.hip.y, nl = hypot(nx, ny) || 1;
    const lift = Math.sin(Math.PI * Math.min(1, s.t)) * o.stepLift;
    leg.foot = { x: x + (nx / nl) * lift, y: y + (ny / nl) * lift };
    if (s.t >= 1) { leg.foot = { x: to.x, y: to.y }; leg.anchor = s.to; leg.step = null; }
  }
  // Which legs ask to step, worst first; a leg waits while a neighbour flies.
  const asks = [];
  for (const leg of c.legs) {
    if (leg.step) continue;
    const rest = restOf(c, leg, leg.hip);
    const err = hypot(leg.foot.x - rest.x, leg.foot.y - rest.y);
    const stretch = hypot(leg.foot.x - leg.hip.x, leg.foot.y - leg.hip.y);
    const lost = !leg.anchor;
    // A foot left on the other side when the body turned would draw the leg
    // through the body: it must step.
    const wrong = wrongSide(c, leg, leg.foot);
    const urgent = stretch > o.reach * 0.97 || wrong;
    if (err > o.reach * o.stepError || urgent || (lost && err > 4)) asks.push({ leg, err: err + (urgent ? 1e4 : 0) });
  }
  asks.sort((a, b) => b.err - a.err);
  for (const { leg } of asks) {
    if (airborne >= o.maxAirborne) break;
    if (neighbours(leg.i, o.legs).some((j) => c.legs[j].step)) continue;
    const ideal = restOf(c, leg, leg.hip, o.stepTime * 2.2);
    const hx = Math.cos(c.body.a), hy = Math.sin(c.body.a);
    // Its own side, and not under the hip: a leg reaching for the next cell
    // folds into a knot, the reference's legs reach out.
    const ownSide = (g) => leg.side * (hx * (g.y - c.body.y) - hy * (g.x - c.body.x)) > o.bodyWidth * 0.5 &&
      hypot(g.x - leg.hip.x, g.y - leg.hip.y) > o.reach * 0.45;
    const found = search(tree, ideal, o.reach * o.searchSlack, leg.hip, { taken, avoid, accept: ownSide, reach: o.reach * 0.96 });
    for (const node of found.visited.slice(-10)) c.scan.push({ node, t: c.t });
    const from = { x: leg.foot.x, y: leg.foot.y };
    const forced = !leg.anchor || wrongSide(c, leg, leg.foot) || hypot(leg.foot.x - leg.hip.x, leg.foot.y - leg.hip.y) > o.reach * 0.97;
    if (!found.best && !forced) continue; // nothing better in reach: stay put
    if (found.best) {
      const to = makeAnchor(found.best);
      taken.add(found.best.node.id);
      leg.step = { from, to, point: null, t: 0 };
    } else {
      leg.step = { from, to: null, point: ideal, t: 0 };
    }
    leg.anchor = null;
    airborne++;
  }
  // The eye looks at a far box now and then: the long line of the scan.
  if (c.t >= c.nextLook && !c.calm) {
    const ang = c.body.a + (c.rnd() - 0.5) * 2.4, dist = o.reach * (1.6 + c.rnd() * 2.2);
    const p = { x: c.body.x + Math.cos(ang) * dist, y: c.body.y + Math.sin(ang) * dist };
    const far = search(tree, p, o.reach * 1.4, null, { avoid });
    const hit = far.best;
    for (const node of far.visited.filter(() => c.rnd() < 0.35).slice(0, 8)) c.scan.push({ node, t: c.t });
    c.look = hit ? { node: hit.node, until: c.t + 0.9 + c.rnd() * 0.9 } : null;
    c.nextLook = c.t + 0.5 + c.rnd() * 0.9;
  }
  if (c.look && c.t > c.look.until) c.look = null;
  c.scan = c.scan.filter((s) => c.t - s.t < SCAN_LIFE).slice(-40);
  // Legs: solve each chain from its hip to its foot, knees bent outward.
  for (const leg of c.legs) {
    leg.joints[0].x = leg.hip.x; leg.joints[0].y = leg.hip.y;
    const mx = (leg.hip.x + leg.foot.x) / 2, my = (leg.hip.y + leg.foot.y) / 2;
    let px = -(leg.foot.y - leg.hip.y), py = leg.foot.x - leg.hip.x;
    const pl = hypot(px, py) || 1;
    px /= pl; py /= pl;
    // Toward the leg's own side of the body, so the knee never swings across it.
    const sx = Math.cos(c.body.a + leg.side * Math.PI / 2), sy = Math.sin(c.body.a + leg.side * Math.PI / 2);
    if (px * sx + py * sy < 0) { px = -px; py = -py; }
    const span = hypot(leg.foot.x - leg.hip.x, leg.foot.y - leg.hip.y);
    const bend = Math.sqrt(Math.max(0, (o.reach / 2) ** 2 - (span / 2) ** 2)) * 0.9 + 6;
    const pole = { x: mx + px * bend, y: my + py * bend };
    solveChain(leg.joints, leg.lengths, leg.foot, pole);
  }
  return c;
}

// What to draw, in plain numbers: the renderer and the tests share it.
export function frame(c, tree) {
  const scan = [];
  const seen = new Set();
  for (const s of c.scan) {
    if (seen.has(s.node.id)) continue;
    seen.add(s.node.id);
    const r = tree.rect(s.node);
    if (r) scan.push({ r, age: (c.t - s.t) / SCAN_LIFE });
  }
  const planted = [];
  for (const leg of c.legs) {
    if (!leg.anchor) continue;
    const r = tree.rect(leg.anchor.node);
    if (r) planted.push(r);
  }
  const look = c.look ? tree.rect(c.look.node) : null;
  return { body: c.body, o: c.o, legs: c.legs, scan, planted, look };
}
