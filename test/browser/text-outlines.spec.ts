import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import opentype from "opentype.js";
import { createLayer, createPage, createProject } from "@musart/core";
import type { OutlineFont } from "../../packages/render/src/surface/text/fonts";
import { installReadbackProbe } from "./support/readback-probe";

for (const forceWebGL of [false, true]) {
  test(`large straight and diagonal glyphs match original outlines (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await installReadbackProbe(page);
    await page.goto("/?automation=1");
    await page.waitForFunction(() => !!window.musart);
    const inspector = await page.context().newPage();
    const results: {
      family: string;
      character: string;
      interiorMisses: number;
      exteriorLeaks: number;
    }[] = [];
    try {
      for (const [family, id] of [
        ["Bebas Neue", "bebas-neue"],
        ["Roboto Mono", "roboto-mono"],
        ["Inter", "inter"],
      ]) {
        const bytes = await readFile(`apps/web/public/fonts/${id}/font.ttf`),
          font = opentype.parse(new Uint8Array(bytes).buffer);
        const size = 340,
          scale = size / font.unitsPerEm,
          baseline = 16 + font.ascender * scale;
        for (const character of ["A", "/", "V"]) {
          const base = font.charToGlyph(character);
          const glyph =
            (font as OutlineFont).variation?.getTransform(base, { wght: 400, opsz: 14 }) ?? base;
          const commands = glyph.getPath(12, baseline, size, {
            xScale: scale,
            yScale: scale,
          }).commands;
          await page.evaluate(
            (project) => window.musart!.load(project),
            createProject({
              pages: [
                createPage({
                  width: 420,
                  height: 440,
                  background: "transparent",
                  layers: [
                    createLayer("text", {
                      text: character,
                      fontFamily: family!,
                      fontSize: size,
                      fontWeight: 400,
                      width: 420,
                      height: 440,
                      x: 12,
                      y: 16,
                      fill: "#ffffff",
                      letterSpacing: 0,
                    }),
                  ],
                }),
              ],
            }),
          );
          const url = await page.evaluate(
            (forceWebGL) => window.musart!.render({ forceWebGL }),
            forceWebGL,
          );
          const difference = await inspector.evaluate(
            async ({ url, commands }) => {
              const image = new Image();
              image.src = url;
              await image.decode();
              const actual = document.createElement("canvas");
              actual.width = image.width;
              actual.height = image.height;
              const ac = actual.getContext("2d")!;
              ac.drawImage(image, 0, 0);
              const pixels = ac.getImageData(0, 0, image.width, image.height).data;
              const reference = document.createElement("canvas");
              reference.width = image.width;
              reference.height = image.height;
              const rc = reference.getContext("2d")!;
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
              const expected = rc.getImageData(0, 0, image.width, image.height).data;
              let interior = 0,
                interiorMisses = 0,
                exteriorLeaks = 0;
              for (let y = 2; y < image.height - 2; y++)
                for (let x = 2; x < image.width - 2; x++) {
                  let inside = true,
                    outside = true;
                  for (let dy = -1; dy <= 1; dy++)
                    for (let dx = -1; dx <= 1; dx++) {
                      const alpha = expected[((y + dy) * image.width + x + dx) * 4 + 3]!;
                      if (alpha < 250) inside = false;
                      if (alpha > 0) outside = false;
                    }
                  const alpha = pixels[(y * image.width + x) * 4 + 3]!;
                  if (inside) {
                    interior++;
                    if (alpha < 250) interiorMisses++;
                  }
                  if (outside && alpha > 5) exteriorLeaks++;
                }
              return { interior, interiorMisses, exteriorLeaks };
            },
            { url, commands },
          );
          expect(difference.interior).toBeGreaterThan(1000);
          expect(difference.interiorMisses, `${family} ${character} interior`).toBe(0);
          expect(difference.exteriorLeaks, `${family} ${character} exterior`).toBe(0);
          results.push({
            family: family!,
            character,
            interiorMisses: difference.interiorMisses,
            exteriorLeaks: difference.exteriorLeaks,
          });
        }
      }
      const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
      expect({ gpu: reads.gpu, webgl: reads.webgl, canvas: reads.canvas }).toEqual({
        gpu: 0,
        webgl: 0,
        canvas: 0,
      });
      await test.info().attach("outline-reference", {
        body: JSON.stringify({ forceWebGL, results, reads }, null, 2),
        contentType: "application/json",
      });
    } finally {
      await inspector.close();
    }
  });
}
