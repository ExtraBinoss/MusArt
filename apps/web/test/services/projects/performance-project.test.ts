import { validateProject } from "@musart/core";
import { vi } from "vitest";
import {
  createPerformanceProject,
  loadFixtureImage,
} from "../../../src/services/projects/performance-project";
it("creates a fixed 50-image scene with 100 layer effects, groups and masks", async () => {
  const loader = vi.fn(async (_path: string) => "data:image/jpeg;base64,YQ==");
  const project = await createPerformanceProject(50, loader);
  validateProject(project);
  expect(loader).toHaveBeenCalledTimes(50);
  expect(loader.mock.calls.every(([path]) => path.startsWith("/benchmark/"))).toBe(true);
  const layers = project.pages[0]!.layers,
    images = layers.filter((layer) => layer.kind === "image");
  expect(images).toHaveLength(50);
  expect(images.flatMap((layer) => layer.effects)).toHaveLength(100);
  expect(images.filter((layer) => layer.mask)).toHaveLength(10);
  expect(layers.filter((layer) => layer.kind === "group")).toHaveLength(5);
  expect(images[0]!.blendMode).toBe("multiply");
  expect(images[1]!.opacity).toBe(1);
  expect(Object.keys(project.assets)).toHaveLength(51);
});
it("supports smaller deterministic probes and rejects invalid counts or missing photos atomically", async () => {
  const loader = async () => "data:image/jpeg;base64,YQ==";
  expect(
    (await createPerformanceProject(1, loader)).pages[0]!.layers.filter(
      (layer) => layer.kind === "image",
    ),
  ).toHaveLength(1);
  for (const value of [0, 51, NaN, 1.5])
    await expect(createPerformanceProject(value, loader)).rejects.toThrow("1 à 50");
  await expect(
    createPerformanceProject(2, async () => {
      throw new Error("Missing");
    }),
  ).rejects.toThrow("Missing");
});
it("loads local fixture bytes and reports HTTP failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["local"], { type: "image/jpeg" }),
    }),
  );
  expect(await loadFixtureImage("/benchmark/photo.jpg")).toMatch(/^data:image\/jpeg;base64,/);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  await expect(loadFixtureImage("/benchmark/missing.jpg")).rejects.toThrow("indisponible");
  vi.unstubAllGlobals();
});
