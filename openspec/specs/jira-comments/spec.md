# jira-comments Specification

## Purpose

Provide MCP tools for managing comments on Jira issues (stories). Callers can add new comments and update existing comments, supplying bodies as Markdown that the system converts to Atlassian Document Format (ADF) before sending to Jira. Comment deletion is intentionally unsupported, and all comment operations honor the server's configured project scope.

## Requirements

### Requirement: Add a comment to a Jira issue

The system SHALL provide a `jira_add_comment` tool that posts a new comment to a Jira issue (story) identified by its key or numeric ID. The comment body MUST be supplied as Markdown and SHALL be converted to Atlassian Document Format (ADF) before being sent to Jira. On success the system SHALL return the created comment's ID, the issue key, and a browse URL for the issue.

#### Scenario: Comment added successfully

- **WHEN** the caller invokes `jira_add_comment` with a valid issue key and non-empty Markdown body
- **THEN** the system converts the Markdown to ADF, posts it via `POST /rest/api/3/issue/{issueIdOrKey}/comment`, and returns the new comment ID, issue key, and issue URL

#### Scenario: Empty issue key rejected

- **WHEN** the caller invokes `jira_add_comment` with a missing or blank `issueIdOrKey`
- **THEN** the system returns an error stating the issue ID or key must not be empty, and no request is sent to Jira

#### Scenario: Empty comment body rejected

- **WHEN** the caller invokes `jira_add_comment` with a missing or whitespace-only `markdownBody`
- **THEN** the system returns an error stating the comment body must not be empty, and no request is sent to Jira

### Requirement: Update an existing comment on a Jira issue

The system SHALL provide a `jira_update_comment` tool that replaces the body of an existing comment on a Jira issue, identified by the issue key/ID and the comment ID. The new body MUST be supplied as Markdown and SHALL be converted to ADF before being sent. On success the system SHALL return the updated comment's ID, the issue key, and a browse URL for the issue.

#### Scenario: Comment updated successfully

- **WHEN** the caller invokes `jira_update_comment` with a valid issue key, a valid comment ID, and a non-empty Markdown body
- **THEN** the system converts the Markdown to ADF, sends `PUT /rest/api/3/issue/{issueIdOrKey}/comment/{commentId}`, and returns the comment ID, issue key, and issue URL

#### Scenario: Missing comment ID rejected

- **WHEN** the caller invokes `jira_update_comment` with a missing or blank `commentId`
- **THEN** the system returns an error stating the comment ID must not be empty, and no request is sent to Jira

#### Scenario: Empty updated body rejected

- **WHEN** the caller invokes `jira_update_comment` with a missing or whitespace-only `markdownBody`
- **THEN** the system returns an error stating the comment body must not be empty, and no request is sent to Jira

### Requirement: Comment deletion is not supported

The system SHALL NOT expose any tool, function, or code path that deletes a Jira comment. Comment management is limited to adding and updating only.

#### Scenario: No delete tool is registered

- **WHEN** the list of available MCP tools is enumerated
- **THEN** no tool that deletes a Jira comment is present

### Requirement: Comment operations honor project scoping

When the server is configured with a project key scope, the comment tools SHALL operate consistently with the existing issue tools' scoping behavior so that comments are only added to or updated on issues within the configured project.

#### Scenario: Comment on out-of-scope issue is rejected

- **WHEN** the server is scoped to a project and the caller targets an issue outside that project
- **THEN** the system rejects the operation with an error indicating the issue is outside the configured project scope
