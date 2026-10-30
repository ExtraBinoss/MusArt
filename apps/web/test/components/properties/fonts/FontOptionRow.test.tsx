import { act, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { FONT_CATALOG } from "@musart/assets";
import { FontOptionRow } from "../../../../src/components/properties/fonts/FontOptionRow";
import {
  FontSampleCache,
  type FontSampleState,
} from "../../../../src/components/properties/fonts/sample-cache";
import { bundledFontLibrary } from "../../../../src/components/properties/fonts/library-context";

test("shows a real loading state before a decoded family, and releases the visible sample", () => {
  const cache = new FontSampleCache(bundledFontLibrary),
    release = vi.fn();
  let update: ((state: FontSampleState) => void) | undefined;
  vi.spyOn(cache, "acquire").mockImplementation((_font, _installed, listener) => {
    update = listener;
    return release;
  });
  const view = render(
    <FontOptionRow
      font={FONT_CATALOG[0]!}
      index={0}
      id="font-inter"
      selected
      applied
      active
      count={20}
      installed
      visible
      cache={cache}
      onIntent={vi.fn()}
      onLeave={vi.fn()}
      onFocusFont={vi.fn()}
      onChoose={vi.fn()}
    />,
  );
  const row = screen.getByRole("option", { name: "Inter" });
  expect(row).toHaveAttribute("aria-busy", "true");
  expect(view.container.querySelector('[data-font-preview-state="ready"]')).toBeNull();
  act(() => update?.({ status: "ready", family: "ActualDecodedFamily" }));
  expect(row).toHaveAttribute("aria-busy", "false");
  expect(view.container.querySelector('[data-font-preview-state="ready"] span')).toHaveStyle({
    fontFamily: '"ActualDecodedFamily"',
  });
  expect(row).not.toHaveTextContent("Aa");
  view.unmount();
  expect(release).toHaveBeenCalledOnce();
});
test("a returning visible row resets its retired ready alias before it can paint fallback text", () => {
  const cache = new FontSampleCache(bundledFontLibrary);
  let update: ((state: FontSampleState) => void) | undefined;
  vi.spyOn(cache, "acquire").mockImplementation((_font, _installed, listener) => {
    update = listener;
    listener({ status: "loading" });
    return vi.fn();
  });
  const props = {
    font: FONT_CATALOG[0]!,
    index: 0,
    id: "inter",
    selected: false,
    applied: false,
    active: false,
    count: 20,
    installed: true,
    cache,
    onIntent: vi.fn(),
    onLeave: vi.fn(),
    onFocusFont: vi.fn(),
    onChoose: vi.fn(),
  };
  const view = render(<FontOptionRow {...props} visible />);
  act(() => update?.({ status: "ready", family: "RetiredFace" }));
  view.rerender(<FontOptionRow {...props} visible={false} />);
  expect(view.container.querySelector('[data-font-preview-state="ready"]')).toBeNull();
  view.rerender(<FontOptionRow {...props} visible />);
  expect(view.container.querySelector('[data-font-preview-state="ready"]')).toBeNull();
  expect(view.container.querySelector('[data-font-preview-state="loading"]')).not.toBeNull();
});

test("keyboard selection can preview a row while its checkmark remains exclusive to the applied font", () => {
  const cache = new FontSampleCache(bundledFontLibrary);
  vi.spyOn(cache, "acquire").mockImplementation(() => vi.fn());
  const props = {
    font: FONT_CATALOG[3]!,
    index: 3,
    id: "tinos",
    selected: true,
    active: true,
    count: 20,
    installed: true,
    visible: true,
    cache,
    onIntent: vi.fn(),
    onLeave: vi.fn(),
    onFocusFont: vi.fn(),
    onChoose: vi.fn(),
  };
  const view = render(<FontOptionRow {...props} applied={false} />);
  const row = screen.getByRole("option", { name: "Tinos" });
  expect(row).toHaveAttribute("aria-selected", "true");
  expect(row).toHaveAttribute("data-active", "true");
  expect(row.querySelector("[data-font-applied]")).toBeNull();
  view.rerender(<FontOptionRow {...props} applied />);
  expect(row.querySelector("[data-font-applied]")).not.toBeNull();
});
