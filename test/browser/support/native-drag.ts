import { expect, type Page } from "@playwright/test";
export interface NativeDragSample {
  type: string;
  allowed: string;
  effect: string;
  prevented: boolean;
  payload: string;
}
type ProbeWindow = Window & { __musartDragProbe?: NativeDragSample[] };
/** Observe actual browser DataTransfer after React's root listeners; never synthesize a successful drop. */
export async function installNativeDragProbe(page: Page, mime: string) {
  await page.evaluate((mime) => {
    const root = document.getElementById("root");
    if (!root) throw Error("Missing application root");
    const samples: NativeDragSample[] = [];
    (window as ProbeWindow).__musartDragProbe = samples;
    for (const type of ["dragstart", "dragover", "drop", "dragend"])
      root.addEventListener(type, (event) => {
        const drag = event as DragEvent;
        if (!drag.dataTransfer || samples.length >= 2000) return;
        samples.push({
          type,
          allowed: drag.dataTransfer.effectAllowed,
          effect: drag.dataTransfer.dropEffect,
          prevented: drag.defaultPrevented,
          payload: drag.dataTransfer.getData(mime),
        });
      });
  }, mime);
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
