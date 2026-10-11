// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createWired } from "./test-wired";
import { loadInboxApp, thread, toastMocks, parkFromCard } from "./test-inbox";

vi.mock("sonner", async () => (await import("./test-inbox")).sonnerMock());
await loadInboxApp();

const item = (id = "a", extra: Parameters<typeof thread>[0] = {}) =>
  thread({ id, title: `Work ${id}`, updatedAt: Date.now(), ...extra });
const row = (title = "Work a") => screen.getByText(title).closest("li")!;
const lifecycle = (wired: Awaited<ReturnType<typeof createWired>>, id = "a") =>
  wired.db.prepare("SELECT * FROM thread_lifecycle WHERE thread_id = ?").get(id);
async function shelf(name: string) {
  const region = await screen.findByRole("region", { name });
  const heading = within(region).getByRole("button", { name: new RegExp(`^${name}`) });
  if (heading.getAttribute("aria-expanded") === "false") fireEvent.click(heading);
  return region;
}
async function saved(wired: Awaited<ReturnType<typeof createWired>>, column: string, value: unknown, id = "a") {
  await waitFor(() => expect(lifecycle(wired, id)).toMatchObject({ [column]: value }));
  await wired.flush();
}

it("snoozes through the picker, wakes on the clock, and dismisses the durable Woke marker", async () => {
  const wired = await createWired([item()]);
  wired.mount();
  await screen.findByText("Work a");
  vi.useFakeTimers();
  fireEvent.keyDown(within(row()).getByRole("combobox", { name: "Snooze thread" }), { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: "1 hour" }));
  await wired.advance(1);
  const storedSnooze = lifecycle(wired) as { snoozed_until: number; snoozed_at: number };
  expect(storedSnooze.snoozed_until - storedSnooze.snoozed_at).toBe(3600_000);
  const snoozed = screen.getByRole("region", { name: "Snoozed" });
  fireEvent.click(within(snoozed).getByRole("button", { name: /^Snoozed/ }));
  expect(within(snoozed).getByText("Work a")).toBeDefined();
  await wired.advance(60 * 60_000 + 50);
  expect(screen.getByRole("button", { name: "Dismiss Woke marker" })).toBeDefined();
  expect(lifecycle(wired)).toEqual(storedSnooze);
  expect(storedSnooze.snoozed_until).toBeLessThanOrEqual(Date.now());
  fireEvent.click(screen.getByRole("button", { name: "Dismiss Woke marker" }));
  await wired.advance(1);
  expect(lifecycle(wired)).toBeUndefined();
  expect(screen.queryByRole("button", { name: "Dismiss Woke marker" })).toBeNull();
});

it("parks through the card and resumes from Parked", async () => {
  const wired = await createWired([item()]);
  wired.mount();
  await screen.findByText("Work a");
  await parkFromCard(row(), "park");
  await waitFor(() => expect(lifecycle(wired)).toMatchObject({ parked_at: expect.any(Number) }));
  await wired.flush();
  const parked = await shelf("Parked");
  expect(within(parked).getByText("Work a")).toBeDefined();
  fireEvent.click(within(parked).getByRole("button", { name: "Resume thread" }));
  await saved(wired, "settled_override", "active");
  expect(within(await screen.findByRole("region", { name: "Active" })).getByText("Work a")).toBeDefined();
  expect(lifecycle(wired)).toMatchObject({ parked_at: null });
});

it("settles a tree and Undo restores the parent's park and child's snooze", async () => {
  const wired = await createWired([item(), item("child", { parentThreadId: "a" })]);
  await wired.call("park", { threadId: "a" });
  await wired.call("snooze", { threadId: "child", snoozedUntil: Date.now() + 3600_000 });
  const before = [lifecycle(wired), lifecycle(wired, "child")];
  wired.mount();
  const parked = await shelf("Parked");
  fireEvent.contextMenu(within(parked).getByText("Work a"));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Settle" }));
  await saved(wired, "settled_override", "settled");
  expect(lifecycle(wired, "child")).toMatchObject({ settled_override: "settled" });
  expect(within(await shelf("Settled")).getByText("Work a")).toBeDefined();
  await waitFor(() =>
    expect(toastMocks.success.mock.calls.some(([message]) => message === "Thread settled")).toBe(true),
  );
  const toast = toastMocks.success.mock.calls.find(([message]) => message === "Thread settled")!;
  await act(async () => toast[1].action.onClick());
  await waitFor(() => expect([lifecycle(wired), lifecycle(wired, "child")]).toEqual(before));
  await wired.flush();
  expect(within(await shelf("Parked")).getByText("Work a")).toBeDefined();
  await wired.call("resume", { threadId: "a" });
  fireEvent.click(await screen.findByRole("button", { name: "1 child thread" }));
  expect(screen.getByText("Work child")).toBeDefined();
});

