import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { audit } from "../../scripts/check-rules";
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "musart-rules-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function file(path: string, text = "export const x=1;\n") {
  const full = join(root, path);
  mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
  writeFileSync(full, text);
}
it("requires exact test mirror and rejects tests under nested src", () => {
  file("packages/core/src/foo/bar.ts");
  file("packages/core/src/deep/a.test.ts");
  file("apps/web/src/__tests__/bad.ts");
  expect(audit(root).map((v) => v.rule)).toEqual(
    expect.arrayContaining(["missing-test", "test-in-src"]),
  );
  file("packages/core/test/foo/bar.test.ts");
  expect(audit(root).filter((v) => v.file === "packages/core/src/foo/bar.ts")).toEqual([]);
});
it("rejects 601 lines, allows 600, ignores dependencies and declarations", () => {
  file("scripts/long.ts", "x\n".repeat(601));
  file("scripts/fine.ts", "x\n".repeat(600));
  file("node_modules/x/src/a.ts");
  file("apps/web/src/vite.d.ts");
  expect(audit(root)).toEqual([
    { file: "scripts/long.ts", rule: "max-lines", detail: "601 lignes > 600" },
  ]);
});
it("ignores only the local reference-clone tree, never third-party production sources", () => {
  file("third_party/clone/ts-slug/src/SlugGenerator.ts", "x\n".repeat(601));
  file("third_party/runtime/src/owned.ts");
  file("apps/web/src/third_party/clone/uncovered.ts");
  expect(audit(root).map((entry) => entry.file)).toEqual([
    "apps/web/src/third_party/clone/uncovered.ts",
    "third_party/runtime/src/owned.ts",
  ]);
});
it("enforces pure core boundaries", () => {
  file("packages/core/src/invalid.ts", `import {atom} from 'jotai';\n`);
  file("packages/core/test/invalid.test.ts");
  expect(audit(root)[0]?.rule).toBe("core-boundary");
});
it("requires real coverage for every source and all four thresholds", () => {
  file("apps/web/src/a.ts");
  file("apps/web/test/a.test.ts");
  expect(audit(root, true)[0]?.rule).toBe("coverage-report");
  file(
    "coverage/coverage-summary.json",
    JSON.stringify({
      total: {
        lines: { pct: 99 },
        statements: { pct: 84 },
        branches: { pct: 80 },
        functions: { pct: 100 },
      },
    }),
  );
  expect(audit(root, true).map((v) => v.rule)).toEqual([
    "coverage-missing-source",
    "coverage-threshold",
    "coverage-threshold",
  ]);
  file(
    "coverage/coverage-summary.json",
    JSON.stringify({
      total: Object.fromEntries(
        ["lines", "statements", "branches", "functions"].map((k) => [k, { pct: 85 }]),
      ),
      [join(root, "apps/web/src/a.ts")]: {},
    }),
  );
  expect(audit(root, true)).toEqual([]);
});

it("rejects GPU readbacks and raw WebGPU rendering in production sources", () => {
  file(
    "packages/render/src/effects/bad.ts",
    "renderer.readRenderTargetPixelsAsync(target); device.createRenderPipeline({});",
  );
  file("packages/render/test/effects/bad.test.ts");
  expect(audit(root).map((v) => v.rule)).toEqual(["gpu-readback", "three-only"]);
});

