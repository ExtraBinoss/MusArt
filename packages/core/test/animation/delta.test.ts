import { it, expect } from "vitest";
import { diffReplayState, applyReplayDelta } from "../../src/animation/delta";
import { stateFromProject } from "../../src/animation/state";
import { createProject, createPage } from "../../src/document/factories";
import { box } from "../support/fixture";
import { cloneValue } from "../../src/document/immutable";
import type { ReplayDelta } from "../../src/animation/model";
it("encodes inserts, moves, edits and removals compactly without copying an unchanged document", () => {
  const initial = stateFromProject(
      createProject({ pages: [createPage({ layers: [box("a"), box("b"), box("c")] })] }),
    ),
    after = cloneValue(initial);
  after.pages[0]!.layers = [after.pages[0]!.layers[2]!, box("new"), after.pages[0]!.layers[0]!];
  after.pages[0]!.layers[2]!.x = 42;
  after.assetIds = ["new-asset"];
  const delta = diffReplayState(initial, after);
  expect(delta.some((item) => item.op === "move")).toBe(true);
  expect(delta.some((item) => item.op === "insert")).toBe(true);
  expect(delta.some((item) => item.op === "remove")).toBe(true);
  expect(applyReplayDelta(initial, delta)).toEqual(after);
  expect(initial.pages[0]!.layers[0]!.x).toBe(0);
  expect(diffReplayState(initial, initial)).toEqual([]);
  const one = cloneValue(initial);
  one.pages[0]!.layers[0]!.opacity = 0.4;
  expect(diffReplayState(initial, one)).toEqual([
    { op: "set", path: ["pages", 0, "layers", 0, "opacity"], value: 0.4 },
  ]);
});
it("handles optional object properties and primitive arrays using immutable structural copies", () => {
  const initial = stateFromProject(createProject()),
    after = cloneValue(initial);
  after.pages[0]!.rulers = true;
  after.assetIds = ["a", "b"];
  let delta = diffReplayState(initial, after);
  expect(applyReplayDelta(initial, delta)).toEqual(after);
  delta = diffReplayState(after, initial);
  expect(applyReplayDelta(after, delta)).toEqual(initial);
  expect(applyReplayDelta(initial, [{ op: "set", path: [], value: after }])).toEqual(after);
  const a = { ...initial, extra: [1, 2, 3] },
    b = { ...initial, extra: [1, 4] };
  expect(applyReplayDelta(a, diffReplayState(a, b))).toEqual(b);
  const duplicate = {
    ...initial,
    extra: [
      { id: "same", x: 1 },
      { id: "same", x: 2 },
    ],
  };
  const emptyExtra = { ...initial, extra: [] };
  expect(applyReplayDelta(duplicate, diffReplayState(duplicate, emptyExtra))).toEqual(emptyExtra);
});

it("records distinct edits across ten thousand stable identities without replacing whole arrays", () => {
  const before = stateFromProject(
    createProject({
      pages: [
        createPage({ layers: Array.from({ length: 10000 }, (_, i) => box(`layer-${i}`, i, 0)) }),
      ],
    }),
  );
  const after = cloneValue(before);
  for (const layer of after.pages[0]!.layers) layer.x += 10;
  const delta = diffReplayState(before, after);
  expect(delta).toHaveLength(10000);
  expect(delta[0]).toEqual({ op: "set", path: ["pages", 0, "layers", 0, "x"], value: 10 });
  expect(delta.at(-1)).toEqual({
    op: "set",
    path: ["pages", 0, "layers", 9999, "x"],
    value: 10009,
  });
  expect(delta.every((operation) => operation.op === "set" && operation.path.length === 5)).toBe(
    true,
  );
});

it("encodes moving the first of ten thousand layers to the end as one replay operation", () => {
  const before = stateFromProject(
    createProject({
      pages: [createPage({ layers: Array.from({ length: 10000 }, (_, i) => box(`layer-${i}`)) })],
    }),
  );
  const layers = before.pages[0]!.layers,
    after = {
      ...before,
      pages: [{ ...before.pages[0]!, layers: [...layers.slice(1), layers[0]!] }],
    },
    delta = diffReplayState(before, after);
  expect(delta).toEqual([
    { op: "move", from: ["pages", 0, "layers", 0], path: ["pages", 0, "layers", 9999] },
  ]);
  expect(applyReplayDelta(before, delta)).toEqual(after);
  expect(before.pages[0]!.layers[0]!.id).toBe("layer-0");
});

