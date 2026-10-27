import { expect, test, vi } from "vitest";
import {
  EditorEngine,
  createLayer,
  createPage,
  createProject,
  parseProject,
  serializeProject,
  sampleGradientColor,
  validateFillGradient,
  type FillGradient,
} from "../../src";

const gradient: FillGradient = {
  kind: "linear",
  angle: 45,
  stops: [
    { offset: 0, color: "#ff0000" },
    { offset: 0.5, color: "#00ff0080" },
    { offset: 1, color: "transparent" },
  ],
};

test("validates portable linear and radial paints, alpha colors and hard stops", () => {
  expect(() => validateFillGradient(gradient)).not.toThrow();
  expect(() =>
    validateFillGradient({
      ...gradient,
      kind: "radial",
      angle: -360000,
      stops: [gradient.stops[0], gradient.stops[0], ...gradient.stops.slice(1)],
    }),
  ).not.toThrow();
  expect(() => validateFillGradient({ ...gradient, angle: 360000 })).not.toThrow();
});

test("samples straight sRGB and alpha metadata while preserving hard stop boundaries", () => {
  expect(sampleGradientColor(gradient, 0.25)).toBe("#808000c0");
  expect(sampleGradientColor(gradient, 1)).toBe("#00000000");
  const hard: FillGradient = {
    kind: "linear",
    angle: 0,
    stops: [
      { offset: 0, color: "#f00" },
      { offset: 0.5, color: "#f00" },
      { offset: 0.5, color: "#00f8" },
      { offset: 1, color: "#00f8" },
    ],
  };
  expect(sampleGradientColor(hard, 0.499)).toBe("#ff0000ff");
  expect(sampleGradientColor(hard, 0.5)).toBe("#0000ff88");
  expect(sampleGradientColor(hard, 1)).toBe("#0000ff88");
  const alpha: FillGradient = {
    kind: "radial",
    angle: 0,
    stops: [
      { offset: 0, color: "transparent" },
      { offset: 1, color: "#ffffff" },
    ],
  };
  expect(sampleGradientColor(alpha, 0.5)).toBe("#80808080");
  expect(
    sampleGradientColor(
      {
        ...alpha,
        stops: [
          { offset: 0, color: "TRANSPARENT" },
          { offset: 1, color: "#fff" },
        ],
      },
      0,
    ),
  ).toBe("#00000000");
  for (const offset of [-1, NaN, 1.01])
    expect(() => sampleGradientColor(gradient, offset)).toThrow();
});

test.each([
  null,
  [],
  { ...gradient, kind: "conic" },
  { ...gradient, angle: NaN },
  { ...gradient, angle: Infinity },
  { ...gradient, angle: 360001 },
  { ...gradient, angle: -360001 },
  { ...gradient, angle: "45" },
  { ...gradient, stops: [] },
  { ...gradient, stops: [gradient.stops[0]] },
  { ...gradient, stops: Array.from({ length: 9 }, () => gradient.stops[0]) },
  { ...gradient, stops: [null, gradient.stops[2]] },
  { ...gradient, stops: [{ offset: -0.1, color: "#fff" }, gradient.stops[2]] },
  { ...gradient, stops: [gradient.stops[0], { offset: 1.1, color: "#fff" }] },
  { ...gradient, stops: [gradient.stops[0], { offset: 1, color: "url(external)" }] },
  { ...gradient, stops: [gradient.stops[0], gradient.stops[2], gradient.stops[1]] },
  { ...gradient, stops: [gradient.stops[1], gradient.stops[2]] },
  { ...gradient, stops: [gradient.stops[0], gradient.stops[1]] },
])("rejects malformed or unbounded gradient paint %j", (value) => {
  expect(() => validateFillGradient(value)).toThrow();
});

test("commits gradient edits atomically with undo, redo and portable round trips", () => {
  const layer = createLayer("text", { id: "text", text: "Gradient", fill: "#123456" }),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
    changed = vi.fn();
  engine.subscribe(changed);
  engine.execute({ type: "updateLayers", ids: [layer.id], patch: { fillGradient: gradient } });
  const painted = engine.getSnapshot();
  expect(painted.project.pages[0]!.layers[0]).toMatchObject({
    fillGradient: gradient,
    fill: "#123456",
  });
  expect(changed).toHaveBeenCalledTimes(1);
  engine.undo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.fillGradient).toBeUndefined();
  engine.redo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.fillGradient).toEqual(gradient);
  expect(parseProject(serializeProject(engine.getSnapshot().project))).toEqual(painted.project);
  engine.execute({ type: "updateLayers", ids: [layer.id], patch: { fillGradient: undefined } });
  expect(
    parseProject(serializeProject(engine.getSnapshot().project)).pages[0]!.layers[0]!.fillGradient,
  ).toBeUndefined();
  engine.undo();
  expect(engine.getSnapshot().project.pages[0]!.layers[0]!.fillGradient).toEqual(gradient);
});

test("invalid gradient commands and imported documents preserve the current document and history", () => {
  const layer = createLayer("text", { id: "text", text: "Stable" }),
    engine = new EditorEngine(createProject({ pages: [createPage({ layers: [layer] })] })),
    before = engine.getSnapshot(),
    changed = vi.fn(),
    invalid = { ...gradient, stops: [] };
  engine.subscribe(changed);
  expect(() =>
    engine.transaction([
      { type: "renameProject", name: "Must roll back" },
      { type: "updateLayers", ids: [layer.id], patch: { fillGradient: invalid } },
    ]),
  ).toThrow();
  const imported = structuredClone(before.project);
  imported.pages[0]!.layers[0]!.fillGradient = invalid;
  expect(() => engine.load(imported)).toThrow();
  expect(() => parseProject(JSON.stringify(imported))).toThrow();
  expect(engine.getSnapshot()).toBe(before);
  expect(changed).not.toHaveBeenCalled();
});
