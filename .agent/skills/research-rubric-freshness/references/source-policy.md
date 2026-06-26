# Freshness Source Policy

Use primary sources for currentness decisions:

- OpenAI docs for Codex, AGENTS.md, skills, sandboxing, and configuration.
- GitHub Docs for Copilot instructions, prompts, and repository automation.
- Cursor docs for rules, agents, skills, MCP, hooks, and settings.
- Anthropic docs for Claude Code agents, skills, hooks, MCP, and settings.
- Official package documentation or registries for dependency/version claims.

Rules:

- Browse before making current, latest, deprecated, or recommended-by-vendor claims.
- Include URL and checked date.
- Identify the exact claim being checked.
- For currentness or deprecation findings, cite at least one primary source.
- For vendor-specific claims, use that vendor's official docs or release notes unless unavailable.
- Record searched-but-not-found sources for unresolved claims.
- If a source is unavailable, mark the finding `needs-human-decision` or `needs-verification`.
- Prefer repo-local evidence only for local commands, paths, and scripts.
