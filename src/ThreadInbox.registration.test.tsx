// @vitest-environment jsdom
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { DEFAULT_SNOOZE_PRESET_CONFIG, formatSnoozeWakeTime } from "./lifecycle";
import { isWorkingTree } from "./working-tree";
import { projectColorsById } from "./project-colors";
import { WORKING_EMPTY_LINES } from "./working-empty-lines";
import {
  app,
  inbox,
  sidebarSettings,
  PolicyMenu,
  SETTLED_NOTHING,
  defaultSidebarSettings,
  thread,
  provider,
  defaultProviders,
  listProps,
  render,
  statusSlotParts,
  nestedInteractiveControls,
  deferred,
  toastMocks,
  parkingActions,
  parkFromCard,
  parkFromMenu,
  loadInboxApp,
} from "./test-inbox";

vi.mock("sonner", async () => (await import("./test-inbox")).sonnerMock());

await loadInboxApp();

describe("BB Sidebar registration", () => {
  it("opens project settings and confirms project edits from the card menu", async () => {
    const renameProject = vi.fn(() => ({ ok: true }));
    const removeProject = vi.fn(() => ({ ok: true }));
    const addProjectPath = vi.fn(() => ({ ok: true }));
    const rendered = renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ title: "Project card" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      context: { projectId: "proj_other", threadId: "thr_other" },
      rpc: {
        listLifecycle: () => ({ rows: [] }),
        projectPathHosts: () => ({ hosts: [{ id: "host_2", name: "Laptop" }] }),
        renameProject,
        removeProject,
        addProjectPath,
      },
    });
    const openMenu = async () => {
      fireEvent.contextMenu(await screen.findByText("Project card"));
      fireEvent.click(screen.getByRole("menuitem", { name: "Project" }));
      return (await screen.findByText("Project settings")).closest<HTMLElement>('[role="menu"]')!;
    };
    const settingsMenu = await openMenu();
    expect(settingsMenu.hasAttribute("data-bb-plugin-root")).toBe(true);
    expect(within(settingsMenu).getByText("Project settings").getAttribute("href")).toBe("/projects/proj_1/settings");
    fireEvent.keyDown(settingsMenu, { key: "Escape" });

    fireEvent.click(within(await openMenu()).getByText("Rename project"));
    let dialog = await screen.findByRole("dialog", { name: "Rename project" });
    expect(dialog.hasAttribute("data-bb-plugin-root")).toBe(true);
    expect(dialog.hasAttribute("data-bb-portaled-overlay")).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Project name"), { target: { value: "Renamed" } });
    fireEvent.click(within(dialog).getByText("Save"));
    await waitFor(() => expect(renameProject).toHaveBeenCalledWith({ projectId: "proj_1", name: "Renamed" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const menu = await openMenu();
    await waitFor(() => expect(within(menu).getByText("Add local path").getAttribute("data-disabled")).toBeNull());
    fireEvent.click(within(menu).getByText("Add local path"));
    dialog = await screen.findByRole("dialog", { name: "Add local path" });
    fireEvent.change(within(dialog).getByLabelText("Folder path"), { target: { value: "/workspace/bb" } });
    fireEvent.click(within(dialog).getByText("Save"));
    await waitFor(() =>
      expect(addProjectPath).toHaveBeenCalledWith({ projectId: "proj_1", hostId: "host_2", path: "/workspace/bb" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(within(await openMenu()).getByText("Remove project"));
    dialog = await screen.findByRole("dialog", { name: "Remove project" });
    expect((within(dialog).getByRole("button", { name: "Remove project" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByText("Cancel"));
    expect(removeProject).not.toHaveBeenCalled();
    fireEvent.click(within(await openMenu()).getByText("Remove project"));
    dialog = await screen.findByRole("dialog", { name: "Remove project" });
    fireEvent.change(within(dialog).getByLabelText("Project name"), { target: { value: "bb" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove project" }));
    await waitFor(() => expect(removeProject).toHaveBeenCalledWith({ projectId: "proj_1", confirmation: "bb" }));
    expect(rendered.navigateCalls).toEqual([]);
  });

  it("registers exactly one thread list", () => {
    expect(app.threadLists).toHaveLength(1);
    expect(inbox.id).toBe("inbox");
    expect(inbox.title).toBe("BB Sidebar");
  });

  it("registers one custom settings page", () => {
    expect(app.settingsSections).toHaveLength(1);
    expect(sidebarSettings.id).toBe("sidebar-settings");
    expect(sidebarSettings.title).toBeUndefined();
  });
});
