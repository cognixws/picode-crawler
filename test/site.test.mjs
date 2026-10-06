import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { siteScript, STOP } from "../lib/site.mjs";

const here = new URL(".", import.meta.url).pathname;

test("the site expression parses and starts the crawler with its options", () => {
  const s = siteScript({ descend: true, highlights: true, root: '[data-testid="primaryColumn"]', top: true });
  new Function("return " + s);
  assert.match(s, /^\(function \(\) \{/);
  assert.match(s, /window\.Crawler = Object\.freeze/);
  assert.match(s, /"descend":true,"highlights":true/);
  assert.match(s, /document\.querySelector\("\[data-testid=\\"primaryColumn\\"\]"\)/);
  assert.match(s, /window\.scrollTo\(0, 0\);/);
  assert.doesNotMatch(s, /\nautostart\(\);/, "it starts by itself, not from a script tag");
  assert.ok(s.length < 40000, `${s.length} characters`);
});

test("defaults: descend on, fills off, the whole page, no scroll to top", () => {
  const s = siteScript();
  assert.match(s, /"descend":true,"highlights":false/);
  assert.match(s, /const rootEl = null \|\| document\.body;/);
  assert.doesNotMatch(s, /window\.scrollTo\(0, 0\);/);
});

test("the stop expression parses", () => {
  new Function("return " + STOP);
});

function exec(args) {
  const r = spawnSync(process.execPath, [join(here, "../agent/execute.mjs")], {
    input: JSON.stringify({ protocol: "picode-tools/1", capability: "show", tool: "site", arguments: args, context: {} }),
    encoding: "utf8",
  });
  return JSON.parse(r.stdout);
}

test("the executor answers with the instruction, then the expression after ---", () => {
  const out = exec({ root: "main" });
  const text = out.content[0].text;
  assert.equal(out.isError, undefined);
  const [how, expression] = text.split("\n---\n");
  assert.match(how, /verb evaluate/);
  new Function("return " + expression);
  assert.match(exec({ stop: true }).content[0].text, /crawler stopped/);
});
