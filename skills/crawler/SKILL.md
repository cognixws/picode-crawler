---
name: crawler
description: Show the human a small creature walking over an HTML page while you work on it (analysis, edits, review). Use when the human asks for the crawler, or asks you to work on a page they will watch.
---

# Crawler

The crawler is a small procedural creature that walks over a page's boxes.
It is **illustrative**: it shows that you are working on the page, never what
you read. Do not say or imply that its position, the boxes it stands on or its
lines show your analysis.

## Flow

1. Call the tool `show.attach` with the HTML file (`path`, absolute or relative
   to your working folder). It returns a new folder with the page, the local
   files it links, and `crawler.js`.
2. Publish that folder **before** you start the work, so the human watches it
   while you work: artifact tool, `action: publish`, `path: <the folder>`, a
   title. With `stop_when_done` (the default) also pass
   `capabilities: ["picode"]`; the human allows it once, and the creature
   leaves when you stop working.
3. Do the work as you normally would (read the file itself, not the copy).
4. Give the result in your reply, or publish it as a new version of the same
   artifact (`id`, `baseVersion`).

Leave `highlights` off for analysis: a filled box reads as "this was read".

If you have no artifact tool, say so and give the human the folder path.

## A site open in your browser tab

When the human asks for the crawler on a site you have open with the browser
tool (a feed, search results, an article):

1. Call `show.site` (`descend` is on by default; `root` is a CSS selector for
   the part to walk on, such as a results column; `top` scrolls to the top).
2. Pass everything after the line `---` of its answer, unchanged, as the
   `expression` of your browser tool's `evaluate` verb. It answers that the
   crawler started.
3. It is about 27 KB: send it once per page, only when asked. A reload removes
   it; `show.site` with `stop: true` gives the short expression that stops it.

If the answer says the tab is hidden, tell the human it starts moving when
they open the tab.
