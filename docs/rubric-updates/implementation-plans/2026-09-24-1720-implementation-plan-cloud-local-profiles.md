# Implementation Plan: Rubric v2.0, Vendor Freshness and Cloud/Local Score Profiles

## Decision

Status: needs-human-decision
Report type: implementation-plan
Inputs:
- docs/rubric-updates/freshness-research/2026-09-24-1602-freshness-research-cloud-vs-local-scoring.md
Required follow-up:
- Maintainer approves this plan by path in the conversation before any active rubric, schema or code file is edited.

## 1. Approvals and inputs

- **Report used:** the freshness report above, which is still marked `Status: needs-human-decision`. Its named open items are:
  - F19: Cursor, not verified.
  - F20: Windsurf/Devin, not verified.
  - Section 6: the arXiv per-model deltas, current-frontier benchmark numbers, and the tiny tier's extrapolated settings.
- **Approval to proceed despite those items:** the maintainer approved building from this report on 2026-09-24, with plans A (vendor fixes and MCP cap) and B (profiles) combined ("Both together").
- **Tier weights and budgets:** approved as a starting point ("those are a good start"), subject to calibration.
- **Excluded from implementation:** F19 and F20 get no scanner or rubric changes beyond what already exists. They wait for verification.

## 2. Scope

### Plan A: freshness fixes (single-score behavior)

1. **Remove the MCP cap and constraint.**
   - Remove the `tool_manifests_mcp` evidence cap (≤5 without a manifest) from `rubric.schema.json`.
   - Remove the `has_tool_access_governance` Mature band constraint.
   - Rewrite the category's `evaluate` text: N/A-neutral when there is no external-system need; capped only when the LLM finds an external need without governed access. (S1)
2. **Update `rubric.md` text** for F1–F18:
   - Claude Code reads AGENTS.md natively, and CLAUDE.md shadows it.
   - Prompt files and `.chatmode.md` are legacy.
   - `.claude/commands` is legacy-OK.
   - Codex: `.codex/skills`, `.codex/agents/*.toml`, `.codex/hooks.json`, `AGENTS.override.md`; `requirements.toml` is admin-managed; approval policy names.
   - Fill in the Gemini CLI row, and split the Copilot row into GitHub and VS Code.
   - Fix the verifier example: `readonly` is Cursor-only.
   - Add plugins, cloud-agent setup (`copilot-setup-steps.yml`, SessionStart and setup scripts, devcontainer), the MCP 2026-07-28 spec and its security guidance, the Agent Skills name/directory rule, and AGENTS.md stewardship.
   - Soften the evidence claims per E1–E3: persistent guidance should be concise and non-inferable, and skills, agents and MCP have only adoption evidence.
3. **Scanner additions.** New scan targets:
   - `AGENTS.override.md`, `.claude/CLAUDE.md`, `.cursorrules`
   - `.codex/agents`, `.codex/skills`, `.codex/hooks.json`
   - `.gemini/skills`, `.gemini/agents`, `.gemini/settings.json`
   - `.claude-plugin`, `.cursor-plugin`, `.claude/output-styles`
   - `.github/prompts`, `.devcontainer`, `.vscode/mcp.json`
   - `.github/workflows/copilot-setup-steps.yml` (already covered by the workflows directory)

   New evidence fields:
   - `claudeMdShadowsAgentsMd`: root AGENTS.md exists, a CLAUDE.md or `.claude/CLAUDE.md` exists, and neither contains an `@AGENTS.md` import.
   - `legacyPromptFiles`: `.github/prompts/*.prompt.md` and `*.chatmode.md`.
   - `committedClaudeLocalMd`
   - `pluginManifestFiles`
   - `cloudAgentSetupFiles`: `copilot-setup-steps.yml`, `.devcontainer/**`.

   These surface as evidence and risk flags. They do not add new caps.

### Plan B: score profiles

