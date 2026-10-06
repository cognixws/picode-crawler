// For a site already open in the agent's browser tab: one expression the
// agent passes to its browser tool's evaluate. It carries the whole crawler
// (ui/crawler.js without comments) and starts it; nothing is loaded from the
// network, so a site's own policies do not block it. Its size is the cost:
// the agent sends it once per page.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const BUNDLE = join(here, "..", "ui", "crawler.js");

function compact(src) {
  return src
    .replace(/^\/\*[^]*?\*\/\n/, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"))
    .join("\n")
    .replace(/ +\/\/ [^\n"'`]*$/gm, "");
}

export function siteScript({ descend = true, highlights = false, root = "", top = false } = {}) {
  const body = compact(readFileSync(BUNDLE, "utf8"))
    .replace(/\nautostart\(\);\n\}\)\(\);\s*$/, "\n");
  if (body.includes("autostart();\n})();")) throw new Error("unexpected bundle shape");
  const options = { motion: "always", descend: Boolean(descend), highlights: Boolean(highlights) };
  const start = [
    "if (window.crawler) { try { window.crawler.stop(false); } catch (e) {} }",
    top ? "window.scrollTo(0, 0);" : "",
    `const rootEl = ${root ? `document.querySelector(${JSON.stringify(root)})` : "null"} || document.body;`,
    `window.crawler = start(Object.assign(${JSON.stringify(options)}, { root: rootEl }));`,
    `return "crawler " + window.Crawler.version + " started" + (rootEl === document.body ? "" : " on " + ${JSON.stringify(root)}) + (document.hidden ? " (the tab is hidden: it moves once someone opens it)" : "");`,
    "})()",
  ].filter(Boolean).join("\n");
  return body + start;
}

export const STOP = "(() => { if (!window.crawler) return 'no crawler on this page'; window.crawler.stop(true); window.crawler = null; return 'crawler stopped'; })()";
