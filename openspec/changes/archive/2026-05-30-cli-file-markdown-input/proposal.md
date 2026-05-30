## Why

Today the CLI only accepts rich-text content (Confluence page bodies/comments, Jira descriptions/comments) as **inline** Markdown strings on the command line. Inline content is painful and error-prone for anything non-trivial: shells mangle newlines, quotes, and special characters, so multi-line Markdown either breaks or has to be awkwardly escaped. The `jira update-issue` command goes further and only accepts a raw JSON blob, forcing callers to hand-author ADF/field JSON. Reading Markdown from a **file** is the natural, reliable way to pass real documents, and standardizing on files for all rich-text input keeps the surface consistent and predictable.

## What Changes

- **BREAKING**: Every CLI argument that carries Markdown rich-text content SHALL be supplied as a path to a Markdown file instead of an inline string. Inline Markdown for these fields is removed.
  - Confluence: `create-page` and `update-page` (page body), `add-comment` (comment body).
  - Jira: `create-issue` (description), `add-comment` and `update-comment` (comment body).
- A shared file-reading step resolves the path, reads UTF-8 contents, and passes the raw Markdown to the existing `confluence.ts` / `jira.ts` functions, which continue to convert to Confluence storage HTML or Jira ADF internally (no conversion logic is duplicated in the CLI).
- `jira update-issue` gains a feasible Markdown-file path for its description: an optional `--description-file` is converted to ADF and merged into the fields payload, so updating a description no longer requires hand-authoring ADF JSON. The raw `--fields` JSON path is retained for non-description field updates.
- Clear, early errors when a content file path is missing, does not exist, is not readable, or is empty — surfaced before any Atlassian API call.
- Help text, argument descriptions, and the README/skill docs are updated to reflect file-based input and show example `.md` files.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `cli-commands`: The Confluence and Jira CLI command requirements change so that Markdown rich-text inputs are read from a file path rather than accepted inline; `update-issue` additionally supports a Markdown description file. A new requirement covers file-based content input semantics and its error handling.

## Impact

- **Code**: `src/cli.ts` (command table arg specs + a shared content-file reader; `update-issue` handler), and its tests in `tests/unit/cli.test.ts` (including the MCP↔CLI parity test, which must still pass since the underlying tools are unchanged).
- **Behavior**: Backward-incompatible for any caller currently passing inline Markdown to the affected commands — they must switch to a file path.
- **Docs**: `README.md` and the `jira-confluence-cli` skill instructions.
- **No change** to the MCP server, the API layer (`confluence.ts` / `jira.ts`), or the Markdown→HTML/ADF converters.
