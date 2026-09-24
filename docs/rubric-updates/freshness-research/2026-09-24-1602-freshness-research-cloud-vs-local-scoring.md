# Freshness Research: Rubric Currency and a Cloud vs Local Score Split

## Decision

Status: needs-human-decision
Report type: freshness-research
Inputs:
- rubric.md (v1.0, dated 2026-05-18)
- rubric.schema.json
- src/lib/scoreCaps.ts, src/lib/promptBuilder.ts, src/lib/scanner.ts
Required follow-up:
- Maintainer approved the direction on 2026-09-24: a cloud score plus a user-selected local tier (tiny ≤4B / small 5–14B / medium 15–35B; larger models count as cloud). The maintainer still needs to approve or edit the tier weights and guidance budgets in section 5.3.
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

### 5.1 What "local" realistically means

Local tiers are bucketed by **total parameters**, because total size decides whether a model fits in memory. Anything too large for consumer hardware (roughly >35B total) belongs in the **cloud** profile, including large open-weight models run on hosted APIs or workstation rigs. An earlier draft of this report used Qwen3-Coder-Next (80B/A3B) as the local reference. That was unrealistic and has been removed.

**Hardware people actually have:**

- **Ollama's default context by VRAM:** "< 24 GiB VRAM: 4k context; 24-48 GiB VRAM: 32k context; >= 48 GiB VRAM: 256k context". The same page says "agents, and coding tools should be set to at least 64000 tokens" [primary: github.com/ollama/ollama docs/context-length.mdx].
- **GPU VRAM share (Steam survey, Jul–Aug 2026) [secondary]:**
  - 16 GB: ~25.9%
  - 8 GB: ~25.3%
  - 12 GB: ~12.9%
  - 24 GB: ~5.4%
- **Typical local machine:** 8–16 GB of VRAM, or a 16–36 GB Mac, running at the default 4K–32K context.

### 5.2 Realistic local capability vs frontier

Neutral-harness numbers are preferred over vendor claims, because vendor scaffolds use ~200K context and custom tooling.

