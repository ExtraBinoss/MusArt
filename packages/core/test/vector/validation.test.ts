import { it, expect } from "vitest";
import { validateVector } from "../../src/vector/validation";
import { createLayer, createPage, createProject } from "../../src/document/factories";
import { validateProject } from "../../src/document/validation";
it("preserves editable paths, mixed paints and all Resumi part styles", () => {
  const vector = {
    viewBox: "-5,-10,200,100",
    path: "M0 0L10 0h10v5C2 2 3 3 4 4s1 1 2 2q1 2 3 4t5 6A1 2 0 0 1 8 9Z",
    parts: [
      {
        path: "M0 0h10v10Z",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        opacity: 0.5,
        fillRule: "evenodd",
        linecap: "round",
        linejoin: "bevel",
        matrix: [1, 0, 0, 1, 2, 3],
      },
      {
        path: "m0 0z",
        fill: "#f00",
        stroke: "transparent",
        fillRule: "nonzero",
        linecap: "butt",
        linejoin: "miter",
      },
    ],
    strokeOnly: false,
    preserveColors: true,
    attribution: "Resumi MIT",
  };
  expect(() => validateVector(vector)).not.toThrow();
  const project = createProject({
    pages: [createPage({ layers: [createLayer("vector", { vector: vector as never })] })],
  });
  expect(() => validateProject(project)).not.toThrow();
  expect(() =>
    validateProject(createProject({ pages: [createPage({ layers: [createLayer("vector")] })] })),
  ).not.toThrow();
});
it.each([
  null,
  { viewBox: "0 0 0 1", path: "M0 0Z" },
  { viewBox: "0 0 1 Infinity", path: "M0 0Z" },
  { viewBox: "0 0 1 1" },
  { viewBox: "0 0 1 1", parts: [] },
  { viewBox: "0 0 1 1", path: "<script/>" },
  { viewBox: "0 0 1 1", path: "L0 0" },
  ...["fill", "stroke", "strokeWidth", "opacity", "fillRule", "linecap", "linejoin", "matrix"].map(
    (key) => ({
      viewBox: "0 0 1 1",
      parts: [
        {
          path: "M0 0Z",
          [key]:
            key === "matrix"
              ? [1, 2]
              : key === "strokeWidth"
                ? -1
                : key === "opacity"
                  ? 2
                  : "invalid",
        },
      ],
    }),
  ),
  { viewBox: "0 0 1 1", path: "M0 0Z", strokeOnly: 1 },
  { viewBox: "0 0 1 1", path: "M0 0Z", preserveColors: 1 },
  { viewBox: "0 0 1 1", path: "M0 0Z", attribution: "" },
])("rejects malformed or unsafe vector geometry %j", (value) => {
  expect(() => validateVector(value)).toThrow();
});
