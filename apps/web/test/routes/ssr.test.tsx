import { expect, test } from "vitest";
import { Route } from "../../src/routes/ssr";
test("the share-image preview is viewable but excluded from search indexing", () => {
  expect(Route.options.head!({} as never)).toMatchObject({
    meta: expect.arrayContaining([{ name: "robots", content: "noindex, nofollow" }]),
  });
});
