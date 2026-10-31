import { expect, test } from "vitest";
import { Route } from "../../src/routes/_workspace.editor";
test("the private editor is excluded from indexing and accepts durable project/template links", () => {
  expect(Route.options.head!({} as never)).toMatchObject({
    meta: expect.arrayContaining([{ name: "robots", content: "noindex, nofollow" }]),
  });
  const validate = Route.options.validateSearch as (
    value: Record<string, unknown>,
  ) => Record<string, unknown>;
  expect(validate({ project: "uuid", automation: 1 })).toMatchObject({
    project: "uuid",
    automation: 1,
  });
});
