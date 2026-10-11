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

describe("pull request badge", () => {
  it("mounts pull request lookups only while the row is visible", async () => {
    let notify!: (entries: Array<{ isIntersecting: boolean }>) => void;
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: typeof notify) {
          notify = callback;
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    try {
      const view = withPr("none");
      await screen.findByText("A thread");
      expect(screen.queryByRole("link", { name: "#412" })).toBeNull();
      await act(async () => notify([{ isIntersecting: true }]));
      expect(await screen.findByRole("link", { name: "#412" })).toBeTruthy();
      await act(async () => notify([{ isIntersecting: false }]));
      expect(screen.queryByRole("link", { name: "#412" })).toBeNull();
      view.unmount();
      expect(disconnect).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  const withPr = (attention: string, state = "open") =>
    renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ id: "thr_pr" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      rpc: { listLifecycle: () => ({ rows: [] }) },
      sidebarPullRequests: {
        thr_pr: {
          number: 412,
          title: "Fix the flake",
          url: "https://github.com/o/r/pull/412",
          state,
          attention,
        } as never,
      },
    });

  it("links the PR number out to the git host", async () => {
    withPr("none");
    const badge = await screen.findByRole("link", { name: "#412" });
    expect(badge.getAttribute("href")).toBe("https://github.com/o/r/pull/412");
    expect(badge.getAttribute("title")).toBeNull();
    fireEvent.focus(badge);
    expect((await screen.findByRole("tooltip")).textContent).toBe("Fix the flake\nOpen");
  });

  it("shows no badge when the branch has no PR", async () => {
    render([thread({ id: "thr_nopr" })]);
    await screen.findByText("A thread");
    expect(screen.queryByRole("link", { name: /^#/ })).toBeNull();
  });

  // BB's richer attention state keeps failed open PRs red while other open
  // states use the emerald pull request color.
  it("colors the badge from the attention state", async () => {
    const failing = withPr("checks_failed");
    expect((await screen.findByRole("link", { name: "#412" })).className).toContain(
      "text-[color:var(--bb-sidebar-pr-alert)]",
    );
    failing.unmount();

    withPr("ready_to_merge");
    expect((await screen.findByRole("link", { name: "#412" })).className).toContain(
      "text-[color:var(--bb-sidebar-pr-open)]",
    );
  });

  it("covers pending, review, draft, closed, and merged states", async () => {
    const pending = withPr("checks_pending");
    expect((await screen.findByRole("link", { name: "#412" })).className).toContain(
      "text-[color:var(--bb-sidebar-pr-open)]",
    );
    pending.unmount();

    const review = withPr("review_requested");
    expect((await screen.findByRole("link", { name: "#412" })).className).toContain(
      "text-[color:var(--bb-sidebar-pr-open)]",
    );
    review.unmount();

    const draft = withPr("draft", "draft");
    expect((await screen.findByRole("link", { name: "#412" })).className).toContain("text-muted-foreground/60");
    draft.unmount();

    const closed = withPr("closed", "closed");
    expect((await screen.findByRole("link", { name: "#412" })).className).toContain(
      "text-[color:var(--bb-sidebar-pr-alert)]",
    );
    closed.unmount();

    withPr("merged", "merged");
    expect((await screen.findByRole("link", { name: "#412" })).className).toContain(
      "text-[color:var(--bb-sidebar-pr-merged)]",
    );
  });
});
