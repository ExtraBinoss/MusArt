import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FONT_CATALOG } from "@musart/assets";
import {
  bundledFontLibrary,
  FontLibraryProvider,
  useFontLibrary,
} from "../../../../src/components/properties/fonts/library-context";

test("provides the platform library while standalone controls keep real bundled faces", async () => {
  function Probe() {
    return <span>{useFontLibrary() === bundledFontLibrary ? "bundled" : "platform"}</span>;
  }
  const view = render(<Probe />);
  expect(screen.getByText("bundled")).toBeVisible();
  view.rerender(
    <FontLibraryProvider library={{ ...bundledFontLibrary }}>
      <Probe />
    </FontLibraryProvider>,
  );
  expect(screen.getByText("platform")).toBeVisible();
  expect(await bundledFontLibrary.catalog()).toBe(FONT_CATALOG);
  expect(await bundledFontLibrary.installed()).toBe(FONT_CATALOG);
  expect(await bundledFontLibrary.install(FONT_CATALOG[0]!)).toBe(FONT_CATALOG[0]);
  await expect(
    bundledFontLibrary.install({ id: "foreign", family: "Foreign", category: "sans" }),
  ).rejects.toThrow("platform library");
  await expect(bundledFontLibrary.importFile(new File([], "font.ttf"))).rejects.toThrow(
    "platform library",
  );
  expect(bundledFontLibrary.supportsLocalFonts).toBe(false);
  expect(await bundledFontLibrary.discoverLocal()).toEqual([]);
  bundledFontLibrary.subscribe(vi.fn())();
  bundledFontLibrary.dispose();
});

test("resolves bundled source bytes honestly and propagates failed requests", async () => {
  const bytes = new Uint8Array([0, 1, 2, 3]),
    fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(bytes))
      .mockResolvedValueOnce(new Response("", { status: 404 })),
    controller = new AbortController();
  expect(
    new Uint8Array(await bundledFontLibrary.resolve("Georgia", 700, controller.signal)),
  ).toEqual(bytes);
  expect(fetch).toHaveBeenCalledWith("/fonts/tinos/bold.ttf", { signal: controller.signal });
  await expect(bundledFontLibrary.resolve("Inter", 400)).rejects.toThrow("could not be loaded");
});
