import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const args = process.argv.slice(2);
const appIndex = args.indexOf("--app-dir");
const appDir = resolve(appIndex < 0 ? "node_modules/bb-app" : args[appIndex + 1]);
const inheritedUrl = process.env.BB_SERVER_URL;
if (inheritedUrl && Number(new URL(inheritedUrl).port || 80) === 38886) {
  throw new Error("Refusing BB_SERVER_URL on the developer's port 38886. Strip inherited BB_* variables.");
}
const scratch = mkdtempSync("/tmp/bb-sidebar-smoke-");
if (!scratch.startsWith("/tmp/")) throw new Error("Scratch data must be under /tmp");
const children = new Set();
let cleaning;
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key === "PATH" || key === "HOME" || /^npm_/i.test(key)),
);
const freePort = () =>
  new Promise((accept, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => accept(port));
    });
  });

function start(command, argv, options = {}) {
  const child = spawn(command, argv, { env, detached: true, stdio: ["ignore", "pipe", "pipe"], ...options });
  children.add(child);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const done = new Promise((accept, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => accept({ code, stdout, stderr }));
  });
  return { child, done, output: () => ({ stdout, stderr }) };
}

async function run(command, argv, { allowFailure = false, ...options } = {}) {
  const task = start(command, argv, options);
  let timeout;
  const result = await Promise.race([
    task.done,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`Timed out: ${command} ${argv.join(" ")}`)), 120_000);
    }),
  ]).finally(() => clearTimeout(timeout));
  if (result.code !== 0 && !allowFailure)
    throw new Error(`${command} ${argv.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result;
}

function signal(child, name) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, name);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function cleanup() {
  cleaning ??= (async () => {
    for (const child of children) signal(child, "SIGTERM");
    await delay(1500);
    for (const child of children) signal(child, "SIGKILL");
    rmSync(scratch, { recursive: true, force: true });
    console.log("CLEANUP: process groups stopped; scratch data removed");
  })();
  return cleaning;
}

for (const name of ["SIGINT", "SIGTERM"]) {
  process.once(name, () => {
    void cleanup().then(() => process.exit(130));
  });
}

function chromium() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ];
  const cache = join(env.HOME, "Library/Caches/ms-playwright");
  if (existsSync(cache)) {
    for (const entry of readdirSync(cache).sort().reverse()) {
      candidates.push(join(cache, entry, "chrome-headless-shell-mac-arm64/chrome-headless-shell"));
    }
  }
  const binary = candidates.find(existsSync);
  if (!binary) throw new Error("Install Chromium or Google Chrome for the smoke test");
  return binary;
}

function browserProof(value) {
  if (value && typeof value === "object") {
    if (typeof value.rendered === "boolean" && Array.isArray(value.errors)) return value;
    for (const child of Object.values(value)) {
      const proof = browserProof(child);
      if (proof) return proof;
    }
  }
  if (typeof value === "string") {
    const marker = "SB16_BROWSER_PROOF:";
    const text = value.includes(marker) ? value.slice(value.indexOf(marker) + marker.length).split("\n")[0] : value;
    try {
      return browserProof(JSON.parse(text));
    } catch {
      /* Other tool output. */
    }
  }
}

async function inspectBrowser(bb, url, title, threadId) {
  const available = await run(bb, ["browser-automation", "open", "--help"], { allowFailure: true });
  if (available.code === 0) {
    const machines = JSON.parse((await run(bb, ["machine", "list", "--json"])).stdout);
    const hosts = Array.isArray(machines) ? machines : (machines.hosts ?? machines.machines);
    if (hosts?.length !== 1) throw new Error("Expected exactly one scratch machine");
    const opened = JSON.parse(
      (
        await run(bb, [
          "browser-automation",
          "open",
          "--backend",
          "local",
          "--headless",
          "--machine",
          hosts[0].id,
          "--thread",
          threadId,
          "--json",
        ])
      ).stdout,
    );
    const sessionId = opened.sessionId ?? opened.session?.id ?? opened.id;
    if (opened.previewDirective) console.log(opened.previewDirective);
    if (!sessionId) throw new Error("Browser Automation returned no session id");
    try {
      const script = `const p = await browser.getPage("main");
const errors = [];
p.on("pageerror", error => errors.push(error.message));
p.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
await p.goto(${JSON.stringify(url)});
await p.waitForSelector("[data-parent-card] [data-sidebar-thread-id]", { timeout: 15000 }).catch(() => {});
const proof = { rendered: await p.evaluate(({title, threadId}) => [...document.querySelectorAll("[data-parent-card] [data-sidebar-thread-id]")].some(e => e.getAttribute("aria-label") === title && e.getAttribute("data-sidebar-thread-id") === threadId), ${JSON.stringify({ title, threadId })}), errors };
console.log("SB16_BROWSER_PROOF:" + JSON.stringify(proof));
proof;`;
      const result = await run(bb, ["browser-automation", "run", sessionId, "--script", script, "--json"]);
      const proof = browserProof(JSON.parse(result.stdout));
      if (!proof) throw new Error("Browser Automation returned no sidebar assertion");
      return { rendered: proof.rendered, console: [...proof.errors, result.stderr].join("\n") };
    } finally {
      await run(bb, ["browser-automation", "close", sessionId, "--json"]);
    }
  }
  // A clean stable scratch app does not enable the Browser Automation command.
  console.log("BROWSER: Chromium fallback; scratch Browser Automation unavailable");
  const browser = await run(chromium(), [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--user-data-dir=${join(scratch, "chromium")}`,
    "--enable-logging=stderr",
    "--log-level=0",
    "--virtual-time-budget=15000",
    "--dump-dom",
    url,
  ]);
  const links = browser.stdout.match(/<a\b[^>]*>/g) ?? [];
  const rendered =
    browser.stdout.includes("data-parent-card") &&
    links.some(
      (link) => link.includes(`aria-label="${title}"`) && link.includes(`data-sidebar-thread-id="${threadId}"`),
    );
  return { rendered, console: browser.stderr };
}

