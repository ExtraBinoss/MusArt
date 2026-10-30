import { expect, test, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { createEffect, createPage } from "@musart/core";
import { EditorSidebar } from "../../../src/components/workspace/EditorSidebar";
import { previewAtom } from "../../../src/state/session/editor";
import { setup } from "../../support/ui";

test("effect editing keeps the previous Inspector guarded and adopts current properties on dismissal", () => {
  const d = setup(),
    effect = createEffect("receipt");
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { effects: [effect] } });
  d.engine.select([d.image.id]);
  const { container } = d.mount(
    <EditorSidebar
      engine={d.engine}
      services={d.services}
      run={d.run}
      onTask={d.onTask}
      exportOpen={false}
      onExportOpenChange={vi.fn()}
    />,
  );
  const inspector = screen.getByRole("region", { name: "Propriétés" });
  expect(inspector).toHaveAttribute("data-selected-layer-id", d.image.id);
  fireEvent.click(container.querySelector(`[data-attachment-effect-id="${effect.id}"]`)!);
  expect(d.engine.getSnapshot().selection).toEqual([d.rectangle.id]);
  expect(inspector).toHaveAttribute("data-selected-layer-id", d.image.id);
  expect(container.querySelector(".inspector-selection-boundary")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  const originalImage = d.engine
    .getSnapshot()
    .project.pages[0]!.layers.find((layer) => layer.id === d.image.id)!;
  fireEvent.change(within(inspector).getByLabelText("X"), { target: { value: "999" } });
  expect(d.store.get(previewAtom)).toBeNull();
  expect(
    d.engine.getSnapshot().project.pages[0]!.layers.find((layer) => layer.id === d.image.id),
  ).toBe(originalImage);
  act(() =>
    d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { width: 321 } }),
  );
  expect(inspector).toHaveAttribute("data-selected-layer-id", d.image.id);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(inspector).toHaveAttribute("data-selected-layer-id", d.rectangle.id);
  expect(screen.getByLabelText("Largeur")).toHaveValue("321");
  expect(container.querySelector(".inspector-selection-boundary")).toHaveAttribute(
    "aria-busy",
    "false",
  );
});

test("sidebar follows selection and page changes and supplies current export scope", () => {
  const d = setup();
  const onExportOpenChange = vi.fn();
  d.mount(
    <EditorSidebar
      engine={d.engine}
      services={d.services}
      run={d.run}
      onTask={d.onTask}
      exportOpen={false}
      onExportOpenChange={onExportOpenChange}
    />,
  );
  act(() => d.engine.select([d.rectangle.id]));
  expect(screen.getByRole("region", { name: "Propriétés" })).toHaveAttribute(
    "data-selected-layer-id",
    d.rectangle.id,
  );
  act(() => d.engine.select([d.image.id]));
  expect(screen.getByRole("region", { name: "Propriétés" })).toHaveAttribute(
    "data-selected-layer-id",
    d.image.id,
  );
  expect(screen.getByText("Design", { selector: ".inspector-design-label" })).toBeVisible();
  expect(screen.queryByRole("tab", { name: "Animation" })).not.toBeInTheDocument();
  const other = createPage({ name: "Other", width: 640, height: 480 });
  act(() => d.engine.execute({ type: "addPage", page: other }));
  expect(screen.getByRole("textbox", { name: "Largeur" })).toHaveValue("640");
  fireEvent.click(screen.getByRole("button", { name: "Exporter" }));
  expect(onExportOpenChange).toHaveBeenCalledWith(true);
});

test("selection handoffs stay guarded without inherited styles or ruler-only busy changes", () => {
  const d = setup();
  d.engine.select([d.rectangle.id]);
  const { container } = d.mount(
    <EditorSidebar
      engine={d.engine}
      services={d.services}
      run={d.run}
      onTask={d.onTask}
      exportOpen={false}
      onExportOpenChange={vi.fn()}
    />,
  );
  const boundary = container.querySelector(".inspector-selection-boundary")!;
  const attributes = vi.spyOn(boundary, "setAttribute");
  const input = screen.getByLabelText("X");
  act(() => d.engine.execute({ type: "updatePage", patch: { rulers: true } }));
  expect(
    attributes.mock.calls.some(
      ([name, value]) =>
        name === "inert" ||
        name === "disabled" ||
        (name === "aria-busy" && String(value) === "true"),
    ),
  ).toBe(false);
  expect(screen.getByLabelText("X")).toBe(input);
  expect(input).not.toBeDisabled();
  act(() => d.engine.select([d.image.id]));
  expect(
    attributes.mock.calls.some(([name, value]) => name === "aria-busy" && String(value) === "true"),
  ).toBe(true);
  expect(
    attributes.mock.calls.some(
      ([name]) => name === "inert" || name === "disabled" || name === "aria-disabled",
    ),
  ).toBe(false);
  expect(boundary.tagName).toBe("DIV");
  expect(screen.getByRole("region", { name: "Propriétés" })).toHaveAttribute(
    "data-selected-layer-id",
    d.image.id,
  );
  expect(screen.getByLabelText("X")).not.toBeDisabled();
});

