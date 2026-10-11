import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import ts from "typescript";

// Run the real factory/migrations without a second schema definition or build.
// Only this process uses the TS loader, including extensionless local imports.
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

const output = resolve(process.argv[2] ?? "src/fixtures/sidebar-v0.2.34.sqlite");
const { default: plugin } = await import(pathToFileURL(resolve("src/server.ts")).href);
const { bb, harness } = createFakePluginHost({ pluginId: "bb-sidebar" });
const realNow = Date.now;
Date.now = () => 1_800_000_000_000;
try {
  await plugin(bb);
  const db = bb.storage.database();
  const insert = db.prepare(`INSERT INTO thread_lifecycle
    (thread_id, parked_at, settled_at, settled_override, snoozed_until, snoozed_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  insert.run("parked", 1_799_999_000_000, null, null, null, null);
  insert.run("snoozed", null, null, null, 1_800_003_600_000, 1_800_000_000_000);
  insert.run("settled", null, 1_799_999_000_000, "settled", null, null);
  insert.run("override", null, null, "active", null, null);
  insert.run("child", null, 1_799_999_000_000, "settled", null, null);
  db.prepare("INSERT INTO inbox_order VALUES (?, ?)").run("second", 0);
  db.prepare("INSERT INTO inbox_order VALUES (?, ?)").run("first", 1);
  db.prepare(`INSERT INTO sidebar_settings VALUES
    (1, '1h, 4h, 2d', 0, 12, 0, 7, 0, 0, 'activity', 'descending', 'provider', 1, 1, 1, 1, 1, 'full')`).run();
  db.prepare("INSERT INTO project_icons VALUES (?, ?, ?)").run("proj_1", "assets/logo.png", Date.now());
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=";
  db.prepare("INSERT INTO project_icon_uploads VALUES (?, ?, ?, ?, ?, ?)").run(
    "proj_2",
    "pixel.png",
    "image/png",
    png,
    Buffer.from(png, "base64").length,
    Date.now(),
  );
  db.prepare("INSERT INTO project_colors VALUES (?, ?)").run("proj_1", "#123456");
  db.prepare("INSERT INTO title_recovery_attempts VALUES (?)").run("settled");
  mkdirSync(dirname(output), { recursive: true });
  rmSync(output, { force: true });
  db.prepare("VACUUM INTO ?").run(output);
} finally {
  Date.now = realNow;
  await harness.lifecycle.dispose();
}
