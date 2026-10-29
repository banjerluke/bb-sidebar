// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderSlot } from "./test-slot";
import { inbox, defaultSidebarSettings, thread, listProps, loadInboxApp, rowLinks } from "./test-inbox";

vi.mock("sonner", async () => (await import("./test-inbox")).sonnerMock());

await loadInboxApp();

const savedProjectOrder = () => JSON.parse(window.localStorage.getItem("bb-sidebar:project-order:v1") ?? "null");

describe("ThreadInbox", () => {
  describe("moving projects as a whole", () => {
    it.each([true, false])(
      "retains scoped active and deep queued attention in a collapsed project: setting=%s",
      async (showAttention) => {
        window.localStorage.setItem("bb-sidebar:active-sort:v1", "project");
        window.localStorage.setItem("bb-sidebar:project-collapse:v1", JSON.stringify(["web"]));
        const rendered = renderSlot(
          inbox,
          { ...listProps, activeThreadId: "b" },
          {
            sidebarThreads: {
              status: "ready",
              threads: [
                thread({ id: "a", projectId: "web", title: "Attention root", updatedAt: Date.now() }),
                thread({ id: "b", projectId: "web", title: "Active root", updatedAt: Date.now() }),
                thread({ id: "child", projectId: "web", parentThreadId: "a", title: "Child" }),
                thread({ id: "grandchild", projectId: "web", parentThreadId: "child", title: "Grandchild" }),
                thread({
                  id: "deep",
                  projectId: "web",
                  parentThreadId: "grandchild",
                  title: "Queued failed leaf",
                  queuedWork: "failed",
                }),
              ],
              projects: [{ id: "web", name: "Web", isPersonal: false, href: "", settingsHref: "" }],
            },
            rpc: {
              getSidebarSettings: () => ({
                ...defaultSidebarSettings,
                showRunningChildrenWhenCollapsed: showAttention,
              }),
              listLifecycle: () => ({ rows: [] }),
              listInboxOrder: () => ({ inboxThreadIds: ["a", "b", "child", "grandchild", "deep"] }),
            },
          },
        );
        await waitFor(() => expect(rendered.rpcCalls.some((call) => call.method === "getSidebarSettings")).toBe(true));
        const active = screen.getByRole("region", { name: "Active" });
        await waitFor(() =>
          expect(rowLinks(active).map((row) => row.getAttribute("aria-label"))).toEqual(
            showAttention ? ["Attention root", "Active root"] : ["Active root"],
          ),
        );
        expect(within(active).getByRole("button", { name: "Web (2)", expanded: false })).toBeDefined();
        expect(Boolean(within(active).queryByText("Queued failed leaf"))).toBe(showAttention);
        expect(rendered.rpcCalls.filter((call) => call.method.startsWith("reorder"))).toEqual([]);
      },
    );

    it.each(["keyboard", "pointer"])("persists collapsed project attention rows: %s", async (gesture) => {
      window.localStorage.setItem("bb-sidebar:active-sort:v1", "project");
      window.localStorage.setItem("bb-sidebar:shelf-expansion:v1", JSON.stringify({ active: false }));
      const childIds = ["a1", "a2", "a3", "b1"];
      const storedIds = ["a", "x", "b", "c", ...childIds];
      const rendered = renderSlot(inbox, listProps, {
        sidebarThreads: {
          status: "ready",
          threads: [
            ...["a", "b", "c"].map((id) => thread({ id, projectId: "web", title: `Web ${id}`, updatedAt: Date.now() })),
            thread({ id: "x", projectId: "api", title: "Hidden other project", updatedAt: Date.now() }),
            thread({ id: "a1", projectId: "web", parentThreadId: "a", title: "Child a" }),
            thread({ id: "a2", projectId: "web", parentThreadId: "a1", title: "Grandchild a" }),
            thread({ id: "a3", projectId: "web", parentThreadId: "a2", title: "Deep failed", queuedWork: "failed" }),
            thread({
              id: "b1",
              projectId: "web",
              parentThreadId: "b",
              title: "Child b",
              hasPendingInteraction: true,
            }),
          ],
          projects: [
            { id: "web", name: "Web", isPersonal: false, href: "", settingsHref: "" },
            { id: "api", name: "Api", isPersonal: false, href: "", settingsHref: "" },
          ],
        },
        rpc: {
          getSidebarSettings: () => defaultSidebarSettings,
          listLifecycle: () => ({ rows: [] }),
          listInboxOrder: () => ({ inboxThreadIds: storedIds }),
          reorderInbox: (input) => input,
        },
      });
      const active = await screen.findByRole("region", { name: "Active" });
      const rowOrder = () => rowLinks(active).map((row) => row.getAttribute("aria-label"));
      await waitFor(() => expect(rowOrder()).toEqual(["Web a", "Web b"]));
      expect(within(active).queryByRole("button", { name: "Web (3)" })).toBeNull();
      expect(within(active).getByText("Deep failed")).toBeDefined();
      const card = within(active).getByRole("link", { name: "Web a" });
      let preview: Array<string | null> | undefined;
      if (gesture === "keyboard") {
        fireEvent.keyDown(card, { key: "ArrowDown", altKey: true });
      } else {
        const target = within(active).getByRole("link", { name: "Web b" }).closest("li")!;
        vi.mocked(document.elementFromPoint).mockReturnValue(target);
        fireEvent.pointerDown(card, { button: 0, clientX: 20, clientY: 0, pointerId: 1 });
        fireEvent.pointerMove(window, { buttons: 1, clientX: 20, clientY: 60, pointerId: 1 });
        preview = rowOrder();
        fireEvent.pointerUp(window, { clientX: 20, clientY: 60, pointerId: 1 });
      }
      await waitFor(() => expect(rendered.rpcCalls.filter((call) => call.method === "reorderInbox")).toHaveLength(1));
      const expectedVisible = ["Web b", "Web a"];
      expect({ preview, input: rendered.rpcCalls.find((call) => call.method === "reorderInbox")!.input }).toEqual({
        preview: gesture === "pointer" ? expectedVisible : undefined,
        input: { inboxThreadIds: ["b", "x", "a", "c", ...childIds] },
      });
      await waitFor(() => expect(rowOrder()).toEqual(expectedVisible));
      fireEvent.click(within(active).getByRole("button", { name: /^Active/, expanded: false }));
      expect(within(active).getByRole("button", { name: "Web (3)" })).toBeDefined();
      expect(within(active).getByRole("link", { name: "Web c" })).toBeDefined();
      expect(rendered.rpcCalls.filter((call) => /^(pin|setThreadParent|reorderPinned)$/.test(call.method))).toEqual([]);
    });

    it.each(["shelf", "project"].flatMap((fold) => ["keyboard", "pointer"].map((gesture) => ({ fold, gesture }))))(
      "F1 keeps hidden sibling slot: $fold/$gesture",
      async ({ fold, gesture }) => {
        window.localStorage.setItem("bb-sidebar:active-sort:v1", "project");
        if (fold === "shelf")
          window.localStorage.setItem("bb-sidebar:shelf-expansion:v1", JSON.stringify({ active: false }));
        else window.localStorage.setItem("bb-sidebar:project-collapse:v1", JSON.stringify(["web"]));
        const order = ["a", "hidden", "b", "ca", "cb"];
        const rendered = renderSlot(inbox, listProps, {
          sidebarThreads: {
            status: "ready",
            projects: [{ id: "web", name: "Web", isPersonal: false, href: "", settingsHref: "" }],
            threads: [
              ...["a", "hidden", "b"].map((id) => thread({ id, title: id, projectId: "web", updatedAt: Date.now() })),
              thread({ id: "ca", title: "ca", projectId: "web", parentThreadId: "a", hasPendingInteraction: true }),
              thread({ id: "cb", title: "cb", projectId: "web", parentThreadId: "b", hasPendingInteraction: true }),
            ],
          },
          rpc: {
            getSidebarSettings: () => defaultSidebarSettings,
            listLifecycle: () => ({ rows: [] }),
            listInboxOrder: () => ({ inboxThreadIds: order }),
            reorderInbox: (input) => input,
          },
        });
        const active = screen.getByRole("region", { name: "Active" });
        const visible = () => rowLinks(active).map((e) => e.getAttribute("aria-label"));
        await waitFor(() => expect(visible()).toEqual(["a", "b"]));
        await waitFor(() => expect(rendered.rpcCalls.some((c) => c.method === "listInboxOrder")).toBe(true));
        const a = within(active).getByRole("link", { name: "a" });
        if (gesture === "keyboard") fireEvent.keyDown(a, { key: "ArrowDown", altKey: true });
        else {
          vi.mocked(document.elementFromPoint).mockReturnValue(
            within(active).getByRole("link", { name: "b" }).closest("li")!,
          );
          fireEvent.pointerDown(a, { button: 0, clientX: 20, clientY: 0, pointerId: 1 });
          fireEvent.pointerMove(window, { buttons: 1, clientX: 20, clientY: 60, pointerId: 1 });
          expect(visible()).toEqual(["b", "a"]);
          fireEvent.pointerUp(window, { clientX: 20, clientY: 60, pointerId: 1 });
        }
        await waitFor(() => expect(rendered.rpcCalls.filter((c) => c.method === "reorderInbox")).toHaveLength(1));
        const actual = rendered.rpcCalls.find((c) => c.method === "reorderInbox")!.input;
        expect(actual).toEqual({ inboxThreadIds: ["b", "hidden", "a", "ca", "cb"] });
      },
    );
    it("F1 rebases participating siblings onto a pushed order without moving hidden slots", async () => {
      window.localStorage.setItem("bb-sidebar:active-sort:v1", "project");
      window.localStorage.setItem("bb-sidebar:shelf-expansion:v1", JSON.stringify({ active: false }));
      let order = ["a", "hidden", "b", "z", "ca", "cb"];
      const rendered = renderSlot(inbox, listProps, {
        sidebarThreads: {
          status: "ready",
          projects: [{ id: "web", name: "Web", isPersonal: false, href: "", settingsHref: "" }],
          threads: [
            ...["a", "hidden", "b", "z"].map((id) =>
              thread({ id, title: id, projectId: "web", updatedAt: Date.now() }),
            ),
            thread({ id: "ca", title: "ca", projectId: "web", parentThreadId: "a", hasPendingInteraction: true }),
            thread({ id: "cb", title: "cb", projectId: "web", parentThreadId: "b", hasPendingInteraction: true }),
          ],
        },
        rpc: {
          getSidebarSettings: () => defaultSidebarSettings,
          listLifecycle: () => ({ rows: [] }),
          listInboxOrder: () => ({ inboxThreadIds: order }),
          reorderInbox: (input) => input,
        },
      });
      const active = screen.getByRole("region", { name: "Active" });
      const visible = () => rowLinks(active).map((row) => row.getAttribute("aria-label"));
      await waitFor(() => expect(visible()).toEqual(["a", "b"]));
      const a = within(active).getByRole("link", { name: "a" });
      vi.mocked(document.elementFromPoint).mockReturnValue(
        within(active).getByRole("link", { name: "b" }).closest("li")!,
      );
      fireEvent.pointerDown(a, { button: 0, clientX: 20, clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(window, { buttons: 1, clientX: 20, clientY: 60, pointerId: 1 });
      expect(visible()).toEqual(["b", "a"]);
      order = ["z", "a", "hidden", "b", "ca", "cb"];
      await rendered.behavior.emitRealtime("inbox-order", {});
      fireEvent.pointerUp(window, { clientX: 20, clientY: 60, pointerId: 1 });
      await waitFor(() =>
        expect(rendered.rpcCalls.find((call) => call.method === "reorderInbox")?.input).toEqual({
          inboxThreadIds: ["z", "b", "hidden", "a", "ca", "cb"],
        }),
      );
      expect(visible()).toEqual(["b", "a"]);
    });

    it("F2 preserves the member-shrinks no-op", async () => {
      window.localStorage.setItem("bb-sidebar:active-sort:v1", "project");
      window.localStorage.setItem("bb-sidebar:shelf-expansion:v1", JSON.stringify({ active: false }));
      const rows = [
        ...["a", "hidden", "b"].map((id) => thread({ id, title: id, projectId: "web", updatedAt: Date.now() })),
        thread({ id: "ca", title: "ca", projectId: "web", parentThreadId: "a", hasPendingInteraction: true }),
        thread({ id: "cb", title: "cb", projectId: "web", parentThreadId: "b", hasPendingInteraction: true }),
      ];
      let order = ["a", "hidden", "b", "ca", "cb"];
      const rendered = renderSlot(inbox, listProps, {
        sidebarThreads: {
          status: "ready",
          threads: rows,
          projects: [{ id: "web", name: "Web", isPersonal: false, href: "", settingsHref: "" }],
        },
        rpc: {
          getSidebarSettings: () => defaultSidebarSettings,
          listLifecycle: () => ({ rows: [] }),
          listInboxOrder: () => ({ inboxThreadIds: order }),
          reorderInbox: (input) => input,
        },
      });
      const active = screen.getByRole("region", { name: "Active" });
      const visible = () => rowLinks(active).map((row) => row.getAttribute("aria-label"));
      await waitFor(() => expect(visible()).toEqual(["a", "b"]));
      vi.mocked(document.elementFromPoint).mockReturnValue(
        within(active).getByRole("link", { name: "b" }).closest("li")!,
      );
      fireEvent.pointerDown(within(active).getByRole("link", { name: "a" }), {
        button: 0,
        clientX: 20,
        clientY: 0,
        pointerId: 1,
      });
      fireEvent.pointerMove(window, { buttons: 1, clientX: 20, clientY: 60, pointerId: 1 });
      expect(visible()).toEqual(["b", "a"]);
      rows.splice(0, rows.length, ...rows.filter((row) => ["a", "ca"].includes(row.id)));
      order = ["a", "ca"];
      await rendered.behavior.emitRealtime("lifecycle", {});
      await rendered.behavior.emitRealtime("inbox-order", {});
      await waitFor(() => expect(visible()).toEqual(["a"]));
      fireEvent.pointerUp(window, { clientX: 20, clientY: 60, pointerId: 1 });
      await act(async () => {});
      expect(rendered.rpcCalls.filter((call) => call.method === "reorderInbox")).toEqual([]);
      expect(order).toEqual(["a", "ca"]);
      expect(active.querySelector("[data-drag-preview]")).toBeNull();
    });

    it("keeps each project's slot while its threads settle and come back", async () => {
      window.localStorage.setItem("bb-sidebar:active-sort:v1", "project");
      const settledRow = (threadId: string) => ({
        threadId,
        settledAt: Date.now(),
        snoozedUntil: null,
        snoozedAt: null,
      });
      let lifecycleRows: Array<ReturnType<typeof settledRow>> = [];
      const rows = [
        thread({ id: "w1", projectId: "web", title: "Web one", updatedAt: Date.now() }),
        thread({ id: "x", projectId: "api", title: "Loose X", updatedAt: Date.now() }),
        thread({ id: "y", projectId: "zed", title: "Loose Y", updatedAt: Date.now() }),
        thread({ id: "w2", projectId: "web", title: "Web two", updatedAt: Date.now() }),
      ];
      const rendered = renderSlot(inbox, listProps, {
        sidebarThreads: {
          status: "ready",
          threads: rows,
          projects: ["web", "api", "zed", "new"].map((id) => ({
            id,
            name: id[0]!.toUpperCase() + id.slice(1),
            isPersonal: false,
            href: "",
            settingsHref: "",
          })),
        },
        rpc: {
          getSidebarSettings: () => defaultSidebarSettings,
          listLifecycle: () => ({ rows: lifecycleRows }),
          listInboxOrder: () => ({ inboxThreadIds: ["w1", "x", "y", "w2"] }),
        },
      });
      const active = await screen.findByRole("region", { name: "Active" });
      const layout = () =>
        [...active.querySelectorAll("[aria-label]")]
          .map((element) => element.getAttribute("aria-label"))
          .filter((label) => /^(Web|Api|Zed|New) \(|^(Web one|Web two|Loose X|Loose Y|New one)$/.test(label ?? ""));
      const loose = ["Api (1)", "Loose X", "Zed (1)", "Loose Y"];
      const settle = async (...threadIds: string[]) => {
        lifecycleRows = threadIds.map(settledRow);
        await rendered.behavior.emitRealtime("lifecycle", {});
      };
      await waitFor(() => expect(layout()).toEqual(["Web (2)", "Web one", "Web two", ...loose]));
      await waitFor(() => expect(savedProjectOrder()).toEqual(["web", "api", "zed"]));

      // The project's first thread leaves: its other thread keeps the slot.
      await settle("w1");
      await waitFor(() => expect(layout()).toEqual(["Web (1)", "Web two", ...loose]));
      // And it comes back to the same place.
      await settle();
      await waitFor(() => expect(layout()).toEqual(["Web (2)", "Web one", "Web two", ...loose]));
      // A project with nothing in Active keeps its slot for when it returns.
      await settle("x");
      await waitFor(() => expect(layout()).toEqual(["Web (2)", "Web one", "Web two", "Zed (1)", "Loose Y"]));
      await settle();
      await waitFor(() => expect(layout()).toEqual(["Web (2)", "Web one", "Web two", ...loose]));

      // A project new to the view starts at the top.
      rows.push(thread({ id: "n1", projectId: "new", title: "New one", createdAt: Date.now(), updatedAt: Date.now() }));
      await rendered.behavior.emitRealtime("lifecycle", {});
      await waitFor(() => expect(layout()).toEqual(["New (1)", "New one", "Web (2)", "Web one", "Web two", ...loose]));
      await waitFor(() => expect(savedProjectOrder()).toEqual(["new", "web", "api", "zed"]));
      expect(rendered.rpcCalls.filter((call) => call.method.startsWith("reorder"))).toEqual([]);
    });

    function renderProjects(onReorder: (ids: string[]) => void) {
      window.localStorage.setItem("bb-sidebar:active-sort:v1", "project");
      const storedIds = ["w1", "x", "w2", "y"];
      return renderSlot(inbox, listProps, {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({ id: "w1", projectId: "web", title: "Web one" }),
            thread({ id: "x", projectId: "api", title: "Loose X" }),
            thread({ id: "w2", projectId: "web", title: "Web two" }),
            thread({ id: "y", projectId: "zed", title: "Loose Y" }),
          ],
          projects: [
            { id: "web", name: "Web", isPersonal: false, href: "", settingsHref: "" },
            { id: "api", name: "Api", isPersonal: false, href: "", settingsHref: "" },
            { id: "zed", name: "Zed", isPersonal: false, href: "", settingsHref: "" },
          ],
        },
        rpc: {
          listLifecycle: () => ({ rows: [] }),
          listInboxOrder: () => ({ inboxThreadIds: storedIds }),
          reorderInbox: (input) => {
            const parsed = input as { inboxThreadIds: string[] };
            onReorder(parsed.inboxThreadIds);
            return { inboxThreadIds: parsed.inboxThreadIds };
          },
        },
      });
    }

    it("keeps saved project slots in a sorted order and sorts threads within each project", async () => {
      window.localStorage.setItem("bb-sidebar:project-order:v1", JSON.stringify(["web", "zed"]));
      window.localStorage.setItem("bb-sidebar:active-view:v1", JSON.stringify({ group: "project", order: "activity" }));
      const rendered = renderSlot(inbox, listProps, {
        sidebarThreads: {
          status: "ready",
          threads: [
            thread({ id: "w1", projectId: "web", title: "Web one", updatedAt: 1 }),
            thread({ id: "y", projectId: "zed", title: "Loose Y", updatedAt: 3 }),
            thread({ id: "w2", projectId: "web", title: "Web two", updatedAt: 2 }),
          ],
          projects: ["web", "zed"].map((id) => ({ id, name: id, isPersonal: false, href: "", settingsHref: "" })),
        },
        rpc: { listLifecycle: () => ({ rows: [] }), listInboxOrder: () => ({ inboxThreadIds: ["w1", "w2", "y"] }) },
      });
      const active = await screen.findByRole("region", { name: "Active" });
      const rowOrder = () => rowLinks(active).map((row) => row.getAttribute("aria-label"));
      await waitFor(() => expect(rowOrder()).toEqual(["Web two", "Web one", "Loose Y"]));
      // A project header still moves, since projects keep their own order.
      fireEvent.keyDown(within(active).getByRole("button", { name: "web (2)" }), { key: "ArrowDown", altKey: true });
      await waitFor(() => expect(savedProjectOrder()).toEqual(["zed", "web"]));
      expect(rowOrder()).toEqual(["Loose Y", "Web two", "Web one"]);
      expect(rendered.rpcCalls.filter((call) => call.method === "reorderInbox")).toEqual([]);
    });

    it("drags a project header past a lone thread, taking its threads along", async () => {
      let saved: string[] | null = null;
      renderProjects((ids) => (saved = ids));
      const header = await screen.findByRole("button", { name: "Web (2)" });
      const target = screen.getByText("Loose Y").closest("li")!;
      vi.mocked(document.elementFromPoint).mockReturnValue(target);
      vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
        top: 0,
        bottom: 40,
        left: 0,
        right: 200,
        width: 200,
        height: 40,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      fireEvent.pointerDown(header, { button: 0, clientX: 20, clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(window, { buttons: 1, clientX: 20, clientY: 30, pointerId: 1 });
      fireEvent.pointerUp(window, { clientX: 20, clientY: 30, pointerId: 1 });

      await waitFor(() => expect(savedProjectOrder()).toEqual(["api", "zed", "web"]));
      expect(saved).toBeNull();
      // The drag must not also toggle the project it started on.
      expect(header.getAttribute("aria-expanded")).toBe("true");
    });

    it("moves a one-thread project over a whole project from the keyboard", async () => {
      let saved: string[] | null = null;
      renderProjects((ids) => (saved = ids));
      const header = await screen.findByRole("button", { name: "Api (1)" });
      fireEvent.keyDown(header, { key: "ArrowUp", altKey: true });
      await waitFor(() => expect(savedProjectOrder()).toEqual(["api", "web", "zed"]));
      expect(saved).toBeNull();
    });

    it("moves a project header from the keyboard", async () => {
      let saved: string[] | null = null;
      renderProjects((ids) => (saved = ids));
      const header = await screen.findByRole("button", { name: "Web (2)" });
      fireEvent.keyDown(header, { key: "ArrowDown", altKey: true });
      await waitFor(() => expect(savedProjectOrder()).toEqual(["api", "web", "zed"]));
      expect(saved).toBeNull();
    });

    it("reorders inside a project without moving the project", async () => {
      let saved: string[] | null = null;
      renderProjects((ids) => (saved = ids));
      const card = await screen.findByRole("link", { name: "Web two" });
      fireEvent.keyDown(card, { key: "ArrowUp", altKey: true });
      // The project's threads swap within the slots they already held.
      await waitFor(() => expect(saved).toEqual(["w2", "x", "w1", "y"]));
    });
  });
});
