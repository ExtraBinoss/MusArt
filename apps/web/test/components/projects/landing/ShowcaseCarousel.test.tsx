import { expect, test, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ShowcaseCarousel } from "../../../../src/components/projects/landing/ShowcaseCarousel";
import { setup } from "../../../support/ui";
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

function pointer(node: HTMLElement, type: string, x: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerId: 1, pointerType: "mouse", button: 0, clientX: x });
  fireEvent(node, event);
}
test("opens the corresponding real template and suppresses clicks following a mouse drag", () => {
  const d = setup(),
    choose = vi.fn();
  d.mount(<ShowcaseCarousel onChoose={choose} />);
  const card = screen.getByRole("button", { name: "Créer depuis In Bloom — Démo Motion" });
  fireEvent.click(card);
  expect(choose).toHaveBeenCalledExactlyOnceWith("in-bloom");
  const viewport = screen.getByRole("group", { name: "Des idées pour commencer" });
  pointer(card, "pointerdown", 200);
  pointer(card, "pointermove", 80);
  expect(viewport.scrollLeft).toBe(120);
  pointer(card, "pointerup", 80);
  fireEvent.click(card);
  expect(choose).toHaveBeenCalledOnce();
  pointer(card, "pointerdown", 80);
  pointer(card, "pointerup", 80);
  fireEvent.click(card);
  expect(choose).toHaveBeenCalledTimes(2);
});

test("supports wheel and keyboard navigation and releases its listeners", () => {
  const d = setup();
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockReturnValue(1200);
  const view = d.mount(<ShowcaseCarousel onChoose={vi.fn()} />);
  const viewport = screen.getByRole("group");
  viewport.scrollBy = vi.fn();
  fireEvent.keyDown(viewport, { key: "ArrowRight" });
  expect(viewport.scrollBy).toHaveBeenLastCalledWith({ left: 312, behavior: "smooth" });
  fireEvent.click(screen.getByRole("button", { name: "Modèles suivants" }));
  expect(viewport.scrollBy).toHaveBeenCalledTimes(2);
  fireEvent.wheel(viewport, { deltaY: 100 });
  expect(viewport.scrollLeft).toBe(100);
  fireEvent.wheel(viewport, { deltaY: 100, ctrlKey: true });
  expect(viewport.scrollLeft).toBe(100);
  const remove = vi.spyOn(viewport, "removeEventListener");
  view.unmount();
  expect(remove).toHaveBeenCalledWith("wheel", expect.any(Function));
  expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
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
