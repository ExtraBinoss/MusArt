import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { EFFECT_CATALOG, getEffectDefinition } from "@musart/core";
import { i18n } from "../../../src/state/i18n";
import { EffectMenu } from "../../../src/components/layers/EffectMenu";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "../../../src/components/ui/dropdown-menu";
import { setup } from "../../support/ui";

test.each(["effect", "adjustment"] as const)(
  "%s submenu follows the displayed alphabet in French and after switching to English",
  async (category) => {
    const d = setup();
    d.mount(
      <DropdownMenu defaultOpen modal={false}>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <EffectMenu onAdd={vi.fn()} />
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const key = category === "effect" ? "addEffect" : "addAdjustment";
    fireEvent.keyDown(screen.getByRole("menuitem", { name: i18n.t(key) }), { key: "ArrowRight" });
    try {
      for (const language of ["fr", "en"]) {
        await act(async () => {
          await i18n.changeLanguage(language);
        });
        const item = await screen.findByRole("menuitem", {
          name: i18n.t(getEffectDefinition(category === "effect" ? "blur" : "brightness").nameKey),
        });
        const labels = within(item.closest('[role="menu"]') as HTMLElement)
          .getAllByRole("menuitem")
          .map((node) => node.textContent!.trim());
        expect(labels).toHaveLength(
          Object.values(EFFECT_CATALOG).filter((e) => e.category === category).length,
        );
        expect(labels).toEqual(
          [...labels].sort((a, b) =>
            a.localeCompare(b, language, { sensitivity: "base", numeric: true }),
          ),
        );
      }
    } finally {
      await act(async () => {
        await i18n.changeLanguage("fr");
      });
    }
  },
);
test("separates clipped effects and adjustments and chooses a registered effect", async () => {
  const d = setup(),
    add = vi.fn();
  d.mount(
    <DropdownMenu defaultOpen modal={false}>
      <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <EffectMenu onAdd={add} />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
  const effects = screen.getByRole("menuitem", { name: "Ajouter un effet" });
  expect(screen.getByRole("menuitem", { name: "Ajouter un réglage" })).toBeVisible();
  fireEvent.keyDown(effects, { key: "ArrowRight" });
  const item = await screen.findByRole("menuitem", { name: "Dither" });
  fireEvent.click(item);
  expect(add).toHaveBeenCalledWith("dither");
});
