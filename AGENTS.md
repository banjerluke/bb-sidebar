# Working in bb-sidebar

Behavior-preserving refactors only unless the task says otherwise. Keep test
meaning intact.

Inbox layout: `src/inbox-layout.ts`; shelves: `ThreadInboxShelves.tsx`.
Inbox hooks use `src/use*.ts`; gesture helpers use `src/drag-*.ts`.
Inbox rendering: `src/ThreadInboxView.tsx` and `src/ThreadInboxEmptyStates.tsx`.

## Runtimes and imports

- Browser entry: `app.tsx`. App code includes `src/*.tsx`, `src/components/**`,
  `src/lib/**`, `src/use*.ts`, and the browser modules listed below.
  React, DOM APIs, and SDK app APIs belong here. No imports of `server` or
  `ports-host`, even for types. No value imports of Node built-ins with or
  without `node:`, or `better-sqlite3`, even dynamically. Type-only imports of
  other Node modules are allowed.
- Node server entry: `src/server.ts`. Node host entry: `src/ports-host.ts`.
  Flat `src/server-*.ts` modules share `ServerContext` explicitly.
  Their other supporting Node modules are `port-scan`, `auto-title`,
  `cloud-title`, `regenerate-title`, `port-discovery`, `thread-ports`,
  `thread-pull-requests`, and `thread-tasks`, all under `src/`.
  Node/SDK server or host APIs are allowed. These modules must not import React,
  TSX, browser `.ts` modules, `use*` hooks, `lib/**`, or `components/**`, even
  for types. Pure settings definitions and helpers live in shared
  `sidebar-settings-values.ts`.
- Browser `.ts` modules are `project-colors`, `title-generation-state`,
  `sidebar-settings`, `working-since`, `working-tree`, `drag-preview`,
  `drag-reorder`, `drag-reorder-geometry`, `drag-auto-scroll`, and
  `settled-port-prompt`. `project-colors.ts` uses React's `CSSProperties`
  type and `title-generation-state.ts` uses `useSyncExternalStore`
  intentionally.
- Shared modules today are all other top-level `src/*.ts`, excluding
  `server-*.ts`, `use*.ts`, `*.test.ts`, `*.d.ts`, and `test-*.ts`.
  They must not import React, React DOM, Node built-ins, Node entries, TSX,
  browser `.ts` modules, `use*` hooks, `lib/**`, or `components/**`, even for
  types, or value-import SQLite.
  This is a dependency boundary; these modules are not necessarily free of
  side effects or DOM access. Tests retain their runtime's boundaries;
  top-level `.ts` tests and test helpers may use Node test tooling. Keep the
  ordered classifications in `biome.json` in sync.

The sidebar RPC contract and its schemas live in shared `src/contract.ts` as
`bbSidebarRpcContract`. App code imports its types with `import type`. The
contract re-exports all five realtime channels from `src/realtime-channels.ts`;
browser value imports use that pure module to avoid loading schemas. The host
port contract lives in `src/port-scan-contract.ts`.

## Server modules

- `server-context`: SDK/database context and handler types.
- `server-settings`: settings reads, writes, and legacy import.
- `server-lifecycle`: lifecycle rows, shelves, ancestor wakes, inbox order,
  thread loading, and locks for pin/parent changes.
- `server-project-icons`: icon resolution, caches, overrides, and uploads.
- `server-project-colors`: project color reads and writes.
- `server-project-management`: project names, paths, and removal.
- `server-settle-cleanup`: cleanup previews, cleanup, and runtime reclaim.
- `server-settle-actions`: tree settle, return to Active, and Undo snapshots.
- `server-policy`: automatic settle evaluation and settings revisions.
- `server-handlers`: RPC handlers assembled from the modules.
- `server.ts`: migrations, context creation, wiring, HTTP, and events.

The Node override uses `src/server-*.ts`; shared modules exclude that pattern.
Browser/shared imports of those modules are forbidden, including types.

Settings live in the single `sidebar_settings.settings_json` column. The
server derives per-field fallbacks from `DEFAULT_SIDEBAR_SETTINGS`, validates
with `sidebarSettingsSchema`, and keeps strict RPC input validation. The
migration copies old columns into camelCase JSON with real boolean values.
Old columns remain unused after migration and can be dropped with a table
rebuild in a later major. A compatibility row satisfies their original
NOT NULL constraints; NULL JSON still permits the legacy SDK settings import.
The app reads server settings or the existing cache. Do not load zod or
contract schemas in browser code; cache validation uses codecs in `src/lib/`.

