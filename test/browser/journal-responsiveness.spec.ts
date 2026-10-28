import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject, evaluateReplay } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";
import { profileClock } from "./support/selection-profile";
import { installJournalProbe } from "./support/journal-probe";

test("records actual canonical submission and immediate native input while the 10k journal is pending", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await installReadbackProbe(page);
  await installJournalProbe(page);
  let acknowledge!: (value: { at: number; revision: string }) => void;
  const submission = new Promise<{ at: number; revision: string }>((resolve) => {
    acknowledge = resolve;
  });
  await page.exposeBinding("journalCanonical", (_source, value) => acknowledge(value));
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      id: "journal-response-10000",
      pages: [
        createPage({
          id: "journal-page",
          width: 512,
          height: 512,
          layers: Array.from({ length: 10000 }, (_, index) =>
            createLayer("rectangle", {
              id: `tile-${index}`,
              name: `Tile ${index}`,
              x: 6 + (index % 100) * 5,
              y: 6 + Math.floor(index / 100) * 5,
              width: 4,
              height: 4,
              fill: index % 2 ? "#6699cc" : "#cc9966",
            }),
          ),
        }),
      ],
    }),
  );
  await page.getByRole("button", { name: "100 % · Recentrer", exact: true }).click();
  await page.waitForFunction(() => {
    const data = document.querySelector<HTMLCanvasElement>(
      '[data-testid="artboard"] canvas',
    )?.dataset;
    return data?.rendererReady === "true" && data.renderedRevision === data.sceneRevision;
  });
  await page.evaluate(() => window.musart!.flushThumbnails());
  await page.getByTestId("editor-canvas").focus();
  await page.keyboard.press("Control+a");
  await expect(page.locator(".canvas-selection-collective")).toHaveAttribute(
    "data-selection-count",
    "10000",
  );
  const board = (await page.getByTestId("artboard").boundingBox())!,
    zoom = Number(await page.getByTestId("artboard").getAttribute("data-zoom")),
    start = { x: board.x + 203 * zoom, y: board.y + 203 * zoom };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12 * zoom, start.y + 9 * zoom);
  await page.waitForFunction(
    () =>
      Number.parseFloat(
        document.querySelector<HTMLElement>(".canvas-selection-collective")!.style.left,
      ) > 7,
  );
  const session = await page.context().newCDPSession(page),
    clock = await profileClock(session, page);
  await session.send("Profiler.enable");
  await session.send("Profiler.setSamplingInterval", { interval: 1000 });
  await session.send("Profiler.start");
  await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas')!,
      baseline = canvas.dataset.canonicalRevision;
    const probe = {
      release: 0,
      submitted: 0,
      submissionRevision: "",
      wheels: [] as { event: number; dispatch: number; raf?: number }[],
      clicks: [] as { event: number; dispatch: number; raf?: number }[],
      frames: [] as number[],
      longTasks: [] as { start: number; duration: number }[],
      frame: 0,
    };
    const observer = new PerformanceObserver((entries) => {
      for (const entry of entries.getEntries())
        probe.longTasks.push({ start: entry.startTime, duration: entry.duration });
    });
    observer.observe({ type: "longtask", buffered: false });
    const mutation = new MutationObserver(() => {
      if (probe.release && canvas.dataset.canonicalRevision !== baseline) {
        probe.submitted = Number(canvas.dataset.canonicalPresentedAt);
        probe.submissionRevision = canvas.dataset.canonicalRevision!;
        mutation.disconnect();
        void (
          window as unknown as { journalCanonical: (value: unknown) => Promise<void> }
        ).journalCanonical({ at: probe.submitted, revision: probe.submissionRevision });
      }
    });
    mutation.observe(canvas, {
      attributes: true,
      attributeFilter: ["data-canonical-presented-at"],
    });
    const up = (event: PointerEvent) => {
      probe.release = event.timeStamp;
    };
    const wheel = (event: WheelEvent) => {
      const sample = {
        event: event.timeStamp,
        dispatch: performance.now(),
        raf: undefined as number | undefined,
      };
      probe.wheels.push(sample);
      requestAnimationFrame(() => {
        sample.raf = performance.now();
      });
    };
    const down = (event: PointerEvent) => {
      if (!probe.release) return;
      const sample = {
        event: event.timeStamp,
        dispatch: performance.now(),
        raf: undefined as number | undefined,
      };
      probe.clicks.push(sample);
      requestAnimationFrame(() => {
        sample.raf = performance.now();
      });
    };
    const frame = (time: number) => {
      probe.frames.push(time);
      probe.frame = requestAnimationFrame(frame);
    };
    probe.frame = requestAnimationFrame(frame);
    window.addEventListener("pointerup", up, { capture: true, once: true });
    window.addEventListener("wheel", wheel, { capture: true, passive: true });
    window.addEventListener("pointerdown", down, true);
    Object.assign(window, {
      journalProbe: probe,
      stopJournalProbe: () => {
        mutation.disconnect();
        observer.disconnect();
        cancelAnimationFrame(probe.frame);
        window.removeEventListener("wheel", wheel, true);
        window.removeEventListener("pointerdown", down, true);
        window.removeEventListener("pointerup", up, true);
      },
    });
  });
  try {
    await page.mouse.up();
    const submitted = await submission;
    const packets: Promise<unknown>[] = [],
      sendStart = performance.now(),
      x = board.x + 205 * zoom,
      y = board.y + 202 * zoom;
    for (let index = 0; index < 30; index++) {
      packets.push(
        session.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x,
          y,
          deltaX: 5,
          deltaY: 5,
        }),
      );
      if (index === 4) {
        packets.push(
          session.send("Input.dispatchMouseEvent", {
            type: "mousePressed",
            x,
            y,
            button: "left",
            clickCount: 1,
            modifiers: 2,
          }),
        );
        packets.push(
          session.send("Input.dispatchMouseEvent", {
            type: "mouseReleased",
            x,
            y,
            button: "left",
            clickCount: 1,
            modifiers: 2,
          }),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 8));
    }
    await Promise.all(packets);
    await page.waitForTimeout(1200);
    const result = await page.evaluate(() => {
      const data = window as unknown as {
        journalProbe: { release: number; submitted: number; frames: number[] };
        stopJournalProbe: () => void;
      };
      data.stopJournalProbe();
      return {
        ...data.journalProbe,
        gpu: JSON.parse(
          document.querySelector<HTMLCanvasElement>('[data-testid="artboard"] canvas')!.dataset
            .gpuStats!,
        ),
        reads: window.__musartVideoReadbacks!,
        journal: window.__journalTransportProbe,
        userAgent: navigator.userAgent,
      };
    });
    const { profile } = await session.send("Profiler.stop");
    const artifacts = process.env.MUSART_JOURNAL_REPORT ?? "artifacts/journal-worker-response";
    await mkdir(artifacts, { recursive: true });
    await writeFile(`${artifacts}/profile.cpuprofile`, JSON.stringify(profile));
    await writeFile(
      `${artifacts}/report.json`,
      JSON.stringify(
        {
          browser: page.context().browser()!.version(),
          clock,
          submission: submitted,
          sendStart,
          ...result,
          errors,
        },
        null,
        2,
      ),
    );
    await page.getByTestId("editor-canvas").screenshot({ path: `${artifacts}/after-input.png` });
    expect(result.submitted).toBeGreaterThan(result.release);
    expect(errors).toEqual([]);
    expect(result.journal).toMatchObject({
      created: 1,
      live: 1,
      peak: 1,
      headerOnly: true,
      errors: [],
    });
    expect(result.journal.headerMax).toBeLessThan(4096);
    expect(result.journal.postMax).toBeLessThan(5);
    expect({
      gpu: result.reads.gpu,
      webgl: result.reads.webgl,
      canvas: result.reads.canvas,
    }).toEqual({ gpu: 0, webgl: 0, canvas: 0 });
    // Measure first, then force durability. This must not move journal work into the input window.
    await page.evaluate(() => window.musart!.flush());
    const replay = await page.evaluate(() => window.musart!.historyReplay());
    const final = evaluateReplay(replay, replay.duration).pages.find(
      (item) => item.id === "journal-page",
    )!;
    expect(final.layers).toHaveLength(10000);
    expect(final.layers[0]).toMatchObject({ x: 18, y: 15 });
  } finally {
    await session.detach();
  }
});
