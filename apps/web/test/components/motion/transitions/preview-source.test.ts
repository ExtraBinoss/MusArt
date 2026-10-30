import { expect, it, vi } from "vitest";
import { createTransitionPreviewSource } from "../../../../src/components/motion/transitions/preview-source";
it("publishes only changed hover styles and releases subscriptions without retaining callbacks", () => {
  const source = createTransitionPreviewSource(),
    changed = vi.fn(),
    stop = source.subscribe(changed);
  expect(source.read()).toBeNull();
  source.set("wipe");
  source.set("wipe");
  expect(source.read()).toBe("wipe");
  expect(changed).toHaveBeenCalledTimes(1);
  source.set("iris");
  source.set(null);
  source.set(null);
  expect(source.read()).toBeNull();
  expect(changed).toHaveBeenCalledTimes(3);
  stop();
  stop();
  source.set("fade");
  expect(changed).toHaveBeenCalledTimes(3);
});
