import { expect, test, type CDPSession } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createEffect, getEffectDefinition, isEffectParameterVisible } from "@musart/core";
import { photographicEffect } from "./support/photographic-effect";
import { profileClock } from "./support/selection-profile";
import { startEditorTrace } from "./support/editor-action-probe";
import labels from "../../apps/web/src/components/properties/effects/library/receipt/messages.json" with { type: "json" };

async function cgroupCpuSample() {
  let membership: string | undefined;
  let path: string | undefined;
  try {
    membership = await readFile("/proc/self/cgroup", "utf8");
    const unified = membership.split("\n").find((line) => line.startsWith("0::"));
    if (!unified) throw new Error("No unified Linux cgroup v2 membership was found.");
    path = `/sys/fs/cgroup${unified.slice(3).replace(/\/$/, "")}/cpu.stat`;
    const raw = await readFile(path, "utf8");
    const values = Object.fromEntries(
      raw
        .trim()
        .split("\n")
        .map((line) => {
          const [name, value] = line.trim().split(/\s+/);
          return [name!, Number(value)];
        }),
    );
    return { available: true, membership, path, raw, values };
  } catch (error) {
    return { available: false, membership, path, error: String(error) };
  }
}

async function schedulingSample(session: CDPSession) {
  const wallTimeMs = Date.now();
  const nodeMonotonicNs = process.hrtime.bigint().toString();
  let performance;
  try {
    const { metrics } = await session.send("Performance.getMetrics");
    performance = { available: true, metrics };
  } catch (error) {
    performance = { available: false, error: String(error) };
  }
  return { wallTimeMs, nodeMonotonicNs, performance, cgroup: await cgroupCpuSample() };
}