4. **Schema v2.0.**
   - Bump `rubric.schema.json` `version` from `1.0` to `2.0`.
   - Set the base category weights to the **Cloud** column: guidance 12, scoped rules 8, skills 10, specialized agents 6, tool/MCP 6, validation 15, CI 10, security 12, domain 8, governance 7, versioning 3, onboarding 3.
   - Category keys are unchanged, so there is no key rename or split.
   - Add an optional top-level `profiles` array:

   ```json
   "profiles": [
     { "key": "cloud", "label": "Cloud", "sizeRange": "> ~35B total or hosted", "weights": { "...": 0 }, "alwaysOnGuidanceTokenBudget": null, "bandConstraintChecks": ["has_reproducibility_evidence", "has_agent_asset_ci_checks", "has_sandbox_or_deny_controls", "has_agent_context_review_cadence"] },
     { "key": "local-medium", "label": "Local · medium", "sizeRange": "~15–35B total", "weights": { }, "alwaysOnGuidanceTokenBudget": 3000, "bandConstraintChecks": ["has_reproducibility_evidence"] },
     { "key": "local-small",  "label": "Local · small",  "sizeRange": "~5–14B total",  "weights": { }, "alwaysOnGuidanceTokenBudget": 1500, "bandConstraintChecks": ["has_reproducibility_evidence"] },
     { "key": "local-tiny",   "label": "Local · tiny",   "sizeRange": "≤ ~4B total",   "weights": { }, "alwaysOnGuidanceTokenBudget": 1000, "bandConstraintChecks": ["has_reproducibility_evidence"] }
   ]
   ```

   - Weights are exactly those in freshness report section 5.3.
   - `rubricSchema.ts` validates profiles:
     - Keys are unique.
     - `weights` has exactly the category keys.
     - Each weight is an integer ≥ 0; 0 means N/A for that profile.
     - Weights sum to `totalScore`.
     - The budget is a positive integer or null.
     - Checks are known consistency-check IDs.
     - The `cloud` profile weights must equal the base category weights, so the base score *is* the cloud score.
   - `profiles` stays optional, so the maintainability schema is unaffected.
5. **Always-on guidance measurement** (`scanner.ts`).
   - Record untruncated character length per scanned file (`fullLength`). `MAX_FILE_CHARS = 8000` truncation currently hides real size.
   - Compute `alwaysOnGuidanceByTool`:

   | Tool | Files counted |
   |---|---|
   | generic | root AGENTS.md (+ AGENTS.override.md) |
   | claude | CLAUDE.md and `.claude/CLAUDE.md`, or AGENTS.md when neither exists; plus `.claude/rules/*.md` without `paths:` frontmatter |
   | cursor | AGENTS.md + `.cursorrules` + `.cursor/rules/*` with `alwaysApply: true` |
   | copilot | `.github/copilot-instructions.md` + AGENTS.md + `.github/instructions/*` with `applyTo: "**"` |
   | windsurf | AGENTS.md, since the `.windsurf` behavior is unverified (F20) |

   - Each tool entry is `{ files, chars, estimatedTokens }`, using `estimatedTokens = ceil(chars / 4)`. The UI labels this as approximate.
   - `alwaysOnGuidanceTokens` is the entry for the configured `AI_TOOLING` setting.
   - `hasVolatileGuidancePrefix`: an always-on file contains an ISO date, or a "last updated" or "generated" marker. Risk flag only.
6. **Profile computation.** New module `src/lib/profileScores.ts`, a pure function run after caps and consistency checks.
   - **Base fraction:** `f_c = finalCategoryScore_c / baseWeight_c`, taken after caps.
   - **Budget factor (local profiles only):** applied to `persistent_guidance`.

   | Always-on tokens | Factor |
   |---|---|
   | ≤ budget | 1.0 |
   | budget to 2× budget | linear from 1.0 down to 0.5 |
   | > 2× budget | 0.5, plus a risk flag `always-on guidance ~N tokens exceeds <tier> budget B` |

   - **Profile score:** `round(Σ f_c × profileWeight_c)`, then `bandForScore`.
   - **Band constraints:** apply only the profile's `bandConstraintChecks`. Local profiles also get a Mature ceiling of Managed when the budget is exceeded.
   - **Output:** `ScoreResult.profileScores: Record<profileKey, { score, band, categories, budget?: { tokens, budget, factor, tool }, consistencyChecks, riskFlags }>`.
   - **Headline score:** `score`, `band` and `finalScore` stay equal to the cloud profile. The dashboard, DB `final_score` column and history therefore remain meaningful.
