## Context

The CLI (`src/cli.ts`) is a thin argv→function adapter over `confluence.ts` / `jira.ts`. Commands are declared in a single `commands` table: each entry lists `args` (name/required/description) and a `run` handler. Values are collected from `--flag value` options or positionals by `collectValues`, required args are validated, then the handler calls the matching API function. Markdown rich-text is currently passed straight through as an inline string; the API functions convert it internally (storage HTML for Confluence, ADF for Jira). `update-issue` is the odd one out — it accepts a raw JSON `--fields` blob.

A parity test in `tests/unit/cli.test.ts` asserts every MCP tool has a matching CLI command, so the CLI and MCP surfaces can't drift. This change does not add or remove commands, so the parity test stays valid.

## Goals / Non-Goals

**Goals:**
- All Markdown rich-text inputs are read from a file path, never inline, for a consistent input model.
- A single, reusable file-reader with clear, early validation errors (missing / empty / unreadable) before any network call.
- `update-issue` can set a description from a Markdown file (converted to ADF) without hand-authoring JSON.
- No duplication of Markdown→HTML/ADF conversion in the CLI — conversion stays in the API layer.

**Non-Goals:**
- No changes to the MCP server, API layer, or the Markdown converters.
- No support for stdin or inline Markdown for these fields (explicitly removed).
- No new commands; no changes to non-content args (CQL/JQL, ids, titles, labels, etc.).

## Decisions

### Distinguish "content file" args from plain-string args
Add an optional `kind: "contentFile"` marker (or a boolean `contentFile: true`) to the relevant `ArgSpec` entries. After `collectValues`, the dispatcher resolves each content-file arg: read the file and replace the value with its contents before invoking `run`. This keeps each `run` handler unchanged (it still receives Markdown text) and centralizes file I/O + validation in one place.

- **Alternative considered**: read files inside each `run` handler. Rejected — duplicates I/O and error handling across six+ handlers and is harder to test uniformly.

### Argument naming
Keep the existing argument names for the content args (`markdownContent`, `description`, `markdownBody`) but redefine their meaning to "path to a Markdown file" and update their `description` text and help. Reusing names keeps positional ordering and the parity test stable, and avoids a second rename churn. Document clearly in help that the value is a file path.

- **Alternative considered**: rename to `--*-file` suffixes (e.g. `--body-file`). Cleaner signal, but churns positional order and all docs/tests; deferred in favor of minimal surface change. (Open question below.)

### `update-issue` description
Add a new optional arg `descriptionFile` (path to Markdown). When provided, the handler reads it, converts via `markdownToAdf`, and merges `{ description: <adf> }` into the parsed `--fields` object before calling `updateJiraIssue`. `--fields` becomes optional when `--descriptionFile` is supplied; at least one of the two MUST be present.

### Shared file reader
A small `readContentFile(path, deps.readFile)` helper: resolves the path, reads UTF-8, throws a typed error on ENOENT ("file not found"), on read failure (directory/permissions), and on empty/whitespace-only content. Inject the file-read function through `CliDeps` (like the existing client/config injectables) so tests don't touch the real filesystem.

### Validation ordering
Content-file resolution happens after required-arg validation but before client construction / network calls, so a bad path fails fast with exit code 1 and no API traffic — matching the existing "missing argument" behavior.

## Risks / Trade-offs

- **[BREAKING] Existing callers passing inline Markdown break** → Documented as BREAKING in the proposal; README and skill docs updated with file-based examples; error messages make the new contract obvious ("expected a path to a Markdown file").
- **[Reused arg names may confuse]** content arg still named `markdownContent` but now means a path → Mitigated by updated arg `description` text and help output; revisit rename in a follow-up if confusing.
- **[Path/encoding edge cases]** relative vs absolute paths, BOM, CRLF → Resolve relative to CWD; read as UTF-8; rely on existing converters to handle line endings. Empty-after-trim is rejected.
- **[Coverage thresholds (80%)]** new branches in the reader and `update-issue` merge → Add unit tests for each error path (missing/empty/unreadable, fields+description merge, parity unchanged).

## Migration Plan

1. Implement `readContentFile`, the `contentFile` arg marker, and dispatcher resolution.
2. Mark content args; update their descriptions/help.
3. Add `descriptionFile` to `update-issue` and the merge logic.
4. Update `tests/unit/cli.test.ts` (parity unchanged; new file-input and error-path tests) and run `npm run test:coverage`.
5. Update `README.md` and the `jira-confluence-cli` skill docs with `.md` file examples.
6. Bump version (breaking → minor/major per project convention) on release.

Rollback: revert the `cli.ts` and docs changes; no data migration involved.

## Open Questions

- Should the content args be renamed to explicit `--*-file` flags for clarity, or keep current names with redefined meaning? (Proposed: keep names now, revisit.)
- For `update-issue`, if both `--fields.description` and `--descriptionFile` are provided, the file SHALL win — confirm this precedence is desired.
