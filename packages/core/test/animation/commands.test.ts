import { it, expect } from "vitest";
import { setup, box } from "../support/fixture";
import { recordSession } from "../../src/animation/recording";
it("sets and removes an explicitly portable replay through the same validation and undo path", () => {
  const { engine } = setup([box("a")]);
  let time = 0;
  const recording = recordSession(engine, { now: () => time });
  time = 100;
  engine.execute({ type: "updateLayers", ids: ["a"], patch: { x: 50 } });
  const spec = recording.stop();
  engine.execute({ type: "setReplay", replay: spec });
  expect(engine.getSnapshot().project.replay).toEqual(spec);
  engine.execute({ type: "setReplay", replay: null });
  expect(engine.getSnapshot().project.replay).toBeUndefined();
  engine.undo();
  expect(engine.getSnapshot().project.replay).toEqual(spec);
});
