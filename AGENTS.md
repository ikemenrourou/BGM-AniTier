# Repository Guidelines

BGM AniTier v2.0 is a personal anime ranking and taste-analysis app: a drag-and-drop tier list with Bangumi integration, an AI persona report, and a "recording studio" (小剧场) page for scripted dialogue and PNG export. UI copy is Simplified Chinese; code comments and identifiers are English.

## Stack & Deployment Targets

- React 19 + TypeScript + Vite 6 + Tailwind CSS v4 + `motion` + `lucide-react`.
- `server.ts` (Express 4 + Vite middleware) is the local/self-hosted runtime and the Bangumi/AI proxy.
- Cloudflare Pages serves a static build; its only server code is `cloudflare/pages/_worker.js`.
- Two distinct builds, do not mix them:
  - `npm run build` → `dist/`, `publicDir = public/` (includes personal AI Studio media). Local/server use only.
  - `npm run build:cf` → `dist-static/`, `publicDir = cloudflare/pages/` (ships `_worker.js` + `_routes.json`, excludes `public/`). This is the publishable artifact.
- Deploy `dist-static/` from a directory outside the repo: `wrangler pages deploy . --project-name bgm-anitier --branch main`. Never deploy from the repo root and never upload `.data/`, `.env`, backups, or `public/assets/aistudio/`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install dependencies. |
| `npm run dev` | Express + Vite middleware on `http://127.0.0.1:3000` (override with `PORT`/`HOST`). |
| `npm run lint` | `tsc --noEmit` type check. There is no ESLint/Prettier config. |
| `npx tsx --test src/lib/*.test.ts` | Run all unit tests (17 files). There is no `npm test` script. Run one file by naming it. |
| `npm run build` | Production `dist/` (local/server). |
| `npm run build:cf` | Static `dist-static/` for Cloudflare Pages. |
| `npm start` | Start Express. With `NODE_ENV=production` it serves `dist/` instead of Vite middleware. |
| `npm run clean` | Remove `dist/`. |

Before handing off: `npm run lint`, the test command above, and the relevant build. For visual changes, verify in a browser. README images live in `docs/screenshots/`; `截图/` keeps historical screenshots.

## Layout

- `src/App.tsx` — state hub and page switch (`isRecordingMode` chooses `RecordingStudioPage` vs the board). Large; inspect targeted regions instead of reading it whole.
- `src/types.ts` — shared models (`AnimeItem`, `TierScore`, `AIConfig`, `BangumiSyncConfig`, world book, …).
- `src/lib/` — pure logic plus I/O adapters, each with a sibling `*.test.ts`:
  - `tierLogic.ts` — tier CRUD, letter/numeric grading, tag aggregation, AI prompt building, world book defaults, role presets.
  - `persistenceSchema.ts` — the single registry of storage keys, board/studio field maps, backup merge/reconcile helpers.
  - `appStorage.ts` — IndexedDB snapshot store, server mirror queue, import/restore.
  - `backup.ts`, `stateFile.ts` — portable backup payloads and the `.data/user-state.json` file.
  - `bangumiApi.ts`, `bangumiDeepData.ts`, `bangumiSeasonal.ts` — Bangumi v0/next clients and character/comment enrichment.
  - `studioDirector.ts` — studio types, character/companion defaults, emote + voice presets, prompt rules. Also huge; search exports.
  - `studioSpeech.ts`, `voiceBlipEngine.ts`, `studioContext.ts`, `feiyuPersona.ts` — speech synthesis scheduling, blip SFX, prompt context, and the report/studio whale-girl persona sheets.
  - `aiStream.ts`, `runtime.ts` — AI request routing and static-hosting guards.
  - `reportMarkup.ts`, `colorExtractor.ts`, `characterCardPng.ts`, `presetFingerprint.ts`, `promptOrder.ts`, `themes.ts` — rendering/export helpers and presets.
- `src/components/` — UI. Biggest: `RecordingStudioPage.tsx` (~4.1k lines), `TasteReportSection.tsx` (~2.2k), `PosterWallModal.tsx` (~1.5k), `BgmSync`/`SearchModal`, plus studio subcomponents (`StudioSceneImage`, `StudioDialogueBubble`, `StudioScrapbookModal`, …).
- `src/index.css` — global CSS/Tailwind entry. `public/` — local media (personal `aistudio/` assets are local-only). `cloudflare/pages/` — static-host worker + routes. `docs/` — audit notes. `metadata.json` — AI Studio metadata.

