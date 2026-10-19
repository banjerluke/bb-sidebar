// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { PluginSidebarSection, PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { renderSlot } from "./test-slot";
import { inbox, thread, listProps, loadInboxApp } from "./test-inbox";

vi.mock("sonner", async () => (await import("./test-inbox")).sonnerMock());
await loadInboxApp();

function section(id: string, name: string): PluginSidebarSection {
  return { id, name, createdAt: 1, updatedAt: 1 };
}

const SECTIONS = [section("later", "Later"), section("ideas", "Ideas"), section("review", "Review")];

function setup({
  rows = [
    thread({ id: "a", title: "Loose A", updatedAt: 1 }),
    thread({ id: "b", title: "Later B", sectionId: "later", updatedAt: 3 }),
    thread({ id: "c", title: "Review C", sectionId: "review" }),
    thread({ id: "d", title: "Later D", sectionId: "later", updatedAt: 5 }),
    thread({ id: "p", title: "Pinned idea", sectionId: "ideas", isPinned: true }),
  ],
  order = "manual",
  activeThreadId = null,
}: {
  rows?: PluginSidebarThread[];
  order?: string;
  activeThreadId?: string | null;
} = {}) {
  localStorage.setItem("bb-sidebar:active-view:v1", JSON.stringify({ group: "section", order }));
  let sectionIds = ["review", "later"];
  const rendered = renderSlot(
    inbox,
    { ...listProps, activeThreadId },
    {
      sidebarThreads: {
        status: "ready",
        threads: rows,
        sections: SECTIONS,
        projects: [{ id: "proj_1", name: "Sidebar", isPersonal: false, href: "", settingsHref: "" }],
      },
      sdk: {
        threadSections: {
          create: async ({ name }: { name: string }) => section("sec_new", name),
          delete: async ({ id }: { id: string }) => ({ id, name: "", updatedThreadCount: 0 }),
        },
      },
      rpc: {
        listLifecycle: () => ({ rows: [] }),
        listInboxOrder: () => ({ inboxThreadIds: ["a", "b", "c", "d"] }),
        listSectionOrder: () => ({ sectionIds }),
        reorderSections: (input) => {
          sectionIds = (input as { sectionIds: string[] }).sectionIds;
          return { sectionIds };
        },
        moveThreadToSection: () => ({ movedThreadIds: [] }),
      },
    },
  );
  const active = screen.getByRole("region", { name: "Active" });
  const headers = () =>
    within(active)
      .getAllByRole("button", { name: /\(\d+\)$/ })
      .map((header) => header.getAttribute("aria-label"));
  const rowsIn = (name: string) =>
    within(within(active).getByRole("region", { name }))
      .queryAllByRole("link")
      .map((link) => link.getAttribute("aria-label"));
  const calls = (method: string) =>
    rendered.rpcCalls.filter((call) => call.method === method).map((call) => call.input);
  return { ...rendered, active, headers, rowsIn, calls };
}

it("groups Active by section in the saved order, then Threads, then a folded footer of empty sections", async () => {
  const { active, headers, rowsIn } = setup();
  await waitFor(() => expect(headers()).toEqual(["Review (1)", "Later (2)"]));
  expect(rowsIn("Later section")).toEqual(["Later B", "Later D"]);
  expect(rowsIn("Threads")).toEqual(["Loose A"]);
  // Ideas has only a pinned thread, so it is folded with the empty sections.
  const footer = within(active).getByRole("button", { name: "1 empty section", expanded: false });
  fireEvent.click(footer);
  const empty = within(active).getByRole("list", { name: "Empty sections" });
  expect(empty.textContent).toContain("Ideas");
  expect(empty.textContent).toContain("1 pinned");
  expect(localStorage.getItem("bb-sidebar:empty-sections-expanded:v1")).toBe("true");
});

it("sorts rows inside sections without moving the sections themselves", async () => {
  const { headers, rowsIn } = setup({ order: "activity" });
  await waitFor(() => expect(headers()).toEqual(["Review (1)", "Later (2)"]));
  expect(rowsIn("Later section")).toEqual(["Later D", "Later B"]);
});

it("collapses a section but keeps its open thread reachable", async () => {
  const { active, rowsIn } = setup({ activeThreadId: "d" });
  fireEvent.click(await within(active).findByRole("button", { name: "Later (2)", expanded: true }));
  expect(rowsIn("Later section")).toEqual(["Later D"]);
  expect(localStorage.getItem("bb-sidebar:section-collapse:v1")).toBe('["later"]');
});