## Browser persistence

Declare persisted browser keys once in `src/lib/storage-keys.ts`, with an
eviction priority. `src/lib/safe-storage.ts` derives quota recovery from it.
Use `src/lib/use-persisted-preference.ts` for UI preferences and
`src/lib/cached-rpc-state.ts` for caches keyed by RPC client. Both use codecs
and the read/write functions in `src/lib/storage-codec.ts`; other browser
state uses those functions directly. Keep DOM event names in
`src/lib/browser-events.ts`. Production key literals and direct localStorage
access are checked by `src/storage-keys.test.ts`.

## Size and style budgets

SidebarSettings.tsx is at its 535-line ceiling; SB-14 should split it.

- Production files and `scripts/**/*.mjs`: at most 500 physical lines. Tests get
  1,000. `scripts/check-file-sizes.mjs` records ceilings for four production
  files. Growth fails; shrinkage also fails until the ceiling is lowered.
  Remove entries once within the default budget. `SubagentsChip.test.tsx` is
  within 1,000 and needs no exception.
- Biome: two spaces, double quotes, semicolons, trailing commas, width 120.
  Markdown and YAML are no longer formatted. Biome has no line-count warnings;
  the physical gate still applies to tests; SB-3 splits large tests.
- Biome's `noRestrictedImports` enforces Node/shared restrictions and bans
  browser imports of Node entries, including types and bare side effects.
  `useImportType` is an error. `jsxRuntime: reactClassic` preserves the old
  linter's treatment of React namespace imports in JSX files; it does not
  change TypeScript's `react-jsx` compilation.
- Biome lacks `allowTypeImports`. `scripts/check-import-boundaries.mjs` enforces
  browser Node entry bans, value-only restrictions for other Node modules,
  and shared Node built-in bans, including dynamic imports. It permits browser
  type imports of other Node modules, bans shared imports of local browser
  modules, and checks the Node/shared TSX names for drift.
  It bans `import()` type annotations except in `ports-host.test.ts`, where
  Vitest's `importOriginal` needs them. Regular imports there still require
  type-only syntax when used only as types.

## Checks

Run `npm ci`, then `npm run check` before and after changes. CI runs the same
lint, format check, Knip, typecheck, Vitest suite, BB plugin build, and the
browser bundle guard against `ZodError`, plus
`npx --no-install bb plugin types --check`. Typecheck includes both Knip
configs.

Test timeouts are centralized: Testing Library gets 5s in `test-setup.ts`, Vitest 30s in `vitest.config.ts`.
The app project loads once per worker; `test-app-setup.ts` resets shared state and cleanup hooks register per file.
Run `npm run test:stress` before test commits: five loaded runs, also available as a separate manual CI job.

A fresh checkout or worktree must run `npm ci` before its first commit
because the pre-commit hook runs the local Biome binary.

Use `npm run format` to format the repository. `npm run lint`,
`npm run format:check`, and `npm run knip` can run individually.
`npm ci` installs lefthook via `prepare` into the common `.git/hooks` for the
main checkout and every worktree; branches without `lefthook.yml` skip these
checks. Pre-commit runs Biome check and import boundaries on staged files,
plus the size gate. Pre-push runs `npm run check`. Hooks check files without
applying fixes.
`npm run knip:report` reports deferred unused dependencies and exports/types;
it currently exits 1. `knip.ts` preserves SDK peers and lists dependency debt
for SB-8. Export/type ignores cover only today's 25 debt files and issue types;
new dead exports in clean files fail. Do not add new unused dependencies to
that list.

`src/test-wired.ts` wires real app/server SDK RPC; `flush()` sends realtime.
Fixtures in `src/fixtures/` have hashes; release data comes from pinned tags.
Generate with `npm run fixture:db -- <new-path> [git-ref]`. The default remains
pinned v0.2.34. An explicit tag or commit SHA generates a new schema snapshot
from a temporary git worktree using that checkout's `server.ts`.
Future schema changes add versions; never edit or overwrite old fixtures.
