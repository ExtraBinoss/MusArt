import { expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MotionTemplatePreview } from "../../../../../src/components/projects/templates/motion-preview/MotionTemplatePreview";
import { startMotionTemplatePreview } from "../../../../../src/components/projects/templates/motion-preview/runtime";
import "../../../../../src/state/i18n";

vi.mock("../../../../../src/components/projects/templates/motion-preview/runtime", () => ({
  startMotionTemplatePreview: vi.fn(() => ({ release: vi.fn(async () => undefined) })),
}));
function media(hover = true, reduced = false) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query.includes("hover") ? hover : reduced,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

test("hover/focus intent owns native preview lifecycle without a parent render", () => {
  media();
  const renders = vi.fn();
  function Host() {
    renders();
    return (
      <button>
        <MotionTemplatePreview templateId="in-bloom" poster="/poster.webp" />
      </button>
    );
  }
  const view = render(<Host />),
    button = screen.getByRole("button");
  const before = renders.mock.calls.length;
  fireEvent.pointerEnter(button);
  expect(startMotionTemplatePreview).toHaveBeenCalledOnce();
  const release = vi.mocked(startMotionTemplatePreview).mock.results.at(-1)!.value.release;
  const options = vi.mocked(startMotionTemplatePreview).mock.calls.at(-1)![0];
  options.onStatus("loading");
  expect(screen.getByRole("status")).toHaveTextContent("Préparation de l’aperçu…");
  options.onStatus("failed", new Error("Native decode failed"));
  expect(screen.getByRole("status")).toHaveTextContent("Aperçu indisponible");
  expect(screen.getByRole("status")).toHaveAttribute("title", "Native decode failed");
  expect(renders).toHaveBeenCalledTimes(before);
  fireEvent.pointerLeave(button);
  expect(release).toHaveBeenCalledOnce();
  fireEvent.focusIn(button);
  expect(startMotionTemplatePreview).toHaveBeenCalledTimes(2);
  const second = vi.mocked(startMotionTemplatePreview).mock.results.at(-1)!.value.release;
  view.unmount();
  expect(second).toHaveBeenCalledOnce();
});

test("reduced motion, touch-only devices and busy cards stay on their real poster", () => {
  media(false);
  const view = render(
    <button>
      <MotionTemplatePreview templateId="in-bloom" poster="/poster.webp" />
    </button>,
  );
  const before = vi.mocked(startMotionTemplatePreview).mock.calls.length;
  fireEvent.pointerEnter(screen.getByRole("button"));
  fireEvent.focusIn(screen.getByRole("button"));
  expect(startMotionTemplatePreview).toHaveBeenCalledTimes(before);
  media(true, true);
  view.rerender(
    <button>
      <MotionTemplatePreview templateId="motion-stress-lab" poster="/poster.webp" />
    </button>,
  );
  fireEvent.pointerEnter(screen.getByRole("button"));
  expect(startMotionTemplatePreview).toHaveBeenCalledTimes(before);
  media();
  view.rerender(
    <button>
      <MotionTemplatePreview templateId="in-bloom" poster="/poster.webp" disabled />
    </button>,
  );
  fireEvent.pointerEnter(screen.getByRole("button"));
  expect(startMotionTemplatePreview).toHaveBeenCalledTimes(before);
  expect(document.querySelector("img")).toHaveAttribute("src", "/poster.webp");
});

test("late cleanup errors cannot replace a newer hover owner’s status", async () => {
  media();
  let reject!: (error: Error) => void;
  const closing = new Promise<void>((_, fail) => {
    reject = fail;
  });
  vi.mocked(startMotionTemplatePreview).mockImplementationOnce(() => ({ release: () => closing }));
  render(
    <button>
      <MotionTemplatePreview templateId="in-bloom" poster="/poster.webp" />
    </button>,
  );
  const button = screen.getByRole("button");
  fireEvent.pointerEnter(button);
  fireEvent.pointerLeave(button);
  fireEvent.pointerEnter(button);
  const options = vi.mocked(startMotionTemplatePreview).mock.calls.at(-1)![0];
  options.onStatus("playing");
  reject(new Error("Old cleanup failed"));
  await Promise.resolve();
  await Promise.resolve();
  expect(document.querySelector(".motion-template-preview")).toHaveAttribute(
    "data-preview-status",
    "playing",
  );
  expect(screen.getByRole("status")).toHaveTextContent("");
});

test("pointer gestures stop rendering and their focus event cannot restart GPU work", () => {
  media();
  render(
    <button>
      <MotionTemplatePreview templateId="in-bloom" poster="/poster.webp" />
    </button>,
  );
  const button = screen.getByRole("button"),
    before = vi.mocked(startMotionTemplatePreview).mock.calls.length;
  fireEvent.pointerEnter(button);
  expect(startMotionTemplatePreview).toHaveBeenCalledTimes(before + 1);
  const release = vi.mocked(startMotionTemplatePreview).mock.results.at(-1)!.value.release;
  fireEvent.pointerDown(button);
  fireEvent.focusIn(button);
  expect(release).toHaveBeenCalledOnce();
  expect(startMotionTemplatePreview).toHaveBeenCalledTimes(before + 1);
  fireEvent.pointerUp(window);
  fireEvent.pointerLeave(button);
  fireEvent.pointerEnter(button);
  expect(startMotionTemplatePreview).toHaveBeenCalledTimes(before + 2);
});
