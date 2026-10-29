import { expect, it } from "vitest";
import { MotionExportError } from "../../../src/export/motion/errors";
it("preserves actionable failure codes, explanation and original causes", () => {
  const cause = new Error("Native encoder refused the format");
  const error = new MotionExportError("noVideoCodec", "No supported encoder", { cause });
  expect(error).toBeInstanceOf(Error);
  expect(error).toMatchObject({
    name: "MotionExportError",
    code: "noVideoCodec",
    cause,
    message: "No supported encoder",
  });
});