for (const type of ["receipt", "crt", "noise", "shatter", "pink-phosphor", "gradient"] as const) {
  test(`${type} opens locally with bounded controls and normal scrolling`, async ({
    page,
    browser,
  }) => {
    await page.addInitScript(() => localStorage.setItem("musart.language", "fr"));
    const fixture = await photographicEffect(page, type, false);
    try {
      const effect = createEffect(type);
      const parameters = getEffectDefinition(type).parameters.filter((parameter) =>
        isEffectParameterVisible(effect, parameter),
      );
      const id = await fixture.load({ id: "receipt-popover" });
      await fixture.ready(id);
      const trigger = page.locator('[data-attachment-effect-id="receipt-popover"]');
      await expect(trigger.locator("img")).toBeVisible();
      await trigger.locator("img").evaluate((image: HTMLImageElement) => image.decode());
      await trigger.hover();
      const profileEnabled = Boolean(process.env.MUSART_POPOVER_PROFILE);
      const schedulingEnabled = process.env.MUSART_POPOVER_SCHEDULING === "1";
      const traceEnabled = process.env.MUSART_EDITOR_TRACE === "1";
      if (profileEnabled && traceEnabled)
        throw new Error(
          "MUSART_POPOVER_PROFILE and MUSART_EDITOR_TRACE cannot share the CDP Profiler; run these diagnostics separately.",
        );
      let diagnosticTrace:
        | Awaited<ReturnType<Awaited<ReturnType<typeof startEditorTrace>>>>
        | { error: string } = null;
      const profiling =
        profileEnabled || schedulingEnabled ? await page.context().newCDPSession(page) : null;
      const profileClocks: {
        start?: Awaited<ReturnType<typeof profileClock>>;
        end?: Awaited<ReturnType<typeof profileClock>>;
      } = {};
      if (profiling) {
        await profiling.send("Performance.enable");
      }
      if (profiling && profileEnabled) {
        await profiling.send("Profiler.enable");
        profileClocks.start = await profileClock(profiling, page);
        await profiling.send("Profiler.start");
      }
      const samples = [];
      await mkdir("artifacts/effect-popover", { recursive: true });
      for (let index = 0; index < 4; index++) {
        const schedulingBefore =
          profiling && schedulingEnabled ? await schedulingSample(profiling) : undefined;
        const stopTrace =
          index === 0 && traceEnabled
            ? await startEditorTrace(
                page,
                `artifacts/effect-popover/${process.env.MUSART_POPOVER_COHORT ?? "candidate"}-${type}-cold-opening`,
              )
            : null;
        try {
          await page.evaluate(() => {
            const selectors = [
              ".musart-app",
              ".inspector",
              ".canvas-area",
              ".editor-canvas",
              ".layers-panel",
            ];
            const counters = () =>
              Object.fromEntries(
                selectors.map((selector) => [
                  selector,
                  Number(document.querySelector<HTMLElement>(selector)?.dataset.reactRenders ?? 0),
                ]),
              );
            const button = document.querySelector<HTMLElement>(
              '[data-attachment-effect-id="receipt-popover"]',
            )!;
            button.addEventListener(
              "click",
              (event) => {
                const start = performance.now(),
                  before = counters();
                const observer = new MutationObserver(check);
                let stopped = false;
                const timeout = window.setTimeout(() => {
                  stopped = true;
                  observer.disconnect();
                  document.documentElement.dataset.receiptOpening = JSON.stringify({
                    generatedAt: event.timeStamp,
                    dispatchAt: start,
                    error: "Popover did not reach a visible animation frame within 3000 ms",
                  });
                }, 3000);
                let pending = false;
                function check() {
                  const popup = document.querySelector<HTMLElement>(
                    '.layer-attachment-popover[data-state="open"]',
                  );
                  if (!popup || pending) return;
                  pending = true;
                  observer.disconnect();
                  const mountedAtMs = performance.now() - start;
                  function visibleFrame() {
                    if (stopped) return;
                    const opacity = Number(getComputedStyle(popup!).opacity);
                    if (opacity <= 0) {
                      requestAnimationFrame(visibleFrame);
                      return;
                    }
                    const firstVisibleAtMs = performance.now() - start;
                    requestAnimationFrame(() => {
                      clearTimeout(timeout);
                      const after = counters();
                      document.documentElement.dataset.receiptOpening = JSON.stringify({
                        generatedAt: event.timeStamp,
                        dispatchAt: start,
                        dispatchToPresentationOpportunityMs: performance.now() - start,
                        generatedToPresentationOpportunityMs: performance.now() - event.timeStamp,
                        mountedAtMs,
                        firstVisibleAtMs,
                        renders: Object.fromEntries(
                          selectors.map((selector) => [
                            selector,
                            after[selector]! - before[selector]!,
                          ]),
                        ),
                        fields: popup!.querySelectorAll(".effect-parameter-row").length,
                        declaredFields: Number(
                          popup!.querySelector<HTMLElement>(".effect-controls")!.dataset
                            .effectParameterCount,
                        ),
                        opacity: Number(getComputedStyle(popup!).opacity),
                        height: popup!.getBoundingClientRect().height,
                      });
                    });
                  }
                  requestAnimationFrame(visibleFrame);
                }
                observer.observe(document.body, {
                  childList: true,
                  subtree: true,
                  attributes: true,
                  attributeFilter: ["data-state"],
                });
                check();
              },
              { once: true, capture: true },
            );
            delete document.documentElement.dataset.receiptOpening;
          });
          await trigger.click();
          await page.waitForFunction(() =>
            Boolean(document.documentElement.dataset.receiptOpening),
          );
          const sample = await page.evaluate(() =>
            JSON.parse(document.documentElement.dataset.receiptOpening!),
          );
          if (profiling && schedulingEnabled)
            sample.scheduling = {
              before: schedulingBefore,
              after: await schedulingSample(profiling),
            };
          samples.push(sample);
          await writeFile(
            `artifacts/effect-popover/${process.env.MUSART_POPOVER_COHORT ?? "candidate"}-${type}-partial.json`,
            JSON.stringify({ type, profileClocks, diagnosticTrace, samples }, null, 2),
          );
        } finally {
          if (stopTrace) {
            try {
              diagnosticTrace = await stopTrace();
            } catch (error) {
              diagnosticTrace = { error: String(error) };
            }
            await writeFile(
              `artifacts/effect-popover/${process.env.MUSART_POPOVER_COHORT ?? "candidate"}-${type}-partial.json`,
              JSON.stringify({ type, profileClocks, diagnosticTrace, samples }, null, 2),
            );
          }
        }
        expect(samples[index].error ?? null).toBeNull();
        const popup = page.locator('.layer-attachment-popover[data-state="open"]');
        await expect(popup.locator(".effect-controls")).toHaveAttribute(
          "data-effect-parameter-count",
          String(parameters.length),
        );
        expect(samples[index].fields).toBeLessThanOrEqual(16);
        expect(samples[index].declaredFields).toBe(parameters.length);
        expect(samples[index].opacity).toBeGreaterThan(0);
        expect(samples[index].height).toBeGreaterThan(0);
        await page.keyboard.press("Escape");
        await expect(page.locator(".layer-attachment-popover")).toHaveCount(0);
      }
      const environment = await page.evaluate(async () => {
        const info = navigator.gpu ? (await navigator.gpu.requestAdapter())?.info : null;
        return {
          userAgent: navigator.userAgent,
          viewport: [innerWidth, innerHeight],
          dpr: devicePixelRatio,
          backend: document.querySelector(".editor-gpu-scene canvas")?.getAttribute("data-backend"),
          adapter: info
            ? {
                vendor: info.vendor,
                architecture: info.architecture,
                device: info.device,
                description: info.description,
                isFallbackAdapter: info.isFallbackAdapter,
              }
            : null,
          readbacks: window.__musartVideoReadbacks,
        };
      });
      const report = {
        type,
        browser: browser.version(),
        environment,
        profileClocks,
        diagnosticTrace,
        diagnostics: { profileEnabled, schedulingEnabled, traceEnabled },
        samples,
      };
      await mkdir("artifacts/effect-popover", { recursive: true });
      if (profiling && profileEnabled) {
        const { profile } = await profiling.send("Profiler.stop");
        profileClocks.end = await profileClock(profiling, page);
        await writeFile(
          `artifacts/effect-popover/${process.env.MUSART_POPOVER_COHORT ?? "candidate"}-${type}.cpuprofile`,
          JSON.stringify(profile),
        );
      }
      if (profiling) await profiling.detach();
      await writeFile(
        `artifacts/effect-popover/${process.env.MUSART_POPOVER_COHORT ?? "candidate"}-${type}.json`,
        JSON.stringify(report, null, 2),
      );
      console.log(JSON.stringify(report));
      await trigger.click();
      const popup = page.locator('.layer-attachment-popover[data-state="open"]');
      const viewport = popup.locator(".layer-attachment-viewport");
      if (type === "receipt") {
        const last = await popup
          .locator("[data-parameter-index]")
          .last()
          .getAttribute("data-parameter-index");
        const field = popup
          .locator(`[data-parameter-index="${last}"]`)
          .locator('input,button:not([tabindex="-1"])')
          .last();
        await field.focus();
        await field.press("Tab");
        expect(
          await page.evaluate(
            () =>
              document.activeElement?.closest<HTMLElement>("[data-parameter-index]")?.dataset
                .parameterIndex,
          ),
        ).toBe(String(Number(last) + 1));
        await page.keyboard.press("Shift+Tab");
        expect(
          await page.evaluate(
            () =>
              document.activeElement?.closest<HTMLElement>("[data-parameter-index]")?.dataset
                .parameterIndex,
          ),
        ).toBe(last);
        const original = await page.evaluate(() => window.musart!.snapshot().project);
        const amount = popup.getByRole("textbox", { name: "Intensité", exact: true });
        await viewport.evaluate((node) => {
          node.scrollTop = 0;
        });
        await amount.fill("30");
        await viewport.evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
        await expect(amount).toHaveValue("30");
        expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(original);
        await amount.press("Escape");
        await expect(popup).toHaveCount(0);
        await trigger.click();
        await expect(popup.getByRole("textbox", { name: "Intensité", exact: true })).toHaveValue(
          "100",
        );
      }
      await viewport.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
      });
      await expect(
        popup.locator(`[data-parameter-index="${parameters.length - 1}"]`),
      ).toBeAttached();
      expect(await popup.locator(".effect-parameter-row").count()).toBeLessThanOrEqual(20);
      if (type === "receipt") {
        await page.screenshot({ path: "artifacts/effect-popover/receipt-bottom.png" });
        const original = await page.evaluate(() => window.musart!.snapshot());
        const field = popup.getByRole("textbox", {
          name: labels.fr.parameter.foldWidth,
          exact: true,
        });
        await field.fill("35");
        await field.press("Tab");
        const changed = await page.evaluate(() => window.musart!.snapshot());
        expect(changed.revision).toBe(original.revision + 1);
        expect(changed.project.pages[0]!.layers[0]!.effects[0]!.settings!.foldWidth).not.toBe(
          original.project.pages[0]!.layers[0]!.effects[0]!.settings!.foldWidth,
        );
        await page.getByRole("button", { name: "Annuler", exact: true }).click();
        expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(
          original.project,
        );
        expect(await page.evaluate(() => window.musart!.snapshot().canUndo)).toBe(false);
        await trigger.click();
        await page.screenshot({ path: "artifacts/effect-popover/receipt-top.png" });
      }
      expect(await page.evaluate(() => window.__musartVideoReadbacks)).toMatchObject({
        gpu: 0,
        webgl: 0,
        canvas: 0,
      });
      expect(fixture.errors).toEqual([]);
      if (!process.env.MUSART_POPOVER_BASELINE) {
        for (const sample of samples) expect(sample.renders[".musart-app"]).toBe(0);
        for (const sample of samples.slice(1)) {
          expect(sample.renders[".musart-app"]).toBe(0);
          expect(sample.renders[".inspector"]).toBe(0);
          expect(sample.renders[".canvas-area"]).toBe(0);
        }
        for (const sample of samples)
          expect(sample.dispatchToPresentationOpportunityMs).toBeLessThan(150);
      }
    } finally {
      await fixture.close();
    }
  });
}
