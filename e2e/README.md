# Sidebar browser tests

Install dependencies with `npm ci`, then install only Chromium:

```sh
npx --no-install playwright install chromium
# On Linux, install the browser's OS dependencies too:
npx --no-install playwright install --with-deps chromium

env -i PATH="$PATH" HOME="$HOME" npm run e2e
env -i PATH="$PATH" HOME="$HOME" npm run e2e:smoke
# Run a focused flow through the same scratch launcher:
env -i PATH="$PATH" HOME="$HOME" npm run e2e -- --grep 'settle moves'
```

`@playwright/test` supplies role locators, retrying assertions, PNG comparisons,
and failure screenshots/traces. Both commands use `scripts/e2e/server.mjs` and
bb-app 0.46.0. Neither runs as part of `npm run check`. Run e2e separately from
Vitest; the scratch server and Chromium compete with the unit suite for CPU.

## Isolation and fixtures

The launcher creates its own `/tmp/bb-sidebar-smoke-*` data directory, two free
loopback ports, and a Git repository on branch `main`. It strips inherited
`BB_*` values through the original environment allowlist, rejects an inherited
`BB_SERVER_URL` on port 38886 before starting anything, and also rejects either
allocated port if it is 38886. Plugin installation, sidebar selection, project
creation, thread creation, RPC calls, and browser navigation target that server.
The launcher owns one server for the entire run, including test failures. It
stops detached process groups with TERM followed by KILL and deletes scratch
data on completion or SIGINT/SIGTERM. The CLI and server use the same pinned
bb-app package. `--app-dir <absolute-path>` can select another local bb-app for
compatibility checks; it does not select a running server or data directory.

The suite seeds four fixed-title threads using CLI `thread spawn --prompt ''`
with Codex and the scratch checkout, immediately followed by `thread stop`.
Each must reach `idle`, have an environment, have no queued messages, and have
no item/output/tool events or provider errors. Metadata warnings and account
announcements are allowed. An empty initial turn can start before stop arrives;
this is a create-and-cancel fixture, not a guarantee that no turn ever starts.
It supplies idle rows without completed agent output. The quick smoke keeps
the original seven-day scheduled fixture.

Seeding investigation: scheduled threads stayed `pending` even after queue
deletion and stop; unknown providers were rejected; idle forks required an
active provider session to clone. Empty-prompt creation and cancellation worked
without completed agent output. The fixtures exercise idle threads.
Working/attention/woke states stay outside this suite. Those stay in the wired tests.
There is no direct database mutation or mocked browser RPC response.

Each behavior test resets pin/read/lifecycle/order state through the scratch
CLI and plugin RPC, then gets a new browser context. The six flows assert
selection/rendering, pin persistence, Alt+ArrowUp manual order persistence,
snooze/wake, settle/Undo, and the complete right-click menu. Server assertions
check core pin/idle state and plugin lifecycle/order state. No production test
IDs were added. The visual capture uses the existing `data-bb-sidebar-root`
marker because the whole plugin container has no accessible role.

## Visual baselines

Three populated captures cover light, dark, and a 280 px wide plugin sidebar.
The wide captures are 320 px. The host's persisted width includes a 53 px
navigation rail/border, so the browser fixture adds that amount and asserts the
actual plugin width. Each image contains Pinned, Active, Snoozed, and Settled.
Titles, project name, branch, order, locale, and timezone are fixed. A capture
stylesheet hides relative update/wake labels while retaining layout, reduced
motion disables animation, and the mouse moves off the sidebar.

Baselines live in `e2e/__snapshots__/darwin/`. Playwright allows **100 differing
pixels**, with a per-pixel perceived-color threshold of **0.1**. Missing
baselines fail unless updating explicitly. Keep the pinned Playwright version
and Chromium download together when reviewing new baselines.

```sh
# On macOS, after an intentional UI change, with no unit suite running:
env -i PATH="$PATH" HOME="$HOME" npm run e2e -- --update-snapshots
# Inspect all three PNGs and git diff before committing them.
```

Only macOS has reviewed baselines, so Linux skips the three visual comparisons
and runs all six behavior tests. This avoids treating font/rendering differences
as product regressions. The nightly/manual Ubuntu workflow installs Chromium's
Linux dependencies and uploads `test-results/` and `playwright-report/` on
failure. Ubuntu execution and native addon installation need verification in
CI; they cannot be verified from this macOS checkout. Linux snapshots should be
added only after generating and reviewing them on the chosen runner.

Inspect failures with `npx --no-install playwright show-report` or
`npx --no-install playwright show-trace test-results/<test>/trace.zip`.
