import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { GuidePresets } from "../../../../src/components/properties/guides/GuidePresets";
import { setup } from "../../../support/ui";
import { SOCIAL_PRESETS } from "@musart/core";
import { i18n } from "../../../../src/state/i18n";

const catalogue = vi.hoisted(() => ({ reads: vi.fn() }));
vi.mock("@musart/core", async (original) => {
  const core = await original<typeof import("@musart/core")>();
  return {
    ...core,
    SOCIAL_PRESETS: new Proxy(core.SOCIAL_PRESETS, {
      get(target, key, receiver) {
        if (key === "filter") catalogue.reads();
        return Reflect.get(target, key, receiver);
      },
    }),
  };
});

test("closed and rebound preset triggers do not enumerate or translate the hidden catalogue", () => {
  const d = setup(),
    append = vi.fn();
  const keys = new Set(SOCIAL_PRESETS.map((preset) => preset.nameKey));
  const translate = vi.spyOn(i18n, "t");
  catalogue.reads.mockClear();
  const view = d.mount(<GuidePresets bounds={{ width: 500, height: 500 }} onAppend={append} />);
  view.rerender(<GuidePresets bounds={{ width: 800, height: 600 }} onAppend={append} />);
  expect(catalogue.reads).not.toHaveBeenCalled();
  expect(translate.mock.calls.some(([key]) => keys.has(String(key)))).toBe(false);
  expect(document.querySelector(".guide-presets-grid")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Modèles" }));
  expect(catalogue.reads).toHaveBeenCalled();
  expect(translate.mock.calls.some(([key]) => keys.has(String(key)))).toBe(true);
  expect(document.querySelectorAll("[data-guide-preset]")).toHaveLength(SOCIAL_PRESETS.length);
});
test("real brand previews filter by category and return the genuine catalogue entry on append", () => {
  const d = setup(),
    append = vi.fn();
  d.mount(<GuidePresets bounds={{ width: 1080, height: 1350 }} onAppend={append} />);
  fireEvent.click(screen.getByRole("button", { name: "Modèles" }));
  expect(document.querySelectorAll("[data-guide-preset]")).toHaveLength(8);
  expect(
    screen.getByRole("button", { name: "Ajouter les repères Publication Instagram" }),
  ).toBeVisible();
  expect(screen.getByRole("tablist", { name: "Catégorie de format" })).toHaveClass(
    "segmented-tabs",
  );
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Vidéo" }), { button: 0, ctrlKey: false });
  expect(screen.getByRole("tab", { name: "Vidéo" })).toHaveAttribute("aria-selected", "true");
  expect(document.querySelectorAll("[data-guide-preset]")).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Ajouter les repères Vidéo TikTok" }));
  expect(append).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ id: "tiktok-video", width: 1080, height: 1920 }),
  );
  expect(screen.queryByText("Modèles de repères")).not.toBeInTheDocument();
});
test("a locked target cannot open the preset picker", () => {
  const d = setup(),
    append = vi.fn();
  d.mount(<GuidePresets disabled bounds={{ width: 500, height: 500 }} onAppend={append} />);
  fireEvent.click(screen.getByRole("button", { name: "Modèles" }));
  expect(screen.getByRole("button", { name: "Modèles" })).toBeDisabled();
  expect(append).not.toHaveBeenCalled();
});
