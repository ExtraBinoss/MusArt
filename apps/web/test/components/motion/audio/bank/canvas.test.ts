import { afterEach, expect, it, vi } from "vitest";
import { BankCanvasPainter } from "../../../../../src/components/motion/audio/bank/canvas";
import shapes from "../../../../../src/services/motion/audio/bank/shapes.json";
import { bankShapes } from "../../../../../src/services/motion/audio/bank/geometry";
import { BANK_ATLAS_BYTES } from "../../../../../src/services/motion/audio/bank/atlas";
import type {
  BankOwner,
  BankPlayback,
  BankPort,
  BankClock,
  BankAtlas,
} from "../../../../../src/services/motion/audio/bank/model";
afterEach(() => vi.unstubAllGlobals());
function fixture() {
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0,
    clock: BankClock | null = null;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++sequence;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("devicePixelRatio", 1);
  vi.stubGlobal(
    "Path2D",
    class {
      moveTo() {}
      lineTo() {}
      quadraticCurveTo() {}
      closePath() {}
    },
  );
  const contexts: {
    fill: ReturnType<typeof vi.fn>;
    drawImage: ReturnType<typeof vi.fn>;
    rect: ReturnType<typeof vi.fn>;
    clearRect: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    beginPath: ReturnType<typeof vi.fn>;
    clip: ReturnType<typeof vi.fn>;
    fillStyle: string;
  }[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
    const ctx = {
      fill: vi.fn(),
      drawImage: vi.fn(),
      rect: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      clip: vi.fn(),
      fillStyle: "",
    };
    contexts.push(ctx);
    return ctx as never;
  });
  const owner: BankOwner = { kind: "sound-bank", token: Symbol() },
    playback: BankPlayback = { kind: "bank-playback", token: Symbol() },
    port = {
      clock: vi.fn(() => clock),
      atlas: vi.fn(() => new Promise<BankAtlas>(() => {})),
    } as unknown as BankPort;
  const data = bankShapes(shapes),
    painter = new BankCanvasPainter(data, owner, port),
    root = document.createElement("div"),
    nodes: HTMLCanvasElement[] = [],
    unregister: (() => void)[] = [];
  document.body.append(root);
  for (const shape of data.shapes) {
    const row = document.createElement("div"),
      canvas = document.createElement("canvas");
    canvas.style.color = "#999999";
    canvas.style.outlineColor = "#00ff00";
    row.append(canvas);
    root.append(row);
    nodes.push(canvas);
    unregister.push(painter.register(shape.id, canvas, row));
  }
  painter.mount(root);
  const tick = () => {
    const [id, callback] = frames.entries().next().value!;
    frames.delete(id);
    callback(0);
  };
  return {
    painter,
    owner,
    playback,
    port,
    data,
    root,
    nodes,
    contexts,
    unregister,
    frames,
    tick,
    setClock: (value: BankClock | null) => {
      clock = value;
    },
    dispose() {
      painter.dispose();
      root.remove();
      vi.restoreAllMocks();
    },
  };
}
it("paints all15 genuine mountains before bitmap preparation and animates only the active canvas from its native clock", () => {
  const d = fixture();
  try {
    expect(d.nodes).toHaveLength(15);
    for (const node of d.nodes) {
      expect(node.height).toBe(16);
      expect(node.dataset.waveformReady).toBe("true");
    }
    expect(d.frames.size).toBe(0);
    const counts = d.contexts.map((ctx) => ctx.fill.mock.calls.length);
    d.setClock({ preset: d.data.shapes[0]!.id, elapsed: 0.25, duration: 1, playing: true });
    d.painter.start(d.data.shapes[0]!.id, d.playback);
    expect(d.frames.size).toBe(1);
    expect(d.contexts[0]!.rect).toHaveBeenLastCalledWith(0, 0, 32, 16);
    for (let index = 1; index < 15; index++)
      expect(d.contexts[index]!.fill).toHaveBeenCalledTimes(counts[index]!);
    d.setClock({ preset: d.data.shapes[0]!.id, elapsed: 0.5, duration: 1, playing: true });
    d.tick();
    expect(d.frames.size).toBe(1);
    expect(d.contexts[0]!.rect).toHaveBeenLastCalledWith(0, 0, 64, 16);
    d.setClock({ preset: d.data.shapes[0]!.id, elapsed: 1, duration: 1, playing: false });
    d.tick();
    expect(d.frames.size).toBe(0);
    expect(d.contexts[0]!.rect).toHaveBeenLastCalledWith(0, 0, 128, 16);
    d.painter.select(null);
    expect(d.frames.size).toBe(0);
  } finally {
    d.dispose();
  }
});
it("updates DPR without a frame loop and closes bitmaps that arrive after their owner retired", async () => {
  const d = fixture();
  let resolve!: (atlas: BankAtlas) => void;
  vi.mocked(d.port.atlas).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  try {
    vi.stubGlobal("devicePixelRatio", 2);
    window.dispatchEvent(new Event("resize"));
    expect(d.nodes[0]!.width).toBe(256);
    expect(d.nodes[0]!.height).toBe(32);
    const atlas = {
      neutral: { close: vi.fn() },
      active: { close: vi.fn() },
      width: 256,
      height: 32,
      dpr: 2,
    } as unknown as BankAtlas;
    d.painter.dispose();
    resolve(atlas);
    await Promise.resolve();
    expect(atlas.neutral.close).toHaveBeenCalledOnce();
    expect(atlas.active.close).toHaveBeenCalledOnce();
    expect(d.frames.size).toBe(0);
  } finally {
    d.dispose();
  }
});

