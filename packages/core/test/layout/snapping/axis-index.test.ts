import { expect, it } from "vitest";
import { SnapAxisIndex } from "../../../src/layout/snapping/axis-index";
import type { SnapTarget } from "../../../src/layout/snapping/model";
const target = (
  id: string,
  value: number,
  min = 0,
  kind: SnapTarget["kind"] = "layer",
): SnapTarget => ({ axis: "x", id, value, min, max: min, kind });
it("chooses the nearest coordinate and deterministic priority, perpendicular distance and ID ties", () => {
  const index = new SnapAxisIndex([
    target("right", 102),
    target("left", 98),
    target("guide", 98, 80, "guide"),
  ]);
  expect(index.nearest(100, 0, 2).match?.target.id).toBe("guide");
  expect(index.nearest(103, 0, 2).match?.target.id).toBe("right");
  expect(index.nearest(110, 0, 2)).toEqual({ match: null, checks: 0 });
  expect(new SnapAxisIndex([]).nearest(0, 0, 6).match).toBeNull();
  const tie = new SnapAxisIndex([target("z", 10, 2), target("a", 10, 2), target("far", 10, 100)]);
  expect(tie.nearest(10, 0, 0).match?.target.id).toBe("a");
  expect(tie.nearest(10, 100, 0).match?.target.id).toBe("far");
});
it("finds the closest guide even when lower-priority targets hide it in a mixed coordinate run", () => {
  const targets = [
    target("a-far", 100, 1000, "guide"),
    target("z-near", 100, 10, "guide"),
    ...Array.from({ length: 10000 }, (_, i) => target(`layer-${i}`, 100, i / 10000)),
  ];
  const result = new SnapAxisIndex(targets).nearest(100, 0, 6);
  expect(result.match?.target.id).toBe("z-near");
  expect(result.checks).toBeLessThanOrEqual(4);
  expect(
    new SnapAxisIndex([target("low", 100, -2), target("high", 100, 2)]).nearest(100, 0, 6).match
      ?.target.id,
  ).toBe("high");
});
