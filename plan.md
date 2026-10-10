# Background Template Image Editor — Build Plan

Next.js 16.4 app deployed on Vercel (Hobby, no sign-in). Processed images are named by AI after the dress and stored on ImageKit; data in Neon Postgres. Phases 1–6 describe the original local version. Save **templates** (reference image + prompt + settings); every product photo you upload keeps its subject exactly and gets the template's background, via OpenAI GPT image edits. Storage is JSON + image files in `./data` (gitignored). UI: shadcn + frontend-design skills.

Legend: `[ ]` todo · `[x]` done

---

## Phase 0 — Setup
- [x] Interview + spec agreed
- [x] Install skills: `frontend-design`, `shadcn` (in `.claude/skills/`)
- [x] Read Next 16.4 bundled docs (`node_modules/next/dist/docs/`) — route handlers, server actions, caching, `instrumentation`
- [x] `shadcn init` (base-nova, Base UI, lucide) + components: button, card, dialog, alert-dialog, input, textarea, select, badge, progress, label, field, empty, spinner, skeleton, toast, alert, separator, dropdown-menu, toggle-group, tooltip
- [x] Install `openai@7.30.0`, `vitest@5.0.3` (bumped `@types/node` to 24 to match Node 24)
- [x] `/data` gitignored (`.env*` already ignored), `.env.example` added
- [ ] **You:** create `.env.local` with `OPENAI_API_KEY=...`

## Phase 1 — Storage layer (`lib/store/`)
- [x] Atomic JSON read/write (temp file + rename, Windows EPERM retry) behind an in-process mutex
- [x] Templates repo: list / get / create / update / duplicate / delete; unique name, slug
- [x] Reference image save to `data/templates/<id>/reference.<ext>`
- [x] Jobs repo: create / update status / list by template
- [x] Unit tests (vitest): atomic write, CRUD, name uniqueness, image sniffing (18 passing)

## Phase 2 — OpenAI + sizing
- [x] Model capability table (`lib/models.ts`): sizing, `input_fidelity`, qualities (2.5 adds xhigh/max), token prices
- [x] Verified params against SDK 7.30 types + developers.openai.com pricing (2026-10-07)
- [x] `lib/size.ts`: closest-aspect size per model (fixed 3 sizes vs flexible WxH, ×16, 1:3–3:1, ≤2560 edge) + tests
- [x] `lib/openai/edit.ts`: `images.edit` with `[source, reference]` + composed prompt
- [x] Error mapping: SDK `maxRetries: 1` handles 429/5xx/network; 401/403/400/policy → readable message

## Phase 3 — Queue
- [x] `lib/queue.ts`: in-process worker, concurrency 2, persists to `data/jobs.json` (state on globalThis to survive HMR)
- [x] On first use per process: `processing` jobs → `failed (interrupted)`
- [x] Output saved to `data/outputs/<templateSlug>/<YYYY-MM-DD>/<name>-<jobId8>.<fmt>`
- [x] Regenerate (new job, same source, current template) + Retry (failed job) — tested with mocked OpenAI

## Phase 4 — API surface
- [x] Template route handlers: `/api/templates` (GET, POST), `/api/templates/[id]` (GET, PATCH, DELETE), `/duplicate`
- [x] Batch upload `POST /api/templates/[id]/jobs` (max 20, png/jpg/webp, validated before saving)
- [x] `GET /api/jobs?templateId=`, `POST /api/jobs/[id]/retry`, `/regenerate`
- [x] `GET /api/files/[...path]` (traversal-safe, `?download`) — all smoke-tested with curl

## Phase 5 — UI (shadcn + frontend-design)
- [x] Design direction: **Grey-card studio** (neutral grey canvas, white panels, cobalt accent, Archivo w/ condensed template names)
- [x] Template rail (thumbnails) + empty state "Create your first template"; selection in URL `?t=`
- [x] Create/edit template dialog: reference upload + preview, name, instructions, model, quality (per model), format
- [x] Template workbench: multi-image drop zone, size-aware cost estimate, Start
- [x] Results: status badges + elapsed time, drag-to-compare before/after, Download, Regenerate, Retry; 2s polling only while active
- [x] Toasts for errors; duplicate / delete (with confirm) template

