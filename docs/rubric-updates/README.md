# Rubric Updates

Durable reports for changing repo-scorer rubrics. Every report starts with a
decision block (see `.agent/skills/*/references/report-contract.md`).

- `candidate-evaluations/` — output of `evaluate-candidate-rubric`. Never sufficient on its own.
- `freshness-research/` — output of `research-rubric-freshness`. Required before any rubric change.
- `implementation-plans/` — output of `implement-rubric-update`.

Approval gates:

1. A freshness report must exist with `Status: implementation-eligible`, or the
   owner must explicitly approve its named open findings.
2. The owner approves the report path(s) in conversation before planning.
3. The owner approves the implementation plan path before any active rubric,
   schema, or code file is edited.
