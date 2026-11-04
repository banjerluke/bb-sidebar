// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, waitFor } from "@testing-library/react";
import { thread, render, loadInboxApp } from "./test-inbox";

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
});