try {
  const port = await freePort();
  let hostPort = await freePort();
  while (hostPort === port) hostPort = await freePort();
  if (port === 38886 || hostPort === 38886) throw new Error("Refusing the developer's port");
  const url = `http://127.0.0.1:${port}`;
  Object.assign(env, {
    BB_DATA_DIR: scratch,
    BB_SERVER_URL: url,
    BB_SERVER_PORT: String(port),
    BB_HOST_DAEMON_PORT: String(hostPort),
    BB_TELEMETRY: "false",
  });
  const version = JSON.parse(readFileSync(join(appDir, "package.json"))).version;
  console.log(`ISOLATION: bb-app ${version}; ${url}; data ${scratch}; host port ${hostPort}`);
  const app = start(process.execPath, [
    join(appDir, "dist/bb-app.js"),
    "--bundled",
    "--data-dir",
    scratch,
    "--server-port",
    String(port),
    "--host-daemon-port",
    String(hostPort),
  ]);
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      ready = (await fetch(url)).status === 200;
    } catch {
      /* Not listening yet. */
    }
    if (ready) break;
    if (app.child.exitCode !== null) throw new Error(JSON.stringify(app.output()));
    await delay(500);
  }
  if (!ready) throw new Error(`Server never became ready: ${JSON.stringify(app.output())}`);
  const bb = join(appDir, "host-daemon/dist/bb");
  console.log("READY: GET / returned 200");
  await run("npm", ["run", "build"]);
  console.log("BUILD: passed");
  await run(bb, ["plugin", "install", `path:${process.cwd()}`, "--yes"]);
  await run(bb, ["settings", "ui", "set", "sidebar.threadListProvider", "bb-sidebar/inbox"]);
  await run(bb, ["settings", "general", "onboardingCompletedAt", new Date().toISOString()]);
  const repo = join(scratch, "repo");
  await run("git", ["init", repo]);
  await run("git", [
    "-C",
    repo,
    "-c",
    "user.name=Smoke",
    "-c",
    "user.email=smoke@example.invalid",
    "commit",
    "--allow-empty",
    "-m",
    "Scratch smoke fixture",
  ]);
  const projectResult = await run(bb, ["project", "create", "--name", "Sidebar smoke", "--root", repo, "--json"]);
  const project = JSON.parse(projectResult.stdout);
  const projectId = project.id ?? project.project?.id;
  if (!projectId) throw new Error(`No project id: ${projectResult.stdout}`);
  const title = `SB16 smoke thread ${port}`;
  const threadResult = await run(bb, [
    "thread",
    "spawn",
    "--project",
    projectId,
    "--title",
    title,
    "--prompt",
    "Scratch scheduled smoke fixture",
    "--provider",
    "codex",
    "--model",
    "gpt-5",
    "--send-at",
    "7d",
    "--json",
  ]);
  const threadData = JSON.parse(threadResult.stdout);
  const threadId = threadData.id ?? threadData.thread?.id;
  if (!threadId) throw new Error("Scratch thread returned no id");
  console.log(`FIXTURE ID: ${threadId}`);
  const browser = await inspectBrowser(bb, url, title, threadId);
  const errors = browser.console
    .split("\n")
    .filter((line) =>
      /experimental_useSidebarThreadActions|experimental_useThreadActions|is not a function|\[plugin:bb-sidebar\]|Uncaught|ReferenceError|TypeError/.test(
        line,
      ),
    );
  console.log(`SIDEBAR: scratch thread ${browser.rendered ? "rendered" : "MISSING"}`);
  console.log(`CONSOLE: ${errors.length ? `FAILED\n${errors.join("\n")}` : "no sidebar/plugin JavaScript errors"}`);
  if (errors.length > 0) throw new Error("CONSOLE: sidebar smoke acceptance failed");
  if (!browser.rendered) throw new Error("SIDEBAR: sidebar smoke acceptance failed");
  console.log("PASS: sidebar renders the scratch thread without action API errors");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanup();
}
