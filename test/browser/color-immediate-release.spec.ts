import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { mkdir, writeFile } from "node:fs/promises";

interface NativeColorEvent {
  type: string;
  x: number;
  y: number;
  pageX: number;
  pageY: number;
  buttons: number;
  stamp: number;
  now: number;
  value: string;
}
declare global {
  interface Window {
    __musartImmediateColor?: NativeColorEvent[];
  }
}
test("immediate native color release preserves the last sample, next gesture and keyboard undo", async ({
  page,
}) => {
  await mkdir("artifacts/color-immediate", { recursive: true });
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate(
    (project) => {
      window.musart!.load(project);
      window.musart!.select(["color-immediate"]);
    },
    createProject({
      id: "color-immediate-project",
      pages: [
        createPage({
          width: 400,
          height: 300,
          layers: [
            createLayer("rectangle", {
              id: "color-immediate",
              x: 20,
              y: 20,
              width: 200,
              height: 160,
              fill: "#ff000080",
            }),
            createLayer("rectangle", {
              id: "other",
              x: 260,
              y: 20,
              width: 50,
              height: 50,
              fill: "#ffffff",
            }),
          ],
        }),
      ],
    }),
  );
  await expect(page.locator('.canvas-artboard canvas[data-renderer-ready="true"]')).toBeVisible();
  const native = await page.context().newCDPSession(page);
  const evidence: unknown[] = [];
  const bytes = (h: number, s: number, v: number, a: number) => {
    const hue = (((h % 360) + 360) % 360) / 60,
      c = ((v / 100) * s) / 100,
      x = c * (1 - Math.abs((hue % 2) - 1)),
      m = v / 100 - c;
    const rgb = [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ][Math.floor(hue)]!;
    return (
      "#" +
      [...rgb.map((n) => Math.round((n + m) * 255)), Math.round(a * 255)]
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("")
    );
  };
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  try {
    for (const channel of ["sv", "hue", "alpha"] as const) {
      const selector =
        channel === "sv" ? ".color-sv-pad .react-colorful__interactive" : `.color-${channel}`;
      const surface = page.locator(selector).first();
      await surface.scrollIntoViewIfNeeded();
      const box = (await surface.boundingBox())!;
      const baseline = await page.evaluate(() => ({
        revision: window.musart!.snapshot().revision,
        fill: window.musart!.snapshot().project.pages[0]!.layers[0]!.fill,
      }));
      await page.evaluate(() => {
        const record: NativeColorEvent[] = [];
        window.__musartImmediateColor = record;
        const listen = (e: MouseEvent) =>
          record.push({
            type: e.type,
            x: e.clientX,
            y: e.clientY,
            pageX: e.pageX,
            pageY: e.pageY,
            buttons: e.buttons,
            stamp: e.timeStamp,
            now: performance.now(),
            value: (document.querySelector(".color-value input") as HTMLInputElement)?.value,
          });
        const move = (e: MouseEvent) => {
          if (e.buttons & 1) listen(e);
        };
        const up = (e: MouseEvent) => {
          listen(e);
          window.removeEventListener("mousemove", move, true);
          window.removeEventListener("pointermove", move, true);
          window.removeEventListener("pointerup", up, true);
        };
        window.addEventListener("mousemove", move, true);
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", up, true);
      });
      const x0 = box.x + box.width * 0.45,
        y0 = box.y + box.height * 0.25;
      await page.mouse.move(x0, y0);
      await page.mouse.down();
      const x = box.x + box.width * (channel === "sv" ? 0.83 : 0.5),
        y = box.y + box.height * 0.69;
      // Queue native packets together: no idle/render/state-read barrier between move and release.
      const moving = native.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x,
        y,
        button: "left",
        buttons: 1,
      });
      const releasing = native.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button: "left",
        buttons: 0,
        clickCount: 1,
      });
      await Promise.all([moving, releasing]);
      const trace = await page.evaluate(() => window.__musartImmediateColor!);
      const last = trace
        .filter((e) => e.type === (channel === "sv" ? "mousemove" : "pointermove"))
        .at(-1)!;
      expect(last).toBeTruthy();
      let h = 0,
        s = 100,
        v = 100,
        a = 128 / 255;
      if (channel === "sv") {
        s = Math.round(clamp((last.x - box.x) / box.width) * 100);
        v = Math.round((1 - clamp((last.y - box.y) / box.height)) * 100);
      }
      if (channel === "hue") h = Math.round(clamp((last.y - box.y) / box.height) * 360);
      if (channel === "alpha")
        a = Math.round((1 - clamp((last.y - box.y) / box.height)) * 100) / 100;
      const expected = bytes(h, s, v, a);
      const immediate = await page.evaluate(() => window.musart!.snapshot());
      const row = {
        channel,
        box,
        baseline,
        expected,
        actual: immediate.project.pages[0]!.layers[0]!.fill,
        revision: immediate.revision,
        trace,
      };
      evidence.push(row);
      await writeFile("artifacts/color-immediate/evidence.json", JSON.stringify(evidence, null, 2));
      await expect
        .poll(() =>
          page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.fill),
        )
        .toBe(expected);
      const committed = await page.evaluate(() => window.musart!.snapshot());
      expect(committed.revision).toBe(baseline.revision + 1);
      if (channel === "sv") {
        await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.25);
        await page.mouse.down();
        const x2 = box.x + box.width * 0.5,
          y2 = box.y + box.height * 0.5;
        const move2 = native.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: x2,
          y: y2,
          button: "left",
          buttons: 1,
        });
        const up2 = native.send("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x: x2,
          y: y2,
          button: "left",
          buttons: 0,
          clickCount: 1,
        });
        await Promise.all([move2, up2]);
        await expect
          .poll(() =>
            page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.fill),
          )
          .toBe("#80404080");
        expect((await page.evaluate(() => window.musart!.snapshot())).revision).toBe(
          baseline.revision + 2,
        );
        await page.locator('.color-sv-pad .react-colorful__saturation [role="slider"]').focus();
        await page.keyboard.press("ArrowRight");
        await expect
          .poll(() =>
            page.evaluate(() => window.musart!.snapshot().project.pages[0]!.layers[0]!.fill),
          )
          .toBe("#80393980");
        expect((await page.evaluate(() => window.musart!.snapshot())).revision).toBe(
          baseline.revision + 3,
        );
        await page.evaluate(() => window.musart!.undo());
        expect(
          (await page.evaluate(() => window.musart!.snapshot())).project.pages[0]!.layers[0]!.fill,
        ).toBe("#80404080");
        await page.evaluate(() => window.musart!.undo());
        expect(
          (await page.evaluate(() => window.musart!.snapshot())).project.pages[0]!.layers[0]!.fill,
        ).toBe(expected);
      }
      await page.evaluate(() => window.musart!.select(["other"]));
      await expect(page.getByLabel("Couleur hexadécimale", { exact: true })).toHaveValue("#FFFFFF");
      await page.evaluate(() => window.musart!.select(["color-immediate"]));
      await expect(page.getByLabel("Couleur hexadécimale", { exact: true })).toHaveValue(
        expected.toUpperCase(),
      );
      await page.evaluate(() => window.musart!.undo());
      await expect(page.getByLabel("Couleur hexadécimale", { exact: true })).toHaveValue(
        "#FF000080",
      );
      expect((await page.evaluate(() => window.musart!.snapshot())).canUndo).toBe(false);
      await page.mouse.up();
    }
  } finally {
    await native.detach();
  }
});
