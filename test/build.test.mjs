import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bundle } from "../scripts/build.mjs";

const root = new URL("..", import.meta.url).pathname;

test("ui/crawler.js is the build of lib/", () => {
  assert.equal(readFileSync(root + "ui/crawler.js", "utf8"), bundle(), "run node scripts/build.mjs");
});

test("the manifest declares the page, the tool and the skill, and nothing else", () => {
  const m = JSON.parse(readFileSync(root + "picode-extension.json", "utf8"));
  assert.equal(m.id, "crawler");
  assert.equal(m.apiVersion, 2);
  assert.deepEqual(m.ui.pages.map((p) => p.path), ["ui/scan.html"]);
  assert.deepEqual(m.agent.capabilities.map((c) => c.id + "." + c.tools.map((t) => t.id).join()), ["show.attach"]);
  assert.equal(m.permissions, undefined, "it asks PiCode for nothing");
  assert.equal(m.process, undefined, "no background process");
});
