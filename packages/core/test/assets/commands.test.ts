import { it, expect } from "vitest";
import { setup, asset } from "../support/fixture";
it("keeps original IDs immutable across the command journal", () => {
  const { engine } = setup();
  engine.execute({ type: "addAssets", assets: [asset()] });
  const before = engine.getSnapshot();
  expect(() =>
    engine.execute({
      type: "addAssets",
      assets: [asset("original", "data:image/png;base64,BBBB")],
    }),
  ).toThrow("déjà présente");
  expect(engine.getSnapshot()).toBe(before);
  engine.undo();
  expect(engine.getSnapshot().project.assets).toEqual({});
});
