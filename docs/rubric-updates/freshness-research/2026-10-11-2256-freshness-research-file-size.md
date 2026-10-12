# Freshness Research: Large-File Evidence

## Decision

Status: implementation-eligible
Report type: freshness-research
Inputs:
- rubrics/maintainability/rubric.schema.json (version 0.3-draft)
- rubrics/maintainability/rubric.md
- src/lib/scanner.ts, src/lib/duplication.ts
- https://eslint.org/docs/latest/rules/max-lines
- https://raw.githubusercontent.com/pylint-dev/pylint/main/pylint/checkers/format.py
Required follow-up:
- Owner approves this report path, then an implementation plan is written under `docs/rubric-updates/implementation-plans/`.
- The plan must settle the thresholds (F4), which files count as code (F5), and how test files are handled (F6).

## Scope

- Date: 2026-10-11
- Target: the **Maintainability** rubric (beta), category `code_organization`. AI Readiness is out of scope.
- Request (owner, 2026-10-11): add evidence for "file size getting out of control in repos".
- No new dependency is needed. Line counting is done in-process.

## Sources Checked

| Source | Type | Checked | Used for |
|---|---|---|---|
| https://eslint.org/docs/latest/rules/max-lines | Primary (vendor docs) | 2026-10-11 | Default limit, counting options, rationale |
| https://raw.githubusercontent.com/pylint-dev/pylint/main/pylint/checkers/format.py | Primary (vendor source) | 2026-10-11 | Default `max-module-lines` |
| SonarQube rule S104 "Files should not have too many lines of code" (web search summary) | Secondary | 2026-10-11 | Corroborates a 1000-line default |
| `wc -l` over the code files in this repo | Primary (local probe) | 2026-10-11 | Calibrating thresholds on a real repo |

Searched but not found: the primary S104 page. `rules.sonarsource.com` did not resolve from this host, and the `SonarSource/rspec` raw paths returned 404. The 1000-line Sonar default rests on a search summary only and is used as corroboration, not as the basis for any threshold.

## Rubric Claim Checked

`code_organization.evaluate` says "...large files, tangled dependencies, and copy-paste duplication are limited", and rubric.md line 131 says "Large files, circular dependencies, and scattered cross-cutting concerns are limited." Duplication has scanner evidence (jscpd). Large files have none.

## Findings

| ID | Finding | Classification | Risk | Confidence |
|---|---|---|---|---|
| F1 | The rubric asks the model to judge large files, but the scanner gives it no file sizes. Every file the scanner collects is cut to 8,000 characters (`MAX_FILE_CHARS`, `scanner.ts:7`), so the model cannot see that a file is large. Source files are mostly not collected at all. | missing-from-rubric | Medium | High |
| F2 | ESLint `max-lines` defaults to 300 lines and counts physical lines (`skipBlankLines` and `skipComments` are opt-in). Its docs say there is no objective maximum, that most people agree it "should not be in the thousands", and that "recommendations usually range from 100 to 500 lines". | confirmed-current | Low | High |
| F3 | Pylint `max-module-lines` defaults to 1000 ("Maximum number of lines in a module"). SonarQube S104 reportedly also defaults to 1000 (secondary source). | confirmed-current | Low | High (Sonar: Medium) |
| F4 | Thresholds: the sources support two bands. 500 lines is the top of ESLint's recommended range. 1000 lines is the Pylint (and reportedly Sonar) default. ESLint's 300 is too strict as a scoring signal and would flag most real projects. Recommendation: report files over 500 and over 1000 lines, plus the top 10 largest. Count physical lines, the same way both linters do by default. | needs-human-decision | Low | Medium |
| F5 | Which files count: reuse the duplication check's excludes (`node_modules`, `target`, `dist`, `.venv`, `.svelte-kit`, and md, json, yml, yaml, lock, txt and toml files). Also skip minified or generated files (`*.min.*`, `*.map`) and binaries. An allowlist of code extensions is safer than a denylist, because a denylist lets binaries and data files through. | needs-human-decision | Medium | High |
| F6 | Test files: in this repo the third-largest code file is a test (`improvementPlanner.test.ts`, 668 lines). Large test files matter less than large production modules. Recommendation: count them, but tag them as tests so the model can weigh them separately. | needs-human-decision | Low | Medium |
| F7 | Local probe: this repo has 57 code files and 10,900 lines. 7 files are over 500 lines, none over 1000, and the largest is `src/lib/improvementPlanner.ts` (869). That spread fits a 500/1000 split: it flags real candidates without flagging the whole repo. | confirmed-current | Low | Medium |
| F8 | Isolation: run this only for maintainability scans, using the same gate as duplication (`ScanOptions`). AI Readiness scans and scores stay unchanged. | no-action (constraint) | Medium | High |

## Recommended Rubric Changes

1. Keep the `code_organization` key, weight, and bands. Its text already names large files, so it needs no change.
2. Add a large-files bullet to the rubric.md Code Organization guidance. It should explain the evidence fields and the 500/1000 bands, tell the model to cite specific files, and tell it to weigh tests, generated code, and fixtures differently from production modules.
3. Add file-size evidence to the scanner for maintainability mode only: number of code files, total lines, count over 500, count over 1000, and the top 10 files as `path (N lines)` with test files tagged.
4. Bump the maintainability schema version (`0.3-draft` → `0.4-draft`) and `scannerEvidenceVersion`, so earlier maintainability scores show as stale.
5. Tests use a temp dir fixture. No real repo is walked.

## Can Implementation Proceed?

Yes, after the owner approves this report path. F4 to F6 are configuration choices to settle in the implementation plan. They do not block on evidence.
