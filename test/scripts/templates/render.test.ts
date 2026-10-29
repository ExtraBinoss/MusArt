import { expect, test } from "vitest";
import { renderTemplateCovers, validateCoverOptions } from "../../../scripts/templates/render";

const options = {
  url: "http://127.0.0.1:6110",
  inputDirectory: "apps/web/public/templates/motion",
  outputDirectory: "artifacts/motion-template-covers",
  edge: 720,
  time: { value: 12, rate: 5 },
  ids: ["in-bloom"] as const,
};

test("validates exact timestamp, known project identity and bounded native output before starting a browser", async () => {
  expect(() => validateCoverOptions(options)).not.toThrow();
  for (const patch of [
    { url: "file:///etc/passwd" },
    { edge: 0 },
    { edge: 2049 },
    { edge: 1.5 },
    { time: { value: -1, rate: 1 } },
    { time: { value: 1, rate: 0 } },
    { time: { value: 1.1, rate: 1 } },
    { ids: [] },
    { ids: ["in-bloom", "in-bloom"] as const },
  ]) {
    expect(() => validateCoverOptions({ ...options, ...patch })).toThrow();
    await expect(renderTemplateCovers({ ...options, ...patch })).rejects.toThrow();
  }
  await expect(
    renderTemplateCovers({ ...options, inputDirectory: "/definitely-missing-musart-template" }),
  ).rejects.toThrow();
});
