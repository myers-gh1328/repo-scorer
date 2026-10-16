---
name: evaluate-candidate-rubric
description: Evaluate an explicit candidate rubric file or folder against repo-scorer without applying it. Use when a user provides a new or modified rubric artifact and wants a durable comparison report before any implementation.
---

# Evaluate Candidate Rubric

## Workflow

1. Require an explicit candidate path. Refuse to evaluate if the candidate was already copied over `rubric.schema.json` or `rubric.md`; ask for the original candidate artifact or inspect the baseline non-mutatingly with `git show HEAD:rubric.schema.json` and `git show HEAD:rubric.md`. Never restore, checkout, or overwrite active files during evaluation.
2. Read `references/report-contract.md`.
3. Inspect current `rubric.schema.json`, `rubric.md`, `src/lib/rubricSchema.ts`, and relevant tests.
4. Inspect the candidate file/folder and classify it as schema-only, markdown-only, schema plus markdown, or source narrative requiring schema extraction.
5. Compare current versus candidate:
   - version
   - category keys, labels, weights, total score
   - health bands
   - caps and evidence fields
   - band constraints and consistency checks
   - scanner or prompt implications
6. Classify the change as patch, minor, major, or migration-required.
7. Write a report under `docs/rubric-updates/candidate-evaluations/`.
8. Do not edit active rubric files.

## Report Requirements

The report must include:

- Candidate path and current rubric paths.
- Change classification with rationale.
- A human-readable diff summary.
- Compatibility impact for stored scores and score history.
- Potential implementation considerations, each prefixed with `blocked pending freshness research:`.
- Open questions or ambiguity.
- A top-level decision block using the template from `references/report-contract.md`.

## Hard Rules

- Never mutate `rubric.schema.json`, `rubric.md`, tests, or stored data.
- Never recommend implementation from only this report; mark all implementation considerations as blocked pending freshness research.
- If category keys are renamed, split, removed, or weight totals change, mark the change `migration-required`.
- If markdown and schema disagree, report the disagreement instead of choosing one silently.
