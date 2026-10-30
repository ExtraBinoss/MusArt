import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { setup } from "../../../support/ui";
import { captureTransitionOrigin } from "../../../../src/components/motion/transitions/authoring";
import { TransitionPreview } from "../../../../src/components/motion/transitions/TransitionPreview";
import "../../../../src/components/motion/transitions/messages";
import { createTransitionPreviewSource } from "../../../../src/components/motion/transitions/preview-source";
const state = vi.hoisted(() => ({
  reduced: false,
  options: null as null | { onFrame(canvas: HTMLCanvasElement): void },
  update: vi.fn(),
  play: vi.fn(),
  visible: vi.fn(),
  dispose: vi.fn(),
  create: vi.fn(),
}));
vi.mock("motion/react", () => ({ useReducedMotion: () => state.reduced }));
vi.mock("../../../../src/components/motion/transitions/preview-session", () => ({
  createTransitionPreviewSession: (_engine: unknown, options: typeof state.options) => {
    state.create();
    state.options = options;
    return state;
  },
}));
beforeEach(() => {
  state.reduced = false;
  state.create.mockReset();
  state.update.mockReset();
  state.play.mockReset();
  state.visible.mockReset();
  state.dispose.mockReset().mockResolvedValue(undefined);
});
function fixture() {
  const d = setup();
  d.engine.execute({ type: "setCompositionMode", mode: "motion" });
  const origin = captureTransitionOrigin(d.engine, d.page.id, d.rectangle.id)!;
  return { ...d, origin };
}
it("uses pointer/focus and option previews without rendering React on GPU frames", () => {
  const d = fixture();
  let renders = 0;
  function Host() {
    renders++;
    return (
      <TransitionPreview
        engine={d.engine}
        origin={d.origin}
        style="fade"
        placement="in"
        duration={500}
        optionActive={false}
      />
    );
  }
  const before = d.engine.getSnapshot(),
    view = d.mount(<Host />);
  const preview = screen.getByRole("img", { name: "Aperçu · Fondu" });
  fireEvent.pointerEnter(preview);
  expect(state.play).toHaveBeenLastCalledWith(true);
  fireEvent.pointerLeave(preview);
  expect(state.play).toHaveBeenLastCalledWith(false);
  fireEvent.focus(preview);
  expect(state.play).toHaveBeenLastCalledWith(true);
  fireEvent.blur(preview);
  expect(state.play).toHaveBeenLastCalledWith(false);
  const canvas = document.createElement("canvas");
  state.options!.onFrame(canvas);
  state.options!.onFrame(canvas);
  expect(preview.querySelectorAll("canvas")).toHaveLength(1);
  expect(renders).toBe(1);
  expect(d.engine.getSnapshot()).toBe(before);
  view.unmount();
  expect(state.dispose).toHaveBeenCalledOnce();
});
it("clears a stale same-ID document preview and respects reduced motion", () => {
  const d = fixture();
  state.reduced = true;
  const view = d.mount(
    <TransitionPreview
      engine={d.engine}
      origin={d.origin}
      style="wipe"
      placement="out"
      duration={500}
      optionActive
    />,
  );
  expect(state.update).toHaveBeenCalledWith({ style: "wipe", placement: "out", duration: 500 });
  expect(state.play).toHaveBeenLastCalledWith(false);
  act(() => d.engine.load(structuredClone(d.engine.getSnapshot().project)));
  expect(state.dispose).toHaveBeenCalled();
  expect(screen.getByText(/Cette composition a changé/)).toBeVisible();
  view.unmount();
});

it("updates hover/focus styles inside one retained GPU session, clears stale hover and cleans up", () => {
  const d = fixture(),
    previewSource = createTransitionPreviewSource();
  let parents = 0;
  function Host() {
    parents++;
    return (
      <TransitionPreview
        engine={d.engine}
        origin={d.origin}
        style="fade"
        placement="in"
        duration={500}
        optionActive={false}
        previewSource={previewSource}
      />
    );
  }
  const view = d.mount(<Host />);
  act(() => previewSource.set("wipe"));
  expect(state.update).toHaveBeenLastCalledWith({ style: "wipe", placement: "in", duration: 500 });
  expect(state.play).toHaveBeenLastCalledWith(true);
  act(() => previewSource.set("iris"));
  expect(state.update).toHaveBeenLastCalledWith({ style: "iris", placement: "in", duration: 500 });
  expect(parents).toBe(1);
  expect(state.create).toHaveBeenCalledOnce();
  act(() => previewSource.set(null));
  expect(state.update).toHaveBeenLastCalledWith({ style: "fade", placement: "in", duration: 500 });
  expect(state.play).toHaveBeenLastCalledWith(false);
  act(() => previewSource.set("wipe"));
  act(() => d.engine.load(structuredClone(d.engine.getSnapshot().project)));
  expect(previewSource.read()).toBeNull();
  expect(state.dispose).toHaveBeenCalled();
  view.unmount();
  expect(previewSource.read()).toBeNull();
  expect(state.create).toHaveBeenCalledOnce();
});
