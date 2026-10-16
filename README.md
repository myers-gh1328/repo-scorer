# repo-scorer

A local SvelteKit dashboard that scores Git repositories against version-controlled rubrics, using an LLM behind an OpenAI-compatible API (typically a local MLX server) plus deterministic checks.

## Quick start

Requires Node 24 (`nvm use` reads `.nvmrc`).

```bash
npm install
npm run dev              # http://localhost:5174
npm run test -- --run
npm run check
```

Scoring needs a separate OpenAI-compatible server, for example `python -m mlx_lm.server --model <model-path> --port 8080`. Configure it on the Settings page or in `.env` (see `.env.example`).

## Where things live

- `AGENTS.md`: agent and contributor guidance. `CLAUDE.md` and `.gemini/settings.json` point to it.
- `.agents/skills/`: rubric-maintenance skills (`.claude/skills` links here).
- `rubric.md`, `rubric.schema.json`, `rubrics/`: the active rubrics. Changes follow `docs/rubric-updates/README.md`.
- `.devcontainer/`: the offline dev-cage image.
