import { expect, test } from "vitest";
import { Route } from "../../src/routes/__root";
import { brand } from "../../src/ui/brand/config";
import assets from "../../src/ui/brand/assets/manifest.json";

test("the HTML head uses the canonical brand color, generated favicon revision and install manifest", () => {
  const head = Route.options.head!({} as never);
  expect(head).toMatchObject({
    meta: expect.arrayContaining([{ name: "theme-color", content: brand.colors.primary }]),
    links: expect.arrayContaining([{ rel: "manifest", href: "/manifest.webmanifest" }]),
  });
  expect(JSON.stringify(head)).toContain(assets.files["melt.svg"].slice(0, 12));
});
