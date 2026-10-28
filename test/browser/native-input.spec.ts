import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { measureNativeInputControl } from "./support/native-input";

test("native wheel control separates transport and browser dispatch from retained DOM presentation", async ({
  page,
}) => {
  const result = await measureNativeInputControl(page);
  await mkdir("artifacts", { recursive: true });
  await writeFile("artifacts/native-input-control.json", JSON.stringify(result, null, 2));
  expect(result.inputs).toBeGreaterThan(20);
  expect(result.frames.length).toBeGreaterThan(10);
  expect(new Set(result.frames.map((frame) => `${frame.x}:${frame.y}`)).size).toBeGreaterThan(10);
  expect(result.frames.at(-1)).toMatchObject({ x: 0, y: 0 });
  for (const frame of result.frames) {
    expect(frame.generatedAt).toBeLessThanOrEqual(frame.deliveredAt);
    expect(frame.deliveredAt).toBeLessThanOrEqual(frame.rafAt);
    expect(frame.rafAt).toBeLessThanOrEqual(frame.presentedAt!);
  }
});