it("pins from the menu and persists a keyboard manual reorder through server and cache remounts", async () => {
  const wired = await createWired([item(), item("b"), item("pin")]);
  const initial = wired.mount();
  fireEvent.contextMenu(await screen.findByText("Work pin"));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Pin" }));
  await saved(wired, "settled_override", "active", "pin");
  expect(initial.inspection.rpcCalls).toContainEqual({ method: "pin", input: { threadId: "pin" } });
  // The SDK has no sidebar snapshot update driver; native pin state is read on remount.
  wired.unmount(initial);
  expect(wired.harness.inspection.sdk.callsTo("threads.pin")).toHaveLength(1);
  let slot = wired.mount();
  const sender = within(slot.container);
  await within(await sender.findByRole("region", { name: "Pinned" })).findByText("Work pin");
  const receiver = wired.mount();
  const observer = within(receiver.container);
  // Its initial read must finish before the mutation; only realtime can then refresh it.
  await waitFor(() =>
    expect(receiver.rpcReplies).toContainEqual({
      method: "listInboxOrder",
      result: { inboxThreadIds: [] },
    }),
  );
  expect(within(observer.getByRole("region", { name: "Active" })).getAllByRole("listitem")[0]!.textContent).toContain(
    "Work a",
  );
  fireEvent.keyDown(sender.getByRole("link", { name: "Work a" }), { key: "ArrowDown", altKey: true });
  await waitFor(() =>
    expect(wired.db.prepare("SELECT thread_id FROM inbox_order ORDER BY sort_index").all()).toEqual([
      { thread_id: "b" },
      { thread_id: "a" },
    ]),
  );
  await wired.flush();
  expect(JSON.parse(localStorage.getItem("bb-sidebar:inbox-order-cache:v1")!)).toEqual(["b", "a"]);
  await waitFor(() =>
    expect(within(observer.getByRole("region", { name: "Active" })).getAllByRole("listitem")[0]!.textContent).toContain(
      "Work b",
    ),
  );
  expect(receiver.rpcReplies).toContainEqual({ method: "listInboxOrder", result: { inboxThreadIds: ["b", "a"] } });
  wired.unmount(receiver);
  wired.unmount(slot);
  slot = wired.mount();
  expect(within(screen.getByRole("region", { name: "Active" })).getAllByRole("listitem")[0]!.textContent).toContain(
    "Work b",
  );
  wired.unmount(slot);
  localStorage.removeItem("bb-sidebar:inbox-order-cache:v1");
  wired.mount();
  await waitFor(() =>
    expect(within(screen.getByRole("region", { name: "Active" })).getAllByRole("listitem")[0]!.textContent).toContain(
      "Work b",
    ),
  );
});

it("saves settings in the real settings slot and publishes the Working shelf to the inbox", async () => {
  const wired = await createWired([item("busy", { indicator: "runtime", runtimeStatus: "active" })]);
  wired.mount();
  wired.mount("settings");
  const toggle = await screen.findByRole("switch", { name: "Working shelf" });
  vi.useFakeTimers();
  fireEvent.click(toggle);
  await wired.advance(500);
  expect(
    wired.db.prepare("SELECT json_extract(settings_json, '$.workingShelf') AS enabled FROM sidebar_settings").get(),
  ).toEqual({ enabled: 1 });
  expect(within(screen.getByRole("region", { name: "Working" })).getByText("Work busy")).toBeDefined();
  expect(await wired.call("getSidebarSettings")).toMatchObject({ workingShelf: true });
});

