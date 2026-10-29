import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installReadbackProbe } from "./support/readback-probe";
const output = resolve("artifacts/text-layout-native");
let bundle: string, wasm: Buffer;
test.beforeAll(async () => {
  await mkdir(output, { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/text-layout-witness.ts",
      "--target=browser",
      "--external=harfbuzzjs/hb.wasm?url",
      "--outfile",
      resolve(output, "witness.js"),
    ],
    { stdio: "pipe" },
  );
  bundle = await readFile(resolve(output, "witness.js"), "utf8");
  wasm = await readFile(resolve("node_modules/harfbuzzjs/hb.wasm"));
});
for (const forceWebGL of [false, true])
  test(`animated analytical text equals fresh layout (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);
    await installReadbackProbe(page);
    await page.route("**/text-layout-witness.html", (r) =>
      r.fulfill({
        contentType: "text/html",
        body: '<!doctype html><title>Text layout witness</title><script type="importmap">{"imports":{"harfbuzzjs/hb.wasm?url":"/text-layout-font-url.js"}}</script>',
      }),
    );
    await page.route("**/text-layout-font-url.js", (r) =>
      r.fulfill({
        contentType: "text/javascript",
        body: 'export default "/text-layout-font.wasm";',
      }),
    );
    await page.route("**/text-layout-font.wasm", (r) =>
      r.fulfill({ contentType: "application/wasm", body: wasm }),
    );
    await page.route("**/text-layout-witness.js", (r) =>
      r.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await page.goto("/text-layout-witness.html");
    const result = await page.evaluate(async (forceWebGL) => {
      const url = "/text-layout-witness.js";
      const module = (await import(
        /* @vite-ignore */ url
      )) as typeof import("./support/text-layout-witness");
      return module.runTextLayoutWitness(forceWebGL);
    }, forceWebGL);
    expect(result.stats?.backend).toBe(forceWebGL ? "webgl" : "webgpu");
    expect(result.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0 });
    expect(result.frames.slice(0, 3).map((f) => f.newOutlineResources)).toEqual([1, 0, 0]);
    const inspector = await context.newPage();
    try {
      const differences = await inspector.evaluate(async (frames) => {
        const decode = async (url: string) => {
          const image = new Image();
          image.src = url;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, image.width, image.height).data;
        };
        const output = [];
        for (const frame of frames) {
          const a = await decode(frame.reused),
            b = await decode(frame.fresh);
          let max = 0,
            changed = 0,
            ink = 0;
          for (let i = 0; i < a.length; i++) {
            const diff = Math.abs(a[i]! - b[i]!);
            max = Math.max(max, diff);
            if (diff) changed++;
            if (i % 4 === 0 && a[i]! > 40) ink++;
          }
          output.push({ max, changed, ink });
        }
        return output;
      }, result.frames);
      expect(differences.every((x) => x.max === 0 && x.ink > 10)).toBe(true);
      await writeFile(
        resolve(output, `${forceWebGL ? "webgl" : "webgpu"}.json`),
        JSON.stringify(
          {
            differences,
            stats: result.stats,
            readbacks: result.readbacks,
            newOutlineResources: result.frames.map((f) => f.newOutlineResources),
          },
          null,
          2,
        ),
      );
    } finally {
      await inspector.close();
    }
  });
