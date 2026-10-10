# Working in bb-sidebar

Behavior-preserving refactors only unless the task says otherwise. Keep test meaning intact.

## Runtimes and imports

- Browser entry: `app.tsx`. App code includes `src/*.tsx`, `src/components/**`,
  `src/lib/**`, `src/use*.ts`, and the browser modules listed below.
  React, DOM APIs, and SDK app APIs belong here. No value imports of `server`,
  `ports-host`, `node:*`, or `better-sqlite3`, including relative paths from subfolders.
  Type-only imports of Node modules are allowed.
- Node server entry: `src/server.ts`. Node host entry: `src/ports-host.ts`.
  Their supporting Node modules are `port-scan`, `auto-title`, `cloud-title`,
  `regenerate-title`, `port-discovery`, `thread-ports`, `thread-pull-requests`,
  and `thread-tasks`, all under `src/`. Node/SDK server or host APIs are allowed.
  These modules must not import React or TSX app modules, even for types.
- Browser `.ts` modules are `project-colors`, `title-generation-state`,
  `sidebar-settings`, `working-since`, `working-tree`, `drag-preview`,
  and `settled-port-prompt`. `project-colors.ts` uses React's `CSSProperties`
  type and `title-generation-state.ts` uses `useSyncExternalStore` intentionally.
- Shared modules today are all other top-level `src/*.ts`, excluding `use*.ts`,
  `*.test.ts`, `*.d.ts`, and `test-*.ts`. They must not import React or `node:*`,
  even for types, or value-import the Node entries or SQLite. This is a dependency
  boundary; these modules are not necessarily free of side effects or DOM access.
  Tests retain their runtime's boundaries; top-level `.ts` tests and test helpers
  may use Node test tooling. Keep the lists in `eslint.config.mjs` in sync.

The sidebar RPC contract lives in `src/server.ts` as `bbSidebarRpcContract`.
App code imports it with `import type` today; SB-4 moves it to a shared module.
The host port contract already lives in `src/port-scan-contract.ts`.

## Browser persistence

Put persisted browser state through `src/lib/safe-storage.ts` and its
`PLUGIN_STORAGE_KEYS` registry. Register new keys there so quota recovery can
evict them. Existing direct storage accesses are migration debt for SB-7.

## Size and style budgets

- New production files: at most 500 physical lines, enforced by
  `scripts/check-file-sizes.mjs`. Its five explicit debt ceilings prevent growth
  of existing oversized files. Reduce these ceilings when splitting those files.
- ESLint warns above 500 file lines or 200 function lines, ignoring blanks and
  comments. The function limit accommodates React components. Tests are exempt
  from both size rules and the physical size gate; SB-3 splits the large tests.
- Prettier: two spaces, double quotes, semicolons, trailing commas, width 120.
- Import boundaries and `@typescript-eslint/consistent-type-imports` are errors.
  Only `ports-host.test.ts` permits `typeof import()` annotations needed by
  Vitest's `importOriginal`; its regular imports still require type-only syntax.

## Checks

Run `npm ci`, then `npm run check` before and after changes. CI runs the same
lint, format check, Knip, typecheck, Vitest suite, and BB plugin build, plus
`npx --no-install bb plugin types --check`.

Use `npm run format` to format the repository. `npm run lint`,
`npm run format:check`, and `npm run knip` can run individually.
`npm run knip:report` reports deferred unused dependencies and exports/types;
it currently exits 1. `knip.ts` preserves SDK peers and lists dependency debt
for SB-8. Do not add new unused dependencies to that list.
