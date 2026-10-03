# Agentic Repository Maturity Guide and Scorecard - 2026

**Version:** 2.1  
**Date:** October 3, 2026 (v2.0: September 24, 2026; v1.0: May 18, 2026)  
**Audience:** Engineering managers, platform teams, security teams, staff engineers, repo maintainers, and developers using AI coding agents

---

## Executive summary

A mature agentic-enabled repository is a codebase that teaches AI coding agents how to work safely, consistently, and verifiably inside that repository. It does this through version-controlled guidance, scoped rules, reusable workflows, specialized agents, controlled tool access, deterministic validation, and governance.

The strongest maturity signal is not simply whether a repo contains an AI instructions file. The strongest signal is whether the repo has a layered operating model:

1. **Persistent guidance** for what every agent must know.
2. **Scoped rules** for languages, frameworks, packages, services, and file paths.
3. **Reusable skills** for repeatable workflows.
4. **Specialized agents** for testing, review, security, debugging, migration, and research.
5. **Tool manifests** for external systems such as GitHub, service catalogs, databases, Sentry, docs, and design tools.
6. **Hooks, permissions, and sandboxing** for deterministic safety controls.
7. **Exact validation commands** tied to CI.
8. **Governance, ownership, and observability** so agent behavior can be audited and improved.

A 2026 empirical study of agentic coding-tool configurations identified eight major repo-level mechanisms: context files, skills, subagents, commands, rules, settings, hooks, and MCP servers. The study found that context files dominate adoption and that more advanced mechanisms such as skills and subagents are still shallowly adopted in many repositories. [26]

This guide is intentionally host-aware but not host-locked. For a Cursor-heavy organization, the practical default is:

- Use `AGENTS.md` as the portable repo-level baseline. Root `.cursorrules` is valid persistent guidance for scoring, but it is an older deprecated pattern that should be renamed or consolidated into `AGENTS.md`.
- Use `.cursor/rules/` for Cursor-native scoped rules.
- Add `SKILL.md` packages for repeatable workflows.
- Add specialized agents where independent review, testing, debugging, or security analysis is valuable.
- Add MCP only where external tools or data are truly needed, and govern it carefully.
- Add hooks and sandbox/approval controls for production-critical or security-sensitive repos.

One caution: more context is not automatically better. A 2026 evaluation of repository-level context files found that context files can reduce task success and increase inference cost by over 20% when they add unnecessary requirements, and recommends that they describe only minimal requirements. [27] Another 2026 study found `AGENTS.md` associated with lower agent runtime and token use at comparable task completion. [28] Mature repos should provide concise, accurate, scoped, testable guidance rather than large prompt dumps.

A second caution: the evidence for the more advanced mechanisms is thin. The configuration study above measures how often repos adopt skills, subagents, and MCP, not whether they improve agent results. [26] This guide therefore weights validation, reproducibility, and concise guidance more heavily than the presence of advanced mechanisms.

Version 2.0 adds **score profiles** (Section 6.1): a Cloud score for hosted frontier models, plus Local scores for models that run on consumer hardware. Small local models have much tighter context budgets and weaker multi-turn tool use, so the same repo can be well configured for one and poorly configured for the other.

---

## How to use this guide

Use this document in three ways:

1. **Reference guide:** Understand what each agentic repo component is and what purpose it serves.
2. **Scoring rubric:** Evaluate repos consistently across teams and business units.
3. **Scanner specification:** Build automated checks that inventory files, grade quality, and flag risk.

The scoring model is not meant to force every repo to implement every feature. A small internal utility might be healthy at Level 1 or Level 2. A production service should normally target Level 3. A critical platform, regulated system, or background-agent-enabled repo should target Level 4.

The most important principle is:

> Score for useful, safe, current, scoped, and validated context - not for the raw number of agent-related files.

---

## 1. Component map

| Component | Plain-language definition | Primary purpose | Common scan targets |
|---|---|---|---|
| Persistent guidance | A durable instructions file that tells agents how the repo works | Give every agent the minimum context needed to start safely | `AGENTS.md`, root `.cursorrules` (deprecated), `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md` |
| Scoped rules | Rules that apply only to specific tools, paths, languages, or frameworks | Prevent one giant always-on prompt; make guidance local and relevant | `.cursor/rules/**/*.mdc`, `.github/instructions/*.instructions.md`, `.claude/rules/**/*.md` |
| Skills | Reusable workflow packages with `SKILL.md` and optional scripts/references | Teach agents how to perform repeatable tasks | `.cursor/skills/**/SKILL.md`, `.agents/skills/**/SKILL.md`, `.claude/skills/**/SKILL.md`, `.github/skills/**/SKILL.md` |
| Specialized agents | Named agent roles with focused instructions and tool limits | Separate planning, coding, testing, security, and review work | `.cursor/agents/**`, `.github/agents/**`, `.claude/agents/**`, `.codex/agents/**`, `*.agent.md` |
| Commands and prompt files | Reusable slash commands or prompt templates | Standardize repeated human-invoked workflows | `.github/prompts/*.prompt.md`, `.cursor/commands/**`, `.claude/commands/**`, `.windsurf/workflows/**` |
| MCP and tool manifests | Configurations that connect agents to external tools/data | Give agents controlled access to systems beyond repo files | `.cursor/mcp.json`, `.mcp.json`, `.vscode/mcp.json`, `.codex/config.toml`, `.claude/settings*.json` |
| Hooks | Scripts or HTTP calls triggered at agent lifecycle events | Enforce deterministic safety and quality checks | `.cursor/hooks.json`, `.github/hooks/*.json`, `.claude/settings*.json`, `.codex/config.toml` |
| Validation and reproducibility | Commands/environments that prove work is correct | Make agent output testable and repeatable | CI workflows, `Makefile`, `justfile`, package scripts, Docker, devcontainer |
| Governance and observability | Ownership, policy, review, audit, and metrics | Scale agent use safely across many repos | managed settings, allowlists, dashboards, logs, telemetry |
| Domain context | Architecture decisions, contracts, examples, fixtures, glossary | Give agents the business and architectural context that code alone lacks | `docs/adr/**`, `docs/glossary.md`, `contracts/**`, `examples/**`, `fixtures/**` |

---

## 2. Maturity levels

### Level 0 - Fragile

**Meaning:** Agents operate mostly from ad hoc prompts and whatever they infer from code.

Common symptoms:

- No agent-specific context files.
- Setup and validation commands are tribal knowledge.
- Agents repeatedly make the same mistakes.
- No clear policy on secrets, generated files, migrations, or production systems.
- No review process for AI-generated changes beyond normal human correction.

**Typical score:** 0-39.

### Level 1 - Baseline agent-ready

**Meaning:** The repo gives agents a usable starting point.

Expected artifacts:

- Root `AGENTS.md` or equivalent persistent guidance file.
- Exact setup, build, lint, test, and typecheck commands.
- Basic repo overview and architecture boundaries.
- Safety notes for secrets, generated code, migrations, and production systems.
- Links to canonical docs rather than large pasted documentation.

**Typical score:** 40-59.

### Level 2 - Defined and scoped

**Meaning:** Guidance is no longer a single global prompt. It is scoped by path, framework, or task.

Expected artifacts:

- Cursor project rules in `.cursor/rules/` for Cursor-heavy teams.
- Copilot/VS Code path-specific instructions if those tools are used.
- Tool-specific files such as `CLAUDE.md` or `GEMINI.md` only where relevant.
- Validation commands aligned to CI.
- Ownership or review path for agent-context files.

**Typical score:** 60-74.

### Level 3 - Operational

**Meaning:** Agents can execute common workflows with moderate independence and reliable validation.

Expected artifacts:

- Skills for repeated tasks such as debugging, test repair, release, migrations, dependency upgrades, API endpoint creation, and PR review.
- Specialized agents for verification, test running, security review, debugging, or migration planning.
- Prompt files or commands for repeated human-invoked workflows.
- MCP/tool configs only where there is a legitimate external-data need.
- CI that validates normal agent outputs and checks at least some agent assets.
- Domain context such as ADRs, contracts, examples, fixtures, or test templates.

**Typical score:** 75-89.

### Level 4 - Managed and governed

**Meaning:** The repo is safe for scaled, team-wide, multi-agent, and background-agent work.

