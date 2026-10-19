// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ActiveSortPicker } from "./ActiveSortPicker";
import type { ActiveView } from "./inbox-layout";

afterEach(cleanup);

function Picker() {
  const [view, setView] = useState<ActiveView>({ group: "none", order: "manual" });
  const [groupEnvironments, setGroupEnvironments] = useState(false);
  return (
    <ActiveSortPicker
      view={view}
      onViewChange={setView}
      groupEnvironments={groupEnvironments}
      onGroupEnvironmentsChange={setGroupEnvironments}
    />
  );
}

function openPicker() {
  render(<Picker />);
  fireEvent.keyDown(screen.getByRole("button", { name: "Sort active threads: Manual order" }), { key: "Enter" });
}

it.each(["Manual order", "Recent activity", "Date created"])("closes after a pointer click on %s", (name) => {
  openPicker();
  fireEvent.click(screen.getByRole("radio", { name }), { detail: 1 });
  expect(screen.queryByRole("dialog", { name: "Sort active threads" })).toBeNull();
  expect(screen.getByRole("button", { name: `Sort active threads: ${name}` })).toBeDefined();
});

it("selects without dismissing on a keyboard-generated click", () => {
  openPicker();
  fireEvent.click(screen.getByRole("radio", { name: "Recent activity" }), { detail: 0 });
  expect(screen.getByRole("dialog", { name: "Sort active threads" })).toBeDefined();
  expect((screen.getByRole("radio", { name: "Recent activity" }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByRole("button", { name: "Sort active threads: Recent activity" })).toBeDefined();
});

it("closes when Enter commits the selected radio", () => {
  openPicker();
  fireEvent.keyDown(screen.getByRole("radio", { name: "Manual order" }), { key: "Enter" });
  expect(screen.queryByRole("dialog", { name: "Sort active threads" })).toBeNull();
});

it.each(["Project", "Section"])("keeps the picker open after choosing %s grouping", (name) => {
  openPicker();
  const group = screen.getByRole("radio", { name });
  fireEvent.click(group, { detail: 1 });
  fireEvent.keyDown(group, { key: "Enter" });
  expect(screen.getByRole("dialog", { name: "Sort active threads" })).toBeDefined();
  expect(screen.getByRole("button", { name: `Sort active threads: ${name}, Manual order` })).toBeDefined();
});

it("combines a grouping with an order", () => {
  openPicker();
  fireEvent.click(screen.getByRole("radio", { name: "Section" }), { detail: 1 });
  fireEvent.click(screen.getByRole("radio", { name: "Recent activity" }), { detail: 1 });
  expect(screen.queryByRole("dialog", { name: "Sort active threads" })).toBeNull();
  expect(screen.getByRole("button", { name: "Sort active threads: Section, Recent activity" })).toBeDefined();
});

it("offers worktree grouping only with Project grouping", () => {
  openPicker();
  expect(screen.queryByRole("checkbox", { name: "Group by worktree" })).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Section" }), { detail: 1 });
  expect(screen.queryByRole("checkbox", { name: "Group by worktree" })).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Project" }), { detail: 1 });
  const toggle = screen.getByRole("checkbox", { name: "Group by worktree" });
  fireEvent.click(toggle);
  expect((toggle as HTMLInputElement).checked).toBe(true);
});
