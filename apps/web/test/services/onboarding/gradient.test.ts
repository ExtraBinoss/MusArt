import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { OnboardingGradient } from "../../../src/services/onboarding/gradient";
import type { Composition } from "@musart/core";

let callbacks: Map<number, FrameRequestCallback>, sequence: number, media: MediaQueryList;
let host: HTMLElement;
const canvas = document.createElement("canvas");
const render = vi.fn(
  async (_page: Composition, _assets: {}, _options: { canRender: () => boolean }) => canvas,
);
const dispose = vi.fn(async () => {});
let gradient: OnboardingGradient | undefined;
beforeEach(() => {
  callbacks = new Map();
  sequence = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  media = Object.assign(new EventTarget(), { matches: false }) as unknown as MediaQueryList;
  vi.spyOn(window, "matchMedia").mockReturnValue(media);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  host = document.createElement("div");
  render.mockClear();
  dispose.mockClear();
});
afterEach(async () => {
  await gradient?.dispose();
  gradient = undefined;
  vi.unstubAllGlobals();
});
async function frame(time: number) {
  const current = [...callbacks.values()];
  callbacks.clear();
  for (const callback of current) callback(time);
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

test("uses the authored Gradient effect in one bounded session and updates time without editor state", async () => {
  const factory = vi.fn(async () => ({ render, dispose }));
  gradient = new OnboardingGradient(host, factory);
  await frame(100);
  expect(factory).toHaveBeenCalledOnce();
  const initial = render.mock.calls[0]![0];
  expect(initial.layers[0]!.effects[0]).toMatchObject({
    type: "gradient",
    time: 3,
    settings: { preset: "daydream", treatment: "none" },
  });
  expect(initial.width * initial.height).toBeLessThan(250000);
  expect(host.firstChild).toBe(canvas);
  await frame(120);
  expect(render).toHaveBeenCalledTimes(1);
  await frame(155);
  expect(render.mock.calls[1]![0].layers[0]!.effects[0]!.time).toBeGreaterThan(3);
  gradient.setPalette("aurora");
  await frame(170);
  expect(render.mock.calls.at(-1)![0].layers[0]!.effects[0]!.settings?.preset).toBe("aurora");
  await gradient.dispose();
  expect(dispose).toHaveBeenCalledOnce();
  expect(host.childNodes).toHaveLength(0);
  expect(callbacks.size).toBe(0);
});

test("reduced motion and pause keep a still frame; palette changes still work", async () => {
  Object.assign(media, { matches: true });
  gradient = new OnboardingGradient(host, async () => ({ render, dispose }));
  await frame(100);
  expect(callbacks.size).toBe(0);
  gradient.setPalette("ultraviolet");
  await frame(200);
  expect(render).toHaveBeenCalledTimes(2);
  expect(callbacks.size).toBe(0);
  Object.assign(media, { matches: false });
  media.dispatchEvent(new Event("change"));
  await frame(300);
  expect(callbacks.size).toBe(1);
  gradient.setPaused(true);
  expect(callbacks.size).toBe(0);
  gradient.setPaused(false);
  expect(callbacks.size).toBe(1);
});

test("hidden documents suspend frames and a late renderer cannot attach after disposal", async () => {
  let finish!: (value: { render: typeof render; dispose: typeof dispose }) => void;
  const factory = () =>
    new Promise<{ render: typeof render; dispose: typeof dispose }>((resolve) => {
      finish = resolve;
    });
  gradient = new OnboardingGradient(host, factory);
  await frame(100);
  const closing = gradient.dispose();
  finish({ render, dispose });
  await closing;
  await frame(200);
  expect(render).not.toHaveBeenCalled();
  expect(host.childNodes).toHaveLength(0);
  expect(dispose).toHaveBeenCalledOnce();
  expect(callbacks.size).toBe(0);
});

test("visibility stops pending work and failures never report a rendered preview", async () => {
  gradient = new OnboardingGradient(host, async () => ({ render, dispose }));
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(callbacks.size).toBe(0);
  hidden.mockReturnValue(false);
  render.mockRejectedValueOnce(new Error("GPU unavailable"));
  document.dispatchEvent(new Event("visibilitychange"));
  await frame(100);
  expect(host.dataset.gradientState).toBe("unavailable");
  expect(host.childNodes).toHaveLength(0);
  expect(callbacks.size).toBe(0);
});
