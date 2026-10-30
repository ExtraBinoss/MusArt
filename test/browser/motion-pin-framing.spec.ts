import { expect, test, type Page } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

interface Sample {
  time: number;
  pinned: boolean;
  board: { x: number; y: number; width: number; height: number };
  selection: { x: number; y: number; width: number; height: number };
  zoom: number;
  renders: number[];
}
declare global {
  interface Window {
    __musartPinFraming?: { count(pinned?: boolean): number; stop(): Sample[] };
  }
}

async function probe(page: Page) {
  await page.evaluate(() => {
    const board = document.querySelector<HTMLElement>(".canvas-artboard-editor")!;
    const selection = document.querySelector<HTMLElement>(
      '.canvas-selection[data-layer-id="pin-card"]',
    )!;
    const dock = document.querySelector<HTMLElement>(".motion-timeline-dock")!;
    const roots = [
      ".musart-app",
      ".inspector",
      ".canvas-area",
      ".editor-canvas",
      ".editor-gpu-scene",
    ].map((selector) => document.querySelector<HTMLElement>(selector)!);
    const samples: Sample[] = [];
    let frame = 0,
      pinnedFrames = 0,
      unpinnedFrames = 0,
      seenPinned = false;
    const bounds = (node: HTMLElement) => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return { x, y, width, height };
    };
    const read = (time: number) => {
      const pinned = dock.dataset.motionPinned === "true";
      if (pinned) {
        pinnedFrames++;
        seenPinned = true;
      } else if (seenPinned) unpinnedFrames++;
      samples.push({
        time,
        pinned,
        board: bounds(board),
        selection: bounds(selection),
        zoom: Number(board.dataset.zoom),
        renders: roots.map((root) => Number(root.dataset.reactRenders)),
      });
      frame = requestAnimationFrame(read);
    };
    read(performance.now());
    window.__musartPinFraming = {
      count: (pinned) =>
        pinned === undefined ? samples.length : pinned ? pinnedFrames : unpinnedFrames,
      stop: () => {
        cancelAnimationFrame(frame);
        delete window.__musartPinFraming;
        return samples;
      },
    };
  });
}

function quietRoots(samples: Sample[], canvasCommits: number) {
  const first = samples[0]!,
    last = samples.at(-1)!;
  for (const index of [0, 1, 2]) expect(last.renders[index]).toBe(first.renders[index]);
  for (const index of [3, 4])
    expect(last.renders[index]! - first.renders[index]!).toBeLessThanOrEqual(canvasCommits);
}

