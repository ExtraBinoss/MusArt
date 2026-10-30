import { expect, it } from "vitest";
import { EditorEngine } from "../../src/session/engine";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import { validateProject } from "../../src/document/validation";

function projectWithKeys() {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ layers: [createLayer("rectangle", { id: "item" })] })] }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  engine.execute({
    type: "upsertMotionKeyframe",
    target: { kind: "layer", layerId: "item", property: "x" },
    time: { value: 0, rate: 1 },
    value: 2,
  });
  return structuredClone(engine.getSnapshot().project);
}

it("validates portable Motion and rejects invalid identities, targets, ranges and samples", () => {
  const valid = projectWithKeys();
  expect(() => validateProject(valid)).not.toThrow();
  const mutations = [
    (p: typeof valid) => {
      const properties = p.pages[0]!.motion!.tracks[0]!.properties;
      const extra = structuredClone(properties[0]!);
      extra.id = "other-property";
      extra.keyframes[0]!.id = "other-key";
      Object.assign(extra.target, { effectId: "smuggled-extra-field" });
      properties.push(extra);
    },
    (p: typeof valid) => {
      p.pages[0]!.motion!.initialized = false as never;
    },
    (p: typeof valid) => {
      p.pages[0]!.motion!.mode = "invalid" as never;
    },
    (p: typeof valid) => {
      p.pages[0]!.motion!.duration = { value: 0, rate: 1 };
    },
    (p: typeof valid) => {
      p.pages[0]!.motion!.frameRate = { numerator: 30, denominator: 0 };
    },
    (p: typeof valid) => {
      p.pages[0]!.motion!.tracks.push(structuredClone(p.pages[0]!.motion!.tracks[0]!));
    },
    (p: typeof valid) => {
      p.pages[0]!.motion!.tracks[0]!.layerId = "missing";
    },
    (p: typeof valid) => {
      const property = p.pages[0]!.motion!.tracks[0]!.properties[0]!;
      property.target = { ...property.target, property: "__proto__" as never };
    },
    (p: typeof valid) => {
      p.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes[0]!.value = Infinity;
    },
    (p: typeof valid) => {
      p.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes[0]!.time = { value: 0, rate: -1 };
    },
    (p: typeof valid) => {
      p.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes[0]!.time = { value: -1, rate: 1 };
    },
    (p: typeof valid) => {
      p.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes[0]!.easing = { type: "bad" } as never;
    },
    (p: typeof valid) => {
      const keys = p.pages[0]!.motion!.tracks[0]!.properties[0]!.keyframes;
      keys.push({ ...keys[0]!, id: "another-key" });
    },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(valid);
    mutate(invalid);
    expect(() => validateProject(invalid)).toThrow();
  }
});

it("accepts disjoint v2 occurrences with independent properties while rejecting overlaps and legacy duplicates", () => {
  const valid = projectWithKeys(),
    motion = valid.pages[0]!.motion!;
  const original = motion.tracks[0]!;
  original.end = { value: 1, rate: 1 };
  const copy = structuredClone(original);
  copy.id = "second-track";
  copy.start = { value: 3, rate: 2 };
  copy.end = { value: 2, rate: 1 };
  copy.properties[0]!.id = "second-property";
  copy.properties[0]!.keyframes[0]!.id = "second-key";
  motion.tracks.push(copy);
  expect(() => validateProject(valid)).toThrow("layer track");
  motion.version = 2;
  expect(() => validateProject(valid)).not.toThrow();
  copy.start = { value: 2, rate: 2 };
  expect(() => validateProject(valid)).not.toThrow();
  copy.start = { value: 999, rate: 1000 };
  expect(() => validateProject(valid)).toThrow("overlap");
  copy.start = { value: 1, rate: 1 };
  copy.properties[0]!.keyframes[0]!.id = original.properties[0]!.keyframes[0]!.id;
  expect(() => validateProject(valid)).toThrow();
});
