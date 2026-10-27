import { afterEach, describe, expect, it, vi } from "vitest";
import { createPage, EditorEngine } from "@musart/core";
import {
  assertSafeSvg,
  imageDimensions,
  importBatch,
  importImage,
  readDataUrl,
  type ImageReader,
} from "../../../src/services/assets/imports";
function file(name = "photo.png", type = "image/png", body = "data") {
  return new File([body], name, { type });
}
function reader(width = 100, height = 50): ImageReader {
  return {
    dataUrl: vi.fn(async () => "data:image/png;base64,AAAA"),
    dimensions: vi.fn(async () => ({ width, height })),
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
});
describe("original image imports", () => {
  it("reads native Blob data as a portable data URL", async () => {
    expect(await readDataUrl(new Blob(["abc"], { type: "image/png" }))).toBe(
      "data:image/png;base64,YWJj",
    );
  });
  it("surfaces file reader errors", async () => {
    class FailedReader {
      onerror: ((event: Event) => void) | null = null;
      readAsDataURL() {
        this.onerror?.(new Event("error"));
      }
    }
    vi.stubGlobal("FileReader", FailedReader);
    await expect(readDataUrl(new Blob())).rejects.toThrow("Lecture");
  });
  it("decodes image dimensions and reports corrupted data", async () => {
    class DecodedImage {
      naturalWidth = 80;
      naturalHeight = 40;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(value: string) {
        if (value === "invalid") this.onerror?.();
        else this.onload?.();
      }
    }
    vi.stubGlobal("Image", DecodedImage);
    expect(await imageDimensions("valid")).toEqual({ width: 80, height: 40 });
    await expect(imageDimensions("invalid")).rejects.toThrow("illisible");
    const asset = await importImage(file());
    expect(asset).toMatchObject({ name: "photo.png", width: 80, height: 40, mime: "image/png" });
    expect(asset.dataUrl).toMatch(/^data:image\/png/);
  });
  it("preserves original metadata and rejects unsupported files, oversized images and invalid dimensions", async () => {
    const asset = await importImage(file(), reader());
    expect(asset).toMatchObject({
      name: "photo.png",
      mime: "image/png",
      width: 100,
      height: 50,
      dataUrl: "data:image/png;base64,AAAA",
    });
    expect(asset.id.length).toBeGreaterThan(0);
    await expect(importImage(file("x.txt", "text/plain"), reader())).rejects.toThrow("format");
    const huge = file();
    Object.defineProperty(huge, "size", { value: 50 * 1024 * 1024 + 1 });
    await expect(importImage(huge, reader())).rejects.toThrow("50 Mo");
    for (const [width, height] of [
      [0, 1],
      [1, -2],
      [9000, 9000],
      [NaN, 1],
      [1, Infinity],
      [1.5, 1],
    ])
      await expect(importImage(file(), reader(width, height))).rejects.toThrow("dimensions");
  });
  it("validates SVG source before retaining it as an original asset", async () => {
    const safe = file(
      "vector.svg",
      "image/svg+xml",
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>',
    );
    expect(await importImage(safe, reader())).toMatchObject({
      name: "vector.svg",
      mime: "image/svg+xml",
    });
    const active = file(
      "vector.svg",
      "image/svg+xml",
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    await expect(importImage(active, reader())).rejects.toThrow("actif");
  });
  it("reports SVG text reader failures", async () => {
    class FailedReader {
      onerror: ((event: Event) => void) | null = null;
      readAsText() {
        this.onerror?.(new Event("error"));
      }
    }
    vi.stubGlobal("FileReader", FailedReader);
    await expect(importImage(file("vector.svg", "image/svg+xml"), reader())).rejects.toBeInstanceOf(
      Event,
    );
  });
});
it("rejects non-string FileReader results at both data URL and SVG text boundaries", async () => {
  class MalformedReader {
    result = new ArrayBuffer(4);
    onload: (() => void) | null = null;
    readAsDataURL() {
      this.onload?.();
    }
    readAsText() {
      this.onload?.();
    }
  }
  vi.stubGlobal("FileReader", MalformedReader);
  await expect(readDataUrl(new Blob())).rejects.toThrow("Contenu");
  await expect(importImage(file("vector.svg", "image/svg+xml"), reader())).rejects.toThrow(
    "Contenu",
  );
});
describe("SVG safety boundary", () => {
  it("accepts inert shapes with internal references and embedded image resources", () => {
    expect(() =>
      assertSafeSvg(
        '<svg xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g"/></defs><rect fill="url(#g)"/><use href="#g"/><image href="data:image/png;base64,AA=="/></svg>',
      ),
    ).not.toThrow();
  });
  it.each([
    "<html/>",
    "<svg><rect></svg>",
    "<svg><script/></svg>",
    "<svg><foreignObject/></svg>",
    '<svg onload="evil()"/>',
    '<svg><image href="https://bad.example/image.png"/></svg>',
    '<svg><rect fill="url(https://bad.example/paint)"/></svg>',
  ])("rejects invalid or active SVG %s", (source) => {
    expect(() => assertSafeSvg(source)).toThrow();
  });
});
describe("bounded bulk import", () => {
  it("decodes at most three images at once and produces one undoable command with centered fitted layers", async () => {
    let active = 0,
      peak = 0;
    const imageReader: ImageReader = {
      dataUrl: async () => "data:image/png;base64,AAAA",
      dimensions: async () => {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        return { width: 2000, height: 1000 };
      },
    };
    const page = createPage({ width: 1000, height: 1000 });
    const command = await importBatch(
      Array.from({ length: 9 }, (_, index) => file(`${index}.png`)),
      page,
      imageReader,
    );
    expect(peak).toBe(3);
    expect(command.type).toBe("addLayers");
    if (command.type !== "addLayers") throw new Error("Wrong command");
    expect(command.assets).toHaveLength(9);
    expect(command.layers[0]).toMatchObject({ width: 720, height: 360, x: 140, y: 320 });
    expect(command.layers[1]?.x).toBe(156);
    expect(command.layers[8]?.x).toBe(140);
    const engine = new EditorEngine();
    engine.execute(command);
    expect(engine.getSnapshot().selection).toHaveLength(9);
    engine.undo();
    expect(engine.getSnapshot().project.pages[0]!.layers).toHaveLength(0);
  });
  it("rejects empty or excessive batches and stops on any invalid file", async () => {
    const page = createPage();
    await expect(importBatch([], page)).rejects.toThrow("Aucune");
    await expect(
      importBatch(
        Array.from({ length: 101 }, () => file()),
        page,
      ),
    ).rejects.toThrow("100");
    await expect(importBatch([file(), file("bad", "text/plain")], page, reader())).rejects.toThrow(
      "format",
    );
    const small = await importBatch([file()], page, reader(10, 20));
    if (small.type !== "addLayers") throw new Error("Wrong command");
    expect(small.layers[0]).toMatchObject({ width: 10, height: 20 });
  });
});
