// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createEvent, fireEvent, screen, within } from "@testing-library/react";
import { renderSlot } from "./test-slot";
import { inbox, thread, listProps, loadInboxApp } from "./test-inbox";
import { STORAGE_KEYS } from "./lib/storage-keys";

await loadInboxApp();

const projects = ["Alpha", "Beta", "Empty"].map((name) => ({
  id: name,
  name,
  isPersonal: false,
  href: "",
  settingsHref: "",
}));

function renderProjects() {
  return renderSlot(inbox, listProps, {
    sidebarThreads: {
      status: "ready",
      projects,
      threads: ["Alpha", "Beta"].map((id) => thread({ id, projectId: id, title: `${id} thread` })),
    },
    rpc: { listLifecycle: () => ({ rows: [] }) },
  });
}

function openPicker() {
  fireEvent.keyDown(screen.getByRole("button", { name: /^Project scope:/ }), { key: "Enter" });
}

function shortcutOrder() {
  return within(screen.getByRole("group", { name: "Pinned projects" }))
    .getAllByRole("button")
    .map((button) => button.textContent);
}

function dragProject(source: HTMLElement, target: HTMLElement, placement: "before" | "after") {
  const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
  vi.spyOn(target, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 40, 80, 28));
  fireEvent.dragStart(source, { dataTransfer });
  const over = createEvent.dragOver(target, { dataTransfer });
  Object.defineProperty(over, "clientX", { value: placement === "before" ? 110 : 170 });
  fireEvent(target, over);
  return () => {
    const drop = createEvent.drop(target, { dataTransfer });
    Object.defineProperty(drop, "clientX", { value: placement === "before" ? 110 : 170 });
    fireEvent(target, drop);
    fireEvent.dragEnd(source, { dataTransfer });
  };
}

it("drags pinned projects before and after other shortcuts and persists the order without filtering", () => {
  localStorage.setItem(STORAGE_KEYS.pinnedProjects.key, JSON.stringify(["Alpha", "Beta", "Empty"]));
  const rendered = renderProjects();
  const alpha = screen.getByRole("button", { name: "Filter by Alpha" });
  const empty = screen.getByRole("button", { name: "Filter by Empty" });
  expect(alpha.draggable).toBe(true);
  const drop = dragProject(alpha, empty, "after");
  expect(shortcutOrder()).toEqual(["Alpha", "Beta", "Empty"]);
  drop();
  expect(shortcutOrder()).toEqual(["Beta", "Empty", "Alpha"]);
  dragProject(empty, screen.getByRole("button", { name: "Filter by Beta" }), "before")();
  expect(shortcutOrder()).toEqual(["Empty", "Beta", "Alpha"]);
  expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.pinnedProjects.key)!)).toEqual(["Empty", "Beta", "Alpha"]);
  expect(screen.getByRole("button", { name: "Project scope: All projects" })).toBeDefined();
  rendered.lifecycle.unmount();
  renderProjects();
  expect(shortcutOrder()).toEqual(["Empty", "Beta", "Alpha"]);
  fireEvent.click(screen.getByRole("button", { name: "Filter by Beta" }));
  expect(screen.getByRole("button", { name: "Filter by Beta", pressed: true })).toBeDefined();
});

it("leaves pin order and filters unchanged when a drag is cancelled or an external item is dropped", () => {
  localStorage.setItem(STORAGE_KEYS.pinnedProjects.key, JSON.stringify(["Alpha", "Beta"]));
  renderProjects();
  const alpha = screen.getByRole("button", { name: "Filter by Alpha" });
  const beta = screen.getByRole("button", { name: "Filter by Beta" });
  dragProject(alpha, beta, "after");
  fireEvent.dragEnd(alpha);
  fireEvent.drop(beta);
  expect(shortcutOrder()).toEqual(["Alpha", "Beta"]);
  expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.pinnedProjects.key)!)).toEqual(["Alpha", "Beta"]);
  expect(screen.getByRole("button", { name: "Project scope: All projects" })).toBeDefined();
});

