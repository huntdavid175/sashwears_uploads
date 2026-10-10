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

Hosted on **Vercel (Hobby)**, no sign-in. The store owner uploads a dress on `/`, choosing **Completed dress** (photos already edited: she drops them all + price, the AI sorts them by colour and front/back, she reviews and saves — nothing is edited) or **Needs editing** (one price, the sizes it comes in, colours with stock per size; the first colour has a front + back photo, the others a front). Every photo is edited on submit through the **default template** (background reference + instructions + model settings) via the OpenAI Images Edit API (`[source, reference]` as inputs). A vision model names the dress (no colour in the name). Every dress has its own ImageKit folder, `/<root>/dresses/<handle>/`, with files named `<dress>-<colour>-<front|back>.<ext>`; data in **Neon Postgres**. `/dresses` lists them, `/dresses/[id]` shows every photo, and dresses export as a **Shopify product CSV** (Color × Size variants). `/settings` manages templates. Spec and progress live in `plan.md` — tick its checkboxes as work completes.

### Commands

- `npm run dev` — dev server (needs `.env.local`; see `.env.example`)
- `npm run db:migrate` — apply `db/schema.sql` to `DATABASE_URL` (idempotent)
- `npm test` — Vitest (`lib/**/*.test.ts`, Postgres via in-memory PGlite); `npx tsc --noEmit`; `npm run lint`; `npx next build`
- Run `npx next typegen` after adding routes so `RouteContext<...>` types exist for `tsc`

### How a dress flows

1. Browser uploads the photos / template references **straight to ImageKit** (`uploadToImageKit` in `lib/client.ts`, signed by `GET /api/imagekit/auth`) — Vercel caps request bodies at ~4.5MB, so files never pass through our functions.
2. `POST /api/products` validates the dress (`lib/dress.ts` rules), verifies each file via the ImageKit API, and inserts product + colours + photos + one queued job per photo in **one SQL statement** (`createProduct`), then kicks the worker.
3. `POST /api/worker` (`maxDuration = 300`) responds 202 and, in `after()`, claims one job (`claimNextJob`: advisory lock + max 2 processing), downloads source + reference (`?tr=orig-true`), runs the edit (with a back-view hint for backs) and — if the dress is still unnamed — naming from the first colour's front, uploads to ImageKit, then kicks itself for the next job. `GET /api/products[/id]` (polled every 3s while a dress is generating) fails timed-out jobs and re-kicks if anything is queued.
4. Completed dresses: `POST /api/products/classify` (one vision call, `lib/openai/classify.ts`, structured output; a suggestion only) → owner reviews → `POST /api/products` with `kind: "completed"` → `createCompletedDress` moves + renames the files into the dress folder and saves them as both source and result (no jobs, no regenerate).
5. A photo's status is its **latest** job's status (or done, if it has a result and no job); a dress is generating / attention (a failed photo) / ready. Regenerate = a new job for that photo (replaces its file).

### Layout

