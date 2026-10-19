import { expect } from "@playwright/test";
import { test, cli, rpc, shelf, expand, reset, open, fixture } from "./helpers.mjs";
import { seed } from "./seeds.mjs";

test.use({ reducedMotion: "no-preference" });

// Real rows on the runner's scratch server. Timing is saved with the report;
// structural assertions catch animation regressions without a machine-specific FPS gate.
test("large settled shelves toggle without bulk or height animations", async ({ page, request }, testInfo) => {
  test.setTimeout(300_000);
  const threads = [];
  const samples = [];
  try {
    await reset(request);
    for (let index = 0; index < 60; index++) {
      const thread = await seed(`Settled performance ${String(index).padStart(2, "0")}`);
      threads.push(thread);
      await rpc(request, "settle", { threadId: thread.id });
    }
    await open(page);
    await expand(page, "Settled");
    const settled = shelf(page, "Settled");
    await expect(settled.getByRole("link")).toHaveCount(10);
    await settled.getByRole("button", { name: "Load 25 more" }).click();
    await expect(settled.getByRole("link")).toHaveCount(35);
    await settled.getByRole("button", { name: "Load 25 more" }).click();
    await expect(settled.getByRole("link")).toHaveCount(60);

    for (const docked of [true, false]) {
      await rpc(request, "updateSidebarSettings", {
        ...fixture.defaultSettings,
        dockShelves: docked,
        projectColorsEnabled: true,
      });
      await expect(page.locator("[data-shelf-dock]")).toHaveCount(docked ? 1 : 0);
      const toggle = settled.getByRole("button", { name: /^Settled/, expanded: true });
      await toggle.scrollIntoViewIfNeeded();
      // Let earlier pagination and docking transitions finish before measuring.
      await page.evaluate(async () => {
        await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {})));
      });
      for (let repeat = 0; repeat < 6; repeat++) {
        const sample = await settled.evaluate(async (section) => {
          const button = section.querySelector("button[aria-expanded]");
          const root = section.closest("[data-bb-sidebar-root]");
          const expanding = button.getAttribute("aria-expanded") === "false";
          const longTasks = [];
          const observer = new PerformanceObserver((entries) => {
            longTasks.push(...entries.getEntries().map((entry) => entry.duration));
          });
          observer.observe({ type: "longtask" });
          await new Promise(requestAnimationFrame);
          const started = performance.now();
          let previous = started;
          const gaps = [];
          let rowAnimations = 0;
          let heightAnimations = 0;
          button.click();
          await new Promise((resolve) => {
            function frame() {
              const now = performance.now();
              gaps.push(now - previous);
              previous = now;
              for (const animation of root.getAnimations({ subtree: true })) {
                const effect = animation.effect;
                if (effect.target?.tagName === "LI") rowAnimations++;
                if (effect.getKeyframes().some((keyframe) => "height" in keyframe || "width" in keyframe))
                  heightAnimations++;
              }
              if (now - started < 250) requestAnimationFrame(frame);
              else resolve();
            }
            requestAnimationFrame(frame);
          });
          observer.disconnect();
          return {
            expanding,
            nextFrameMs: gaps[0],
            maxFrameGapMs: Math.max(...gaps),
            longTasks,
            rowAnimations,
            heightAnimations,
            rows: section.querySelectorAll("a[data-sidebar-thread-id]").length,
          };
        });
        samples.push({ docked, ...sample });
        expect(sample.rows).toBe(sample.expanding ? 60 : 0);
        expect(sample.rowAnimations).toBe(0);
        expect(sample.heightAnimations).toBe(0);
      }
    }
    // Selecting a settled thread must keep it reachable even when collapsed.
    await settled.getByRole("link").first().click();
    const selectedTitle = await settled.getByRole("link").first().getAttribute("aria-label");
    await settled.getByRole("button", { name: /^Settled/, expanded: true }).click();
    await expect(settled.getByRole("link")).toHaveCount(1);
    await expect(settled.getByRole("link")).toHaveAttribute("aria-label", selectedTitle);
    await expand(page, "Settled");
    await expect(settled.getByRole("link")).toHaveCount(60);
    await page.screenshot({ path: testInfo.outputPath("settled-expanded.png") });
  } finally {
    await testInfo.attach("shelf-motion-timing", {
      body: JSON.stringify(samples, null, 2),
      contentType: "application/json",
    });
    console.log("Shelf motion timing:", JSON.stringify(samples));
    for (const { id } of threads) await cli(["thread", "delete", id, "--yes"]);
  }
});
