# SB-6 setting proof

Added `experimentalFoo` temporarily and ran the entire `npm run check`.
All 869 tests passed, including a temporary wired test that clicked the
checkbox, saved through real SDK RPC into JSON, and verified the value after
a server reload. The build and browser bundle guard also passed.

The production diff contained exactly these three files:

- `src/contract.ts`: boolean schema field.
- `src/sidebar-settings-values.ts`: boolean value type and default.
- `src/SidebarSettings.tsx`: checkbox and its save-feedback section.

The only additional file was the temporary test:
`src/server.setting-proof.test.ts`.

No repository, migration, handler, or browser-cache validation edit was needed.
During the experiment, blank lines in SidebarSettings.tsx made room for the
checkbox within its existing 535-line ceiling. The original formatting was
restored afterward.

Removed the setting and temporary test completely before committing this
report. Existing settings tests still assert every original setting value;
the expected records also include shared defaults so future fields do not
require edits to unrelated tests.
