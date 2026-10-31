import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/_workspace/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard · Melt" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: () => null,
});
