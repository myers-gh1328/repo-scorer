# Rubric Update Report Contract

# Report Contract

All rubric update reports live under `docs/rubric-updates/`.

Use these subfolders:

- `candidate-evaluations/`
- `freshness-research/`
- `implementation-plans/`

Name reports as:

`YYYY-MM-DD-HHMM-<type>-<slug>.md`

Implementation requires:

1. At least one report from `docs/rubric-updates/freshness-research/`.
2. Each freshness report must have `Status: implementation-eligible`, unless the user explicitly approves proceeding despite named findings.
3. Explicit user approval in the current conversation to use the named report set.
4. A newly written implementation plan in `docs/rubric-updates/implementation-plans/`.
5. Explicit user approval in the current conversation after the implementation plan is written.

Reject implementation if only candidate evaluation reports are provided.

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

If `docs/rubric-updates/README.md` does not exist, the first report should
create it with a short explanation of the three report folders and approval
gates.
