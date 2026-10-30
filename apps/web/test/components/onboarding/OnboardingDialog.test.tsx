import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { setup } from "../../support/ui";
import { OnboardingDialog } from "../../../src/components/onboarding/OnboardingDialog";
import { ONBOARDING_STORAGE_KEY } from "../../../src/state/onboarding/preferences";

vi.mock("../../../src/components/onboarding/GradientArtwork", () => ({
  GradientArtwork: ({ palette, paused }: { palette: string; paused: boolean }) => (
    <div data-testid="gradient" data-palette={palette} data-paused={paused} />
  ),
}));
beforeEach(() => localStorage.removeItem(ONBOARDING_STORAGE_KEY));

test("requires all welcome steps and records completion only on the final action", async () => {
  const d = setup(),
    done = vi.fn();
  d.mount(<OnboardingDialog onComplete={done} />);
  const dialog = screen.getByRole("dialog", { name: "Bienvenue dans Melt" });
  expect(screen.queryByRole("button", { name: "Fermer" })).toBeNull();
  fireEvent.keyDown(dialog, { key: "Escape" });
  const overlay = document.querySelector('[data-slot="dialog-overlay"]')!;
  fireEvent.pointerDown(overlay, { pointerId: 1, button: 0 });
  expect(dialog).toBeVisible();
  expect(done).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Faire un petit tour" })).toHaveFocus();
  expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Faire un petit tour" }));
  expect(screen.getByRole("heading", { name: /Jouez avec les calques/ })).toHaveFocus();
  await waitFor(() => expect(screen.getByText(/Magic Search retrouve/)).toBeVisible());
  fireEvent.click(screen.getByRole("button", { name: "Retour" }));
  expect(screen.getByText("Étape 1 sur 3")).toBeVisible();
  expect(screen.getByRole("heading", { name: /Une petite idée/ })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Faire un petit tour" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
  await waitFor(() => expect(screen.getByText(/Effacer les données/)).toBeVisible());
  expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir mon atelier" }));
  expect(done).toHaveBeenCalledOnce();
  expect(JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY)!)).toEqual({
    version: 1,
    completed: true,
  });
});

test("lets users try palettes, pause the decoration and choose their language", async () => {
  const d = setup();
  d.mount(<OnboardingDialog onComplete={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "Palette Aurora" }));
  expect(screen.getByTestId("gradient")).toHaveAttribute("data-palette", "aurora");
  expect(screen.getByRole("button", { name: "Palette Aurora" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Mettre le dégradé en pause" }));
  expect(screen.getByTestId("gradient")).toHaveAttribute("data-paused", "true");
  fireEvent.click(screen.getByRole("button", { name: "Animer le dégradé" }));
  expect(screen.getByTestId("gradient")).toHaveAttribute("data-paused", "false");
  fireEvent.click(screen.getByRole("button", { name: "Passer en anglais" }));
  await screen.findByRole("dialog", { name: "Welcome to Melt" });
  expect(screen.getByRole("button", { name: "Show me around" })).toBeVisible();
  expect(localStorage.getItem("musart.language")).toBe("en");
  expect(document.documentElement.lang).toBe("en");
});

test("a blocked completion write stays visible and allows an explicit session-only continuation", async () => {
  const d = setup(),
    done = vi.fn();
  d.mount(<OnboardingDialog onComplete={done} />);
  fireEvent.click(screen.getByRole("button", { name: "Faire un petit tour" }));
  fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Quota");
  });
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir mon atelier" }));
  expect(screen.getByRole("status")).toHaveTextContent("n’a pas pu mémoriser");
  expect(done).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Continuer pour cette visite" }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(localStorage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
});
