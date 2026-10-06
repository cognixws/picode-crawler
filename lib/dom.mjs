// The crawler in a page: a tree of the page's own boxes, a canvas above
// everything that never takes a click, and the loop. Illustrative only: the
// creature walks the page, it does not read it.

import { STEP, createCreature, update, frame, shift } from "./core.mjs";

const LEAF_TAGS = new Set(["IMG", "SVG", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "VIDEO", "CANVAS", "TD", "TH", "LI", "A", "CODE", "TIME", "LABEL", "SUMMARY"]);
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "HEAD", "META", "LINK", "BR", "HR", "IFRAME", "OPTION"]);
const MAX_NODES = 4000;

// The page's elements as a tree: a leaf is something a foot can grip (a
// short run of text, an image, a control); a container keeps the leaves it
// holds, so the search can skip a whole region at once. Chains of
// single-child containers collapse into their child.
export function domTree(root = document.body, ignore = () => false, clip = null) {
  let count = 0;
  let nextId = 1;
  function visit(el) {
    if (count >= MAX_NODES || el.nodeType !== 1 || SKIP_TAGS.has(el.tagName) || ignore(el)) return null;
    if (el.hasAttribute("data-crawler-ignore")) return null;
    const kids = [];
    let ownText = false;
    for (const ch of el.childNodes) {
      if (ch.nodeType === 3) { if (ch.nodeValue.trim()) ownText = true; }
      else if (ch.nodeType === 1) { const n = visit(ch); if (n) kids.push(n); }
    }
    const leafy = LEAF_TAGS.has(el.tagName.toUpperCase()) || (ownText && kids.length === 0);
    if (leafy || (ownText && kids.length <= 2)) {
      count++;
      // A text block with a link or two inside still grips as one box, and
      // its inline children grip on their own.
      return { id: nextId++, el, children: leafy ? null : kids.length ? kids : null };
    }
    if (kids.length === 0) return null;
    if (kids.length === 1) return kids[0];
    count++;
    return { id: nextId++, el, children: kids };
  }
  const top = visit(root);
  const tree = { root: { id: 0, el: null, children: top ? (top.children || [top]) : [] }, size: count };
  let cache = new Map();
  let bounds = null;
  tree.rect = (node) => {
    let r = cache.get(node);
    if (r !== undefined) return r;
    r = null;
    if (bounds === null) bounds = clip ? clip.getBoundingClientRect() : { top: -400, bottom: innerHeight + 400, left: -Infinity, right: Infinity };
    if (node.el && node.el.isConnected) {
      const b = node.el.getBoundingClientRect();
      // Inside the clip (a page's scrolling area): nothing under a toolbar.
      // A container only has to overlap the area: a long post or a scrolled
      // column starts far above the view and still holds what is on screen.
      // A leaf must lie inside it (nothing half under a toolbar).
      const inside = node.children
        ? b.bottom > bounds.top && b.top < bounds.bottom
        : b.top >= bounds.top - 1 && b.bottom <= bounds.bottom + (clip ? 1 : 0) && b.bottom > bounds.top && b.top < bounds.bottom;
      if (b.width >= 1 && b.height >= 1 && inside) {
        const cs = node.children ? null : getComputedStyle(node.el);
        if (!cs || (cs.visibility !== "hidden" && cs.opacity !== "0")) r = { x: b.left, y: b.top, w: b.width, h: b.height };
      }
    }
    cache.set(node, r);
    return r;
  };
  tree.newFrame = () => { cache = new Map(); bounds = null; };
  return tree;
}

// The middle of the leaves on screen, kept away from the edges.
export function contentCenter(tree) {
  let sx = 0, sy = 0, n = 0, seen = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const stack = [...tree.root.children];
  while (stack.length && seen < 3000) {
    const node = stack.pop();
    seen++;
    const r = tree.rect(node);
    if (!r || r.y + r.h < 0 || r.y > innerHeight || r.x + r.w < 0 || r.x > innerWidth) continue;
    if (node.children) { stack.push(...node.children); continue; }
    if (r.w > 260 || r.h > 64) continue; // only what a foot can grip: a full-width title would pull home off the content
    const w = Math.min(r.w * r.h, 20000);
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
    sx += (r.x + r.w / 2) * w; sy += (r.y + r.h / 2) * w; n += w;
  }
  const m = 90;
  if (!n) return { x: innerWidth / 2, y: innerHeight * 0.45, spread: Infinity };
  return { x: Math.min(innerWidth - m, Math.max(m, sx / n)), y: Math.min(innerHeight - m, Math.max(m, sy / n)), spread: Math.min(x1 - x0, y1 - y0) };
}

