import { expect, it } from "vitest";
import { OrthographicCamera, RenderTarget, Scene } from "three/webgpu";
import { compileGpuScene } from "../../src/compositing/compile";
import { makeGpuRenderer } from "../gpu-fixture";
import { deferred } from "../sources/video/fixtures";

it("restores render state before awaiting compilation and never draws", async () => {
  const { renderer, fake } = makeGpuRenderer(),
    target = new RenderTarget(1, 1);
  const pending = deferred<void>();
  fake.compileAsync.mockReturnValueOnce(pending.promise);
  const preparing = compileGpuScene(renderer, new Scene(), new OrthographicCamera(), target);
  expect(fake.getRenderTarget()).toBeNull();
  expect(fake.render).not.toHaveBeenCalled();
  pending.resolve();
  await preparing;
  target.dispose();
});
it("rejects stale preparation before and after asynchronous work without leaking render state", async () => {
  const { renderer, fake } = makeGpuRenderer(),
    target = new RenderTarget(1, 1);
  await expect(
    compileGpuScene(renderer, new Scene(), new OrthographicCamera(), target, () => false),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fake.compileAsync).not.toHaveBeenCalled();
  let current = true;
  fake.compileAsync.mockImplementationOnce(async () => {
    current = false;
  });
  await expect(
    compileGpuScene(renderer, new Scene(), new OrthographicCamera(), target, () => current),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fake.getRenderTarget()).toBeNull();
  target.dispose();
});
