---
name: Backdrop Studio
description: A dense retail module mosaic for turning product photos into shop-ready sets.
colors:
  utility-red: "#e60012"
  utility-red-lifted: "#ff3b46"
  ink: "#111111"
  canvas-grey: "#f2f2f2"
  module-white: "#ffffff"
  hairline: "#e0e0e0"
  hairline-strong: "#d6d6d6"
  fill-grey: "#f5f5f5"
  hover-grey: "#ececec"
  quiet-ink: "#5c5c5c"
  night-canvas: "#0f0f0f"
  night-module: "#1a1a1a"
  night-ink: "#f2f2f2"
  night-hairline: "#2e2e2e"
  night-hairline-strong: "#3a3a3a"
  night-fill: "#232323"
  night-quiet-ink: "#a8a8a8"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 2.25rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.025em"
    fontVariation: "'wdth' 72"
  figure:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 900
    lineHeight: 1
    fontFeature: "'tnum'"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.375
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: "'tnum'"
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.33
rounded:
  inset: "2px"
  tile: "2.4px"
  module: "4px"
spacing:
  tile-gap: "8px"
  module-pad-sm: "12px"
  module-pad: "16px"
  module-gap: "16px"
  page-pad: "24px"
components:
  button-primary:
    backgroundColor: "{colors.utility-red}"
    textColor: "{colors.module-white}"
    rounded: "{rounded.module}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.canvas-grey}"
    textColor: "{colors.ink}"
    rounded: "{rounded.module}"
    padding: "0 10px"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.module}"
    padding: "0 10px"
    height: "32px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.module}"
    padding: "4px 10px"
    height: "32px"
  module:
    backgroundColor: "{colors.module-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.module}"
    padding: "{spacing.module-pad}"
  tag-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.module-white}"
    typography: "{typography.label}"
    rounded: "{rounded.tile}"
    padding: "2px 6px"
    height: "20px"
  tag-red:
    backgroundColor: "{colors.utility-red}"
    textColor: "{colors.module-white}"
    typography: "{typography.label}"
    rounded: "{rounded.tile}"
    padding: "2px 6px"
    height: "20px"
  tag-alert:
    backgroundColor: "{colors.module-white}"
    textColor: "{colors.utility-red}"
    typography: "{typography.label}"
    rounded: "{rounded.tile}"
    padding: "2px 6px"
    height: "20px"
  tag-outline:
    backgroundColor: "{colors.module-white}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.tile}"
    padding: "2px 6px"
    height: "20px"
  toggle-pressed:
    backgroundColor: "{colors.utility-red}"
    textColor: "{colors.module-white}"
    rounded: "{rounded.module}"
    height: "32px"
  nav-tab-active:
    textColor: "{colors.utility-red}"
    padding: "10px 12px"
---

# Design System: Backdrop Studio

## Overview

**Creative North Star: "The Retail Mosaic"**

Backdrop Studio is a working floor, not a showroom. Every colour, shot, cost and state is tiled onto one screen as white modules ruled with hairlines on a light-grey canvas, the way a dense Japanese retail catalogue packs a page. The owner should read the whole job at a glance: what each image is made from, what it costs, and what is done.

The system is compact and literal. Body type is small (14px) with tight leading, figures are tabular, and modules carry a bold title bar ruled off from their content. One utility red does all the pointing: the current tab, the one action that spends money, prices and costs, and anything that needs attention. Everything else is ink and greys. Depth comes from hairlines and the canvas/module contrast, not shadows.

Small rectangular tags are the system's vocabulary for provenance and state. They sit in the corner of image tiles and in title bars, and their fill (ink, red, red outline, grey outline) carries meaning consistently across review, results, products and templates. Dark mode is the same mosaic after hours: an ink canvas, lifted near-black modules, hairlines that still read, and a lifted red.

**Key Characteristics:**
- White hairline-ruled modules tiled on a light-grey canvas; wide (max 80rem) so rails and mosaics sit side by side.
- One utility red for tabs, the primary action, prices/costs and attention; never decorative.
- Archivo throughout: heavy condensed display for wordmark, page titles and template names; compact 14px body; tabular figures everywhere.
- Tight radii (2-4px) and 1px rules; flat at rest.
- Rectangular tags whose fill encodes provenance and state.

## Colors

A near-monochrome retail palette: ink, white and stepped greys, with one saturated utility red.

