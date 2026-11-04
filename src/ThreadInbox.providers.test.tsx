// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import { inbox, listProps, thread, render, loadInboxApp } from "./test-inbox";
import { renderSlot } from "./test-slot";

vi.mock("sonner", async () => (await import("./test-inbox")).sonnerMock());

await loadInboxApp();

describe("ThreadInbox", () => {
  it("loads a project favicon before the title", async () => {
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

  it("draws typed letters or an emoji in place of the project icon", async () => {
    const view = renderSlot(inbox, listProps, {
      sidebarThreads: {
        status: "ready",
        threads: [
          thread({ id: "a", title: "Letters thread", projectId: "sm" }),
          thread({ id: "b", title: "Emoji thread", projectId: "music" }),
        ],
        projects: [
          { id: "sm", name: "sm-app", isPersonal: false, href: "", settingsHref: "" },
          { id: "music", name: "music", isPersonal: false, href: "", settingsHref: "" },
        ],
      },
      rpc: {
        listLifecycle: () => ({ rows: [] }),
        listProjectIconGlyphs: () => ({ glyphs: { sm: "SM", music: "🎸" } }),
      },
    });
    await waitFor(() => expect(view.container.querySelector('[data-letter="SM"]')).not.toBeNull());
    expect(view.container.querySelector("[data-glyph]")?.getAttribute("data-glyph")).toBe("🎸");
    // The typed icon wins over the project's favicon.
    expect(view.container.querySelector('img[src*="project-icon"]')).toBeNull();
  });
});
