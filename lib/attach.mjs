// Prepare a page for the artifact tool: the HTML file, the local files it
// links (stylesheets, scripts, images, fonts in CSS are not followed), and
// crawler.js with the tag that starts it. Nothing outside the HTML's own
// folder is copied, and the copy is bounded.
import { mkdtempSync, mkdirSync, readFileSync, statSync, copyFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const CRAWLER_JS = join(here, "..", "ui", "crawler.js");
const MAX_HTML = 5 * 1024 * 1024;
const MAX_TOTAL = 40 * 1024 * 1024;
const MAX_FILES = 200;

// The local references in src= and href= (and srcset's first URL): no scheme,
// no protocol-relative URL, no fragment-only link, no data:.
export function localRefs(html) {
  const out = new Set();
  const re = /\s(?:src|href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m;
  while ((m = re.exec(html))) {
    let ref = (m[2] ?? m[3] ?? m[4] ?? "").trim();
    if (!ref || ref.startsWith("#") || ref.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(ref)) continue;
    ref = ref.split("#")[0].split("?")[0];
    try { ref = decodeURIComponent(ref); } catch { /* keep it as written */ }
    if (ref) out.add(ref);
  }
  return [...out];
}

// The script tag goes last in <body>, so the page's own layout exists when it
// starts; a page without </body> gets it appended.
export function inject(html, { agent = "", highlights = false, descend = false } = {}) {
  const attrs = ["data-crawler"];
  if (agent) attrs.push(`data-agent="${String(agent).replace(/[^A-Za-z0-9_.:-]/g, "")}"`);
  if (highlights) attrs.push("data-highlights");
  if (descend) attrs.push("data-descend");
  const tag = `<script src="crawler.js" ${attrs.join(" ")}></script>`;
  const i = html.toLowerCase().lastIndexOf("</body>");
  return i >= 0 ? html.slice(0, i) + tag + "\n" + html.slice(i) : html + "\n" + tag + "\n";
}

export async function attach({ path, workDir, agent = "", highlights = false, descend = false, outRoot = join(tmpdir(), "picode-crawler") }) {
  if (!path || typeof path !== "string") throw new Error("path is required: the HTML file to show.");
  const src = isAbsolute(path) ? path : resolve(workDir || process.cwd(), path);
  let st;
  try { st = statSync(src); } catch { throw new Error(`No file at ${src}.`); }
  if (!st.isFile()) throw new Error(`${src} is not a file.`);
  if (![".html", ".htm"].includes(extname(src).toLowerCase())) throw new Error(`${basename(src)} is not an .html file.`);
  if (st.size > MAX_HTML) throw new Error(`${basename(src)} is larger than 5 MB.`);
  const html = readFileSync(src, "utf8");
  if (/<script[^>]+src\s*=\s*["']?crawler\.js/i.test(html)) throw new Error("This page already has the crawler.");
  const base = dirname(src);
  mkdirSync(outRoot, { recursive: true });
  const slug = basename(src, extname(src)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "page";
  const folder = mkdtempSync(join(outRoot, slug + "-"));
  const files = ["index.html", "crawler.js"];
  const skipped = [];
  let total = st.size;
  for (const ref of localRefs(html)) {
    const from = normalize(resolve(base, ref));
    const rel = relative(base, from);
    if (rel.startsWith("..") || isAbsolute(rel) || rel.split(sep).some((p) => p.startsWith("."))) { skipped.push(`${ref} (outside the page's folder)`); continue; }
    if (rel === "crawler.js" || rel === "index.html") { skipped.push(`${ref} (name taken)`); continue; }
    let fst;
    try { fst = statSync(from); } catch { skipped.push(`${ref} (missing)`); continue; }
    if (!fst.isFile()) continue;
    if (files.length >= MAX_FILES || total + fst.size > MAX_TOTAL) { skipped.push(`${ref} (over the size limit)`); continue; }
    mkdirSync(dirname(join(folder, rel)), { recursive: true });
    copyFileSync(from, join(folder, rel));
    total += fst.size;
    files.push(rel.split(sep).join("/"));
  }
  writeFileSync(join(folder, "index.html"), inject(html, { agent, highlights, descend }));
  copyFileSync(CRAWLER_JS, join(folder, "crawler.js"));
  return { folder, files, skipped, watching: Boolean(agent) };
}
