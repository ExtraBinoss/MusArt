import { expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@tanstack/react-router", () => ({
  HeadContent: () => <title>Melt</title>,
  Scripts: () => <script src="/client.js" />,
}));
import { RootDocument } from "../../src/routing/RootDocument";
test("the server emits a complete document, theme bootstrap and visible content", () => {
  const html = renderToStaticMarkup(
    <RootDocument>
      <main>Artwork</main>
    </RootDocument>,
  );
  expect(html).toContain('<html lang="fr">');
  expect(html).toContain("<title>Melt</title>");
  expect(html).toContain("musart.theme");
  expect(html).toContain("<main>Artwork</main>");
  expect(html).toContain('src="/client.js"');
});
