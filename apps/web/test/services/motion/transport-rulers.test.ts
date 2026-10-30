import { expect, it } from "vitest";
import { createLayer, createPage, createProject, EditorEngine } from "@musart/core";
import { MotionTransport } from "../../../src/services/motion/transport";
it("keeps the evaluated plan and running clock through ruler bursts, but pauses for artwork edits", () => {
  const engine = new EditorEngine(
    createProject({ pages: [createPage({ layers: [createLayer("rectangle", { id: "item" })] })] }),
  );
  engine.execute({ type: "setCompositionMode", mode: "motion" });
  let now = 0,
    id = 0;
  const pending = new Map<number, () => void>();
  const source = new MotionTransport(engine, {
    now: () => now,
    request: (callback) => {
      pending.set(++id, callback);
      return id;
    },
    cancel: (id) => {
      pending.delete(id);
    },
  });
  const stop = source.subscribe(() => {});
  try {
    source.play();
    const plan = source.readFramePlan();
    for (let at = 0; at < 30; at++) {
      engine.execute({ type: "updatePage", patch: { rulers: at % 2 === 0 } });
      expect(source.readFramePlan()).toBe(plan);
      expect(source.readFrame()!.rulers).toBe(at % 2 === 0);
      expect(source.read().playing).toBe(true);
      expect(pending.size).toBe(1);
    }
    now = 100;
    const tick = [...pending.values()][0]!;
    pending.clear();
    tick();
    expect(source.read().time.value / source.read().time.rate).toBeGreaterThan(0);
    engine.execute({ type: "updateLayers", ids: ["item"], patch: { fill: "#ff0000" } });
    expect(source.read().playing).toBe(false);
  } finally {
    stop();
    source.dispose();
  }
  expect(pending.size).toBe(0);
});
