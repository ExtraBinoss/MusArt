import { expect, test } from "vitest";
import { relatedCoverageArguments } from "../../scripts/test-related-coverage";

test("direct coverage runs mirrored feature tests without expanding through shared barrels", () => {
  const args = relatedCoverageArguments(["packages/core/src/layers/geometry.ts"], true, () => true);
  expect(args[0]).toBe("run");
  expect(args).not.toContain("related");
  expect(args.at(-1)).toBe("packages/core/test/layers/geometry.test.ts");
  expect(args).toContain("packages/core/src/layers/geometry.ts");
});

test("falls back to related tests for all selected sources when any mirror is absent", () => {
  const first = "apps/web/src/components/Wrapper.tsx";
  const second = "packages/core/src/layers/geometry.ts";
  const hasFile = vi.fn((path: string) => path === "apps/web/test/components/Wrapper.test.tsx");
  const args = relatedCoverageArguments([first, second], true, hasFile);
  expect(hasFile.mock.calls).toEqual([
    ["apps/web/test/components/Wrapper.test.tsx"],
    ["packages/core/test/layers/geometry.test.ts"],
  ]);
  expect(args).toEqual(relatedCoverageArguments([first, second]));
  expect(args.slice(-2)).toEqual([first, second]);
});

test("uses the filesystem to detect an absent mirror instead of silently omitting its source", () => {
  const source = "apps/web/src/no-mirror-for-coverage.ts";
  expect(relatedCoverageArguments([source], true)).toEqual(relatedCoverageArguments([source]));
});

test("selects related tests and only requested source coverage in a separate report", () => {
  const first = "apps/web/src/components/layers/tree/use-row-slots.ts";
  const second = "packages/core/src/layers/geometry.ts";
  const args = relatedCoverageArguments([first, `./${first}`, second]);
  expect(args.slice(0, 3)).toEqual(["related", "--run", "--coverage"]);
  expect(args).toContain("--coverage.reportsDirectory=artifacts/coverage-related");
  expect(args.slice(4)).toEqual([
    "--coverage.include",
    first,
    "--coverage.include",
    second,
    first,
    second,
  ]);
});

test("does not instrument declarations, tests, metadata or paths escaping a source tree", () => {
  for (const path of [
    "apps/web/src/model.d.ts",
    "packages/core/src/model.d.mts",
    "apps/web/test/tree.test.ts",
    "package.json",
    "apps/web/src/../../../outside.ts",
  ])
    expect(() => relatedCoverageArguments([path])).toThrow("No executable sources selected");
  expect(() => relatedCoverageArguments([])).toThrow("No executable sources selected");
});

test("preserves filenames containing spaces as individual process arguments", () => {
  const source = "apps/web/src/a folder/a file.ts";
  expect(relatedCoverageArguments([source]).slice(-3)).toEqual([
    "--coverage.include",
    source,
    source,
  ]);
});
