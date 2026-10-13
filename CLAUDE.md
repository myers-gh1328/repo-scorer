# Agent Guide

This is `repo-scorer`, a SvelteKit web app that scores local Git repositories against version-controlled rubrics using an LLM served through an OpenAI-compatible API (typically a local MLX server).

## What This Builds

A local dashboard where you register repo paths, click Score, and get a per-category score driven by the LLM plus deterministic checks. Pages:

- `/` — dashboard of repos with latest scores
- `/repo/[name]` — full breakdown, quality/risk flags, recommendations, score history, improvement plan
- `/settings` — LLM endpoint, model, AI tooling, JSON-schema mode, local model tier

Evaluation modes (`src/lib/evaluationModes.ts`):

- `ai-readiness` (default) — `rubric.md` + `rubric.schema.json` (Agentic Repository Maturity Guide v2.0, with Cloud/Local score profiles)
- `maintainability` (beta) — `rubrics/maintainability/` + `src/lib/reference/runtimeSupport.json`, with jscpd duplication evidence

## Scoring Pipeline

`scoreRepo` in `src/lib/scorer.ts`:

1. `scanner.ts` (+ `duplication.ts` in maintainability mode) collects files and an evidence inventory. Nested checkouts (any directory holding `.git`, such as agent worktrees) are skipped.
2. One LLM call per rubric category (`promptBuilder.ts`, `llmClient.ts`, `responseSchemas.ts`). Each prompt carries the full rubric markdown unless the scoring model's context window cannot fit it; then it steps down to per-category excerpts (`rubricGuidance.ts`, `promptBudget.ts`). Context-length errors from the server also step down a level.
3. `scoreCaps.ts` applies deterministic evidence caps.
4. `consistencyChecks.ts` enforces band constraints.
5. `profileScores.ts` computes Cloud/Local profile scores.
6. Result and history persist to SQLite via `src/lib/server/storage.ts` (schema migrations in `storageSchema.ts`, one-time JSON import in `storageLegacyImport.ts`).

## Tech Stack

- SvelteKit 2 + Svelte 5 + TypeScript
- Vitest for unit tests
- `better-sqlite3` for persistence
- No external UI library

## Commands

```bash
npm install
npm run dev              # http://localhost:5173
npm run test -- --run    # run all tests once
npm run check            # svelte-check / type check
```

Scoring needs an OpenAI-compatible server running separately, e.g.:

```bash
python -m mlx_lm.server --model <your-model-path> --port 8080
```

## Configuration and State

- `.env` — `LLM_BASE_URL`, `LLM_MODEL`, `AI_TOOLING`, `USE_JSON_SCHEMA`, `LOCAL_MODEL_TIER`. Written by the Settings page; see `.env.example`. Legacy `MLX_BASE_URL`/`MLX_MODEL` are migrated on read. Optional `LLM_API_KEY` is sent as a Bearer token; it is never returned by `/api/settings`. Optional `LLM_CONTEXT_TOKENS` sets the scoring model's context window; when blank it comes from `/v1/models`, then a known-model floor, else it is treated as unknown (full rubric sent).
- `repo-scorer.sqlite` — repos, scores, history, improvement plans. Gitignored.
- Optional env overrides: `REPO_SCORER_DB_PATH`, `REPO_SCORER_DATA_DIR`, `REPO_SCORER_ENV_PATH`, `REPO_SEARCH_ROOTS` (comma-separated roots for repo discovery).
- Model ids are normalized in `src/lib/modelCatalog.ts` (`KNOWN_MODEL_IDS` skip server validation); the id `local` is blocked.
- `callLLM` applies a per-attempt timeout and retries connection errors and 408/429/5xx; see `LLMConfig` in `src/lib/types.ts`.
- Legacy JSON files (`repos.config.json`, `scores.json`, `score-history.json`, `improvement-plans.json`) are imported into SQLite once on first start, then ignored.

## Rubric Changes

Schemas reference rubric markdown headings through `guidance` and per-category `guidanceSections`. Every referenced heading must match exactly one heading outside code fences, or rubric loading fails; renaming a heading means updating the schema.

Rubric, schema, and scorer changes go through the gated workflow in `docs/rubric-updates/README.md`, using the skills in `.agent/skills/` (`research-rubric-freshness`, `evaluate-candidate-rubric`, `implement-rubric-update`). Do not edit active rubric files without an approved implementation plan.

`docs/plans/` and `docs/specs/` describe the original v1 design and are historical; the code is the source of truth.

## Dev Cage

`.devcontainer/` declares the sandbox image for the dev cage (aegir-infra
ADR-0025). Dependencies are baked into the image from `package-lock.json`, and
the sandbox has no network, so `npm install` does not work inside it. To add or
change a dependency, edit `package.json` and `package-lock.json`, then stop; the
image is rebuilt outside the cage. `npm run check`, `npm run build` and
`npm run test -- --run` work offline. Scoring does not, because the model is
unreachable from the sandbox; tests mock `$lib/mlxClient`.

## Safety Rules

- Do not commit `.env`, `repo-scorer.sqlite*`, legacy JSON state files, or `node_modules/`.
- Do not call the LLM endpoint during tests — mock `./llmClient` (`callLLM`) instead, and mock `./duplication` when scanning.
- Keep server-only logic (file I/O, LLM calls, SQLite) in `+server.ts` / `+page.server.ts` files and `src/lib/` modules, never in `.svelte` components.
