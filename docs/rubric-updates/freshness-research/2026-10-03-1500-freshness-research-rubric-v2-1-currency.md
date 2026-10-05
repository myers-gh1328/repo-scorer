# Freshness Research: Rubric v2.1 and Maintainability v0.3-draft Currency

## Decision

Status: needs-human-decision
Report type: freshness-research
Inputs:
- rubric.md (v2.1, 2026-10-03), rubric.schema.json (v2.1)
- rubrics/maintainability/rubric.md (v0.3-draft), src/lib/reference/runtimeSupport.json (2026-06-26.1)
- docs/rubric-updates/freshness-research/2026-09-24-1602-freshness-research-cloud-vs-local-scoring.md (prior report; this one re-checks it and resolves its F19/F20)
Required follow-up:
- Maintainer sign-off on the "ready" items in section 8, then `implement-rubric-update` for them.
- Maintainer decisions on D1-D6 (section 8).
- Refresh `runtimeSupport.json` now: it is expired, so every maintainability score currently reports runtime support as unknown (section 6).
- Human check of the items in section 9 that could only be supported by search snippets.

## 1. Scope and method

- **Date:** 2026-10-03, nine days after the previous freshness report. Rubric v2.0 applied that report's findings; v2.1 (same day as this report) added Section 7 signal subsections and the 0-5 weight mapping.
- **Question:** Is the documented advice in both rubrics still accurate against current primary sources?
- **Method:** Six parallel research passes: Claude Code; Codex, AGENTS.md, Agent Skills, Gemini CLI and local harnesses; GitHub Copilot and VS Code; Cursor and Windsurf/Devin; MCP and research citations; maintainability rubric and runtime data. Each pass mapped claims to rubric lines and classified them.
- **Access:** Vendor doc sites were mostly blocked by the environment's egress policy (section 10). Primary content was read from:
  - code.claude.com, which was reachable;
  - vendors' official repositories via raw.githubusercontent.com or `git clone` (github/docs, microsoft/vscode-docs, openai/codex source, agentsmd/agents.md, agentskills/agentskills, google-gemini/gemini-cli, cursor/plugins, cursor/cookbook, CognitionAI repos, modelcontextprotocol/modelcontextprotocol, nodejs/Release, python/peps, dotnet/core, kubernetes/website, actions/runner);
  - the npm and PyPI registries.
- **Evidence tags:**
  - **[primary]**: fetched from the vendor's docs or its official repository or source code.
  - **[snippet-of-official]**: a search engine's extract of an official page that could not be fetched.
  - **[snippet]**: a secondary search result. Not used alone for a current or deprecated conclusion.
  - **NOT VERIFIED**: searched but not found, or blocked.
- **Versions observed:**
  - Claude Code 2.1.288 (2026-10-02)
  - Codex 0.160.0 (2026-10-01; source read on `main`)
  - Gemini CLI 0.62.0 (2026-09-29)
  - VS Code 1.140 (2026-09-30)
  - MCP spec 2026-07-28; TypeScript SDK 1.32.0; Python SDK 2.3.0
  - jscpd 5.4.0

## 2. Summary

Most vendor-specific claims are still correct. Nothing found since 2026-09-24 invalidates a scoring rule.

One vendor change matters: VS Code 1.140 deprecated `.vscode/mcp.json` and moved toward harness-dependent behavior. The rest are accuracy fixes and gaps:

- **Errors in the rubric's own examples:**
  - Template 13.3 is silently insecure if copied into Claude Code.
  - The MCP example points at a deprecated npm package, at a version that never existed.
  - The generic hook example is not labelled with its tool.
  - Two citation titles or URLs are wrong.
- **Claims that are too broad:**
  - The local-harness note in Section 4.
  - `.agents/skills` described as the most portable location, which Claude Code does not read.
  - The EnvBench "under 30%" figure.
- **Missing scan targets:**
  - Codex `.codex/rules`.
  - Copilot `REVIEW.md` and `excludeAgent`.
  - `.claude/AGENTS.md`.
  - Devin Desktop (formerly Windsurf) paths.
- **Maintainability reference data is wrong and expired:**
  - Python 3.10 reached end of life on 2026-10-01 but is marked supported.
  - Kubernetes 1.37 is missing.
  - The file is 99 days old against a 60-day expiry.

## 3. Findings: AI readiness rubric, by tool

Only actionable or uncertain rows are listed in full. Confirmed claims are grouped at the top of each table.

### 3.1 Claude Code