function tokens() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fallback) => (cs.getPropertyValue(name).trim() || fallback);
  const dark = document.documentElement.getAttribute("data-theme") !== "light" &&
    !(document.documentElement.getAttribute("data-theme") == null && matchMedia("(prefers-color-scheme: light)").matches);
  return {
    leg: v("--pc-accent-fill", dark ? "#4f5dde" : "#3f4bc4"),
    joint: v("--pc-accent", dark ? "#7c8cf8" : "#4f5dde"),
    body: v("--pc-danger", dark ? "#f7768e" : "#d6455d"),
    eye: v("--pc-accent", dark ? "#7c8cf8" : "#4f5dde"),
    ray: v("--pc-text-muted", dark ? "#9b9ba7" : "#6b6b76"),
    ground: v("--pc-bg", dark ? "#0e0e11" : "#ffffff"),
    text: v("--pc-text", dark ? "#ececf1" : "#18181b"),
  };
}

// Outlines only on inline-sized boxes, and one outline where a box and its
// child share (almost) the same rectangle.
export function outlineable(list, max = { w: 260, h: 64 }) {
  const out = [];
  for (const item of list) {
    const r = item.r || item;
    if (r.w > max.w || r.h > max.h) continue;
    if (out.some((o) => { const q = o.r || o; return Math.abs(q.x - r.x) < 4 && Math.abs(q.y - r.y) < 4 && Math.abs(q.w - r.w) < 8 && Math.abs(q.h - r.h) < 8; })) continue;
    out.push(item);
  }
  return out;
}

