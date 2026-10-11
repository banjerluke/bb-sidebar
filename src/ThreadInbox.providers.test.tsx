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

describe("ThreadInbox", () => {
  it("renders provider names, logos, and theme tints from bb's directory", () => {
    const view = renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [thread({ providerId: "pi", title: "Pi thread" })],
        projects: [{ id: "proj_1", name: "bb", isPersonal: false, href: "", settingsHref: "" }],
      },
      providers: {
        status: "ready",
        providers: [
          {
            id: "pi",
            pluginId: "provider-pi",
            displayName: "Pi",
            available: true,
            completedTurnDisplay: "collapse",
            maintenance: {
              health: true,
              usage: false,
              installation: true,
            },
            logoUrl: "/api/v1/system/providers/pi/logo",
            capabilities: {
              modelCatalogScope: "workspace",
              permissionModes: ["full"],
              supportsFork: true,
              supportsNativeUserQuestion: false,
              supportsServiceTier: false,
              supportsSessionRewind: true,
              supportsThreadArchive: false,
              supportsThreadRename: false,
            },
            composerActions: [],
            strings: {
              signInHint: "Run pi to sign in.",
              expiredHint: "Run pi to sign in again.",
              installUrl: "https://pi.dev",
              iconTint: { light: "#6D5DFB", dark: "#A99EFF" },
            },
          },
        ],
      },
      rpc: { listLifecycle: () => ({ rows: [] }) },
    });

    const glyph = screen.getByRole("img", { name: "Pi" });
    const marks = glyph.querySelectorAll<HTMLElement>("[aria-hidden=true]");
    expect(marks).toHaveLength(2);
    expect(marks[0]!.style.maskImage).toContain("/api/v1/system/providers/pi/logo");
    expect(marks[0]!.style.backgroundColor).toBe("rgb(109, 93, 251)");
    expect(marks[1]!.style.backgroundColor).toBe("rgb(169, 158, 255)");
    expect(view.container.querySelector('[aria-label="pi"]')).toBeNull();
  });

  it("falls back to the provider id when the directory has no match", () => {
    render([thread({ providerId: "custom-agent" })]);

    const glyph = screen.getByRole("img", { name: "custom-agent" });
    expect(glyph.querySelector(".rounded-full")).not.toBeNull();
  });

  it("loads a project favicon beside the project name", async () => {
    const view = render([
      thread({
        id: "icon-thread",
        environment: {
          id: "env_1",
          name: "main",
          branchName: "main",
          workspaceDisplayKind: "other",
          path: null,
          isWorktree: null,
          providerId: null,
        },
      }),
    ]);

    const preload = await waitFor(() => {
      const image = view.container.querySelector<HTMLImageElement>('img[src*="project-icon"]');
      expect(image).not.toBeNull();
      return image!;
    });
    expect(preload.src).toContain("projectId=proj_1");
    expect(preload.src).not.toContain("environmentId");
    fireEvent.load(preload);
    expect(view.container.querySelector('img.object-contain[src*="project-icon"]')).not.toBeNull();
  });
});
