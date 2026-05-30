---
name: jira-confluence-cli
description: Manage Jira issues and Confluence pages using the published `mcp-jira-confluence` npm package's one-shot CLI (invoked via `npx -y mcp-jira-confluence@latest <group> <command>`; no separate bin). Search, read, create, update, comment on, and transition Jira issues; search, read, create, update, comment on, and inspect Confluence pages — all from the terminal with Markdown input. USE FOR: jira cli, confluence cli, manage jira, manage confluence, search jira, search confluence, create jira issue, create confluence page, update jira issue, update confluence page, transition jira issue, add jira comment, add confluence comment, get jira issue, get confluence page, jira from terminal, confluence from terminal, run mcp-jira-confluence cli command. DO NOT USE FOR: deleting Jira/Confluence content (the CLI has no delete operations), Atlassian admin settings, bulk imports, attachment uploads, starting the MCP server.
license: MIT
metadata:
  author: thamaraiselvam
  version: "3.0.0"
---

# Jira & Confluence CLI Skill

Drive Jira and Confluence from the terminal using the published [`mcp-jira-confluence`](https://www.npmjs.com/package/mcp-jira-confluence) npm package. Its bundled CLI — reached through the package's single entry point (`npx -y mcp-jira-confluence@latest <group> <command>`) — wraps the same Jira/Confluence API layer as the MCP server, so every capability is available without starting a server.

The CLI is **read-heavy with controlled writes** — there are deliberately **no delete operations**. If the user asks to delete a page, issue, or comment, refuse and explain the CLI does not support destructive actions; suggest doing it manually in the Atlassian UI.

---

## Quick reference: which command for which action

Match the user's intent to a command here first, then jump to the detailed table for exact args. Commands are written in shorthand (`jira …` / `confluence …`); **run each through the CLI runner** — prepend `npx -y mcp-jira-confluence@latest` (see **Run** below). Set up **Credentials** before the first command.

### Jira

| The user wants to… | Command | Notes |
|---|---|---|
| Find / list / count issues | `jira search --jql '<JQL>'` | Use `--json` to parse keys for follow-ups. |
| Read one issue (summary, status, assignee, description, labels…) | `jira get-issue --issueIdOrKey KEY` | Returns core fields + description as text; does **not** return comments. |
| Create a story / bug / task / epic | `jira create-issue …` | `--description` is a **file path**. |
| Edit summary / priority / labels / any field | `jira update-issue --fields '{…}'` | JSON object of fields. |
| Edit or replace the description | `jira update-issue --descriptionFile body.md` | Markdown file → ADF. |
| **Assign / reassign / unassign** an issue | `jira update-issue --fields '{"assignee":"<accountId>"}'` | No `assign` command. `"assignee":null` unassigns. Needs an **account ID** (see caveats). |
| Change status / move through workflow | `jira get-transitions …` then `jira transition-issue …` | Always list transitions first — valid ones depend on current status. |
| See what statuses an issue can move to | `jira get-transitions --issueIdOrKey KEY` | |
| Comment on an issue | `jira add-comment --markdownBody note.md` | Body is a **file path**. |
| Edit an existing comment | `jira update-comment --commentId ID --markdownBody note.md` | Comment ID comes from the `add-comment --json` response (or the Atlassian UI) — there is no list-comments command. |

### Confluence

| The user wants to… | Command | Notes |
|---|---|---|
| Find / search pages | `confluence search --cql '<CQL>'` | Use `--json` to grab page IDs. |
| Read a page's content | `confluence get-page --pageId ID` | |
| Create a page (optionally under a parent) | `confluence create-page …` | `--markdownContent` is a **file path**; `--parentPageId` nests it. |
| Update / edit a page | `confluence update-page …` | `--markdownContent` is a **file path**. |
| Comment on a page | `confluence add-comment …` | Body is a **file path**. |
| See a page's version history | `confluence get-page-versions --pageId ID` | |
| Check auth / read / write access | `confluence check-permissions` | Pass `--pageId` to test write access on a page. |

### Caveats — things the CLI does NOT have (don't go hunting)

- **No delete / archive / move-to-trash** for any resource. Refuse and point to the Atlassian UI.
- **No `assign` command.** Assignment is a field on `update-issue` / `create-issue` (`assigneeAccountId`).
- **No user / account search, and the CLI never exposes account IDs.** `get-issue --json` shows `assignee`/`reporter` as **display names**, not IDs. Assignment needs an Atlassian **account ID**, so ask the user for it (they can copy it from the person's profile URL `…/people/<accountId>` in the Atlassian UI). Do not guess one.
- **No attachment upload, no bulk import, no admin/settings** operations.
- **No inline Markdown.** All rich-text content is passed as a **path to a `.md` file** (see the content-file note in each group below).

---

## Run

**No global install needed.** Invoke the published CLI on demand with `npx`. Every command takes the form:

```bash
npx -y mcp-jira-confluence@latest <group> <command> [--flag value ...] [--json]
```

- `-y` auto-confirms the one-time package fetch (no interactive prompt).
- `@latest` always resolves the newest published version (≥ 3.0.0, which fixes an older broken-bin issue).
- `<group>` is `confluence` or `jira`.
- The **first** call in a fresh environment downloads the package (a few seconds); npx caches it under `~/.npm/_npx`, so subsequent calls are fast.
- Add `--json` to any command to get machine-readable JSON instead of the labeled text summary — **prefer `--json` when you need to parse the result** (e.g. grab a page ID or issue key for a follow-up command).

> **Prefer not to re-resolve every call?** Install once — globally (`npm install -g mcp-jira-confluence@latest`, then call `mcp-jira-confluence <group> <command>`) or per-project (`npm install -D mcp-jira-confluence@latest`, then `npx mcp-jira-confluence <group> <command>` resolves the local copy). There is **no** separate `jira-confluence` executable — the CLI lives on the single `mcp-jira-confluence` entry point. The `npx -y mcp-jira-confluence@latest …` form used throughout this doc works with **no** prior install, so it's the safe default.

### Discoverability

- `npx -y mcp-jira-confluence@latest --help` — list all groups and commands.
- `npx -y mcp-jira-confluence@latest <group> --help` — list commands in a group.
- `npx -y mcp-jira-confluence@latest <group> <command> --help` — show a command's args.

Treat `--help` as the source of truth — if a command below disagrees with `--help`, follow `--help`.

---

## Credentials

The CLI reads Atlassian credentials **directly from the system environment variables** already set in the user's shell. Required:

- `ATLASSIAN_URL` — e.g. `https://your-org.atlassian.net` (no trailing slash)
- `ATLASSIAN_EMAIL` — your Atlassian account email
- `ATLASSIAN_API_TOKEN` — from https://id.atlassian.com/manage-profile/security/api-tokens

Optional scoping (recommended):
- `CONFLUENCE_SPACE_KEY` — scopes Confluence searches/writes to one space
- `JIRA_PROJECT_KEY` — scopes Jira searches/creates to one project

Service-specific overrides (`CONFLUENCE_*`, `JIRA_*`) take precedence over the shared `ATLASSIAN_*`. For corporate TLS interception, set `IGNORE_TLS_ERRORS=true`.

### Before running any command — check the env vars are set

Verify the required variables exist in the environment **without ever printing their values**. Check only *presence*, never the contents:

```bash
# Prints only "set" or "MISSING" — never the value itself
for v in ATLASSIAN_URL ATLASSIAN_EMAIL ATLASSIAN_API_TOKEN; do
  [ -n "${!v}" ] && echo "$v: set" || echo "$v: MISSING"
done
```

- If all three report `set`, proceed — the CLI inherits them from the environment automatically. **Use them directly; do not read, echo, expand, or pass the values inline.**
- If any report `MISSING` (unset or empty), **stop and ask the user to set them** before continuing. Tell them which variables are missing and how to set them in their shell, for example:

  ```bash
  export ATLASSIAN_URL="https://your-org.atlassian.net"
  export ATLASSIAN_EMAIL="you@example.com"
  export ATLASSIAN_API_TOKEN="<token from https://id.atlassian.com/manage-profile/security/api-tokens>"
  ```

  Do **not** invent, guess, or hard-code any value, and **never** ask the user to paste the token into the chat — they should export it in their own shell.

> **Never print, echo, or log the API token (or any credential value).** If a command fails on auth, report only the error/status — never the token or the expanded command. If credentials are missing, the CLI also errors with the list of missing vars; relay that list, not the values.

Confluence commands only need Confluence creds; Jira commands only need Jira creds — the CLI lazily builds just the client it needs, so only check the variables relevant to the group you're using.

---

## Confluence commands

| Command | Required args | Optional args | Purpose |
|---|---|---|---|
| `search` | `--cql` | `--limit` (1-100) | Search content with a CQL query |
| `get-page` | `--pageId` | — | Fetch a page by ID |
| `create-page` | `--spaceKey` `--title` `--markdownContent` (file path) | `--parentPageId` | Create a page from a Markdown file |
| `update-page` | `--pageId` `--title` `--markdownContent` (file path) | — | Update a page from a Markdown file |
| `add-comment` | `--pageId` `--markdownContent` (file path) | — | Add a comment from a Markdown file |
| `get-page-versions` | `--pageId` | `--limit` (1-200) | List version history |
| `check-permissions` | — | `--pageId` | Check auth/read/write access |

> **`--markdownContent` is a path to a Markdown file, not inline text.** Write the body to a `.md` file and pass its path. Inline Markdown is no longer accepted.

Examples:

```bash
# Search a space for a term
npx -y mcp-jira-confluence@latest confluence search --cql 'space=ENG and text ~ "runbook"' --limit 10 --json

# Read a page
npx -y mcp-jira-confluence@latest confluence get-page --pageId 123456 --json

# Create a page under a parent, body from a Markdown file
printf '# Steps\n\n1. Build\n2. Deploy\n' > /tmp/runbook.md
npx -y mcp-jira-confluence@latest confluence create-page \
  --spaceKey ENG \
  --title "Deployment Runbook" \
  --markdownContent /tmp/runbook.md \
  --parentPageId 123456

# Add a comment from a file
printf 'Reviewed ✅\n' > /tmp/comment.md
npx -y mcp-jira-confluence@latest confluence add-comment --pageId 123456 --markdownContent /tmp/comment.md
```

---

## Jira commands

| Command | Required args | Optional args | Purpose |
|---|---|---|---|
| `search` | `--jql` | `--limit` (1-100), `--startAt` | Search issues with JQL |
| `get-issue` | `--issueIdOrKey` | — | Fetch an issue by key or ID |
| `create-issue` | `--projectKey` `--issueType` `--summary` `--description` (file path) | `--assigneeAccountId` `--priority` `--labels` | Create an issue (description from a Markdown file) |
| `update-issue` | `--issueIdOrKey` + at least one of `--fields` / `--descriptionFile` | the other of `--fields` / `--descriptionFile` | Update fields (JSON) and/or description (Markdown file) |
| `transition-issue` | `--issueIdOrKey` `--transition` | — | Move issue to a new status |
| `get-transitions` | `--issueIdOrKey` | — | List available transitions |
| `add-comment` | `--issueIdOrKey` `--markdownBody` (file path) | — | Add a comment from a Markdown file |
| `update-comment` | `--issueIdOrKey` `--commentId` `--markdownBody` (file path) | — | Edit a comment from a Markdown file |

> **`--description`, `--markdownBody`, and `--descriptionFile` are paths to Markdown files, not inline text.** Write the content to a `.md` file and pass its path. Inline Markdown is no longer accepted.

Examples:

```bash
# Search open bugs assigned to me
npx -y mcp-jira-confluence@latest jira search --jql 'assignee = currentUser() AND status != Done' --limit 20 --json

# Read an issue
npx -y mcp-jira-confluence@latest jira get-issue --issueIdOrKey PROJ-123 --json

# Create a Story with labels (comma-separated); description from a Markdown file
printf '## Goal\n\nUsers can export reports as CSV.\n' > /tmp/desc.md
npx -y mcp-jira-confluence@latest jira create-issue \
  --projectKey PROJ \
  --issueType Story \
  --summary "Add CSV export" \
  --description /tmp/desc.md \
  --labels backend,reporting

# Update plain fields — --fields takes a JSON object string
npx -y mcp-jira-confluence@latest jira update-issue --issueIdOrKey PROJ-123 --fields '{"summary":"Add CSV + XLSX export"}'

# Update the description from a Markdown file (converted to ADF)
npx -y mcp-jira-confluence@latest jira update-issue --issueIdOrKey PROJ-123 --descriptionFile /tmp/desc.md

# Transition (list first, then move)
npx -y mcp-jira-confluence@latest jira get-transitions --issueIdOrKey PROJ-123 --json
npx -y mcp-jira-confluence@latest jira transition-issue --issueIdOrKey PROJ-123 --transition "In Progress"

# Comment from a file
printf 'Picked this up.\n' > /tmp/note.md
npx -y mcp-jira-confluence@latest jira add-comment --issueIdOrKey PROJ-123 --markdownBody /tmp/note.md
```

---

## Markdown → ADF: what the Jira converter supports

Every Jira rich-text field (`create-issue --description`, `add-comment`/`update-comment --markdownBody`, `update-issue --descriptionFile`, and a **string** `description` inside `update-issue --fields`) is run through a hand-rolled Markdown→ADF (Atlassian Document Format) converter. You provide the Markdown **as a file path** (the CLI reads the file); you do **not** need to inspect the source or send raw ADF — write normal Markdown and rely on the table below. (Confluence's `--markdownContent` uses a *separate*, fuller markdown-it→HTML path and is not covered here.)

**Supported — block elements:**

| Markdown | Result | Notes |
|---|---|---|
| `# … ###### ` | Headings h1–h6 | |
| Paragraph text | paragraph | |
| ` ```lang … ``` ` | **code block** | Fenced; the info string becomes the ADF `language` attr. Body is kept **verbatim** (no inline parsing) — ideal for k6 / JS / shell snippets. |
| `\| a \| b \|` tables | table | A `\| --- \| --- \|` separator row marks the header; **without** a separator the *first* row is treated as the header. Cells hold inline marks only. |
| `- ` / `* ` / `+ ` | bullet list | |
| `1. ` | ordered list | |
| `> quote` | blockquote | Consecutive `>` lines merge. |
| `---` / `***` / `___` | horizontal rule | |

**Supported — inline marks** (work inside paragraphs, list items, table cells, headings, quotes):

| Markdown | Mark |
|---|---|
| `**bold**` | strong |
| `*italic*` / `_italic_` | em |
| `***both***` | strong + em |
| `` `code` `` | inline code |
| `~~strike~~` | strikethrough |
| `[text](url)` | link |

**Not supported (avoid or they pass through as literal text):**

- **Nested lists** — indentation is ignored; sub-items flatten to a single level.
- **Block elements inside list items, table cells, or blockquotes** — those containers accept inline marks only (e.g. you can't put a code block *inside* a table cell).
- Images, task/checkbox lists (`- [ ]`), footnotes, definition lists, HTML passthrough.

So a typical story description with headings, a metrics **table**, and a fenced **k6/JavaScript code block** converts cleanly — verified end to end. Keep code that must survive intact (k6 scripts, JSON, shell) inside fenced blocks, since their bodies are never reinterpreted.

---

## Usage notes & conventions

- **Markdown comes from a file.** Every rich-text arg (`--markdownContent`, `--description`, `--markdownBody`, `--descriptionFile`) is a **path to a Markdown file** — write the content to a `.md` file and pass its path. Inline Markdown is no longer accepted. The CLI reads the file and converts internally — Confluence → storage (HTML), Jira → ADF. Do **not** pre-convert to HTML or ADF yourself. A missing, empty, or unreadable file errors before any network call.
- **Writing the file.** Create the `.md` first (e.g. with a heredoc or `printf`), then pass its path. CQL/JQL strings are still inline — wrap them in single quotes so the shell doesn't expand them.
- **Flags or positionals.** Args can be given as `--flag value` (clearest, preferred) or as bare positionals in the declared order. Always use named flags to avoid ordering mistakes.
- **`update-issue` takes `--fields` and/or `--descriptionFile`.** Provide at least one. `--fields` is a valid JSON object string for plain fields (invalid JSON errors before any network call); `--descriptionFile` is a Markdown file converted to ADF for the description (it **wins** over any `description` in `--fields`). Within `--fields`, a few keys get convenience handling: a **string** `description` is auto-converted Markdown→ADF (an already-built ADF object passes through; `null` clears it), `assignee` takes an account-ID string (`null` unassigns), `priority` a name string, `labels` a string array. Any other field name is sent to the Jira REST API unchanged. Prefer `--descriptionFile` for setting the description.
- **Two-step transitions.** Run `get-transitions` first to learn valid transition names/IDs for the issue's current status, then `transition-issue`. The transition arg accepts either the name or the numeric ID.
- **Capture IDs for chaining.** After `create-page` / `create-issue`, use `--json` and read the returned ID/key to drive follow-up commands (e.g. add a comment, set status).
- **Scoping.** If `CONFLUENCE_SPACE_KEY` / `JIRA_PROJECT_KEY` are set, searches without an explicit `space=`/`project=` clause are auto-scoped, and writes outside that scope are rejected. Mention this if a write is unexpectedly refused.
- **Errors.** A non-zero exit prints `Error: <message>` to stderr. Relay the message to the user; for auth failures, check credentials — don't retry blindly.

## Suggested workflow

1. Confirm the runner works — `npx -y mcp-jira-confluence@latest --help` prints the command list (the first run fetches the package; later runs are cached). No global install required.
2. Check the required env vars are present (the presence-only loop under **Credentials**) — never printing values. If any are `MISSING`, ask the user to `export` them and stop. Then optionally run a cheap read (`confluence check-permissions` or `jira get-transitions`) to confirm they work.
3. Run the needed command with `--json` when you must parse output.
4. For writes, echo back to the user what was created/changed (title, key/ID, URL) — and never delete.
