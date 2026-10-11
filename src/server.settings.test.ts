import { describe, expect, it, vi } from "vitest";
import { makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import plugin, { type StoredLifecycleRow } from "./server";
import {
  createFakePluginHost,
  disposers,
  standardProject,
  projectThread,
  projectsWith,
  terminalSession,
  availablePullRequest,
  loadPlugin,
  deferred,
  type LifecycleListResult,
  type Environment,
  type ProjectThread,
} from "./test-server";

describe("lifecycle RPC", () => {
  it("stores the grouped sidebar settings through RPC", async () => {
    const harness = await loadPlugin();
    expect(harness.inspection.registrations.settingsDescriptors).toEqual({});
    await expect(harness.behavior.callRpc("getSidebarSettings", {})).resolves.toEqual({
      snoozePresets: "1h, Wait refresh (5 hours)=5h, evening@18:00, tomorrow@09:00, next-week@09:00",
      inactiveThreadsEnabled: true,
      inactiveAfterHours: 6,
      showRunningChildrenWhenCollapsed: true,
      autoSettleInactive: true,
      autoSettleAfterDays: 3,
      autoSettleOnMerge: true,
      childSortField: "created",
      childSortDirection: "ascending",
      childIconStyle: "disc",
      compactWorkingThreads: false,
      workingShelf: false,
      dockShelves: false,
      projectColorsEnabled: false,
      projectColorDisplay: "all",
    });
    await expect(
      harness.behavior.callRpc("updateSidebarSettings", {
        snoozePresets: "10m, 4h",
        inactiveThreadsEnabled: false,
        inactiveAfterHours: 12,
        showRunningChildrenWhenCollapsed: false,
        autoSettleInactive: false,
        autoSettleAfterDays: 7,
        autoSettleOnMerge: false,
        childSortField: "activity",
        childSortDirection: "descending",
        childIconStyle: "provider",
        compactWorkingThreads: true,
        workingShelf: true,
        dockShelves: true,
        projectColorsEnabled: true,
        projectColorDisplay: "grouped",
      }),
    ).resolves.toEqual({
      snoozePresets: "10m, 4h",
      inactiveThreadsEnabled: false,
      inactiveAfterHours: 12,
      showRunningChildrenWhenCollapsed: false,
      autoSettleInactive: false,
      autoSettleAfterDays: 7,
      autoSettleOnMerge: false,
      childSortField: "activity",
      childSortDirection: "descending",
      childIconStyle: "provider",
      compactWorkingThreads: true,
      workingShelf: true,
      dockShelves: true,
      projectColorsEnabled: true,
      projectColorDisplay: "grouped",
    });
    // A client that predates the setting leaves it out and must not reset it.
    await expect(
      harness.behavior.callRpc("updateSidebarSettings", {
        snoozePresets: "10m, 4h",
        inactiveThreadsEnabled: false,
        inactiveAfterHours: 12,
        showRunningChildrenWhenCollapsed: false,
        autoSettleInactive: false,
        autoSettleAfterDays: 7,
        autoSettleOnMerge: false,
        childSortField: "activity",
        childSortDirection: "descending",
        childIconStyle: "provider",
      }),
    ).resolves.toMatchObject({
      compactWorkingThreads: true,
      workingShelf: true,
      dockShelves: true,
      projectColorsEnabled: true,
      projectColorDisplay: "grouped",
    });
    expect(harness.inspection.realtimeSignals).toContainEqual({
      channel: "sidebar-settings",
      payload: {},
    });
    expect(harness.inspection.registrations.schedules).toContainEqual(
      expect.objectContaining({ name: "auto-settle", cron: "*/5 * * * *" }),
    );
  });

  it("persists color display mode across reloads and rejects unknown modes", async () => {
    const harness = await loadPlugin();
    const settings = (await harness.behavior.callRpc("getSidebarSettings", {})) as Record<string, unknown>;
    await harness.behavior.callRpc("updateSidebarSettings", { ...settings, projectColorDisplay: "full" });
    await expect(
      harness.behavior.callRpc("updateSidebarSettings", { ...settings, projectColorDisplay: "invalid" }),
    ).rejects.toThrow("rpc input validation failed");
    const reloaded = await harness.lifecycle.reload(plugin);
    disposers.push(() => reloaded.harness.lifecycle.dispose());
    await expect(reloaded.harness.behavior.callRpc("getSidebarSettings", {})).resolves.toMatchObject({
      projectColorDisplay: "full",
      projectColorsEnabled: false,
    });
  });

  it("rejects invalid snooze shortcuts at the RPC boundary", async () => {
    const harness = await loadPlugin();

    await expect(
      harness.behavior.callRpc("updateSidebarSettings", {
        snoozePresets: "later",
        inactiveThreadsEnabled: true,
        inactiveAfterHours: 6,
        showRunningChildrenWhenCollapsed: true,
        autoSettleInactive: true,
        autoSettleAfterDays: 3,
        autoSettleOnMerge: true,
        childSortField: "created",
        childSortDirection: "ascending",
        childIconStyle: "disc",
      }),
    ).rejects.toThrow("rpc input validation failed");
    await expect(harness.behavior.callRpc("getSidebarSettings", {})).resolves.toMatchObject({
      snoozePresets: "1h, Wait refresh (5 hours)=5h, evening@18:00, tomorrow@09:00, next-week@09:00",
    });
  });

  it("saves editable calendar shortcuts and rejects invalid times", async () => {
    const harness = await loadPlugin();
    const settings = (await harness.behavior.callRpc("getSidebarSettings", {})) as Record<string, unknown>;
    const snoozePresets = "1h, Wait refresh=5h, Tonight=evening@20:00, Morning=tomorrow@08:30, Monday=next-week@10:00";
    await expect(
      harness.behavior.callRpc("updateSidebarSettings", { ...settings, snoozePresets }),
    ).resolves.toMatchObject({ snoozePresets });
    await expect(harness.behavior.callRpc("getSidebarSettings", {})).resolves.toMatchObject({ snoozePresets });
    await expect(
      harness.behavior.callRpc("updateSidebarSettings", { ...settings, snoozePresets: "tomorrow@24:00" }),
    ).rejects.toThrow("rpc input validation failed");
    await expect(harness.behavior.callRpc("getSidebarSettings", {})).resolves.toMatchObject({ snoozePresets });
  });

  it("migrates values from the previous flat settings form", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "bb-sidebar",
      sdk: {
        plugins: {
          getSettings: async () => ({
            ok: true as const,
            schema: {},
            values: {
              snoozePresets: "20m, 6h",
              inactiveThreadsEnabled: false,
              inactiveAfterHours: "18",
              showRunningChildrenWhenCollapsed: false,
              autoSettleInactive: false,
              autoSettleAfterDays: "14",
              autoSettleOnMerge: false,
            },
          }),
        },
      },
    });
    await plugin(bb);
    disposers.push(() => harness.lifecycle.dispose());

    await expect(harness.behavior.callRpc("getSidebarSettings", {})).resolves.toEqual({
      snoozePresets: "20m, 6h",
      inactiveThreadsEnabled: false,
      inactiveAfterHours: 18,
      showRunningChildrenWhenCollapsed: false,
      autoSettleInactive: false,
      autoSettleAfterDays: 14,
      autoSettleOnMerge: false,
      childSortField: "created",
      childSortDirection: "ascending",
      childIconStyle: "disc",
      compactWorkingThreads: false,
      workingShelf: false,
      dockShelves: false,
      projectColorsEnabled: false,
      projectColorDisplay: "all",
    });
  });
});
