---
version: 1
slug: "app-layout-tsx"
primary_target: "app/layout.tsx"
related_targets: ["components/dresses/upload-page.tsx","components/shoots/shoot-review.tsx","components/shoots/shoot-result.tsx","components/templates/templates.tsx","components/dresses/dress-list.tsx"]
---

## Scope

Whole app redesign (replacement visual world): header + nav, Upload (Template set and Completed product flows, review step), set results (/shoots/[id]), Products list and detail, Templates (list + editor dialog). Visitor mode: Operate.

## Audience and task

One fashion seller in Ghana (dresses, bags, more), laptop and phone equally. Drop a pile of product photos, check the AI's sorting by colour and shot, spend OpenAI credit only after review, download a finished set as a .zip, or save finished photos as a Shopify product. Success: sees at a glance what will be made from what, and what is done.

## Constraints

Standard web controls only (shadcn on Base UI). Light and dark themes both. Prices in cedis (GH₵); OpenAI cost shown in US$. Content capped at max-w-6xl → widened to the world's wide canvas only where the mosaic needs it. Phone checked at 500px wide.

## Direction contract

THESIS: The studio as a dense retail module mosaic: every colour, shot, cost and state tiled as hairline-ruled modules on one screen. It refuses the category default of airy grey cards with one accent and a long single column.

OWN-WORLD: White modules on a light-grey canvas (#f2f2f2), ink #111 text, one utility red (#e60012) for tabs, primary actions, prices and attention; mid/line greys (#d6d6d6/#e0e0e0) for hairline module borders. Archivo throughout: compact 13–14px body with tight leading, heavy condensed display for page titles, tabular figures for counts and money. Modules have a title bar with "View all ›" style links; tags are small rectangles: filled red, outline red, filled ink, outline grey. Dark theme: ink canvas, lifted near-black modules, same red lifted for contrast.

STORY: The owner understands in one glance which colour × shot comes from her photo, which is borrowed, which is guessed, and what it will cost; she fixes the sort in place, then presses one red button. On results she watches modules fill in and downloads the folder.

FIRST VIEWPORT: Top bar (wordmark left, theme right) over a tab row (Upload · Products · Templates, active tab red with a red underline). Review: left rail lists colours with photo counts and shots with coverage (e.g. Back 1/3); centre is the shot mosaic, one ruled module per colour × shot with its tab and source line; right rail holds Name, Description, the cost in large red tabular figures and the red Generate button. Phone: rails stack, mosaic goes 2-up, Generate bar sticks to the bottom.

FORM: Japanese high-density retail web (catalog challenger japanese-high-density-web), chosen over the assigned Swing Tag direction by the owner on the decision page; seed: 62c2a471a81d2bc2.

Signature move: the shot mosaic. Every colour × shot is a module whose tab says where it comes from (ink tab: your photo; red tab: borrowed design; outline tab: AI guess) and, on results, its state (ink: done; red: failed; grey: waiting/working).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
