# Rubric Updates

Reports that gate changes to repo-scorer rubrics (`rubric.md`, `rubric.schema.json`, and `rubrics/*/`). Every report starts with a decision block (see `.agent/skills/*/references/report-contract.md`).

| Folder | Produced by | Purpose |
|---|---|---|
| `candidate-evaluations/` | `evaluate-candidate-rubric` | Assess a proposed rubric artifact before research |
| `freshness-research/` | `research-rubric-freshness` | Check rubric claims against current primary sources |
| `implementation-plans/` | `implement-rubric-update` | Plan the concrete rubric/schema/scorer edits |

Approval gates:

- Implementation requires at least one freshness research report.
- A candidate evaluation may inform implementation but is never the only basis.
- Only freshness research reports may carry `implementation-eligible` status.
- Reports marked `needs-human-decision` require a maintainer decision before implementation.
- The owner approves the report path(s) in conversation before planning.
- The owner approves the implementation plan path before any active rubric, schema, or code file is edited.

Report names follow `YYYY-MM-DD-HHMM-<type>-<slug>.md`.