it("publishes a custom project color to both stripe and name", async () => {
  const wired = await createWired([item()]);
  await wired.call("updateSidebarSettings", { projectColorsEnabled: true });
  const slot = wired.mount();
  // The default stripe can render before the first read finishes; wait for that reply too.
  await waitFor(() => expect(slot.rpcReplies).toContainEqual({ method: "getProjectColors", result: { colors: {} } }));
  await waitFor(() =>
    expect(
      (row().querySelector("[data-project-stripe]") as HTMLElement).style.getPropertyValue("--bb-sidebar-project"),
    ).toBe("#c398bf"),
  );
  await wired.call("setProjectColor", { projectId: "proj_1", color: "#123456" });
  await waitFor(() =>
    expect(
      (row().querySelector("[data-project-stripe]") as HTMLElement).style.getPropertyValue("--bb-sidebar-project"),
    ).toBe("#123456"),
  );
  expect(
    (row().querySelector(".bb-sidebar-project-name") as HTMLElement).style.getPropertyValue("--bb-sidebar-project"),
  ).toBe("#123456");
  expect(wired.db.prepare("SELECT * FROM project_colors").all()).toEqual([{ project_id: "proj_1", color: "#123456" }]);
});

it("child activity publishes lifecycle changes that reopen a settled parent", async () => {
  const wired = await createWired([item(), item("child", { parentThreadId: "a" })]);
  await wired.call("settle", { threadId: "a" });
  wired.mount();
  expect(within(await shelf("Settled")).getByText("Work a")).toBeDefined();
  await wired.event("thread.active", "child");
  expect(lifecycle(wired)).toBeUndefined();
  expect(lifecycle(wired, "child")).toBeUndefined();
  await within(await screen.findByRole("region", { name: "Active" })).findByText("Work a");
});

it("Clean uses the real preview token and renders the cleanup result shape", async () => {
  const wired = await createWired([item()], { terminals: true });
  // Seed only lifecycle: settling would intentionally reclaim the terminal first.
  wired.db
    .prepare("INSERT INTO thread_lifecycle (thread_id, settled_at, settled_override) VALUES (?, ?, 'settled')")
    .run("a", Date.now());
  const slot = wired.mount();
  const settled = await shelf("Settled");
  fireEvent.click(within(settled).getByRole("button", { name: "Close terminals and ports of settled threads" }));
  const dialog = await screen.findByRole("dialog", { name: "Clean settled resources?" });
  await within(dialog).findByText("1 terminal to close");
  fireEvent.click(within(dialog).getByRole("button", { name: "Clean resources" }));
  await waitFor(() => expect(dialog.textContent).toContain("1 terminal closed"));
  expect(slot.inspection.rpcCalls.find((call) => call.method === "cleanSettled")?.input).toEqual({
    token: expect.any(String),
  });
  expect(wired.harness.inspection.sdk.callsTo("terminals.close")[0]).toEqual([
    { terminalId: "terminal_1", mode: "force" },
  ]);
  expect(lifecycle(wired)).toMatchObject({ settled_override: "settled" });
  const preview = (await wired.call("previewSettledCleanup", { threadIds: ["a"] })) as { token: string };
  expect(await wired.call("cleanSettled", { token: preview.token })).toEqual({
    closedTerminals: 0,
    signalledPorts: [],
    remainingPorts: [],
    skipped: [],
    failed: [],
  });
});

it("thread.deleted clears lifecycle and order and publishes both channels to the app", async () => {
  const wired = await createWired([item(), item("b")]);
  await wired.call("park", { threadId: "a" });
  await wired.call("park", { threadId: "b" });
  await wired.call("reorderInbox", { inboxThreadIds: ["a", "b"] });
  wired.mount();
  const parked = await shelf("Parked");
  expect(within(parked).getByText("Work a")).toBeDefined();
  await wired.event("thread.deleted", "a");
  expect(lifecycle(wired)).toBeUndefined();
  expect(wired.db.prepare("SELECT thread_id FROM inbox_order ORDER BY sort_index").all()).toEqual([{ thread_id: "b" }]);
  await waitFor(() => expect(JSON.parse(localStorage.getItem("bb-sidebar:inbox-order-cache:v1")!)).toEqual(["b"]));
  expect(
    JSON.parse(localStorage.getItem("bb-sidebar:lifecycle-cache:v1")!).map((row: { threadId: string }) => row.threadId),
  ).toEqual(["b"]);
  const remaining = screen.getByRole("region", { name: "Parked" });
  expect(within(remaining).getByText("Work b")).toBeDefined();
  expect(within(remaining).queryByText("Work a")).toBeNull();
  expect(within(remaining).getAllByRole("listitem")).toHaveLength(1);
});
