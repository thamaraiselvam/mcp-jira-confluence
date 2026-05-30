# Jira & Confluence CLI — AI Agent Skill Setup

This repo ships a **portable agent skill** that teaches an AI coding agent how to drive the `mcp-jira-confluence` CLI — which command maps to which action (search, read, create, update, comment, transition), how credentials are read from the environment, the file-based Markdown contract, and what the CLI deliberately **cannot** do (no delete, no assign command, no account lookup).

- 📄 **File:** [`skills/jira-confluence-cli/SKILL.md`](../skills/jira-confluence-cli/SKILL.md)
- 🔗 **GitHub:** https://github.com/thamaraiselvam/mcp-jira-confluence/blob/main/skills/jira-confluence-cli/SKILL.md
- ⬇️ **Raw:** https://raw.githubusercontent.com/thamaraiselvam/mcp-jira-confluence/main/skills/jira-confluence-cli/SKILL.md

---

## Quick start — let your agent install it (no manual setup)

Instead of wiring the skill in by hand, paste this prompt into your AI coding agent (Claude Code, opencode, GitHub Copilot, Cursor, etc.). It fetches the file and installs it in the right place for whatever tool you're using:

```text
Fetch this skill file and install it as a reusable skill/instruction for the tool you are running in:
https://raw.githubusercontent.com/thamaraiselvam/mcp-jira-confluence/main/skills/jira-confluence-cli/SKILL.md

Steps:
1. Download the file's full contents.
2. Detect your environment and place it where that tool auto-loads instructions:
   - Claude Code / Claude Desktop → .claude/skills/jira-confluence-cli/SKILL.md
     (or ~/.claude/skills/jira-confluence-cli/SKILL.md for all projects)
   - opencode → save to skills/jira-confluence-cli/SKILL.md and add that path to the
     "instructions" array in opencode.json (create it if missing), or append the
     contents to AGENTS.md at the repo root
   - GitHub Copilot → save to .github/instructions/jira-confluence-cli.instructions.md
     with front matter `applyTo: "**"`, or paste into .github/copilot-instructions.md
   - Any other tool → add it to that tool's custom-instructions / rules / system-prompt location
3. Preserve the file's YAML front matter and contents verbatim.
4. Confirm it works by running: npx -y mcp-jira-confluence@latest --help
   (the CLI needs ATLASSIAN_URL, ATLASSIAN_EMAIL, ATLASSIAN_API_TOKEN in the environment).
Then tell me where you installed it and how to invoke it.
```

---

## Prerequisites

The skill drives the published CLI on demand via `npx` (no global install needed) — you only need these env vars in the shell the agent runs commands in:

```bash
export ATLASSIAN_URL="https://your-org.atlassian.net"
export ATLASSIAN_EMAIL="you@example.com"
export ATLASSIAN_API_TOKEN="<token>"   # https://id.atlassian.com/manage-profile/security/api-tokens
```

> Already working in **this** repo? Claude Code picks the skill up automatically (it's symlinked into `.claude/skills/`) — just ask, e.g. "create a Jira story…", or invoke `/jira-confluence-cli`.

---

## Manual installation (fallback)

If you'd rather wire it in yourself, the skill is **tool-agnostic** — it's a single Markdown file that any agent can consume. Each tool loads it differently:

### Claude Code / Claude Desktop (Agent Skills)

Claude discovers skills under a `skills/<name>/SKILL.md` layout inside `.claude/`. Point it at the shared file with a symlink (project-level shown; use `~/.claude/skills/` for all projects):

```bash
mkdir -p .claude/skills
ln -s ../../skills/jira-confluence-cli .claude/skills/jira-confluence-cli
```

This repo already includes that symlink, so Claude Code picks the skill up automatically — invoke it with `/jira-confluence-cli` or just ask "create a Jira story…". To use it elsewhere, copy the `skills/jira-confluence-cli/` folder into that project's `.claude/skills/` (or `~/.claude/skills/`).

### opencode

opencode loads extra instruction files listed in `opencode.json` (project root or `~/.config/opencode/`). Add the skill to the `instructions` array:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "instructions": ["skills/jira-confluence-cli/SKILL.md"]
}
```

Alternatively, append its contents to an `AGENTS.md` at the repo root, which opencode reads automatically.

### GitHub Copilot

Copilot reads repo custom instructions from `.github/`. Create a path-scoped instructions file that pulls in the skill:

```bash
mkdir -p .github/instructions
```

```markdown
---
applyTo: "**"
---
# Jira & Confluence CLI

See [skills/jira-confluence-cli/SKILL.md](../../skills/jira-confluence-cli/SKILL.md) for how to drive the `mcp-jira-confluence` CLI.
```

Save that as `.github/instructions/jira-confluence-cli.instructions.md`. For a simpler setup, paste the skill's contents into `.github/copilot-instructions.md` (applies to all Copilot Chat in the repo). In VS Code, ensure `github.copilot.chat.codeGeneration.useInstructionFiles` is enabled.

### Any other agent

The skill is plain Markdown — feed `skills/jira-confluence-cli/SKILL.md` into the agent's system prompt, rules file, or context however that tool supports custom instructions. Nothing in it is Claude-specific except the optional `/`-command invocation.
