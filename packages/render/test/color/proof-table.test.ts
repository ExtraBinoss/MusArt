import { afterEach, beforeEach, expect, it, vi } from "vitest";
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

it("loads one shared immutable-size table lazily across simultaneous renderer requests", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { loadPrintProof, PRINT_PROOF_BYTES } = await import("../../src/color/proof/table");
  expect(fetch).not.toHaveBeenCalled();
  const data = new Uint8Array(PRINT_PROOF_BYTES);
  fetch.mockResolvedValue({ ok: true, arrayBuffer: async () => data.buffer });
  const first = loadPrintProof(),
    second = loadPrintProof();
  expect(second).toBe(first);
  expect((await first).buffer).toBe(data.buffer);
  expect(await loadPrintProof()).toBe(await first);
  expect(fetch).toHaveBeenCalledOnce();
});

it("rejects missing/truncated color tables and allows a later explicit retry", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const { loadPrintProof, PRINT_PROOF_BYTES } = await import("../../src/color/proof/table");
  fetch.mockResolvedValueOnce({ ok: false });
  await expect(loadPrintProof()).rejects.toThrow("could not be loaded");
  fetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
  await expect(loadPrintProof()).rejects.toThrow("Invalid print color table");
  fetch.mockResolvedValueOnce({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(PRINT_PROOF_BYTES),
  });
  expect((await loadPrintProof()).byteLength).toBe(PRINT_PROOF_BYTES);
  expect(fetch).toHaveBeenCalledTimes(3);
});
