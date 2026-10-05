# Implementation Plan: Rubric Guidance in Scoring Prompts

## Decision

Status: implementation-eligible
Report type: implementation-plan
Inputs:
- rubric.md (v2.0), rubric.schema.json (v2.0), rubrics/maintainability/ (v0.2-draft)
- Owner approval in conversation, 2026-10-03, to proceed without a freshness report: no new external claims are introduced. The new Section 7 subsections restate guidance already in Sections 3.8-3.10, 5, and 6.
Required follow-up:
- Re-score a few known repos and compare against v2.0 results before relying on cross-version trends.

## Problem

Since the per-category scorer was introduced (d37c68e), category prompts contain only the one-line `evaluate` text, the band table, and caps. None of `rubric.md` reaches the model:

- Section 3 component guidance, the 0-5 scoring anchors, and the Section 7 pass/risk signals are never seen.
- Edits to `rubric.md` prose cannot change scores.
- `scannerSection` matched a Section 7 heading for only 6 of 12 categories and was used only for file relevance ranking.
- The improvement planner did the opposite and always sent the whole 66 KB rubric, regardless of model size.

## Settled Choices

| Item | Choice |
|---|---|
| Default | Send everything. Cloud and large-context models get the complete rubric in every category prompt. |
| Scaling | Step down only when the scoring model's context window cannot fit the prompt, or when the server rejects a prompt as too long. |
| Levels | `full` (whole rubric) → `category` (scoring anchors + shared sections + all of the category's sections) → `compact` (scoring anchors + the category's first section) → `minimal` (schema `evaluate` text only, the pre-2.1 behavior). |
| Source of guidance | Prose stays in the rubric markdown. Schemas reference headings via `guidance.scoringSection`, `guidance.sharedSections`, and per-category `guidanceSections`. |
| Validation | Every referenced heading must exist exactly once outside code fences. Rubric loading fails otherwise, and a test loads both shipped rubrics. |
| Context window | `LLM_CONTEXT_TOKENS` setting → `/v1/models` metadata (`context_length`, `max_model_len`, `max_context_length`, `context_window`, `meta.n_ctx`) → known catalog floor (128k) → unknown. Unknown is treated as large (send everything), with the overflow fallback as the safety net. |
| Budget | Input budget = context − max output tokens − max(512, 5%). Tokens estimated at 3.5 characters each. Rubric guidance steps down before evidence shrinks. Evidence shrinks (floor 4,000 chars) only when even `minimal` does not fit. |
| Recording | Scores record `promptContext` (context tokens, source, level per category). Plans record their level. The detail page shows it. |
| Versions | AI Readiness 2.0 → 2.1, Maintainability 0.2-draft → 0.3-draft. Prompt content changes, so cross-version trends are not like-for-like. |

## Files

1. `rubric.md`: add Section 7 subsections for Validation and reproducibility, CI and PR automation, Domain and decision context, Governance and observability, Versioning and dependency provenance, Onboarding and discoverability. Add a mapping note under the 0-5 table. Bump version.
2. `rubric.schema.json`, `rubrics/maintainability/rubric.schema.json`: add `guidance` and per-category `guidanceSections`. Bump versions.
3. `rubrics/maintainability/rubric.md`: version bump only.
4. `src/lib/rubricGuidance.ts` (new): heading parser (skips fenced code), section extraction, `resolveRubricGuidance`, `buildGuidanceText(level, categoryKeys)`.
5. `src/lib/rubricSchema.ts`: parse and validate the new fields.
6. `src/lib/evaluationModes.ts`: return resolved guidance with the rubric. Fail loudly on unresolved headings.
7. `src/lib/promptBudget.ts` (new): token estimate, level selection, context-error detection.
8. `src/lib/server/modelContext.ts` (new): context-window resolution and caching.
9. `src/lib/promptBuilder.ts`, `src/lib/scorer.ts`, `src/lib/improvementPlanner.ts`: level-aware prompts, budget selection, one-step-down retry on context-length errors.
10. Settings (`appSettings.ts`, settings route/page): optional context-window field.
11. `src/routes/repo/[name]/+page.svelte`: show prompt context.
12. Tests for each of the above.

## SQLite Compatibility

Stale-by-version, as before. Old rows keep `rubricVersion: 2.0` and have no `promptContext`. No migration.
