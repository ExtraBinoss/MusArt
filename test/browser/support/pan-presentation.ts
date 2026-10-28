import type { Page } from "@playwright/test";

let sequence = 0;

/** Native input bursts record computed CSS poses and a second RAF after their paint opportunity. */
export async function measurePanPresentation(page: Page, mode: "wheel" | "hand") {
  const viewport = (await page.getByTestId("editor-canvas").boundingBox())!;
  const point = { x: viewport.x + 100, y: viewport.y + viewport.height * 0.6 };
  await page.mouse.move(point.x, point.y);
  if (mode === "hand") {
    await page.getByTestId("editor-canvas").focus();
    await page.keyboard.down("Space");
    await page.mouse.down();
  }
  const token = String(++sequence);
  const measured = page.evaluate(
    ({ token, mode }) =>
      new Promise<{
        frames: {
          at: number;
          x: number;
          y: number;
          inputToRafMs: number;
          dispatchDelayMs: number;
          handlerToRafMs: number;
          inputToPresentedMs?: number;
          poseError: number;
        }[];
        gaps: number[];
        longTasks: number[];
        inputs: number;
        before: { commits: Record<string, string | undefined>; gpu: Record<string, number> };
        after: { commits: Record<string, string | undefined>; gpu: Record<string, number> };
        marks: { rulers: number; guides: number; selections: number };
      }>((resolve, reject) => {
        const board = document.querySelector<HTMLElement>('[data-testid="artboard"]')!;
        const capture = () => ({
          commits: Object.fromEntries(
            [
              ".musart-app",
              ".inspector",
              ".canvas-area",
              ".editor-canvas",
              ".editor-gpu-scene",
            ].map((selector) => [
              selector,
              document.querySelector<HTMLElement>(selector)!.dataset.reactRenders,
            ]),
          ),
          gpu: JSON.parse(
            board.querySelector<HTMLCanvasElement>("canvas")!.dataset.gpuStats!,
          ) as Record<string, number>,
        });
        const before = capture();
        const initial = board.getBoundingClientRect();
        const initialPose = { x: Number(board.dataset.panX), y: Number(board.dataset.panY) };
        const frames: {
          at: number;
          x: number;
          y: number;
          inputToRafMs: number;
          dispatchDelayMs: number;
          handlerToRafMs: number;
          inputToPresentedMs?: number;
          poseError: number;
        }[] = [];
        const gaps: number[] = [],
          longTasks: number[] = [];
        let latest = 0,
          deliveredAt = 0,
          lastFrameInput = 0,
          count = 0,
          frame = 0,
          previousFrame = 0,
          finishing = false;
        const presentationFrames = new Set<number>();
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) longTasks.push(entry.duration);
        });
        observer.observe({ type: "longtask", buffered: false });
        const cleanup = () => {
          clearTimeout(timer);
          cancelAnimationFrame(frame);
          for (const pending of presentationFrames) cancelAnimationFrame(pending);
          observer.disconnect();
          window.removeEventListener("wheel", input, true);
          window.removeEventListener("pointermove", input, true);
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error("Native pan did not finish."));
        }, 10000);
        const finish = () => {
          cleanup();
          resolve({
            frames,
            gaps,
            longTasks,
            inputs: count,
            before,
            after: capture(),
            marks: {
              rulers: document.querySelectorAll(".canvas-ruler g g").length,
              guides: document.querySelectorAll("[data-guide-id]").length,
              selections: document.querySelectorAll(".canvas-selection").length,
            },
          });
        };
        function sample(time: number) {
          if (previousFrame) gaps.push(time - previousFrame);
          previousFrame = time;
          if (latest !== lastFrameInput) {
            lastFrameInput = latest;
            const rect = board.getBoundingClientRect();
            const x = Number(board.dataset.panX),
              y = Number(board.dataset.panY);
            const entry = {
              at: time,
              x,
              y,
              inputToRafMs: performance.now() - latest,
              dispatchDelayMs: deliveredAt - latest,
              handlerToRafMs: performance.now() - deliveredAt,
              poseError: Math.max(
                Math.abs(rect.x - initial.x - x + initialPose.x),
                Math.abs(rect.y - initial.y - y + initialPose.y),
              ),
            };
            frames.push(entry);
            const inputAt = latest;
            const handle = requestAnimationFrame(() => {
              presentationFrames.delete(handle);
              Object.assign(entry, { inputToPresentedMs: performance.now() - inputAt });
            });
            presentationFrames.add(handle);
          }
          if (
            document.documentElement.dataset.panPresentationDone === token &&
            time - deliveredAt > 55 &&
            !finishing
          ) {
            finishing = true;
            frame = requestAnimationFrame(finish);
          } else frame = requestAnimationFrame(sample);
        }
        function input(event: Event) {
          if (
            (mode === "wheel" && event instanceof WheelEvent && !event.ctrlKey && !event.metaKey) ||
            (mode === "hand" && event instanceof PointerEvent && event.buttons === 1)
          ) {
            latest = event.timeStamp;
            deliveredAt = performance.now();
            count++;
            if (!frame) frame = requestAnimationFrame(sample);
          }
        }
        window.addEventListener("wheel", input, true);
        window.addEventListener("pointermove", input, true);
        document.documentElement.dataset.panPresentationProbe = token;
      }),
    { token, mode },
  );
  await page.waitForFunction(
    (token) => document.documentElement.dataset.panPresentationProbe === token,
    token,
  );
  const session = await page.context().newCDPSession(page);
  const tasks: Promise<unknown>[] = [];
  const start = performance.now();
  for (let index = 0; index < 60; index++) {
    const wait = start + index * (1000 / 120) - performance.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    const offset = index < 30 ? index + 1 : 59 - index;
    tasks.push(
      session.send(
        "Input.dispatchMouseEvent",
        mode === "wheel"
          ? {
              type: "mouseWheel",
              ...point,
              deltaX: index < 30 ? 4 : -4,
              deltaY: index < 30 ? 3 : -3,
            }
          : { type: "mouseMoved", x: point.x + offset * 4, y: point.y + offset * 3, buttons: 1 },
      ),
    );
  }
  await Promise.all(tasks);
  await page.evaluate((token) => {
    document.documentElement.dataset.panPresentationDone = token;
  }, token);
  const result = await measured;
  await session.detach();
  if (mode === "hand") {
    await page.mouse.up();
    await page.keyboard.up("Space");
  }
  await page.waitForTimeout(160);
  return result;
}