export function draw(ctx, f, colors, opts) {
  const { body, o, legs, look } = f;
  const scan = outlineable(f.scan), planted = outlineable(f.planted);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Search lines and the eye's line start at the body's edge: drawn from its
  // middle they read as a leg through the body.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-1e4, -1e4, 2e4, 2e4);
  const ca = Math.cos(body.a), sa = Math.sin(body.a), hl = o.bodyLength / 2 + 3, hw = o.bodyWidth / 2 + 3;
  ctx.moveTo(body.x + ca * hl - sa * hw, body.y + sa * hl + ca * hw);
  ctx.lineTo(body.x - ca * hl - sa * hw, body.y - sa * hl + ca * hw);
  ctx.lineTo(body.x - ca * hl + sa * hw, body.y - sa * hl - ca * hw);
  ctx.lineTo(body.x + ca * hl + sa * hw, body.y + sa * hl - ca * hw);
  ctx.closePath();
  ctx.clip("evenodd");
  if (opts.scan) {
    ctx.lineWidth = 1;
    for (const s of scan) {
      const alpha = Math.max(0, 1 - s.age);
      const cx = s.r.x + s.r.w / 2, cy = s.r.y + s.r.h / 2;
      ctx.globalAlpha = 0.22 * alpha;
      ctx.strokeStyle = colors.ray;
      ctx.beginPath(); ctx.moveTo(body.x, body.y); ctx.lineTo(cx, cy); ctx.stroke();
      ctx.globalAlpha = 0.75 * alpha;
      ctx.strokeStyle = colors.joint;
      ctx.strokeRect(s.r.x + 1, s.r.y + 1, s.r.w - 2, s.r.h - 2);
    }
  }
  for (const r of planted) {
    if (opts.highlights) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = colors.leg;
      ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }
    ctx.globalAlpha = opts.highlights ? 0.95 : 0.55;
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = colors.joint;
    ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  }
  if (look && opts.scan) {
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 2;
    ctx.strokeStyle = colors.eye;
    const g = { x: look.x + look.w / 2, y: look.y + look.h / 2 };
    ctx.beginPath(); ctx.moveTo(body.x, body.y); ctx.lineTo(g.x, g.y); ctx.stroke();
    ctx.strokeRect(look.x + 1, look.y + 1, look.w - 2, look.h - 2);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  ctx.strokeStyle = colors.leg;
  for (const leg of legs) {
    ctx.beginPath();
    ctx.moveTo(leg.joints[0].x, leg.joints[0].y);
    for (let j = 1; j < leg.joints.length; j++) ctx.lineTo(leg.joints[j].x, leg.joints[j].y);
    ctx.stroke();
  }
  for (const leg of legs) {
    for (let j = 1; j < leg.joints.length; j++) {
      const p = leg.joints[j];
      const isFoot = j === leg.joints.length - 1;
      if (isFoot && leg.anchor) {
        ctx.fillStyle = colors.ground; ctx.strokeStyle = colors.text; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, 4.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle = colors.joint;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  // The body: a long box along the heading, the eye at its front.
  ctx.save();
  ctx.translate(body.x, body.y);
  ctx.rotate(body.a);
  ctx.fillStyle = colors.ground;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(-o.bodyLength / 2, -o.bodyWidth / 2, o.bodyLength, o.bodyWidth);
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  ctx.strokeStyle = colors.body;
  ctx.strokeRect(-o.bodyLength / 2, -o.bodyWidth / 2, o.bodyLength, o.bodyWidth);
  ctx.fillStyle = colors.eye;
  ctx.beginPath(); ctx.arc(o.bodyLength * 0.3, 0, 4.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// start(options) puts the crawler on the page and returns its controls.
//   descend (walk down the page, scrolling to follow; true or {speed}),
//   scroller (the element that scrolls, default the page),
//   seed, home ({x, y} or a function of the viewport), scan (lines and boxes
//   of the search, default true), highlights (fill the boxes it stands on,
//   default false), motion ("auto" follows prefers-reduced-motion, "always"
//   animates anyway), root (where to look for boxes), ignore(el).
export function start(options = {}) {
  const opts = { scan: true, highlights: false, motion: "auto", ...options };
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.setAttribute("data-crawler-ignore", "");
  canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000;transition:opacity .4s ease";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  // Without a home of its own, the creature stays over the page's visible
  // content: a table on the left of a wide screen, not the empty middle.
  let content = null, contentAt = -1;
  // Descending: home walks down the page and the page scrolls to keep the
  // creature near the middle of the view, carrying it along.
  const descend = opts.descend ? { speed: 38, ...(typeof opts.descend === "object" ? opts.descend : {}) } : null;
  const scroller = opts.scroller || document.scrollingElement || document.documentElement;
  const viewOf = () => (scroller === document.scrollingElement || scroller === document.documentElement ? { top: 0, height: innerHeight } : scroller.getBoundingClientRect());
  let walkY = descend ? scroller.scrollTop + viewOf().top + viewOf().height * 0.4 : 0;
  const homeAt = () => {
    if (descend && !opts.home) {
      const v = viewOf();
      if (!content || performance.now() - contentAt > 1000) { content = contentCenter(tree); contentAt = performance.now(); }
      return { x: content.x, y: walkY - scroller.scrollTop };
    }
    if (typeof opts.home === "function") return opts.home();
    if (opts.home) return opts.home;
    const now = performance.now();
    if (!content || now - contentAt > 1000) { content = contentCenter(tree); contentAt = now; }
    return content;
  };
  // The tree first: the default home is the middle of its boxes.
  let tree = domTree(opts.root || document.body, opts.ignore, opts.clip || null);
  const scale = Math.min(1, Math.max(0.6, Math.min(innerWidth, innerHeight) / 760));
  const creature = createCreature({
    seed: opts.seed ?? ((Math.random() * 2 ** 31) | 0),
    home: homeAt(),
    reach: 165 * scale, bodyLength: 40 * scale, bodyWidth: 14 * scale, wanderRadius: 150 * scale, speed: 70 * scale, stepLift: 9 * scale,
  });
  if (descend) {
    creature.o.heading = { toward: Math.PI / 2, within: Math.PI / 2 };
    creature.body.a = Math.PI / 2;
  }
  let dirty = false;
  const mo = new MutationObserver(() => { dirty = true; });
  mo.observe(opts.root || document.body, { childList: true, subtree: true, characterData: false });
  let colors = tokens();
  const themeMo = new MutationObserver(() => { colors = tokens(); });
  themeMo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
  let raf = 0, last = 0, acc = 0, paused = false, stopped = false, rebuildAt = 0, lastScroll = 0;
  function size() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  size();
  addEventListener("resize", size);
  function calm() { return opts.motion !== "always" && reduce.matches; }
  function tick(now) {
    raf = 0;
    if (stopped) return;
    const t = now / 1000;
    if (!last) last = t;
    acc = Math.min(acc + (t - last), 0.25);
    last = t;
    if (dirty && t >= rebuildAt) { tree = domTree(opts.root || document.body, opts.ignore, opts.clip || null); dirty = false; rebuildAt = t + 0.25; }
    creature.calm = calm();
    if (!opts.home && content) creature.o.wanderRadius = Math.max(24, Math.min(150 * scale, content.spread * 0.3));
    const step = { home: homeAt() };
    let n = 0;
    if (!paused) while (acc >= STEP && n < 6) { tree.newFrame(); update(creature, tree, step); acc -= STEP; n++; }
    if (paused || creature.calm) acc = 0;
    if (descend && n && !creature.calm) {
      const v = viewOf();
      walkY += descend.speed * n * STEP;
      const want = creature.body.y - (v.top + v.height * 0.5);
      if (want > 1) {
        const before = scroller.scrollTop;
        scroller.scrollTop = before + Math.min(want, 8);
        const moved = scroller.scrollTop - before;
        if (moved) shift(creature, 0, -moved);
        else walkY = Math.min(walkY, scroller.scrollTop + v.top + v.height - 120); // the end of the page
      }
      if (Math.abs(scroller.scrollTop - lastScroll) > 300) { dirty = true; lastScroll = scroller.scrollTop; }
    }
    tree.newFrame();
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.save();
    if (opts.clip) { const b = opts.clip.getBoundingClientRect(); ctx.beginPath(); ctx.rect(b.left, b.top, b.width, b.height); ctx.clip(); }
    draw(ctx, frame(creature, tree), colors, opts);
    ctx.restore();
    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  // Calm mode still redraws: a scroll moves the boxes, the feet go with them.
  return {
    canvas,
    get creature() { return creature; },
    pause() { paused = true; },
    resume() { paused = false; last = 0; },
    set(o) { Object.assign(opts, o); },
    stop(fade = true) {
      if (stopped) return;
      const end = () => { stopped = true; cancelAnimationFrame(raf); mo.disconnect(); themeMo.disconnect(); removeEventListener("resize", size); canvas.remove(); };
      if (fade) { canvas.style.opacity = "0"; setTimeout(end, 450); } else end();
    },
  };
}

// While an agent works, then gone: an artifact page with the `picode`
// capability reads the agent's live state and stops the crawler when the
// agent stops working. Without the capability it keeps walking.
export async function watchAgent(handle, agentId, every = 3000) {
  if (!agentId || !window.picode) return "unwatched";
  const door = await window.picode.use("picode");
  if (!door) return "unwatched";
  let misses = 0;
  const check = async () => {
    try {
      const res = await door.agents();
      const a = (res && res.agents || []).find((x) => x.id === agentId);
      misses = a && a.state === "working" ? 0 : misses + 1;
    } catch { misses++; }
    if (misses >= 2) { handle.stop(true); return; }
    setTimeout(check, every);
  };
  setTimeout(check, every);
  return "watching";
}

// <script src="crawler.js" data-crawler data-agent="…" data-highlights>
// starts it by itself.
export function autostart() {
  const el = document.currentScript || document.querySelector("script[data-crawler]");
  if (!el || !el.hasAttribute("data-crawler")) return;
  const go = () => {
    const handle = start({
      highlights: el.hasAttribute("data-highlights"),
      scan: el.getAttribute("data-scan") !== "off",
      motion: el.getAttribute("data-motion") || "auto",
      descend: el.hasAttribute("data-descend"),
    });
    window.crawler = handle;
    watchAgent(handle, el.getAttribute("data-agent"));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go, { once: true });
  else go();
}