### Primary
- **Utility Red** (light `utility-red`, dark `utility-red-lifted`): the active nav tab and its underline, the primary button (Generate, Save, New template), pressed toggles, prices and the estimated cost, coverage counts that fall short, focus rings, caret and selection tint, and the filled/outline tags. It is also the destructive token, so destructive actions read as attention, not a second hue.

### Neutral
- **Ink** (`ink` / `night-ink`): all body and title text, the filled ink tag, the wordmark.
- **Canvas Grey** (`canvas-grey` / `night-canvas`): the page behind the modules. The canvas is never used inside a module.
- **Module White** (`module-white` / `night-module`): cards, header bar, popovers, the tile caption strip. Also the text colour on red and ink fills.
- **Hairline** (`hairline` / `night-hairline`): every module border, title-bar rule, list-row divider and tile border.
- **Hairline Strong** (`hairline-strong` / `night-hairline-strong`): input and outline-toggle strokes, scrollbars.
- **Fill Grey** (`fill-grey` / `night-fill`): muted surfaces: image placeholders behind tiles, the grouped photo strip inside a colour module, skeletons.
- **Hover Grey** (`hover-grey`, dark #262626): accent surface for menu and list hover.
- **Quiet Ink** (`quiet-ink` / `night-quiet-ink`): secondary lines (source line under a tile, descriptions, meta).

### Named Rules
**The One Red Rule.** Red marks where you are, what spends money, what things cost, and what needs you. If an element is none of those, it is ink or grey.

**The Semantic Token Rule.** Use the semantic tokens from `app/globals.css` (`--primary`, `--card`, `--border`, `--muted-foreground`, ...). Never raw colour values or `dark:` overrides in app code; the `.dark` block carries the theme.

## Typography

**Display Font:** Archivo, condensed via its width axis (`font-stretch: 72%`, the `font-condensed` utility)
**Body Font:** Archivo (with ui-sans-serif, system-ui fallback)

**Character:** One family doing two jobs: a heavy, narrow display that reads like a catalogue masthead, and a plain compact sans for dense data. Tabular figures are on globally, so counts, prices and costs align in columns.

### Hierarchy
- **Display** (800, condensed, 30px rising to 36px from md, line-height 1, -0.025em): page titles only. The wordmark uses the same voice at 20px; template names use it at 18px bold.
- **Figure** (900, 30px, line-height 1, red): the single headline number on a decision, i.e. the estimated cost beside Generate. Secondary counts (images done, photos picked) use 24px bold ink.
- **Title** (700, 16px, 1.375; 14px in small modules): module title bars, tile shot names (14px bold), product names.
- **Body** (400, 14px): everything else, descriptions capped at `max-w-prose`.
- **Label** (600, 12px): tags; 12px regular quiet ink for tile source lines, legends and meta.

### Named Rules
**The Condensed Voice Rule.** Condensed heavy Archivo is for the wordmark, page titles and template names. Body, buttons, tags and figures stay at normal width.

**The Tabular Rule.** Figures are tabular everywhere (`font-variant-numeric: tabular-nums` on `html`); do not switch it off for prices or counts.

## Layout

Pages sit in a wide frame (max 80rem, `max-w-7xl`) with 12px padding on phones and 24px from md; sections stack with 16px gaps (20px from md). The header is the same width: a 48px bar (wordmark, a quiet tagline from sm, theme menu right) over a tab row, sticky, on a module-white band with a bottom hairline.

Decision screens use rails: on review a 12rem left rail (colours with counts, shots covered with coverage, the tag legend), a fluid centre of colour modules, and an 18rem right rail (name, description, cost, Generate); results drop the left rail. Rails are sticky at `top-28` on large screens. Lists use a 13rem filter rail beside the grid.

Inside modules, image tiles tile on an 8px gap: 2-up on phones, then one column per shot (each up to 12rem on review, 14rem on results). Product grids run 2 / 3 / 4-5 columns; template modules 1 / 2 / 3. Below `lg` rails collapse: the left rail becomes a wrapped row of coverage tags, the right rail stacks, and on review a sticky bottom bar carries the cost and the Generate button. Phones are checked at 500px wide.

## Elevation & Depth

Flat by default. Depth is the canvas/module step plus 1px hairlines; modules have no shadow. Shadows appear only on things that genuinely float above the mosaic.

### Shadow Vocabulary
- **Floating bar** (Tailwind `shadow-lg`): the sticky phone action bar over scrolling content.
- **Inset photo** (Tailwind `shadow-md` plus a 2px module-coloured ring): the owner's source photo laid over the faded shot reference inside a review tile.
- Popovers, menus and dialogs keep their shadcn defaults.

### Named Rules
**The Flat Module Rule.** A module at rest is a hairline box, never a shadowed card. If something casts a shadow, it is overlapping other content.

## Shapes

Tight, near-square geometry. Modules, buttons, inputs and toggles use the base radius (`rounded.module`, 4px, `--radius: 0.25rem`); image tiles, product cards, tags and the grouped-photo strip use `rounded.tile` (2.4px); the inset photo in a review tile uses 2px. Borders are always 1px hairlines; cards draw theirs as a 1px ring. Images fill tiles edge to edge (`object-cover`) at portrait ratios: 4:5 on review tiles, 3:4 on results and product cards.

## Components

### Buttons
- **Shape:** gently squared (`rounded.module`, 4px), 32px tall default, 28px small, 24px extra-small, 36px large.
- **Primary:** red fill, white 14px medium text; one per decision (Generate N images, Save, New template).
- **Hover / Focus:** primary drops to 80% red; focus draws a 3px half-opacity red ring; active nudges down 1px.
- **Outline:** canvas fill with a hairline stroke, hover to fill grey. **Ghost:** text only, hover fill grey; used for Fix sorting, Back, Retry, Download on tiles, and the theme icon.

### Tags
- **Style:** small rectangles (20px tall, 12px semibold, `rounded.tile`).
- **Ink** (filled ink): your own photo; done; ready; model template.
- **Red** (filled red): borrowed from another colour; failed; default template.
- **Alert** (red outline on module white): AI guess; needs attention; needs shots; a shot not covered by every colour.
- **Outline** (hairline on module white): waiting, working, meta (counts, folder), scene template, covered shots.

### Cards / Containers (Modules)
- **Corner Style:** `rounded.module` (4px).
- **Background:** module white on canvas grey.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px hairline ring; title bars are ruled off with a bottom hairline.
- **Internal Padding:** 16px, or 12px for the compact `sm` size used by rails.
- **Title:** bold 16px (14px in `sm`), optional quiet-ink description and a right-aligned action or tag.

### Inputs / Fields
- **Style:** 32px, transparent fill, hairline-strong stroke, `rounded.module`, 14px text from md (16px on phones to avoid zoom).
- **Focus:** stroke turns red with a 3px half-opacity red ring.
- **Error / Disabled:** invalid uses the destructive (red) stroke and ring; disabled fades to 50%.

### Toggles
- **Pressed:** red fill, white text (hover 90% red). Unpressed is transparent with fill-grey hover. Used for product-type filters, size pickers and choosers; selection is always red.

### Navigation
- **Style:** a row of text tabs under the header bar (14px medium ink, 10px/12px padding). Hover turns the label red.
- **Active:** bold red label with a 2px red underline sitting on the header's bottom hairline.
- **Mobile:** same row, no collapse (three sections).

### Shot Mosaic (signature)
One ruled tile per colour x shot inside each colour module. On review the shot's reference image fills the tile at 40% opacity with the owner's photo inset bottom-right (half width, 3:4), a provenance tag top-left, and a caption strip under a hairline: shot name (14px bold) over its source line (12px quiet ink). On results the same tile becomes a contact sheet: the finished image full-bleed, or the faded grayscale source while it waits, with a state tag top-left and Retry / Download as ghost buttons in the caption.

### Product Card
A tile-radius module linking to the product: 3:4 cover, status tag top-left, then type, bold name (turns red on hover), colour/size meta and the price in 18px bold red. Hover turns the border red.

## Do's and Don'ts

### Do:
- **Do** build every surface from hairline-ruled module-white modules on the canvas grey, with bold title bars ruled off by a hairline.
- **Do** keep red to the current tab, the one primary action, prices/costs, pressed selections and attention states.
- **Do** use the tag fills consistently: ink = yours / done, red = borrowed / failed / default, red outline = guess / needs attention, grey outline = waiting / meta.
- **Do** keep radii at 4px for modules and controls and 2.4px for tiles and tags.
- **Do** keep text on red at 4.5:1 or better: white on light-theme red, ink (#111) on the lifted dark-theme red (`--primary-foreground` carries it).
- **Do** keep page and rail content inside the 80rem frame and check phones at 500px wide.

### Don't:
- **Don't** add a second accent hue, gradients, or decorative red.
- **Don't** put shadows on modules at rest; shadows are only for content that floats over other content.
- **Don't** use condensed Archivo for body, buttons, tags or numbers.
- **Don't** use raw colour values or `dark:` overrides in app components; theme through the `.dark` tokens.
- **Don't** use large or pill radii; this world is near-square.