Expected artifacts and practices:

- Hooks, sandboxing, deny rules, approvals, and least-privilege tool controls.
- Approved MCP registry or allowlist where MCP is used.
- Review controls for AI-context files.
- CI linting for rules, skills, hooks, MCP configs, and frontmatter.
- Observability through logs, analytics, audit events, or telemetry where appropriate.
- Periodic context review and scorecard refresh.
- Agent smoke tests or evals that prove an unfamiliar agent can set up, make a safe change, validate it, and summarize work.

**Typical score:** 90-100.

---

## 3. Core components

### 3.1 Persistent guidance files

**What they are**

Persistent guidance files are the durable instructions an AI agent should read before working in a repo. They should explain what the repo is, how to set it up, how to validate changes, what architecture patterns to preserve, and what not to touch.

`AGENTS.md` is the strongest portable baseline. The public AGENTS.md format describes it as a "README for agents," separate from the human-facing README, and recommends including build steps, tests, conventions, and security considerations. It is standard Markdown with no required fields. [1] OpenAI Codex reads `AGENTS.md` files before work and layers global, root, and nested project guidance. [2] GitHub Copilot supports repository-wide instructions, path-specific instructions, and `AGENTS.md`; Copilot uses the nearest `AGENTS.md` in the directory tree for agent instructions. [3] Claude Code reads `AGENTS.md` as project instructions without an import or setting, but only when no `CLAUDE.md`, `.claude/CLAUDE.md`, or `CLAUDE.local.md` is present; if one is, Claude reads only the `CLAUDE.md` files unless they import `@AGENTS.md`. [15] Codex also honors `AGENTS.override.md` for local overrides. [2] The AGENTS.md format is now stewarded by the Agentic AI Foundation under the Linux Foundation. [1] Root `.cursorrules` may satisfy the persistent guidance requirement for older Cursor-enabled repos, but it is deprecated and should be renamed or consolidated into root `AGENTS.md`.

**Manager takeaway**

Every active repo should have one canonical machine-readable starting point. For most teams, use `AGENTS.md` for that baseline. Tool-specific files such as `CLAUDE.md`, `GEMINI.md`, or `.github/copilot-instructions.md` can supplement it when those tools are used, but they should not contain conflicting guidance. Treat root `.cursorrules` as legacy guidance to migrate, not as the preferred end state.

**What good looks like**

A good persistent guidance file:

- Is short enough to stay useful. Always-on guidance competes with task context on every request; small local models lose accuracy after roughly 1-2K tokens of context, so Local score profiles enforce a token budget (Section 6.1).
- Contains only guidance an agent cannot infer from the code itself.
- Keeps volatile content (dates, generated sections) out of always-on files so prompt caching stays effective.
- Lists exact setup, build, lint, test, typecheck, and verification commands.
- Names the primary language, framework, runtime, package manager, and test runner.
- Explains high-level architecture boundaries.
- Links to canonical docs instead of copying large docs.
- Identifies generated files, migrations, secrets, production systems, and risky workflows.
- Tells the agent how to know when work is done.

**What bad looks like**

A poor guidance file:

- Says only "write clean code" or "follow best practices."
- Omits validation commands.
- Conflicts with README, CI, or tool-specific rules.
- Contains large pasted documentation unrelated to most tasks.
- Tells agents to do work that the repo cannot actually support locally.
- Has no owner or review process.

**Example root `AGENTS.md`**

```md
# AGENTS.md

## Repository overview
This repo contains the customer billing API and admin dashboard.

## Setup
- Install dependencies: `pnpm install`
- Start local services: `docker compose up -d postgres redis`
- Run the app: `pnpm dev`

## Validation
Before opening a PR, run:
- `pnpm lint`
- `pnpm test`
- `pnpm typecheck`

## Architecture rules
- API routes live in `apps/api/src/routes`.
- Business logic belongs in `apps/api/src/services`.
- Database access must go through `apps/api/src/db`.
- Do not put SQL directly in route handlers.

## Safety rules
- Never edit files under `generated/`.
- Never commit secrets, tokens, or `.env` files.
- Ask before changing database migrations that have already shipped.

## Useful references
- Architecture overview: `docs/architecture.md`
- Local development guide: `docs/dev-setup.md`
- API conventions: `docs/api-conventions.md`
```

**Scanner checks**

- Root `AGENTS.md` exists, or root `.cursorrules` exists as deprecated persistent guidance.
- Contains setup command(s).
- Contains validation command(s).
- Contains safety boundaries.
- Contains architecture or ownership pointers.
- File is concise and not an unbounded documentation dump.
- Root `.cursorrules`, when present, is flagged for consolidation into root `AGENTS.md`.
- Nested `AGENTS.md` files exist for major packages/subtrees if the repo is a monorepo or multi-service repo.
- Tool-specific guidance files do not conflict with `AGENTS.md`.
- A root `CLAUDE.md` that coexists with `AGENTS.md` imports it (`@AGENTS.md`); otherwise Claude Code ignores `AGENTS.md`.
- `CLAUDE.local.md`, when present, is gitignored.

**Nested guidance applicability**

Nested `AGENTS.md` files are expected only when the repository contains meaningful sub-project boundaries. The scanner can inventory nested guidance, but the LLM agent should decide applicability from the repo shape before treating missing nested files as a gap.

Treat nested `AGENTS.md` as expected when top-level or major subtree directories behave like distinct projects or services, especially when they have their own manifest, README, runtime, validation commands, ownership, or architecture boundaries. Examples include `webService/` and `dataService/` directories with separate `package.json` and `readme.md` files.

Treat nested `AGENTS.md` as not applicable for simple single-project repos, even when they contain normal source directories such as `src/`, `lib/`, `test/`, `docs/`, or `scripts/`. Do not grade those repos down for having zero nested `AGENTS.md` files.

---

### 3.2 Scoped rules

**What they are**

Scoped rules are instructions that apply only in certain contexts: a directory, language, framework, package, file type, or task. They prevent a single global instruction file from carrying every rule for every part of the codebase.

Cursor's rules documentation describes persistent instructions through Project, Team, and User Rules plus `AGENTS.md`. [4] GitHub Copilot supports repository-wide custom instructions and path-specific `.instructions.md` files under `.github/instructions`. [3] VS Code's AI customization docs recommend targeted rules, prompt files, custom agents, skills, MCP servers, and hooks as separate customization layers. [9]

**Manager takeaway**

For Cursor-heavy teams, `.cursor/rules/` is the primary Cursor-native maturity signal. For Copilot/VS Code users, `.github/instructions/*.instructions.md` is the analogous path-specific signal. A mature repo uses rules to scope guidance instead of putting every rule into `AGENTS.md`.

**Common scan targets**

```text
.cursor/rules/**/*.md
.cursor/rules/**/*.mdc
.github/copilot-instructions.md
.github/instructions/**/*.instructions.md
.claude/rules/**/*.md
```

**Good scoped rules**

- Focus on one concern.
- Use frontmatter or path metadata where supported.
- Apply to meaningful globs, packages, or file types.
- Include concrete examples and anti-patterns.
- Reference canonical docs, examples, fixtures, or ADRs.
- Avoid repeating what linters and formatters already enforce.

**Example Cursor project rule**

```md
---
description: API service conventions for backend routes and services
globs: "apps/api/src/**/*.ts"
alwaysApply: false
---

# API service conventions

- Route handlers should validate input and delegate to service functions.
- Do not put database queries directly in route files.
- Use `AppError` with a stable `code` field for expected failures.
- Add or update tests in `apps/api/src/**/*.test.ts` when behavior changes.
- For new endpoints, update `docs/api.md`.
```

**Quality risks**

- A single giant always-on rule for the entire repo.
- Vague descriptions that prevent the model from selecting the rule correctly.
- Duplicate or conflicting rules across `.cursorrules`, `.cursor/rules/`, `AGENTS.md`, and tool-specific files.
- Stale framework guidance, such as rules requiring old patterns after a framework migration.

**Scanner checks**

- `.cursor/rules/` exists for Cursor-heavy repos.
- Rules are scoped by path, language, or framework where possible.
- Rules contain actionable, specific guidance.
- Rule files are small enough to be useful.
- Legacy `.cursorrules` files are flagged for review if they coexist with `.cursor/rules/`.
- Rule files have a documented review path.

