import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect } from "@playwright/test";
import { test, fixture, cli } from "./helpers.mjs";

async function seed(title, { projectId = fixture.projectId, root } = {}) {
  const result = await cli([
    "thread",
    "spawn",
    "--project",
    projectId,
    "--title",
    title,
    "--prompt",
    "",
    "--provider",
    "codex",
    "--model",
    "gpt-5",
    "--environment",
    root ?? join(fixture.env.BB_DATA_DIR, "repo"),
  ]);
  const id = result.id ?? result.thread?.id;
  expect(id).toBeTruthy();
  try {
    await cli(["thread", "stop", id]);
    await cli(["thread", "wait", id, "--status", "idle", "--timeout", "30s"]);
    const { thread } = await cli(["thread", "get", id]);
    expect(thread.environmentId).toBeTruthy();
    expect(thread.queuedMessageCount).toBe(0);
    const events = await cli(["thread", "log", id]);
    expect(
      events.filter(
        (event) =>
          event.type.startsWith("item/") ||
          (event.type.startsWith("provider/") &&
            event.type !== "provider/warning" &&
            !(event.type === "provider/unhandled" && event.data.rawType === "account/updated")),
      ),
    ).toEqual([]);
    return { id, title };
  } catch (error) {
    await cli(["thread", "delete", id, "--yes"]);
    throw error;
  }
}

// Extra seeds exist only while their flow runs, including when an assertion fails.
export const seededTest = test.extend({
  secondProject: async ({}, use) => {
    const root = join(fixture.env.BB_DATA_DIR, "filter-repo");
    const git = promisify(execFile);
    await git("git", ["init", "--initial-branch=main", root], { env: fixture.env });
    await git(
      "git",
      [
        "-C",
        root,
        "-c",
        "user.name=Smoke",
        "-c",
        "user.email=smoke@example.invalid",
        "commit",
        "--allow-empty",
        "-m",
        "Scratch project filter fixture",
      ],
      { env: fixture.env },
    );
    const result = await cli(["project", "create", "--name", "Sidebar second project", "--root", root]);
    const id = result.id ?? result.project?.id;
    expect(id).toBeTruthy();
    try {
      const thread = await seed("Elm second project", { projectId: id, root });
      await use({ id, name: "Sidebar second project", thread });
    } finally {
      await cli(["project", "delete", id, "--yes"]);
    }
  },
  children: async ({}, use) => {
    const children = [];
    try {
      for (const title of ["Atlas child one", "Atlas child two"]) {
        children.push(await seed(title));
      }
      await use(children);
    } finally {
      for (const { id } of children) await cli(["thread", "delete", id, "--yes"]);
    }
  },
});
