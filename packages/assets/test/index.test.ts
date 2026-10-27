import { describe, expect, it } from "vitest";
import { assetKind, assetSvg, loadAssets, SOCIAL_BRANDS } from "../src/index";

describe("portable local artwork", () => {
  it("loads and caches complete catalogs with unique identifiers", async () => {
    const expected = { shapes: 102, icons: 1848, brands: 63 };
    for (const kind of ["shapes", "icons", "brands"] as const) {
      const pending = loadAssets(kind);
      expect(loadAssets(kind)).toBe(pending);
      const items = await pending;
      expect(items).toHaveLength(expected[kind]);
      expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
      for (const item of items) {
        expect(item.viewBox.split(" ").map(Number).every(Number.isFinite)).toBe(true);
        expect(item.path || item.parts?.length).toBeTruthy();
      }
    }
    expect(SOCIAL_BRANDS.find((item) => item.id === "brand-instagram")?.source).toContain(
      "90646e4b",
    );
    expect((await loadAssets("brands")).every((item) => item.attribution)).toBe(true);
  });
  it("classifies artwork and emits escaped vector geometry, paints, transforms and credits", () => {
    expect([assetKind("rectangle"), assetKind("lucide:star"), assetKind("brand-meta")]).toEqual([
      "shapes",
      "icons",
      "brands",
    ]);
    const svg = assetSvg({
      id: "safe",
      name: 'A "<star>" &',
      viewBox: "0 0 24 24",
      attribution: "copyright & credit",
      parts: [
        {
          path: "M0 0L24 24",
          fill: "#fff",
          stroke: "#000",
          strokeWidth: 2,
          opacity: 0.4,
          fillRule: "evenodd",
          linecap: "round",
          linejoin: "bevel",
          matrix: [1, 0, 0, 1, 2, 3],
        },
      ],
    });
    expect(svg).toContain("&quot;&lt;star&gt;&quot; &amp;");
    expect(svg).toContain('transform="matrix(1 0 0 1 2 3)"');
    expect(svg).toContain('opacity="0.4"');
    expect(svg).toContain("<metadata>copyright &amp; credit</metadata>");
    expect(
      assetSvg({
        id: "icon",
        name: "Icon",
        viewBox: "0 0 24 24",
        path: "M1 2L3 4",
        strokeOnly: true,
      }),
    ).toContain('stroke="currentColor"');
    expect(assetSvg({ id: "empty", name: "Empty", viewBox: "0 0 1 1" })).toContain(
      'd="" fill="currentColor"',
    );
  });
});
