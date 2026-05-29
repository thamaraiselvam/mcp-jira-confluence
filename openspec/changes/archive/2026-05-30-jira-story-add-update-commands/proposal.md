## Why

The MCP server can create, read, update, and transition Jira issues, but it has no way to work with the conversation that happens *on* an issue. Confluence pages already support `add_confluence_comment`, yet Jira stories — where most day-to-day collaboration occurs — offer no comment tooling at all. Teams want the AI to leave progress notes and refine them, without ever risking destructive removal of a colleague's comment.

## What Changes

- Add a `jira_add_comment` tool that posts a new Markdown comment to a Jira story (or any issue) by key/ID. Markdown is converted to Atlassian Document Format (ADF), matching the existing description-handling behavior.
- Add a `jira_update_comment` tool that edits the body of an existing comment on a Jira story, identified by issue key/ID and comment ID.
- Add `addJiraComment` and `updateJiraComment` functions in `src/jira.ts` backed by the Jira Cloud comment REST endpoints.
- **No delete capability** is introduced — comment removal is intentionally out of scope to prevent the AI from destroying collaboration history.

## Capabilities

### New Capabilities
- `jira-comments`: Adding new comments and updating existing comments on Jira issues (stories), with Markdown-to-ADF conversion and project scoping. Explicitly excludes comment deletion.

### Modified Capabilities
<!-- None — no existing spec's requirements change. -->

## Impact

- **Code**: `src/jira.ts` (new `addJiraComment`, `updateJiraComment` functions and response types), `src/tools.ts` (two new tool definitions and handlers).
- **APIs**: Jira Cloud REST — `POST /rest/api/3/issue/{issueIdOrKey}/comment` and `PUT /rest/api/3/issue/{issueIdOrKey}/comment/{id}`.
- **Dependencies**: Reuses existing `markdownToAdf` from `src/jira-markdown.ts`; no new packages.
- **Docs**: README tool list should note the two new tools.
