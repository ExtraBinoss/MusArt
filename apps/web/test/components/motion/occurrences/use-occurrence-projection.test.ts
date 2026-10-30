import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { createMotionTransport } from "../../../../src/services/motion/transport";
import { useOccurrenceProjection } from "../../../../src/components/motion/occurrences/use-occurrence-projection";
test("publishes a new row projection only when the active occurrence changes", () => {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ layers: [createLayer("rectangle", { id: "hero" })] })] }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  const original = engine.getSnapshot().project.pages[0]!.motion!.tracks[0]!.id;
  engine.execute({
    type: "duplicateMotionOccurrence",
    trackId: original,
    start: { value: 3, rate: 1 },
  });
  const page = engine.getSnapshot().project.pages[0]!,
    copy = page.motion!.tracks[1]!.id;
  const transport = createMotionTransport(engine);
  let renders = 0;
  const hook = renderHook(() => {
    renders++;
    return useOccurrenceProjection(engine, page, transport);
  });
  const before = renders;
  act(() => {
    for (let value = 1; value <= 60; value++) transport.seek({ value, rate: 100 });
  });
  expect(renders).toBe(before);
  expect(hook.result.current.get("hero")).toBe(original);
  act(() => transport.seek({ value: 7, rate: 2 }));
  expect(hook.result.current.get("hero")).toBe(copy);
  expect(renders).toBe(before + 1);
  hook.unmount();
});
