## 1. Shared content-file reader

- [x] 1.1 Add a `readContentFile(path, readFile)` helper in `src/cli.ts` that resolves the path, reads UTF-8, and throws typed errors for not-found, unreadable (directory/permission), and empty/whitespace-only content
- [x] 1.2 Add a file-read function to `CliDeps` (and `defaultDeps`) so the reader is injectable for tests

## 2. Mark content args as file inputs

- [x] 2.1 Extend `ArgSpec` with a `contentFile?: boolean` marker
- [x] 2.2 Mark Confluence content args as `contentFile`: `create-page` body, `update-page` body, `add-comment` body — and update their `description` text to say "path to a Markdown file"
- [x] 2.3 Mark Jira content args as `contentFile`: `create-issue` description, `add-comment` body, `update-comment` body — and update their `description` text

## 3. Dispatcher resolution

- [x] 3.1 In `run`, after required-arg validation and before building the client, resolve every `contentFile` arg by reading the file and replacing its value with the file contents
- [x] 3.2 Ensure a bad/missing/empty file fails fast with exit code 1 and no client construction or API call, printing the error to stderr

## 4. update-issue Markdown description

- [x] 4.1 Add an optional `descriptionFile` arg to `update-issue` (path to Markdown) and make `--fields` optional when it is supplied (require at least one of the two)
- [x] 4.2 In the handler, read the description file, convert via `markdownToAdf`, and merge `{ description: <adf> }` into the parsed fields (file wins over any `fields.description`)

## 5. Help and docs

- [x] 5.1 Update help/usage output so content args clearly indicate a file path
- [x] 5.2 Update `README.md` with file-based examples (e.g. `--markdownContent ./body.md`) and note the BREAKING removal of inline Markdown
- [x] 5.3 Update the `jira-confluence-cli` skill instructions to use Markdown file inputs

## 6. Tests

- [x] 6.1 Confirm the MCP↔CLI parity test still passes (no commands added/removed)
- [x] 6.2 Add unit tests for `readContentFile`: success, not-found, empty/whitespace, unreadable
- [x] 6.3 Add unit tests that content-file args are read and passed through for each affected Confluence and Jira command (using injected file-read)
- [x] 6.4 Add unit tests for content-file error paths failing before any API call (exit code 1, no client built)
- [x] 6.5 Add unit tests for `update-issue` `--descriptionFile`: merge into fields, file-wins precedence, and fields-or-description requirement
- [x] 6.6 Run `npm run test:coverage` and ensure 80% thresholds still pass
