import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import ts from "typescript";

const RELEASE_TAG = "v0.2.34";
const RELEASE_COMMIT = "e7ab8a399f440479e15f87d695c020754560da16";
if (process.argv.length !== 3) throw new Error("Usage: npm run fixture:db -- <new-output.sqlite>");
const output = resolve(process.argv[2]);
if (existsSync(output)) throw new Error(`Refusing to overwrite fixture: ${output}`);
const release = execFileSync("git", ["rev-parse", `${RELEASE_TAG}^{commit}`], { encoding: "utf8" }).trim();
if (release !== RELEASE_COMMIT) throw new Error(`${RELEASE_TAG} no longer points to ${RELEASE_COMMIT}`);

// Load the release factory, including extensionless local TS imports, without
// building a second schema or loading HEAD's production modules.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
      const url = new URL(specifier, context.parentURL);
      if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
      if (existsSync(fileURLToPath(`${url.href}.ts`))) {
        return { url: `${url.href}.ts`, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".ts")) {
      return {
        format: "module",
        source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText,
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});

const directory = mkdtempSync(join(tmpdir(), "sidebar-release-"));
const checkout = join(directory, RELEASE_TAG);
const realNow = Date.now;
let harness;
let addedWorktree = false;
try {
  execFileSync("git", ["worktree", "add", "--quiet", "--detach", checkout, RELEASE_TAG]);
  addedWorktree = true;
  // The tag and this repo pin the same SDK; reuse installed dependencies only.
  symlinkSync(resolve("node_modules"), join(checkout, "node_modules"), "dir");
  const { default: plugin } = await import(pathToFileURL(join(checkout, "src/server.ts")).href);
  const host = createFakePluginHost({ pluginId: "bb-sidebar" });
  harness = host.harness;
  Date.now = () => 1_800_000_000_000;
  await plugin(host.bb);
  const db = host.bb.storage.database();
  const insert = db.prepare(`INSERT INTO thread_lifecycle
    (thread_id, parked_at, settled_at, settled_override, snoozed_until, snoozed_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  insert.run("parked", 1_799_999_000_000, null, null, null, null);
  insert.run("snoozed", null, null, null, 1_800_003_600_000, 1_800_000_000_000);
  insert.run("settled", null, 1_799_999_000_000, "settled", null, null);
  insert.run("override", null, null, "active", null, null);
  insert.run("child", null, 1_799_999_000_000, "settled", null, null);
  db.prepare("INSERT INTO inbox_order (thread_id, sort_index) VALUES (?, ?)").run("second", 0);
  db.prepare("INSERT INTO inbox_order (thread_id, sort_index) VALUES (?, ?)").run("first", 1);
  db.prepare(`INSERT INTO sidebar_settings
    (id, snooze_presets, inactive_threads_enabled, inactive_after_hours,
     auto_settle_inactive, auto_settle_after_days, auto_settle_on_merge,
     show_running_children_when_collapsed, child_sort_field, child_sort_direction,
     child_icon_style, compact_working_threads, working_shelf, dock_shelves)
    VALUES (1, '1h, 4h, 2d', 0, 12, 0, 7, 0, 0, 'activity', 'descending', 'provider', 1, 1, 1)`).run();
  db.prepare("INSERT INTO project_icons (project_id, path, updated_at) VALUES (?, ?, ?)").run(
    "proj_1",
    "assets/logo.png",
    Date.now(),
  );
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=";
  db.prepare(`INSERT INTO project_icon_uploads
    (project_id, filename, mime_type, content_base64, size_bytes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    "proj_2",
    "pixel.png",
    "image/png",
    png,
    Buffer.from(png, "base64").length,
    Date.now(),
  );
  db.prepare("INSERT INTO title_recovery_attempts (thread_id) VALUES (?)").run("settled");
  mkdirSync(dirname(output), { recursive: true });
  // SQLite also refuses an existing target, including one created after our check.
  db.prepare("VACUUM INTO ?").run(output);
  console.log(`Generated ${output} from ${RELEASE_TAG} (${RELEASE_COMMIT})`);
} finally {
  Date.now = realNow;
  try {
    await harness?.lifecycle.dispose();
  } finally {
    if (addedWorktree) execFileSync("git", ["worktree", "remove", "--force", checkout]);
    rmSync(directory, { recursive: true, force: true });
  }
}