test("same-target canonical commits update Inspector immediately without inherited interactivity styles", () => {
  const d = setup(),
    effect = createEffect("dither");
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { effects: [effect] } });
  d.engine.select([d.rectangle.id]);
  const previousURL = location.href;
  history.replaceState({}, "", "/?automation=1");
  const { container, unmount } = d.mount(
    <EditorSidebar
      engine={d.engine}
      services={d.services}
      run={d.run}
      onTask={d.onTask}
      exportOpen={false}
      onExportOpenChange={vi.fn()}
    />,
  );
  try {
    const boundary = container.querySelector(".inspector-selection-boundary")!;
    const inspector = screen.getByRole("region", { name: "Propriétés" });
    const renders = Number(inspector.getAttribute("data-react-renders"));
    const urgentRenders: number[] = [];
    const setAttribute = boundary.setAttribute.bind(boundary);
    const attributes = vi.spyOn(boundary, "setAttribute").mockImplementation((name, value) => {
      if (name === "aria-busy" && String(value) === "true")
        urgentRenders.push(Number(inspector.getAttribute("data-react-renders")));
      setAttribute(name, value);
    });
    act(() =>
      d.engine.execute({
        type: "updateLayers",
        ids: [d.rectangle.id],
        patch: { effects: [{ ...effect, enabled: false }] },
      }),
    );
    expect(urgentRenders).toEqual([]);
    expect(Number(inspector.getAttribute("data-react-renders"))).toBeGreaterThan(renders);
    expect(attributes.mock.calls.some(([name]) => name === "inert" || name === "disabled")).toBe(
      false,
    );
    expect(boundary).toHaveAttribute("aria-busy", "false");
    expect(boundary).not.toHaveAttribute("inert");
    expect(screen.getByLabelText("X")).toHaveValue(String(d.rectangle.x));
    expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.enabled).toBe(false);
  } finally {
    unmount();
    history.replaceState({}, "", previousURL);
  }
});

test("an effect commit cancels an active property preview before rebinding Inspector controls", () => {
  const d = setup(),
    effect = createEffect("dither");
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { effects: [effect] } });
  d.engine.select([d.rectangle.id]);
  d.mount(
    <EditorSidebar
      engine={d.engine}
      services={d.services}
      run={d.run}
      onTask={d.onTask}
      exportOpen={false}
      onExportOpenChange={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText("X"), { target: { value: "123" } });
  expect(d.store.get(previewAtom)).toMatchObject({ target: "layer", patch: { x: 123 } });
  act(() =>
    d.engine.execute({
      type: "updateLayers",
      ids: [d.rectangle.id],
      patch: { effects: [{ ...effect, enabled: false }] },
    }),
  );
  expect(d.store.get(previewAtom)).toBeNull();
  expect(screen.getByLabelText("X")).toHaveValue(String(d.rectangle.x));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.x).toBe(d.rectangle.x);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects[0]!.enabled).toBe(false);
});

test("consecutive same-owner color gestures remain ready and each commit has one undo entry", () => {
  const d = setup();
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { fill: "#ff000080" } });
  d.engine.load(d.engine.getSnapshot().project);
  d.engine.select([d.rectangle.id]);
  const original = d.engine.getSnapshot(),
    previousURL = location.href;
  history.replaceState({}, "", "/?automation=1");
  const mounted = d.mount(
    <EditorSidebar
      engine={d.engine}
      services={d.services}
      run={d.run}
      onTask={d.onTask}
      exportOpen={false}
      onExportOpenChange={vi.fn()}
    />,
  );
  try {
    const inspector = screen.getByRole("region", { name: "Propriétés" }),
      boundary = mounted.container.querySelector(".inspector-selection-boundary")!,
      attributes = vi.spyOn(boundary, "setAttribute");
    const pointer = (target: HTMLElement | Window, type: string, x: number, y: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y,
      });
      Object.defineProperty(event, "pointerId", { value: 1 });
      fireEvent(target, event);
    };
    for (const [x, y, expected] of [
      [85, 95, "#40101080"],
      [60, 70, "#80404080"],
    ] as const) {
      const pad = mounted.container.querySelector<HTMLElement>(".react-colorful__saturation")!;
      vi.spyOn(pad, "getBoundingClientRect").mockReturnValue({
        left: 10,
        top: 20,
        width: 100,
        height: 100,
      } as DOMRect);
      const input = pad.querySelector<HTMLElement>('[role="slider"]')!,
        before = d.engine.getSnapshot(),
        renders = Number(inspector.getAttribute("data-react-renders"));
      pointer(input, "pointerdown", 30, 40);
      pointer(window, "pointermove", x, y);
      expect(d.engine.getSnapshot().project).toBe(before.project);
      expect(Number(inspector.getAttribute("data-react-renders"))).toBe(renders);
      pointer(window, "pointerup", x, y);
      expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.fill).toBe(expected);
      expect(d.engine.getSnapshot().revision).toBe(before.revision + 1);
      expect(Number(inspector.getAttribute("data-react-renders"))).toBe(renders + 1);
      expect(boundary).toHaveAttribute("aria-busy", "false");
    }
    expect(
      attributes.mock.calls.some(
        ([name, value]) => name === "aria-busy" && String(value) === "true",
      ),
    ).toBe(false);
    act(() => d.engine.undo());
    expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.fill).toBe("#40101080");
    act(() => d.engine.undo());
    expect(d.engine.getSnapshot().project).toBe(original.project);
    expect(d.engine.getSnapshot().canUndo).toBe(false);
  } finally {
    mounted.unmount();
    history.replaceState({}, "", previousURL);
  }
});
