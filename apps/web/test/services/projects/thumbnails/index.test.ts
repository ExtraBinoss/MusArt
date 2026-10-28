import { expect, it } from "vitest";
import * as ports from "../../../../src/services/projects/thumbnails";
it("exposes the scheduler and canonical revision without importing editor UI", () => {
  expect(Object.keys(ports).sort()).toEqual(
    ["ThumbnailPipeline", "installThumbnailSchedule", "thumbnailRevision"].sort(),
  );
});
