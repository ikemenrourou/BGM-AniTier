# Repository Guidelines

## Project Structure & Module Organization

BGM AniTier is an anime ranking and taste-analysis app built with React, TypeScript, Vite, Tailwind CSS, and Express.

- `src/App.tsx` coordinates application state; `src/types.ts` defines shared models.
- `src/components/` contains UI components, such as `TierRow.tsx` and `RecordingStudioPage.tsx`.
- `src/lib/` holds ranking logic, Bangumi integration, themes, and studio utilities. Unit tests live beside their modules as `*.test.ts`.
- `server.ts` provides API routes, AI integration, persistence, and frontend serving. `functions/api/[[route]].js` contains the alternate deployment API handler.
- `src/index.css` contains global styles; `public/assets/` holds static media; `截图/` contains screenshots. `dist/` is generated build output.

## Build, Test, and Development Commands

- `npm install`: install dependencies.
- `npm run dev`: start Express with Vite development middleware at `http://localhost:3000` by default.
- `npm run build`: compile the frontend into `dist/`.
- `npm run lint`: run TypeScript checks with `tsc --noEmit`; this is not an ESLint check.
- `npx tsx --test src/lib/*.test.ts`: run the unit tests. There is no `npm test` script.
- `npm start`: run the server. Set `NODE_ENV=production` after building to serve `dist/`; in PowerShell, use `$env:NODE_ENV='production'; npm start`.

## Coding Style & Naming Conventions

Match existing code: two-space indentation, single-quoted strings, semicolons, and ES module imports. Use PascalCase for components and interfaces, camelCase for functions and variables, and uppercase snake case for constants. Prefer explicit shared types and `import type` for type-only imports. Keep reusable transformations in `src/lib/`. No formatter or ESLint configuration is currently provided.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`. Name cases after observable behavior, and cover edge cases when changing ranking, parsing, or palette logic. No coverage threshold is configured. Before submitting, run type checks, unit tests, and the build. For UI changes, manually verify affected interactions and include screenshots.

## Commit & Pull Request Guidelines

This checkout lacks Git metadata; historical commit conventions are unverified. Use imperative subjects, e.g. `Fix half-tier score restoration`. Keep changes focused. PRs should describe the behavior change, link relevant issues, list validation results, and include screenshots for visual changes.

## Configuration & Local Data

Copy `.env.example` to `.env` and supply `GEMINI_API_KEY` for AI features. Keep credentials and `.data/` out of commits. User data lives in IndexedDB and mirrors to `.data/user-state.json`; Cloudflare only persists in the browser. Register new fields in `src/lib/persistenceSchema.ts` so backups include them. Test imports with isolated data (`BGM_DATA_DIR` and a separate port), never the user's live store. Check staged files.

## Release Defaults

New browsers must start with no works, comments, reports, or generated dialogue. Preserve existing user data. Run `npm run build:cf` and deploy only `dist-static/` from outside the repository so Wrangler does not include legacy `functions/`. The sole server exception is `cloudflare/pages/_worker.js`: a fixed-upstream, GET-only public-comments relay. Never forward tokens or cookies through it or store user data. Never publish personal tokens, backups, or AI Studio media. Each visitor supplies their own credentials in their browser.

Show all integer tiers (10–1) by default. Keep the full whale-girl persona in `src/lib/feiyuPersona.ts`, shared by reports and studio; append task-specific output rules separately. Default host art and audio must be generic, with no personal identity. Migrate only recognized stock presets and preserve user customizations.
