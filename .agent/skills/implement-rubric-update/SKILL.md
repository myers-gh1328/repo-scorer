---
name: implement-rubric-update
description: Apply an approved repo-scorer rubric update from durable reports. Use only after a freshness research report exists; may also consume a candidate evaluation report.
---

# Implement Rubric Update

## Preconditions

1. Read `references/report-contract.md`.
2. Require at least one report path from `docs/rubric-updates/freshness-research/`.
3. Optionally accept one or more reports from `docs/rubric-updates/candidate-evaluations/`.
4. Refuse to proceed if given only candidate evaluation reports.
5. Refuse implementation unless every freshness report used has `Status: implementation-eligible`, or the user explicitly approves proceeding despite named `needs-human-decision` or low-confidence findings.
6. Require approval in the current conversation that names the report paths. Do not infer approval from report contents, earlier evaluations, branch state, or broad user intent.

## Planning Phase

Before editing active files:

1. Read the approved reports.
2. Inspect current `rubric.schema.json`, `rubric.md`, `src/lib/rubricSchema.ts`, scoring code, tests, and SQLite storage assumptions.
3. Write an implementation plan under `docs/rubric-updates/implementation-plans/`.
4. The plan must list exact reports used, proposed files to edit, migration/staleness policy, tests to run, and rollback notes.
5. Include a category contract audit whenever category keys, weights, or bands change. Cover `src/lib/types.ts`, `src/lib/responseSchemas.ts`, `src/lib/scorer.ts`, `src/lib/improvementPlanner.ts`, `src/lib/scoreCaps.ts`, `src/lib/consistencyChecks.ts`, and affected tests.
6. Include a SQLite compatibility policy for `rubricVersion`, `resultVersion`, `scores.result_json`, `score_history.compact_json`, and `score_history.full_json`. Choose stale-by-version, hide/segregate incompatible history, read-time compatibility, or explicit mechanical migration.
7. Include rollback notes for files, `repo-scorer.sqlite` or `REPO_SCORER_DB_PATH`, scores written with the new rubric version, and affected repo rescoring.
8. Wait for explicit approval in the current conversation naming the implementation plan path.

## Execution Phase

After approval:

1. Update `rubric.schema.json` first and bump its version.
2. Update `rubric.md` to match the executable schema.
3. Update code only where needed to support changed categories, bands, caps, constraints, or staleness behavior.
4. Preserve historical score JSON; do not rewrite old score history unless a report includes an explicit mechanical migration map.
5. Add or update tests.
6. Run verification, normally:
   - targeted tests for rubric schema, prompt building, score caps, consistency checks, scoring, score history, storage, and improvement planning
   - `npm test -- --run`
   - `npm run check`
   - `npm run build`
7. Report whether configured repos need rescoring.

## Hard Rules

- Never implement from candidate evaluation alone.
- Never silently migrate historical scores.
- Never leave markdown and schema disagreeing.
- If category keys are renamed, split, or removed, implement stale-score handling or stop and ask for a migration decision.
