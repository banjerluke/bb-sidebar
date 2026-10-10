import { readdirSync, readFileSync } from "node:fs";

// Physical line ceilings after Prettier, tracked debt for SB-3/SB-5/SB-6.
// New production files get 500 lines. Existing debt may shrink but must not grow.
const debtLimits = {
  "src/ChildThreadList.tsx": 538,
  "src/SidebarSettings.tsx": 535,
  "src/ThreadCard.tsx": 658,
  "src/ThreadInbox.tsx": 2006,
  "src/server.ts": 2351,
};
const files = [
  "app.tsx",
  ...readdirSync("src", { recursive: true })
    .filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name))
    .map((name) => `src/${name}`),
];
let failures = 0;
for (const file of files) {
  const source = readFileSync(file, "utf8");
  const lines = source.length === 0 ? 0 : source.split(/\r?\n/).length - Number(source.endsWith("\n"));
  const limit = debtLimits[file] ?? 500;
  if (lines > limit) {
    console.error(`${file}: ${lines} lines exceeds the ${limit}-line budget. Split the file before adding more.`);
    failures++;
  }
}
if (failures > 0) process.exitCode = 1;
else console.log("File-size budgets passed.");
