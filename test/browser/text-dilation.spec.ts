import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import opentype from "opentype.js";
import { createLayer, createPage, createProject } from "@musart/core";
import type { OutlineFont } from "../../packages/render/src/surface/text/fonts";
import { installReadbackProbe } from "./support/readback-probe";

for (const forceWebGL of [false, true]) {
  test(`thin glyphs retain fractional coverage at low density and both pixel phases (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await installReadbackProbe(page);
    await page.addInitScript(() => {
      const counts = { webgpu: 0, webgl2: 0, glRenderer: "" };
      (window as unknown as { slugBackends: typeof counts }).slugBackends = counts;
      const get = HTMLCanvasElement.prototype.getContext;
      Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
        configurable: true,
        value: function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
          const context = Reflect.apply(get, this, [kind, ...args]);
          if (context && kind === "webgpu") counts.webgpu++;
          if (context && kind === "webgl2") {
            counts.webgl2++;
            const gl = context as WebGL2RenderingContext,
              debug = gl.getExtension("WEBGL_debug_renderer_info");
            if (debug) counts.glRenderer = String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
          }
          return context;
        },
      });
    });
    await page.goto("/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    await page.waitForFunction(
      () =>
        document.querySelector<HTMLCanvasElement>(".canvas-artboard canvas")?.dataset
          .rendererReady === "true",
    );
    const beforeContexts = await page.evaluate(
      () =>
        (window as unknown as { slugBackends: { webgpu: number; webgl2: number } }).slugBackends,
    );
    const bytes = await readFile("apps/web/public/fonts/inter/font.ttf");
    const font = opentype.parse(new Uint8Array(bytes).buffer) as OutlineFont;
    const glyphFor = (text: string) => {
      const base = font.charToGlyph(text);
      return font.variation?.getTransform(base, { wght: 100, opsz: 14 }) ?? base;
    };
    const thin = glyphFor("|")
      .getPath(0, 0, 1, { xScale: 1 / font.unitsPerEm, yScale: 1 / font.unitsPerEm })
      .getBoundingBox();
    expect(glyphFor("|").index).toBeGreaterThan(0);
    // Keep enough stem length for independent alpha-mass comparison, while its width
    // remains smaller than the old quad's missing subpixel support at scale0.1.
    const barSize = 0.15 / ((thin.x2 - thin.x1) * 0.1);
    expect((thin.x2 - thin.x1) * barSize * 0.1).toBeLessThan(0.2);
    const underline = glyphFor("_")
      .getPath(0, 0, 1, { xScale: 1 / font.unitsPerEm, yScale: 1 / font.unitsPerEm })
      .getBoundingBox();
    const underlineSize =
      4 / (0.1 * (font.ascender / font.unitsPerEm + (underline.y1 + underline.y2) / 2));
    const cases = [
      ...[0.1, 0.25, 1].flatMap((scale) =>
        [200, 210].map((width) => ({ text: "|", fontSize: barSize, width, scale })),
      ),
      // Narrow frames round to a different X/Y density; this horizontal edge needs the Y half-pixel support.
      { text: "_", fontSize: underlineSize, width: 14, scale: 0.1 },
    ];
    const inspector = await page.context().newPage();
    const results: {
      text: string;
      width: number;
      scale: number;
      actual: number;
      expected: number;
      nonzero: number;
    }[] = [];
    try {
      for (const { text, fontSize, width, scale } of cases) {
        const glyph = glyphFor(text),
          unit = fontSize / font.unitsPerEm,
          baseline = font.ascender * unit;
        const advance = (glyph.advanceWidth ?? 0) * unit;
        const path = glyph.getPath((width - advance) / 2, baseline, fontSize, {
          xScale: unit,
          yScale: unit,
        });
        await page.evaluate(
          (project) => window.musart!.load(project),
          createProject({
            pages: [
              createPage({
                width,
                height: 100,
                background: "transparent",
                layers: [
                  createLayer("text", {
                    text,
                    x: 0,
                    y: 0,
                    fontFamily: "Inter",
                    fontWeight: 100,
                    fontSize,
                    textAlign: "center",
                    width,
                    height: 100,
                    fill: "#ffffff",
                    letterSpacing: 0,
                  }),
                ],
              }),
            ],
          }),
        );
        const url = await page.evaluate((options) => window.musart!.render(options), {
          forceWebGL,
          scale,
        });
        await test
          .info()
          .attach(`thin-glyph-${text === "|" ? "bar" : "underscore"}-${width}-${scale}`, {
            body: Buffer.from(url.split(",")[1]!, "base64"),
            contentType: "image/png",
          });
        const pixels = await inspector.evaluate(
          async ({ url, commands, width, scale, interiorY }) => {
            const image = new Image();
            image.src = url;
            await image.decode();
            const actual = document.createElement("canvas"),
              reference = document.createElement("canvas");
            actual.width = reference.width = image.width;
            actual.height = reference.height = image.height;
            const ac = actual.getContext("2d")!,
              rc = reference.getContext("2d")!;
            ac.drawImage(image, 0, 0);
            rc.scale(image.width / width, image.height / 100);
            rc.fillStyle = "#ffffff";
            rc.beginPath();
            for (const command of commands) {
              if (command.type === "M") rc.moveTo(command.x, command.y);
              else if (command.type === "L") rc.lineTo(command.x, command.y);
              else if (command.type === "Q")
                rc.quadraticCurveTo(command.x1, command.y1, command.x, command.y);
              else if (command.type === "C")
                rc.bezierCurveTo(
                  command.x1,
                  command.y1,
                  command.x2,
                  command.y2,
                  command.x,
                  command.y,
                );
              else rc.closePath();
            }
            rc.fill("nonzero");
            const a = ac.getImageData(0, 0, image.width, image.height).data,
              b = rc.getImageData(0, 0, image.width, image.height).data;
            let alpha = 0,
              expected = 0,
              nonzero = 0;
            for (let offset = 3; offset < a.length; offset += 4) {
              const y = Math.floor(offset / 4 / image.width) + 0.5;
              // Compare the straight stem interior, not the distinct corner-filter approximations
              // of Canvas2D and analytical two-ray coverage.
              if (
                interiorY &&
                (y < (interiorY[0]! * image.height) / 100 + 1 ||
                  y > (interiorY[1]! * image.height) / 100 - 1)
              )
                continue;
              alpha += a[offset]!;
              expected += b[offset]!;
              if (a[offset]) nonzero++;
            }
            return {
              alpha,
              expected,
              nonzero,
              width: image.width,
              height: image.height,
              requestedScale: scale,
            };
          },
          {
            url,
            commands: path.commands,
            width,
            scale,
            interiorY: text === "|" ? [path.getBoundingBox().y1, path.getBoundingBox().y2] : null,
          },
        );
        await test
          .info()
          .attach(`metrics-${text === "|" ? "bar" : "underscore"}-${width}-${scale}`, {
            body: JSON.stringify(
              { text, fontSize, sourceWidth: width, scale, sourcePosition: [0, 0], ...pixels },
              null,
              2,
            ),
            contentType: "application/json",
          });
        expect([pixels.width, pixels.height]).toEqual([
          Math.ceil(width * scale),
          Math.ceil(100 * scale),
        ]);
        expect(pixels.expected).toBeGreaterThan(5);
        expect(pixels.nonzero).toBeGreaterThan(0);
        expect(pixels.alpha, `${width}px frame at ${scale} actual/reference alpha`).toBeGreaterThan(
          pixels.expected * 0.45,
        );
        expect(pixels.alpha).toBeLessThan(pixels.expected * 1.8 + 8);
        results.push({
          text,
          width,
          scale,
          actual: pixels.alpha,
          expected: pixels.expected,
          nonzero: pixels.nonzero,
        });
      }
      const phases = results.filter((result) => result.text === "|" && result.scale === 0.1);
      expect(phases[0]!.actual / phases[1]!.actual).toBeGreaterThan(0.5);
      expect(phases[0]!.actual / phases[1]!.actual).toBeLessThan(1.5);
      const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
      expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
        gpu: 0,
        webgl: 0,
        canvas: 0,
      });
      const contexts = await page.evaluate(
        () =>
          (
            window as unknown as {
              slugBackends: { webgpu: number; webgl2: number; glRenderer: string };
            }
          ).slugBackends,
      );
      expect(contexts[forceWebGL ? "webgl2" : "webgpu"]).toBeGreaterThan(
        beforeContexts[forceWebGL ? "webgl2" : "webgpu"],
      );
      await test.info().attach("fractional-glyph-coverage", {
        body: JSON.stringify({ forceWebGL, results, reads, beforeContexts, contexts }, null, 2),
        contentType: "application/json",
      });
    } finally {
      await inspector.close();
    }
  });
}
