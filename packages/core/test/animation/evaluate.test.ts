import { describe, it, expect } from "vitest";
import { evaluateReplay } from "../../src/animation/evaluate";
import { recordSession } from "../../src/animation/recording";
import { createEffect, createPage, createProject } from "../../src/document/factories";
import { cloneValue } from "../../src/document/immutable";
import { setup, box, asset } from "../support/fixture";
describe("deterministic replay evaluator", () => {
  it("interpolates numeric geometry/opacity/FX while text and other structural values stay discrete", () => {
    const effect = createEffect("brightness", { id: "fx", amount: 0.2 }),
      { engine } = setup([
        box("a", 0, 0, {
          text: "Before",
          effects: [effect],
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          guides: [{ id: "g", axis: "x", position: 80 }],
        }),
        box("gone"),
        box("changed"),
      ]);
    let time = 0;
    const recording = recordSession(engine, { now: () => time });
    time = 100;
    engine.transaction([
      {
        type: "updateLayers",
        ids: ["a"],
        patch: {
          x: 100,
          y: 40,
          width: 50,
          height: 40,
          opacity: 0.2,
          text: "After",
          fill: "#ff0000",
          padding: { top: 2, right: 4, bottom: 6, left: 8 },
          margin: { top: 2, right: 2, bottom: 2, left: 2 },
          effects: [{ ...effect, amount: 0.8 }],
          guides: [{ id: "g", axis: "x", position: 40 }],
        },
      },
      { type: "deleteLayers", ids: ["gone"] },
    ]);
    time = 200;
    const spec = recording.stop(),
      middle = evaluateReplay(spec, 50),
      layer = middle.pages[0]!.layers[0]!;
    expect(layer).toMatchObject({
      x: 50,
      y: 20,
      width: 75,
      height: 60,
      opacity: 0.6,
      text: "Before",
      fill: "#2563eb",
      padding: { top: 1, right: 2, bottom: 3, left: 4 },
      margin: { top: 1, right: 1, bottom: 1, left: 1 },
    });
    expect(layer.effects[0]!.amount).toBeCloseTo(0.5);
    expect(layer.guides![0]!.position).toBe(75);
    expect(middle.pages[0]!.layers.some((layer) => layer.id === "gone")).toBe(true);
    expect(evaluateReplay(spec, 100).pages[0]!.layers[0]!.text).toBe("After");
    expect(evaluateReplay(spec, 1000).pages[0]!.layers[0]!.x).toBe(100);
    expect(evaluateReplay(spec, -10).pages[0]!.layers[0]!.x).toBe(0);
    expect(Object.isFrozen(middle.pages[0]!.layers[0])).toBe(true);
    expect(() => evaluateReplay(spec, NaN)).toThrow("finite");
  });
  it("preserves stable generated IDs, future imported assets and discrete additions across serialization", () => {
    const { engine } = setup();
    let time = 0;
    const recording = recordSession(engine, { now: () => time });
    time = 100;
    engine.execute({
      type: "addLayers",
      layers: [box("photo", 0, 0, { kind: "image", assetId: "original" })],
      assets: [asset()],
    });
    time = 200;
    engine.execute({ type: "duplicateLayers", ids: ["photo"] });
    time = 300;
    engine.undo();
    time = 400;
    engine.redo();
    const spec = JSON.parse(JSON.stringify(recording.stop())) as ReturnType<typeof recording.stop>;
    expect(evaluateReplay(spec, 50).pages[0]!.layers).toEqual([]);
    expect(evaluateReplay(spec, 100).assets.original).toEqual(asset());
    expect(evaluateReplay(spec, 200).pages[0]!.layers.map((layer) => layer.id)).toEqual(
      evaluateReplay(spec, 400).pages[0]!.layers.map((layer) => layer.id),
    );
    expect(evaluateReplay(spec, 300).pages[0]!.layers).toHaveLength(1);
    expect(Object.isFrozen(spec.initial)).toBe(false);
    expect(Object.isFrozen(spec.assets.original)).toBe(false);
  });
  it("seeks forwards and backwards through compact checkpoints and repeatedly samples one interpolation interval", () => {
    const { engine } = setup([box("a")]);
    let time = 0;
    const recording = recordSession(engine, { now: () => time });
    for (let index = 1; index <= 510; index++) {
      time = index * 10;
      engine.execute({ type: "updateLayers", ids: ["a"], patch: { x: index } });
    }
    const spec = recording.stop();
    expect(spec.events[249]!.after).toBeDefined();
    expect(spec.events[248]!.after).toBeUndefined();
    expect(evaluateReplay(spec, 5055).pages[0]!.layers[0]!.x).toBeCloseTo(505.5);
    expect(evaluateReplay(spec, 5056).pages[0]!.layers[0]!.x).toBeCloseTo(505.6);
    expect(evaluateReplay(spec, 25).pages[0]!.layers[0]!.x).toBeCloseTo(2.5);
    expect(evaluateReplay(spec, 5000).pages[0]!.layers[0]!.x).toBe(500);
    expect(JSON.stringify(spec.events[10])).not.toContain('"pages":');
  });
  it("does not interpolate a reparented layer, changed effect type or a removed page", () => {
    const effect = createEffect("brightness", { id: "fx" }),
      { engine } = setup([
        box("a", 0, 0, { effects: [effect] }),
        box("g", 0, 0, { kind: "group" }),
      ]);
    let time = 0;
    const recording = recordSession(engine, { now: () => time });
    time = 100;
    engine.transaction([
      {
        type: "updateLayers",
        ids: ["a"],
        patch: { effects: [createEffect("contrast", { id: "fx", amount: 1 })] },
      },
      { type: "reorderLayer", id: "a", parentId: "g", index: 0 },
    ]);
    const spec = recording.stop();
    expect(evaluateReplay(spec, 50).pages[0]!.layers[0]!.parentId).toBeNull();
    expect(evaluateReplay(spec, 50).pages[0]!.layers[0]!.effects[0]!.type).toBe("brightness");
    const two = createProject({ pages: [createPage({ id: "p1" }), createPage({ id: "p2" })] }),
      other = setup();
    other.engine.load(two);
    time = 0;
    const rec = recordSession(other.engine, { now: () => time });
    time = 100;
    other.engine.execute({ type: "deletePage", id: "p1" });
    expect(evaluateReplay(rec.stop(), 50).pages).toHaveLength(2);
    const mutable = cloneValue(spec);
    mutable.events[0]!.after = undefined as never;
    expect(() => evaluateReplay(mutable, 20)).not.toThrow();
  });
});