| # | Rubric claim (line) | Classification | Evidence | Risk / confidence | Recommended change |
|---|---|---|---|---|---|
| C1 | Confirmed, grouped (lines 161, 240, 271, 418, 485, 546, 626, 712, 747, 782, 885, 1057, 1060). Covers: AGENTS.md read only when no CLAUDE.md/.claude/CLAUDE.md/CLAUDE.local.md exists; CLAUDE.local.md is gitignored; `.claude/rules` uses `paths` frontmatter; commands merged into skills; subagent fields; `.mcp.json` and managed MCP allow/deny lists; hook JSON decisions and `allowManagedHooksOnly`; settings scopes; sandbox off by default and enforceable via managed settings; OTel monitoring; cloud setup scripts and SessionStart hooks; `.claude-plugin/`; `.claude/output-styles/` | confirmed-current | memory.md: "By default, Claude reads `AGENTS.md` only when you have no `CLAUDE.md`". skills.md: "Custom commands have been merged into skills". managed-mcp.md: "`allowedMcpServers`/`deniedMcpServers`". sandboxing.md: "The sandbox is off by default". Changelog 2.1.283-2.1.288 has no format changes [primary, code.claude.com/docs/en/*.md, anthropics/claude-code CHANGELOG.md] | low / high | none |
| C2 | Template 13.3 verifier uses `readonly: true` (1590) | likely-outdated (accurate for Cursor only) | Claude: "Claude Code ignores a field it doesn't recognize without reporting an error"; `tools` "Inherits every tool… if omitted" [primary, sub-agents.md]. Cursor does support `readonly: true` (R8) | medium / high: a verifier copied to `.claude/agents/` silently keeps Write and Edit | Label the template as Cursor frontmatter. Add the Claude form: `disallowedTools: Write, Edit` or `permissionMode: plan`. |
| C3 | A coexisting `CLAUDE.md` should import `@AGENTS.md` (239, 1094) | needs-human-decision (incomplete) | "A `CLAUDE.md` symlinked to `AGENTS.md`: nothing… Claude reads the content once." A user or managed setting `claude-md-and-agents-md` also loads both files, but is "ignore[d] in project and local settings" [primary, memory.md] | medium / high | Treat a symlinked `CLAUDE.md` as compliant. Keep the risk flag, since the setting is not visible in the repo. |
| C5 | Scan list lacks `.claude/AGENTS.md` (1022-1024) | missing-from-rubric | "every `AGENTS.md` and `.claude/AGENTS.md` in your working directory and the directories above it" [primary, memory.md] | low / high | Add to Section 7 and the Section 4 Claude row. |
| C6 | "`.agents/skills` is the most portable location" (325) | needs-human-decision | Claude Code does not read "anything under a `.agents/` directory" [primary, memory.md]. It is still the most widely adopted convention elsewhere (X15) | medium / high | Add: "Claude Code does not read `.agents/skills`; repos targeting Claude need `.claude/skills` or a symlink." |
| C7 | Generic hook example in 3.7 (~643-668) uses `"version": 1`, `preToolUse` | needs-human-decision (unlabelled) | Claude events are PascalCase (`PreToolUse`) in `.claude/settings.json` [primary, hooks.md]. The example's shape matches Cursor's and Copilot's `hooks.json` (R10, G18) | low / high | Label it "Cursor / Copilot `hooks.json` format", and add a one-line Claude equivalent. |
| C4, C8-C13 | CLAUDE.local.md also shadows AGENTS.md; hooks can come from plugin `hooks/hooks.json` and skill or agent frontmatter; extra subagent fields (`maxTurns`, `memory`, `effort`, `omitClaudeMd`); reference titles [14], [15], [32] renamed; committed `settings.local.json` as a risk | no-action / optional | [primary, memory.md, hooks.md, sub-agents.md, settings.md] | low / high | Optional notes only. |

### 3.2 OpenAI Codex, AGENTS.md, Agent Skills, Gemini CLI, local harnesses

| # | Rubric claim (line) | Classification | Evidence | Risk / confidence | Recommended change |
|---|---|---|---|---|---|
| X1-X15 | Confirmed, grouped. Covers: AGENTS.md is plain Markdown under Agentic AI Foundation / Linux Foundation stewardship; Codex `AGENTS.override.md` precedence, `.agents/skills` and `.codex/skills`, `.codex/agents/*.toml`, `.codex/hooks.json`, sandbox modes, approval policies (`on-failure` as alias, `granular`), `[mcp_servers]`, admin-managed `requirements.toml`; Agent Skills `name` must match the directory and `description` is required (template 13.4 valid); Gemini `context.fileName`, `.gemini/skills` with the `.agents/skills` alias, `.gemini/agents/*.md`, hooks in `.gemini/settings.json`, `gemini-extension.json` | confirmed-current | openai/codex `codex-rs/core/src/agents_md.rs`, `ext/skills/src/host_roots.rs`, `agent-roles/src/loader.rs`, `hooks/src/engine/discovery.rs`, `protocol/src/{protocol,config_types}.rs`, `config/src/config_requirements.rs`; agentsmd/agents.md components; agentskills `docs/specification.mdx`; gemini-cli `docs/cli/{gemini-md,skills}.md`, `docs/core/subagents.md`, `docs/hooks/index.md` [primary] | low / high | none |
| X16 | Local harnesses "broadly read `AGENTS.md` and `.agents/skills`": Codex, OpenCode, Goose, Roo Code, Cline, Crush, Zed, Qwen Code, Mistral Vibe (893) | likely-outdated (partly inaccurate) | Qwen Code defaults to `QWEN.md` and `.qwen/skills/` (qwen-code `docs/users/configuration/settings.md`, `features/skills.md`). Cline reads AGENTS.md but its skills are `.cline/skills`, `.clinerules/skills`, `.claude/skills` (cline `docs/customization/skills.mdx`). Crush documents only a global AGENTS.md. The rest are confirmed [primary] | medium / high: feeds the Local profile rationale | Remove Qwen Code. Footnote Cline (AGENTS.md only). Say "AGENTS.md and/or `.agents/skills`". |
| X17 | Codex "rules/config where used" (884); no `.codex/rules` scan target | missing-from-rubric | `exec_policy.rs`: `RULES_DIR_NAME = "rules"`, `RULE_EXTENSION = "rules"`, loaded for the Project layer. Starlark `prefix_rule(... decision = allow \| prompt \| forbidden)` [primary] | low-medium / high | Add `.codex/rules/**/*.rules` to 3.7, 4 and 7 as permission evidence. |
| X18 | Always-on budget does not mention Codex's own limit | missing-from-rubric | `DEFAULT_PROJECT_DOC_MAX_BYTES: usize = 32 * 1024`, "Maximum total bytes of project instruction content" [primary, config_toml.rs] | low / high | Note the 32 KiB total cap (configurable). It supports the brevity guidance. |
| X21, X22 | `AGENTS.override.md` scanned at root only (1020); `.gemini/commands/**` and `gemini-extension.json` absent from Section 7 | missing-from-rubric (minor) | `agents_md.rs` checks each directory from the project root to the cwd [primary]; internal inconsistency with Section 4 | low / high | Scan `**/AGENTS.override.md`. Add the Gemini paths to Section 7. |
| X23 | Skill check "`name` and/or `description`" (404) | needs-human-decision | Spec requires both. Codex's parser errors only on a missing `description`. Client guide: a name mismatch should "warn, load anyway" and a missing description should "skip the skill" [primary] | low / high | Treat `description` as essential and `name` as recommended. Optionally mention `allowed-tools` (experimental). |
| X19, X20 | Codex skips project AGENTS.md, config, rules and hooks for untrusted projects; `[permissions]` / `default_permissions` profiles | missing-from-rubric (nuance) | `agents_md.rs`, `config.schema.json` [primary] | low / high | Optional notes. Treat `default_permissions` as sandbox evidence. |

### 3.3 GitHub Copilot and VS Code

| # | Rubric claim (line) | Classification | Evidence | Risk / confidence | Recommended change |
|---|---|---|---|---|---|
| G1-G11 | Confirmed, grouped. Covers: `copilot-instructions.md`; `.github/instructions/*.instructions.md` with `applyTo`; Copilot reads root CLAUDE.md/GEMINI.md with the nearest AGENTS.md winning; `.github/agents/*.agent.md` with `.chatmode.md` as legacy; prompt files deprecated for Agent Host; VS Code skills in `.github`, `.claude` or `.agents/skills`; cloud-agent MCP set in repository settings; `.github/hooks/*.json`; `copilot-setup-steps.yml` constraints; Agent Plugins open standard | confirmed-current | github/docs `content/copilot/...` and `data/reusables/copilot/...`; microsoft/vscode-docs `docs/agent-customization/*.md` (DateApproved 9/30/2026) [primary] | low / high | none |
| G12 | VS Code MCP: "`.vscode/mcp.json`, root `.mcp.json`" (68, 558, 883, 1056) | likely-outdated | "the deprecated `.vscode/mcp.json`… Prefer the portable destinations for new servers"; "Agent Host doesn't read `.vscode/mcp.json` directly" [primary, vscode-docs mcp-servers.md; release-notes/v1_140.md, 2026-09-30] | medium / high | Prefer root `.mcp.json` and mark `.vscode/mcp.json` deprecated. Keep scanning it. Consider an "unmigrated `.vscode/mcp.json`" risk. |
| G13 | VS Code: "nested files off by default" (883) | needs-human-decision | The `chat.useNestedAgentsMdFiles` default applies to the Local agent only. "For Agent Host sessions, follow the selected harness's… rules." In 1.140 the Copilot harness "might already be the default" and finds nested AGENTS.md [primary, custom-instructions.md, v1_140.md, Copilot CLI docs] | medium / high | Reword as "depends on harness: on in Copilot harness, off in Local". |
| G14 | Copilot skills only `.github/skills` (882) | likely-outdated (incomplete) | "create a `.github/skills`, `.claude/skills`, or `.agents/skills` directory"; skills "work with Copilot cloud agent, Copilot code review, the Copilot CLI" [primary, reusables creating-adding-skills.md] | low-medium / high | List all three paths. |
| G15 | Copilot code review instruction sources | missing-from-rubric | "Copilot code review also reads custom instructions from `CLAUDE.md`, `GEMINI.md`, and `REVIEW.md` files"; reviews use the head branch's files [primary, reusables code-review/*] | low / high | Add `REVIEW.md` to persistent-guidance scan targets and the Copilot row. |
| G16 | `excludeAgent` frontmatter | missing-from-rubric | "add the `excludeAgent` keyword… `"code-review"` or `"cloud-agent"`" [primary, reusable custom-instructions-path.md] | low / high | Mention next to `applyTo`. |
| G17, G18, G19 | `copilot-code-review.yml` environment file; hook format details (camelCase events, default-branch requirement, `"ask"` treated as deny on cloud agent, inline hooks in `.github/copilot/settings.json`); agent `description` required and `infer` retired | missing-from-rubric (detail) | customize-the-agent-environment.md, hooks-reference.md, custom-agents-configuration.md [primary] | low / high | Optional scan targets: `.github/copilot/settings.json`, `.github/workflows/copilot-code-review.yml`. |
| G20, G21 | References [9]-[11] use `code.visualstudio.com/docs/copilot/customization/...`; [31] is a bare repo URL | likely-outdated (citation) | vscode-docs `docs/toc.json` now lists `/docs/agent-customization/...`; the old source files 404. Whether the old URLs redirect is NOT VERIFIED. [31] has a specific page, "Configure the development environment" [primary] | low / high | Update the URLs. Add hooks, MCP and agent-plugins pages as citations. |

### 3.4 Cursor (resolves prior F19)

| # | Rubric claim (line) | Classification | Evidence | Risk / confidence | Recommended change |
|---|---|---|---|---|---|
| R1, R5, R6, R8-R11 | Confirmed, grouped. Covers: `.mdc` with `description`, `alwaysApply` and `globs` (string or list); Cursor reads AGENTS.md; `.cursor/skills` and `.agents/skills` (also `.claude/skills` and `.codex/skills` for compatibility); `.cursor/agents` with `readonly`, `model: inherit`, `is_background`; `.cursor/mcp.json`; `.cursor/hooks.json` (`version: 1`, `beforeShellExecution`, `afterFileEdit`, `stop`; cloud agents run them); `.cursor-plugin/plugin.json` | confirmed-current | cursor/plugins (commit 23e4138, 2026-10-03) `create-plugin-scaffold/SKILL.md`, `schemas/plugin.schema.json`, agent files; cursor/cookbook `hooks/.cursor/hooks.json`, `.cursor/skills/...` [primary]. Docs pages corroborate [snippet-of-official] | low / high | none |
| R2 | Scan target `.cursor/rules/**/*.md` (267, 1033) | needs-human-decision | "Project rules must use the .mdc extension… a plain .md file in .cursor/rules is ignored by the rules system" [snippet-of-official, cursor.com/docs/rules] | medium / medium: a plain `.md` file may score as a rule Cursor never loads | Count only `.mdc` as Cursor rules, or flag `.md` as "not loaded by Cursor". The scanner's Cursor budget (`scanner.ts:455`) also counts `.md`. |
| R3 | `RULE.md` folder format | likely-outdated (do not add) | Official extract: "Each rule is an .mdc file". No `RULE.md` file exists in any Cursor-owned repo [snippet-of-official; primary search] | low / medium | Do not add `RULE.md`. |
| R4 | `.cursorrules` "deprecated" (28, 230-236, 904) | confirmed-current (wording) | "The .cursorrules file is a legacy format planned to be deprecated" [snippet-of-official] | low / medium | Optionally say "legacy (deprecation planned)". |
| R7, R12 | Skill `paths` frontmatter; project `.cursor/commands` (only plugin `commands/` seen) | missing-from-rubric / weak | [snippet-of-official]; cursor/plugins scaffold [primary, plugin layout only] | low | Optional. |

### 3.5 Windsurf, now Devin Desktop (resolves prior F20)

| # | Rubric claim (line) | Classification | Evidence | Risk / confidence | Recommended change |
|---|---|---|---|---|---|
| W1 | "Windsurf mappings are not listed because… could not be verified" (894) | likely-outdated | Windsurf rebranded as Devin Desktop on 2026-06-02 [snippet]. Cognition-owned repos confirm the `.windsurf/*` formats [primary] | medium / medium | Add a Devin Desktop (formerly Windsurf) row with a "verify" note; see the proposed row below. |
| W2-W6 | Rules, AGENTS.md, skills, workflows and hooks | missing-from-rubric | **[primary]**, CognitionAI/windsurf-demo (d4e661a) and CognitionAI/plugin-template (dd46026): `.windsurf/rules/*.md` with `trigger: always_on\|manual\|glob` and `globs`; `.windsurf/workflows/`, `.windsurf/skills/`, `.windsurf/hooks.json`; AGENTS.md as the always-on rule.<br>**[snippet-of-official]**, docs.devin.ai and docs.windsurf.com: `.devin/{rules,skills,workflows,hooks.json}` preferred with `.windsurf/*` as fallback; 12,000 characters per rule; `model_decision` trigger; nested AGENTS.md act as glob rules. | medium / medium | Add `.devin/*` and `.windsurf/*` scan targets. The scanner's Windsurf budget (`scanner.ts:479`) ignores `trigger: always_on` rules. |
| W7 | MCP and subagents | needs-human-decision | `.devin/mcp_config.json` (project) and `~/.config/devin/mcp_config.json` (legacy Cascade); `.devin/agents/*.md` (beta) [snippet-of-official] | low-medium / low | Add only with a beta note. |

Proposed Section 4 row (mixed evidence):

| Devin Desktop (formerly Windsurf) | `AGENTS.md` (root always-on; nested as glob rules) | `.devin/rules/*.md` (preferred), `.windsurf/rules/*.md` (legacy); `trigger`, `globs`, `description`; 12,000 characters per file | `.devin/skills/**/SKILL.md`, `.windsurf/skills/**/SKILL.md` (legacy) | `.devin/agents/*.md` (beta) | `.devin/mcp_config.json` | `.devin/hooks.json`, `.windsurf/hooks.json` (legacy); workflows in `.devin/workflows/`, `.windsurf/workflows/` |

### 3.6 MCP

| # | Rubric claim (line) | Classification | Evidence | Risk / confidence | Recommended change |
|---|---|---|---|---|---|
| M1-M4 | Confirmed: current spec is 2026-07-28; it removes the init handshake and tightens auth validation; the security best practices cover token passthrough and local server compromise; the rubric's advice (externalize secrets, least privilege, human approval, approved servers) matches the official guidance | confirmed-current | `schema/2026-07-28/schema.ts` and `schema/draft/schema.ts`: `LATEST_PROTOCOL_VERSION = "2026-07-28"`. Changelog: "remove the `initialize`/`notifications/initialized` handshake", "Remove protocol-level sessions". Security doc: "MCP servers MUST NOT accept any tokens that were not explicitly issued for the MCP server". tools.mdx: "there SHOULD always be a human in the loop" [primary, modelcontextprotocol/modelcontextprotocol] | low / high | Optionally list SSRF, state handle hijacking and scope minimization. Do not attribute version pinning to the spec; it is the rubric's own advice. |
| M5 | Example `"@modelcontextprotocol/server-github@1.2.3"` (572) | likely-outdated | npm: latest `2025.4.8`, deprecated: "Package no longer supported". Version 1.2.3 does not exist [primary, registry.npmjs.org] | medium / high: the rubric teaches a dead package | Use a neutral placeholder (`@example/mcp-server@1.2.3`) or a maintained server. |
| M6, M7 | Approved registry or allowlist; remote vs stdio servers | missing-from-rubric | Official registry "is currently in preview" and "does not support private servers… host your own private MCP registry". stdio servers use environment credentials; HTTP servers act as OAuth 2.1 resource servers; local HTTP servers should "Require an authorization token" [primary] | low-medium / high | Add: "Listed in the public registry is not the same as approved." Remote servers should use OAuth or scoped tokens, not broad PATs. |
| M8 | SDK adoption | no-action | TypeScript SDK 1.32.0 still declares `2025-11-25`; Python `mcp` 2.3.0 implements 2026-07-28 [primary] | low / high | Do not penalize configs targeting 2025-11-25 clients. |

## 4. Findings: research citations

| # | Rubric claim (line) | Classification | Evidence | Risk / confidence | Recommended change |
|---|---|---|---|---|---|
| E1 | [26] Galster et al. measures adoption, not effectiveness (24, 37) | confirmed-current | Title and scope as cited; "2,853 GitHub repositories" [snippet] | low / medium | none |
| E2 | [27] context files can reduce success and raise cost by over 20% (35) | confirmed-current; nuance missing | Authors and ID confirmed [primary, eth-sri/agentbench README]. LLM-generated files about −0.5% to −2%; human-written about +4%; cost +20% or more [snippet] | medium / medium | Optionally add the human-written vs LLM-generated distinction, which supports concise curated guidance. |
| E3 | Per-model deltas in [27] (prior unresolved item) | NOT VERIFIED | Models confirmed: sonnet-4-5, qwen3-30b-coder, gpt-5.2-codex, gpt-5.1-codex-mini [primary, analyze.sh]. One low-trust snippet suggests Qwen3 benefited most from human-written files | high relevance / low confidence | A human should read Fig. 3 of the paper. Until then, do not assume context files hurt small models more. |
| E4 | [28] title "AGENTS.md and agent efficiency" (1644) | likely-outdated (citation) | Actual title: "On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents". The claim matches (28.64% runtime, 16.58% output tokens; 10 repos, 124 PRs) [snippet] | low / medium | Fix the title. Optionally note the small sample. |
| E5 | "state-of-the-art success on… EnvBench… is under 30%" (772) | likely-outdated (imprecise) | README: "6.69% for Python and 29.47% for JVM" [primary]. That is a 2025 GPT-4o baseline; later work (PIPer, EnvPilot) reports large gains on related setups [snippet] | medium / medium | Reword as "the original EnvBench paper (2025) reported 6.7% Python / 29.5% JVM; environment setup remains hard". Add arXiv 2503.14443. |
| E6 | Thin evidence for advanced mechanisms (37) | missing-from-rubric (new evidence) | SWE-Skills-Bench (2603.15401): "39 of 49 skills yield zero pass-rate improvement… average gain of only +1.2%", some −10%, token overhead up to +451%. 2608.10319: "limited and inconsistent gains" [snippet] | medium / medium | Cite at line 37. This bears on decision D1. |
| E7 | "tool schemas also consume context" (552) | missing-from-rubric (supporting) | MCP benchmarks report 30-50% multi-server success and degradation as tools are added [snippet] | low / low-medium | Optional citation. |

## 5. Findings: maintainability rubric

| # | Claim (line in rubrics/maintainability/rubric.md) | Classification | Evidence | Risk / confidence | Recommended change |
|---|---|---|---|---|---|
| T1 | Prefer managed identity, workload identity, OIDC or IAM roles (26, 100) | confirmed-current | github/docs `actions/concepts/security/openid-connect.md`: "You won't need to duplicate your cloud credentials as long-lived… secrets" [primary] | low / high | none |
| T2 | Azure workload identity | confirmed-current | AAD Pod Identity deprecated since 2022; the add-on lost support in Sept 2025 [snippet] | low / medium | Optionally name Pod Identity as a legacy pattern. |
| T3 | "GitHub Actions and action runtime versions" (77) | missing-from-rubric | actions/runner `Constants.cs`: `Node24DefaultDate = "June 16th, 2026"`, `Node20RemovalDate = "September 23rd, 2026"` [primary] | medium / high | Name `using: node20` (or older) actions as a removed-runtime risk. Add an `actions` entry to the reference data. |
| T4, T5 | Kubernetes API deprecations; IaC tool list | confirmed-current / no-action | Newest deprecation-guide section is v1.32; `aws-cdk-lib` and `@pulumi/pulumi` released this week [primary]. Terraform, OpenTofu, Bicep and Helm status not checked directly; CDKTF likely sunset (NOT VERIFIED) | low / medium | none |
| T6 | jscpd duplication (pinned 5.4.0) | confirmed-current | npm `latest` is 5.4.0, published 2026-09-30 [primary] | low / high | none |
| T7 | "use repo-local support matrices… rather than internet browsing" (15, 181) | needs-human-decision | The matrix is expired (section 6), which turns every runtime check into "unknown" | medium / high | Refresh now. Add a refresh cadence or a UI warning. |

## 6. Maintainability reference data (`src/lib/reference/runtimeSupport.json`)

The file was last updated 2026-06-26 with `expiryDays: 60`, so it is 99 days old today.

- `isRuntimeSupportMatrixStale` marks it stale. `scanner.ts:425-428` then forces `hasSupportedCoreRuntime = false`.
- `consistencyChecks.ts:177` reports "Runtime support posture is unknown because checked-in reference data is stale".
- No repo can currently earn supported-runtime credit.

| Ecosystem / version | Current entry | Actual status (source) | Correct? |
|---|---|---|---|
| Python 3.10 | security, supported, eol 2026-10 | `status = "end-of-life"`, `end-of-life = 2026-10-01` (python/peps `release_management/python-releases.toml`) [primary] | **No**: should be eol and unsupported |
| Python 3.13 | bugfix | `status = "security"`, end of bugfix 2026-10-01 [primary] | **No**: status should be security |
| Python 3.15 | prerelease | rc3 out 2026-10-02; final expected 2026-10-09 [primary] | Yes (changes in about 6 days) |
| Python 3.9, 3.11, 3.12, 3.14 | as listed | match [primary] | Yes |
| Node 26 / 24 / 22 / 20 | current / lts / lts / eol | 26 becomes LTS on 2026-10-28; 24 moves to maintenance on 2026-10-20; 22 is maintenance; 20 ended 2026-04-30 (nodejs/Release `schedule.json`) [primary] | Yes (two changes this month) |
| .NET 10 / 9 / 8 / 7 | as listed | 9 and 8 reach end of life 2026-11-10; 11 is in go-live (RC1 2026-09-08) (dotnet/core `releases-index.json`) [primary] | Yes (8 and 9 expire in 38 days) |
| Kubernetes supported minors | 1.36, 1.35, 1.34 | 1.37 released 2026-08-26 (end of life 2027-10-28); 1.34 end of life 2026-10-27 (kubernetes/website `data/releases/schedule.yaml`) [primary] | **No**: 1.37 missing. The scanner does not read this entry today. |

Add as end-of-life so they count as risks rather than "unknown": Node 25, 23, 21, 19 and 18; .NET 6 and 3.1. A refresh must also update `runtimeSupport.test.ts:9`, which hard-codes `lastUpdated`. Given the number of transitions in October and November, set a short expiry or schedule a refresh for mid-November.

## 7. Scorer enforcement findings (repo-local truth)

- **S1:** `scanner.ts:455` counts `.cursor/rules/**/*.md` toward the Cursor always-on budget, although Cursor ignores plain `.md` rules (R2, snippet-level).
- **S2:** `scanner.ts:479` measures only `AGENTS.md` for the Windsurf budget and ignores `.windsurf`/`.devin` rules with `trigger: always_on` (W2).

## 8. Recommended changes

**Ready after maintainer sign-off.** These are low risk, have primary evidence, and change no weights:

1. Template 13.3: label it as Cursor frontmatter and add the Claude form (C2).
2. Label the 3.7 hook example with its tool and add a one-line Claude equivalent (C7).
3. Replace the MCP example package with a neutral placeholder (M5).
4. Fix the local-harness note: remove Qwen Code and footnote Cline (X16).
5. Add a caveat that `.agents/skills` is not read by Claude Code (C6).
6. VS Code MCP: prefer root `.mcp.json` and mark `.vscode/mcp.json` deprecated (G12). Reword the nested AGENTS.md note as harness-dependent (G13).
7. Add scan targets: `.claude/AGENTS.md` (C5), `**/AGENTS.override.md` (X21), `.codex/rules/**/*.rules` (X17), `REVIEW.md` (G15), Copilot skills in `.claude/skills` and `.agents/skills` (G14), `.gemini/commands` and `gemini-extension.json` (X22), `.github/copilot/settings.json` (G18).
8. Mention `excludeAgent` (G16) and the Codex 32 KiB AGENTS.md cap (X18).
9. Citations: fix the [28] title (E4); reword the EnvBench claim and add its arXiv ID (E5); update the [9]-[11] and [31] URLs (G20, G21); cite SWE-Skills-Bench at line 37 (E6).
10. Refresh `runtimeSupport.json` per section 6. This is reference data, not rubric text, but it is the most score-affecting item in this report.

**Needs a maintainer decision:**

- **D1. Skills, specialized agents and MCP weights.** These carry 22 Cloud points. New 2026 evidence (E6) adds to the prior report's E3: an average skill gain of +1.2%, with some skills negative. Consider moving points to validation and persistent guidance.
- **D2. Cursor `.md` rules.** Should plain `.md` files in `.cursor/rules` count as rules (R2, S1)? The evidence is snippet-of-official only.
- **D3. Devin Desktop row.** Add the proposed Section 4 row and its scan targets now, with `.windsurf/*` from primary evidence and `.devin/*` from snippets, or wait for a human doc check (W1-W7)?
- **D4. A symlinked `CLAUDE.md`.** Should it count as compliant with the "import AGENTS.md" rule (C3)?
- **D5. Skill frontmatter.** Should `description` be essential and `name` recommended, matching client behavior rather than the spec (X23)?
- **D6. Runtime reference data.** Choose a cadence: a shorter expiry, a scheduled refresh, or a UI warning when stale (T7).

## 9. Unresolved and blocked items

- Per-model deltas in arXiv 2602.11988 (E3) are still not verified, and remain the most useful missing number for the Local profile.
- **Snippet-only items:**
  - Cursor `.md` rules ignored (R2) and `.cursorrules` wording (R4).
  - All `.devin/*` paths, the 12,000-character limit, Devin MCP and agents (W2-W7).
  - Paper details for [26], [28], 2603.15401 and 2608.10319.
  - AKS Pod Identity status.
  - Copilot code review changelog items.
- Whether the old VS Code doc URLs redirect is NOT VERIFIED.
- Codex findings rest on source code, because the developers.openai.com prose docs were blocked. References [2] and [22]-[25] could not be loaded.
- Terraform, OpenTofu, Bicep and Helm release status was not checked directly.

## 10. Sources

All checked on 2026-10-03.

**Fetched [primary]:**
- code.claude.com/docs/en/{memory, skills, settings, sub-agents, hooks, mcp, managed-mcp, monitoring-usage, cloud-environments, claude-code-on-the-web, plugins, plugin-marketplaces, plugins-reference, output-styles, permissions, sandboxing, iam, server-managed-settings}.md
- raw.githubusercontent.com:
  - anthropics/claude-code `CHANGELOG.md`
  - openai/codex `codex-rs/...` (agents_md.rs, exec_policy.rs, config_toml.rs, config_requirements.rs, protocol.rs, config_types.rs, host_roots.rs, parser.rs, loader.rs, discovery.rs, config.schema.json, execpolicy/README.md)
  - agentsmd/agents.md components
  - agentskills/agentskills `docs/specification.mdx`, `docs/client-implementation/adding-skills-support.mdx`, `docs/clients.mdx`
  - google-gemini/gemini-cli `docs/cli/{gemini-md,skills}.md`, `docs/core/subagents.md`, `docs/hooks/index.md`, `docs/extensions/reference.md`
  - Harness docs:
    - sst/opencode `packages/web/src/content/docs/{rules,skills}.mdx`
    - block/goose `documentation/docs/guides/context-engineering/{using-goosehints,using-skills}.md`
    - RooCodeInc/Roo-Code-Docs `docs/features/{custom-instructions.md,skills.mdx}`
    - cline/cline `docs/customization/{cline-rules,skills}.mdx`
    - charmbracelet/crush `README.md`
    - zed-industries/zed `docs/src/ai/{rules,skills}.md`
    - QwenLM/qwen-code `docs/users/configuration/settings.md`, `docs/users/features/skills.md`
    - mistralai/mistral-vibe `README.md`
  - github/docs `content/copilot/**` and `data/reusables/copilot/**`
  - microsoft/vscode-docs `docs/agent-customization/*.md`, `docs/toc.json`, `release-notes/v1_104`-`v1_141`
  - modelcontextprotocol/modelcontextprotocol `schema/2026-07-28/schema.ts`, `schema/draft/schema.ts`, `docs/specification/2026-07-28/{changelog,basic/authorization/index,server/tools}.mdx`, `docs/docs/2026-07-28/tutorials/security/security_best_practices.mdx`, `docs/registry/about.mdx`
  - eth-sri/agentbench `README.md`, `final_scripts/experiment1/analyze.sh`
  - JetBrains-Research/EnvBench `README.md`
  - nodejs/Release `schedule.json`
  - dotnet/core `release-notes/releases-index.json`
  - kubernetes/website `data/releases/{schedule,eol}.yaml`, `deprecation-guide.md`
  - actions/runner `Constants.cs`
  - github/docs `content/actions/concepts/security/openid-connect.md` and the AWS and Azure OIDC guides
- `git clone`:
  - cursor/plugins (23e4138), cursor/cookbook (6733ef8), cursor/plugin-template
  - CognitionAI/windsurf-demo (d4e661a), CognitionAI/plugin-template (dd46026)
  - python/peps (`release_management/python-releases.toml`)
- registry.npmjs.org: @anthropic-ai/claude-code, @openai/codex, @google/gemini-cli, @modelcontextprotocol/sdk, @modelcontextprotocol/server-github, jscpd, aws-cdk-lib, @pulumi/pulumi, cdktf
- pypi.org: mcp

**Search extracts:**
- [snippet-of-official]: cursor.com/docs/{rules, context/rules, skills, subagents, mcp}, cursor.com/changelog, docs.devin.ai/desktop/cascade/*, docs.windsurf.com/windsurf/cascade/agents-md
- [snippet]:
  - Papers: arxiv.org pages for 2602.11988, 2601.20404, 2602.14690, 2603.15401, 2608.10319, 2509.25455, 2609.07357
  - github.blog changelog
  - docs.azure.cn AKS workload identity

**Blocked by egress policy:**
- AI tooling docs: cursor.com, docs.cursor.com, forum.cursor.com, developers.openai.com, docs.github.com, github.blog, code.visualstudio.com, agents.md, agentskills.io, geminicli.com, docs.windsurf.com, windsurf.com, docs.devin.ai, docs.anthropic.com, modelcontextprotocol.io
- Research: arxiv.org, export.arxiv.org, ar5iv, alphaxiv.org, semanticscholar.org, api.semanticscholar.org, huggingface.co
- Runtime data: endoflife.date, devguide.python.org, peps.python.org, www.python.org, kubernetes.io, learn.microsoft.com, dotnetcli.blob.core.windows.net
- GitHub: github.com HTML and api.github.com returned 403 (`git clone` worked)

**Other failures:** files.sri.inf.ethz.ch returned 403 from the server.
