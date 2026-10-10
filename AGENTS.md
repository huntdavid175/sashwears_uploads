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

Hosted on **Vercel (Hobby)**, no sign-in. A **template** = one background reference photo + instructions + model settings. Every product photo run through a template keeps its subject exactly and gets the template's background, via the OpenAI Images Edit API (`[source, reference]` as inputs). A vision model names each dress; the result is stored on **ImageKit** under that name. Data lives in **Neon Postgres**. Spec and progress live in `plan.md` — tick its checkboxes as work completes.

### Commands

- `npm run dev` — dev server (needs `.env.local`; see `.env.example`)
- `npm run db:migrate` — apply `db/schema.sql` to `DATABASE_URL` (idempotent)
- `npm test` — Vitest (`lib/**/*.test.ts`, Postgres via in-memory PGlite); `npx tsc --noEmit`; `npm run lint`; `npx next build`
- Run `npx next typegen` after adding routes so `RouteContext<...>` types exist for `tsc`

### How a photo flows

1. Browser uploads originals / reference photos **straight to ImageKit** (`uploadToImageKit` in `lib/client.ts`, signed by `GET /api/imagekit/auth`) — Vercel caps request bodies at ~4.5MB, so files never pass through our functions.
2. `POST /api/templates/[id]/jobs` gets `{ sources: [{ fileId, originalName }] }`, verifies each file via the ImageKit API, inserts queued jobs, and kicks the worker.
3. `POST /api/worker` (`maxDuration = 300`) responds 202 and, in `after()`, claims one job (`claimNextJob`: advisory lock + max 2 processing), downloads source + reference (`?tr=orig-true`), runs the edit and naming in parallel, uploads to ImageKit, then kicks itself for the next job. `GET /api/jobs` (polled every 2s while work is active) fails timed-out jobs and re-kicks if anything is queued.

### Layout

- `db/schema.sql` — tables `templates`, `dresses`, `jobs`. `lib/db.ts` — Neon HTTP client behind a tiny `query()` interface (`setDb` swaps in PGlite for tests; `test/db.ts`).
- `lib/store/` — SQL repositories: `templates.ts`, `jobs.ts` (jobs + dresses). `errors.ts` — `StoreError` → HTTP status in `lib/api.ts`.
- `lib/models.ts` — per-model capabilities (sizes, `input_fidelity`, qualities) and token prices. **Update this when OpenAI models/prices change**; verify against the installed `openai` SDK types (`node_modules/openai/resources/images.d.ts`), not memory.
- `lib/size.ts` — output size closest to the source aspect ratio, per model limits.
- `lib/openai/edit.ts` — the edit call (no retries, 270s timeout to fit the function limit), prompt framing (`composePrompt`), SDK error → readable message.
- `lib/openai/name.ts` — vision model names each dress from the source photo (never throws; falls back to the file name).
- `lib/imagekit.ts` — browser upload auth, file lookup/validation, download, upload (exact path; `replace` = overwrite + purge), rename, delete.
- `lib/queue.ts` — `runNext` / `runJob`, regenerate, retry, rename. `lib/api.ts` — `kickWorker` / `kickWorkerAfter`, error responses.
- `components/studio/` — the UI; `components/ui/` — shadcn (generated, don't hand-edit unless needed).
- `lib/client.ts` — client fetch helper, `imageUrl` (ImageKit resize / download / cache-bust), `uploadToImageKit`, data hooks (`useTemplates`, `useJobs` with polling only while jobs are active).

### Conventions and gotchas

- **shadcn uses Base UI, not Radix**: `render={<Button />}` instead of `asChild`; Select needs an `items` prop; ToggleGroup values are arrays; toasts are `toast.add({ title, type })` from `@/components/ui/toast`. Load the `shadcn` skill before UI work. `cn` comes from the `cn` npm package via `@/lib/utils`.
- Design direction is "grey-card studio": neutral grey canvas, white panels, one cobalt accent (`--primary`), Archivo with `font-condensed` reserved for template names. Use semantic tokens from `app/globals.css`, not raw colors.
- Code style: no semicolons, double quotes, 100-column lines (`npx prettier --no-semi --print-width 100`).
- React 19 lint rules are strict: no synchronous `setState` in effects, no ref access during render. Load data inside effects via promise callbacks; remount forms with `key`/conditional rendering instead of reset effects.
- Server-only modules import `"server-only"`; Vitest aliases it to `test/server-only-stub.ts`.
- Cache Components is on: pages that read data must do so in client components or behind `<Suspense>`; `GET` handlers that don't read the request call `await connection()`.
- In Route Handlers, read `request.url` (e.g. the origin for `kickWorker`) **before** any `try` whose `catch` calls `errorResponse` — otherwise the prerender bail-out gets caught and logged during `next build`.
- No local disk on Vercel: never write files; everything persistent goes to Postgres or ImageKit.
- A **dress** is one product: all runs of the same photo (regenerate) share its name, file name and single ImageKit file. File names are unique via the `dresses.file_name` unique index.
- Postgres params: cast possibly-null params (`$1::uuid IS NULL`) or Postgres can't infer the type.
- No sign-in by design: anyone with the URL can run edits (OpenAI spend) and get ImageKit upload signatures.
- **Windows**: stopping a background `next dev` task can leave its node child processes running; check with `Get-CimInstance Win32_Process` and confirm the port is free.
- Never send real data to OpenAI or ImageKit from tests — `lib/queue.test.ts` mocks `editImage`, `nameProduct` and the ImageKit calls.