it("moves a section header from the keyboard", async () => {
  const { active, calls } = setup();
  const header = await within(active).findByRole("button", { name: "Review (1)" });
  await waitFor(() => expect(within(active).getAllByRole("button", { name: /\(\d+\)$/ })[0]).toBe(header));
  fireEvent.keyDown(header, { key: "ArrowDown", altKey: true });
  // Ideas is folded away, so it keeps its slot at the end.
  await waitFor(() => expect(calls("reorderSections")).toEqual([{ sectionIds: ["later", "review", "ideas"] }]));
});

it("files a thread from the row menu, including into a new section", async () => {
  const { calls, sdkCalls } = setup();
  for (const choose of ["Ideas", "New"] as const) {
    fireEvent.contextMenu(await screen.findByText("Loose A"));
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Move to section" }), { key: "ArrowRight" });
    const input = await screen.findByRole("textbox", { name: "New section name" });
    const menu = input.closest<HTMLElement>('[role="menu"]')!;
    expect(
      within(menu)
        .getAllByRole("menuitemradio")
        .map((item) => item.textContent),
    ).toEqual(["Review", "Later", "Ideas", "Threads"]);
    if (choose === "Ideas") {
      fireEvent.click(within(menu).getByRole("menuitemradio", { name: "Ideas" }));
    } else {
      fireEvent.change(input, { target: { value: " Someday " } });
      fireEvent.keyDown(input, { key: "Enter" });
    }
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  }
  await waitFor(() =>
    expect(calls("moveThreadToSection")).toEqual([
      { threadId: "a", sectionId: "ideas" },
      { threadId: "a", sectionId: "sec_new" },
    ]),
  );
  expect(sdkCalls).toContainEqual({ method: "threadSections.create", args: [{ name: "Someday" }] });
});

it("files a dragged row onto another section's header instead of reordering it", async () => {
  const { active, calls } = setup();
  const later = await within(active).findByRole("button", { name: "Later (2)" });
  vi.mocked(document.elementFromPoint).mockReturnValue(later);
  fireEvent.pointerDown(within(active).getByRole("link", { name: "Loose A" }), {
    button: 0,
    clientX: 20,
    clientY: 90,
    pointerId: 1,
  });
  fireEvent.pointerMove(window, { buttons: 1, clientX: 20, clientY: 30, pointerId: 1 });
  expect(later.className).toContain("ring-1");
  fireEvent.pointerUp(window, { clientX: 20, clientY: 30, pointerId: 1 });
  await waitFor(() => expect(calls("moveThreadToSection")).toEqual([{ threadId: "a", sectionId: "later" }]));
  expect(calls("reorderInbox")).toEqual([]);
  expect(later.className).not.toContain("ring-1");
});

it("removes a section after naming how many threads go back to Threads", async () => {
  const { active, sdkCalls } = setup();
  fireEvent.contextMenu(await within(active).findByRole("button", { name: "Later (2)" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Remove section…" }));
  const dialog = await screen.findByRole("dialog", { name: "Remove “Later”?" });
  expect(dialog.textContent).toContain("Its 2 threads will move back to Threads.");
  fireEvent.click(within(dialog).getByRole("button", { name: "Remove section" }));
  await waitFor(() => expect(sdkCalls).toContainEqual({ method: "threadSections.delete", args: [{ id: "later" }] }));
});

it("keeps keyboard moves inside a section while Active is collapsed", async () => {
  localStorage.setItem("bb-sidebar:shelf-expansion:v1", JSON.stringify({ active: false }));
  const { active, calls } = setup({
    rows: [
      thread({ id: "b", title: "Later B", sectionId: "later" }),
      thread({ id: "c", title: "Review C", sectionId: "review" }),
      thread({ id: "cb", parentThreadId: "b", title: "Child B", hasPendingInteraction: true }),
      thread({ id: "cc", parentThreadId: "c", title: "Child C", hasPendingInteraction: true }),
    ],
  });
  fireEvent.keyDown(await within(active).findByRole("link", { name: "Review C" }), { key: "ArrowUp", altKey: true });
  expect(screen.getByRole("status").textContent).toBe("Review C is already first in Active");
  expect(calls("reorderInbox")).toEqual([]);
});
