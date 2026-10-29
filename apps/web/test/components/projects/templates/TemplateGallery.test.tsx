import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { TemplateGallery } from "../../../../src/components/projects/templates/TemplateGallery";
import { setup } from "../../../support/ui";
import { choose } from "../../../support/select";
test("exposes the rendered techno card and searchable canonical branded formats", () => {
  const onChoose = vi.fn();
  const data = setup();
  data.mount(<TemplateGallery onChoose={onChoose} />);
  fireEvent.click(screen.getByRole("button", { name: "Créer depuis AFTERHOURS — Techno" }));
  expect(onChoose).toHaveBeenLastCalledWith("afterhours-techno");
  expect(document.querySelector('img[src="/templates/afterhours.webp"]')).not.toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "TikTok" } });
  expect(screen.getAllByRole("button")).toHaveLength(1);
  const tiktok = screen.getByRole("button", { name: /TikTok/ });
  expect(tiktok.querySelector("svg")).not.toBeNull();
  expect(tiktok).toHaveTextContent("1080 × 1920 px");
  fireEvent.click(tiktok);
  expect(onChoose).toHaveBeenLastCalledWith("preset:tiktok-video");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "not a known template" } });
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText("Aucun modèle correspondant.")).toBeVisible();
});
test("disables every creation action during a pending transaction", () => {
  setup().mount(<TemplateGallery onChoose={vi.fn()} busy />);
  for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "Mode du modèle" })).toBeDisabled();
  expect(screen.getByRole("searchbox")).toBeDisabled();
});
test("shows honest preparation state and keeps explicit download cancellation usable", () => {
  const cancel = vi.fn();
  setup().mount(<TemplateGallery onChoose={vi.fn()} busy onCancel={cancel} />);
  expect(screen.getByRole("status")).toHaveTextContent("Préparation du modèle");
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: /In Bloom/ })).toBeDisabled();
});
test("filters real Motion projects independently from blank formats and preserves an editable Static gallery", async () => {
  const onChoose = vi.fn();
  setup().mount(<TemplateGallery onChoose={onChoose} />);
  await choose("Mode du modèle", "Motion");
  const cards = screen.getAllByRole("button");
  expect(cards).toHaveLength(2);
  expect(cards[0]).toHaveTextContent("5 s");
  expect(cards[1]).toHaveTextContent("100 effets");
  expect(cards.every((card) => Boolean(card.querySelector('[data-mode="motion"] svg')))).toBe(true);
  fireEvent.click(cards[0]!);
  expect(onChoose).toHaveBeenLastCalledWith("in-bloom");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Laboratoire" } });
  expect(screen.getAllByRole("button")).toHaveLength(1);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
  await choose("Mode du modèle", "Statique");
  expect(screen.queryByRole("button", { name: /In Bloom/ })).toBeNull();
  expect(screen.getByRole("button", { name: /AFTERHOURS/ })).toBeVisible();
  expect(
    screen.getByRole("button", { name: /TikTok/ }).querySelector('[data-mode="static"]'),
  ).not.toBeNull();
});