async function ready(page: Page) {
  await installReadbackProbe(page);
  await page.addInitScript(() => localStorage.setItem("musart.theme", "dark"));
  await page.goto("/?automation=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.musart));
  const layer = createLayer("rectangle", {
    id: "pin-card",
    name: "Pin framing card",
    x: 80,
    y: 60,
    width: 180,
    height: 120,
    fill: "#8B5CF6",
  });
  const project = createProject({
    pages: [
      createPage({
        width: 960,
        height: 640,
        layers: [layer],
        motion: {
          version: 1,
          initialized: true,
          mode: "motion",
          duration: { value: 5, rate: 1 },
          frameRate: { numerator: 30, denominator: 1 },
          tracks: [
            {
              id: "pin-card-track",
              layerId: layer.id,
              start: { value: 0, rate: 1 },
              end: null,
              properties: [],
            },
          ],
        },
      }),
    ],
  });
  const revision = await page.evaluate((project) => {
    window.musart!.load(project);
    window.musart!.select(["pin-card"]);
    return window.musart!.snapshot().revision;
  }, project);
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole("button", { name: "Épingler la timeline", exact: true }).hover();
  await page.waitForFunction(() => {
    const dock = document.querySelector<HTMLElement>(".motion-timeline-dock")!;
    return dock.dataset.motionExpanded === "true" && !dock.hasAttribute("data-motion-animating");
  });
  return revision;
}

async function finalState(page: Page) {
  return page.evaluate(() => ({
    selection: window.musart!.snapshot().selection,
    revision: window.musart!.snapshot().revision,
    readbacks: window.__musartVideoReadbacks,
    workspaceTransform: getComputedStyle(document.querySelector(".workspace-panels")!).transform,
  }));
}

async function saveFrames(
  page: Page,
  name: string,
  frames: Sample[],
  readyMs: number,
  completed: boolean,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const state = await Promise.race([
    page
      .evaluate(() => ({
        partialFrames: window.__musartPinFraming?.stop(),
        dock: document
          .querySelector(".motion-timeline-dock")
          ?.getAttributeNames()
          .reduce<Record<string, string | null>>((values, name) => {
            if (name.startsWith("data-motion-"))
              values[name] = document.querySelector(".motion-timeline-dock")!.getAttribute(name);
            return values;
          }, {}),
        readbacks: window.__musartVideoReadbacks,
      }))
      .catch((error: unknown) => ({ captureError: String(error) })),
    new Promise<{ captureError: string }>((resolve) => {
      timer = setTimeout(
        () =>
          resolve({ captureError: "Partial-frame capture exceeded 1500 ms after the test ended." }),
        1500,
      );
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
  await mkdir("artifacts/motion/ui", { recursive: true });
  await writeFile(
    `artifacts/motion/ui/pin-framing-${name}-frames.json`,
    JSON.stringify({ completed, readyMs, frames, ...state }, null, 2),
  );
}

function assertReadbacks(state: Awaited<ReturnType<typeof finalState>>, revision: number) {
  expect(state.revision).toBe(revision);
  expect(state.workspaceTransform).toBe("none");
  expect(state.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
}

test("pin and unpin preserve artwork and selection pixels on every frame", async ({ page }) => {
  const started = Date.now();
  let frames: Sample[] = [],
    readyMs = 0,
    completed = false;
  try {
    const revision = await ready(page);
    readyMs = Date.now() - started;
    await probe(page);
    await page.getByRole("button", { name: "Épingler la timeline", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>(".motion-timeline-dock")?.dataset.motionPinned ===
          "true" && window.__musartPinFraming!.count(true) >= 6,
    );
    await page.getByRole("button", { name: "Désépingler la timeline", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLElement>(".motion-timeline-dock")?.dataset.motionPinned ===
          "false" && window.__musartPinFraming!.count(false) >= 6,
    );
    frames = await page.evaluate(() => window.__musartPinFraming!.stop());
    expect(frames.some((sample) => sample.pinned)).toBe(true);
    const initial = frames[0]!,
      differences: string[] = [];
    for (const [index, sample] of frames.entries()) {
      for (const key of ["x", "y", "width", "height"] as const) {
        if (Math.abs(sample.board[key] - initial.board[key]) >= 0.75)
          differences.push(`frame ${index}: board ${key}`);
        if (Math.abs(sample.selection[key] - initial.selection[key]) >= 0.75)
          differences.push(`frame ${index}: selection ${key}`);
      }
      if (sample.zoom !== initial.zoom) differences.push(`frame ${index}: zoom`);
    }
    expect(differences).toEqual([]);
    quietRoots(frames, 2);
    assertReadbacks(await finalState(page), revision);
    completed = true;
    await mkdir("artifacts/motion/ui", { recursive: true });
    await page.screenshot({ path: "artifacts/motion/ui/pin-framing-stable.png" });
  } finally {
    await saveFrames(page, "stable", frames, readyMs, completed);
  }
});

test("a large pinned panel corrects pan limits smoothly without stretching artwork", async ({
  page,
}) => {
  const started = Date.now();
  let frames: Sample[] = [],
    readyMs = 0,
    completed = false;
  try {
    const revision = await ready(page);
    readyMs = Date.now() - started;
    const handle = (await page.locator(".motion-resize").boundingBox())!;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 - 300, {
      steps: 4,
    });
    await page.mouse.up();
    await page.waitForFunction(
      () => Number(document.querySelector(".motion-resize")?.getAttribute("aria-valuenow")) > 550,
    );
    await probe(page);
    await page.getByRole("button", { name: "Épingler la timeline", exact: true }).click();
    await page.waitForFunction(() => {
      const dock = document.querySelector<HTMLElement>(".motion-timeline-dock")!;
      return (
        dock.dataset.motionPinned === "true" &&
        !dock.hasAttribute("data-motion-animating") &&
        window.__musartPinFraming!.count(true) >= 6
      );
    });
    frames = await page.evaluate(() => window.__musartPinFraming!.stop());
    const from = frames[0]!,
      to = frames.at(-1)!;
    expect(from.board.y - to.board.y).toBeGreaterThan(10);
    expect(
      new Set(
        frames.filter((sample) => sample.pinned).map((sample) => Math.round(sample.board.y * 10)),
      ).size,
    ).toBeGreaterThan(3);
    const differences: string[] = [];
    for (const [index, sample] of frames.entries()) {
      if (sample.zoom !== from.zoom) differences.push(`frame ${index}: zoom`);
      for (const owner of ["board", "selection"] as const)
        for (const key of ["width", "height"] as const)
          if (Math.abs(sample[owner][key] - from[owner][key]) >= 0.0005)
            differences.push(`frame ${index}: ${owner} ${key}`);
      if (index && sample.board.y > frames[index - 1]!.board.y + 0.5)
        differences.push(`frame ${index}: reversed correction`);
    }
    expect(differences).toEqual([]);
    quietRoots(frames, 1);
    const card = (await page.locator('.canvas-selection[data-layer-id="pin-card"]').boundingBox())!;
    await page.mouse.click(card.x + card.width / 2, card.y + card.height / 2);
    const state = await finalState(page);
    expect(state.selection).toEqual(["pin-card"]);
    assertReadbacks(state, revision);
    completed = true;
    await mkdir("artifacts/motion/ui", { recursive: true });
    await page.screenshot({ path: "artifacts/motion/ui/pin-framing-edge.png" });
  } finally {
    await saveFrames(page, "edge", frames, readyMs, completed);
  }
});
