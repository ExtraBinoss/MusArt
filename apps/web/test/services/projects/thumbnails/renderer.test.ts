import { afterEach, expect, it, vi } from "vitest";
import { createPage } from "@musart/core";
import {
  ThumbnailRenderer,
  type ThumbnailFrameSession,
} from "../../../../src/services/projects/thumbnails/renderer";
const exported = vi.hoisted(() => ({ createRenderSession: vi.fn() }));
vi.mock("@musart/render", () => exported);
afterEach(() => vi.restoreAllMocks());
function fixture(blob: Blob | null = new Blob(["webp"], { type: "image/webp" })) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 384;
  const encode = vi.spyOn(canvas, "toBlob").mockImplementation((callback) => callback(blob));
  const session: ThumbnailFrameSession = {
    withCanvasFrame: vi.fn(async (_page, _assets, consume) => consume(canvas)),
    dispose: vi.fn(async () => {}),
  };
  const factory = vi.fn(async () => session);
  return { canvas, session, factory, encode, renderer: new ThumbnailRenderer(factory) };
}
it("retains one native GPU session across pages and encodes high-quality WebP inside its atomic frame queue", async () => {
  const d = fixture(),
    page = createPage({ width: 2000, height: 1000 });
  expect(await d.renderer.render(page, {})).toMatchObject({ width: 768, height: 384 });
  await d.renderer.render(createPage({ width: 100, height: 100 }), {});
  expect(d.session.withCanvasFrame).toHaveBeenNthCalledWith(
    2,
    expect.anything(),
    {},
    expect.any(Function),
    {
      scale: 7.68,
      canRender: expect.any(Function),
    },
  );
  expect(d.factory).toHaveBeenCalledOnce();
  expect(d.encode).toHaveBeenCalledWith(expect.any(Function), "image/webp", 0.88);
  expect(d.session.withCanvasFrame).toHaveBeenNthCalledWith(1, page, {}, expect.any(Function), {
    scale: 768 / 2000,
    canRender: expect.any(Function),
  });
  await d.renderer.dispose();
  await d.renderer.dispose();
  expect(d.session.dispose).toHaveBeenCalledOnce();
  await expect(d.renderer.render(page, {})).rejects.toThrow("closed");
});
it("uses bounded requested preview edges without creating a second retained session", async () => {
  const d = fixture(),
    page = createPage({ width: 600, height: 300 });
  await d.renderer.render(page, {}, undefined, 96);
  await d.renderer.render(page, {}, undefined, 384);
  expect(d.factory).toHaveBeenCalledOnce();
  expect(d.session.withCanvasFrame).toHaveBeenNthCalledWith(1, page, {}, expect.any(Function), {
    scale: 96 / 600,
    canRender: expect.any(Function),
  });
  await expect(d.renderer.render(page, {}, undefined, 0)).rejects.toThrow("edge");
  await expect(d.renderer.render(page, {}, undefined, 769)).rejects.toThrow("edge");
  await d.renderer.dispose();
});
it.each([
  null,
  new Blob([], { type: "image/webp" }),
  new Blob(["png"], { type: "image/png" }),
  new Blob(["x".repeat(1048577)], { type: "image/webp" }),
])(
  "rejects failed or invalid native encodes instead of caching a broken thumbnail",
  async (blob) => {
    const d = fixture(blob);
    await expect(d.renderer.render(createPage(), {})).rejects.toThrow(
      /encoding failed|Unsupported/,
    );
    await d.renderer.dispose();
  },
);
it("retries failed session creation and defers submission through the activity predicate", async () => {
  const d = fixture();
  d.factory.mockRejectedValueOnce(new Error("adapter"));
  await expect(d.renderer.render(createPage(), {})).rejects.toThrow("adapter");
  await expect(d.renderer.render(createPage(), {}, () => false)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(d.factory).toHaveBeenCalledOnce();
  const canRender = () => true;
  await d.renderer.render(createPage(), {}, canRender);
  expect(d.session.withCanvasFrame).toHaveBeenLastCalledWith(
    expect.anything(),
    {},
    expect.any(Function),
    expect.objectContaining({ canRender: expect.any(Function) }),
  );
  await d.renderer.dispose();
});
it("creates the default session with a strict memory budget and native resized source textures", async () => {
  const d = fixture();
  exported.createRenderSession.mockReturnValue(d.session);
  const renderer = new ThumbnailRenderer();
  await renderer.render(createPage(), {});
  expect(exported.createRenderSession).toHaveBeenCalledWith({
    maxBytes: 384 * 1024 * 1024,
  });
  await renderer.dispose();
});
it("shares disposal completion while an asynchronous session factory is still pending", async () => {
  const d = fixture();
  let finish!: (session: ThumbnailFrameSession) => void;
  const renderer = new ThumbnailRenderer(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const rendering = renderer.render(createPage(), {}),
    first = renderer.dispose(),
    second = renderer.dispose();
  expect(second).toBe(first);
  finish(d.session);
  await expect(rendering).rejects.toThrow("closed");
  await first;
  expect(d.session.dispose).toHaveBeenCalledOnce();
});

it("rechecks input immediately before native snapshot if it became busy during source rendering", async () => {
  const d = fixture();
  let allowed = true;
  vi.mocked(d.session.withCanvasFrame).mockImplementationOnce(async (_page, _assets, consume) => {
    allowed = false;
    return consume(d.canvas);
  });
  await expect(d.renderer.render(createPage(), {}, () => allowed)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(d.encode).not.toHaveBeenCalled();
  allowed = true;
  await d.renderer.render(createPage(), {}, () => allowed);
  expect(d.factory).toHaveBeenCalledOnce();
  expect(d.encode).toHaveBeenCalledOnce();
  await d.renderer.dispose();
});
it("cancels the owned pre-render yield when disposed and never admits an abandoned frame", async () => {
  const d = fixture();
  let queued!: () => void;
  vi.stubGlobal("scheduler", {
    postTask: (_task: () => void, options: { signal: AbortSignal }) =>
      new Promise<void>((_resolve, reject) => {
        queued = () =>
          options.signal.addEventListener("abort", () => reject(options.signal.reason), {
            once: true,
          });
        queued();
      }),
  });
  try {
    const rendering = d.renderer.render(createPage(), {}),
      rejected = expect(rendering).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    await Promise.resolve();
    await d.renderer.dispose();
    await rejected;
    expect(d.encode).not.toHaveBeenCalled();
    expect(d.session.dispose).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("rejects a late native encoding result after the renderer has closed", async () => {
  const d = fixture();
  let finish!: BlobCallback, started!: () => void;
  const encoding = new Promise<void>((resolve) => {
    started = resolve;
  });
  d.encode.mockImplementationOnce((callback) => {
    finish = callback;
    started();
  });
  const rendering = d.renderer.render(createPage(), {}),
    rejected = expect(rendering).rejects.toMatchObject({ name: "AbortError" });
  await encoding;
  const closing = d.renderer.dispose();
  finish(new Blob(["complete"], { type: "image/webp" }));
  await rejected;
  await closing;
  expect(d.session.dispose).toHaveBeenCalledOnce();
});

it("snapshots frame dimensions before releasing the canvas and admits no more than two native encodes", async () => {
  const d = fixture();
  const callbacks: BlobCallback[] = [];
  d.encode.mockImplementation((callback) => {
    callbacks.push(callback);
  });
  const first = d.renderer.render(createPage(), {}, undefined, 96);
  const second = d.renderer.render(createPage(), {}, undefined, 96);
  const third = d.renderer.render(createPage(), {}, undefined, 96);
  await vi.waitFor(() => expect(callbacks).toHaveLength(2));
  expect(d.session.withCanvasFrame).toHaveBeenCalledTimes(2);
  // The GPU frame mutex has resolved to metadata while its immutable encoding is still pending.
  const frame = await vi.mocked(d.session.withCanvasFrame).mock.results[0]!.value;
  expect(frame).toMatchObject({ width: 768, height: 384, encoding: expect.any(Promise) });
  d.canvas.width = 96;
  d.canvas.height = 48;
  callbacks[0]!(new Blob(["first"], { type: "image/webp" }));
  expect(await first).toMatchObject({ width: 768, height: 384 });
  await vi.waitFor(() => expect(callbacks).toHaveLength(3));
  callbacks[1]!(new Blob(["second"], { type: "image/webp" }));
  callbacks[2]!(new Blob(["third"], { type: "image/webp" }));
  expect(await second).toMatchObject({ width: 768, height: 384 });
  expect(await third).toMatchObject({ width: 96, height: 48 });
  await d.renderer.dispose();
});
it("starts the native snapshot synchronously after draw, before presentation can clear a WebGL buffer", async () => {
  const d = fixture();
  vi.mocked(d.session.withCanvasFrame).mockImplementationOnce(async (_page, _assets, consume) => {
    const result = consume(d.canvas);
    expect(result).not.toBeInstanceOf(Promise);
    expect(d.encode).toHaveBeenCalledOnce();
    return result;
  });
  await d.renderer.render(createPage(), {});
  await d.renderer.dispose();
});
it("disposal drains both detached native encodes, aborts a waiting frame and closes the one session afterwards", async () => {
  const d = fixture();
  const callbacks: BlobCallback[] = [];
  d.encode.mockImplementation((callback) => {
    callbacks.push(callback);
  });
  const renders = [0, 1, 2].map(() => d.renderer.render(createPage(), {}, undefined, 96));
  const outcomes = renders.map((render) =>
    expect(render).rejects.toMatchObject({ name: "AbortError" }),
  );
  await vi.waitFor(() => expect(callbacks).toHaveLength(2));
  const closing = d.renderer.dispose();
  expect(d.session.dispose).not.toHaveBeenCalled();
  callbacks[0]!(new Blob(["first"], { type: "image/webp" }));
  await Promise.resolve();
  expect(d.session.dispose).not.toHaveBeenCalled();
  callbacks[1]!(new Blob(["second"], { type: "image/webp" }));
  await Promise.all(outcomes);
  await closing;
  expect(callbacks).toHaveLength(2);
  expect(d.session.dispose).toHaveBeenCalledOnce();
});
it("surfaces a synchronous native snapshot failure and can retry without leaking an encoding slot", async () => {
  const d = fixture();
  d.encode.mockImplementationOnce(() => {
    throw new DOMException("tainted", "SecurityError");
  });
  await expect(d.renderer.render(createPage(), {})).rejects.toMatchObject({
    name: "SecurityError",
  });
  await expect(d.renderer.render(createPage(), {})).resolves.toMatchObject({
    blob: expect.any(Blob),
  });
  await d.renderer.dispose();
});

it("always guards asynchronous source preparation against disposal even without a caller predicate", async () => {
  const d = fixture();
  let prepared!: () => void;
  const preparation = new Promise<void>((resolve) => {
    prepared = resolve;
  });
  const submit = vi.fn();
  vi.mocked(d.session.withCanvasFrame).mockImplementationOnce(
    async (_page, _assets, consume, options) => {
      await preparation;
      if (!options.canRender!())
        throw new DOMException("Disposed before GPU submission.", "AbortError");
      submit();
      return consume(d.canvas);
    },
  );
  const rendering = d.renderer.render(createPage(), {});
  const rejected = expect(rendering).rejects.toMatchObject({ name: "AbortError" });
  await vi.waitFor(() => expect(d.session.withCanvasFrame).toHaveBeenCalledOnce());
  const guard = vi.mocked(d.session.withCanvasFrame).mock.calls[0]![3].canRender!;
  expect(guard()).toBe(true);
  const closing = d.renderer.dispose();
  expect(guard()).toBe(false);
  prepared();
  await rejected;
  await closing;
  expect(submit).not.toHaveBeenCalled();
  expect(d.encode).not.toHaveBeenCalled();
});
