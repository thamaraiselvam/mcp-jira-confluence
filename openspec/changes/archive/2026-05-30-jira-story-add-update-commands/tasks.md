## 1. Backend functions (src/jira.ts)

- [x] 1.1 Add `AddJiraCommentResponse` and `UpdateJiraCommentResponse` interfaces (`{ id, issueKey, url }`)
- [x] 1.2 Implement `addJiraComment(client, issueIdOrKey, markdownBody, configuredProjectKey?)` — validate non-empty issue key and body, convert body with `markdownToAdf`, `POST /rest/api/3/issue/{issueIdOrKey}/comment` with `{ body }`, map response to `AddJiraCommentResponse`
- [x] 1.3 Implement `updateJiraComment(client, issueIdOrKey, commentId, markdownBody, configuredProjectKey?)` — validate non-empty issue key, comment ID, and body, convert body with `markdownToAdf`, `PUT /rest/api/3/issue/{issueIdOrKey}/comment/{commentId}` with `{ body }`, map response to `UpdateJiraCommentResponse`
- [x] 1.4 Apply the project-scoping guard (consistent with `createJiraIssue`) so out-of-scope issues are rejected before any write

## 2. Tool registration (src/tools.ts)

- [x] 2.1 Import `addJiraComment` and `updateJiraComment` from `./jira.js`
- [x] 2.2 Add `jira_add_comment` tool definition to the `ListToolsRequestSchema` handler with `issueIdOrKey` (required) and `markdownBody` (required) input schema and a Markdown-first description
- [x] 2.3 Add `jira_update_comment` tool definition with `issueIdOrKey` (required), `commentId` (required), and `markdownBody` (required) input schema
- [x] 2.4 Add a `jira_add_comment` case to the `CallToolRequestSchema` handler that enforces non-empty body, calls `addJiraComment`, and returns a success message with the comment ID; wrap in try/catch returning `isError: true`
- [x] 2.5 Add a `jira_update_comment` case that enforces non-empty body and comment ID, calls `updateJiraComment`, and returns a success message; wrap in try/catch returning `isError: true`

## 3. Verification

- [x] 3.1 Confirm no delete tool or delete code path was introduced (spec requirement)
- [x] 3.2 Run `npm run build` (or `tsc`) and confirm the project type-checks and compiles
- [x] 3.3 Update README tool list to document `jira_add_comment` and `jira_update_comment`
