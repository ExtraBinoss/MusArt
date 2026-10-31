import { afterEach, expect, it, vi } from "vitest";
import { RenderTarget, Texture, type Mesh } from "three/webgpu";
import { createPage, createProject, EditorEngine } from "@musart/core";
import { PrintProofPass } from "../../src/color/proof/PrintProofPass";
import { PRINT_PROOF_BYTES } from "../../src/color/proof/table";
import { GpuCompositor } from "../../src/compositing/GpuCompositor";
import { estimatePreviewCost } from "../../src/compositing/preview-cost";
import { makeGpuRenderer } from "../gpu-fixture";

const table = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../../src/color/proof/table", () => ({
  PRINT_PROOF_SIZE: 86,
  PRINT_PROOF_BYTES: 86 ** 3 * 4,
  loadPrintProof: table.load,
}));
afterEach(() => vi.restoreAllMocks());

it("prepares once, restores renderer state on errors and disposes its accounted GPU resources", async () => {
  const { renderer, fake } = makeGpuRenderer();
  table.load.mockResolvedValue(new Uint8Array(PRINT_PROOF_BYTES));
  const proof = new PrintProofPass(renderer),
    old = new RenderTarget(2, 2),
    target = new RenderTarget(8, 8),
    source = { texture: new Texture(), width: 8, height: 8, premultiplied: true };
  fake.setRenderTarget(old);
  await proof.prepare(target);
  const compileCount = fake.compileAsync.mock.calls.length;
  await proof.prepare(target);
  expect(fake.compileAsync).toHaveBeenCalledTimes(compileCount);
  expect(proof.bytes).toBe(PRINT_PROOF_BYTES);
  expect(proof.targets).toBe(0);
  proof.render(source, target);
  const mesh = fake.render.mock.calls[0]![0].children[0] as Mesh;
  const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
  const dispose = vi.spyOn(material, "dispose");
  fake.render.mockImplementationOnce(() => {
    throw new Error("GPU lost");
  });
  expect(() => proof.render(source, target)).toThrow("GPU lost");
  expect(fake.getRenderTarget()).toBe(old);
  expect(renderer.autoClear).toBe(true);
  proof.dispose();
  proof.dispose();
  expect(dispose).toHaveBeenCalledOnce();
  expect(() => proof.render(source, target)).toThrow("not ready");
  source.texture.dispose();
  target.dispose();
  old.dispose();
});

it("rejects failed or superseded table loads instead of publishing an RGB fallback", async () => {
  const { renderer, fake } = makeGpuRenderer(),
    target = new RenderTarget(1, 1);
  const failed = new PrintProofPass(renderer);
  table.load.mockRejectedValueOnce(new Error("offline"));
  await expect(failed.prepare(target)).rejects.toThrow("offline");
  table.load.mockResolvedValueOnce(new Uint8Array(PRINT_PROOF_BYTES));
  await expect(failed.prepare(target, () => false)).rejects.toMatchObject({ name: "AbortError" });
  expect(fake.compileAsync).not.toHaveBeenCalled();
  failed.dispose();
  target.dispose();
});

it("keeps source and ICC display frames distinct, retains unchanged frames and releases the LUT budget", async () => {
  table.load.mockResolvedValue(new Uint8Array(PRINT_PROOF_BYTES));
  const { renderer } = makeGpuRenderer(),
    graph = new GpuCompositor(renderer);
  const project = new EditorEngine(
    createProject({
      pages: [createPage({ width: 32, height: 32, colorSpace: "cmyk", background: "#ff0000" })],
    }),
  ).getSnapshot().project;
  const page = project.pages[0]!;
  const source = await graph.render(page, project.assets, { colorOutput: "source" });
  const sourceBytes = graph.stats().cacheBytes;
  const display = await graph.render(page, project.assets);
  expect(display.texture).not.toBe(source.texture);
  expect(graph.stats().cacheBytes).toBeGreaterThanOrEqual(sourceBytes + PRINT_PROOF_BYTES);
  expect(graph.retainedFrame(page, project.assets, 1)).toBe(display);
  expect(graph.retainedFrame(page, project.assets, 1, undefined, "source")).toBe(source);
  const passes = graph.stats().passes;
  expect(await graph.render(page, project.assets)).toBe(display);
  expect(graph.stats().passes).toBe(passes);
  expect(await graph.render(page, project.assets, { colorOutput: "source" })).toBe(source);
  expect(graph.stats().passes).toBe(passes);
  const rgb = { ...page, colorSpace: "srgb" as const };
  expect(estimatePreviewCost(page, 1).bytes - estimatePreviewCost(rgb, 1).bytes).toBe(
    PRINT_PROOF_BYTES,
  );
  await graph.dispose();
  expect(graph.stats()).toMatchObject({ cacheBytes: 0, targets: 0, readbacks: 0 });
});
