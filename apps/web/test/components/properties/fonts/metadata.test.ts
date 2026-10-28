import { expect, test, vi } from "vitest";
import { FONT_CATALOG } from "@musart/assets";
import { bundledFontLibrary } from "../../../../src/components/properties/fonts/library-context";
import {
  invalidateFontMetadata,
  loadFontMetadata,
  peekFontMetadata,
} from "../../../../src/components/properties/fonts/metadata";
test("installed names are deduplicated without fetching font files, and explicit invalidation refreshes them", async () => {
  const installed = vi.fn().mockResolvedValue(FONT_CATALOG),
    resolve = vi.fn(),
    library = { ...bundledFontLibrary, installed, resolve };
  expect(peekFontMetadata(library)).toBeUndefined();
  const first = loadFontMetadata(library),
    second = loadFontMetadata(library);
  expect(first).toBe(second);
  expect(await first).toBe(FONT_CATALOG);
  expect(installed).toHaveBeenCalledOnce();
  expect(peekFontMetadata(library)).toBe(FONT_CATALOG);
  expect(await loadFontMetadata(library)).toBe(FONT_CATALOG);
  expect(installed).toHaveBeenCalledOnce();
  expect(resolve).not.toHaveBeenCalled();
  invalidateFontMetadata(library);
  await loadFontMetadata(library);
  expect(installed).toHaveBeenCalledTimes(2);
});
test("late invalidated results cannot repopulate the cache and failures remain retryable", async () => {
  let complete!: (fonts: typeof FONT_CATALOG) => void;
  const installed = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<typeof FONT_CATALOG>((resolve) => {
            complete = resolve;
          }),
      )
      .mockRejectedValueOnce(Error("database closed"))
      .mockResolvedValue(FONT_CATALOG),
    library = { ...bundledFontLibrary, installed };
  const old = loadFontMetadata(library);
  await Promise.resolve();
  invalidateFontMetadata(library);
  complete(FONT_CATALOG);
  await old;
  expect(peekFontMetadata(library)).toBeUndefined();
  await expect(loadFontMetadata(library)).rejects.toThrow("database closed");
  expect(peekFontMetadata(library)).toBeUndefined();
  expect(await loadFontMetadata(library)).toBe(FONT_CATALOG);
  expect(installed).toHaveBeenCalledTimes(3);
});
