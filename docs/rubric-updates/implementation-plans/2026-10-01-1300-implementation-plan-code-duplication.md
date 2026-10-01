# Implementation Plan: Code Duplication Evidence (jscpd)

## Decision

Status: needs-human-decision
Report type: implementation-plan
Inputs:
- docs/rubric-updates/freshness-research/2026-10-01-1200-freshness-research-code-duplication.md (approved by owner 2026-10-01)
Required follow-up:
- Owner approves this plan path before any active file is edited.

## Settled Choices

| Item | Choice |
|---|---|
| Rubric | Maintainability `code_organization` only. AI Readiness untouched. |
| Dependency | `jscpd` pinned to exact `5.4.0` in `devDependencies` (owner choice). The plan notes that a `--omit=dev` install makes duplication "unavailable" (neutral). |
| Formats | Code only. Ignore `**/*.{md,json,yml,yaml,lock,txt,toml}`. Probe on this repo: 5.15%, 44 clones, all TypeScript. |
| Excludes | `**/node_modules/**`, `**/target/**`, `**/dist/**`, `**/.venv/**`, `**/.svelte-kit/**`. `.gitignore` is respected by default. |
| Thresholds | `-k 50 -l 5`, set explicitly. Same result as the 5.4.0 defaults on this repo (77 clones either way). |
| Failure | Spawn error, nonzero exit, timeout (60s), or missing report → `duplicationStatus: 'unavailable'`. The scan never fails. |

## Files

1. `package.json`, `package-lock.json`: add `jscpd@5.4.0` (devDependency).
2. `src/lib/duplication.ts` (new): `detectDuplication(repoPath)` runs the local `jscpd` bin with `execFile` into a `mkdtemp` dir, parses `jscpd-report.json`, strips the `:<format>` suffix, and returns `{ status, percentage, cloneCount, duplicatedLines, topPairs }`. Top pairs: 10, sorted by lines, formatted as `a.ts:10-30 <-> b.ts:5-25 (21 lines)`. No code fragments go to the LLM. Deletes the temp dir.
3. `src/lib/scanner.ts`: `scanRepo(repoPath, runtimeSupport?, options?: { duplication?: boolean })`. When true, adds `duplicationStatus`, `duplicationPercentage`, `duplicationCloneCount`, `duplicationTopPairs` to `EvidenceInventory` (all optional).
4. `src/lib/scorer.ts`: pass `{ duplication: evaluationMode === 'maintainability' }`.
5. `src/routes/api/score/+server.ts`: bump `scannerEvidenceVersion` to `2026-10-01.1`.
6. `rubrics/maintainability/rubric.schema.json`: version `0.1-draft` → `0.2-draft`. `code_organization.evaluate` gains "copy-paste duplication".
7. `rubrics/maintainability/rubric.md`: matching table row, plus a "Code duplication" bullet under Code Organization explaining the % and pairs, and that `unavailable` is neutral.
8. Tests: `src/lib/duplication.test.ts` (parses a fixture report, failure → unavailable, mocked `execFile`). `scanner.test.ts`: flag off → no duplication fields; flag on with `vi.mock('./duplication')`. `scorer.test.ts`: maintainability passes the flag, ai-readiness does not. Tests never spawn jscpd.

## Category Contract Audit

No key, weight, band, or cap changes. `types.ts`, `responseSchemas.ts`, `improvementPlanner.ts`, `scoreCaps.ts`, and `consistencyChecks.ts` need no edits. Confirmed by the test suite.

## SQLite Compatibility

Stale-by-version. New scores carry `rubricVersion: 0.2-draft`. Old rows (`scores.result_json`, `score_history.compact_json`/`full_json`) are not touched and keep `0.1-draft`. No migration.

## Verification

`npx vitest run src/lib/duplication.test.ts src/lib/scanner.test.ts src/lib/scorer.test.ts src/lib/rubricSchema.test.ts`, then `npm test -- --run`, `npm run check`, `npm run build`. Plus one manual `detectDuplication` run on this repo.

## Rollback

Revert the PR. No DB changes are needed. Scores written with `0.2-draft` stay readable. Rescore Maintainability repos if they should drop the duplication evidence.

## Rescoring

Configured repos need a Maintainability rescore to get duplication evidence. AI Readiness scores are unaffected.
