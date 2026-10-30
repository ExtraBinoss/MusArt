import { expect, it } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import {
  captureTransitionOrigin,
  commitTransition,
} from "../../../../src/components/motion/transitions/authoring";

function setup() {
  const engine = new EditorEngine(
    createProject({
      pages: [createPage({ id: "page", layers: [createLayer("rectangle", { id: "layer" })] })],
    }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  return engine;
}
const options = { style: "fade", placement: "in", duration: { value: 500, rate: 1000 } } as const;

it("applies to the captured composition only and rejects same-ID reloads and intervening edits", () => {
  const engine = setup(),
    origin = captureTransitionOrigin(engine, "page", "layer")!;
  expect(commitTransition(engine, origin, options)).toBe("applied");
  engine.undo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toHaveLength(0);
  expect(commitTransition(engine, origin, options)).toBe("changed");
  const fresh = captureTransitionOrigin(engine, "page", "layer")!;
  engine.load({ ...fresh.project });
  expect(commitTransition(engine, fresh, options)).toBe("changed");
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.effects).toHaveLength(0);
});

it("validates the duration and does not offer authoring for unavailable tracks", () => {
  const engine = setup(),
    origin = captureTransitionOrigin(engine, "page", "layer")!;
  for (const duration of [
    { value: 0, rate: 1 },
    { value: 3, rate: 1 },
    { value: 1, rate: 0 },
  ])
    expect(commitTransition(engine, origin, { ...options, duration })).toBe("invalid");
  expect(commitTransition(engine, origin, { ...options, style: "missing" as "fade" })).toBe(
    "failed",
  );
  expect(captureTransitionOrigin(engine, "other", "layer")).toBeNull();
  expect(captureTransitionOrigin(engine, "page", "gone")).toBeNull();
  engine.execute({ type: "updateLayers", ids: ["layer"], patch: { locked: true } });
  expect(captureTransitionOrigin(engine, "page", "layer")).toBeNull();
  engine.execute({ type: "setCompositionMode", mode: "static" });
  expect(captureTransitionOrigin(engine, "page", "layer")).toBeNull();
});