it("reorders project pins with Alt+Left/Right, keeps focus, and stops at either end", () => {
  localStorage.setItem(STORAGE_KEYS.pinnedProjects.key, JSON.stringify(["Alpha", "Beta", "Empty"]));
  renderProjects();
  const beta = screen.getByRole("button", { name: "Filter by Beta" });
  beta.focus();
  fireEvent.keyDown(beta, { key: "ArrowLeft" });
  expect(shortcutOrder()).toEqual(["Alpha", "Beta", "Empty"]);
  fireEvent.keyDown(beta, { key: "ArrowLeft", altKey: true });
  expect(shortcutOrder()).toEqual(["Beta", "Alpha", "Empty"]);
  expect(document.activeElement).toBe(beta);
  fireEvent.keyDown(beta, { key: "ArrowLeft", altKey: true });
  expect(shortcutOrder()).toEqual(["Beta", "Alpha", "Empty"]);
  fireEvent.keyDown(beta, { key: "ArrowRight", altKey: true });
  fireEvent.keyDown(beta, { key: "ArrowRight", altKey: true });
  fireEvent.keyDown(beta, { key: "ArrowRight", altKey: true });
  expect(shortcutOrder()).toEqual(["Alpha", "Empty", "Beta"]);
  expect(document.activeElement).toBe(beta);
  expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.pinnedProjects.key)!)).toEqual(["Alpha", "Empty", "Beta"]);
  expect(screen.getByRole("button", { name: "Project scope: All projects" })).toBeDefined();
});

it("pins independently of selection, persists shortcuts, and toggles multiple project filters", () => {
  const rendered = renderProjects();
  expect(screen.queryByRole("group", { name: "Pinned projects" })).toBeNull();
  openPicker();
  fireEvent.click(screen.getByRole("button", { name: "Pin Beta" }));
  fireEvent.click(screen.getByRole("button", { name: "Pin Alpha" }));
  expect(screen.getByRole("button", { name: "Project scope: All projects" })).toBeDefined();
  expect(screen.getByRole("grid", { name: "Projects" })).toBeDefined();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.pinnedProjects.key)!)).toEqual(["Beta", "Alpha"]);
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  const shortcuts = screen.getByRole("group", { name: "Pinned projects" });
  expect(
    within(shortcuts)
      .getAllByRole("button")
      .map((button) => button.textContent),
  ).toEqual(["Beta", "Alpha"]);
  fireEvent.click(within(shortcuts).getByRole("button", { name: "Filter by Beta" }));
  expect(screen.queryByText("Alpha thread")).toBeNull();
  expect(screen.getByText("Beta thread")).toBeDefined();
  expect(within(shortcuts).getByRole("button", { name: "Filter by Beta", pressed: true })).toBeDefined();
  expect(screen.getByRole("button", { name: "Project scope: 1 project" })).toBeDefined();
  fireEvent.click(within(shortcuts).getByRole("button", { name: "Filter by Alpha" }));
  expect(screen.getByText("Beta thread")).toBeDefined();
  expect(screen.getByText("Alpha thread")).toBeDefined();
  expect(screen.getByRole("button", { name: "Project scope: 2 projects" })).toBeDefined();
  expect(within(shortcuts).getAllByRole("button", { pressed: true })).toHaveLength(2);
  openPicker();
  expect(screen.getByRole("row", { name: "Alpha", selected: true })).toBeDefined();
  expect(screen.getByRole("row", { name: "Beta", selected: true })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  fireEvent.click(within(shortcuts).getByRole("button", { name: "Filter by Alpha" }));
  expect(screen.getByText("Beta thread")).toBeDefined();
  expect(screen.queryByText("Alpha thread")).toBeNull();

  rendered.lifecycle.unmount();
  renderProjects();
  expect(within(screen.getByRole("group", { name: "Pinned projects" })).getAllByRole("button")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Filter by Beta", pressed: true })).toBeDefined();
  openPicker();
  fireEvent.click(screen.getByRole("button", { name: "Unpin Beta" }));
  expect(screen.queryByRole("button", { name: "Filter by Beta" })).toBeNull();
  expect(screen.getByRole("button", { name: "Project scope: Beta" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Reset to all projects" }));
  expect(screen.getByRole("button", { name: "Filter by Alpha" })).toBeDefined();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.pinnedProjects.key)!)).toEqual(["Alpha"]);
});

