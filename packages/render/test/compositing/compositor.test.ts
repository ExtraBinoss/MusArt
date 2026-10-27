import { afterEach, expect, it, vi } from "vitest";
import { createPage } from "@musart/core";
import { clearRenderCaches, renderComposition } from "../../src/compositing/compositor";
const exports = vi.hoisted(() => ({ snapshot: vi.fn(), dispose: vi.fn() }));
vi.mock("../../src/export/standalone", () => ({
  snapshotComposition: exports.snapshot,
  disposeExportRenderers: exports.dispose,
}));
afterEach(() => {
  vi.restoreAllMocks();
  exports.snapshot.mockReset();
  exports.dispose.mockReset();
});
it("delegates export snapshots to the GPU encoder and releases owned caches", async () => {
  const canvas = document.createElement("canvas");
  exports.snapshot.mockResolvedValue(canvas);
  const page = createPage();
  expect(await renderComposition(page, {})).toBe(canvas);
  expect(exports.snapshot).toHaveBeenCalledWith(page, {}, {});
  await renderComposition(page, {}, { scale: 2, forceWebGL: true });
  expect(exports.snapshot).toHaveBeenLastCalledWith(page, {}, { scale: 2, forceWebGL: true });
  await clearRenderCaches();
  expect(exports.dispose).toHaveBeenCalledOnce();
  await expect(renderComposition(page, {}, { scale: 0 })).rejects.toThrow("Échelle");
});
