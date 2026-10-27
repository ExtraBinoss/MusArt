import { it, expect } from "vitest";
import { setup } from "../support/fixture";
it("updates additive page settings without accepting structural identity edits", () => {
  const { engine, page } = setup();
  engine.execute({
    type: "updatePage",
    patch: {
      rulers: true,
      colorSpace: "display-p3",
      margins: { top: 10, right: 20, bottom: 30, left: 40 },
    },
  });
  expect(page()).toMatchObject({ rulers: true, colorSpace: "display-p3", margins: { left: 40 } });
  const before = engine.getSnapshot();
  expect(() => engine.execute({ type: "updatePage", patch: { layers: [] } })).toThrow();
  expect(engine.getSnapshot()).toBe(before);
  engine.undo();
  expect(page().rulers).toBeUndefined();
});
