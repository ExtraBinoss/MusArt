import { expect, it } from "vitest";
import { MediaStorageError } from "../../../../src/services/projects/media/errors";
it("retains stable UI codes alongside the real platform diagnostic and cause", () => {
  const native = new DOMException("disk quota", "QuotaExceededError"),
    error = new MediaStorageError("VIDEO_STORAGE_LIMIT", "Binary write rejected", {
      cause: native,
    });
  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe("MediaStorageError");
  expect(error.code).toBe("VIDEO_STORAGE_LIMIT");
  expect(error.message).toBe("Binary write rejected");
  expect(error.cause).toBe(native);
});
