import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ShowcaseCarousel } from "../../../../src/components/projects/landing/ShowcaseCarousel";
import { setup } from "../../../support/ui";
import { installCarouselPan } from "../../../../src/components/projects/landing/carousel/controller";
const pan = vi.hoisted(() => ({ dispose: vi.fn(), position: () => 17 }));
beforeEach(() => vi.clearAllMocks());
vi.mock("../../../../src/components/projects/landing/carousel/controller", () => ({
  installCarouselPan: vi.fn(() => pan),
}));
vi.mock(
  "../../../../src/components/projects/templates/motion-preview/MotionTemplatePreview",
  () => ({
    MotionTemplatePreview: ({
      templateId,
      poster,
      disabled,
      className,
    }: {
      templateId: string;
      poster: string;
      disabled?: boolean;
      className?: string;
    }) => (
      <span
        className={className}
        data-motion-preview={templateId}
        data-preview-disabled={Boolean(disabled)}
      >
        <img src={poster} alt="" />
      </span>
    ),
  }),
);

test("opens real templates with one accessible card per template and no arrow controls", () => {
  const d = setup(),
    choose = vi.fn();
  d.mount(<ShowcaseCarousel onChoose={choose} />);
  fireEvent.click(screen.getByRole("button", { name: "Créer depuis In Bloom — Démo Motion" }));
  expect(choose).toHaveBeenCalledExactlyOnceWith("in-bloom");
  expect(screen.getAllByRole("button")).toHaveLength(6);
  expect(screen.queryByRole("button", { name: /Modèles (précédents|suivants)/ })).toBeNull();
  expect(screen.getByRole("group")).toHaveAttribute(
    "aria-description",
    "Faites glisser pour explorer les modèles.",
  );
});

test("keeps one imperative pan owner through unrelated renders and releases it on unmount", () => {
  const d = setup();
  const view = d.mount(<ShowcaseCarousel onChoose={vi.fn()} />);
  expect(installCarouselPan).toHaveBeenCalledOnce();
  expect(installCarouselPan).toHaveBeenCalledWith(screen.getByRole("group"), {
    reducedMotion: false,
    position: 0,
  });
  view.rerender(<ShowcaseCarousel onChoose={vi.fn()} busy />);
  expect(installCarouselPan).toHaveBeenCalledOnce();
  view.unmount();
  expect(pan.dispose).toHaveBeenCalledOnce();
});

test("shares the authored Motion previews while preserving static posters and centered artwork styling", () => {
  const d = setup();
  const view = d.mount(<ShowcaseCarousel onChoose={vi.fn()} />);
  const previews = document.querySelectorAll<HTMLElement>(
    ".landing-template-stage > [data-motion-preview]",
  );
  expect([...previews].map((preview) => preview.dataset.motionPreview)).toEqual([
    "in-bloom",
    "motion-stress-lab",
  ]);
  for (const preview of previews) {
    expect(preview).toHaveClass("landing-template-motion");
    expect(preview).toHaveAttribute("data-preview-disabled", "false");
  }
  expect(
    document.querySelector('.landing-template-stage > img[src="/templates/afterhours.webp"]'),
  ).not.toBeNull();
  view.rerender(<ShowcaseCarousel onChoose={vi.fn()} busy />);
  for (const preview of document.querySelectorAll("[data-motion-preview]"))
    expect(preview).toHaveAttribute("data-preview-disabled", "true");
});
