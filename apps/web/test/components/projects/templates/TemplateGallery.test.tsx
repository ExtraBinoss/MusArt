import { LIBRARY_MODE_KEY } from "../../../../src/components/projects/dashboard/library-mode";
import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { TemplateGallery } from "../../../../src/components/projects/templates/TemplateGallery";
import { setup } from "../../../support/ui";
vi.mock(
  "../../../../src/components/projects/templates/motion-preview/MotionTemplatePreview",
  () => ({
    MotionTemplatePreview: ({
      templateId,
      poster,
      disabled,
    }: {
      templateId: string;
      poster: string;
      disabled?: boolean;
    }) => (
      <span data-motion-preview={templateId} data-preview-disabled={Boolean(disabled)}>
        <img src={poster} alt="" />
      </span>
    ),
  }),
);
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
  for (const choice of screen.getAllByRole("radio")) expect(choice).toBeDisabled();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getByRole("searchbox")).toBeDisabled();
});
test("shows honest preparation state and keeps explicit download cancellation usable", () => {
  const cancel = vi.fn();
  setup().mount(<TemplateGallery onChoose={vi.fn()} busy onCancel={cancel} />);
  expect(screen.getByRole("status")).toHaveTextContent("Préparation du modèle");
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(cancel).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: /AFTERHOURS/ })).toBeDisabled();
});
test("filters real Motion projects independently from blank formats and preserves an editable Static gallery", async () => {
  const onChoose = vi.fn();
  setup().mount(<TemplateGallery onChoose={onChoose} />);
  expect(screen.getByRole("radio", { name: "Tous" })).toHaveAttribute("aria-checked", "true");
  expect(screen.queryByText("Tous les modèles")).toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Motion" }));
  const cards = screen.getAllByRole("button");
  expect(cards).toHaveLength(6);
  for (const name of [/Orbit Study/, /Paper Motion/, /Atlas des transitions/, /Sound Playground/])
    await waitFor(() => expect(screen.getByRole("button", { name })).toBeVisible());
  expect(screen.getByRole("button", { name: /In Bloom/ })).toHaveTextContent("1440 × 1040 px");
  expect(screen.getByRole("button", { name: /Laboratoire/ })).toHaveTextContent("1440 × 1200 px");
  expect(cards.every((card) => Boolean(card.querySelector('[data-mode="motion"] svg')))).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /In Bloom/ }));
  expect(onChoose).toHaveBeenLastCalledWith("in-bloom");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Laboratoire" } });
  expect(screen.getAllByRole("button")).toHaveLength(1);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("radio", { name: "Statique" }));
  expect(screen.queryByRole("button", { name: /In Bloom/ })).toBeNull();
  await waitFor(() => expect(screen.getByRole("button", { name: /AFTERHOURS/ })).toBeVisible());
  expect(screen.getByRole("button", { name: /Colorfield/ })).toBeVisible();
  expect(
    screen.getByRole("button", { name: /TikTok/ }).querySelector('[data-mode="static"]'),
  ).not.toBeNull();
});

test("wires live previews only for authored Motion cards and disables their intent during opening", () => {
  const d = setup(),
    choose = vi.fn();
  const view = d.mount(<TemplateGallery onChoose={choose} />);
  expect(document.querySelectorAll(".template-grid [data-motion-preview]")).toHaveLength(2);
  expect(
    document.querySelector('.template-artwork > img[src="/templates/afterhours.webp"]'),
  ).not.toBeNull();
  fireEvent.click(screen.getByRole("radio", { name: "Motion" }));
  const previews = document.querySelectorAll<HTMLElement>(".template-grid [data-motion-preview]");
  expect([...previews].map((preview) => preview.dataset.motionPreview)).toEqual([
    "in-bloom",
    "motion-stress-lab",
  ]);
  expect(previews[0]!.querySelector("img")).toHaveAttribute(
    "src",
    "/templates/motion/in-bloom.webp",
  );
  expect(previews[1]!.querySelector("img")).toHaveAttribute(
    "src",
    "/templates/motion/motion-stress-lab.webp",
  );
  fireEvent.click(screen.getByRole("button", { name: /Créer depuis In Bloom/ }));
  expect(choose).toHaveBeenCalledExactlyOnceWith("in-bloom");
  view.rerender(<TemplateGallery onChoose={choose} busy />);
  for (const preview of document.querySelectorAll(".template-grid [data-motion-preview]"))
    expect(preview).toHaveAttribute("data-preview-disabled", "true");
});

test("controlled query and mode filter list-only presentation without a duplicate toolbar", () => {
  const d = setup();
  const view = d.mount(
    <TemplateGallery onChoose={vi.fn()} query="Bloom" mode="motion" hideToolbar />,
  );
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(screen.queryByRole("radiogroup")).toBeNull();
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("button", { name: /In Bloom/ })).toBeInTheDocument();
  view.rerender(<TemplateGallery onChoose={vi.fn()} query="Techno" mode="static" hideToolbar />);
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("button", { name: /AFTERHOURS/ })).toBeInTheDocument();
});

beforeEach(() => localStorage.removeItem(LIBRARY_MODE_KEY));
