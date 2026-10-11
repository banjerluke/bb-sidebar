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

describe("thread list loading state", () => {
  function renderStatus(status: "loading" | "error" | "ready") {
    return renderSlot(inbox, listProps, {
      sidebarThreads: {
        status,
        threads: status === "ready" ? [thread({ title: "Loaded thread" })] : [],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: { listLifecycle: () => ({ rows: [] }) },
    });
  }

  function loadingStatus() {
    return screen.queryAllByRole("status").find((region) => region.textContent === "Loading threads…");
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays quiet while a load is still fast", () => {
    vi.useFakeTimers();
    renderStatus("loading");
    act(() => vi.advanceTimersByTime(199));
    expect(screen.queryByText("Loading threads…")).toBeNull();
    expect(loadingStatus()).toBeUndefined();
  });

  it("shows a spinner and text once loading outlasts the delay", () => {
    vi.useFakeTimers();
    renderStatus("loading");
    const regionsBefore = screen.getAllByRole("status");
    act(() => vi.advanceTimersByTime(200));
    const region = loadingStatus();
    expect(region).toBeDefined();
    // The same live region was already mounted, empty, before the text came.
    expect(regionsBefore).toContain(region);
    const spinner = region!.querySelector('[data-icon="Loading"]');
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByText("Could not load threads.")).toBeNull();
  });

  it("reports a failed load without the loading indicator", () => {
    vi.useFakeTimers();
    renderStatus("error");
    act(() => vi.advanceTimersByTime(1_000));
    const region = screen.getAllByRole("status").find((status) => status.textContent === "Could not load threads.");
    expect(region).toBeDefined();
    expect(screen.queryByText("Loading threads…")).toBeNull();
  });

  it("shows the list and no loading text once ready", () => {
    vi.useFakeTimers();
    renderStatus("ready");
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByText("Loaded thread")).toBeDefined();
    expect(screen.queryByText("Loading threads…")).toBeNull();
    expect(loadingStatus()).toBeUndefined();
  });
});