it("replays StrictMode unregister/dispose/register/mount without clearing the next hovered waveform", () => {
  const disconnect = vi.spyOn(ResizeObserver.prototype, "disconnect"),
    d = fixture();
  try {
    for (const release of d.unregister) release();
    d.painter.dispose();
    expect(d.nodes.every((node) => node.width === 1 && node.height === 1)).toBe(true);
    d.nodes.forEach((node, index) =>
      d.painter.register(d.data.shapes[index]!.id, node, node.parentElement!),
    );
    d.painter.mount(d.root);
    const contexts = d.contexts.slice(-15),
      counts = contexts.map((context) => context.fill.mock.calls.length);
    expect(d.nodes.every((node) => node.width === 128 && node.height === 16)).toBe(true);
    expect(counts.every((count) => count > 0)).toBe(true);
    expect(d.frames.size).toBe(0);
    d.setClock({ preset: d.data.shapes[0]!.id, elapsed: 0.25, duration: 1, playing: true });
    d.painter.start(d.data.shapes[0]!.id, d.playback);
    expect(contexts[0]!.fill).toHaveBeenCalledTimes(counts[0]! + 2);
    expect(contexts[0]!.rect).toHaveBeenLastCalledWith(0, 0, 32, 16);
    expect(d.frames.size).toBe(1);
    for (let index = 1; index < contexts.length; index++)
      expect(contexts[index]!.fill).toHaveBeenCalledTimes(counts[index]!);
    d.painter.dispose();
    expect(d.frames.size).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(2);
  } finally {
    d.dispose();
  }
});

it.each([
  { ratio: 12, expected: 4 },
  { ratio: Infinity, expected: 1 },
  { ratio: NaN, expected: 1 },
  { ratio: 0, expected: 1 },
  { ratio: -1, expected: 1 },
])(
  "normalizes DPR $ratio before sizing either fallback surfaces or worker atlases",
  ({ ratio, expected }) => {
    const d = fixture();
    try {
      vi.stubGlobal("devicePixelRatio", ratio);
      window.dispatchEvent(new Event("resize"));
      expect(d.nodes[0]!.width).toBe(128 * expected);
      expect(d.nodes[0]!.height).toBe(16 * expected);
      const request = vi.mocked(d.port.atlas).mock.calls.at(-1)![1];
      expect(request.dpr).toBe(expected);
      const bytes =
        Math.ceil(request.width * request.dpr) *
        Math.ceil(request.height * request.dpr) *
        request.shapes.length *
        8;
      expect(bytes).toBeLessThanOrEqual(BANK_ATLAS_BYTES);
      expect(
        d.nodes.reduce((sum, node) => sum + node.width * node.height * 4, 0),
      ).toBeLessThanOrEqual(BANK_ATLAS_BYTES / 2);
      expect(d.frames.size).toBe(0);
    } finally {
      d.dispose();
    }
  },
);

it("bounds oversized widths and supports late virtualized registers without retaining invisible RAFs", () => {
  const d = fixture();
  try {
    vi.stubGlobal("devicePixelRatio", 12);
    Object.defineProperty(d.nodes[0]!, "clientWidth", { configurable: true, value: 1_000_000 });
    window.dispatchEvent(new Event("resize"));
    expect(
      d.nodes.reduce((sum, node) => sum + node.width * node.height * 8, 0),
    ).toBeLessThanOrEqual(BANK_ATLAS_BYTES);
    const id = d.data.shapes[0]!.id;
    d.setClock({ preset: id, elapsed: 0.25, duration: 1, playing: true });
    d.painter.start(id, d.playback);
    expect(d.frames.size).toBe(1);
    d.unregister[0]!();
    expect(d.frames.size).toBe(0);
    const node = d.nodes[0]!,
      previous = d.contexts.length;
    d.painter.register(id, node, node.parentElement!);
    expect(d.contexts).toHaveLength(previous + 1);
    expect(d.contexts.at(-1)!.fill).toHaveBeenCalled();
    expect(d.frames.size).toBe(1);
  } finally {
    d.dispose();
  }
});
