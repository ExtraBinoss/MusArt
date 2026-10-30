import { vi } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export function installCanvasMock() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const file = resolve(process.cwd(), "apps/web/public", input.replace(/^\//, ""));
      const data = await readFile(file);
      return new Response(new Uint8Array(data));
    }),
  );
  const context = {
    scale: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    resetTransform: vi.fn(),
    beginPath: vi.fn(),
    ellipse: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
    getImageData: vi.fn(() => ({ width: 4, height: 3, data: new Uint8ClampedArray(4 * 3 * 4) })),
    putImageData: vi.fn(),
    fillStyle: "",
    font: "",
    textAlign: "left",
    textBaseline: "",
    letterSpacing: "",
    strokeStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
    globalCompositeOperation: "",
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (() => context) as unknown as HTMLCanvasElement["getContext"],
  );
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
      queueMicrotask(() => {
        if (value === "bad") this.onerror?.();
        else this.onload?.();
      });
    }
  }
  vi.stubGlobal("Image", MockImage);
  vi.stubGlobal(
    "ImageData",
    class {
      constructor(
        public data: Uint8ClampedArray,
        public width: number,
        public height: number,
      ) {}
    },
  );
  return context;
}
