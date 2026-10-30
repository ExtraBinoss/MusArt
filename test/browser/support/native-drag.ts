import { expect, type Page } from "@playwright/test";
export interface NativeDragSample {
  type: string;
  allowed: string;
  effect: string;
  prevented: boolean;
  payload: string;
}
type ProbeWindow = Window & { __musartDragProbe?: NativeDragSample[] };
/** Observe real DataTransfer after handlers, including a surface that owns propagation. */
export async function installNativeDragProbe(page: Page, mime: string, extraSurface?: string) {
  await page.evaluate(
    ({ mime, extraSurface }) => {
      const root = document.getElementById("root");
      if (!root) throw Error("Missing application root");
      const extra = extraSurface ? [...document.querySelectorAll(extraSurface)] : [];
      if (extraSurface && extra.length === 0)
        throw Error(`Missing native drag surface ${extraSurface}`);
      const samples: NativeDragSample[] = [];
      const seen = new WeakSet<Event>();
      (window as ProbeWindow).__musartDragProbe = samples;
      for (const node of new Set([root, ...extra]))
        for (const type of ["dragstart", "dragover", "drop", "dragend"])
          node.addEventListener(type, (event) => {
            const drag = event as DragEvent;
            if (seen.has(event) || !drag.dataTransfer || samples.length >= 2000) return;
            seen.add(event);
            const transfer = drag.dataTransfer;
            const sample = {
              type,
              allowed: transfer.effectAllowed,
              effect: transfer.dropEffect,
              prevented: drag.defaultPrevented,
              payload: transfer.getData(mime),
            };
            samples.push(sample);
            if (node !== root) {
              // Native owners can rebind during a drag. Read payload while the store is readable;
              // finish flags after all handlers, regardless of this listener's registration order.
              requestAnimationFrame(() => {
                sample.allowed = transfer.effectAllowed;
                sample.effect = transfer.dropEffect;
                sample.prevented = drag.defaultPrevented;
              });
            }
          });
    },
    { mime, extraSurface },
  );
}
export async function assertNativeMove(page: Page, payload: string) {
  const samples = await page.evaluate(() => (window as ProbeWindow).__musartDragProbe ?? []);
  expect(
    samples.some(
      (sample) =>
        sample.type === "dragover" &&
        sample.prevented &&
        sample.allowed === "move" &&
        sample.effect === "move" &&
        sample.payload === "",
    ),
  ).toBe(true);
  expect(
    samples.filter((sample) => sample.type === "drop" && sample.payload === payload),
  ).toHaveLength(1);
  expect(samples.some((sample) => sample.type === "dragend" && sample.effect === "move")).toBe(
    true,
  );
  return samples;
}
