import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { attach, inject, localRefs } from "../lib/attach.mjs";

const here = new URL(".", import.meta.url).pathname;

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "crawler-src-"));
  mkdirSync(join(dir, "css"));
  writeFileSync(join(dir, "css/site.css"), "body{}");
  writeFileSync(join(dir, "logo.png"), "png");
  writeFileSync(join(dir, "page.html"), `<!doctype html><html><head><link rel="stylesheet" href="css/site.css?v=2"><link href="https://example.com/x.css"></head>
<body><img src='logo.png'><a href="#top">top</a><a href="../secret.txt">x</a><img src="data:image/png;base64,AA"><img src="missing.png"></body></html>`);
  writeFileSync(join(dir, "../secret.txt"), "no");
  return dir;
}

test("only local references are followed", () => {
  const refs = localRefs(`<a href="https://a.b">x</a><img src="a.png"><link href='b.css?x=1'><a href=#t>t</a><img src=//cdn/x.png><img src="data:x">`);
  assert.deepEqual(refs.sort(), ["a.png", "b.css"]);
});

test("the tag goes last in the body, with a safe agent id", () => {
  const html = inject("<html><body><p>x</p></body></html>", { agent: 'ag"1<x>', highlights: true });
  assert.match(html, /<p>x<\/p><script src="crawler.js" data-crawler data-agent="ag1x" data-highlights><\/script>\n<\/body>/);
  assert.match(inject("<p>no body</p>"), /<p>no body<\/p>\n<script src="crawler.js" data-crawler><\/script>/);
});

test("attach copies the page and its local files, never outside its folder", async () => {
  const dir = fixture();
  const out = await attach({ path: "page.html", workDir: dir, agent: "a1", outRoot: mkdtempSync(join(tmpdir(), "crawler-out-")) });
  assert.ok(existsSync(join(out.folder, "index.html")));
  assert.ok(existsSync(join(out.folder, "crawler.js")));
  assert.ok(existsSync(join(out.folder, "css/site.css")));
  assert.ok(existsSync(join(out.folder, "logo.png")));
  assert.ok(!existsSync(join(out.folder, "../secret.txt")) || !readFileSync(join(out.folder, "index.html"), "utf8").includes("secret"));
  assert.ok(out.skipped.some((s) => s.startsWith("../secret.txt")));
  assert.ok(out.skipped.some((s) => s.startsWith("missing.png")));
  assert.equal(out.watching, true);
  assert.match(readFileSync(join(out.folder, "index.html"), "utf8"), /data-agent="a1"/);
});

test("attach refuses what is not an HTML file, and a page that has it already", async () => {
  const dir = fixture();
  await assert.rejects(attach({ path: "css/site.css", workDir: dir }), /not an \.html file/);
  await assert.rejects(attach({ path: "nope.html", workDir: dir }), /No file/);
  writeFileSync(join(dir, "twice.html"), `<body><script src="crawler.js" data-crawler></script></body>`);
  await assert.rejects(attach({ path: "twice.html", workDir: dir }), /already has the crawler/);
});

function exec(req) {
  const r = spawnSync(process.execPath, [join(here, "../agent/execute.mjs")], { input: JSON.stringify(req), encoding: "utf8" });
  return JSON.parse(r.stdout);
}

test("the executor answers in text, and refuses an unknown tool", () => {
  const dir = fixture();
  const ok = exec({ protocol: "picode-tools/1", capability: "show", tool: "attach", arguments: { path: "page.html" }, context: { agent: "a9", workDir: dir }, settings: {} });
  assert.equal(ok.isError, undefined);
  assert.match(ok.content[0].text, /^Ready: /);
  assert.match(ok.content[0].text, /capabilities \["picode"\]/);
  assert.equal(ok.structuredContent, undefined, "text only: some CLIs show structured content instead of text");
  const off = exec({ protocol: "picode-tools/1", capability: "show", tool: "attach", arguments: { path: "page.html", stop_when_done: false }, context: { agent: "a9", workDir: dir } });
  assert.doesNotMatch(off.content[0].text, /capabilities/);
  const bad = exec({ protocol: "picode-tools/1", capability: "show", tool: "nope", arguments: {}, context: {} });
  assert.equal(bad.isError, true);
});

test("descend adds its attribute", () => {
  assert.match(inject("<body></body>", { descend: true }), /<script src="crawler.js" data-crawler data-descend><\/script>/);
});
