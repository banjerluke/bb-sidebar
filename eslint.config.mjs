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

function nodePatterns(serverLegacyImports = false) {
  const legacyModules = ["sidebar-settings", "project-colors"];
  const restrictedBrowserModules = serverLegacyImports
    ? browserModules.filter((name) => !legacyModules.includes(name))
    : browserModules;
  return [
    { group: ["react", "react/*"], message: "Node runtime modules must not import React." },
    {
      regex: `\\.tsx$|(^|/)(${tsxNames.join("|")})(\\.tsx)?$`,
      message: "Node runtime modules must not import TSX app modules.",
    },
    {
      regex: "(^|/)(use[^/]*$|(lib|components)(/|$))",
      message: "Node runtime modules must not import browser hooks, lib, or components.",
    },
    {
      regex: `(^|/)(${restrictedBrowserModules.join("|")})(\\.[cm]?[jt]sx?)?$`,
      message: "Node runtime modules must not import browser modules.",
    },
    ...(serverLegacyImports
      ? [
          // SB-4 debt: only the server's existing settings constants, pure helpers, and type.
          {
            regex: "(^|/)sidebar-settings(\\.[cm]?[jt]sx?)?$",
            allowImportNames: [
              "CHILD_THREAD_ICON_STYLES",
              "CHILD_THREAD_SORT_DIRECTIONS",
              "CHILD_THREAD_SORT_FIELDS",
              "childThreadSettingsOf",
              "DEFAULT_SIDEBAR_SETTINGS",
              "PROJECT_COLOR_DISPLAYS",
              "projectColorDisplayOf",
              "SIDEBAR_SETTINGS_CHANNEL",
              "SidebarSettingsValues",
            ],
            message: "SB-4 debt permits only the server's existing settings imports.",
          },
          // SB-4 moves this channel constant to shared code; no other color imports are allowed.
          {
            regex: "(^|/)project-colors(\\.[cm]?[jt]sx?)?$",
            allowImportNames: ["PROJECT_COLORS_CHANNEL"],
            message: "SB-4 debt permits only PROJECT_COLORS_CHANNEL in the server.",
          },
        ]
      : []),
  ];
}

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
      "no-restricted-imports": ["error", { patterns: nodePatterns() }],
    },
  },
  {
    files: ["src/server.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: nodePatterns(true) }],
      // allowImportNames does not reject bare side-effect imports; SB-4 exceptions require bindings.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration[specifiers.length=0][source.value=/(sidebar-settings|project-colors)([.][cm]?[jt]sx?)?$/]",
          message: "SB-4 debt permits only existing named imports, not browser module side effects.",
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
