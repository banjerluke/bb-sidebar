// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderSlot } from "./test-slot";
import { WORKING_EMPTY_LINES } from "./working-empty-lines";
import {
  inbox,
  defaultSidebarSettings,
  thread,
  listProps,
  render,
  nestedInteractiveControls,
  loadInboxApp,
} from "./test-inbox";

vi.mock("sonner", async () => (await import("./test-inbox")).sonnerMock());

await loadInboxApp();

describe("ThreadInbox", () => {
  // The host owns the search field; the plugin only filters by what it is
  // handed, so there is deliberately no second search box to type into.
  it("filters by the host's search query", () => {
    renderSlot(
      inbox,
      { ...listProps, searchQuery: "sidebar" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [thread({ id: "a", title: "Sidebar work" }), thread({ id: "b", title: "Something else" })],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: { listLifecycle: () => ({ rows: [] }) },
      },
    );
    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByText("Sidebar work")).toBeDefined();
  });

  it("includes matching child threads in search results", () => {
    renderSlot(
      inbox,
      { ...listProps, searchQuery: "needle" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({ id: "parent", title: "Parent" }),
            thread({
              id: "child",
              title: "Needle child",
              parentThreadId: "parent",
            }),
          ],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: { listLifecycle: () => ({ rows: [] }) },
      },
    );

    const results = screen.getByRole("listbox", {
      name: "Thread search results",
    });
    expect(within(results).getByText("Needle child")).toBeDefined();
  });

  it("shows matching threads from every shelf in one flat result list", async () => {
    const rendered = renderSlot(
      inbox,
      { ...listProps, searchQuery: "match" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({ id: "pin", title: "Pinned match", isPinned: true }),
            thread({ id: "active", title: "Active match" }),
            thread({ id: "snoozed", title: "Snoozed match" }),
            thread({ id: "settled", title: "Settled match" }),
          ],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: {
          listLifecycle: () => ({
            rows: [
              {
                threadId: "snoozed",
                settledAt: null,
                snoozedUntil: Date.now() + 3_600_000,
                snoozedAt: Date.now(),
              },
              {
                threadId: "settled",
                settledAt: Date.now(),
                snoozedUntil: null,
                snoozedAt: null,
              },
            ],
          }),
        },
      },
    );

    await waitFor(() =>
      expect(rendered.inspection.rpcCalls.some((call) => call.method === "listLifecycle")).toBe(true),
    );
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(4));

    const results = screen.getByRole("listbox", {
      name: "Thread search results",
    });
    expect(within(results).getByText("Snoozed match")).toBeDefined();
    expect(within(results).getByText("Settled match")).toBeDefined();
    expect(screen.queryByRole("region", { name: "Snoozed" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Settled" })).toBeNull();
  });

  // A plain search row puts the title, the project and the status on one line.
  // A fixed 112px project column left the title about six characters at a
  // 280px sidebar, so the project yields first: the title is what was searched
  // for. The woke row keeps its own two-row grid instead.
  it("caps the project proportionally on a single-line search row", async () => {
    renderSlot(
      inbox,
      { ...listProps, searchQuery: "match" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [thread({ id: "plain", title: "Match plain" })],
          projects: [{ id: "proj_1", name: "A very long project name", isPersonal: false, href: "", settingsHref: "" }],
        },
      },
    );

    const result = await screen.findByRole("option", { name: /Match plain/ });
    const project = within(result).getByText("A very long project name").parentElement!;
    expect(project.className).toContain("max-w-[30%]");
    expect(project.className.split(" ")).not.toContain("max-w-28");
  });

  it("keeps Woke beside pending, failed, running, and idle states in search", async () => {
    const acknowledged: string[] = [];
    let navigated = 0;
    const now = Math.floor(Date.now() / 60_000) * 60_000;
    window.localStorage.setItem("bb-sidebar:working-since:v1", JSON.stringify({ search_runtime: now - 5 * 60_000 }));
    const threads = [
      thread({
        id: "search_pending",
        title: "Match pending",
        indicator: "waiting-for-input",
        hasPendingInteraction: true,
      }),
      thread({
        id: "search_failed",
        title: "Match failed",
        indicator: "unread-error",
      }),
      thread({
        id: "search_runtime",
        title: "Match runtime",
        indicator: "runtime",
      }),
      thread({
        id: "search_idle",
        title: "Match idle",
        updatedAt: now - 31 * 60_000,
      }),
    ];

    const rendered = renderSlot(
      inbox,
      {
        ...listProps,
        searchQuery: "match",
        onNavigate: () => (navigated += 1),
      },
      {
        sidebarThreads: {
          status: "ready",
          threads,
          projects: [{ id: "proj_1", name: "A very long project name", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: {
          listLifecycle: () => ({
            rows: threads.map((candidate) => ({
              threadId: candidate.id,
              settledAt: null,
              snoozedUntil: candidate.id === "search_pending" ? now + 60_000 : now - 1,
              snoozedAt: now - 60_000,
            })),
          }),
          acknowledgeWake: (input) => {
            acknowledged.push((input as { threadId: string }).threadId);
            return { ok: true };
          },
        },
      },
    );

    const expected = [
      ["Match pending", "Needs you"],
      ["Match failed", "Failed"],
      ["Match runtime", "Working · 5m"],
      ["Match idle", "31m"],
    ] as const;
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(4));
    for (const [title, status] of expected) {
      const result = screen.getByRole("option", { name: new RegExp(title) });
      expect(within(result).getByText("Woke")).toBeDefined();
      expect(within(result).getByText(status)).toBeDefined();
      expect(within(result).queryByRole("button")).toBeNull();
    }

    fireEvent.click(screen.getByRole("option", { name: /Match runtime/ }));
    await waitFor(() => expect(acknowledged).toEqual(["search_runtime"]));
    expect(rendered.navigateCalls).toContainEqual({
      method: "toThread",
      threadId: "search_runtime",
      options: { split: false },
    });
    expect(navigated).toBe(1);
  });

  // The woke row is a two-row grid instead of a flex line, so the roving
  // listbox has to keep working across a mix of the two shapes.
  it("moves through woke and plain search results with the keyboard", async () => {
    const acknowledged: string[] = [];
    let navigated = 0;
    const now = Math.floor(Date.now() / 60_000) * 60_000;
    const rendered = renderSlot(
      inbox,
      {
        ...listProps,
        searchQuery: "match",
        onNavigate: () => (navigated += 1),
      },
      {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({
              id: "woke_match",
              title: "Woke match",
              indicator: "unread-error",
              indicatorLabel: "Unread thread failed",
              updatedAt: now,
            }),
            thread({
              id: "plain_match",
              title: "Plain match",
              updatedAt: now - 31 * 60_000,
            }),
          ],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: {
          listLifecycle: () => ({
            rows: [
              {
                threadId: "woke_match",
                settledAt: null,
                snoozedUntil: now - 1,
                snoozedAt: now - 60_000,
              },
            ],
          }),
          acknowledgeWake: (input) => {
            acknowledged.push((input as { threadId: string }).threadId);
            return { ok: true };
          },
        },
      },
    );

    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(2));
    const options = screen.getAllByRole("option");
    const woke = options.find((option) => within(option).queryByText("Woke") !== null)!;
    const plain = options.find((option) => option !== woke)!;
    // Woke, the real status, and the project all keep their place on the row.
    expect(within(woke).getByText("Failed")).toBeDefined();
    expect(within(woke).getByText("bb")).toBeDefined();
    expect(within(plain).getByText("31m")).toBeDefined();
    expect(within(plain).queryByText("Woke")).toBeNull();
    // Woke is text in search, not a control: an option must not nest one.
    expect(within(woke).queryByRole("button")).toBeNull();
    expect(nestedInteractiveControls(woke)).toEqual([]);

    const next = options[(options.indexOf(woke) + 1) % options.length]!;
    woke.focus();
    fireEvent.keyDown(woke, { key: "ArrowDown" });
    expect(document.activeElement).toBe(next);
    fireEvent.keyDown(next, { key: "ArrowUp" });
    expect(document.activeElement).toBe(woke);
    expect(woke.tabIndex).toBe(0);
    expect(plain.tabIndex).toBe(-1);

    fireEvent.keyDown(woke, { key: "Enter" });
    await waitFor(() => expect(acknowledged).toEqual(["woke_match"]));
    expect(rendered.navigateCalls).toContainEqual({
      method: "toThread",
      threadId: "woke_match",
      options: { split: false },
    });
    expect(navigated).toBe(1);
  });

  // The woke grid moves the project name to its own row. Without a project
  // there is nothing to move, and the accessible name stays the bare title.
  it("keeps Woke and the status on a search result with no project", async () => {
    const now = Math.floor(Date.now() / 60_000) * 60_000;
    renderSlot(
      inbox,
      { ...listProps, searchQuery: "match" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({
              id: "orphan_match",
              title: "Orphan match",
              projectId: "proj_unknown",
              indicator: "unread-success",
              indicatorLabel: "Unread thread succeeded",
              updatedAt: now,
            }),
          ],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: {
          listLifecycle: () => ({
            rows: [
              {
                threadId: "orphan_match",
                settledAt: null,
                snoozedUntil: now - 1,
                snoozedAt: now - 60_000,
              },
            ],
          }),
        },
      },
    );

    const result = await screen.findByRole("option", { name: "Orphan match" });
    expect(within(result).getByText("Woke")).toBeDefined();
    expect(within(result).getByText("Unread")).toBeDefined();
  });

  // The slot renders one status, and a raised hand outranks the runtime bb
  // still reports for the same thread.
  it("prefers a pending question to a running indicator in search results", async () => {
    const now = Math.floor(Date.now() / 60_000) * 60_000;
    window.localStorage.setItem("bb-sidebar:working-since:v1", JSON.stringify({ asking_match: now - 5 * 60_000 }));
    renderSlot(
      inbox,
      { ...listProps, searchQuery: "match" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({
              id: "asking_match",
              title: "Asking match",
              hasPendingInteraction: true,
              indicator: "runtime",
              indicatorLabel: "Agent is working",
              updatedAt: now,
            }),
          ],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: { listLifecycle: () => ({ rows: [] }) },
      },
    );

    const result = await screen.findByRole("option", { name: /Asking match/ });
    expect(within(result).getByText("Needs you")).toBeDefined();
    expect(within(result).queryByText(/^Working/)).toBeNull();
    // The runtime's own label must not outlive the status it was replaced by.
    expect(within(result).getByLabelText("Needs you")).toBeDefined();
    expect(within(result).queryByLabelText("Agent is working")).toBeNull();
  });

  it("keeps project scope active while searching", async () => {
    renderSlot(
      inbox,
      { ...listProps, searchQuery: "match" },
      {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({ id: "a", title: "First match", projectId: "proj_1" }),
            thread({ id: "b", title: "Second match", projectId: "proj_2" }),
          ],
          projects: [
            { id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" },
            { id: "proj_2", name: "other", isPersonal: false, href: "", settingsHref: "" },
          ],
        },
        rpc: { listLifecycle: () => ({ rows: [] }) },
      },
    );

    fireEvent.keyDown(screen.getByLabelText(/Project scope/), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "other" }));
    await waitFor(() => expect(screen.getAllByRole("option", { name: /Second match/ })).toHaveLength(1));
    expect(screen.queryByText("First match")).toBeNull();
  });

  it("filters the project scope card from its search row", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({ id: "a", title: "Sidebar thread", projectId: "proj_1" }),
          thread({ id: "b", title: "Board thread", projectId: "proj_2" }),
        ],
        projects: [
          { id: "proj_1", name: "bb-sidebar", isPersonal: false, href: "", settingsHref: "" },
          { id: "proj_2", name: "kanban", isPersonal: false, href: "", settingsHref: "" },
        ],
      },
      rpc: { listLifecycle: () => ({ rows: [] }) },
    });

    fireEvent.keyDown(screen.getByLabelText(/Project scope/), { key: "Enter" });
    // The card opens with the caret already in the search row.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Filter projects")));
    const projectList = screen.getByRole("listbox", { name: "Projects" });
    expect(within(projectList).getAllByRole("option")).toHaveLength(3);

    fireEvent.change(screen.getByLabelText("Filter projects"), {
      target: { value: "KAN" },
    });
    expect(
      within(projectList)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["kanban"]);

    // Enter takes the highlighted row, which filtering moved to the top.
    fireEvent.keyDown(screen.getByLabelText("Filter projects"), {
      key: "Enter",
    });
    await waitFor(() => expect(screen.getByLabelText(/Project scope: kanban/)).toBeDefined());
    expect(screen.getByText("Board thread")).toBeDefined();
    expect(screen.queryByText("Sidebar thread")).toBeNull();
  });

  it("says so when no project matches the scope search", () => {
    render([thread({ title: "Sidebar thread" })]);

    fireEvent.keyDown(screen.getByLabelText(/Project scope/), { key: "Enter" });
    fireEvent.change(screen.getByLabelText("Filter projects"), {
      target: { value: "nope" },
    });
    expect(within(screen.getByRole("listbox", { name: "Projects" })).queryAllByRole("option")).toHaveLength(0);
    expect(screen.getByText("No projects found")).toBeDefined();
  });

  it("moves through results with arrows and opens the highlighted row", async () => {
    let navigated = 0;
    const rendered = renderSlot(
      inbox,
      {
        ...listProps,
        searchQuery: "thread",
        onNavigate: () => (navigated += 1),
      },
      {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({ id: "newer", title: "Newer thread", createdAt: 2 }),
            thread({ id: "older", title: "Older thread", createdAt: 1 }),
          ],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: { listLifecycle: () => ({ rows: [] }) },
      },
    );

    const results = await screen.findAllByRole("option");
    results[0]!.focus();
    fireEvent.keyDown(results[0]!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(results[1]);
    expect(results[1]!.tabIndex).toBe(0);

    fireEvent.keyDown(results[1]!, { key: "Enter" });
    expect(rendered.navigateCalls).toContainEqual({
      method: "toThread",
      threadId: "older",
      options: { split: false },
    });
    expect(navigated).toBe(1);
  });

  it("asks the host to clear search when Escape is pressed in results", async () => {
    let cleared = 0;
    renderSlot(
      inbox,
      {
        ...listProps,
        searchQuery: "thread",
        onNavigate: () => (cleared += 1),
      },
      {
        sidebarThreads: {
          status: "ready",
          threads: [thread({ title: "A thread" })],
          projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: { listLifecycle: () => ({ rows: [] }) },
      },
    );

    const result = await screen.findByRole("option");
    result.focus();
    fireEvent.keyDown(result, { key: "Escape" });
    expect(cleared).toBe(1);
  });

  it("ships no search field of its own", () => {
    render([thread({ id: "a" })]);
    expect(screen.queryByLabelText("Search threads")).toBeNull();
  });

  it("ships no new-thread button of its own", () => {
    render([thread({ id: "a" })]);
    expect(screen.queryByLabelText("New thread")).toBeNull();
  });

  it("scopes to one project", () => {
    render(
      [
        thread({ id: "a", title: "In bb", projectId: "proj_1" }),
        thread({ id: "b", title: "In other", projectId: "proj_2" }),
      ],
      [
        { id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" },
        { id: "proj_2", name: "other", isPersonal: false, href: "", settingsHref: "" },
      ],
    );
    // Radix opens on keyboard too, which jsdom can drive without pointer
    // capture. Enter opens the list; the option click picks the scope.
    fireEvent.keyDown(screen.getByLabelText(/Project scope/), { key: "Enter" });
    fireEvent.click(screen.getByRole("option", { name: "other" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("In other")).toBeDefined();
  });

  it("hides archived threads", () => {
    render([thread({ id: "a", isArchived: true })]);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("invites a break when there are no active threads", () => {
    const view = render([]);
    expect(screen.getByText("All clear. Time to touch some grass.")).toBeDefined();
    expect(view.container.querySelector("svg")).not.toBeNull();
  });

  it("shows a working scene when every thread is working", async () => {
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "busy", title: "Busy work", indicator: "runtime" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: {
        getSidebarSettings: () => ({
          ...defaultSidebarSettings,
          inactiveThreadsEnabled: false,
          workingShelf: true,
        }),
        listLifecycle: () => ({ rows: [] }),
      },
    });
    const lines: readonly string[] = WORKING_EMPTY_LINES;
    expect(await screen.findByText((text) => lines.includes(text))).toBeDefined();
    expect(screen.queryByText("All clear. Time to touch some grass.")).toBeNull();
  });
});
