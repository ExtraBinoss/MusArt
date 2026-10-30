import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { LandingPage } from "../../../../src/components/projects/landing/LandingPage";
import { setup } from "../../../support/ui";
import { i18n } from "../../../../src/state/i18n";

test("shows the animated headline, real templates and four deliberate video slots", () => {
  const d = setup(),
    create = vi.fn(),
    choose = vi.fn();
  d.mount(<LandingPage onCreate={create} onTemplate={choose} />);
  expect(screen.getByRole("heading", { level: 1, name: "Créez. Animez." })).toBeVisible();
  expect(screen.getAllByText("Aperçu vidéo à venir")).toHaveLength(4);
  expect(document.querySelector("video")).toBeNull();
  expect(document.querySelector(".landing-eyebrow")).toBeNull();
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("button", { name: "Commencer à créer" })[0]!);
  fireEvent.click(screen.getByRole("button", { name: "Try Melt" }));
  expect(create).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Créer depuis AFTERHOURS — Techno" }));
  expect(choose).toHaveBeenCalledExactlyOnceWith("afterhours-techno");
});

test("all landing copy follows the selected interface language", async () => {
  const d = setup();
  d.mount(<LandingPage onCreate={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "Créez. Animez." })).toBeVisible();
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  expect(screen.getByRole("heading", { name: "Create. Animate." })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Make room for your ideas." })).toBeVisible();
});

test("pending template loading disables creation and offers the actual cancellation action", () => {
  const d = setup(),
    cancel = vi.fn();
  d.mount(<LandingPage onCreate={vi.fn()} onTemplate={vi.fn()} busy onCancel={cancel} />);
  const status = screen
    .getByText("Préparation de votre modèle…")
    .closest<HTMLElement>('[role="status"]');
  expect(status).toBeVisible();
  expect(status).toHaveTextContent("Préparation de votre modèle");
  for (const button of screen.getAllByRole("button"))
    if (
      button.textContent === "Commencer à créer" ||
      button.getAttribute("aria-label")?.startsWith("Créer depuis")
    )
      expect(button).toBeDisabled();
  fireEvent.click(within(status!).getByRole("button", { name: "Annuler" }));
  expect(cancel).toHaveBeenCalledOnce();
});
