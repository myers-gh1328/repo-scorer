---
name: research-rubric-freshness
description: Research whether repo-scorer's current rubric or a candidate rubric is outdated against current official sources. Use before implementing any rubric update and when checking tool/vendor best-practice claims.
---

# Research Rubric Freshness

## Workflow

1. Read `references/report-contract.md` and `references/source-policy.md`.
2. Identify the research target:
   - current `rubric.schema.json` and `rubric.md`
   - a candidate rubric report from `docs/rubric-updates/candidate-evaluations/`
   - a focused area such as MCP, skills, agents, hooks, Codex, Cursor, Claude, Copilot, or validation.
3. Apply routing: if the user provides a candidate rubric artifact rather than a candidate evaluation report, stop and run `evaluate-candidate-rubric` first.
4. Search official/current sources for time-sensitive claims. Browse the internet when checking freshness, deprecation, or vendor-specific behavior.
5. Compare source evidence against rubric claims and proposed changes.
6. Classify each finding:
   - confirmed-current
   - likely-outdated
   - missing-from-rubric
   - needs-human-decision
   - no-action
7. Write a report under `docs/rubric-updates/freshness-research/`.
8. Do not edit active rubric files.

## Evidence Standards

- Prefer official docs, standards, release notes, or primary vendor sources.
- Include checked dates and links.
- For each currentness or deprecation finding, identify the exact rubric claim checked and cite at least one primary source.
- For vendor-specific claims, use that vendor's official docs or release notes unless unavailable; if unavailable, record searched-but-not-found sources.
- Do not claim something is current, latest, deprecated, or recommended without a source.
- If sources conflict, report the conflict and avoid choosing silently.
- Treat repo-local facts, such as package scripts and file paths, as local truth only; do not infer vendor freshness from them.

## Report Requirements

The report must include:

- Research scope and date.
- Sources checked with URLs and checked dates.
- Findings mapped to current rubric sections or candidate proposal items.
- Recommended rubric changes, if any.
- Risk level and confidence per finding.
- Whether implementation can proceed, needs another candidate evaluation, or needs human product judgment.
- A top-level decision block using the template from `references/report-contract.md`.

## Hard Rules

- Never edit `rubric.schema.json` or `rubric.md`.
- Never use non-primary sources for final current/deprecated conclusions unless no primary source exists and the limitation is explicit.
- This report is required before `implement-rubric-update` may apply any rubric update.
