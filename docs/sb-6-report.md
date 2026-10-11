# SB-6 implementation report

Implemented as seven ordered commits with hooks enabled. No push, PR, or merge.
The task remains in_progress and this worker remains attached.

## Server modules

| File | Lines | Responsibility |
| --- | ---: | --- |
| `src/server.ts` | 193 | Migrations, context creation, wiring, HTTP, events |
| `src/server-context.ts` | 9 | SDK/database context and RPC handler types |
| `src/server-settings.ts` | 94 | JSON settings and legacy import |
| `src/server-lifecycle.ts` | 296 | Rows, ancestor wakes, inbox order, thread loading, locks |
| `src/server-project-icons.ts` | 362 | Resolution, icon caches, overrides, uploads |
| `src/server-project-colors.ts` | 30 | Color reads and writes |
| `src/server-project-management.ts` | 71 | Project names, paths, removal |
| `src/server-settle-cleanup.ts` | 450 | Preview, cleanup, reclaim |
| `src/server-settle-actions.ts` | 216 | Tree settle, Return to Active, Undo |
| `src/server-policy.ts` | 249 | Automatic settle evaluation and revision state |
| `src/server-handlers.ts` | 253 | Complete RPC handler assembly |

All 38 RPC handlers remain registered. Cache and concurrency state belongs
to each module factory instance; ServerContext contains the SDK and database.
A normalized function-body comparison against the original server found only
the two settings repository bodies and policy revision ownership changed.

## Settings migration

The SDK appends each SQL statement as a migration index. Existing migration
indices are unchanged. The three appended statements are:

```sql
ALTER TABLE sidebar_settings ADD COLUMN settings_json TEXT;
UPDATE sidebar_settings SET settings_json = json_object(
     'snoozePresets', snooze_presets,
     'inactiveThreadsEnabled', json(CASE WHEN inactive_threads_enabled = 1 THEN 'true' ELSE 'false' END),
     'inactiveAfterHours', inactive_after_hours,
     'showRunningChildrenWhenCollapsed', json(CASE WHEN show_running_children_when_collapsed = 1 THEN 'true' ELSE 'false' END),
     'autoSettleInactive', json(CASE WHEN auto_settle_inactive = 1 THEN 'true' ELSE 'false' END),
     'autoSettleAfterDays', auto_settle_after_days,
     'autoSettleOnMerge', json(CASE WHEN auto_settle_on_merge = 1 THEN 'true' ELSE 'false' END),
     'childSortField', child_sort_field,
     'childSortDirection', child_sort_direction,
     'childIconStyle', child_icon_style,
     'compactWorkingThreads', json(CASE WHEN compact_working_threads = 1 THEN 'true' ELSE 'false' END),
     'workingShelf', json(CASE WHEN working_shelf = 1 THEN 'true' ELSE 'false' END),
     'dockShelves', json(CASE WHEN dock_shelves = 1 THEN 'true' ELSE 'false' END),
     'projectColorsEnabled', json(CASE WHEN project_colors_enabled = 1 THEN 'true' ELSE 'false' END),
     'projectColorDisplay', project_color_display
   ) WHERE id = 1;
INSERT OR IGNORE INTO sidebar_settings
     (id, snooze_presets, inactive_threads_enabled, inactive_after_hours,
      auto_settle_inactive, auto_settle_after_days, auto_settle_on_merge)
   VALUES (1, '', 1, 6, 1, 3, 1);
```

The seed is needed because six retained columns are NOT NULL without defaults.
It runs once in migration. NULL JSON represents no stored settings, so the
server still imports legacy SDK settings at startup. Normal saves update JSON
only. The retained columns can be dropped with a table rebuild in a later major.

Reads merge shared defaults, then apply a per-field zod catch derived from the
same defaults, and finally validate with sidebarSettingsSchema. Invalid fields
fall back independently; malformed JSON falls back to all defaults. Unknown
stored keys are stripped, while RPC input validation stays strict.

## Three-file setting proof

Temporary production changes were limited to:

- `src/contract.ts`
- `src/sidebar-settings-values.ts`
- `src/SidebarSettings.tsx`

The temporary test was `src/server.setting-proof.test.ts`. All 869 tests passed
with experimentalFoo installed. The wired test clicked its checkbox, inspected
JSON storage, and checked the setting after a server reload. The setting and
test were completely removed before committing. See sb-6-setting-proof.md.

## Golden fixtures

| Version | Database settings and lifecycle | Boolean migration/read | Hash |
| --- | --- | --- | --- |
| v0.2.34 | Passed, original values | Passed, false and true | Original unchanged |
| main-3578240 | Passed, original values | Passed, false and true | Original unchanged |
| json-e77d70b | Passed, post-change values | Passed, false and true | Verified |

New fixture: `src/fixtures/sidebar-json-e77d70b.sqlite`.
Generated from branch HEAD e77d70bb4159a913b72931b5f90fd86201f96bb3.
SHA-256: `0f371834888758420d0684e559cea95a6dbfe5f4b363fb60f65149950684dd16`.

All 17 fixture tests pass. Existing databases and browser cache snapshots were
not edited. A separate regeneration of pinned v0.2.34 produced its original
SHA-256: `18c225ce847e9f14e532e2fa36466b96ab64c3dbc3774e211f4e57bd5109d2d2`.

## Inbox fallback and validation

Removed useSettings and legacySettings from ThreadInbox. An uncached loading
view keeps threads Active until server settings arrive, and cached values still
render immediately. Default snooze presets and inactivity hours stay unchanged.

Sixteen test cases across active-shelf, menu-editing, menu-navigation, and shelves
depended on legacy fixture inputs. Inputs now use cached server settings with
matching getSidebarSettings RPC responses. Inbox-order inputs were also updated.
All assertions retain their meaning. All 351 inbox tests in 33 files pass.

npm ci installed pinned dependencies and the common Git hooks. npm run check
passed before work and before every commit: lint, import boundaries, size gate,
format, Knip, typecheck, Vitest, plugin build, and browser bundle guard. Final
suite: 872 tests in 93 files. Seven added settings tests and four additional
fixture tests account for the increase from the 861-test baseline.

One early context check hit three UI timeout failures; the unchanged tests
passed on rerun. No timeout or hook was bypassed.

The separate bb plugin types --check fails both at baseline and after changes:
the repository pins SDK 0.6.15 and the installed host requires 0.6.39. The build
warns about the same mismatch but succeeds. Updating the SDK pin would expand
this behavior-preserving refactor, so the existing pin remains. Browser cache
schema validation remains unchanged, as requested for SB-7.
