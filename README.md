# BB Sidebar

A stable thread list for [bb](https://github.com/get-bb/bb). Threads stay where you put them while status, snooze, and settle actions remain close at hand.

![BB Sidebar in light mode](docs/screenshots/sidebar-light.jpeg)

![BB Sidebar in dark mode](docs/screenshots/sidebar-dark.jpeg)

![BB Sidebar empty state](docs/screenshots/sidebar-empty.jpeg)

## Features

- Manual ordering plus Recent activity and Date created sorts, with optional grouping by project or section
- Section grouping with bb's thread sections: draggable section order, Move to section with children following, drag-to-file onto section headers, and a folded row for empty sections
- Optional worktree grouping in Project grouping: threads that share a worktree get collapsible groups
- Pinned, Active, Inactive, Snoozed, Parked, and Settled shelves
- Full cards, compact working threads, or compact all threads, with options to keep pinned or woken threads full
- Searchable multi-project filtering, remembered per window across reloads
- Optional project colors with per-project color selection. Names stay colored in every mode; show stripes in full and collapsed mode, full mode only, or grouped projects only
- Automatic project icons with custom overrides
- Expandable child-thread indicators with running and attention states, on shelf rows too
- Live status, branch, pull request, and provider details, plus statuses set by other plugins
- Workspace port discovery, hover-card details, and optional browser links
- A Clean button in Settled that previews and closes live terminals and verified thread-owned listening ports, while protecting Active and Working threads
- Configurable inactive-thread and automatic cleanup rules
- Native bb navigation, split, rename, archive, and delete flows
- Project submenu on thread cards for settings, rename, local paths, and removal
- Regenerate a thread title from its last three accepted user messages
- Automatically retry missing thread titles once in the background, respecting the selected AI title service and manual edits

Hover a thread and click the check to settle it. The three-dots button beside it holds the other ways to clear a row: snooze presets, a date picker, **Park thread**, and **Archive**.

Park threads while waiting on someone else. Use **Park thread** in that menu or the context menu, and **Resume** when ready. Parked threads have no timer and are excluded from automatic cleanup. Opening one leaves it parked; new thread activity brings it back to Active.

Use **Parent** in a thread's context menu to search threads in the same project, choose a parent, or select **None** to remove it. The current parent is checked; the thread itself and its descendants are excluded.

## Install

```sh
bb plugin install git:https://github.com/yusuf8834/bb-sidebar.git
```

Then choose **BB Sidebar** under **Settings > Appearance > Sidebar**.

## Development

```sh
npm install
npm run build
bb plugin install path:. --yes
```

## Credits

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for details.
