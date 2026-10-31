import { createFileRoute, redirect } from "@tanstack/react-router";
import { LandingRoute } from "../routing/LandingRoute";

export const Route = createFileRoute("/")({
  beforeLoad: ({ location }) => {
    const search = new URLSearchParams(location.searchStr);
    if (search.has("automation") || search.has("benchmark"))
      throw redirect({ to: "/editor", search: location.search, replace: true });
  },
  head: () => ({
    meta: [
      { title: "Melt — Design with ease. Animate to captivate." },
      { property: "og:title", content: "Melt — Design with ease. Animate to captivate." },
      {
        property: "og:description",
        content:
          "An open-source creative studio for images, typography and motion. Your projects stay on your device.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: LandingRoute,
});
