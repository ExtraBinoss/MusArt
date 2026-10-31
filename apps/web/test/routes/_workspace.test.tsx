import { expect, test } from "vitest";
import { Route } from "../../src/routes/_workspace";
test("the local IndexedDB and GPU workspace cannot render on the server", () => {
  expect(Route.options.ssr).toBe(false);
});