- `db/schema.sql` — tables `templates` (`is_default`), `products`, `product_colors`, `product_photos`, `jobs` (`photo_id`). `dresses` and `uploads` are from earlier versions and unused (kept, not dropped). `lib/db.ts` — Neon HTTP client behind a tiny `query()` interface (`setDb` swaps in PGlite for tests; `test/db.ts`).
- `lib/store/` — SQL repositories: `templates.ts`, `products.ts` (dresses, colours, photos), `jobs.ts`. `errors.ts` — `StoreError` → HTTP status in `lib/api.ts`.
- `lib/models.ts` — per-model capabilities (sizes, `input_fidelity`, qualities) and token prices. **Update this when OpenAI models/prices change**; verify against the installed `openai` SDK types (`node_modules/openai/resources/images.d.ts`), not memory.
- `lib/size.ts` — output size closest to the source aspect ratio, per model limits.
- `lib/openai/edit.ts` — the edit call (no retries, 270s timeout to fit the function limit), prompt framing (`composePrompt`), SDK error → readable message.
- `lib/openai/name.ts` — vision model names each dress from the source photo (never throws; falls back to the file name).
- `lib/imagekit.ts` — browser upload auth, file lookup/validation, download, `uploadImage` (exact path, never overwrites), `putImage` (replace a result), `relocateImage` (move/rename = re-upload + delete), delete.
- `lib/dress.ts` — dress input rules (sizes, colour names, quantities, price) shared by API and forms; price formatting (currency from `NEXT_PUBLIC_CURRENCY`).
- `lib/queue.ts` — `runNext` / `runJob`, `regeneratePhoto`, `updateProduct` (renaming the dress or a colour renames its ImageKit files via `syncFileNames`).
- `lib/shopify.ts` — Shopify product CSV (checked against Shopify's `product_template.csv`; re-check if Shopify changes its columns). `lib/api.ts` — `kickWorker` / `kickWorkerAfter`, error responses.
- `components/app-header.tsx` — top bar: section nav + theme menu. `lib/theme.ts` / `lib/theme-script.ts` — light/dark/system (class `dark` on `<html>`, set before paint by an inline head script).
- `components/dresses/` — upload page (`/`: type chooser, `completed-dress-form`, `generated-dress-form`, shared `dress-basics`), dress list + export dialog, dress detail, edit dialog, shared fields (photo slot, size picker, quantity grid). `components/settings/` — templates. `components/compare.tsx` — before/after slider.
- `components/ui/` — shadcn `components/ui/` — shadcn (generated, don't hand-edit unless needed).
- `lib/client.ts` — client fetch helper, `imageUrl` (ImageKit resize / download / cache-bust), `uploadToImageKit`, `exportToShopify`, data hooks (`useProducts`, `useProduct`, `useTemplates`; poll only while something is generating, reload on tab focus).

### Conventions and gotchas

- **shadcn uses Base UI, not Radix**: `render={<Button />}` instead of `asChild`; Select needs an `items` prop; ToggleGroup values are arrays; toasts are `toast.add({ title, type })` from `@/components/ui/toast`. Load the `shadcn` skill before UI work. `cn` comes from the `cn` npm package via `@/lib/utils`.
- Design direction is "grey-card studio": neutral grey canvas, white panels, one cobalt accent (`--primary`), Archivo with `font-condensed` reserved for template names. Dark mode keeps the idea (deep neutral grey, lifted panels, lighter cobalt). Use semantic tokens from `app/globals.css`, never raw colors or `dark:` overrides. Page content is capped at `max-w-6xl`. Selected states are cobalt: pressed toggles fill with `--primary` (edited in `components/ui/toggle.tsx`), the current nav section gets a cobalt underline. The theme button shows the mode on screen (sun/moon), not the setting.
- `lib/features.ts` — switches for built-but-hidden features (`SHOPIFY_EXPORT` is off for now; the export API still works).
- Headless Edge on Windows won't lay out narrower than ~500px; check mobile at 500 wide.
- Code style: no semicolons, double quotes, 100-column lines (`npx prettier --no-semi --print-width 100`).
- React 19 lint rules are strict: no synchronous `setState` in effects, no ref access during render. Load data inside effects via promise callbacks; remount forms with `key`/conditional rendering instead of reset effects.
- Server-only modules import `"server-only"`; Vitest aliases it to `test/server-only-stub.ts`.
- Cache Components is on: pages that read data must do so in client components or behind `<Suspense>`; `GET` handlers that don't read the request call `await connection()`.
- In Route Handlers, read `request.url` (e.g. the origin for `kickWorker`) **before** any `try` whose `catch` calls `errorResponse` — otherwise the prerender bail-out gets caught and logged during `next build`.
- **The ImageKit account has no file versions** (`Versions Limit Exceeded. Limit: 0`): overwrite, move and rename all fail. Only ever upload (with `overwriteFile: false`) and delete — use `putImage` / `relocateImage`. `lib/imagekit.test.ts` pins this down.
- No local disk on Vercel: never write files; everything persistent goes to Postgres or ImageKit.
- A **dress** is one Shopify product: `products.handle` (unique) is both the Shopify URL handle and the file-name stem. Colour names are unique per dress.
- Client components that read the path/params (`usePathname`, `useParams`) need a `<Suspense>` boundary with Cache Components (the header is wrapped in the layout; `/dresses/[id]` wraps its page). Don't use random values (`crypto.randomUUID()`) during render — prerendering rejects them; and never put changing keys in element `id`s (hydration mismatch).
- Schema changes go in `db/schema.sql` as idempotent statements (`ADD COLUMN IF NOT EXISTS`), then `npm run db:migrate`.
- Postgres params: cast possibly-null params (`$1::uuid IS NULL`) or Postgres can't infer the type.
- No sign-in by design: anyone with the URL can run edits (OpenAI spend) and get ImageKit upload signatures.
- **Windows**: stopping a background `next dev` task can leave its node child processes running; check with `Get-CimInstance Win32_Process` and confirm the port is free.
- Never send real data to OpenAI or ImageKit from tests — `lib/queue.test.ts` mocks `editImage`, `nameProduct` and the ImageKit calls.
