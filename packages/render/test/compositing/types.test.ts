import { expect, it } from "vitest";
import { createPage } from "@musart/core";
import { assertRenderSize } from "../../src/compositing/types";
it("validates finite scale and allocation bounds before requesting GPU resources", () => {
  const page = createPage();
  expect(() => assertRenderSize(page, 2)).not.toThrow();
  for (const scale of [0, -1, NaN, 9])
    expect(() => assertRenderSize(page, scale)).toThrow("Échelle");
  expect(() => assertRenderSize({ ...page, width: 20000 }, 1)).toThrow("trop grand");
  expect(() => assertRenderSize({ ...page, width: 10000, height: 10000 }, 1)).toThrow("trop grand");
});