---

### 3.3 Skills

**What they are**

Skills are reusable workflow packages. A skill usually contains a `SKILL.md` file plus optional scripts, references, examples, templates, or assets. Skills are meant for procedures: "how to debug this service," "how to add an endpoint," "how to prepare release notes," or "how to update a contract."

Cursor describes Agent Skills as an open standard for packaging reusable knowledge and scripts. [5] OpenAI Codex documents skills as directories with required `SKILL.md` files plus optional `scripts/`, `references/`, `assets/`, and `agents/`; Codex uses progressive disclosure so it initially loads skill names/descriptions and reads the full skill only when selected. [22] VS Code says Agent Skills are folders of instructions, scripts, and resources that GitHub Copilot can load when relevant and that the standard is portable across multiple agents. [11] Claude Code also uses `SKILL.md` packages and recommends skills when repeated instructions or multi-step procedures outgrow persistent memory files. [13] The Agent Skills specification requires `name` (which must match the parent directory name) and `description`. [29] Codex reads project skills from both `.agents/skills` and `.codex/skills`; Gemini CLI reads `.gemini/skills` or the `.agents/skills` alias. [22, 20] `.agents/skills` is the most portable location across agents, including agents run on local models.

**Manager takeaway**

Persistent guidance tells agents what is generally true. Skills tell agents how to perform recurring work. A repo with only an instructions file is baseline; a repo with well-designed skills is operational.

**Common scan targets**

```text
.agents/skills/**/SKILL.md
.cursor/skills/**/SKILL.md
.claude/skills/**/SKILL.md
.codex/skills/**/SKILL.md
.gemini/skills/**/SKILL.md
.github/skills/**/SKILL.md
```

**Good skills**

- Have a clear `name` that matches the skill directory, and a `description`.
- State when to use the skill and when not to use it.
- Include exact steps, inputs, outputs, and validation.
- Move long reference material into supporting files.
- Use scripts only when deterministic behavior is better than instructions.
- Avoid side effects unless the skill is explicitly human-invoked.

**Example skill**

```md
---
name: debug-api-service
description: Use when debugging failing API tests, local API startup failures, or unexpected 500 errors.
paths:
  - "apps/api/**"
---

# Debug API Service

## When to use
Use this skill when:
- API tests fail
- The local API does not start
- A route returns 500 unexpectedly
- Database or Redis setup appears broken

## Procedure
1. Confirm services are running:
   - `docker compose ps`
2. Run focused tests:
   - `pnpm --filter api test -- --runInBand`
3. Check API logs:
   - `pnpm --filter api logs`
4. If database state is suspect:
   - `pnpm --filter api db:migrate`
   - `pnpm --filter api db:seed`

## Common pitfalls
- Do not run production migration commands.
- Do not edit generated ORM files.
- Prefer fixing root cause over updating snapshots.
```

**Recommended skill directory shape**

```text
.cursor/skills/debug-api-service/
  SKILL.md
  scripts/
    collect-api-diagnostics.sh
  references/
    local-db-guide.md
    test-fixtures.md
  assets/
    env-template.example
```

**Scanner checks**

- At least one `SKILL.md` exists in production repos where recurring workflows are known.
- `SKILL.md` includes `name` and/or `description` where supported.
- Description uses natural trigger language.
- Supporting scripts/references/assets exist where useful.
- Scripts are safe, reviewed, and executable.
- Side-effecting skills are manual-only or clearly gated.

---

### 3.4 Specialized agents and subagents

**What they are**

Specialized agents are named roles with focused instructions, tool access, and sometimes model preferences. They are useful when a task benefits from isolation, independent review, or parallelism.

VS Code custom agents are `.agent.md` files that define a persona, tools, instructions, and optional handoffs; the docs recommend read-only tools for planning agents and least-privilege tool access for security-sensitive workflows. [10] Claude Code project subagents live in `.claude/agents/`, use Markdown plus YAML frontmatter, and can define `tools`, `disallowedTools`, model, permission mode, MCP servers, skills, hooks, background execution, and isolation. [16] Codex supports subagent workflows by spawning specialized agents in parallel; project agent roles are TOML files in `.codex/agents/`. [24] Gemini CLI project subagents live in `.gemini/agents/*.md`. [20] Cursor also documents subagents for specialized AI workflows and context management. [6]

**Manager takeaway**

Do not create a dozen generic "helper" agents. Start with a few high-value roles: verifier, test-runner, security-auditor, debugger, migration-planner, and docs-reviewer. Restrict tools where possible.

**Common scan targets**

```text
.cursor/agents/**/*.md
.github/agents/**/*.md
.claude/agents/**/*.md
.codex/agents/**/*.toml
.gemini/agents/**/*.md
*.agent.md
```

**Example verifier agent (Cursor frontmatter; in Claude Code use `tools` or `disallowedTools` instead of `readonly`)**

```md
---
name: verifier
description: Validates completed work after implementation. Use before merge or before declaring a task done.
model: inherit
readonly: true
---

You are a skeptical validator.

When invoked:
1. Identify what the implementation claims to have completed.
2. Inspect the actual code changes.
3. Run the relevant validation commands.
4. Check edge cases, integration points, and missing tests.
5. Report:
   - What passed
   - What is incomplete or risky
   - What must be fixed before merge

Do not accept implementation claims at face value. Verify them.
```

**Recommended starter agents**

- `verifier` - confirms the task is actually complete.
- `test-runner` - runs focused validation and interprets failures.
- `security-auditor` - reviews auth, secrets, injection, data exposure, and dependency risk.
- `debugger` - investigates failing tests or runtime errors.
- `migration-planner` - plans risky schema or framework changes before editing.
- `docs-reviewer` - checks docs, examples, and API contract updates.

**Scanner checks**

- Agent files have clear names and descriptions.
- Agents are task-specific rather than generic.
- High-risk agents use read-only or restricted tools when possible.
- Security/review/test agents are not allowed unnecessary write/network access.
- Agent files are version-controlled and reviewed.

---

### 3.5 Commands, prompt files, and reusable workflows

**What they are**

Prompt files and commands are reusable prompts for human-invoked workflows. They are good for tasks that are repeated but do not require a full reusable skill or specialized agent.

VS Code's customization model includes prompt files for common workflows, custom instructions, custom agents, skills, MCP servers, and hooks. [9] VS Code custom agents documentation distinguishes custom agents from prompt files and skills: use custom agents for persistent personas/tool restrictions, prompt files for one-off tasks, and skills for portable workflows with scripts/resources. [10] Claude Code has merged custom commands into skills; existing `.claude/commands/` files keep working. [13] VS Code now deprecates prompt files for Agent Host sessions and provides a migration to agent skills; `.chatmode.md` files should be renamed to `.agent.md`. [9, 10]

**Manager takeaway**

Commands and prompt files are useful, but they should not be mandatory for every repo. Treat them as a legacy workflow signal: they earn partial credit, and repos should migrate them to skills.

**Common scan targets**

```text
.github/prompts/**/*.prompt.md  (legacy)
.cursor/commands/**
.claude/commands/**/*.md
.gemini/commands/**
.windsurf/workflows/**/*.md
prompts/**
```

**Example prompt file**

```md
---
name: pr-review
description: Review current branch for correctness, tests, docs, and risk before PR.
agent: agent
tools: ["codebase", "terminal"]
---

Review the current branch against `main`.

Check:
1. Functional correctness
2. Test coverage
3. Security-sensitive changes
4. Missing docs
5. Backward compatibility

Run the relevant tests if possible.

Return:
- Summary
- Risks
- Required fixes
- Suggested PR description
```

**Scanner checks**

- Prompt files or commands exist for repeated workflows.
- They reference rules/skills/docs instead of duplicating standards.
- They do not conflict with persistent guidance.
- They include expected output format.
- They are documented in README or `AGENTS.md`.

---

### 3.6 MCP and tool manifests

**What they are**

MCP, the Model Context Protocol, is an open standard for connecting AI assistants to external systems such as content repositories, business tools, development environments, databases, and APIs. Anthropic introduced MCP as a standard for secure two-way connections between data sources and AI-powered tools. [21]

