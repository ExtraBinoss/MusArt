import { expect, test } from "vitest";
import { createDahliaEngine, brandStates } from "../../../src/ui/brand/dahlia";
import { BotEngine } from "../../../src/ui/brand/engine/engine";
import { EXPRESSION_BY_ID } from "../../../src/ui/brand/engine/expressions";
import { SHAPE_BY_ID } from "../../../src/ui/brand/engine/skins";
test("uses the complete source engine's genuine eight-petal Dahlia and wonder expression", () => {
  const engine = createDahliaEngine(),
    expected = new BotEngine(
      100,
      "idle",
      SHAPE_BY_ID.get("fleur8")!.radii,
      EXPRESSION_BY_ID.get("surpris")!,
    );
  expect(engine.sample(0.75)).toEqual(expected.sample(0.75));
  expect(engine.sample(0.75).bodyPath.match(/C/g)).toHaveLength(64);
  expect(engine.sample(0.75).eyes).toHaveLength(2);
  expect(brandStates).toEqual({ idle: "idle", loading: "thinking", preparing: "orbit" });
  const before = engine.sample(1);
  engine.setState("thinking", 1);
  expect(engine.sample(1)).toEqual(before);
  expect(engine.sample(1.5)).not.toEqual(before);
});
