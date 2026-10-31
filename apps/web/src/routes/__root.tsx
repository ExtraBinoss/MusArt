import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { RootDocument } from "../routing/RootDocument";
import { brand } from "../ui/brand/config";
import assets from "../ui/brand/assets/manifest.json";

const base = import.meta.env.BASE_URL;
export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: brand.name },
      { name: "theme-color", content: brand.colors.primary },
      { property: "og:site_name", content: brand.name },
      { property: "og:image", content: `${brand.site}/branding/melt-social.png` },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "description",
        content:
          "Melt — an open-source creative studio for images, typography and GPU motion. Create freely, with projects stored on your device.",
      },
    ],
    links: [
      { rel: "canonical", href: `${brand.site}/` },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: `${base}${brand.assets.icon}?v=${assets.files["melt.svg"].slice(0, 12)}`,
      },
      { rel: "apple-touch-icon", sizes: "180x180", href: `${base}${brand.assets.appleIcon}` },
      { rel: "manifest", href: `${base}manifest.webmanifest` },
    ],
  }),
  shellComponent: RootDocument,
  component: Outlet,
  notFoundComponent: () => (
    <main className="studio-loading">
      <h1>404</h1>
      <Link to="/">Melt</Link>
    </main>
  ),
});