it("names unpinned selections before the pinned count and resets without removing pins", () => {
  localStorage.setItem(STORAGE_KEYS.pinnedProjects.key, JSON.stringify(["Beta"]));
  renderProjects();
  fireEvent.click(screen.getByRole("button", { name: "Filter by Beta" }));
  openPicker();
  fireEvent.click(screen.getByRole("row", { name: "Alpha" }));
  expect(screen.getByRole("button", { name: "Project scope: Alpha + 1 project" })).toBeDefined();
  fireEvent.click(screen.getByRole("row", { name: "Empty" }));
  expect(screen.getByRole("button", { name: "Project scope: Alpha + Empty + 1 project" })).toBeDefined();
  fireEvent.click(screen.getByRole("row", { name: "Beta" }));
  expect(screen.getByRole("button", { name: "Filter by Beta", pressed: false })).toBeDefined();
  expect(screen.getByRole("button", { name: "Project scope: Alpha + Empty" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  fireEvent.click(screen.getByRole("button", { name: "Filter by Beta" }));
  expect(screen.getByRole("button", { name: "Project scope: Alpha + Empty + 1 project" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Reset project filter" }));
  expect(screen.getByRole("button", { name: "Project scope: All projects" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "Reset project filter" })).toBeNull();
  expect(screen.getByRole("button", { name: "Filter by Beta", pressed: false })).toBeDefined();
  expect(screen.getByText("Alpha thread")).toBeDefined();
  expect(screen.getByText("Beta thread")).toBeDefined();
  openPicker();
  expect(screen.getByRole("row", { name: "All projects", selected: true })).toBeDefined();
  expect(screen.getByRole("row", { name: "Beta", selected: false })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  fireEvent.click(screen.getByRole("button", { name: "Filter by Beta" }));
  fireEvent.click(screen.getByRole("button", { name: "Filter by Beta" }));
  expect(screen.getByRole("button", { name: "Project scope: All projects" })).toBeDefined();
});

it("keeps shortcuts outside the scroller even with collapsed shelves or no threads", () => {
  localStorage.setItem(STORAGE_KEYS.pinnedProjects.key, JSON.stringify(["Alpha", "Empty"]));
  localStorage.setItem(STORAGE_KEYS.shelfExpansion.key, JSON.stringify({ active: false }));
  renderProjects();
  const shortcuts = screen.getByRole("group", { name: "Pinned projects" });
  expect(shortcuts.closest("[data-list-motion-scroller]")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Filter by Empty" }));
  expect(screen.getByRole("button", { name: "Filter by Empty", pressed: true })).toBeDefined();
  expect(screen.queryByText("Alpha thread")).toBeNull();
  expect(within(screen.getByRole("group", { name: "Pinned projects" })).getAllByRole("button")).toHaveLength(2);
});

it("keeps pinning usable when storage is blocked and keyboard navigation can leave the pin button", () => {
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Storage blocked");
  });
  try {
    renderProjects();
    openPicker();
    const filter = screen.getByRole("combobox", { name: "Filter projects" });
    fireEvent.change(filter, { target: { value: "Alpha" } });
    const pin = screen.getByRole("button", { name: "Pin Alpha" });
    expect(pin.tabIndex).toBe(0);
    pin.focus();
    fireEvent.click(pin);
    expect(screen.getByRole("button", { name: "Unpin Alpha" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Project scope: All projects" })).toBeDefined();
    fireEvent.keyDown(pin, { key: "ArrowDown" });
    expect(document.activeElement).toBe(filter);
    fireEvent.keyDown(filter, { key: "Enter" });
    expect(screen.getByRole("row", { name: "Alpha", selected: true })).toBeDefined();
    fireEvent.keyDown(filter, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Filter by Alpha", pressed: true })).toBeDefined();
  } finally {
    spy.mockRestore();
  }
});