## Phase 6 — Verify (definition of done)
- [x] UI checked in headless Edge at desktop + narrow widths (fixed: mobile header overflow, card stretching, compare letterbox)
- [x] `npm run lint`, `tsc`, `npm test` (32) pass; `next build` clean (0 warnings)
- [ ] **Needs your API key:** real run: template + 3+ product photos → outputs inline and on disk, subject preserved, background matches
- [ ] **Needs your API key:** refresh mid-batch restores queue; restart mid-job → `failed – retry` works
- [x] Missing key / bad uploads → readable error per job, others continue (checked via API + UI)

## Phase 7 — AI dress names + ImageKit
- [x] Vision naming (`lib/openai/name.ts`, Responses API, `OPENAI_NAMING_MODEL`, default `gpt-5.4-mini`) runs alongside the edit; falls back to the upload's file name
- [x] Unique file name per dress (`emerald-satin-wrap-dress`, `-2`…) reserved under the jobs lock; local backup named after it
- [x] Upload to ImageKit (`lib/imagekit.ts`, `/<IMAGEKIT_FOLDER>/<template-slug>/<name>.<ext>`); fresh uploads never overwrite
- [x] Regenerate keeps the dress name and replaces the same ImageKit file (overwrite + CDN purge)
- [x] Upload failure leaves the job done with `uploadError` + Retry upload (`POST /api/jobs/[id]/upload`)
- [x] Rename (`PATCH /api/jobs/[id]`) renames all runs of the dress and the ImageKit file (purges old URL)
- [x] UI: dress name + rename on cards, ImageKit link, Download uses the dress name; tests (36) / lint / tsc / build pass
- [x] ~~Local backup / Retry upload~~ — dropped in Phase 8 (no disk on Vercel)

## Phase 8 — Vercel deployment
- [x] Neon Postgres (`db/schema.sql`, `npm run db:migrate`): templates, dresses (unique `file_name`), jobs
- [x] Originals + references upload browser → ImageKit (signed via `/api/imagekit/auth`); server verifies via ImageKit API
- [x] One function per job: `/api/worker` (`maxDuration` 300) claims under an advisory lock (max 2), runs in `after()`, chains; `GET /api/jobs` fails timed-out jobs and re-kicks
- [x] Removed `./data`, `/api/files`, in-process queue; UI images served by ImageKit (resized previews, `ik-attachment` download)
- [x] Tests on PGlite (33) / lint / tsc / build pass
- [ ] **You:** create Neon DB (Vercel → Storage → Neon), copy env vars to `.env.local`, run `npm run db:migrate`
- [ ] **You:** set Vercel env vars: `DATABASE_URL`, `OPENAI_API_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_PUBLIC_KEY` (+ optional `OPENAI_NAMING_MODEL`, `IMAGEKIT_FOLDER`); Fluid compute on (default)
- [ ] **Needs your keys:** real run — upload, names, ImageKit files, regenerate replaces, rename moves the file, a slow `high` edit fits in 300s

---

## Assumptions
1. Results shown inline in the queue; no separate history gallery.
2. One output per run; Regenerate creates a new job (never overwrites).
3. Default template: `gpt-image-2`, quality `high`, `png`.
4. Concurrency 2, no spend cap; cost estimate from a hardcoded price table.
5. Max ~20 images per batch; png/jpg/webp.
6. Single user / single tab; moderation `auto`.

## Open risks
- Hobby caps a function at 300s; a very slow edit (large size, highest quality) times out → job fails "Timed out" and costs the edit. Use Pro (800s) or lower quality if that happens.
- No sign-in: the URL alone gives access to OpenAI spend and ImageKit uploads.
- Garment details (prints, logos, text) and faces may drift — test on real photos early, tune prompt.
- "Same scene recreated" varies slightly between outputs; identical backdrops would need compositing (v2).
- Model params/sizes change between models — capability table must stay current.
- Edits are slow (tens of seconds) and cost per image adds up.
- Dev-server HMR restarts can kill in-flight jobs (handled by interrupted → retry).
- Outputs accumulate on disk; no cleanup UI in v1.
