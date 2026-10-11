# Working in bb-sidebar

Behavior-preserving refactors only unless the task says otherwise. Keep test meaning intact.

## Runtimes and imports

- Browser entry: `app.tsx`. App code includes `src/*.tsx`, `src/components/**`,
  `src/lib/**`, `src/use*.ts`, and the browser modules listed below.
  React, DOM APIs, and SDK app APIs belong here. No value imports of `server`,
  `ports-host`, Node built-ins with or without `node:`, or `better-sqlite3`, even dynamically.
  Type-only imports of Node modules are allowed.
- Node server entry: `src/server.ts`. Node host entry: `src/ports-host.ts`.
  Their supporting Node modules are `port-scan`, `auto-title`, `cloud-title`,
  `regenerate-title`, `port-discovery`, `thread-ports`, `thread-pull-requests`,
  and `thread-tasks`, all under `src/`. Node/SDK server or host APIs are allowed.
  These modules must not import React, TSX, browser `.ts` modules, `use*` hooks,
  `lib/**`, or `components/**`, even for types. Only `server.ts` may import its
  existing named constants, pure settings helpers, and `SidebarSettingsValues`
  from `sidebar-settings`, plus `PROJECT_COLORS_CHANNEL` from `project-colors`.
  These symbol-specific exceptions are SB-4 debt; move them to shared code there.
- Browser `.ts` modules are `project-colors`, `title-generation-state`,
  `sidebar-settings`, `working-since`, `working-tree`, `drag-preview`,
  and `settled-port-prompt`. `project-colors.ts` uses React's `CSSProperties`
  type and `title-generation-state.ts` uses `useSyncExternalStore` intentionally.
- Shared modules today are all other top-level `src/*.ts`, excluding `use*.ts`,
  `*.test.ts`, `*.d.ts`, and `test-*.ts`. They must not import React, React DOM, or Node built-ins,
  even for types, or value-import the Node entries or SQLite. This is a dependency
  boundary; these modules are not necessarily free of side effects or DOM access.
  Tests retain their runtime's boundaries; top-level `.ts` tests and test helpers
  may use Node test tooling. Keep the ordered classifications in `biome.json` in sync.

The sidebar RPC contract lives in `src/server.ts` as `bbSidebarRpcContract`.
App code imports it with `import type` today; SB-4 moves it to a shared module.
The host port contract already lives in `src/port-scan-contract.ts`.

## Browser persistence

Put persisted browser state through `src/lib/safe-storage.ts` and its
`PLUGIN_STORAGE_KEYS` registry. Register new keys there so quota recovery can
evict them. Existing direct storage accesses are migration debt for SB-7.

## Size and style budgets

- Production files and `scripts/**/*.mjs`: at most 500 physical lines. Tests get
  1,000. `scripts/check-file-sizes.mjs` records ceilings for five production files.
  Growth fails; shrinkage also fails until the ceiling is lowered. Remove
  entries once within the default budget. `SubagentsChip.test.tsx` is within
  1,000 and needs no exception.
- Biome: two spaces, double quotes, semicolons, trailing commas, width 120.
  Markdown and YAML are no longer formatted. Biome has no line-count warnings;
  the physical gate still applies to tests; SB-3 splits large tests.
- Biome's `noRestrictedImports` enforces Node/shared restrictions, including
  server symbol exceptions and bare side-effect imports. `useImportType` is an error.
  `jsxRuntime: reactClassic` preserves the old linter's treatment of React namespace
  imports in JSX files; it does not change TypeScript's `react-jsx` compilation.
- Biome lacks `allowTypeImports`. `scripts/check-import-boundaries.mjs` enforces
  browser value-only restrictions and shared Node built-in bans, including dynamic
  imports. It permits browser type imports, checks the Node TSX name lists for drift,
  and bans `import()` type annotations except
  in `ports-host.test.ts`, where Vitest's `importOriginal` needs them.
  Regular imports there still require type-only syntax when used only as types.

## Checks

Run `npm ci`, then `npm run check` before and after changes. CI runs the same
lint, format check, Knip, typecheck, Vitest suite, and BB plugin build, plus
`npx --no-install bb plugin types --check`. Typecheck includes both Knip configs.

A fresh checkout or worktree must run `npm ci` before its first commit
because the pre-commit hook runs the local Biome binary.

Use `npm run format` to format the repository. `npm run lint`,
`npm run format:check`, and `npm run knip` can run individually.
`npm ci` installs lefthook via `prepare` into the common `.git/hooks` for the main
checkout and every worktree; branches without `lefthook.yml` skip these checks.
Pre-commit runs Biome check and import boundaries on staged files, plus the size gate.
Pre-push runs `npm run check`. Hooks check files without applying fixes.
`npm run knip:report` reports deferred unused dependencies and exports/types;
it currently exits 1. `knip.ts` preserves SDK peers and lists dependency debt
for SB-8. Export/type ignores cover only today's 25 debt files and issue types;
new dead exports in clean files fail. Do not add new unused dependencies to the list.

Wired integration tests in `src/wired.*.test.{ts,tsx}` mount the real app and server via
`src/test-wired.ts`; RPC uses SDK validation and `flush()` delivers server realtime.
Release SQLite/localStorage fixtures live in `src/fixtures/`; regenerate with `npm run fixture:db`.
Future schema changes add a new fixture version; never edit an old fixture.
