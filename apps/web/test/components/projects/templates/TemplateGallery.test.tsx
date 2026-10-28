import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { TemplateGallery } from "../../../../src/components/projects/templates/TemplateGallery";
import { setup } from "../../../support/ui";
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
});
