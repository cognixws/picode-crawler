// One file a page loads with <script src="crawler.js">: lib/core.mjs and
// lib/dom.mjs, imports and exports stripped, inside a function. No bundler.
// `node scripts/build.mjs` writes ui/crawler.js; `--check` fails when the
// committed file is out of date.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function bundle() {
  const strip = (src) => src
    .replace(/^import [^;]+;\n/gm, "")
    .replace(/^export (const|function|async function) /gm, "$1 ");
  const core = strip(readFileSync(join(root, "lib/core.mjs"), "utf8"));
  const dom = strip(readFileSync(join(root, "lib/dom.mjs"), "utf8"));
  const { version } = JSON.parse(readFileSync(join(root, "picode-extension.json"), "utf8"));
  return `/* Crawler ${version} — github.com/cognixws/picode-crawler (Apache-2.0). Built from lib/; do not edit. */\n` +
    `(function () {\n"use strict";\n${core}\n${dom}\n` +
    `window.Crawler = Object.freeze({ version: ${JSON.stringify(version)}, start, watchAgent });\nautostart();\n})();\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = join(root, "ui/crawler.js");
  const text = bundle();
  if (process.argv.includes("--check")) {
    if (readFileSync(out, "utf8") !== text) { console.error("ui/crawler.js is out of date: run node scripts/build.mjs"); process.exit(1); }
  } else {
    writeFileSync(out, text);
    console.log("wrote ui/crawler.js", text.length, "bytes");
  }
}
