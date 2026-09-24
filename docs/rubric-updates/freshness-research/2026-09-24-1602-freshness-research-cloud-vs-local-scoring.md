# Freshness Research: Rubric Currency and a Cloud vs Local Score Split

## Decision

Status: needs-human-decision
Report type: freshness-research
Inputs:
- rubric.md (v1.0, dated 2026-05-18)
- rubric.schema.json
- src/lib/scoreCaps.ts, src/lib/promptBuilder.ts, src/lib/scanner.ts
Required follow-up:
- Maintainer decides whether to adopt a dual score (cloud profile + local profile) and approves or edits the proposed weights in section 5.
- Re-verify the items marked NOT VERIFIED once `arxiv.org`, `cursor.com`, `docs.windsurf.com`, and `developers.openai.com` are reachable (blocked by this environment's network policy on 2026-09-24).
- Then run `implement-rubric-update` for the confirmed vendor-freshness changes in section 3. Those are low risk and can proceed independently of the dual-score decision.

## 1. Scope and method

- **Date:** 2026-09-24.
- **Question:** Is the May 2026 rubric still accurate? Do its categories and weights reflect what helps agents succeed? And should repos get separate scores for cloud frontier models and local models?
- **Method:** Four research passes plus a manual spot check. The passes covered empirical papers, local agent harness docs, capability benchmarks, and vendor freshness.
- **Source restrictions:** The egress proxy blocked arxiv.org, research.trychroma.com, cursor.com, developers.openai.com, code.visualstudio.com, docs.github.com, docs.windsurf.com, docs.ollama.com, swebench.com, tbench.ai, aider.chat, and huggingface.co. Where possible, the same primary content was read from each vendor's official GitHub repository instead: vscode-docs, github/docs, openai/codex source, ollama/ollama docs, raw leaderboard data, and paper harness repos. code.claude.com was reachable.
- **Evidence tags:**
  - **[primary]**: fetched from the vendor or author source, or the vendor's official repository.
  - **[snippet]**: seen only in search-result text. **Not verified** and must not drive implementation on its own.
  - **NOT VERIFIED**: searched but not found or blocked.

## 2. Findings on the rubric's evidence base

| # | Rubric claim or premise | Classification | Evidence | Risk / confidence |
|---|---|---|---|---|
| E1 | "More context is not automatically better" [27] | confirmed-current | Gloaguen et al. (arXiv 2602.11988) abstract: context files "tend to reduce task success rates compared to providing no repository context" while increasing inference cost "by over 20%"; recommends that files "describe only minimal requirements". Harness shows models tested: Sonnet 4.5, GPT-5.1-codex-mini, **Qwen3-30B-Coder via vLLM** [primary: github.com/eth-sri/agentbench, abstract via github.com/AkihikoWatanabe/paper_notes/issues/4710]. Human-written about +4% vs LLM-generated about −3% [snippet]. | High relevance / medium confidence (PDF blocked) |
| E2 | Persistent guidance is the heaviest category (15) | needs-human-decision | Evidence supports *concise, non-inferable* guidance, not presence. Lulla et al. (2601.20404): AGENTS.md is associated with 28.64% lower median runtime and 16.58% fewer output tokens, with comparable completion [primary via paper_notes #4775]. A small-model study (2606.20512, Qwen3.5-35B-A3B): no guidance 25.5% → static 28.3% → iteratively tuned 33.0% on SWE-bench Verified; the gain came from locating the right files [snippet]. | Medium / medium |
| E3 | Galster et al. [26] cited as support for skills/subagents/MCP | confirmed but mis-applied | The study measures **adoption** across 2,853 repos, not agent performance [snippet; arXiv page retitled "Harness Engineering for Agentic AI Coding Tools"]. No study found showing that skills, subagents, or MCP config improve task success. These three categories carry 30 of 100 points on adoption evidence only. | High / medium |
| E4 | Validation and reproducibility (10) | confirmed-current, likely under-weighted | Environment setup is hard for agents: EnvBench state of the art is 6.69% (Python) and 29.47% (JVM) [primary: github.com/JetBrains-Research/EnvBench]. SetupBench has 93 instances [primary]; Claude 4 62.4% [snippet]. Test feedback in repair loops: 43.9% vs 28.5% SR@1 (2507.18755) [snippet]. Counter-evidence for very small models: "at smaller scales, execution feedback is actively harmful" (2607.26117) [snippet]. | Medium / medium |
| E5 | Instruction volume degrades compliance | confirmed-current | IFScale: "3 distinct performance degradation patterns as instruction density increases", "bias for earlier instructions" [primary: DistylAI repo]. | High / high |
| E6 | Long context degrades, worse for small models | confirmed-current | NoLiMa: effective length "<1K"–"<2K" for small open models vs 8K (GPT-4o) and 16K (GPT-4.1); Gemma 3 27B falls from 88.6 to 9.5 at 32K [primary: github.com/adobe-research/NoLiMa]. RULER: "only half of them can effectively handle sequence length of 32K" [primary: github.com/NVIDIA/RULER]. | High / high |

## 3. Vendor freshness findings (rubric sections 1, 3.x, 4, 7)

| # | Claim | Classification | Evidence (checked 2026-09-24) | Recommended change |
|---|---|---|---|---|
| F1 | Claude Code reads AGENTS.md only via import (section 4) | **likely-outdated** | "Claude Code can read `AGENTS.md` as your project instructions… without adding a `CLAUDE.md`, an import, or a setting." "Requires Claude Code v2.1.277 or later." Default: "Claude reads `AGENTS.md` only when you have no `CLAUDE.md`" (a `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` counts). [primary, manually re-verified: code.claude.com/docs/en/memory] | Update section 4. Add risk flag: **root CLAUDE.md exists alongside AGENTS.md without importing it, so Claude ignores AGENTS.md by default.** |
| F2 | `.github/prompts/*.prompt.md` as a maturity signal | **likely-outdated** | "Prompt files are deprecated for Agent Host sessions… Use prompt file migration… to convert existing prompts to agent skills." [primary: microsoft/vscode-docs docs/agent-customization/prompt-files.md] | Treat as legacy. Flag unmigrated prompt files. |
| F3 | `.claude/commands` | confirmed-current (legacy-OK) | "Custom commands have been merged into skills… existing `.claude/commands/` files keep working." [primary: code.claude.com/docs/en/skills] | Credit, but prefer skills. |
| F4 | `.chatmode.md` / `.agent.md` | confirmed-current | "rename them to `.agent.md`" [primary: vscode-docs custom-agents.md] | Flag `*.chatmode.md` as legacy. |
| F5 | Codex skills only at `.agents/skills` | partly wrong | Project layer reads both `.agents/skills` and `.codex/skills` [primary: openai/codex codex-rs/ext/skills/src/host_roots.rs] | Add `.codex/skills` to section 4. |
| F6 | Codex agents `.codex/agents/**` | confirmed; format detail missing | Loader requires `extension == "toml"` [primary: codex-rs/agent-roles/src/loader.rs] | Scan `.codex/agents/*.toml`. |
| F7 | Codex hooks | **missing-from-rubric** | `config_folder.join("hooks.json")`; events PreToolUse, PostToolUse, SessionStart, Stop, PermissionRequest, and others [primary: codex-rs/hooks/src/engine/discovery.rs] | Add `.codex/hooks.json`. |
| F8 | `.codex/requirements.toml` as a repo file | **likely-outdated** | Read from system/MDM next to `/etc/codex/managed_config.toml` [primary: codex-rs/config/src/config_requirements.rs] | Move to governance (admin-managed). Do not score it as a repo file. |
| F9 | Codex approval names | needs-update | `on-failure` is now a serde alias of `on-request`; new `granular` policy [primary: codex-rs/protocol] | Update section 3.7. |
| F10 | `AGENTS.override.md` | missing-from-rubric | `LOCAL_AGENTS_MD_FILENAME = "AGENTS.override.md"` [primary: codex-rs/core/src/agents_md.rs] | Add to scan list. |
| F11 | Gemini CLI row "Tool-dependent" | likely-outdated | `.gemini/skills` (or `.agents/skills`), `.gemini/agents/*.md`, hooks in `.gemini/settings.json`, `context.fileName` can include AGENTS.md [primary: google-gemini/gemini-cli docs] | Fill in the row. |
| F12 | Copilot/VS Code row lists GEMINI.md | confirmed with nuance | GitHub Copilot reads root CLAUDE.md/GEMINI.md; VS Code nested AGENTS.md is "disabled by default"; VS Code also reads root `.mcp.json` [primary: github/docs, vscode-docs] | Split GitHub vs VS Code nuances. |
| F13 | Verifier example uses `readonly: true` | inaccurate for Claude | Claude subagent fields include `tools`, `disallowedTools`, `permissionMode`; no `readonly` [primary: code.claude.com/docs/en/sub-agents] | Mark example as Cursor-specific or use `tools`. |
| F14 | Plugins (`.claude-plugin/`, `.cursor-plugin/plugin.json`, Agent Plugins open standard) | **missing-from-rubric** | Claude: "Create `.claude-plugin/marketplace.json` in your repository root" [primary]; Cursor plugin manifest [primary: github.com/cursor/plugins]; VS Code "Agent Plugins is an open standard" [primary: vscode-docs agent-plugins.md] | Add a plugins scan target (under Versioning/provenance or MCP/tools). |
| F15 | Cloud-agent environment setup | **missing-from-rubric** | `copilot-setup-steps.yml` "must contain a single `copilot-setup-steps` job" [primary: github/docs]; Claude cloud setup scripts and SessionStart hooks [primary: code.claude.com/docs/en/cloud-environments] | Add to Validation and reproducibility. |
| F16 | MCP spec version | missing / new | `LATEST_PROTOCOL_VERSION = "2026-07-28"`, stateless (no `initialize` handshake) [primary: modelcontextprotocol repo] | Cite the current spec and its security best-practices doc. |
| F17 | Agent Skills spec | confirmed-current | `name` must match the parent directory; `allowed-tools` experimental [primary: agentskills/agentskills specification.mdx] | Add a name-matches-directory check. |
| F18 | AGENTS.md format | confirmed-current | No format change; now stewarded by the Agentic AI Foundation (Linux Foundation) [primary: github.com/agentsmd/agents.md] | Optional citation update. |
| F19 | Cursor `.cursorrules` deprecation, `.cursor/agents`, `hooks.json`, `RULE.md` folders | **NOT VERIFIED** | cursor.com blocked; `.mdc` with `description/alwaysApply/globs` confirmed via Cursor's own plugin scaffold [primary: github.com/cursor/plugins] | Human check of cursor.com/docs/rules, /skills, /subagents, /hooks. |
| F20 | Windsurf `.windsurf/*` | **NOT VERIFIED / needs-human-decision** | Snippets suggest a rebrand toward `.devin/rules` with `.windsurf/rules` legacy [snippet] | Verify before changing the scanner. |

## 4. Scorer enforcement findings (repo-local truth)

| # | Finding | Evidence | Recommendation |
|---|---|---|---|
| S1 | **MCP cap contradicts the rubric.** `tool_manifests_mcp` is capped at 5/10 when no MCP file exists, and Mature requires tool-access governance evidence. | `rubric.schema.json` caps and bandConstraints; `src/lib/promptBuilder.ts:45`. The rubric text says "MCP is powerful but not required in every repo". Vendor guidance is to add MCP when a need appears ("Connect that system as an MCP server" when "You keep copying data from a browser tab", code.claude.com/docs/en/features-overview) and to add only trusted servers ("Local MCP servers can run arbitrary code", vscode-docs mcp-servers.md). GitHub cloud-agent MCP config lives in repo settings, not a file. | Remove the hard cap. Score N/A-neutral when no external-system need exists. Apply a cap only when the LLM finds an external need without governed access. Drop the MCP requirement for Mature. |
| S2 | `hasRootGuidance` is true only for `AGENTS.md`. | `src/lib/scanner.ts` (`paths.includes('AGENTS.md')`) | Keep AGENTS.md as the portable signal, but also detect the CLAUDE.md-shadows-AGENTS.md case (F1). |
| S3 | No evidence field measures always-on context size. | `EvidenceInventory` has no size/token fields | Add `alwaysOnGuidanceTokens` (AGENTS.md + CLAUDE.md + `alwaysApply` rules + un-scoped `.claude/rules`). This is needed by both profiles and is decisive for the local one. |
| S4 | The judge itself is a local model given the full rubric. | `buildPrompt` inlines `rubric.md` (~56 KB, roughly 14K tokens) plus scanned files. | This scorer is subject to the same local long-context limits (E6). Prefer the per-category prompt path and a trimmed rubric for local judges. |

## 5. Cloud vs local: evidence and proposal

### 5.1 Why two scores

| Dimension | Local (≤32B dense / ~30B-A3B MoE) vs frontier | Evidence |
|---|---|---|
| SWE-bench Verified | Small–medium gap | Qwen3-Coder-Next (80B/A3B) 70.6–71.3 vs Claude Opus 4.5 77.8–79.0 on the same scaffolds [primary: QwenLM/Qwen3-Coder tech report]. The 2026 frontier is likely further ahead; not verified. |
| Long-horizon terminal tasks | Large | Terminal-Bench 2.0: 36.2 / 30.9 vs 57.3 / 53.9 [primary: same report] |
| Single-turn tool calls | Negligible | BFCL v4 Live: Qwen3-32B 82.01 vs Opus 4.5 79.79 [primary: gorilla gh-pages data_overall.csv, 2026-04-12] |
| Multi-turn / memory tool use | Large (2–5×) | Multi-turn: Qwen3-30B-A3B 30.00 vs Opus 4.5 68.38; memory 17.63 vs 73.76 [primary: same CSV] |
| Effective context | Large | See E6 |
| Default context budget | Large | Ollama: "< 24 GiB VRAM: 4k context… 24-48 GiB VRAM: 32k"; "agents, and coding tools should be set to at least 64000 tokens" [primary: ollama/ollama docs/context-length.mdx] |
| Prompt prefill cost | Very large on laptops | M1 Pro, Qwen3.6-27B Q4: 12.9 tok/s dense / 38.6 tok/s MoE prefill; 7.5K-token cold prompt takes 92.8 s [primary: github.com/marcofariasmx/local-llm-apple-silicon]. Community benchmark, one machine. |
| 4-bit quantization | Small on code benchmarks | Qwen3.6-27B HumanEval: Q6_K 83.5, Q4_K_M 82.3, IQ2_XXS 59.8 [primary: github.com/yrougy/llm-quant-bench, community]. No agentic study found. |

**Artifact portability across local-capable harnesses** [primary: each project's GitHub docs/source]:

- **Broad:** `AGENTS.md` is read by Codex, OpenCode, Goose, Roo, Cline, Crush, Zed, Qwen Code, Mistral Vibe and Kilo. `.agents/skills` is read by Codex, Goose, OpenCode, Roo, Crush, Zed and Vibe.
- **Narrow:** hook formats, subagent formats and path-scoped rule formats are nearly all tool-specific.
- **Aider:** reads conventions via `--read` and has no skills, subagents or hooks.
- **Claude Code on local models:** possible via Ollama or LM Studio, but "Anthropic… doesn't support routing Claude Code to non-Claude models" [primary: code.claude.com/docs/en/llm-gateway].
- **Tool docs warn about local models:**
  - Goose: "Most locally-hosted models… will need the shim".
  - Continue: "not all models that claim tool support work correctly".
  - Qwen Code: "the longer it gets, the less reliably Qwen follows it".
  - OpenCode: "MCP servers add to your context".

**Conclusion.** The same repo can be well configured for a frontier cloud agent and poorly configured for a local one. The main difference is the prompt budget, more than raw coding ability:

- **Budget:** always-on guidance, MCP tool schemas and tool-specific layers cost little in the cloud but degrade accuracy and add minutes of latency locally.
- **Portability:** local harnesses mostly consume only portable formats.

A single score cannot represent both. **Recommendation: two scores computed from one scan.** The shared evidence inventory is reused, with a per-profile weight table and a few profile-specific checks.

### 5.2 Proposed weights (judgment derived from the evidence above; not empirically calibrated)

| Category | Current | Cloud | Local | Rationale |
|---|---:|---:|---:|---|
| Persistent guidance | 15 | 12 | 20 | Concise, non-inferable content (E1, E2). Local adds a hard always-on token budget. |
| Validation & reproducibility | 10 | 15 | 20 | Strongest evidence (E4). Local favors narrow, fast, deterministic commands. |
| CI & PR automation | 10 | 10 | 8 | Unchanged value; less direct local-loop impact. |
| Security, sandboxing, hooks | 10 | 12 | 10 | Cloud/background agents raise the stakes. Local credits portable approval modes over tool-specific hooks. |
| Skills | 10 | 10 | 10 | Progressive disclosure saves context. Local credits only portable locations (`.agents/skills`). |
| Scoped rules | 10 | 8 | 8 | Useful for context scoping; formats are fragmented. |
| Domain & decision context | 5 | 8 | 10 | Examples and contracts help agents locate code (E2 small-model coverage gain). |
| Specialized agents | 10 | 6 | 2 | No performance evidence (E3); weak multi-turn/subagent reliability locally. |
| Tool manifests & MCP | 10 | 6 | 4 | N/A-neutral (S1). Local rewards a *small* tool surface. |
| Governance & observability | 5 | 7 | 3 | Matters at org scale and for cloud background agents. |
| Versioning & provenance | 3 | 3 | 3 | Unchanged; include plugins (F14). |
| Onboarding & discoverability | 2 | 3 | 2 | Minor. |
| **Total** | 100 | 100 | 100 | |

**New local-profile checks:**

- **Always-on guidance token budget** (S3). Suggested thresholds: full credit ≤ 2K tokens, partial ≤ 4K, a risk flag above that. Derivation: NoLiMa small-model effective length is about 1–2K, and Ollama defaults to 4K below 24 GiB of VRAM.
- **Stable prefix:** no dates, generated content or frequently edited text in always-on guidance, so prompt caching stays effective.
- **Portable formats:** `AGENTS.md` and `.agents/skills` are preferred over tool-only equivalents.
- **Narrow validation:** a single-file or single-package test command is documented, not just the full suite.
- **Context-length expectation:** a note on the context size the repo needs.

**New cloud-profile checks:** F1 (CLAUDE.md shadowing AGENTS.md), F15 (cloud-agent setup), and F14 (plugins).

### 5.3 Calibration requirement

These weights are reasoned from the evidence, not measured. Before promoting them out of beta, calibrate with the rubric's own Phase 6 smoke test:

1. Pick 5–10 repos.
2. Run one frontier cloud agent and one local model (for example, Qwen3-Coder 30B-A3B at 4-bit via MLX) on the same trivial-change task.
3. Check that each profile's score correlates with that model's success, turns and time.

## 6. Unresolved and blocked items

- Per-model deltas in arXiv 2602.11988 (was Qwen3-30B hurt more than Sonnet 4.5 by context files?) are **NOT VERIFIED**; the PDF was blocked. This is the single most useful missing number for the local profile.
- arXiv 2606.20512, 2607.26117, 2607.27250 and 2605.10039 were seen as snippets only.
- Current (September 2026) frontier SWE-bench and Terminal-Bench numbers and context windows are **NOT VERIFIED**.
- Cursor (F19) and Windsurf/Devin (F20) are **NOT VERIFIED**.
- LM Studio's default context length is **NOT VERIFIED**.

## 7. Implementation readiness

- **Can proceed after maintainer sign-off (low risk):** F1–F18 vendor updates and S1 (remove the MCP cap).
- **Needs human product decision:** the dual score (section 5), its weights, and the local token-budget thresholds.
- **Needs re-verification when the network allows:** section 6 items and F19–F20.
