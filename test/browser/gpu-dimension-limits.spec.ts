import { expect, test, type Page } from "@playwright/test";
import {
  createEffect,
  createLayer,
  createPage,
  createProject,
  type Asset,
  type Layer,
} from "@musart/core";
import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import { installReadbackProbe } from "./support/readback-probe";

declare global {
  interface Window {
    __dimensionAudit?: { limit: number; oversized: number[][] };
  }
}
/** Validation-only original PNG; no canvas size limit or production resampling. */
function thinPng(width: number): string {
  const crc = (data: Buffer) => {
    let value = 0xffffffff;
    for (const byte of data) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (kind: string, data: Buffer) => {
    const type = Buffer.from(kind),
      size = Buffer.alloc(4),
      checksum = Buffer.alloc(4);
    size.writeUInt32BE(data.length);
    checksum.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([size, type, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const row = Buffer.alloc(1 + width * 4);
  for (let x = 0; x < width; x++) {
    row[1 + x * 4] = 255;
    row[4 + x * 4] = 255;
  }
  return `data:image/png;base64,${Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(row)), chunk("IEND", Buffer.alloc(0))]).toString("base64")}`;
}
async function installAllocationAudit(page: Page) {
  await page.addInitScript(() => {
    const audit = { limit: 0, oversized: [] as number[][] };
    window.__dimensionAudit = audit;
    if (typeof GPUDevice !== "undefined") {
      const create = GPUDevice.prototype.createTexture;
      GPUDevice.prototype.createTexture = function (descriptor) {
        const limit = this.limits.maxTextureDimension2D,
          size = descriptor.size as number[] | GPUExtent3DDict;
        const width = Array.isArray(size) ? size[0]! : size.width,
          height = Array.isArray(size) ? (size[1] ?? 1) : (size.height ?? 1);
        audit.limit = limit;
        if (width > limit || height > limit) audit.oversized.push([width, height, limit]);
        return create.call(this, descriptor);
      };
    }
    const observe = (gl: WebGL2RenderingContext, width: number, height: number) => {
      const limit = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE));
      audit.limit = limit;
      if (width > limit || height > limit) audit.oversized.push([width, height, limit]);
    };
    const storage = WebGL2RenderingContext.prototype.texStorage2D;
    WebGL2RenderingContext.prototype.texStorage2D = function (...args) {
      observe(this, args[3], args[4]);
      return storage.apply(this, args);
    };
    const image = WebGL2RenderingContext.prototype.texImage2D;
    WebGL2RenderingContext.prototype.texImage2D = function (...raw: unknown[]) {
      if (raw.length >= 8 && typeof raw[3] === "number" && typeof raw[4] === "number")
        observe(this, raw[3], raw[4]);
      else {
        const source = raw.at(-1) as {
          naturalWidth?: number;
          naturalHeight?: number;
          width?: number;
          height?: number;
        } | null;
        if (source && typeof source === "object")
          observe(
            this,
            source.naturalWidth ?? source.width ?? 0,
            source.naturalHeight ?? source.height ?? 0,
          );
      }
      return image.apply(this, raw as Parameters<typeof image>);
    };
  });
}
for (const forceWebGL of [false, true])
  test(`actual GPU axis limits reject thin originals/targets without black fallback, preserve giant plain primitives (${forceWebGL ? "WebGL" : "WebGPU"})`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await installReadbackProbe(page);
    await installAllocationAudit(page);
    if (forceWebGL)
      await page.addInitScript(() => Object.defineProperty(navigator, "gpu", { value: undefined }));
    await page.goto("/?automation=1");
    await page.waitForFunction(() => Boolean(window.musart));
    const inspector = await page.context().newPage();
    await page.bringToFront();
    const asset: Asset = {
        id: "source",
        name: "red original",
        mime: "image/png",
        width: 1,
        height: 1,
        dataUrl: thinPng(1),
      },
      key = forceWebGL ? "webgl" : "webgpu";
    const project = (
      suffix: string,
      layer: Layer,
      assets: Record<string, Asset> = { source: asset },
    ) =>
      createProject({
        id: `dimension-${key}-${suffix}`,
        assets,
        pages: [
          createPage({
            id: "page",
            width: 64,
            height: 64,
            background: "transparent",
            layers: [layer],
          }),
        ],
      });
    const image = createLayer("image", {
      id: "image",
      x: 0,
      y: 0,
      width: 32,
      height: 32,
      assetId: "source",
    });
    const load = async (value: ReturnType<typeof project>, valid: boolean) => {
      await page.evaluate((value) => window.musart!.load(value), value);
      if (valid)
        await page.waitForFunction((id) => {
          const d = document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset;
          return (
            d?.projectId === id &&
            d.rendererReady === "true" &&
            d.sceneRevision === d.renderedRevision
          );
        }, value.id);
      else {
        await page.waitForFunction(() =>
          document
            .querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")
            ?.dataset.renderError?.includes("device limit"),
        );
        await expect(page.locator(".editor-gpu-scene canvas")).toHaveAttribute(
          "data-renderer-ready",
          "false",
        );
      }
    };
    const render = () =>
      page.evaluate((options) => window.musart!.render(options), {
        format: "png" as const,
        forceWebGL,
      });
    try {
      await load(project("initial", image), true);
      const baseline = await render();
      const limit = await page.evaluate(() => window.__dimensionAudit!.limit);
      expect(limit).toBeGreaterThan(0);
      const oversized = thinPng(limit + 1);
      const decoded = await inspector.evaluate(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      }, oversized);
      expect(decoded).toEqual([limit + 1, 1]);
      await load(project("source", image, { source: { ...asset, dataUrl: oversized } }), false);
      const sourceError = await page.evaluate(
        async (options) => {
          try {
            await window.musart!.render(options);
            return "unexpected success";
          } catch (error) {
            return String(error);
          }
        },
        { format: "png" as const, forceWebGL },
      );
      expect(sourceError).toContain(`${limit + 1}×1 exceeds the device limit of ${limit}px`);
      await load(project("source-recovered", image), true);
      await render();
      const canvas = page.locator(".editor-gpu-scene canvas");
      const beforeFailure = await canvas.screenshot({ animations: "disabled" });
      const thin = {
        ...image,
        width: 32768,
        height: 1,
        effects: [createEffect("brightness", { amount: 0.6 })],
      };
      // Same project/page: a failed edit must retain the last displayed texture.
      await load(project("source-recovered", thin), 32768 <= limit);
      const targetResult = await page.evaluate(
        async (options) => {
          try {
            await window.musart!.render(options);
            return "success";
          } catch (error) {
            return String(error);
          }
        },
        { format: "png" as const, forceWebGL },
      );
      if (32768 > limit)
        expect(targetResult).toContain(`32768×1 exceeds the device limit of ${limit}px`);
      else expect(targetResult).toBe("success"); // Hardware already admits the core's maximum legal axis.
      if (32768 > limit) {
        const afterFailure = await canvas.screenshot({ animations: "disabled" });
        const changed = await inspector.evaluate(
          async (sources) => {
            const decode = async (url: string) => {
              const image = new Image();
              image.src = url;
              await image.decode();
              const canvas = document.createElement("canvas");
              canvas.width = image.width;
              canvas.height = image.height;
              const context = canvas.getContext("2d")!;
              context.drawImage(image, 0, 0);
              return context.getImageData(0, 0, image.width, image.height).data;
            };
            const a = await decode(sources[0]!),
              b = await decode(sources[1]!);
            return a.length !== b.length
              ? -1
              : a.reduce((count, value, index) => count + Number(value !== b[index]), 0);
          },
          [beforeFailure, afterFailure].map(
            (bytes) => `data:image/png;base64,${bytes.toString("base64")}`,
          ),
        );
        expect(changed).toBe(0);
      }
      await load(project("target-recovered", image), true);
      await render();
      const primitive = createLayer("rectangle", {
        id: "plain",
        x: 0,
        y: 20,
        width: 32768,
        height: 1,
        fill: "#ff0000",
        radius: 0,
        strokeWidth: 0,
      });
      await load(project("plain", primitive, {}), true);
      const plain = await render();
      const redPixels = await inspector.evaluate(async (url) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const c = canvas.getContext("2d")!;
        c.drawImage(image, 0, 0);
        const p = c.getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let i = 0; i < p.length; i += 4)
          if (p[i]! > 200 && p[i + 1]! < 20 && p[i + 3]! > 0) count++;
        return count;
      }, plain);
      expect(redPixels).toBeGreaterThan(0);
      const actual = await page.evaluate(() => ({
        audit: window.__dimensionAudit!,
        reads: window.__musartVideoReadbacks!,
        backend: document.querySelector<HTMLCanvasElement>(".editor-gpu-scene canvas")?.dataset
          .backend,
      }));
      expect(actual.audit.oversized).toEqual([]);
      expect(actual.backend).toBe(key);
      expect(errors).toEqual([]);
      expect({
        gpu: actual.reads.gpu,
        webgl: actual.reads.webgl,
        canvas: actual.reads.canvas,
      }).toEqual({ gpu: 0, webgl: 0, canvas: 0 });
      await mkdir("artifacts/gpu-dimensions", { recursive: true });
      await writeFile(
        `artifacts/gpu-dimensions/${key}.json`,
        JSON.stringify(
          {
            limit,
            decoded,
            sourceError,
            targetResult,
            redPixels,
            actual,
            errors,
            boundary:
              "Actual acquired-device/context limits; decoded original lies about metadata; real thin target, explicit failures and rendererReady=false; native allocation intercepts see no oversized request; valid render recovery and giant batched primitive remain available.",
          },
          null,
          2,
        ),
      );
      await writeFile(
        `artifacts/gpu-dimensions/${key}-plain.png`,
        Buffer.from(plain.split(",")[1]!, "base64"),
      );
      expect(baseline).toContain("data:image/png");
    } finally {
      await inspector.close();
    }
  });