## Data, Persistence & Runtime Rules

- Persisted state lives in IndexedDB `bgm-anitier-user-data-v1` (store `snapshots`), mirrored to `.data/user-state.json` through `GET/POST /api/storage/state` when a server is present. Cloudflare deployments keep data in the browser only.
- `persistenceSchema.ts` is the source of truth: to persist a new field, add it to `STORAGE_KEYS`/`STUDIO_STORAGE_KEYS` and the matching field map, otherwise backups and server recovery will drop it. Never rename or recycle an existing storage key or key suffix version — that silently loses user data.
- `mergeStoragePatch` rejects conflicting writes from another tab with a user-facing error; preserve this guard when touching storage code.
- Import keeps a pre-import recovery point (`restoreBeforeImport`); exports contain API keys and tokens, so treat them as secrets.
- `runtime.ts` derives `IS_STATIC_HOSTING` from Vite mode `static`; server-only endpoints must go through `fetchAppApi` so static hosting shows an actionable message instead of a network failure.
- AI: when the user supplies an OpenAI-compatible `baseUrl` + key, the browser calls it directly (CORS required); otherwise it falls back to the Express `/api/gemini/*` and `/api/ai/*` routes. Server env vars: `GEMINI_API_KEY` (optional server-side AI), `BGM_ACCESS_TOKEN` (fallback token), `BGM_DATA_DIR` (default `.data`), `PORT`, `HOST`, `STORAGE_BODY_LIMIT`, `DISABLE_HMR`. `.env.example` only lists a subset — copy it to `.env` and add what you need.
- Server routes: `/api/health`, `/api/storage/state`, `/api/public-comments/:kind/:id`, `/api/bangumi/{search,me-collections,push-collection,subject/:id,subject-deep/:id,cover/:id}`, `/api/gemini/{generate,stream}`, `/api/ai/{custom-stream,models}`.
- The Pages worker is a deliberately narrow relay: `GET /api/public-comments/(subjects|characters)/:id` → `next.bgm.tv`, fixed upstream, no auth headers, no writes, short cache. `_routes.json` includes only that path. Do not forward tokens/cookies through it or persist user data.

## Defaults & Product Invariants

- New browsers start empty: no works, comments, saved report, or generated dialogue. Never seed demo/personal content.
- Show all integer tiers 10–1 by default; `0.5` half tiers are opt-in per board. Letter mode uses 10/8/6/4/2.
- Migrate only recognized stock presets; preserve user customizations and custom IDs.
- Keep both whale-girl sheets in `src/lib/feiyuPersona.ts`: `FEIYU_DEFAULT_PERSONA_PROMPT` for the report and `FEIYU_STUDIO_PERSONA_PROMPT` for the studio. Append task-specific output rules instead of forking the sheets; legacy stock prompts upgrade by fingerprint.
- Default host art/audio must stay generic (no personal identity); personal assets stay in `public/assets/aistudio/` and out of static builds.

## Coding Style & Testing

- Two-space indent, single quotes, semicolons, ES modules, `import type` for types. JSX uses double-quoted attributes.
- PascalCase for components/interfaces, camelCase for functions/variables, UPPER_SNAKE for constants. Keep reusable logic in `src/lib/`, UI concerns in components.
- Tests use `node:test` + `node:assert/strict`; storage tests rely on `fake-indexeddb`. Name tests after observable behavior and cover ranking, parsing, palette, storage-reconnect, and prompt edge cases. No coverage threshold.
- When testing storage against a live server, use an isolated `BGM_DATA_DIR` and port — never the real `.data/user-state.json`. Vite's watcher ignores `.data/**` on purpose; keep it that way.

## Git & PRs

History uses Conventional-Commit-style imperative subjects (`feat: …`, `refactor: …`, `chore: …`). Keep commits focused. A PR should state the behavior change, list validation commands, note data/backup implications, and include screenshots for visual changes. Check staged files for secrets, `.data/`, and `public/assets/aistudio/`.