7. **Local tier setting.**
   - `LOCAL_MODEL_TIER` in `.env` (`tiny | small | medium`, default `medium`) via `appSettings.ts`.
   - A select on the settings page, with the size ranges and the note "larger models → use Cloud score".
   - It is global, not per-repo: repos are stored in SQLite and there is no per-repo settings UI today. Per-repo can come later if wanted.
   - Switching tier needs no rescoring, because all profiles are computed and stored at score time.
8. **UI.**
   - **Detail page:** a "Cloud" and "Local · <tier>" score card pair. Each card shows its band, category bars against that profile's weights (weight 0 shows "N/A for this tier"), the budget meter (tokens vs budget, approximate), and profile risk flags.
   - **Dashboard:** add a "Local (<tier>)" column next to the existing score.
   - **Old results:** a result without `profileScores`, or with a `rubricVersion` other than the current one, shows a "Scored with rubric vX — rescore to see Cloud/Local profiles" notice. Category bars use the result's own stored maxima where available, else a neutral display.

## 3. Category contract audit (keys unchanged, weights changed)

| File | Change |
|---|---|
| `src/lib/types.ts` | Update `CATEGORY_MAX` to the cloud weights. Add `ProfileScore` and `profileScores?` on `ScoreResult`. Add `localTier?` to history entries if needed. |
| `src/lib/responseSchemas.ts` | Derives from `CATEGORY_MAX` / rubric definition; verify maxima follow the new weights. |
| `src/lib/scorer.ts` | The legacy `buildRepairPrompt` hard-codes 0–15, 0–10 and so on; update to the new maxima. Call `computeProfileScores` after `applyConsistencyChecks` when the definition has profiles. |
| `src/lib/promptBuilder.ts` | Remove the "hasMcpManifest ≤5" line (`:45`). Update the legacy prompt's category maxima. The per-category prompt uses `evaluate` text from the schema. |
| `src/lib/scoreCaps.ts` | Remove the MCP rule from the `SCORE_CAP_RULES` fallback so it matches the schema. |
| `src/lib/consistencyChecks.ts` | Keep `has_tool_access_governance` registered (unused by v2.0) so old schemas and tests still validate. Export a helper to evaluate a named subset for profiles. |
| `src/lib/improvementPlanner.ts` | Uses `CATEGORY_MAX` / labels. Verify gap math uses the rubric definition's `categoryMax`. Plans remain based on the cloud/base categories; profile-aware plans are out of scope. |
| `src/lib/rubricSchema.ts` | Profiles validation. Add new evidence fields to `EVIDENCE_FIELDS`. |
| Tests | `rubricSchema.test.ts`, `scanner.test.ts`, `scoreCaps.test.ts`, `consistencyChecks.test.ts`, `promptBuilder.test.ts`, `scorer.test.ts`, `improvementPlanner.test.ts`, `server/appSettings.test.ts`, new `profileScores.test.ts`. Update hard-coded 15/10 maxima fixtures. |

## 4. SQLite compatibility policy

- **Policy: stale-by-version with read-time compatibility; no migration.**
- **Existing rows** in `scores.result_json`, `score_history.compact_json` and `score_history.full_json` are left untouched.
- **`rubricVersion` / `resultVersion`:** new results carry `rubricVersion: "2.0"` and `resultVersion: 3`, where v3 means `profileScores` may be present.
- **Read path:** a result with `rubricVersion !== current` is flagged `isStale` in the page loaders. The UI shows the rescore notice and does not reinterpret old category scores against new weights.
- **History:** entries across the version change are shown with their version label; no recomputation.
- **No table or column changes.** `final_score` / `final_band` continue to hold the headline (cloud) score.

