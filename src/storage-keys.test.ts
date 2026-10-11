import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { BROWSER_EVENTS } from "./lib/browser-events";
import { PLUGIN_STORAGE_KEYS, STORAGE_KEYS } from "./lib/storage-keys";

it("declares every production storage key once in the registry", () => {
  // Golden fixtures and tests deliberately retain literal keys as compatibility evidence.
  const files = execFileSync("rg", ["--files", "src", "-g", "*.ts", "-g", "*.tsx", "-g", "!*.test.*"])
    .toString()
    .trim()
    .split("\n");
  const occurrences = files.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/["'`]bb-sidebar:[\w:-]+["'`]/g)].map((match) => ({
      file,
      key: match[0].slice(1, -1),
    })),
  );
  const storage = occurrences.filter(({ key }) => !Object.values(BROWSER_EVENTS).includes(key as never));
  expect(storage.map(({ key }) => key).sort()).toEqual(
    Object.values(STORAGE_KEYS)
      .map(({ key }) => key)
      .sort(),
  );
  expect(storage.every(({ file }) => file === "src/lib/storage-keys.ts")).toBe(true);
  expect(occurrences.filter(({ key }) => Object.values(BROWSER_EVENTS).includes(key as never))).toEqual(
    Object.values(BROWSER_EVENTS).map((key) => ({ file: "src/lib/browser-events.ts", key })),
  );
  expect(new Set(PLUGIN_STORAGE_KEYS).size).toBe(PLUGIN_STORAGE_KEYS.length);
  expect(PLUGIN_STORAGE_KEYS).toEqual(
    Object.values(STORAGE_KEYS)
      .sort((a, b) => a.evictionPriority - b.evictionPriority)
      .map(({ key }) => key),
  );
});
