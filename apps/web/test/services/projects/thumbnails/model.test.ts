import { expect, it } from "vitest";
import {
  THUMBNAIL_EDGE,
  THUMBNAIL_QUALITY,
  MAX_THUMBNAIL_BYTES,
} from "../../../../src/services/projects/thumbnails/model";
it("bounds retina WebP previews independently from original image storage", () => {
  expect([THUMBNAIL_EDGE, THUMBNAIL_QUALITY, MAX_THUMBNAIL_BYTES]).toEqual([768, 0.88, 1048576]);
});
