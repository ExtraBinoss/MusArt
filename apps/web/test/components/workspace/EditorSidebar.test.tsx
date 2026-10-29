import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
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

test("same-target effect commits defer Inspector work without inherited interactivity styles", () => {
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
    expect(urgentRenders).toEqual([renders]);
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
