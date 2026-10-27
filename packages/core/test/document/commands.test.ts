import { it, expect } from "vitest";
import { setup } from "../support/fixture";
it("renames through validated transactions and restores previous name", () => {
  const { engine } = setup();
  const before = engine.getSnapshot();
  expect(() => engine.execute({ type: "renameProject", name: "" })).toThrow();
  expect(engine.getSnapshot()).toBe(before);
  engine.execute({ type: "renameProject", name: "Portable" });
  expect(engine.getSnapshot().project.name).toBe("Portable");
  engine.undo();
  expect(engine.getSnapshot().project.name).toBe(before.project.name);
});