## 5. Tests and verification

**New or updated unit tests:**

- **Schema:** profiles validation (bad sum, missing key, negative weight, unknown check, cloud ≠ base) and a v2.0 schema load.
- **Scanner:**
  - `fullLength` survives truncation.
  - `alwaysOnGuidanceByTool` for each tooling value.
  - `alwaysApply` / `applyTo` / `paths` frontmatter parsing.
  - `claudeMdShadowsAgentsMd`, both with and without the import.
  - Legacy prompt files, plugins and cloud setup detection.
- **Profile scores:**
  - The cloud profile equals the base score.
  - Budget factor boundaries at budget, 1.5× and 2× budget.
  - A weight-0 category is excluded.
  - Rounding.
  - Band constraint subset.
  - The Mature ceiling when over budget.
- **Caps:** the MCP cap no longer applies; other caps are unchanged.
- **Settings:** the `LOCAL_MODEL_TIER` default and normalization.
- **Scorer:** `profileScores` attached with a mocked `$lib/mlxClient` / `llmClient`. No live LLM calls, per CLAUDE.md.

**Commands:**

- `npm test -- --run`
- `npm run check`
- `npm run build`

**Manual check:**

- Run `npm run dev` and view the dashboard, a detail page with an old (stale) score, and a tier switch on settings.
- A live score needs a local LLM server. If none is available in this environment, that step is reported as not run.

## 6. Rollback

- **Code and rubric:** `git revert` the implementation commits. The rubric, schema and code change together in one reviewed set.
- **Database:** back up `repo-scorer.sqlite` (or `$REPO_SCORER_DB_PATH`) before the first v2.0 scoring run.
  - v2.0 rows are forward-compatible JSON: extra `profileScores` is ignored by v1 code.
  - Their category values use v2.0 maxima, so after a rollback, affected repos must be rescored or the DB backup restored.
- **Settings:** `LOCAL_MODEL_TIER` in `.env` is ignored by v1 code; no cleanup needed.

## 7. Rescoring

- Every configured repo needs rescoring after deployment to get v2.0 scores and profiles.
- Until then, old scores display with the stale notice.

## 8. Out of scope

- Per-repo tier override.
- Profile-aware improvement plans.
- Cursor and Windsurf/Devin scanner changes (F19, F20).
- Phase 6 calibration runs.
- Maintainability mode.

## 9. Implementation record (2026-09-24)

- **Approval:** the maintainer approved this plan by path in the conversation ("approved").
- **Implemented as planned**, with one addition: the dashboard category heatmap hides results scored under an older rubric version and says how many are hidden, because v1.0 values against v2.0 maxima displayed misleading percentages.

**Verification:**

- `npm test -- --run`: 173 passed, 2 failed.
  - The 2 failures predate this change and are date-dependent, not caused by it:
    - `scanner.test.ts` "treats supported runtime posture as supported…": `src/lib/reference/runtimeSupport.json` `lastUpdated` 2026-06-26 with `expiryDays` 60 has expired.
    - `scoreHistory.test.ts` "keeps the last five full snapshots": uses dated fixtures.
  - Both failed identically on the base commit before any edits.
- `npm run check`: 0 errors, 0 warnings.
- `npm run build`: succeeded.
- **Manual end-to-end:**
  - `npm run dev` ran against a temporary database and `.env`, with a deterministic fake OpenAI-compatible LLM server. No real LLM was available in the environment.
  - Scoring a demo repo produced rubric 2.0 results: Cloud 80, Local medium 80, Local small 79 (guidance credit ×0.94), Local tiny 73 (×0.67), with ~1,666 always-on tokens.
  - A seeded v1.0 result showed the stale notice and was excluded from profile and heatmap displays.
  - Switching the tier in Settings changed the dashboard column without rescoring.