it("never ignores build/dist/cache directory names inside production source trees", () => {
  for (const directory of ["build", "dist", "artifacts", "coverage", "node_modules"]) {
    file(`apps/web/src/${directory}/nested/illegal.test.ts`, "x\n".repeat(601));
    file(`apps/web/src/${directory}/uncovered.ts`);
  }
  const violations = audit(root);
  for (const directory of ["build", "dist", "artifacts", "coverage", "node_modules"]) {
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: `apps/web/src/${directory}/nested/illegal.test.ts`,
          rule: "test-in-src",
        }),
        expect.objectContaining({
          file: `apps/web/src/${directory}/nested/illegal.test.ts`,
          rule: "max-lines",
        }),
        expect.objectContaining({
          file: `apps/web/src/${directory}/uncovered.ts`,
          rule: "missing-test",
        }),
      ]),
    );
  }
});
it("covers all executable TypeScript/JavaScript extensions with exact mirrors, including mts and cts", () => {
  for (const extension of ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"]) {
    file(`apps/web/src/modules/source.${extension}`);
    file(`apps/web/src/modules/illegal.test.${extension}`);
  }
  const before = audit(root);
  expect(before.filter((v) => v.rule === "missing-test")).toHaveLength(8);
  expect(before.filter((v) => v.rule === "test-in-src")).toHaveLength(8);
  for (const extension of ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"])
    file(`apps/web/test/modules/source.test.${extension}`);
  expect(audit(root).filter((v) => v.rule === "missing-test")).toEqual([]);
  file("apps/web/src/runtime.d.mts");
  file("apps/web/src/runtime.d.cts");
  expect(audit(root).filter((v) => v.file.includes("runtime.d."))).toEqual([]);
});
it.each([
  'import {createRoot} from "react-dom/client";',
  'import type {Root} from "react-dom";',
  'import {Canvas} from "@react-three/fiber";',
  'export {texture} from "three/tsl";',
  'const renderer = await import("three/webgpu");',
  'const react = require("react");',
  'import three = require("three");',
  'import {x} from "../../apps/web/src/state/editor";',
  'import {x} from "../services/storage";',
])("rejects UI/GPU dependencies regardless of module syntax: %s", (source) => {
  file("packages/core/src/invalid.ts", source);
  file("packages/core/test/invalid.test.ts");
  expect(audit(root)).toEqual([expect.objectContaining({ rule: "core-boundary" })]);
});
it("does not mistake documentation strings or comments for forbidden imports", () => {
  file(
    "packages/core/src/pure.ts",
    '// import {Canvas} from "@react-three/fiber";\nconst help = \'import {x} from "three"\';\nexport const value=1;',
  );
  file("packages/core/test/pure.test.ts");
  expect(audit(root)).toEqual([]);
});
function metrics(total: number, covered: number) {
  return Object.fromEntries(
    ["lines", "statements", "functions", "branches"].map((metric) => [
      metric,
      { total, covered, pct: total === 0 ? 100 : (covered / total) * 100 },
    ]),
  );
}
it("rejects a critical package below85 even when the global report is99%", () => {
  file("packages/core/src/engine.ts");
  file("packages/core/test/engine.test.ts");
  file("apps/web/src/app.ts");
  file("apps/web/test/app.test.ts");
  file(
    "coverage/coverage-summary.json",
    JSON.stringify({
      total: metrics(100, 99),
      [join(root, "packages/core/src/engine.ts")]: metrics(1, 0),
      [join(root, "apps/web/src/app.ts")]: metrics(99, 99),
    }),
  );
  const violations = audit(root, true);
  expect(violations).toHaveLength(4);
  expect(
    violations.every(
      (v) => v.rule === "coverage-critical-package" && v.file === "packages/core/src",
    ),
  ).toBe(true);
});
it("uses weighted covered/total counts for critical packages, never averages file percentages", () => {
  file("packages/core/src/large.ts");
  file("packages/core/test/large.test.ts");
  file("packages/core/src/small.ts");
  file("packages/core/test/small.test.ts");
  file(
    "coverage/coverage-summary.json",
    JSON.stringify({
      total: metrics(100, 99),
      [join(root, "packages/core/src/large.ts")]: metrics(99, 99),
      [join(root, "packages/core/src/small.ts")]: metrics(1, 0),
    }),
  );
  expect(audit(root, true)).toEqual([]);
  file(
    "coverage/coverage-summary.json",
    JSON.stringify({
      total: metrics(100, 85),
      [join(root, "packages/core/src/large.ts")]: metrics(99, 84),
      [join(root, "packages/core/src/small.ts")]: metrics(1, 1),
    }),
  );
  expect(audit(root, true)).toEqual([]);
});
it("rejects absent or inconsistent critical metric counts and treats zero executable totals as covered", () => {
  file("packages/core/src/types.ts");
  file("packages/core/test/types.test.ts");
  file(
    "coverage/coverage-summary.json",
    JSON.stringify({
      total: metrics(0, 0),
      [join(root, "packages/core/src/types.ts")]: metrics(0, 0),
    }),
  );
  expect(audit(root, true)).toEqual([]);
  for (const entry of [
    {},
    { ...metrics(1, 1), lines: { total: 1, covered: 2, pct: 100 } },
    { ...metrics(1, 1), functions: { total: -1, covered: 0, pct: 100 } },
    { ...metrics(1, 1), branches: { total: 1.5, covered: 1, pct: 100 } },
  ]) {
    file(
      "coverage/coverage-summary.json",
      JSON.stringify({ total: metrics(1, 1), [join(root, "packages/core/src/types.ts")]: entry }),
    );
    expect(audit(root, true).some((v) => v.rule === "coverage-critical-package")).toBe(true);
  }
});
it("also checks a standalone critical engine package and rejects invalid report JSON", () => {
  file("packages/engine/src/session.ts");
  file("packages/engine/test/session.test.ts");
  file(
    "coverage/coverage-summary.json",
    JSON.stringify({
      total: metrics(100, 100),
      [join(root, "packages/engine/src/session.ts")]: metrics(10, 0),
    }),
  );
  expect(audit(root, true).filter((v) => v.file === "packages/engine/src")).toHaveLength(4);
  for (const report of ["{", "null", "[]"]) {
    file("coverage/coverage-summary.json", report);
    expect(audit(root, true)).toEqual([expect.objectContaining({ rule: "coverage-report" })]);
  }
});
it("rejects non-finite and impossible global percentages", () => {
  file(
    "coverage/coverage-summary.json",
    '{"total":{"lines":{"pct":1e999},"statements":{"pct":101},"functions":{"pct":100},"branches":{"pct":100}}}',
  );
  expect(audit(root, true).filter((v) => v.rule === "coverage-threshold")).toHaveLength(2);
});