it.each([
  { from: 4, to: 1 },
  { from: 1, to: 4 },
  { from: 4, to: 0 },
  { from: 0, to: 1 },
])("preserves edits at their final indices after one move $from→$to", ({ from, to }) => {
  const before = stateFromProject(
      createProject({
        pages: [createPage({ layers: ["a", "b", "c", "d", "e", "f"].map((id) => box(id)) })],
      }),
    ),
    after = cloneValue(before),
    layers = after.pages[0]!.layers,
    moved = layers.splice(from, 1)[0]!;
  layers.splice(to, 0, moved);
  moved.x = 42;
  const other = to === 2 ? 3 : 2;
  layers[other]!.opacity = 0.4;
  const delta = diffReplayState(before, after),
    moves = delta.filter((operation) => operation.op === "move");
  expect(moves).toHaveLength(1);
  expect(delta[0]).toMatchObject({ op: "move" });
  expect(delta).toContainEqual({ op: "set", path: ["pages", 0, "layers", to, "x"], value: 42 });
  expect(delta).toContainEqual({
    op: "set",
    path: ["pages", 0, "layers", other, "opacity"],
    value: 0.4,
  });
  expect(applyReplayDelta(before, delta)).toEqual(after);
  expect(before.pages[0]!.layers[from]!.x).toBe(0);
});

it.each([
  ["a", "c", "e", "b", "d", "f"],
  ["a", "b", "new", "d", "e", "f"],
  ["b", "c", "d", "e", "f"],
  ["a", "b", "c", "d", "e", "f", "new"],
  ["d", "b", "c", "a", "e", "f"],
  ["a", "b", "c", "f", "e", "d"],
])(
  "retains the exact general diff for permutations, replacements and length changes %j",
  (...ids) => {
    const before = stateFromProject(
        createProject({
          pages: [createPage({ layers: ["a", "b", "c", "d", "e", "f"].map((id) => box(id)) })],
        }),
      ),
      after = { ...before, pages: [{ ...before.pages[0]!, layers: ids.map((id) => box(id)) }] },
      delta = diffReplayState(before, after);
    expect(applyReplayDelta(before, delta)).toEqual(after);
    if (ids.length === 6 && ids.every((id) => id !== "new"))
      expect(delta.filter((operation) => operation.op === "move").length).toBeGreaterThan(1);
  },
);

it("copies a large replay container once per batch and never mutates the source or operation values", () => {
  const initial = stateFromProject(
    createProject({
      pages: [
        createPage({ layers: Array.from({ length: 10000 }, (_, i) => box(`layer-${i}`, i, 0)) }),
      ],
    }),
  );
  let copies = 0;
  const original = initial.pages[0]!;
  const layers = new Proxy(original.layers, {
    get(target, key, receiver) {
      if (key === Symbol.iterator) copies++;
      return Reflect.get(target, key, receiver);
    },
  });
  const source = { ...initial, pages: [{ ...original, layers }] };
  const operations: ReplayDelta[] = layers.flatMap((layer, index) => [
    { op: "set", path: ["pages", 0, "layers", index, "x"], value: layer.x + 10 },
    { op: "set", path: ["pages", 0, "layers", index, "y"], value: 20 },
  ]);
  const output = applyReplayDelta(source, operations);
  expect(copies).toBe(1);
  expect(output.pages[0]!.layers.at(-1)).toMatchObject({ x: 10009, y: 20 });
  expect(source.pages[0]!.layers.at(-1)).toMatchObject({ x: 9999, y: 0 });
  expect(() =>
    applyReplayDelta(source, [
      { op: "set", path: ["name"], value: "temporary" },
      { op: "remove", path: ["missing", "child"] },
    ]),
  ).toThrow();
  expect(source.name).toBe(initial.name);
});
it.each(
  (
    [
      [{ op: "set", path: ["__proto__", "polluted"], value: true }],
      [{ op: "move", from: ["missing"], path: ["assetIds", 0] }],
      [{ op: "remove", path: [] }],
      [{ op: "insert", path: ["name"], value: "bad" }],
      [{ op: "remove", path: ["missing"] }],
      [{ op: "set", path: ["pages", -1], value: {} }],
      [{ op: "set", path: ["missing", "child"], value: 1 }],
    ] as ReplayDelta[][]
  ).map((delta) => ({ delta })),
)("rejects unsafe or nonexistent delta paths %j", ({ delta }) => {
  expect(() => applyReplayDelta(stateFromProject(createProject()), delta)).toThrow();
  expect(({} as Record<string, unknown>).polluted).toBeUndefined();
});