Cursor documents MCP as a way to connect Cursor to external tools and data sources. [8] Claude Code supports project-scoped `.mcp.json` files that can be checked into version control, plus managed MCP controls, allowlists, and denylists for organizations. [18] Codex stores MCP and sandbox/approval configuration through `config.toml` layers. [23] The current MCP specification version is 2026-07-28, which removes the initialization handshake and tightens authorization validation; its security best practices cover local server compromise and token passthrough. [30]

**Manager takeaway**

MCP is powerful but not required in every repo. It should be used when agents need legitimate access to external tools or data. If MCP is present, it must be governed like any other automation access path.

Score this category as neutral when the repo shows no external-system need: a missing MCP file is not a gap. Vendor guidance is to add MCP when a need appears and only from trusted sources. [18, 9] MCP configuration can also live outside the repo (for example, GitHub cloud-agent repository settings) or inside plugins. Each MCP server's tool schemas also consume context, which matters most for small local models.

**Common scan targets**

```text
.cursor/mcp.json
.vscode/mcp.json
.mcp.json
.codex/config.toml
.gemini/settings.json
.claude/settings*.json
```

**Example MCP config**

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github@1.2.3"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "internal-docs": {
      "url": "https://mcp.example.com/docs",
      "headers": {
        "Authorization": "Bearer ${INTERNAL_DOCS_TOKEN}"
      }
    }
  }
}
```

**MCP quality checks**

Good MCP configuration:

- Has a clear reason for each server.
- Uses approved servers or an approved internal registry.
- Externalizes secrets through environment variables or a secret manager.
- Uses least-privilege tokens.
- Pins executable package versions in production paths.
- Separates read-only and write-capable tools.
- Requires approval for risky operations.
- Has an owner and review process.

Risky MCP configuration:

- Hardcodes API keys, tokens, database URLs, or credentials.
- Uses broad personal access tokens.
- Runs arbitrary local packages with floating versions in production contexts.
- Connects to unapproved external servers.
- Gives agents write access to production systems without approvals.
- Has no documented owner.

**Scanner checks**

- MCP config exists only where there is a use case; absence is neutral when no external need exists.
- No hardcoded secrets.
- Server purpose is documented.
- Executable dependencies are pinned or otherwise controlled.
- Dangerous tools are approval-gated.
- Config has a documented security review path.

---

### 3.7 Hooks, permissions, and sandboxing

**What they are**

Hooks are deterministic actions that run at lifecycle events, such as before a tool call, after a file edit, or when an agent stops. They can block unsafe commands, run formatters, scan for secrets, log tool use, or require approvals.

VS Code describes hooks as a way to run shell commands at lifecycle points, such as running a formatter after file edits or enforcing security policies. [9] Claude Code hooks receive structured JSON input, can return decisions or messages, and respect managed settings hierarchy. [17] Codex supports sandbox modes `read-only`, `workspace-write`, and `danger-full-access`, and approval policies such as `untrusted`, `on-request`, `never`, and `granular` (`on-failure` is now an alias of `on-request`). Codex also loads project hooks from `.codex/hooks.json`. [25] Gemini CLI configures hooks in `.gemini/settings.json`. [20] Claude Code settings define managed, user, project, and local scopes, with managed settings used for organization-wide security and compliance. [14]

**Manager takeaway**

Instructions ask the model to behave. Hooks and sandbox settings enforce behavior. Critical repos should not rely only on model compliance.

**Common scan targets**

```text
.cursor/hooks.json
.github/hooks/**/*.json
.claude/settings.json
.claude/settings.local.json
.codex/config.toml
.codex/hooks.json
.gemini/settings.json
```

`.codex/requirements.toml` is read from system or MDM locations by administrators; treat it as governance evidence, not a repo file.

**Example hook config**

```json
{
  "version": 1,
  "hooks": {
    "preToolUse": [
      {
        "matcher": "bash",
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/deny-dangerous-bash.sh"
          }
        ]
      }
    ],
    "postToolUse": [
      {
        "matcher": "edit|write",
        "hooks": [
          {
            "type": "command",
            "command": "./scripts/run-format-and-static-checks.sh"
          }
        ]
      }
    ]
  }
}
```

**Good hook use cases**

- Block destructive shell commands.
- Block production database writes.
- Run formatting or static checks after edits.
- Scan changed files for secrets.
- Log tool usage for audit.
- Require approvals for external network calls or risky MCP tools.
- Re-inject critical context before compaction where supported.

**Bad hook use cases**

- Complex business logic that should live in normal code or CI.
- Hidden behavior that developers cannot inspect.
- Hooks that mutate files in surprising ways.
- Hooks that fail open silently in high-risk repos.

**Scanner checks**

- Critical repos have hooks or equivalent deterministic controls.
- Hook commands exist and are executable.
- Hook configs are valid JSON/TOML/YAML.
- Hooks are reviewed and version-controlled.
- Hooks fail safely.
- Security hooks cannot be trivially bypassed.

---

### 3.8 Validation, reproducibility, and CI

**What they are**

Validation is the set of commands and gates that prove a change is correct. Reproducibility is the ability for agents, humans, and CI to run those commands in a predictable environment.

GitHub's Copilot documentation explicitly recommends adding build and validation information to repository instructions so agents can understand how to build, test, and validate changes. [3] Codex and Claude both expose sandbox, approval, settings, and tooling controls that make deterministic validation and policy enforcement practical. [14, 23, 25]

**Manager takeaway**

An agent-ready repo must answer: "How does the agent prove it is done?" If the answer is vague, the repo is not operationally mature.

**Common scan targets**

```text
AGENTS.md
.github/copilot-instructions.md
.cursor/rules/**
Makefile
justfile
package.json
pyproject.toml
pom.xml
build.gradle
Cargo.toml
go.mod
Dockerfile
docker-compose.yml
.devcontainer/**
.github/workflows/**
```

**Good validation guidance**

- Exact command names.
- Narrow and full validation commands.
- Preconditions and environment setup.
- Expected failure modes and workarounds.
- CI job names that match local commands.
- Guidance for when tests are unavailable or flaky.
- A narrow test command (single file or package), not only the full suite. Small local models benefit most from fast, focused feedback.
- Cloud-agent environment setup where cloud agents are used: `.github/workflows/copilot-setup-steps.yml` for Copilot, setup scripts or SessionStart hooks for Claude Code on the web, or a devcontainer. [31, 32]

**Example validation section**

```md
## Validation

Use the narrowest relevant check first, then run the full suite before PR.

- Typecheck API: `pnpm --filter api typecheck`
- Unit tests API: `pnpm --filter api test`
- Lint all packages: `pnpm lint`
- Full CI-equivalent check: `pnpm verify`

If a test requires local services, start them with:
- `docker compose up -d postgres redis`
```

**Scanner checks**

- Exact validation commands exist in persistent guidance.
- Commands correspond to real scripts or CI jobs.
- Local environment setup is documented.
- CI workflow exists for production repos.
- Repos with complex setup include Docker, devcontainer, Makefile, justfile, or equivalent reproducibility support.
- Environment setup is hard for agents without help (state-of-the-art success on the EnvBench setup benchmark is under 30%), so reproducible setup earns meaningful credit. [33]

---

### 3.9 Governance, observability, and ownership

**What they are**

Governance is how an organization controls and improves agent behavior over time. Observability is how teams see what agents did, what context they used, and what policies fired.

Claude Code settings distinguish managed, user, project, and local scopes; managed scope is intended for security policies and compliance requirements that must be enforced organization-wide. [14] Claude Code also supports OpenTelemetry configuration for centralized metrics/log export. [19] Codex managed configuration can constrain allowed approval policies and sandbox modes through managed requirements. [25]

**Manager takeaway**

Agent context files are operational configuration. Treat them like code: version them, review them, scan them, and measure whether they help.

**Governance controls**

- Quarterly review of persistent guidance and high-use rules.
- Approved MCP registry or allowlist.
- Managed settings for critical security and compliance controls.
- CI checks for agent artifact syntax and unsafe patterns.
- Exceptions process for repos that intentionally do not implement specific controls.

**Observability signals**

- Agent-generated PR merge/reject/revert rate.
- Repeated agent failure categories.
- Hook blocks and approvals.
- MCP tool usage.
- Time from agent PR creation to human merge.
- CI failure patterns on AI-assisted work.
- Context score drift over time.

**Scanner checks**

- Agent asset changes require review.
- Managed policy files exist where relevant.
- Audit/logging path exists for critical repos.
- Repo has a documented review cadence.

---

### 3.10 Domain context: ADRs, contracts, examples, and fixtures

**What they are**

Domain context tells the agent why the system is built the way it is. Code shows implementation; domain context explains decisions, boundaries, terminology, and real-world examples.

**Manager takeaway**

Agents often follow examples better than abstract prose. Production repos should give agents canonical examples, test templates, API contracts, and decision records.

**High-value artifacts**

```text
docs/adr/**
docs/architecture.md
docs/glossary.md
docs/api-conventions.md
contracts/**
openapi/**
graphql/**
proto/**
examples/**
fixtures/**
templates/**
```

**Examples of useful domain context**

- ADRs explaining settled decisions.
- A glossary distinguishing domain terms.
- OpenAPI/GraphQL/protobuf contracts for produced and consumed APIs.
- Canonical request/response examples.
- Test templates that show the preferred structure.
- Migration playbooks.
- Approved dependency lists.

**Microservice contract hygiene**

For repos that depend on other services, the agent cannot safely infer external systems from local code alone. Mature microservice repos should keep machine-readable produced and consumed contracts in the repo.

```text
contracts/
  produced/
    orders.openapi.yaml
  consumed/
    payments.openapi.yaml
    inventory.graphql
    billing.proto
```

`AGENTS.md` should state where each contract comes from, what version it represents, and how to refresh it.

**Scanner checks**

- Production service has produced contract files where applicable.
- Consumed contracts are vendored or otherwise discoverable where applicable.
- Generated code directories are identified as do-not-edit.
- ADRs are linked from guidance/rules when they affect implementation.
- Examples and fixtures are referenced from rules or skills.

---

## 4. Tool-specific mapping

| Tool ecosystem | Persistent guidance | Scoped rules | Skills | Agents/subagents | MCP/tool config | Hooks/settings |
|---|---|---|---|---|---|---|
| Cursor | `AGENTS.md` plus Cursor rules; root `.cursorrules` is deprecated legacy guidance | `.cursor/rules/**` (`.mdc` with `description`, `alwaysApply`, `globs`) | `.cursor/skills/**/SKILL.md`, `.agents/skills/**/SKILL.md` | `.cursor/agents/**` | `.cursor/mcp.json` | `.cursor/hooks.json`, Cursor settings; plugins in `.cursor-plugin/plugin.json` |
| GitHub Copilot (github.com / cloud agent) | `.github/copilot-instructions.md`, `AGENTS.md`, root `CLAUDE.md` or `GEMINI.md` | `.github/instructions/*.instructions.md` (`applyTo`) | `.github/skills/**/SKILL.md` | `.github/agents/*.agent.md` | Repository settings (not a repo file) | `.github/hooks/*.json`; environment in `.github/workflows/copilot-setup-steps.yml` |
| VS Code | `.github/copilot-instructions.md`, `AGENTS.md` (nested files off by default), `CLAUDE.md` | `.github/instructions/*.instructions.md` | `.github/skills`, `.claude/skills`, `.agents/skills` | `.github/agents/*.agent.md`, `.claude/agents` (`.chatmode.md` is legacy) | `.vscode/mcp.json`, root `.mcp.json` | `.github/hooks/*.json`; Agent Plugins (`plugin.json`) |
| OpenAI Codex | `AGENTS.md`, nested `AGENTS.md`, `AGENTS.override.md` | Codex rules/config where used | `.agents/skills/**/SKILL.md`, `.codex/skills/**/SKILL.md` | `.codex/agents/*.toml` | `.codex/config.toml` (`[mcp_servers]`) | `.codex/hooks.json`, `.codex/config.toml`; `requirements.toml` is admin-managed |
| Claude Code | `CLAUDE.md`, `.claude/CLAUDE.md`, or `AGENTS.md` when no `CLAUDE.md` exists; `CLAUDE.local.md` (gitignored) | `.claude/rules/**` (`paths` frontmatter) | `.claude/skills/**/SKILL.md` (`.claude/commands` is legacy) | `.claude/agents/**` | `.mcp.json`, managed MCP | `.claude/settings*.json`, managed settings; plugins in `.claude-plugin/`; output styles in `.claude/output-styles/` |
| Gemini CLI | `GEMINI.md`, or `AGENTS.md` via `context.fileName` | Tool-specific settings/context hierarchy | `.gemini/skills/**/SKILL.md`, `.agents/skills` | `.gemini/agents/*.md` | `.gemini/settings.json` | Hooks in `.gemini/settings.json`; `.gemini/commands`; extensions (`gemini-extension.json`) |

Notes:

- `AGENTS.md` is the best portable baseline, but tool-native files still matter.
- Claude Code's native persistent context is `CLAUDE.md`; Gemini CLI's native context file is `GEMINI.md`. [15, 20]
- Avoid divergent truth. Prefer one canonical source and thin wrappers/imports where possible. A `CLAUDE.md` that exists alongside `AGENTS.md` should import it.
- Local-model agent harnesses (for example Codex, OpenCode, Goose, Roo Code, Cline, Crush, Zed, Qwen Code, Mistral Vibe) broadly read `AGENTS.md` and `.agents/skills`; hook, subagent, and path-scoped rule formats are mostly tool-specific.
- Windsurf mappings are not listed because current Windsurf/Devin documentation could not be verified for v2.0.

---

## 5. Required standards by repo class

### Every active repo

Required:

1. Root `AGENTS.md` or approved equivalent. Root `.cursorrules` counts as deprecated persistent guidance and should be migrated to `AGENTS.md`.
2. Exact setup, build, lint, test, and validation commands.
3. Safety section covering secrets, generated files, migrations, and production systems.
4. Links to canonical architecture, contribution, and testing docs where they exist.
5. CI or documented validation path.
6. Owner for AI-context files.

For Cursor-heavy teams, also require:

- `.cursor/rules/repo-basics.mdc` or equivalent Cursor project rule.

### Production repos

Required or strongly expected:

1. Scoped rules for primary language and framework.
2. At least one workflow skill for a repeated repo-specific task.
3. Verification or test-running agent where agents are expected to make code changes.
4. Prompt/command workflow for PR review or release where useful.
5. Domain context such as ADRs, contracts, examples, fixtures, or test templates.
6. CI alignment with documented validation commands.

### Critical or regulated repos

Required or strongly expected:

1. Security-auditor or verifier agent with restricted tools.
2. Hooks or equivalent deterministic controls.
3. Sandbox and approval defaults.
4. Approved MCP registry or allowlist if MCP is used.
5. Secret scanning for agent configs, scripts, and prompts.
6. Audit/logging path for agent actions where feasible.
7. Periodic agent smoke test.
8. Formal exception process for missing controls.

---

## 6. Scoring rubric

Score each repo out of 100. Use this score to prioritize remediation, not to punish teams for intentionally simple repos.

| Category | Weight | What to evaluate |
|---|---:|---|
| Persistent guidance | 12 | `AGENTS.md` or equivalent exists and is concise, accurate, and limited to non-inferable guidance: exact commands, safety boundaries, and pointers to canonical docs. Reward brevity; long always-on files and content an agent could infer from the code are quality risks. Claude Code reads `AGENTS.md` natively unless a `CLAUDE.md` shadows it without importing it; root `.cursorrules` counts as deprecated persistent guidance; nested guidance is expected only for multi-project or multi-service repos |
| Scoped rules | 8 | Cursor/Copilot/Claude path-scoped rules exist where useful, are actionable, and keep guidance out of always-on context |
| Skills | 10 | `SKILL.md` packages cover repeated workflows with clear triggers, a `name` matching the skill directory, and supporting files where useful; portable `.agents/skills` locations work across the most agents. Legacy prompt files and commands earn partial credit |
| Specialized agents | 6 | Verifier, test, security, debug, or other focused agents exist where useful and use least-privilege tools. Evidence for performance benefit is limited, so do not treat missing agents as a major gap for simple repos |
| Tool manifests and MCP | 6 | External tools are configured only where needed, secrets are externalized, and access is governed. Score as neutral (full or near-full credit) when the repo shows no external-system need; reduce the score only when an external need exists without governed access, or when MCP/tool configs are ungoverned, unpinned, or hold secrets |
| Validation and reproducibility | 15 | Agent-readable validation commands, including a narrow single-file or single-package test command, match real scripts/CI; the environment is reproducible through lockfiles, devcontainers, or cloud-agent setup such as `copilot-setup-steps.yml` or setup scripts |
| CI and PR automation | 10 | CI validates normal work and checks agent assets or AI-assisted PRs where appropriate |
| Security, sandboxing, and hooks | 12 | Hooks, deny rules, sandbox settings, approvals, and secret controls exist for risky workflows |
| Domain and decision context | 8 | ADRs, contracts, glossary, examples, fixtures, and templates are available and referenced |
| Governance and observability | 7 | Owners, review cadence, managed settings, logs, metrics, or dashboards exist where appropriate |
| Versioning and dependency provenance | 3 | Agent assets are version-controlled; executable MCP/hook/skill dependencies are pinned or governed |
| Onboarding and discoverability | 3 | README or equivalent tells humans where agent guidance, rules, skills, and workflows live |

These weights are the **Cloud** profile and the base scale that category judgments use.

### Health bands

| Score | Status | Interpretation |
|---:|---|---|
| 0-39 | Fragile | Agent behavior is mostly implicit, ad hoc, or person-dependent |
| 40-59 | Emerging | Some useful artifacts exist, but they are incomplete or not yet reliable controls |
| 60-74 | Operational | Agents can work productively with moderate safety and repeatability |
| 75-89 | Managed | Context, tools, validation, and governance are integrated into normal engineering workflow |
| 90-100 | Mature | Repo supports scalable, governed, observable, multi-agent operation |

### 0-5 scoring guidance per category

| Score | Meaning |
|---:|---|
| 0 | Absent |
| 1 | Present only in personal settings, stale files, or ad hoc docs |
| 2 | Shared in repo but generic, incomplete, or inconsistent |
| 3 | Defined, useful, and scoped for normal work |
| 4 | Enforced, reviewed, and aligned with CI or policy |
| 5 | Managed at org scale with observability, ownership, and measured effectiveness |

Use these levels as anchors for every category and scale them to the category's weight: a category scores roughly `weight × level ÷ 5` (for example, level 3 in a weight-10 category is about 6). Category-specific instructions take precedence, such as neutral credit for tool manifests when a repo has no external-system need, or not treating missing specialized agents as a major gap for simple repos.

### 6.1 Score profiles: Cloud and Local

Every scored repo gets a Cloud score and a score for each Local tier. All profiles reuse the same category judgments: each category contributes the same fraction of its weight, re-weighted per profile. Users choose which Local tier to display. Pick the tier by the model's **total** parameters, since that determines whether it fits in memory; models larger than about 35B total parameters, including large open-weight models, use the Cloud score.

| Category | Cloud | Local medium (~15-35B, incl. 30B-A3B/35B-A3B MoE) | Local small (~5-14B) | Local tiny (up to ~4B) |
|---|---:|---:|---:|---:|
| Persistent guidance | 12 | 20 | 21 | 22 |
| Validation and reproducibility | 15 | 20 | 22 | 24 |
| CI and PR automation | 10 | 8 | 8 | 8 |
| Security, sandboxing, and hooks | 12 | 10 | 10 | 10 |
| Skills | 10 | 10 | 8 | 6 |
| Scoped rules | 8 | 8 | 8 | 8 |
| Domain and decision context | 8 | 10 | 11 | 12 |
| Specialized agents | 6 | 2 | 1 | 0 (N/A) |
| Tool manifests and MCP | 6 | 4 | 3 | 2 |
| Governance and observability | 7 | 3 | 3 | 2 |
| Versioning and dependency provenance | 3 | 3 | 3 | 3 |
| Onboarding and discoverability | 3 | 2 | 2 | 3 |
| **Always-on guidance budget** | none | ~3,000 tokens | ~1,500 tokens | ~1,000 tokens |

**Always-on guidance budget.** Local profiles measure the guidance the configured AI tool loads into every session, for example `AGENTS.md`, `CLAUDE.md`, `alwaysApply` Cursor rules, un-scoped `.claude/rules`, and `applyTo: "**"` Copilot instructions. Token counts are approximate (characters / 4). Persistent guidance keeps full credit at or under the budget, declines linearly to half credit at twice the budget, and stays at half credit beyond that with a risk flag. A Local profile cannot reach Mature while over budget.

**Band constraints per profile.** Cloud applies all Mature constraints. Local profiles apply the reproducibility constraint and the guidance budget.

**Why the profiles differ.** Small local models degrade quickly as context grows, trail frontier models most on multi-turn tool use and long-horizon terminal work, and default to small context windows on consumer hardware; tool-specific layers are also read by fewer local harnesses. They gain the most from short guidance, exact commands, and concrete examples. These weights are a reasoned starting point, not yet calibrated; see Phase 6 in Section 12 and `docs/rubric-updates/freshness-research/2026-09-24-1602-freshness-research-cloud-vs-local-scoring.md`.

---

## 7. Automated scanning specification

### File existence patterns

```text
AGENTS.md
**/AGENTS.md
AGENTS.override.md
.cursorrules
CLAUDE.md
.claude/CLAUDE.md
CLAUDE.local.md
GEMINI.md
.github/copilot-instructions.md
.github/instructions/**/*.instructions.md
.github/prompts/**/*.prompt.md
.github/agents/**/*.md
.github/agents/**/*.agent.md
.github/skills/**/SKILL.md
.github/hooks/**/*.json
.cursor/rules/**/*.md
.cursor/rules/**/*.mdc
.cursor/skills/**/SKILL.md
.cursor/agents/**/*.md
.cursor/commands/**
.cursor/hooks.json
.cursor/mcp.json
.cursorignore
.cursorindexingignore
.agents/skills/**/SKILL.md
.claude/rules/**/*.md
.claude/skills/**/SKILL.md
.claude/agents/**/*.md
.claude/settings.json
.claude/settings.local.json
.mcp.json
.codex/config.toml
.codex/hooks.json
.codex/agents/**/*.toml
.codex/skills/**/SKILL.md
.gemini/settings.json
.gemini/skills/**/SKILL.md
.gemini/agents/**/*.md
.vscode/mcp.json
.claude-plugin/**
.cursor-plugin/plugin.json
plugin.json
.claude/output-styles/**
.claude/commands/**  (legacy)
.github/workflows/copilot-setup-steps.yml
.windsurf/workflows/**/*.md
.windsurf/skills/**/SKILL.md
.github/workflows/**/*.yml
.github/workflows/**/*.yaml
Makefile
justfile
.devcontainer/**
Dockerfile
docker-compose.yml
```

### Content quality checks

#### Persistent guidance

Pass signals:

- Contains exact setup/build/test/lint/typecheck commands.
- Contains repository overview.
- Contains architecture boundaries.
- Contains safety boundaries.
- Links to canonical docs.
- Is concise enough to be used.
- Root `.cursorrules` counts as persistent guidance when present, but is deprecated.
- Includes nested `AGENTS.md` coverage when the LLM agent determines the repo has meaningful sub-project or service boundaries.

Risk signals:

- Vague instructions only.
- Huge file with unrelated docs pasted in.
- Always-on guidance above the Local tier budget (Section 6.1).
- `CLAUDE.md` coexists with `AGENTS.md` without importing it.
- Dates or generated content in always-on guidance.
- No validation commands.
- Conflicts with CI or README.
- Multiple guidance files contradict each other.
- Root `.cursorrules` is present and should be renamed or consolidated into root `AGENTS.md`.
- Missing nested `AGENTS.md` coverage for a multi-project or multi-service repo, based on LLM repo-structure assessment.

Do not add a nested-guidance risk for single-project repos where nested `AGENTS.md` files would duplicate the root guidance.

#### Scoped rules

Pass signals:

- Uses path/glob/frontmatter metadata where supported.
- Rules are short, focused, and named clearly.
- References examples, fixtures, ADRs, or canonical docs.

Risk signals:

- One monolithic always-on rule.
- Stale framework guidance.
- Conflicting `.cursorrules` and `.cursor/rules` guidance.

#### Skills

Pass signals:

- `SKILL.md` includes name/description or equivalent trigger guidance.
- Procedure has clear steps and validation.
- Supporting files exist where useful.
- Scripts are reviewed and safe.

Risk signals:

- Skill description is too vague to trigger.
- Skill `name` does not match its directory.
- Unmigrated `.github/prompts/*.prompt.md` or `*.chatmode.md` files.
- Skill does something risky automatically.
- Skill contains long static reference material that should be moved to supporting files.

#### Specialized agents

Pass signals:

- Agents have focused responsibilities.
- Tool access is restricted for planning/review/security roles.
- Verifier or test-runner agent exists for production repos.

Risk signals:

- Generic agents with broad tools.
- Security agent has unnecessary write access.
- Agents are not version-controlled.

#### MCP and tool configs

Pass signals:

- No hardcoded secrets.
- Purpose documented.
- Servers are approved.
- Executable dependencies are pinned or governed.
- Risky operations require approval.

Risk signals:

- Unapproved external servers.
- Broad personal tokens.
- Floating package versions in production-executed paths.
- Write access to production systems without controls.

#### Hooks and sandboxing

Pass signals:

- Hooks are valid and executable.
- Hooks enforce deterministic checks.
- Sandbox and approval defaults are documented.
- Managed settings exist for critical constraints.

Risk signals:

- Hooks fail open silently.
- Dangerous commands are allowed without approval.
- Full access is the default for normal work.

#### Validation and reproducibility

Pass signals:

- Persistent guidance lists exact build, lint, typecheck, and test commands.
- A narrow test command (single file or package) exists alongside the full suite.
- Documented commands match real scripts, task runners, or CI jobs.
- Preconditions and environment setup are documented.
- Lockfiles, a devcontainer, Docker, a Makefile or justfile, or cloud-agent setup (such as `copilot-setup-steps.yml` or a SessionStart hook) make the environment reproducible.

Risk signals:

- No validation commands, or only vague instructions such as "run the tests".
- Documented commands that do not exist in scripts or CI.
- Only a slow full-suite command with no narrow option.
- Complex setup with no reproducibility support.
- Missing lockfiles for package managers that support them.

#### CI and PR automation

Pass signals:

- CI runs on push or pull request, not only manually.
- CI jobs run the same commands the guidance documents.
- CI checks agent assets (rules, skills, hook and MCP configs) where they exist.

Risk signals:

- No CI workflow for an active repo.
- Manual-only CI (`workflow_dispatch` only).
- CI and documented local commands disagree.
- AI-assisted changes bypass the normal review and CI path.

#### Domain and decision context

Pass signals:

- ADRs or decision records explain settled choices.
- A glossary or architecture doc defines domain terms and boundaries.
- Produced and consumed API contracts (OpenAPI, GraphQL, protobuf) are in the repo where the repo depends on other services.
- Canonical examples, fixtures, or test templates exist and are referenced from guidance, rules, or skills.
- Generated code directories are identified as do-not-edit.

Risk signals:

- Service dependencies with no contracts in the repo.
- Examples or ADRs exist but nothing points agents to them.
- Domain terms used inconsistently across docs and code.

Do not expect contracts or ADRs from small single-purpose repos where they would add no information.

#### Governance and observability

Pass signals:

- Agent context files have an owner (for example in CODEOWNERS).
- Changes to agent assets require review.
- A review cadence for guidance and high-use rules is documented.
- Managed settings or policy files exist where security or compliance requires them.
- An audit or logging path exists for critical repos.

Risk signals:

- No owner for agent context files.
- Stale guidance with no review process.
- Critical repo with no audit path for agent actions.

Scale expectations to the repo class (Section 5). A personal or low-risk repo is not penalized heavily for missing org-scale governance.

#### Versioning and dependency provenance

Pass signals:

- Agent assets (guidance, rules, skills, agents, hooks, MCP configs) are committed to the repo.
- Executable dependencies used by MCP servers, hooks, and skills are pinned to exact versions or governed through an approved registry.
- Hooks and skills reference scripts that live in the repo.

Risk signals:

- Agent behavior depends on personal or local settings not in the repo.
- Floating versions (`latest`, unpinned `npx`/`uvx` packages) in executed paths.
- Hooks that call external, unversioned scripts.

#### Onboarding and discoverability

Pass signals:

- README or equivalent tells humans where agent guidance, rules, skills, and workflows live.
- Contribution docs explain how to change agent assets.
- Directory layout makes agent assets easy to find.

Risk signals:

- Agent assets exist but nothing points to them.
- README contradicts the guidance files.

---

## 8. Recommended scanner output schema

```json
{
  "repo": "org/example-service",
  "default_branch": "main",
  "primary_language": "TypeScript",
  "agent_maturity_score": 78,
  "health_band": "Managed",
  "profile_scores": {
    "cloud": { "score": 78, "band": "Managed" },
    "local-medium": { "score": 71, "band": "Operational", "always_on_guidance_tokens": 2400 }
  },
  "artifacts": {
    "agents_md": true,
    "nested_agents_md_count": 2,
    "cursor_rules_count": 4,
    "skills_count": 2,
    "specialized_agents_count": 1,
    "prompt_files_count": 2,
    "hooks_present": true,
    "mcp_configs_count": 1
  },
  "quality_flags": [
    "AGENTS.md includes validation commands",
    "Cursor rules are scoped by path",
    "MCP config uses environment variables for secrets"
  ],
  "risk_flags": [
    "No agent context review cadence detected",
    "No security-auditor agent for a critical service"
  ],
  "recommended_next_actions": [
    "Add a documented review cadence for agent context files",
    "Add a read-only security-auditor agent",
    "Add CI linting for MCP and hook configs"
  ]
}
```

---

## 9. Gold-standard repo layout

This is illustrative. Do not force every repo to contain every file.

```text
repo/
  AGENTS.md
  README.md
  CONTRIBUTING.md

  .cursor/
    rules/
      repo-basics.mdc
      frontend.mdc
      backend.mdc
      migrations.mdc
    skills/
      debug-api-service/
        SKILL.md
        scripts/
          collect-diagnostics.sh
        references/
          api-debugging.md
      release-checklist/
        SKILL.md
    agents/
      verifier.md
      security-auditor.md
      debugger.md
    hooks.json
    mcp.json

  .github/
    copilot-instructions.md
    instructions/
      react.instructions.md
      api.instructions.md
    prompts/
      pr-review.prompt.md
      generate-tests.prompt.md
    workflows/
      ci.yml

  docs/
    architecture.md
    dev-setup.md
    testing.md
    api-conventions.md
    glossary.md
    adr/
      0001-use-fastify.md
      0002-contract-versioning.md

  contracts/
    produced/
      service.openapi.yaml
    consumed/
      payments.openapi.yaml

  examples/
  fixtures/
  docker-compose.yml
  package.json
  Makefile
```

---

## 10. Cursor-specific organizational standard

Because Cursor is the primary tool for many teams, use this practical baseline.

### Required in every active Cursor-enabled repo

1. `AGENTS.md`
2. `.cursor/rules/repo-basics.mdc` or equivalent
3. Exact validation commands
4. Safety section for generated files, secrets, migrations, and production systems
5. CI or equivalent validation path
6. Owner/reviewer for AI-context files

### Required in production Cursor-enabled repos

1. Scoped Cursor rules for primary language/framework.
2. At least one repo-specific skill for a recurring workflow.
3. `verifier` or `test-runner` agent where agents are expected to modify code.
4. Domain examples, fixtures, contracts, or ADRs as appropriate.

### Required in critical Cursor-enabled repos

1. Security reviewer or restricted verifier agent.
2. Hooks for dangerous command blocking, formatting/static checks, or secret scanning.
3. Approved MCP list if MCP is used.
4. Sandbox/approval defaults for high-risk operations.
5. Periodic context review and scorecard refresh.
6. Agent smoke test.

---

## 11. Common anti-patterns

### Context graveyard

Multiple old files exist and conflict: `.cursorrules`, `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, and random prompt files all say different things.

**Fix:** choose a canonical source, migrate stale content, and make tool-specific files thin wrappers or targeted complements.

### Prompt dumping

Large style guides, architecture docs, or old onboarding docs are pasted into always-on instructions.

**Fix:** keep persistent context concise. Link to docs. Move procedures into skills. Move path-specific rules into scoped rules.

### No validation path

The agent is told to "run tests," but no command is documented or the tests do not work locally.

**Fix:** add exact commands, preconditions, and CI mapping.

### Everything always-on

Every rule is loaded for every task, even when only one package or framework is relevant.

**Fix:** split rules by path, framework, or task.

### Untrusted MCP

MCP servers are added with broad tokens, hardcoded secrets, or unapproved external packages.

**Fix:** externalize secrets, approve servers, pin or govern executable dependencies, and use least privilege.

### Vague agents

Agents are named `helper`, `assistant`, or `coding-agent` with broad tools and no clear trigger.

**Fix:** define role-specific agents with clear responsibilities and tool restrictions.

### No feedback loop

Agents repeatedly make the same mistakes, but guidance is never updated.

**Fix:** convert repeated failures into scoped rules, skills, tests, hooks, or examples.

---

## 12. Rollout plan

### Phase 1 - Inventory

Scan all repos for the file patterns in Section 7. Produce an inventory with:

- Repo name
- Primary language/framework
- Existing agent artifacts
- Missing baseline artifacts
- Conflicting or deprecated artifacts
- MCP/security findings
- Current score and health band

### Phase 2 - Baseline

Add a minimal `AGENTS.md` template to every active repo. Keep it short and focused on commands, architecture boundaries, and safety.

### Phase 3 - Cursor rules

For Cursor-heavy repos, add `.cursor/rules/` with:

- repo basics
- language conventions
- framework conventions
- testing conventions
- generated code and migration rules

### Phase 4 - Skills and agents

Add skills and specialized agents only where there is repeated value:

- debugging
- test fixing
- release
- PR review
- security review
- service setup
- contract refresh
- dependency upgrade

### Phase 5 - Governance

Add:

- CI validation for JSON/TOML/YAML/frontmatter
- secret scanning for MCP/hook/skill files
- approved MCP allowlist
- quarterly context review
- org-level dashboard

### Phase 6 - Evaluation

For prioritized repos, run a periodic agent smoke test:

1. Start from a clean clone.
2. Ask an unfamiliar agent to summarize setup and validation.
3. Ask it to make a trivial safe change.
4. Ask it to run validation.
5. Ask it to summarize changes, risks, and commands run.
6. Score whether the repo enabled success without manual tribal context.

---

## 13. Starter templates

### 13.1 Minimal `AGENTS.md`

```md
# AGENTS.md

## Repository overview
Briefly describe what this repo does, its primary language/framework, and major packages or services.

## Setup
- Install dependencies: `<command>`
- Start local services: `<command>`
- Run locally: `<command>`

## Validation
Before declaring work complete, run:
- Lint: `<command>`
- Test: `<command>`
- Typecheck/build: `<command>`

## Architecture boundaries
- `<rule 1>`
- `<rule 2>`
- `<rule 3>`

## Safety boundaries
- Never commit secrets or `.env` files.
- Do not edit generated files under `<path>`.
- Ask before changing shipped migrations or production infrastructure.

## References
- Architecture: `<path>`
- Testing guide: `<path>`
- Contribution guide: `<path>`
```

### 13.2 Minimal Cursor rule

```md
---
description: Core repo conventions for all agent work
alwaysApply: true
---

# Core repo conventions

- Prefer minimal diffs.
- Use the package manager and commands documented in `AGENTS.md`.
- Do not edit generated files.
- Add or update tests when behavior changes.
- Run the relevant validation command before declaring work complete.
```

### 13.3 Minimal verifier agent

```md
---
name: verifier
description: Verify implemented work before merge or before declaring a task done.
readonly: true
---

You validate completed work. Inspect the changed files, identify the relevant validation commands, run or recommend the narrowest useful checks, and report remaining risks. Do not assume the implementation is correct.
```

### 13.4 Minimal skill

```md
---
name: fix-failing-tests
description: Use when tests fail after code changes and the user wants root-cause analysis and repair.
---

# Fix failing tests

1. Run the narrowest failing test command.
2. Identify whether the failure is product behavior, test setup, fixture drift, or snapshot drift.
3. Fix root cause before updating snapshots.
4. Re-run the focused test.
5. Report command output, fix summary, and remaining risks.
```

---

## 14. Source references

[1] AGENTS.md open format. https://agents.md/  
[2] OpenAI Codex - Custom instructions with AGENTS.md. https://developers.openai.com/codex/guides/agents-md  
[3] GitHub Docs - Adding repository custom instructions for GitHub Copilot. https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions  
[4] Cursor Docs - Rules. https://cursor.com/docs/rules  
[5] Cursor Docs - Agent Skills. https://cursor.com/docs/skills  
[6] Cursor Docs - Subagents. https://cursor.com/docs/subagents  
[7] Cursor Docs - Hooks. https://cursor.com/docs/hooks  
[8] Cursor Docs - Model Context Protocol. https://cursor.com/docs/mcp  
[9] Visual Studio Code Docs - Customize AI in VS Code. https://code.visualstudio.com/docs/copilot/customization/overview  
[10] Visual Studio Code Docs - Custom agents in VS Code. https://code.visualstudio.com/docs/copilot/customization/custom-agents  
[11] Visual Studio Code Docs - Use Agent Skills in VS Code. https://code.visualstudio.com/docs/copilot/customization/agent-skills  
[12] GitHub Docs - Adding agent skills for GitHub Copilot. https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills  
[13] Claude Code Docs - Extend Claude with skills. https://code.claude.com/docs/en/skills  
[14] Claude Code Docs - Settings. https://code.claude.com/docs/en/settings  
[15] Claude Code Docs - Memory. https://code.claude.com/docs/en/memory  
[16] Claude Code Docs - Create custom subagents. https://code.claude.com/docs/en/sub-agents  
[17] Claude Code Docs - Hooks reference. https://code.claude.com/docs/en/hooks  
[18] Claude Code Docs - Connect Claude Code to tools via MCP. https://code.claude.com/docs/en/mcp  
[19] Claude Code Docs - Monitoring. https://code.claude.com/docs/en/monitoring-usage  
[20] Gemini CLI Docs - Provide context with GEMINI.md files. https://geminicli.com/docs/cli/gemini-md/  
[21] Anthropic - Introducing the Model Context Protocol. https://www.anthropic.com/news/model-context-protocol  
[22] OpenAI Codex - Agent Skills. https://developers.openai.com/codex/skills  
[23] OpenAI Codex - Config basics. https://developers.openai.com/codex/config-basic  
[24] OpenAI Codex - Subagents. https://developers.openai.com/codex/subagents  
[25] OpenAI Codex - Sandbox and managed configuration. https://developers.openai.com/codex/concepts/sandboxing and https://developers.openai.com/codex/enterprise/managed-configuration  
[26] Galster et al. - Harness Engineering for Agentic AI Coding Tools: An Exploratory Study (originally "Configuring Agentic AI Coding Tools"). arXiv:2602.14690. https://arxiv.org/abs/2602.14690  
[27] Gloaguen et al. - Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents? arXiv:2602.11988. https://arxiv.org/abs/2602.11988  
[28] Lulla et al. - AGENTS.md and agent efficiency. arXiv:2601.20404. https://arxiv.org/abs/2601.20404  
[29] Agent Skills specification. https://github.com/agentskills/agentskills  
[30] Model Context Protocol specification 2026-07-28 and security best practices. https://github.com/modelcontextprotocol/modelcontextprotocol  
[31] GitHub Docs - Customizing the development environment for the Copilot cloud agent. https://github.com/github/docs  
[32] Claude Code Docs - Cloud environments. https://code.claude.com/docs/en/cloud-environments  
[33] JetBrains Research - EnvBench. https://github.com/JetBrains-Research/EnvBench  

Section 6.1 capability and context evidence (NoLiMa, RULER, BFCL v4, SWE-bench experiments, Terminal-Bench runs, Ollama context defaults) is cited in `docs/rubric-updates/freshness-research/2026-09-24-1602-freshness-research-cloud-vs-local-scoring.md`.
