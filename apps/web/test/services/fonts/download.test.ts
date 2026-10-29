import { afterEach, expect, it, vi } from "vitest";
import { MAX_FONT_FILE_BYTES } from "@musart/assets";
import { abortable, downloadFont, readFontBlob } from "../../../src/services/fonts/download";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("accepts bundled fonts only inside the configured deployment path", async () => {
  vi.stubEnv("BASE_URL", "/MusArt/");
  const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))),
    signal = new AbortController().signal;
  await downloadFont("/MusArt/fonts/inter/font.ttf", fetcher, signal);
  expect(fetcher).toHaveBeenCalledWith("/MusArt/fonts/inter/font.ttf", { signal });
  for (const url of ["/fonts/inter/font.ttf", "/other/fonts/inter/font.ttf"])
    await expect(downloadFont(url, fetcher, signal)).rejects.toMatchObject({
      code: "unsupported",
    });
  expect(fetcher).toHaveBeenCalledOnce();
});
it("streams approved sources and rejects HTTP errors, unexpected origins and oversized declarations", async () => {
  const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))),
    signal = new AbortController().signal;
  expect(
    Array.from(new Uint8Array(await downloadFont("/fonts/inter/font.ttf", fetcher, signal))),
  ).toEqual([1, 2, 3]);
  await downloadFont(
    "https://raw.githubusercontent.com/google/fonts/revision/font.ttf",
    fetcher,
    signal,
  );
  await downloadFont("https://fonts.gstatic.com/font.ttf", fetcher, signal);
  await expect(
    downloadFont("https://other.example/font.ttf", fetcher, signal),
  ).rejects.toMatchObject({ code: "unsupported" });
  fetcher.mockResolvedValueOnce(new Response("", { status: 404 }));
  await expect(downloadFont("/fonts/x.ttf", fetcher, signal)).rejects.toMatchObject({
    code: "download",
  });
  fetcher.mockResolvedValueOnce(
    new Response("x", { headers: { "content-length": String(MAX_FONT_FILE_BYTES + 1) } }),
  );
  await expect(downloadFont("/fonts/x.ttf", fetcher, signal)).rejects.toMatchObject({
    code: "tooLarge",
  });
});
it("cancels oversized streaming bodies and honors cancellation", async () => {
  const cancelled = vi.fn(),
    stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_FONT_FILE_BYTES + 1));
      },
      cancel: cancelled,
    });
  const fetcher = vi.fn(async () => new Response(stream)),
    controller = new AbortController();
  await expect(downloadFont("/fonts/x.ttf", fetcher, controller.signal)).rejects.toMatchObject({
    code: "tooLarge",
  });
  expect(cancelled).toHaveBeenCalledOnce();
  controller.abort();
  const fresh = vi.fn(async () => new Response(new Uint8Array([1])));
  await expect(downloadFont("/fonts/x.ttf", fresh, controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
});
it("bounds Blob and bodyless response reads", async () => {
  await expect(readFontBlob({ size: MAX_FONT_FILE_BYTES + 1 } as Blob)).rejects.toMatchObject({
    code: "tooLarge",
  });
  expect(
    await readFontBlob({ size: 2, arrayBuffer: async () => new ArrayBuffer(2) } as Blob),
  ).toBeInstanceOf(ArrayBuffer);
  const response = {
    ok: true,
    headers: new Headers(),
    body: null,
    arrayBuffer: vi.fn(async () => new ArrayBuffer(3)),
  };
  const fetcher = vi.fn(async () => response as unknown as Response);
  expect(
    (await downloadFont("/fonts/x.ttf", fetcher, new AbortController().signal)).byteLength,
  ).toBe(3);
  response.arrayBuffer.mockResolvedValueOnce(new ArrayBuffer(MAX_FONT_FILE_BYTES + 1));
  await expect(
    downloadFont("/fonts/x.ttf", fetcher, new AbortController().signal),
  ).rejects.toMatchObject({ code: "tooLarge" });
});
it("cancels only the observing consumer while shared font work may finish", async () => {
  let finish!: (value: number) => void;
  const pending = new Promise<number>((resolve) => {
      finish = resolve;
    }),
    controller = new AbortController();
  const cancelled = abortable(pending, controller.signal),
    other = abortable(pending);
  controller.abort();
  await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
  finish(42);
  expect(await other).toBe(42);
  await expect(
    abortable(Promise.reject(new Error("late")), controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  await expect(
    abortable(Promise.reject(new Error("download failed")), new AbortController().signal),
  ).rejects.toThrow("download failed");
});
