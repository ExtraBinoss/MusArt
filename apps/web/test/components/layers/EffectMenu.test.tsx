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

test("vertical category hover bypasses stale diagonal grace and keeps submenus outside the clipped parent", async () => {
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
  const adjustments = screen.getByRole("menuitem", { name: "Ajouter un réglage" });
  const parent = effects.closest('[role="menu"]')!;
  fireEvent.keyDown(effects, { key: "ArrowRight" });
  const item = await screen.findByRole("menuitem", { name: "Dither" });
  const submenu = item.closest<HTMLElement>('[role="menu"]')!;
  expect(parent.contains(submenu)).toBe(false);
  submenu.dataset.side = "right";
  vi.spyOn(submenu, "getBoundingClientRect").mockReturnValue({
    left: 200,
    right: 380,
    top: 90,
    bottom: 540,
    width: 180,
    height: 450,
  } as DOMRect);
  function pointer(node: HTMLElement, type: string, relatedTarget: HTMLElement | null, y: number) {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: 110,
      clientY: y,
      buttons: 0,
      relatedTarget,
    });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    fireEvent(node, event);
  }
  pointer(effects, "pointermove", null, 108);
  pointer(effects, "pointerout", adjustments, 115);
  pointer(adjustments, "pointerover", effects, 118);
  pointer(adjustments, "pointermove", effects, 118);
  expect(adjustments).toHaveAttribute("aria-expanded", "true");
  expect(adjustments).toHaveAttribute("data-highlighted");
  expect(effects).toHaveAttribute("aria-expanded", "false");
  const brightness = await screen.findByRole("menuitem", {
    name: i18n.t(getEffectDefinition("brightness").nameKey),
  });
  fireEvent.click(brightness);
  expect(add).toHaveBeenCalledExactlyOnceWith("brightness");
});
