import { expect, test } from "vitest";
import { createMemoryHistory } from "@tanstack/react-router";
import { getRouter } from "../../src/router";
import { Route } from "../../src/routes/index";

test("the landing is indexable and existing automation links reach the editor with their parameters", async () => {
  expect(JSON.stringify(Route.options.head!({} as never))).toContain("og:description");
  const router = getRouter();
  router.update({
    history: createMemoryHistory({ initialEntries: ["/?automation=1&benchmark=50"] }),
  });
  await router.load();
  expect(router.state.location.pathname).toBe("/editor");
  expect(router.state.location.search).toMatchObject({ automation: 1, benchmark: 50 });
});
