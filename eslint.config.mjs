import { readdirSync } from "node:fs";
import tseslint from "typescript-eslint";

// Keep runtime classifications here and in AGENTS.md in sync until SB-8 moves folders.
const nodeModules = [
  "server",
  "ports-host",
  "port-scan",
  "auto-title",
  "cloud-title",
  "regenerate-title",
  "port-discovery",
  "thread-ports",
  "thread-pull-requests",
  "thread-tasks",
];
const browserModules = [
  "project-colors",
  "title-generation-state",
  "sidebar-settings",
  "working-since",
  "working-tree",
  "drag-preview",
  "settled-port-prompt",
];
const appFiles = [
  "app.tsx",
  "src/*.tsx",
  "src/components/**",
  "src/lib/**",
  "src/use*.ts",
  ...browserModules.map((name) => `src/${name}.ts`),
];
const appPatterns = [
  {
    regex: "(^|/)(server|ports-host)(\\.[cm]?[jt]sx?)?$",
    allowTypeImports: true,
    message: "Browser code may only import types from Node entries; SB-4 will move the RPC contract.",
  },
  {
    group: ["node:*", "better-sqlite3", "better-sqlite3/*"],
    allowTypeImports: true,
    message: "Node values must stay in the server or host runtime.",
  },
];
// Match extensionless imports too: most imports of TSX modules omit the extension.
const tsxNames = ["app.tsx", ...readdirSync("src", { recursive: true })]
  .filter((name) => name.endsWith(".tsx"))
  .map((name) =>
    name
      .split("/")
      .at(-1)
      .slice(0, -4)
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );

export default [
  { ignores: ["node_modules/**", "dist/**", "coverage/**", "tmp/**"] },
  {
    files: ["app.tsx", "src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 200, skipBlankLines: true, skipComments: true, IIFEs: true }],
    },
  },
  {
    files: appFiles,
    rules: { "no-restricted-imports": ["error", { patterns: appPatterns }] },
  },
  {
    files: ["src/*.ts"],
    ignores: [
      "src/*.test.ts",
      "src/*.d.ts",
      "src/test-*.ts",
      "src/use*.ts",
      ...[...nodeModules, ...browserModules].map((name) => `src/${name}.ts`),
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...appPatterns,
            {
              group: ["react", "react/*", "node:*"],
              message: "Shared modules must stay independent of React and Node.",
            },
          ],
        },
      ],
    },
  },
  {
    files: nodeModules.map((name) => `src/${name}.ts`),
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react/*"], message: "Node runtime modules must not import React." },
            {
              regex: `\\.tsx$|(^|/)(${tsxNames.join("|")})(\\.tsx)?$`,
              message: "Node runtime modules must not import TSX app modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/**/*.test.{ts,tsx}"],
    rules: { "max-lines": "off", "max-lines-per-function": "off" },
  },
  {
    files: ["src/ports-host.test.ts"],
    rules: {
      // Vitest importOriginal needs typeof import("node:...") to type real mock modules.
      "@typescript-eslint/consistent-type-imports": ["error", { disallowTypeAnnotations: false }],
    },
  },
];
