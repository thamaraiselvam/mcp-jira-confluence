## 1. Entry-point CLI routing

- [x] 1.1 Add an exported pure predicate `isCliInvocation(argv: string[]): boolean` to `src/index.ts` — true when `argv[0]` is `confluence` / `jira` or a top-level `--help` / `-h`
- [x] 1.2 Import `run` from `./cli.js` and add a dispatch guard at the top of `index.ts` (before the `bootstrap` IIFE): if `isCliInvocation(process.argv.slice(2))`, `process.exit(await run(process.argv.slice(2)))`
- [x] 1.3 Verify the guard precedes `bootstrap` so the two-config server bootstrap never runs on the CLI path

## 2. Remove the second bin

- [x] 2.1 Remove the `jira-confluence` entry from the `bin` map in `package.json` (keep `mcp-jira-confluence`)
- [x] 2.2 Confirm `npm run cli` / `dev:cli` scripts still work (they invoke `node dist/cli.js` directly; `cli.ts` and its self-invocation guard are unchanged)

## 3. Build & smoke test

- [x] 3.1 `npm run build` and `npx tsc --noEmit` pass (top-level await compiles under ES2022/Node16)
- [x] 3.2 Smoke: `node dist/index.js jira --help` prints Jira CLI help and exits without starting a transport
- [x] 3.3 Smoke: `node dist/index.js confluence` lists Confluence commands and exits non-zero
- [x] 3.4 Smoke: `node dist/index.js --help` prints top-level CLI usage (groups) and exits 0
- [x] 3.5 Smoke: launching with no CLI group still starts the MCP server (piped stdio / no-arg) unchanged

## 4. Tests

- [x] 4.1 Add unit tests for `isCliInvocation`: true for `jira …`, `confluence …`, `--help`, `-h`; false for `[]`, server flags, and unrelated first args
- [x] 4.2 Confirm the MCP↔CLI parity test and existing `cli.ts` tests still pass (CLI behavior unchanged)
- [x] 4.3 Run `npm run test:coverage` and ensure 80% thresholds still pass (`src/index.ts` remains excluded)

## 5. Docs

- [x] 5.1 `README.md` — drop the `jira-confluence` bin from the binaries table and CLI examples; present `npx -y mcp-jira-confluence@latest <group> <command>` (and `mcp-jira-confluence <group> <command>` for installed use) as the only forms
- [x] 5.2 `skills/jira-confluence-cli/SKILL.md` — remove the optional `jira-confluence` global-install note; keep the npx form as the single runner
- [x] 5.3 `docs/agent-skill-setup.md` — same: no `jira-confluence` bin references
- [x] 5.4 `CLAUDE.md` — update the architecture note that describes the second `jira-confluence` bin to reflect single-entry routing
