import { expect as baseExpect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import {
  output,
  surface,
  prepare,
  reorderFixture,
  point,
  frames,
  counters,
  paints,
} from "./motion-canvas";

const expect = baseExpect.configure({ timeout: 3500 });

/** Park real WAAPI springs while the native pointer remains held; no synthetic drag events. */
export async function verifyCanvasSpringPose(page: Page) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await prepare(page, reorderFixture());
  await expect(page.locator(".motion-timeline-dock")).not.toHaveAttribute("data-motion-animating");
  await page.getByRole("spinbutton", { name: "Temps actuel", exact: true }).fill("2000");
  await page.keyboard.press("Enter");
  await frames(page);
  const original = await page.evaluate(() => window.musart!.snapshot());
  const armed = await page.evaluateHandle(() => {
    const root = document.querySelector<HTMLElement>(".motion-canvas-root")!;
    const viewport = root.closest(".motion-timeline-scroll")!;
    const parked: {
      animation: Animation;
      key: string;
      duration: number;
      beforeTime: number | null;
    }[] = [];
    let events = 0,
      closed = false,
      resumed = 0;
    const freeze = () => {
      events++;
      if (closed || parked.length) return;
      const found = [
        ...viewport.querySelectorAll<HTMLElement>('[data-labels-only="true"][data-motion-row-key]'),
      ].flatMap((node) =>
        node
          .getAnimations()
          .filter(
            (animation) =>
              (animation.playState === "running" || animation.pending) &&
              animation.effect instanceof KeyframeEffect &&
              animation.effect.target === node &&
              animation.effect.getKeyframes().some((frame) => frame.transform !== undefined),
          )
          .map((animation) => ({ animation, node })),
      );
      for (const { animation, node } of found) {
        parked.push({
          animation,
          key: node.dataset.motionRowKey!,
          duration: Number(animation.effect!.getComputedTiming().endTime),
          beforeTime: typeof animation.currentTime === "number" ? animation.currentTime : null,
        });
        animation.pause();
        // At 40 ms the target is still under the pointer's original "before" half.
        animation.currentTime = 40;
      }
    };
    root.addEventListener("timeline-row-positions", freeze);
    return {
      read: () => ({
        events,
        resumed,
        animations: parked.map(({ animation, ...entry }) => ({
          ...entry,
          currentTime: typeof animation.currentTime === "number" ? animation.currentTime : null,
          state: animation.playState,
          pending: animation.pending,
        })),
      }),
      release() {
        if (closed) return resumed;
        closed = true;
        root.removeEventListener("timeline-row-positions", freeze);
        for (const { animation } of parked) {
          const target =
            animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
          if (
            animation.playState === "paused" &&
            target?.isConnected &&
            target.getAnimations().includes(animation)
          ) {
            animation.play();
            resumed++;
          }
        }
        return resumed;
      },
    };
  });
  let held = false;
  try {
    const label = (id: string) =>
      `.motion-row[data-labels-only=true]:not(.is-property)[data-layer-id="${id}"]`;
    const source = await point(page, label("peer"), 3),
      target = await point(page, label("card"), 3, -1);
    await page.mouse.move(source.x, source.y);
    await page.mouse.down();
    held = true;
    await expect(page.locator(".inspector")).toHaveAttribute("data-selected-layer-id", "peer");
    await frames(page);
    const quiet = await counters(page);
    await page.mouse.move(target.x, target.y, { steps: 6 });
    await expect
      .poll(async () => (await armed.evaluate((state) => state.read())).animations.length)
      .toBeGreaterThan(0);
    await frames(page);
    const animations = await armed.evaluate((state) => state.read());
    expect(animations.events).toBeGreaterThan(0);
    expect(
      animations.animations.every(
        (animation) =>
          animation.duration > 40 &&
          animation.currentTime === 40 &&
          animation.state === "paused" &&
          !animation.pending,
      ),
    ).toBe(true);
    const geometry = await page.evaluate(({ x, y }) => {
      const root = document.querySelector<HTMLElement>(".motion-canvas-root")!,
        bounds = root.getBoundingClientRect();
      const canvas = root.querySelector<HTMLCanvasElement>('canvas[data-timeline-canvas="true"]')!;
      const painted = new Map(
        JSON.parse(canvas.dataset.timelineRowPositions || "[]") as [string, number][],
      );
      const rows = [
        ...root
          .closest(".motion-timeline-scroll")!
          .querySelectorAll<HTMLElement>('[data-labels-only="true"][data-motion-row-key]'),
      ].map((node) => {
        const box = node.getBoundingClientRect(),
          key = node.dataset.motionRowKey!;
        return {
          key,
          htmlY: box.top - bounds.top,
          height: box.height,
          finalY: parseFloat(node.style.top),
          paintedY: painted.get(key) ?? null,
          transform: getComputedStyle(node).transform,
        };
      });
      const proxy = root.querySelector<HTMLElement>("[data-timeline-drop-target]:not([hidden])");
      const box = proxy?.getBoundingClientRect();
      return {
        rows,
        painted: [...painted],
        paint: canvas.dataset.timelinePaints,
        proxy:
          proxy && box
            ? {
                key: proxy.dataset.motionRowKey,
                id: proxy.dataset.layerDropId,
                kind: proxy.dataset.layerDropKind,
                y: box.top - bounds.top,
                height: box.height,
                containsPointer: x >= box.left && x < box.right && y >= box.top && y < box.bottom,
                nativeHit:
                  document.elementFromPoint(x, y)?.closest("[data-timeline-drop-target]") === proxy,
              }
            : null,
      };
    }, target);
    expect(geometry.rows.map((row) => row.key).sort()).toEqual(["card", "card-x", "peer"]);
    for (const row of geometry.rows) {
      expect(row.paintedY).not.toBeNull();
      expect(Math.abs(row.paintedY! - row.htmlY)).toBeLessThan(0.25);
    }
    expect(
      geometry.rows.some(
        (row) =>
          Math.abs(row.htmlY - row.finalY) > 1 &&
          Math.abs(row.htmlY - Math.round(row.htmlY / 24) * 24) > 0.5,
      ),
    ).toBe(true);
    expect(geometry.proxy).toMatchObject({
      id: "card",
      key: "card",
      kind: "layer",
      containsPointer: true,
      nativeHit: true,
    });
    const pointed = geometry.rows.find((row) => row.key === geometry.proxy!.key)!;
    expect(Math.abs(geometry.proxy!.y - pointed.htmlY)).toBeLessThan(0.25);
    expect(geometry.proxy!.height).toBeCloseTo(pointed.height, 3);
    expect(await counters(page)).toEqual(quiet);
    expect(await page.evaluate(() => window.musart!.snapshot().project)).toEqual(original.project);
    const parkedPaint = await paints(page);
    await frames(page);
    expect(await paints(page)).toBe(parkedPaint);
    await page.screenshot({ path: `${output}/spring-pose-held.png` });
    await writeFile(
      `${output}/spring-pose-held.json`,
      JSON.stringify({ animations, geometry, quiet }, null, 2),
    );
    expect(await armed.evaluate((state) => state.release())).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    held = false;
    await expect(page.locator(surface)).toHaveAttribute("data-timeline-row-positions", "");
    await expect(page.locator("[data-timeline-drop-target]:not([hidden])")).toHaveCount(0);
    await expect(page.locator(".layer-drag-preview")).toHaveCount(0);
    const restored = await page.evaluate(() => window.musart!.snapshot());
    expect(restored.project).toEqual(original.project);
    expect(restored.revision).toBe(original.revision);
    expect(restored.canUndo).toBe(original.canUndo);
  } finally {
    await armed.evaluate((state) => state.release()).catch(() => undefined);
    await page.keyboard.press("Escape").catch(() => undefined);
    if (held) await page.mouse.up().catch(() => undefined);
    await armed.dispose();
  }
}
