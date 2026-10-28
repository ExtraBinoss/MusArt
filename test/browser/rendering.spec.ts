import { expect, test, type Page } from "@playwright/test";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  type Asset,
  type Project,
} from "@musart/core";

async function open(page: Page, project: Project) {
  await page.goto("/?automation=1");
  await page.waitForFunction(() => Boolean(window.musart));
  await page.evaluate((project) => window.musart!.load(project), project);
}
async function decoded(page: Page, forceWebGL: boolean) {
  return page.evaluate(async (forceWebGL) => {
    const url = await window.musart!.render({ forceWebGL });
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    // Test-only decoding of the delivered PNG, never part of the renderer or preview.
    context.drawImage(image, 0, 0);
    return {
      width: image.width,
      height: image.height,
      data: Array.from(context.getImageData(0, 0, image.width, image.height).data),
    };
  }, forceWebGL);
}
function pixel(output: { width: number; data: number[] }, x: number, y: number) {
  const offset = (y * output.width + x) * 4;
  return output.data.slice(offset, offset + 4);
}
function identityEffects() {
  return [
    createEffect("brightness", { amount: 0.5 }),
    createEffect("contrast", { amount: 0.5 }),
    createEffect("grayscale", { amount: 0 }),
  ];
}
function svgAsset(id: string, width: number, height: number, svg: string): Asset {
  return {
    id,
    name: id,
    width,
    height,
    mime: "image/svg+xml",
    dataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  };
}

test("GPU target UV: nested group local y=3 remains y=3 through three effect passes and alpha compositing", async ({
  page,
}) => {
  const group = createLayer("group", {
    id: "uv-group",
    x: 4,
    y: 5,
    width: 20,
    height: 20,
    opacity: 0.5,
    effects: identityEffects(),
  });
  const child = createLayer("rectangle", {
    parentId: group.id,
    x: 2,
    y: 3,
    width: 10,
    height: 10,
    fill: "#ff000080",
    radius: 0,
  });
  await open(
    page,
    createProject({
      pages: [
        createPage({ width: 40, height: 30, background: "transparent", layers: [group, child] }),
      ],
    }),
  );
  for (const forceWebGL of [false, true]) {
    const output = await decoded(page, forceWebGL);
    expect(pixel(output, 8, 9)).toEqual([255, 0, 0, 64]);
    expect(pixel(output, 8, 20)).toEqual([0, 0, 0, 0]);
    const painted: [number, number][] = [];
    for (let y = 0; y < 30; y++)
      for (let x = 0; x < 40; x++) if (pixel(output, x, y)[3]! > 0) painted.push([x, y]);
    expect([
      Math.min(...painted.map((p) => p[0])),
      Math.min(...painted.map((p) => p[1])),
      Math.max(...painted.map((p) => p[0])),
      Math.max(...painted.map((p) => p[1])),
    ]).toEqual([6, 8, 15, 17]);
  }
});

test("GPU target UV: asymmetric image keeps its red top and blue bottom through nested targets and ping-pong", async ({
  page,
}) => {
  const asset = svgAsset(
    "asymmetric",
    8,
    10,
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="10"><path fill="red" d="M0 0h8v4H0z"/><path fill="blue" d="M0 4h8v6H0z"/></svg>',
  );
  const outer = createLayer("group", { id: "outer", x: 3, y: 4, width: 30, height: 24 });
  const inner = createLayer("group", {
    id: "inner",
    parentId: outer.id,
    x: 1,
    y: 1,
    width: 20,
    height: 20,
    effects: identityEffects(),
  });
  const image = createLayer("image", {
    parentId: inner.id,
    assetId: asset.id,
    x: 2,
    y: 3,
    width: 8,
    height: 10,
    effects: identityEffects(),
  });
  await open(
    page,
    createProject({
      assets: { [asset.id]: asset },
      pages: [
        createPage({
          width: 40,
          height: 35,
          background: "transparent",
          layers: [outer, inner, image],
        }),
      ],
    }),
  );
  for (const forceWebGL of [false, true]) {
    const output = await decoded(page, forceWebGL);
    expect(pixel(output, 8, 9)).toEqual([255, 0, 0, 255]);
    expect(pixel(output, 8, 16)).toEqual([0, 0, 255, 255]);
    expect(pixel(output, 1, 1)).toEqual([0, 0, 0, 0]);
    expect((await decoded(page, forceWebGL)).data).toEqual(output.data);
  }
  await expect(page.locator('canvas[data-renderer-ready="true"]')).toBeVisible();
  await page.screenshot({ path: "artifacts/screenshots/rendering-asymmetric-uv.png" });
});

