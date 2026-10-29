import { expect, test } from "vitest";
import { VideoSourceError, videoSourceFailure } from "../../../src/sources/video/errors";

test("keeps domain failures and exposes actual decoder causes", () => {
  const cause = new Error("native decode failed");
  const failure = videoSourceFailure(cause);
  expect(failure).toBeInstanceOf(VideoSourceError);
  expect(failure.code).toBe("decodeFailed");
  expect(failure.cause).toBe(cause);
  expect(failure.name).toBe("VideoSourceError");
  expect(videoSourceFailure(failure)).toBe(failure);
});
