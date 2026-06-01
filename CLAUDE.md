# Agent Guide

This is `repo-scorer`, a SvelteKit web app that scores local Git repositories against the Agentic Repository Maturity Guide using a local MLX model.

## What This Builds

A local dashboard where you configure a list of repo paths, click Score on any of them, and get a full per-category maturity score driven by a local LLM. Results persist to `scores.json`. Two pages: a dashboard listing all repos with last scores, and a detail page per repo showing the full breakdown, quality flags, risk flags, and recommendations.

## Tech Stack

- SvelteKit 2 + TypeScript
- Vitest for unit tests
- No external UI library
- Local MLX model via OpenAI-compatible API (`http://localhost:8080` by default)

## Implementation Plan

The full step-by-step plan is at:

```
docs/plans/2026-06-01-repo-scorer.md
```

Use the `superpowers:subagent-driven-development` skill to execute it task by task.

## Setup (once scaffolded)

```bash
npm install
npm run dev       # starts at http://localhost:5173
npm run test -- --run   # run all tests once
```

The MLX server must be running separately for scoring to work:

```bash
python -m mlx_lm.server --model <your-model-path> --port 8080
```

## Key Config Files

- `repos.config.json` — list of repos to score (edit by hand)
- `.env` — set `MLX_BASE_URL` if your MLX server runs on a different port
- `rubric.md` — copy of the maturity guide used to build the LLM prompt (created in Task 10)
- `scores.json` — written by the app, gitignored

## Safety Rules

- Do not commit `scores.json`, `.env`, or `node_modules/`.
- Do not call the MLX endpoint during tests — mock `$lib/mlxClient` instead.
- Keep server-only logic (file I/O, LLM calls) in `+server.ts` files and `src/lib/` modules, never in `.svelte` components.
