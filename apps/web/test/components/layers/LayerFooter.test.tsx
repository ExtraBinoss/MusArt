import { expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { LayerFooter } from "../../../src/components/layers/LayerFooter";
import { useEngine } from "../../../src/state/session/editor";
import { i18n } from "../../../src/state/i18n";
import { setup } from "../../support/ui";
import { createEffect } from "@musart/core";
import { attachmentSelection } from "../../../src/state/selection/attachments";

test("same-availability selections retain closed controls and actions target the live selection", () => {
  const d = setup(),
    previousUrl = location.href;
  history.replaceState({}, "", "?automation=1");
  try {
    d.engine.select([d.rectangle.id]);
    function Live() {
      const snapshot = useEngine(d.engine);
      return (
        <LayerFooter
          engine={d.engine}
          page={snapshot.project.pages[0]!}
          selection={snapshot.selection}
          attachment={null}
          run={d.run}
        />
      );
    }
    d.mount(<Live />);
    const footer = document.querySelector(".layers-footer")!;
    const before = footer.getAttribute("data-react-renders");
    act(() => d.engine.select([d.image.id]));
    expect(footer).toHaveAttribute("data-react-renders", before);
    const original = d.engine.getSnapshot().project;
    openActions();
    fireEvent.click(screen.getByRole("menuitem", { name: i18n.t("duplicateLayer") }));
    const duplicated = d.engine.getSnapshot().project.pages[0]!.layers.at(-1)!;
    expect(duplicated.id).not.toBe(d.image.id);
    expect(duplicated.kind).toBe("image");
    act(() => d.engine.undo());
    expect(d.engine.getSnapshot().project).toEqual(original);
    expect(d.engine.getSnapshot().canUndo).toBe(false);
    act(() => d.engine.select([]));
    openActions();
    expect(screen.getByRole("menuitem", { name: i18n.t("duplicateLayer") })).toHaveAttribute(
      "data-disabled",
    );
    expect(footer.getAttribute("data-react-renders")).not.toBe(before);
  } finally {
    history.replaceState({}, "", previousUrl);
  }
});

function retainedFooter(run?: (task: () => void) => void) {
  const d = setup(),
    effect = createEffect("dither");
  d.engine.execute({ type: "updateLayers", ids: [d.rectangle.id], patch: { effects: [effect] } });
  d.engine.load(d.engine.getSnapshot().project);
  d.engine.select([d.rectangle.id]);
  const snapshot = d.engine.getSnapshot(),
    page = snapshot.project.pages[0]!;
  d.mount(
    <LayerFooter
      engine={d.engine}
      page={page}
      selection={snapshot.selection}
      attachment={null}
      run={run ?? d.run}
    />,
  );
  const selectEffect = () =>
    attachmentSelection(d.engine).select(page, {
      kind: "effect",
      pageId: page.id,
      layerId: d.rectangle.id,
      effectId: effect.id,
    });
  return { ...d, effect, selectEffect };
}

test("an open Duplicate becomes unavailable on attachment handoff; Delete keeps exact intent", () => {
  const d = retainedFooter();
  openActions();
  const duplicate = screen.getByRole("menuitem", { name: i18n.t("duplicateLayer") });
  act(() => {
    d.selectEffect();
  });
  expect(duplicate).toHaveAttribute("data-disabled");
  const before = d.engine.getSnapshot();
  fireEvent.click(duplicate);
  expect(d.engine.getSnapshot()).toBe(before);
  expect(d.run).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("menuitem", { name: i18n.t("removeEffect") }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers).toHaveLength(3);
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toHaveLength(0);
  expect(d.run).toHaveBeenCalledOnce();
  act(() => d.engine.undo());
  expect(d.engine.getSnapshot().project).toBe(before.project);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

test("a queued footer duplicate rejects an attachment handoff even when document and layer selection stay equal", () => {
  let pending: (() => void) | undefined;
  const run = vi.fn((task: () => void) => {
      pending = task;
    }),
    d = retainedFooter(run),
    before = d.engine.getSnapshot();
  openActions();
  fireEvent.click(screen.getByRole("menuitem", { name: i18n.t("duplicateLayer") }));
  expect(run).toHaveBeenCalledOnce();
  expect(pending).toBeTypeOf("function");
  act(() => {
    d.selectEffect();
  });
  expect(d.engine.getSnapshot()).toBe(before);
  act(() => pending!());
  expect(d.engine.getSnapshot()).toBe(before);
  expect(d.engine.getSnapshot().canUndo).toBe(false);
});

function openActions() {
  fireEvent.pointerDown(screen.getByRole("button", { name: i18n.t("layerActions") }), {
    button: 0,
    ctrlKey: false,
  });
}
