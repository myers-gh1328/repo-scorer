# Rubric Update Report Contract

# Report Contract

All rubric update reports live under `docs/rubric-updates/`.

Use these subfolders:

- `candidate-evaluations/` for `evaluate-candidate-rubric`
- `freshness-research/` for `research-rubric-freshness`
- `implementation-plans/` for `implement-rubric-update`

Name reports as:

`YYYY-MM-DD-HHMM-<type>-<slug>.md`

Examples:

- `2026-06-26-1430-candidate-agentic-rubric-v1-1.md`
- `2026-06-26-1505-freshness-mcp-skills-hooks.md`
- `2026-06-26-1530-implementation-agentic-rubric-v1-1.md`

Implementation requires at least one freshness research report. A candidate
evaluation report may inform implementation, but must never be the only basis.

Each implementation plan must list report paths used at the top.

Every report must start with this decision block:

```md
## Decision

Status: <ready-for-freshness | blocked | implementation-eligible | needs-human-decision>
Report type: <candidate-evaluation | freshness-research | implementation-plan>
Inputs:
- <path or URL>
Required follow-up:
- <next required action>
```

Candidate evaluation reports must not use `implementation-eligible`; only
freshness research may make a report set eligible for implementation.

If `docs/rubric-updates/README.md` does not exist, the first report should
create it with a short explanation of the three report folders and approval
gates.
