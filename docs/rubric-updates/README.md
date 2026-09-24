# Rubric Updates

Reports that gate changes to `rubric.md` and `rubric.schema.json`.

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

Report names follow `YYYY-MM-DD-HHMM-<type>-<slug>.md`.
