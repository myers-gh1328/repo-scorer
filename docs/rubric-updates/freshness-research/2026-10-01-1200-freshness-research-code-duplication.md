# Freshness Research: Code Duplication Evidence (jscpd)

## Decision

Status: implementation-eligible
Report type: freshness-research
Inputs:
- rubrics/maintainability/rubric.schema.json (version 0.1-draft)
- rubrics/maintainability/rubric.md
- src/lib/scanner.ts, src/lib/scorer.ts, src/routes/api/score/+server.ts
- https://github.com/kucherenko/jscpd
- https://raw.githubusercontent.com/kucherenko/jscpd/master/README.md
- https://www.npmjs.com/package/jscpd (via `npm view jscpd`)
Required follow-up:
- Owner approves this report path, then an implementation plan is written under `docs/rubric-updates/implementation-plans/`.
- The plan must settle: which file formats jscpd scans (F5), `dependencies` vs `devDependencies` (F6), and the clone-size thresholds (F4).

## Scope

- Date: 2026-10-01
- Target: the **Maintainability** rubric (beta), category `code_organization`. The owner chose this in conversation on 2026-10-01 instead of the AI Readiness rubric. AI Readiness (`rubric.schema.json` v1.0) is out of scope.
- Request: score code duplication as the duplicated-code percentage plus the top clone pairs, found by a clone detector (jscpd). Default excludes: `node_modules`, `target`, `dist`, `.venv`, `.svelte-kit`.
- Owner decision (2026-10-01): add jscpd as a pinned npm devDependency.

## Sources Checked

| Source | Type | Checked | Used for |
|---|---|---|---|
| `npm view jscpd` (registry.npmjs.org) | Primary (registry) | 2026-10-01 | Version, publish date, license, engines, how the binary is distributed |
| https://github.com/kucherenko/jscpd | Primary (vendor repo) | 2026-10-01 | v5 architecture, reporters, missing Node API |
| https://raw.githubusercontent.com/kucherenko/jscpd/master/README.md | Primary (vendor docs) | 2026-10-01 | Features, clone types, distribution channels |
| `jscpd --help` (5.4.0, installed locally in a scratch dir) | Primary (tool) | 2026-10-01 | Exact flags and defaults |
| Probe run of jscpd 5.4.0 on this repo with the JSON reporter | Primary (tool output) | 2026-10-01 | JSON report shape, exit code, runtime |

Searched but not found: v5 docs for a Node.js programmatic API. The README says the v4 TypeScript engine, which had the Node API, now lives on the `master-v4` branch.

## Rubric Claim Checked

`code_organization.evaluate`: "...file layout is predictable; large files and tangled dependencies are limited". The rubric.md guidance says "Shared behavior is centralized without excessive abstraction." Today this is judged by the LLM alone. The scanner collects no duplication evidence.

## Findings

| ID | Finding | Classification | Risk | Confidence |
|---|---|---|---|---|
| F1 | The rubric has no deterministic code-duplication evidence. "Shared behavior is centralized" is the closest claim. The only duplication checks in the repo are about agent guidance (AI Readiness `rubric.md` lines 297, 523, 1038). | missing-from-rubric | Low | High |
| F2 | jscpd is current and maintained: 5.4.0 was published 2026-09-30, with 8 releases in September 2026. MIT license, `engines.node >=18`. | confirmed-current | Low | High |
| F3 | jscpd v5 is a Rust binary. npm installs it through per-platform `optionalDependencies` (`jscpd-darwin-arm64`, `jscpd-linux-x64-gnu`, ...) with a `run-jscpd.js` bin shim. There is **no Node API** in v5, so the integration must spawn the bin with `execFile`. On an unsupported platform, or if an optional dependency is missing, the scanner must record "duplication check unavailable" and not fail the scan. | confirmed-current | Medium | High |
| F4 | CLI contract (5.4.0): `-r json -o <dir>` writes `<dir>/jscpd-report.json`. `-i` takes comma-separated globs. `.gitignore` is respected by default (`--no-gitignore` turns it off). `--max-size` defaults to 1mb. Exit code is 0 even when duplicates are found, unless `--threshold` or `--exit-code` is passed, so pass neither. `-s` suppresses tips. Defaults for `--min-tokens` and `--min-lines` are not printed in `--help`, so the plan must set them explicitly. | confirmed-current | Low | High (defaults: Low) |
| F5 | JSON shape: `statistics.total.{percentage, percentageTokens, clones, duplicatedLines, lines, sources, tokens}` and `duplicates[].{format, kind, lines, tokens, fragment, firstFile, secondFile}`, where each file has `{name, start, end}`. `name` has a `:<format>` suffix (for example `foo.md:markdown`) that must be stripped. **Markdown and other non-code formats are scanned by default.** In the probe run the top clone was two copies of `report-contract.md`. | confirmed-current | Medium | High |
| F6 | `better-sqlite3` is in `dependencies` because the server needs it at request time. The scanner also runs at request time, so `jscpd` arguably belongs in `dependencies`. The owner chose `devDependencies`. That works for `npm run dev`, but not for a production install with `--omit=dev`. | needs-human-decision | Low | High |
| F7 | Speed: on this repo (90 sources, 18.8k lines) the run took about 0.2 s wall time and found 77 clones at 4.8% duplicated lines. A per-scan subprocess is cheap. Large repos still need a timeout and an output-size cap. | confirmed-current | Low | Medium |
| F8 | Isolation: maintainability-only evidence is already gated, because the score route passes `runtimeSupport` only for modes with `referenceDataPath`. jscpd must also run only for maintainability scans, so AI Readiness scans and scores stay unchanged. | no-action (constraint) | Medium | High |
| F9 | v5 also has `--dead-code`, `--complexity`, and `--health`. These could later back other `code_organization` signals. Out of scope here. | no-action | Low | Medium |

## Recommended Rubric Changes

1. Keep the `code_organization` key, weight, and bands. Add duplication to its `evaluate` text, for example: "...large files, tangled dependencies, and copy-paste duplication are limited".
2. Add a "Code duplication" bullet to the rubric.md Code Organization guidance. It should explain how to read the jscpd percentage and the top clone pairs, and say that "unavailable" is neutral evidence, not a penalty.
3. Add duplication evidence to the scanner: percentage, clone count, and the top N clone pairs (paths and line ranges, no code fragments sent to the LLM unless bounded), for maintainability mode only.
4. Bump the maintainability schema version (`0.1-draft` → `0.2-draft`). Recommended policy: earlier maintainability scores become stale by version, since the mode is beta. No new category and no score cap, so the category contract audit is minimal.
5. Tests must never spawn jscpd. Inject a runner into the scanner and mock it, the same way `$lib/mlxClient` is mocked.

## Can Implementation Proceed?

Yes, after the owner approves this report path. The open items (F4 thresholds, F5 formats, F6 dependency section) are configuration choices to settle in the implementation plan. They do not block on evidence.
