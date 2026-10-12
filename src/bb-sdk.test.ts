// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { renderSlot } from "./test-slot";
import { thread } from "./test-inbox";
import { useArchiveEnvironmentThreads, useThreadActions } from "./bb-sdk";
import type { PluginThreadActionTarget } from "@get-bb/plugin-sdk/app";

afterEach(cleanup);

it.each([null, "env_1"])("normalizes sidebar environment id %s for bound actions", (id) => {
  const selected = thread({
    environment: {
      id,
      path: "/workspace",
      name: null,
      branchName: null,
      isWorktree: null,
      providerId: null,
      workspaceDisplayKind: null,
    },
  });
  const targets: PluginThreadActionTarget[] = [];
  renderSlot(
    {
      component: () => {
        useThreadActions(selected, { keys: ["bb--core/pin"] });
        return null;
      },
    },
    {},
    {
      threadActions: (target) => {
        targets.push(target);
        return [];
      },
    },
  );
  expect(targets.at(-1)).toMatchObject({ id: selected.id, environment: id ? { id, path: "/workspace" } : null });
});

it("exposes the host environment archive hook with its bound promise", async () => {
  const rendered = renderSlot(
    {
      component: () => {
        const archive = useArchiveEnvironmentThreads();
        return createElement("button", { onClick: () => void archive("env_1") }, "Archive environment");
      },
    },
    {},
  );
  fireEvent.click(screen.getByRole("button", { name: "Archive environment" }));
  expect(rendered.inspection.experimental_environmentArchiveCalls).toEqual(["env_1"]);
});
