import { expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateBankShapes, writeBankShapes } from "../../../scripts/audio/bank";
import { SFX_BANK } from "../../../apps/web/src/services/motion/audio/sfx";
it("reproducibly precomputes all15 genuine WAV envelopes before the bank is displayed", async () => {
  const data = generateBankShapes();
  expect(data.shapes.map((shape) => shape.id)).toEqual(SFX_BANK.map((preset) => preset.id));
  expect(data.shapes.every((shape) => shape.peaks.length === 256)).toBe(true);
  expect(generateBankShapes()).toEqual(data);
  const directory = await mkdtemp(join(tmpdir(), "musart-bank-"));
  try {
    const path = join(directory, "bank.json");
    await writeBankShapes(path);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(data);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  const checked = JSON.parse(
    await readFile("apps/web/src/services/motion/audio/bank/shapes.json", "utf8"),
  );
  expect(checked).toEqual(data);
});
