// picode-tools/1 executor: one JSON request on stdin, one answer on stdout.
// show.attach copies an HTML file and the local files it links into a new
// folder, adds the crawler, and returns the folder for the artifact tool.
import { attach } from "../lib/attach.mjs";
import { siteScript, STOP } from "../lib/site.mjs";

let text = "";
for await (const chunk of process.stdin) text += chunk;

function answer(body) { process.stdout.write(JSON.stringify(body)); }
function refuse(message) { answer({ content: [{ type: "text", text: message }], isError: true }); }

let request;
try { request = JSON.parse(text); } catch { refuse("The request is not JSON."); process.exit(0); }

if (request.protocol !== "picode-tools/1" || request.capability !== "show" || !["attach", "site"].includes(request.tool)) {
  refuse("Unknown tool.");
} else if (request.tool === "site") {
  const args = request.arguments || {};
  try {
    const expression = args.stop === true ? STOP : siteScript({
      descend: args.descend !== false,
      highlights: args.highlights === true,
      root: typeof args.root === "string" ? args.root : "",
      top: args.top === true,
    });
    const how = args.stop === true
      ? "Pass this to your browser tool: verb evaluate, expression = the text below, unchanged."
      : "Pass this to your browser tool: verb evaluate, expression = everything after the line ---, unchanged. It answers with a line saying it started. It is illustrative: it does not show what you read.";
    answer({ content: [{ type: "text", text: `${how}\n---\n${expression}` }] });
  } catch (err) {
    refuse(err && err.message ? err.message : String(err));
  }
} else {
  try {
    const args = request.arguments || {};
    const ctx = request.context || {};
    const out = await attach({
      path: args.path,
      workDir: ctx.workDir || process.cwd(),
      agent: args.stop_when_done === false ? "" : (ctx.agent || ""),
      highlights: args.highlights === true,
      descend: args.descend === true,
    });
    const caps = out.watching ? ' and capabilities ["picode"]' : "";
    const lines = [
      `Ready: ${out.folder}`,
      `Publish it now with the artifact tool: action publish, path ${out.folder}, a title${caps}. Then do the work.`,
      out.watching
        ? "The creature leaves by itself when you stop working (after the human allows the picode door once)."
        : "The creature keeps walking until the page is closed or replaced.",
      `Copied: ${out.files.join(", ")}${out.skipped.length ? `. Not copied: ${out.skipped.join(", ")}` : ""}.`,
      "It is illustrative: it does not show what you read.",
    ];
    answer({ content: [{ type: "text", text: lines.join("\n") }] });
  } catch (err) {
    refuse(err && err.message ? err.message : String(err));
  }
}
