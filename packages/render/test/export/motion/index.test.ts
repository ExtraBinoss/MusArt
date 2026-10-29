import { expect, it } from "vitest";
import { createPage, createProject } from "@musart/core";
import {
  exportMotionVideo,
  MotionExportError,
  openMotionAudioSource,
} from "../../../src/export/motion/index";

it("exposes a headless API that rejects a static composition before acquiring native media resources", async () => {
  await expect(
    exportMotionVideo(createProject({ pages: [createPage({ id: "static" })] }), {
      compositionId: "static",
    }),
  ).rejects.toBeInstanceOf(MotionExportError);
  expect(typeof openMotionAudioSource).toBe("function");
});
