import { createFileRoute } from "@tanstack/react-router";
import { SocialCard } from "../ui/brand/ssr/SocialCard";
export const Route = createFileRoute("/ssr")({
  head: () => ({
    meta: [{ title: "Melt · Social image" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: SocialCard,
});
