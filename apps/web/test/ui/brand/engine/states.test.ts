import { expect, test } from "vitest";
import { STATES, SEQUENCE, STATE_BY_ID } from "../../../../src/ui/brand/engine/states";
test("preserves every original state, exact lookup and finite timestamped poses", () => {
  expect(STATES).toHaveLength(15);
  expect(new Set(SEQUENCE).size).toBe(15);
  for (const state of STATES) {
    expect(STATE_BY_ID.get(state.id)).toBe(state);
    expect(state.duration).toBeGreaterThan(0);
    expect(state.morph).toBeGreaterThan(0);
    const frame = state.pose(state.duration / 2);
    expect(frame.sil.radii).toHaveLength(64);
    expect(JSON.stringify(frame)).not.toMatch(/NaN|Infinity/);
  }
});
