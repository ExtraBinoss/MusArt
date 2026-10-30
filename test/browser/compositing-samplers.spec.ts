import { expect, test } from "@playwright/test";
import { createLayer, createPage, createProject } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

test("compiled source, backdrop and partial-mask samplers stay independent on both backends", async ({
  page,
}, info) => {
  await installReadbackProbe(page);
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  const inspector = await page.context().newPage();
  const expectedBlend = (backdrop: number[], source: number[]) => {
    const ab = backdrop[3]! / 255,
      as = source[3]! / 255,
      alpha = as + ab * (1 - as);
    return [
      ...source.slice(0, 3).map((value, index) => {
        const cs = value / 255,
          cb = backdrop[index]! / 255;
        return Math.round(
          ((as * ((1 - ab) * cs + ab * cs * cb) + (1 - as) * ab * cb) / alpha) * 255,
        );
      }),
      Math.round(alpha * 255),
    ];
  };
  const cases = [
    {
      name: "opaque multiply",
      layers: [
        createLayer("rectangle", {
          id: "background",
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          radius: 0,
          fill: "#40a080",
        }),
        createLayer("rectangle", {
          id: "source",
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          radius: 0,
          fill: "#ff0080",
          blendMode: "multiply",
        }),
      ],
      expected: [64, 0, 64, 255],
    },
    {
      name: "RGBA multiply",
      layers: [
        createLayer("rectangle", {
          id: "background",
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          radius: 0,
          fill: "#40a08080",
        }),
        createLayer("rectangle", {
          id: "source",
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          radius: 0,
          fill: "#c0206080",
          blendMode: "multiply",
        }),
      ],
      expected: expectedBlend([64, 160, 128, 128], [192, 32, 96, 128]),
    },
    {
      name: "partial alpha mask",
      layers: [
        createLayer("rectangle", {
          id: "source",
          x: 0,
          y: 0,
          width: 64,
          height: 64,
          radius: 0,
          fill: "#8040c080",
          mask: { layerId: "mask", enabled: true, inverted: false, mode: "alpha" },
        }),
        createLayer("rectangle", {
          id: "mask",
          x: 0,
          y: 0,
          width: 32,
          height: 64,
          radius: 0,
          fill: "#ffffff40",
          maskSource: true,
        }),
      ],
      expected: [128, 64, 192, 32],
    },
  ];
  const evidence: unknown[] = [];
  try {
    for (const forceWebGL of [false, true]) {
      for (const entry of cases) {
        await page.evaluate(
          (project) => window.musart!.load(project),
          createProject({
            pages: [
              createPage({
                width: 64,
                height: 64,
                background: "transparent",
                layers: entry.layers,
              }),
            ],
          }),
        );
        const url = await page.evaluate((options) => window.musart!.render(options), {
          forceWebGL,
        });
        const pixels = await inspector.evaluate(async (url) => {
          const image = new Image();
          image.src = url;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d")!;
          context.drawImage(image, 0, 0);
          return {
            left: Array.from(context.getImageData(16, 32, 1, 1).data),
            right: Array.from(context.getImageData(48, 32, 1, 1).data),
          };
        }, url);
        evidence.push({ forceWebGL, name: entry.name, expected: entry.expected, pixels });
        for (let channel = 0; channel < 4; channel++)
          expect(
            Math.abs(pixels.left[channel]! - entry.expected[channel]!),
            `${entry.name} ${forceWebGL ? "WebGL" : "WebGPU"} channel${channel}`,
          ).toBeLessThanOrEqual(entry.name === "partial alpha mask" && channel < 3 ? 4 : 2);
        if (entry.name === "opaque multiply") expect(pixels.left).toEqual(entry.expected);
        if (entry.name === "partial alpha mask") expect(pixels.right[3]).toBe(0);
      }
    }
    const reads = await page.evaluate(() => window.__musartVideoReadbacks!);
    expect(reads).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, canvasHook: true });
    await info.attach("independent-compositing-samplers", {
      body: JSON.stringify({ evidence, reads }),
      contentType: "application/json",
    });
  } finally {
    await inspector.close();
  }
});
