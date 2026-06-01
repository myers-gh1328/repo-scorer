# Repo Scorer — Design Spec

**Date:** 2026-06-01  
**Status:** Approved

---

## Overview

A standalone SvelteKit web app that evaluates local Git repositories against the Agentic Repository Maturity Guide and displays a per-category score, quality flags, risk flags, and recommended actions. Repos are configured by local path. Scoring is performed on demand by a local MLX model via its OpenAI-compatible API.

---

## Goals

- Score any local repo against the maturity rubric with one button click.
- Show a full per-category breakdown, not just a total score.
- Persist results so the dashboard is useful without re-running the LLM.
- Keep v1 simple: no database, no auth, no Score All, no GitHub integration.

---

## Architecture

A single SvelteKit project. SvelteKit server routes handle all file I/O and LLM calls. The frontend is plain Svelte — no external UI library needed for v1.

```
repo-scorer/
  repos.config.json          # manually maintained list of repos to score
  scores.json                # written by the app after each run (gitignored)
  rubric.md                  # copy of agentic_repo_maturity_guide_2026.md
  src/
    routes/
      +page.svelte           # dashboard — repo list with last scores
      repo/[name]/
        +page.svelte         # detail page — full report for one repo
        +page.server.ts      # loads scores.json entry for this repo
      api/
        score/
          +server.ts         # POST: scan → prompt → MLX → persist → return
    lib/
      scanner.ts             # walks repo path, collects relevant file contents
      promptBuilder.ts       # builds structured LLM prompt from rubric + files
      mlxClient.ts           # calls MLX OpenAI-compatible endpoint
      types.ts               # ScoreResult, RepoConfig, CategoryScores, etc.
  .env                       # MLX_BASE_URL (default: http://localhost:8080)
```

---

## Configuration

**`repos.config.json`** — edited by hand, checked into the repo:

```json
[
  { "name": "aiapptriage", "path": "/Users/mike/source/repos/aiapptriage" },
  { "name": "billing-api",  "path": "/Users/mike/source/repos/billing-api" }
]
```

**`.env`:**

```
MLX_BASE_URL=http://localhost:8080
```

---

## Data Model

**`scores.json`** — written by the server after each successful score, keyed by repo name:

```json
{
  "aiapptriage": {
    "scoredAt": "2026-06-01T10:00:00Z",
    "score": 72,
    "band": "Operational",
    "primaryLanguage": "C#",
    "categories": {
      "persistent_guidance": 11,
      "scoped_rules": 0,
      "skills": 0,
      "specialized_agents": 0,
      "tool_manifests_mcp": 1,
      "validation_reproducibility": 6,
      "ci_pr_automation": 0,
      "security_sandboxing_hooks": 1,
      "domain_context": 4,
      "governance_observability": 1,
      "versioning_provenance": 2,
      "onboarding_discoverability": 2
    },
    "qualityFlags": [
      "AGENTS.md includes exact validation commands",
      "Rich domain context: 7 ADRs, schemas, examples"
    ],
    "riskFlags": [
      "No scoped rules detected",
      "No skills or specialized agents",
      "No CI workflows"
    ],
    "recommendations": [
      "Add .claude/agents/verifier.md with read-only tools",
      "Add .claude/rules/ with scoped rules for C# and Azure Functions",
      "Add .github/workflows/ci.yml aligned to dotnet test command"
    ]
  }
}
```

Category max values (must sum to 100): persistent_guidance=15, scoped_rules=10, skills=10, specialized_agents=10, tool_manifests_mcp=10, validation_reproducibility=10, ci_pr_automation=10, security_sandboxing_hooks=10, domain_context=5, governance_observability=5, versioning_provenance=3, onboarding_discoverability=2.

---

## UI Flow

### Dashboard (`/`)

- Loads `repos.config.json` and `scores.json` on the server.
- Renders one row per configured repo showing: name, last scored timestamp (or "Not yet scored"), total score, health band (color-coded: red=Fragile, amber=Emerging, green=Operational/Managed/Mature), and a Score button.
- Clicking Score POSTs to `/api/score` with the repo name and path, then navigates to the detail page on success.
- No Score All button.

### Detail Page (`/repo/[name]`)

- Large score and health band at the top.
- Per-category bar chart: all 12 categories, each showing score vs. maximum weight as a horizontal bar.
- Quality flags section (green) — what the LLM identified as strengths.
- Risk flags section (red) — gaps and problems found.
- Recommended next actions section (amber) — prioritized list of improvements.
- Re-score button at the top — re-runs the full scoring pipeline for this repo.
- Back link to dashboard.

---

## Scoring Pipeline

Triggered by `POST /api/score`:

1. **Validate** — confirm the repo path exists on disk.
2. **Scan** — `scanner.ts` walks the path looking for the ~30 file patterns defined in the rubric (AGENTS.md, .cursor/rules/**, .claude/agents/**, .github/workflows/**, etc.). Reads matching files, capping each at 8,000 characters to avoid token overflow.
3. **Build prompt** — `promptBuilder.ts` combines the rubric scoring criteria with the collected file contents and instructs the model to return a JSON object matching the `ScoreResult` schema. No free-form prose requested.
4. **Call MLX** — `mlxClient.ts` POSTs to `$MLX_BASE_URL/v1/chat/completions`. Single attempt, then one retry if JSON parsing fails.
5. **Persist** — writes the result into `scores.json` under the repo name key.
6. **Return** — returns the `ScoreResult` to the client.

---

## Error Handling

| Failure | Behaviour |
|---|---|
| MLX unreachable | Returns 503; dashboard shows "MLX server unreachable — is it running?" |
| Repo path not found | Returns 400; error shown inline on dashboard row |
| LLM returns malformed JSON | Retries once; if still invalid returns 500 with "Scoring failed — model response could not be parsed"; previous score is preserved |

---

## Out of Scope (v1)

- GitHub API integration (score remote repos without cloning)
- Score history over time per repo
- Score All button
- Authentication
- Deployment / hosting
- Automated re-scoring on a schedule

---

## Rubric Reference

The rubric used for scoring is `agentic_repo_maturity_guide_2026.md` (copied into the project as `rubric.md`). The 12 scoring categories and their weights are defined in Section 6 of that document.
