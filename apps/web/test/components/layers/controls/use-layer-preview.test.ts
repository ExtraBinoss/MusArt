import { createElement, type PropsWithChildren } from "react";
import { Provider } from "jotai";
import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { createProject } from "@musart/core";
import { previewAtom } from "../../../../src/state/session/editor";
import { useLayerPreview } from "../../../../src/components/layers/controls/use-layer-preview";
import { setup } from "../../../support/ui";
function fixture(selected = true) {
  const d = setup();
  if (selected) d.engine.select([d.rectangle.id, d.text.id]);
  const page = d.engine.getSnapshot().project.pages[0]!;
  let renders = 0;
  const hook = renderHook(
    ({ current }) => {
      renders++;
      return useLayerPreview(d.engine, current, [d.rectangle.id, d.text.id], d.run, true);
    },
    {
      initialProps: { current: page },
      wrapper: ({ children }: PropsWithChildren) =>
        createElement(Provider, { store: d.store }, children),
    },
  );
  return { ...d, ...hook, page, renders: () => renders };
}
test("live previews update all target layers without React renders or document commits, then commit once", () => {
  const d = fixture(),
    execute = vi.spyOn(d.engine, "execute"),
    renders = d.renders();
  act(() => d.result.current.begin());
  for (const opacity of [0.9, 0.7, 0.5]) act(() => d.result.current.preview({ opacity }));
  expect(d.renders()).toBe(renders);
  expect(d.store.get(previewAtom)).toMatchObject({
    target: "layers",
    layerIds: [d.rectangle.id, d.text.id],
    patch: { opacity: 0.5 },
  });
  expect(d.engine.getSnapshot().canUndo).toBe(false);
  act(() => d.result.current.commit({ opacity: 0.5 }));
  expect(execute).toHaveBeenCalledOnce();
  expect(d.store.get(previewAtom)).toBeNull();
  expect(
    d.engine
      .getSnapshot()
      .project.pages[0]!.layers.slice(0, 2)
      .map((layer) => layer.opacity),
  ).toEqual([0.5, 0.5]);
  d.engine.undo();
  expect(
    d.engine
      .getSnapshot()
      .project.pages[0]!.layers.slice(0, 2)
      .map((layer) => layer.opacity),
  ).toEqual([1, 1]);
});
test("an explicit freshly captured page starts after a previous live phase was frozen in the same input task", () => {
  const d = fixture();
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.image.id], patch: { x: 123 } }));
  const origin = d.engine.getSnapshot().project,
    currentPage = origin.pages[0]!;
  expect(currentPage).not.toBe(d.page);
  act(() => d.result.current.beginOnPage(currentPage));
  act(() => d.result.current.preview({ opacity: 0.3 }));
  expect(d.store.get(previewAtom)).not.toBeNull();
  act(() => d.result.current.commit({ opacity: 0.3 }));
  expect(d.engine.getSnapshot().project.pages[0]!.layers[0]!.opacity).toBe(0.3);
  d.engine.undo();
  expect(d.engine.getSnapshot().project).toEqual(origin);
  d.unmount();
});
test("cancel restores the source, and stale preview sessions remain blocked after React catches up", () => {
  const d = fixture();
  act(() => d.result.current.preview({ opacity: 0.5 }));
  act(() => d.result.current.cancel());
  expect(d.store.get(previewAtom)).toBeNull();
  act(() => d.result.current.begin());
  act(() => d.result.current.preview({ opacity: 0.6 }));
  act(() => d.engine.execute({ type: "updateLayers", ids: [d.image.id], patch: { x: 45 } }));
  expect(d.store.get(previewAtom)).toBeNull();
  const snapshot = d.engine.getSnapshot();
  d.rerender({ current: snapshot.project.pages[0]! });
  act(() => d.result.current.preview({ opacity: 0.4 }));
  act(() => d.result.current.commit({ opacity: 0.4 }));
  expect(d.engine.getSnapshot()).toBe(snapshot);
  d.unmount();
  expect(d.store.get(previewAtom)).toBeNull();
});
test("requires actual editable selection and rechecks a deferred command after project replacement", () => {
  const absent = fixture(false);
  act(() => absent.result.current.preview({ opacity: 0.5 }));
  act(() => absent.result.current.commit({ opacity: 0.5 }));
  expect(absent.engine.getSnapshot().canUndo).toBe(false);
  absent.unmount();
  const d = fixture();
  let pending: (() => void) | undefined;
  d.run.mockImplementation((task) => {
    pending = task;
  });
  act(() => d.result.current.commit({ opacity: 0.5 }));
  expect(pending).toBeTypeOf("function");
  act(() => d.engine.load(createProject()));
  const original = d.engine.getSnapshot();
  act(() => pending?.());
  expect(d.engine.getSnapshot()).toBe(original);
});
