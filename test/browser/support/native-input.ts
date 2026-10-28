import type { Page } from "@playwright/test";
import { dispatchPanBurst } from "./pan-presentation";

/** Browser/input-producer control. No editor, rendering engine or persistence is initialized. */
export async function measureNativeInputControl(page: Page) {
  await page.goto("about:blank");
  await page.setContent(
    '<div id="surface" style="position:fixed;inset:0;overflow:hidden;touch-action:none;background:#202126"><div id="content" style="width:300px;height:240px;background:#6799cc;will-change:transform"></div></div>',
  );
  const measured = page.evaluate(
    () =>
      new Promise<{
        inputs: number;
        frames: {
          generatedAt: number;
          deliveredAt: number;
          rafAt: number;
          presentedAt?: number;
          x: number;
          y: number;
        }[];
        gaps: number[];
      }>((resolve, reject) => {
        const surface = document.getElementById("surface")!,
          content = document.getElementById("content")!;
        let generatedAt = 0,
          deliveredAt = 0,
          previousInput = 0,
          previousFrame = 0,
          inputs = 0,
          x = 0,
          y = 0,
          frame = 0;
        const frames: {
            generatedAt: number;
            deliveredAt: number;
            rafAt: number;
            presentedAt?: number;
            x: number;
            y: number;
          }[] = [],
          gaps: number[] = [];
        const pending = new Set<number>();
        const cleanup = () => {
          clearTimeout(timer);
          cancelAnimationFrame(frame);
          for (const handle of pending) cancelAnimationFrame(handle);
          window.removeEventListener("wheel", capture, true);
          surface.removeEventListener("wheel", move);
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error("Native retained-DOM control timed out."));
        }, 10000);
        const sample = (time: number) => {
          if (previousFrame) gaps.push(time - previousFrame);
          previousFrame = time;
          if (generatedAt !== previousInput) {
            previousInput = generatedAt;
            const transform = new DOMMatrixReadOnly(getComputedStyle(content).transform);
            const entry = {
              generatedAt,
              deliveredAt,
              rafAt: performance.now(),
              x: transform.m41,
              y: transform.m42,
            };
            frames.push(entry);
            const handle = requestAnimationFrame(() => {
              pending.delete(handle);
              Object.assign(entry, { presentedAt: performance.now() });
            });
            pending.add(handle);
          }
          if (
            document.documentElement.dataset.nativeControlDone === "true" &&
            time - deliveredAt > 80
          ) {
            frame = requestAnimationFrame(() => {
              cleanup();
              resolve({ inputs, frames, gaps });
            });
          } else frame = requestAnimationFrame(sample);
        };
        function capture(event: WheelEvent) {
          generatedAt = event.timeStamp;
          deliveredAt = performance.now();
          inputs++;
          if (!frame) frame = requestAnimationFrame(sample);
        }
        function move(event: WheelEvent) {
          event.preventDefault();
          x -= event.deltaX * 0.5;
          y -= event.deltaY * 0.5;
          content.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        }
        window.addEventListener("wheel", capture, true);
        surface.addEventListener("wheel", move, { passive: false });
        document.documentElement.dataset.nativeControlReady = "true";
      }),
  );
  await page.waitForFunction(() => document.documentElement.dataset.nativeControlReady === "true");
  await page.mouse.move(400, 300);
  const producer = await dispatchPanBurst(page, "wheel", { x: 400, y: 300 });
  await page.evaluate(() => {
    document.documentElement.dataset.nativeControlDone = "true";
  });
  const result = await measured;
  const p95 = (values: number[]) =>
    [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * 0.95)]!;
  const summary = {
    inputToRafP95: p95(result.frames.map((frame) => frame.rafAt - frame.generatedAt)),
    dispatchDelayP95: p95(result.frames.map((frame) => frame.deliveredAt - frame.generatedAt)),
    handlerToRafP95: p95(result.frames.map((frame) => frame.rafAt - frame.deliveredAt)),
    inputToPresentedP95: p95(result.frames.map((frame) => frame.presentedAt! - frame.generatedAt)),
    frameP95: p95(result.gaps),
  };
  const environment = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    dpr: devicePixelRatio,
    viewport: { width: innerWidth, height: innerHeight },
  }));
  return {
    browser: page.context().browser()!.version(),
    environment,
    control:
      "Retained HTML transform; no editor, engine, IndexedDB, GPU-renderer mocks or application callbacks.",
    producer,
    ...result,
    summary,
  };
}
