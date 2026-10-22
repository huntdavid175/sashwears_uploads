# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One shop owner in Ghana (prices in cedis, GHS) who sells fashion products on Shopify: dresses and other clothing, bags, and more to come. They use the app on a laptop and on a phone, about equally, to turn raw product photos into shop-ready images and catalog entries.

## Product Purpose

Backdrop Studio turns product photos into consistent shop images with AI, fast, without losing the product's details (cut, shape, material, colour, print, hardware, trims). Success: every colour of a product gets the full set of shots its template defines (e.g. a dress: front and back on a model; a bag: front, side, back and inside in a styled scene), looking like one shoot, ready to upload.

## Positioning

The shop owner's own templates drive every edit: each is either *on a model* (the product worn or held) or a *product scene* (the item alone in a styled setting), and lists its own shots with a reference photo for each, so a whole collection comes out in one consistent look. The AI also does the sorting (which photo is which colour and side) and the naming, so the owner drops a pile of photos instead of filling a form per image.

## Operating Context

- Private, no sign-in: anyone with the URL can use it (and spend OpenAI credit).
- Hosted on Vercel Hobby (300s per function, ~4.5MB request bodies); photos go straight from the browser to ImageKit.
- Edits are slow (tens of seconds to minutes each) and cost money per image, so the owner reviews the AI's sorting before anything is generated.
- Flows: **Completed product** (photos already edited → sorted, priced, saved as a product for Shopify; sizes only when the product has them) and **Template sets** (pick a template + drop any number of product photos → the AI sorts them by colour and shot → every colour gets every shot the template lists → AI name and description → downloaded as one .zip folder; nothing kept in the app afterwards).

## Capabilities and Constraints

- Templates: a kind (on a model / product scene), a list of shots (name + reference photo each), the styling prompt, and the image model settings (model, quality, file format). Product types are open-ended; nothing is dress-specific.
- Product photos: PNG, JPEG or WebP, up to 50MB each.
- A colour missing a shot still gets it: the AI combines that colour's other photos with another colour's photo of that shot.
- File names read `<name>-<colour>-<shot>.<ext>`; colour names are unique within a set.
- The ImageKit account has no file versions: files are only ever uploaded or deleted, never overwritten or moved.

## Brand Commitments

- Name: Backdrop Studio.
- Prices always shown in cedis (GH₵).

## Evidence on Hand

No real customer content ships in the repo; garment and model photos come from the owner at runtime. Don't invent claims, reviews, or sample product data presented as real.

## Product Principles

1. The product is sacred: never trade material, colour or detail fidelity for speed or style.
2. AI suggests, the owner decides. Sorting, names and descriptions are editable before money is spent.
3. Show cost and progress honestly: what will be generated, roughly what it costs, and what's still running.
4. One drop, whole collection: the owner shouldn't have to handle images one at a time.
