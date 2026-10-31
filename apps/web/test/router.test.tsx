import { expect, test } from "vitest";
import { createMemoryHistory } from "@tanstack/react-router";
import { getRouter } from "../src/router";

test("direct dashboard/editor URLs share the same client-only workspace parent", async () => {
  const router = getRouter();
  router.update({
    history: createMemoryHistory({ initialEntries: ["/editor?project=durable-id"] }),
  });
  await router.load();
  expect(router.state.matches.map((match) => match.routeId)).toEqual([
    "__root__",
    "/_workspace",
    "/_workspace/editor",
  ]);
  expect(router.state.location.search).toMatchObject({ project: "durable-id" });
  await router.navigate({ to: "/dashboard" });
  expect(router.state.matches.map((match) => match.routeId)).toEqual([
    "__root__",
    "/_workspace",
    "/_workspace/dashboard",
  ]);
});
