import { it, expect } from "vitest";
import { validateReplaySpec, projectFromReplayState } from "../../src/animation/validation";
import { recordSession } from "../../src/animation/recording";
import { cloneValue } from "../../src/document/immutable";
import { stateFromProject } from "../../src/animation/state";
import { validateProject } from "../../src/document/validation";
import { setup, box, asset } from "../support/fixture";
import type { ReplaySpec } from "../../src/animation/model";
function fixture() {
  const { engine } = setup([box("a")]);
  let time = 0;
  const recorder = recordSession(engine, { now: () => time, checkpointInterval: 1 });
  time = 100;
  engine.execute({ type: "updateLayers", ids: ["a"], patch: { x: 50 } });
  return cloneValue(recorder.stop());
}
it("accepts portable streams with lightweight action metadata and rejects corrupt or recursive journals", () => {
  const valid = fixture();
  valid.events[0]!.commands = [{ type: "updateLayers", summary: true }];
  expect(() => validateReplaySpec(valid)).not.toThrow();
  const project = cloneValue(valid.initial);
  project.replay = valid;
  expect(() => validateProject(project)).not.toThrow();
  const bad: Array<(value: ReplaySpec) => void> = [
    (value) => {
      value.version = 2 as never;
    },
    (value) => {
      value.duration = 10;
    },
    (value) => {
      value.initial.replay = fixture();
    },
    (value) => {
      value.pageId = "missing";
    },
    (value) => {
      value.events[0]!.projectId = "other";
    },
    (value) => {
      value.events[0]!.kind = "bad" as never;
    },
    (value) => {
      value.events[0]!.commands = [{ type: "constructor" } as never];
    },
    (value) => {
      value.events[0]!.delta = [{ op: "future", path: [] } as never];
    },
    (value) => {
      value.events[0]!.delta = [{ op: "set", path: ["__proto__"], value: {} }];
    },
    (value) => {
      value.events[0]!.delta = [{ op: "set", path: ["assets"], value: {} }];
    },
    (value) => {
      value.events[0]!.delta = [{ op: "set", path: ["name"] } as never];
    },
    (value) => {
      value.events[0]!.delta = [{ op: "move", from: [-1], path: ["pages", 0] }];
    },
    (value) => {
      value.events[0]!.after!.pages[0]!.layers[0]!.opacity = 5;
    },
    (value) => {
      value.events[0]!.after!.assetIds = ["missing"];
    },
  ];
  for (const mutate of bad) {
    const value = fixture();
    mutate(value);
    expect(() => validateReplaySpec(value)).toThrow();
  }
});
it("validates ordered timestamps and originals introduced later with immutable bytes", () => {
  const valid = fixture();
  valid.events.push({ ...valid.events[0]!, at: 50 });
  expect(() => validateReplaySpec(valid)).toThrow();
  const other = fixture();
  other.initial.assets.original = asset();
  other.assets.original = asset("original", "data:image/png;base64,BBBB");
  expect(() => validateReplaySpec(other)).toThrow("cannot change");
  other.assets.original = asset();
  expect(() => validateReplaySpec(other)).not.toThrow();
  other.assets.original = { ...asset(), mime: "text/html" };
  expect(() => validateReplaySpec(other)).toThrow();
});
it("hydrates states from an original pool without prototype access or nested state payloads", () => {
  const spec = fixture(),
    state = stateFromProject(spec.initial);
  state.assetIds = ["a", "a"];
  expect(() => projectFromReplayState(state, { a: asset("a") })).toThrow("repeated");
  state.assetIds = ["missing"];
  expect(() => projectFromReplayState(state, {})).toThrow("missing");
  expect(() => projectFromReplayState({ ...state, assetIds: [], assets: {} } as never, {})).toThrow(
    "Nested",
  );
  const noCheckpoint = fixture();
  delete noCheckpoint.events[0]!.after;
  expect(() => validateReplaySpec(noCheckpoint)).not.toThrow();
});