test("GPU mask UV: a top-only alpha mask stays at the top of an effected group", async ({
  page,
}) => {
  const mask = svgAsset(
    "top-mask",
    20,
    20,
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path fill="white" d="M0 0h20v8H0z"/></svg>',
  );
  const group = createLayer("group", {
    id: "masked-group",
    x: 4,
    y: 5,
    width: 20,
    height: 20,
    opacity: 0.5,
    effects: identityEffects(),
    mask: { assetId: mask.id, enabled: true, inverted: false },
  });
  const child = createLayer("rectangle", {
    parentId: group.id,
    x: 2,
    y: 3,
    width: 10,
    height: 10,
    fill: "#ff000080",
    radius: 0,
  });
  await open(
    page,
    createProject({
      assets: { [mask.id]: mask },
      pages: [
        createPage({ width: 40, height: 30, background: "transparent", layers: [group, child] }),
      ],
    }),
  );
  for (const forceWebGL of [false, true]) {
    const output = await decoded(page, forceWebGL);
    expect(pixel(output, 8, 9)).toEqual([255, 0, 0, 64]);
    expect(pixel(output, 8, 14)).toEqual([0, 0, 0, 0]);
  }
});

test("26 GPU blend modes match W3C source-over with an isolated translucent group", async ({
  page,
}) => {
  const { BLEND_MODES } = await import("@musart/core");
  const layers = BLEND_MODES.flatMap((blendMode, index) => {
    const group = createLayer("group", {
      id: `blend-${blendMode}`,
      x: index * 12,
      y: 0,
      width: 12,
      height: 12,
      blendMode,
      opacity: 0.7,
    });
    return [
      group,
      createLayer("rectangle", {
        parentId: group.id,
        x: 0,
        y: 0,
        width: 12,
        height: 12,
        fill: "#40a0c099",
        radius: 0,
      }),
    ];
  });
  await open(
    page,
    createProject({
      pages: [
        createPage({ width: BLEND_MODES.length * 12, height: 12, background: "#804020b3", layers }),
      ],
    }),
  );
  const expected = await page.evaluate((modes) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d")!;
    const channel = (b: number, s: number, mode: string): number => {
      switch (mode) {
        case "linear-burn":
          return Math.max(0, b + s - 1);
        case "linear-dodge":
          return Math.min(1, b + s);
        case "vivid-light":
          return s <= 0.5
            ? s === 0
              ? 0
              : Math.max(0, 1 - (1 - b) / (2 * s))
            : s === 1
              ? 1
              : Math.min(1, b / (2 * (1 - s)));
        case "linear-light":
          return Math.max(0, Math.min(1, b + 2 * s - 1));
        case "pin-light":
          return s <= 0.5 ? Math.min(b, 2 * s) : Math.max(b, 2 * s - 1);
        case "hard-mix":
          return channel(b, s, "vivid-light") < 0.5 ? 0 : 1;
        case "subtract":
          return Math.max(0, b - s);
        case "divide":
          return Math.min(1, b / Math.max(s, 1e-9));
        default:
          throw new Error(mode);
      }
    };
    const custom = new Set([
      "linear-burn",
      "linear-dodge",
      "darker-color",
      "lighter-color",
      "vivid-light",
      "linear-light",
      "pin-light",
      "hard-mix",
      "subtract",
      "divide",
    ]);
    return modes.map((mode) => {
      if (custom.has(mode)) {
        const ab = 179 / 255,
          as = (153 / 255) * 0.7,
          alpha = as + ab * (1 - as);
        const b = [128, 64, 32].map((v) => v / 255),
          s = [64, 160, 192].map((v) => v / 255);
        const sum = (color: number[]) => color.reduce((total, value) => total + value, 0);
        const chosen =
          mode === "darker-color" ? (sum(s) < sum(b) ? s : b) : sum(s) > sum(b) ? s : b;
        return [
          ...b.map((v, i) =>
            Math.round(
              (((1 - as) * ab * v +
                as *
                  ((1 - ab) * s[i]! +
                    ab *
                      (["darker-color", "lighter-color"].includes(mode)
                        ? chosen[i]!
                        : channel(v, s[i]!, mode)))) /
                alpha) *
                255,
            ),
          ),
          Math.round(alpha * 255),
        ];
      }
      ctx.globalCompositeOperation = "copy";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#804020b3";
      ctx.fillRect(0, 0, 1, 1);
      ctx.globalCompositeOperation = (
        mode === "normal" ? "source-over" : mode
      ) as GlobalCompositeOperation;
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "#40a0c099";
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    });
  }, BLEND_MODES);
  for (const forceWebGL of [false, true]) {
    const output = await decoded(page, forceWebGL);
    BLEND_MODES.forEach((mode, index) =>
      pixel(output, index * 12 + 5, 5).forEach((actual, channel) =>
        expect(
          Math.abs(actual - expected[index]![channel]!),
          `${forceWebGL ? "WebGL" : "WebGPU"} ${mode} channel${channel}`,
        ).toBeLessThanOrEqual(3),
      ),
    );
  }
});

