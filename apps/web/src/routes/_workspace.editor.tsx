import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/editor")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ...(typeof search.project === "string" ? { project: search.project } : {}),
    ...(typeof search.template === "string" ? { template: search.template } : {}),
  }),
  head: () => ({
    meta: [{ title: "Editor · Melt" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: () => null,
});
