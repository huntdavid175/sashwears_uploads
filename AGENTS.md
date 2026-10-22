<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Ignore routine debugging and unverified changes. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Keep a qualifying candidate through the reporting pass even if you resolve or work around it. A successful fix changes the report outcome; it does not erase the friction that qualified it.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `node node_modules/next/dist/bin/next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->

## Project: Backdrop Studio

Hosted on **Vercel (Hobby)**, no sign-in. The shop sells **products** of any kind (dresses, bags, more), never assume dresses. On `/` the owner picks **Template set** (picks a template, drops any number of product photos; the AI sorts them by colour and by the template's shots and writes a name + description; she reviews, then every colour gets every shot via the OpenAI Images Edit API (`[shot reference, ...product photos]` as inputs); a colour missing a shot borrows another colour's photo of it for the design; the result is downloaded as one `.zip` folder and isn't listed anywhere in the app) or **Completed product** (photos already edited: she drops them all + price, optional sizes, the AI sorts them by colour and shot and suggests name + type, she reviews and saves — nothing is edited). A **template** is a kind (`model`: worn or held by the template's model; `scene`: the item alone in a setting) + its own list of **shots** (name + reference photo each, e.g. a bag's Front, Side, Back, Inside) + instructions + model settings. Products have ImageKit folders `/<root>/dresses/<handle>/` (legacy name), sets `/<root>/shoots/<handle>/`, files named `<name>-<colour>-<shot>.<ext>`; data in **Neon Postgres**. `/products` lists products (type filter + search), `/products/[id]` shows every photo, and products export as a **Shopify product CSV** (Color × Size variants; Color only for one-size). `/templates` manages templates; `/shoots/[id]` is a set as it generates. Older dresses made by the removed "Needs editing" flow (background templates) still show and regenerate. Spec and progress live in `plan.md` — tick its checkboxes as work completes.

### Commands

- `npm run dev` — dev server (needs `.env.local`; see `.env.example`)
- `npm run db:migrate` — apply `db/schema.sql` to `DATABASE_URL` (idempotent)
- `npm test` — Vitest (`lib/**/*.test.ts`, Postgres via in-memory PGlite); `npx tsc --noEmit`; `npm run lint`; `npx next build`
- Run `npx next typegen` after adding routes so `RouteContext<...>` types exist for `tsc`

### How a product flows

1. Browser uploads the photos / template references **straight to ImageKit** (`uploadToImageKit` in `lib/client.ts`, signed by `GET /api/imagekit/auth`) — Vercel caps request bodies at ~4.5MB, so files never pass through our functions.
2. `POST /api/products` validates the dress (`lib/dress.ts` rules), verifies each file via the ImageKit API, and inserts product + colours + photos + one queued job per photo in **one SQL statement** (`createProduct`), then kicks the worker.
3. `POST /api/worker` (`maxDuration = 300`) responds 202 and, in `after()`, claims one job (`claimNextJob`: advisory lock + max 2 processing), downloads source + reference (`?tr=orig-true`), runs the edit (with a back-view hint for backs) and — if the dress is still unnamed — naming from the first colour's front, uploads to ImageKit, then kicks itself for the next job. `GET /api/products[/id]` (polled every 3s while a dress is generating) fails timed-out jobs and re-kicks if anything is queued.
4. Completed products: `POST /api/products/classify` (one vision call, `lib/openai/classify.ts`, structured output, shots = `DEFAULT_SHOTS`; a suggestion only) → owner reviews → `POST /api/products` with `kind: "completed"` → `createCompletedDress` moves + renames the files into the dress folder and saves them as both source and result (no jobs, no regenerate).
5. Template sets: `POST /api/products/classify` with `templateId` (sort into that template's shots) and `describe: true` → owner reviews → `POST /api/shoots` → `createShootFromPhotos` plans every colour × shot (`planShoot` in `lib/shoot.ts`, shared with the review UI) and inserts shoot + images + one job per image in one statement. The worker runs a job with `shootImageId` through `runShootJob` (the shot's reference from the job's template snapshot + product photos, `composeShootPrompt` switching on the template kind). Redo = a copy of the image's last job (same photos and template snapshot). The browser zips the folder (`downloadShootZip`, fflate) — function responses are capped at ~4.5MB too.
6. A photo's status is its **latest** job's status (or done, if it has a result and no job); a dress is generating / attention (a failed photo) / ready. Regenerate = a new job for that photo (replaces its file).

### Layout

- `db/schema.sql` — tables `templates` (`is_default`, `kind`, `shots` jsonb; the older background `reference`; `model_front` / `model_back` are migrated into `shots` and unused), `products` (`product_type`; `sizes` may be empty), `product_colors`, `product_photos` (`view` = shot key), `shoots`, `shoot_images` (`view` = shot key, `shot_name`, `shot_position`, `inputs`: product photos with a role), `jobs` (`photo_id` or `shoot_image_id`). `dresses` and `uploads` are from earlier versions and unused (kept, not dropped). `lib/db.ts` — Neon HTTP client behind a tiny `query()` interface (`setDb` swaps in PGlite for tests; `test/db.ts`).
- `lib/store/` — SQL repositories: `templates.ts`, `products.ts` (dresses, colours, photos), `shoots.ts` (on-model sets), `jobs.ts`. `errors.ts` — `StoreError` → HTTP status in `lib/api.ts`.
- `lib/models.ts` — per-model capabilities (sizes, `input_fidelity`, qualities) and token prices. **Update this when OpenAI models/prices change**; verify against the installed `openai` SDK types (`node_modules/openai/resources/images.d.ts`), not memory.
- `lib/size.ts` — output size closest to the source aspect ratio, per model limits.
- `lib/openai/edit.ts` — the edit call (no retries, 270s timeout to fit the function limit), prompt framing (`composePrompt`), SDK error → readable message.
- `lib/openai/name.ts` — vision model names each dress from the source photo (never throws; falls back to the file name).
- `lib/imagekit.ts` — browser upload auth, file lookup/validation, download, `uploadImage` (exact path, never overwrites), `putImage` (replace a result), `relocateImage` (move/rename = re-upload + delete), delete.
- `lib/shoot.ts` — set and shot rules shared by API and UI: `planShoot` (which photos make each colour × shot), `DEFAULT_SHOTS` (completed products), `shotKey`, limits.
- `lib/dress.ts` — product input rules (sizes, one size = `ONE_SIZE` / `stockSizes`, colour names, product type, quantities, price) shared by API and forms; price formatting (currency from `NEXT_PUBLIC_CURRENCY`). File name kept from the dress-only days.
- `lib/queue.ts` — `runNext` / `runJob` (dress photos) / `runShootJob` (sets), `regeneratePhoto`, `createShootFromPhotos`, `regenerateShootImage`, `updateProduct` (renaming the dress or a colour renames its ImageKit files via `syncFileNames`).
- `lib/shopify.ts` — Shopify product CSV (checked against Shopify's `product_template.csv`; re-check if Shopify changes its columns). `lib/api.ts` — `kickWorker` / `kickWorkerAfter`, error responses.
- `components/app-header.tsx` — top bar: section nav + theme menu. `lib/theme.ts` / `lib/theme-script.ts` — light/dark/system (class `dark` on `<html>`, set before paint by an inline head script).
- `components/page.tsx` — `Page` (canvas, `max-w-7xl`) + `PageHeader` (condensed title, actions). `components/elapsed.tsx` — running timer.
- `components/products/` — upload page (`/`: type rail, `completed-form`, `product-basics`), `product-list` (type rail, search, export dialog), `product-card`, `product-detail`, `edit-product-dialog`, shared `fields` (size picker, quantity grid). `components/shoots/` — template sets: `shoot-form` (template choice cards + photos), `shoot-review` (the shot mosaic: what each colour × shot is made from), `shoot-result` (`/shoots/[id]` contact sheet), `kind-tag`. `components/photos/` — drop zone + upload hook and sorted-photo tile/helpers shared by both upload flows. `components/templates/` — templates (kind + shot list editor). `components/compare.tsx` — before/after slider.
- `components/ui/` — shadcn `components/ui/` — shadcn (generated, don't hand-edit unless needed).
- `lib/client.ts` — client fetch helper, `imageUrl` (ImageKit resize / download / cache-bust), `uploadToImageKit`, `exportToShopify`, data hooks (`useProducts`, `useProduct`, `useTemplates`; poll only while something is generating, reload on tab focus).

### Conventions and gotchas

- **shadcn uses Base UI, not Radix**: `render={<Button />}` instead of `asChild`; Select needs an `items` prop; ToggleGroup values are arrays; toasts are `toast.add({ title, type })` from `@/components/ui/toast`. Load the `shadcn` skill before UI work. `cn` comes from the `cn` npm package via `@/lib/utils`.
- Design direction is **Retail Mosaic** (chosen by the owner in an impeccable direction round; brief in `.impeccable/surfaces/app-layout-tsx.md`, system in `DESIGN.md`): white hairline-ruled modules (Card with `CardHeader className="border-b"` title bars) on a light-grey canvas, dense 13–14px Archivo, heavy `font-condensed` page and product titles, one utility red (`--primary`) for tabs, primary actions, prices and attention, rectangular tags (Badge: `default` red, `ink`, `alert` red outline, `outline`). Side rails hold filters, coverage and the one red action. The signature is the shot mosaic: colour × shot modules whose tag says where the image comes from / its state. Dark mode: ink canvas, lifted modules, brighter red. Use semantic tokens from `app/globals.css`, never raw colors or `dark:` overrides. Page content is capped at `max-w-7xl`. Pressed toggles fill with `--primary` (edited in `components/ui/toggle.tsx`); Card and Badge are also edited (hairline ring, tight radius, tag variants). The current nav section is red with a red underline. The theme button shows the mode on screen (sun/moon), not the setting.
- `lib/features.ts` — switches for built-but-hidden features (`SHOPIFY_EXPORT` is off for now; its API still works).
- Headless Edge on Windows won't lay out narrower than ~500px; check mobile at 500 wide.
- Code style: no semicolons, double quotes, 100-column lines (`npx prettier --no-semi --print-width 100`). Never run it over `components/ui/` (generated; it rewraps them).
- React 19 lint rules are strict: no synchronous `setState` in effects, no ref access during render. Load data inside effects via promise callbacks; remount forms with `key`/conditional rendering instead of reset effects.
- Server-only modules import `"server-only"`; Vitest aliases it to `test/server-only-stub.ts`.
- Cache Components is on: pages that read data must do so in client components or behind `<Suspense>`; `GET` handlers that don't read the request call `await connection()`.
- In Route Handlers, read `request.url` (e.g. the origin for `kickWorker`) **before** any `try` whose `catch` calls `errorResponse` — otherwise the prerender bail-out gets caught and logged during `next build`.
- **The ImageKit account has no file versions** (`Versions Limit Exceeded. Limit: 0`): overwrite, move and rename all fail. Only ever upload (with `overwriteFile: false`) and delete — use `putImage` / `relocateImage`. `lib/imagekit.test.ts` pins this down.
- No local disk on Vercel: never write files; everything persistent goes to Postgres or ImageKit.
- A **product** is one Shopify product: `products.handle` (unique) is both the Shopify URL handle and the file-name stem. Colour names are unique per product; shot names unique per template (their key names the files).
- Client components that read the path/params (`usePathname`, `useParams`) need a `<Suspense>` boundary with Cache Components (the header is wrapped in the layout; `/products/[id]` and `/shoots/[id]` wrap their pages). Don't use random values (`crypto.randomUUID()`) during render — prerendering rejects them; and never put changing keys in element `id`s (hydration mismatch).
- Schema changes go in `db/schema.sql` as idempotent statements (`ADD COLUMN IF NOT EXISTS`), then `npm run db:migrate`.
- Postgres params: cast possibly-null params (`$1::uuid IS NULL`) or Postgres can't infer the type.
- No sign-in by design: anyone with the URL can run edits (OpenAI spend) and get ImageKit upload signatures.
- **Windows**: stopping a background `next dev` task can leave its node child processes running; check with `Get-CimInstance Win32_Process` and confirm the port is free.
- Never send real data to OpenAI or ImageKit from tests — `lib/queue.test.ts` mocks `editImage`, `editImages`, `nameProduct` and the ImageKit calls.
- Design work uses the **impeccable** skill (`.claude/skills/impeccable`, hooks in `.claude/settings.local.json`): `PRODUCT.md` holds product truth, `DESIGN.md` the visual system; decision-round sketches live in `.impeccable/mocks/`, review screenshots in `.impeccable/review/` (gitignored).
