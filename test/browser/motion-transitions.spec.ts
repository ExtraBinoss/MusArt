import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TRANSITION_CATALOG } from "@musart/core";
import { installReadbackProbe } from "./support/readback-probe";

const directory = resolve("artifacts/motion/transitions/native");
let bundle: string, wasm: Buffer;
test.beforeAll(async () => {
  await mkdir(directory, { recursive: true });
  execFileSync(
    "bun",
    [
      "build",
      "test/browser/support/motion-transitions-witness.ts",
      "--target=browser",
      "--external=harfbuzzjs/hb.wasm?url",
      "--outfile",
      resolve(directory, "witness.js"),
    ],
    { stdio: "pipe" },
  );
  bundle = await readFile(resolve(directory, "witness.js"), "utf8");
  wasm = await readFile(resolve("node_modules/harfbuzzjs/hb.wasm"));
});
for (const forceWebGL of [false, true])
  for (let first = 0; first < TRANSITION_CATALOG.length; first += 6) {
    const styles = TRANSITION_CATALOG.slice(first, first + 6).map(({ id }) => id);
    const name = `${forceWebGL ? "WebGL" : "WebGPU"} operators ${first + 1}-${first + styles.length}`;
    test(`GPU transitions ${name} retain endpoints, alpha, determinism and native-only pixels`, async ({
      page,
      context,
      browser,
    }) => {
      test.setTimeout(40000);
      await installReadbackProbe(page);
      await context.route("**/transition-witness.html", (route) =>
        route.fulfill({
          contentType: "text/html",
          body: '<!doctype html><title>Native transitions</title><script type="importmap">{"imports":{"harfbuzzjs/hb.wasm?url":"/transition-font-url.js"}}</script>',
        }),
      );
      await context.route("**/transition-font-url.js", (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: 'export default "/transition-font.wasm";',
        }),
      );
      await context.route("**/transition-font.wasm", (route) =>
        route.fulfill({ contentType: "application/wasm", body: wasm }),
      );
      await context.route("**/transition-witness.js", (route) =>
        route.fulfill({ contentType: "text/javascript", body: bundle }),
      );
      const shaderErrors: string[] = [];
      page.on("pageerror", (error) => shaderErrors.push(error.message.slice(0, 2000)));
      page.on("console", (message) => {
        if (message.type() === "error") shaderErrors.push(message.text().slice(0, 2000));
      });
      await page.goto("/transition-witness.html", { waitUntil: "domcontentloaded" });
      const output = await page.evaluate(
        async (options) => {
          const path = "/transition-witness.js";
          const module = (await import(
            /* @vite-ignore */ path
          )) as typeof import("./support/motion-transitions-witness");
          return module.renderTransitionCohort(options.styles, options.forceWebGL);
        },
        { styles, forceWebGL },
      );
      const inspector = await context.newPage();
      try {
        await inspector.goto("/transition-witness.html", { waitUntil: "domcontentloaded" });
        const results = await inspector.evaluate(async (input) => {
          const path = "/transition-witness.js";
          const module = (await import(
            /* @vite-ignore */ path
          )) as typeof import("./support/motion-transitions-witness");
          return module.inspectTransitionCohort(input);
        }, output);
        const evidence = {
          browser: browser.version(),
          stats: output.stats,
          readbacks: output.readbacks,
          shaderErrors,
          results,
        };
        await writeFile(
          resolve(directory, `${name.replaceAll(" ", "-")}.json`),
          JSON.stringify(evidence, null, 2),
        );
        for (const { style, images } of output.captured)
          await writeFile(
            resolve(directory, `${forceWebGL ? "webgl" : "webgpu"}-${style}.png`),
            Buffer.from(images[0]!.split(",")[1]!, "base64"),
          );
        expect(shaderErrors).toEqual([]);
        expect(output.stats?.backend).toBe(forceWebGL ? "webgl" : "webgpu");
        expect(output.readbacks).toMatchObject({ gpu: 0, webgl: 0, canvas: 0, videoFrame: 0 });
        for (const result of results) {
          expect(result.endpointError, result.style).toBeLessThanOrEqual(2);
          expect(result.repeatedError, result.style).toBe(0);
          expect(result.zeroAlpha, result.style).toBe(0);
          expect(result.interiorChange, result.style).toBeGreaterThan(50);
          expect(result.interiorAlpha, result.style).toBeGreaterThan(255);
          expect(result.expandedAlpha, result.style).toBeLessThanOrEqual(2);
        }
      } finally {
        await inspector.close();
      }
    });
  }
