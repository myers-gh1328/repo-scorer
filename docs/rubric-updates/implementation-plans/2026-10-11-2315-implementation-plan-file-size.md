# Implementation Plan: Large-File Evidence

## Decision

Status: needs-human-decision
Report type: implementation-plan
Inputs:
- docs/rubric-updates/freshness-research/2026-10-11-2256-freshness-research-file-size.md (approved by owner 2026-10-11)
Required follow-up:
- Owner approves this plan path before any active file is edited.

## Settled Choices

| Item | Choice |
|---|---|
| Rubric | Maintainability `code_organization` only. AI Readiness untouched. |
| Dependency | None. Lines are counted in-process. |
| Thresholds (F4) | Physical lines, the ESLint and Pylint default. Bands: over 500 lines and over 1000 lines. Top 10 largest files. |
| File list (F5) | `git ls-files --cached --others --exclude-standard` through `execFile`, so `.gitignore` is honored. If git fails, walk the tree and skip `.git`, `node_modules`, `target`, `dist`, `build`, `.venv`, `.svelte-kit` and `coverage`. Cap at 20,000 files. |
| Code files (F5) | Allowlist of code extensions: ts, tsx, js, jsx, mjs, cjs, svelte, vue, py, rs, go, java, kt, kts, swift, rb, php, cs, c, h, cc, cpp, hpp, scala, ex, exs, dart, lua, sh, bash, sql, css, scss, sass, less, html. |
| Generated files (F5) | Skip `*.min.*`, `*.d.ts`, `*.generated.*` and files over 1 MB. Also skip files whose first 500 characters contain `@generated` or `DO NOT EDIT`. |
| Tests (F6) | Counted, but tagged `test` in the top-10 list. They use the scanner's existing test-path rule. |
| Failure | Any error → `fileSizeStatus: 'unavailable'` (neutral). The scan never fails. |

## Files

1. `src/lib/fileSize.ts` (new): `detectFileSizes(repoPath)` returns `{ status, codeFileCount, codeLineCount, filesOver500Lines, filesOver1000Lines, largestFiles }`. `largestFiles` holds strings like `src/lib/improvementPlanner.ts (869 lines)` and `src/a.test.ts (668 lines, test)`.
2. `src/lib/scanner.ts`: `ScanOptions.fileSize?: boolean`. When it's true, add the optional `fileSize*` fields to `EvidenceInventory`. Export `isTestPath` so `fileSize.ts` can reuse it.
3. `src/lib/scorer.ts`: pass `fileSize: evaluationMode === 'maintainability'`, next to `duplication`.
4. `src/routes/api/score/+server.ts`: set `scannerEvidenceVersion` to `2026-10-11.1`.
5. `rubrics/maintainability/rubric.schema.json`: version `0.3-draft` → `0.4-draft`. The `evaluate` text already says "large files", so it doesn't change.
6. `rubrics/maintainability/rubric.md`: add a bullet under Code Organization. It explains the evidence fields and the 500/1000 bands, tells the model to cite specific files and to weigh tests, fixtures and generated code below production modules, and says `unavailable` is neutral.
7. Tests:
   - `src/lib/fileSize.test.ts`: uses a temp-dir fixture with no git, so it covers the walk fallback. Checks counts, bands, ordering, test tagging, and the generated, minified and non-code skips.
   - `scanner.test.ts`: flag off → no fields. Flag on → fields present.
   - `scorer.test.ts`: maintainability passes the flag and AI Readiness doesn't.

## Category Contract Audit

No key, weight, band or cap changes. `types.ts`, `responseSchemas.ts`, `improvementPlanner.ts`, `scoreCaps.ts` and `consistencyChecks.ts` need no edits.

## SQLite Compatibility

Stale-by-version. New scores carry `rubricVersion: 0.4-draft`. Old rows (`scores.result_json`, `score_history.compact_json` and `full_json`) are not touched. No migration.

## Verification

1. `npx vitest run src/lib/fileSize.test.ts src/lib/scanner.test.ts src/lib/scorer.test.ts src/lib/rubricSchema.test.ts`
2. `npm test -- --run`, `npm run check` and `npm run build`
3. One manual `detectFileSizes` run on this repo. Expect about 7 files over 500 lines and 0 over 1000.

## Rollback

Revert the PR. No database changes are needed. Scores written under `0.4-draft` stay readable. Rescore Maintainability repos to drop the evidence.

## Rescoring

Configured repos need a Maintainability rescore to get file-size evidence. AI Readiness is unaffected.
