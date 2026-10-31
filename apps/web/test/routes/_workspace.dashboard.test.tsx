import { expect, test } from "vitest";
import { Route } from "../../src/routes/_workspace.dashboard";
test("the private on-device library is excluded from search engines", () => {
  expect(Route.options.head!({} as never)).toMatchObject({
    meta: expect.arrayContaining([{ name: "robots", content: "noindex, nofollow" }]),
  });
});