test("GPU SVG geometry preserves branded parts, nonzero viewBox, evenodd holes and live recoloring", async ({
  page,
}) => {
  const vector = createLayer("vector", {
    id: "vector-brand",
    x: 2,
    y: 3,
    width: 24,
    height: 12,
    fill: "#00ff00",
    vector: {
      viewBox: "10 20 24 12",
      preserveColors: true,
      parts: [
        { path: "M10 20h12v12H10z", fill: "#ff0000" },
        { path: "M22 20h12v12H22z", fill: "#0000ff" },
      ],
    },
  });
  const hole = createLayer("vector", {
    id: "vector-hole",
    x: 28,
    y: 3,
    width: 16,
    height: 16,
    fill: "#00ff00",
    vector: {
      viewBox: "0 0 16 16",
      parts: [{ path: "M0 0h16v16H0z M4 4h8v8H4z", fillRule: "evenodd" }],
    },
  });
  let composition = createPage({
    width: 48,
    height: 24,
    background: "transparent",
    layers: [vector, hole],
  });
  await open(page, createProject({ pages: [composition] }));
  for (const forceWebGL of [false, true]) {
    let output = await decoded(page, forceWebGL);
    expect(pixel(output, 6, 7)).toEqual([255, 0, 0, 255]);
    expect(pixel(output, 20, 7)).toEqual([0, 0, 255, 255]);
    expect(pixel(output, 30, 5)).toEqual([0, 255, 0, 255]);
    expect(pixel(output, 36, 11)).toEqual([0, 0, 0, 0]);
  }
  composition = {
    ...composition,
    layers: [
      { ...vector, fill: "#20a040", vector: { ...vector.vector!, preserveColors: false } },
      hole,
    ],
  };
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({ pages: [composition] }),
  );
  for (const forceWebGL of [false, true]) {
    const output = await decoded(page, forceWebGL);
    expect(pixel(output, 6, 7)).toEqual([32, 160, 64, 255]);
    expect(pixel(output, 20, 7)).toEqual([32, 160, 64, 255]);
  }
});

test("GPU layer masks use world transforms, luminance, group opacity and hide their source stack", async ({
  page,
}) => {
  const source = createLayer("group", {
    id: "mask-group",
    x: 6,
    y: 7,
    width: 8,
    height: 8,
    rotation: 90,
    opacity: 0.5,
    maskSource: true,
  });
  const white = createLayer("rectangle", {
    parentId: source.id,
    x: 0,
    y: 0,
    width: 4,
    height: 8,
    fill: "#ffffff",
    radius: 0,
  });
  const target = createLayer("rectangle", {
    id: "masked-target",
    x: 4,
    y: 4,
    width: 16,
    height: 16,
    fill: "#ff0000",
    radius: 0,
    mask: { layerId: source.id, mode: "luminance", enabled: true, inverted: false },
  });
  const composition = createPage({
    width: 24,
    height: 24,
    background: "transparent",
    layers: [target, source, white],
  });
  await open(page, createProject({ pages: [composition] }));
  for (const forceWebGL of [false, true]) {
    const output = await decoded(page, forceWebGL);
    expect(pixel(output, 10, 8)).toEqual([255, 0, 0, 128]);
    expect(pixel(output, 10, 13)).toEqual([0, 0, 0, 0]);
    expect(pixel(output, 2, 2)).toEqual([0, 0, 0, 0]);
  }
  await page.evaluate(
    (project) => window.musart!.load(project),
    createProject({
      pages: [{ ...composition, layers: [target, { ...source, visible: false }, white] }],
    }),
  );
  for (const backend of [false, true])
    expect(pixel(await decoded(page, backend), 10, 8)).toEqual([0, 0, 0, 0]);
});
