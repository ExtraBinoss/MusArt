import { expect, test, vi } from "vitest";
import {
  animatePresentationProgress,
  presentationSpring,
} from "../../../../src/components/shared/motion/presentation-spring";

const animate = vi.hoisted(() =>
  vi.fn<
    (
      from: number,
      to: number,
      options: { onUpdate: (value: number) => void },
    ) => Promise<void> & { stop(): void }
  >(),
);
vi.mock("motion/react", () => ({ animate }));

test("uses a critically damped numeric spring and exposes completion and explicit cleanup", async () => {
  const stop = vi.fn(),
    update = vi.fn();
  const playback = Object.assign(Promise.resolve(), { stop });
  animate.mockReturnValue(playback);
  const driver = animatePresentationProgress(update);
  const [from, to, options] = animate.mock.calls[0]!;
  expect([from, to]).toEqual([0, 1]);
  expect(
    presentationSpring.damping ** 2 / (4 * presentationSpring.mass * presentationSpring.stiffness),
  ).toBeCloseTo(1, 4);
  options.onUpdate(0.4);
  expect(update).toHaveBeenCalledExactlyOnceWith(0.4);
  await expect(driver.finished).resolves.toBeUndefined();
  driver.stop();
  expect(stop).toHaveBeenCalledOnce();
});
