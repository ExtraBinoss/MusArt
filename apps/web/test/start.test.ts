import { expect, test } from "vitest";
import { startInstance } from "../src/start";
test("public page SSR stays enabled while individual routes can opt out", async () => {
  expect(await startInstance.getOptions()).toMatchObject({ defaultSsr: true });
});
