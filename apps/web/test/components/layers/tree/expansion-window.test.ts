import { expect, test } from "vitest";
import { expansionWindow } from "../../../../src/components/layers/tree/expansion-window";

test("keeps stable row identities and bounded mounted exits in visual order", () => {
  const entries = ["root", "child", "next"].map((key) => ({ key, kind: "layer" }));
  const previous = entries.map((entry, at) => ({ entry, at }));
  const current = [
    { entry: entries[0]!, at: 0 },
    { entry: entries[2]!, at: 1 },
  ];
  const result = expansionWindow(current, previous, [entries[0]!, entries[2]!]);
  expect(result.map((item) => item.entry.key)).toEqual(["root", "child", "next"]);
  expect(result[2]).toBe(current[1]);
  const many = Array.from({ length: 10000 }, (_, at) => ({
    entry: { key: `exit-${at}`, kind: "layer" },
    at,
  }));
  expect(expansionWindow([], many, [])).toHaveLength(64);
  expect(expansionWindow(current, [], entries)).toEqual(current);
});
