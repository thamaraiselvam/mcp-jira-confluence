## Context

The server (`src/jira.ts` + `src/tools.ts`) already wraps Jira Cloud REST v3 for issue search, read, create, update, and transition. Issue descriptions accept Markdown and are converted to ADF via `markdownToAdf` (`src/jira-markdown.ts`). There is no tooling for issue comments, even though Confluence already has `add_confluence_comment`. This change adds add/update comment support for Jira issues (stories), reusing the established Markdown→ADF and project-scoping conventions. Comment deletion is deliberately excluded.

## Goals / Non-Goals

**Goals:**
- Provide `jira_add_comment` and `jira_update_comment` MCP tools.
- Reuse `markdownToAdf` so comment bodies support the same Markdown features as descriptions.
- Match existing error-handling and response-shaping patterns in `src/tools.ts`.
- Keep the implementation additive — no changes to existing tool behavior.

**Non-Goals:**
- Deleting comments (explicitly out of scope).
- Listing/reading comments, threaded replies, @mentions, or visibility/role restrictions.
- Editing comments authored by other users beyond what the API token's permissions already allow.

## Decisions

**1. Two separate tools rather than one upsert tool.**
`jira_add_comment` (no comment ID) and `jira_update_comment` (requires comment ID) keep each operation's required arguments explicit and self-documenting for the LLM, mirroring the create/update split already used for issues. Alternative considered: a single tool where presence of `commentId` switches behavior — rejected because it makes the schema's required fields ambiguous and invites accidental misuse.

**2. Reuse `markdownToAdf` for the comment body.**
Comments use the same ADF `body` shape as descriptions. Building on the existing converter guarantees consistent formatting and zero new dependencies. Alternative considered: accept raw ADF — rejected to keep the tool interface Markdown-first like every other content tool here.

**3. Endpoints.**
Add: `POST /rest/api/3/issue/{issueIdOrKey}/comment` with `{ body: <ADF> }`.
Update: `PUT /rest/api/3/issue/{issueIdOrKey}/comment/{commentId}` with `{ body: <ADF> }`.
Both return the comment resource; we map out the comment `id` and construct the browse URL from `client.defaults.baseURL`, consistent with `updateJiraIssue`.

**4. Validation up front.**
Each function validates non-empty `issueIdOrKey`, non-empty `markdownBody`, and (for update) non-empty `commentId` before any network call, throwing `Error` with clear messages — the same guard style used throughout `src/jira.ts`. The tool handlers wrap calls in try/catch and return `isError: true` text content on failure.

**5. Project scoping.**
Follow the existing convention: the comment functions accept the configured project key and apply the same scoping guard approach used elsewhere so out-of-project issues are rejected.

## Risks / Trade-offs

- **Updating another user's comment may fail with 403 depending on token permissions** → Surface the Jira error message verbatim through the existing catch/`isError` path; no special handling needed.
- **Comment ID is opaque and not discoverable via current tools** (no list-comments tool) → Acceptable for this change; callers obtain the ID from the add response or the Jira UI. A future list/read tool can close this gap.
- **No delete by design** → If a comment is posted in error it must be removed via the Jira UI; this is an intentional safety trade-off to protect collaboration history.