| Benchmark | Local tier: model (≈4-bit size) | Local score | Frontier on same harness | Source |
|---|---|---|---|---|
| SWE-bench Verified, mini-SWE-agent, bash-only | Medium: Devstral Small 2, 24B (~14 GB) | 56.4 | Claude 4.5 Opus 76.8; GPT 5.2 72.8; Gemini 3 Pro 69.6 | [primary: SWE-bench/experiments metadata.yaml] |
| same | Medium: Qwen3.6-27B, FP8 | 67.8 | same | [independent: QwenLM/Qwen3 discussion #1846] |
| SWE-bench Verified, OpenHands | Medium: Qwen3-Coder-30B-A3B (~17 GB) | 51.6 | — | [primary: SWE-bench/experiments] |
| SWE-bench Verified | Small: FrogMini-14B (~8 GB) | 45.0 | — | [primary: SWE-bench/experiments] |
| Terminal-Bench 2.0 | Medium: Qwen3.6-35B-A3B, **local Q4 laptop run** | 24.6 ± 3.2 (vendor claims 51.5) | Opus 4.5 59.3; Gemini 3 56.7; GPT-5.1 48.6 | [independent: little-coder README; frontier from anthropic.com] |
| Terminal-Bench 2.0 | Small: Qwen3.5-9B (~5 GB), local | 9.2 ± 2.4 | same | [independent: little-coder README] |
| BFCL v4 multi-turn | Medium: Qwen3-32B / Qwen3-30B-A3B | 47.87 / 30.00 | Opus 4.5 68.38 | [primary: BFCL data_overall.csv] |
| BFCL v4 multi-turn | Small: Qwen3-8B / Qwen3-14B | 41.75 / 34.75 | same | same |
| Aider polyglot (2025 data) | Medium: Qwen3 32B / Gemma 3 27B | 40.0 / 4.9 | gpt-5 88.0; claude-opus-4 72.0 | [primary: aider polyglot_leaderboard.yml] |
| Harness sensitivity | Small: Qwen3.5-9B | 19.1% vanilla Aider → 45.6% tuned harness | — | [independent: little-coder README] |

**What the numbers show:**

- **Medium (15–35B):** roughly 10–20 points behind the frontier on SWE-bench-style single-repo fixes. Roughly 30+ points behind on long-horizon terminal work when run on real local hardware. About 20–40 points behind on multi-turn tool calling.
- **Small (5–14B):** usable for scoped edits at best. Long-horizon agentic work is mostly out of reach (single digits on Terminal-Bench).
- **Tiny (≤4B):** no credible agentic-coding benchmark found. Treat as a completion or chat assistant. The tier's settings are extrapolated and low confidence.
- **Current frontier:** Opus 5.5 and GPT-6 Astra report Terminal-Bench 4.0, which no local model has run. The true gap today is unmeasured and likely larger than the rows above.
- **Harness and context matter as much as the model at small sizes.** The same 9B model more than doubled its score with a tuned harness. So what the *repo* supplies (short guidance, exact commands, examples) matters more the smaller the model.

Artifact portability, context-rot and prefill findings from the earlier passes still hold:

- AGENTS.md and `.agents/skills` are broadly portable; hooks and subagents are tool-specific.
- Small models degrade after ~1–2K tokens (NoLiMa).
- Prefill costs minutes per 10K tokens on laptop Macs.

### 5.3 Proposed scoring design

**One scan, one LLM category assessment, then per-profile deterministic weighting.**

- The LLM judges each category's facts once.
- Each profile applies its own weights and token-budget checks in code.
- Switching tier does not require re-scoring.
- The user picks a local tier once, either globally or per repo in `repos.config.json`.
- The detail page shows **Cloud** next to the selected **Local** tier.

| Profile | Total params | Typical hardware (≈4-bit) | Always-on guidance budget* | Evidence confidence |
|---|---|---|---|---|
| Local: tiny | ≤ ~4B | 8 GB laptops / phones | ≤ 1K tokens | Low (no agentic benchmarks) |
| Local: small | ~5–14B | 16 GB Mac, 8–12 GB GPU | ≤ 1.5K tokens | Medium |
| Local: medium | ~15–35B, incl. 30B-A3B / 35B-A3B MoE | 24–36 GB Mac, 16–24 GB GPU | ≤ 3K tokens | Medium |
| Cloud | anything larger, or hosted | hosted APIs, workstations | Advisory flag only (threshold: human decision) | Medium |

\*Always-on guidance means AGENTS.md, CLAUDE.md, `alwaysApply` rules and un-scoped `.claude/rules` (evidence field S3). The limits are anchored to NoLiMa effective lengths (<1K–2K for small models, 8–16K for frontier), IFScale instruction-density decay, and Ollama's 4K default below 24 GiB. Full credit applies at or under the budget, partial credit up to 2× the budget, and a risk flag above that.

**Weights (judgment derived from the evidence above; not empirically calibrated):**

| Category | Current | Cloud | Local medium | Local small | Local tiny |
|---|---:|---:|---:|---:|---:|
| Persistent guidance (incl. budget check) | 15 | 12 | 20 | 21 | 22 |
| Validation & reproducibility | 10 | 15 | 20 | 22 | 24 |
| CI & PR automation | 10 | 10 | 8 | 8 | 8 |
| Security, sandboxing, hooks | 10 | 12 | 10 | 10 | 10 |
| Skills (local tiers: portable locations only) | 10 | 10 | 10 | 8 | 6 |
| Scoped rules | 10 | 8 | 8 | 8 | 8 |
| Domain & decision context | 5 | 8 | 10 | 11 | 12 |
| Specialized agents | 10 | 6 | 2 | 1 | 0 |
| Tool manifests & MCP (N/A-neutral, S1) | 10 | 6 | 4 | 3 | 2 |
| Governance & observability | 5 | 7 | 3 | 3 | 2 |
| Versioning & provenance | 3 | 3 | 3 | 3 | 3 |
| Onboarding & discoverability | 2 | 3 | 2 | 2 | 3 |
| **Total** | 100 | 100 | 100 | 100 | 100 |

**Why the weights move as models get smaller:**

- **Guidance, validation and domain examples go up.** Small models gain most from repo-supplied scaffolding (harness-sensitivity row) and from help locating code (E2).
- **Skills, specialized agents and MCP go down.** They depend on the model choosing to invoke tools across multiple turns, which is where small models are weakest (BFCL multi-turn). MCP tool schemas also consume scarce context.
- **Governance goes down.** It matters for org-scale and background cloud agents, not a single developer's local loop.
- **Specialized agents have zero weight in the tiny tier.** The category is shown as N/A instead of scored.

**Additional deterministic local checks, applied in all local tiers:**

- A stable prefix: no dates or generated content in always-on guidance, so prompt caching stays effective.
- Portable formats (AGENTS.md, `.agents/skills`) preferred over tool-only equivalents.
- A documented narrow test command (single file or package).
- An optional note on the context length the repo needs.

**Additional cloud checks:** F1 (CLAUDE.md shadowing AGENTS.md), F14 (plugins), and F15 (cloud-agent setup).

### 5.4 Calibration requirement

These weights and budgets are reasoned from the evidence, not measured. Before promoting them out of beta, run the rubric's Phase 6 smoke test:

1. Pick 5–10 repos.
2. Run the same trivial-change task with one cloud model and one representative model per local tier: for example, a ~27–35B model for medium, ~8–9B for small, and ~3–4B for tiny, all at 4-bit via MLX with the context the user actually runs.
3. Check that each profile's score correlates with that model's success, turn count and time.

## 6. Unresolved and blocked items

- Per-model deltas in arXiv 2602.11988 (was Qwen3-30B hurt more than Sonnet 4.5 by context files?) are **NOT VERIFIED**; the PDF was blocked. This is the single most useful missing number for the local profile.
- arXiv 2606.20512, 2607.26117, 2607.27250 and 2605.10039 were seen as snippets only.
- Current frontier models (Opus 5.5, GPT-6 Astra) report Terminal-Bench 4.0, which no local model has run, so the present-day gap is unmeasured.
- The tiny tier (≤4B) has no credible agentic-coding benchmark; its settings are extrapolated.
- Several local numbers come from vendor model-card mirrors or independent runs rather than official leaderboards (tagged in section 5.2).
- Cursor (F19) and Windsurf/Devin (F20) are **NOT VERIFIED**.
- LM Studio's default context length is **NOT VERIFIED**.

## 7. Implementation readiness

- **Can proceed after maintainer sign-off (low risk):** F1–F18 vendor updates and S1 (remove the MCP cap).
- **Needs human sign-off:** the tier weights and token budgets (section 5.3). The dual-score direction is approved.
- **Needs re-verification when the network allows:** section 6 items and F19–F20.
