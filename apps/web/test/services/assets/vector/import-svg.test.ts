import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { importSvg } from "../../../../src/services/assets/vector/import-svg";
const svg = (body: string, attrs = 'viewBox="10 20 100 80"') =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
const path = '<path d="M10 20h20v20H10z"/>';
let context: { fillStyle: string };
beforeEach(() => {
  let fill = "#000000";
  context = {
    get fillStyle() {
      return fill;
    },
    set fillStyle(value: string) {
      const named: Record<string, string> = {
        red: "#ff0000",
        blue: "#0000ff",
        green: "#008000",
        white: "#ffffff",
        black: "#000000",
      };
      fill =
        named[value] ??
        (/^#[0-9a-f]{3}$/i.test(value)
          ? "#" +
            value
              .slice(1)
              .split("")
              .map((c) => c + c)
              .join("")
          : value);
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (() => context) as unknown as HTMLCanvasElement["getContext"],
  );
  vi.stubGlobal("CSS", {
    supports: vi.fn((_property: string, value: string) => value !== "not-a-color"),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("imports portable geometry, metadata and browser-normalized solid colors without attaching SVG to the DOM", () => {
  const originalChildren = document.body.childElementCount,
    append = vi.spyOn(document.body, "appendChild");
  const result = importSvg(
    svg(
      '<title>Brand</title><desc>Licensed artwork</desc><metadata>Safe text</metadata><path d="M10 20h20v20H10z" fill="red" stroke="#123" fill-opacity=".5" stroke-opacity=".25" opacity=".8" stroke-width="2px" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="bevel"/>',
    ),
    "Brand.svg",
  );
  expect(result).toMatchObject({
    id: expect.any(String),
    name: "Brand",
    viewBox: "10 20 100 80",
    path: "M10 20h20v20H10z",
    parts: [
      {
        fill: "#ff000080",
        stroke: "#11223340",
        strokeWidth: 2,
        opacity: 0.8,
        fillRule: "evenodd",
        linecap: "round",
        linejoin: "bevel",
        matrix: [1, 0, 0, 1, 0, 0],
      },
    ],
  });
  expect(result.attribution).toContain("Brand.svg\nBrand\nLicensed artwork");
  expect(document.body.childElementCount).toBe(originalChildren);
  expect(append).not.toHaveBeenCalled();
});
it("preserves currentColor inheritance, style precedence and multiplied single-shape container opacity", () => {
  const result = importSvg(
    svg(
      '<g color="red" fill="currentColor" opacity=".5"><g opacity=".5"><path d="M0 0L10 10" color="blue" style="stroke:currentColor;stroke-width:3;fill-opacity:.5" fill="#fff"/><title>x</title></g></g>',
    ),
    "icon.svg",
  );
  expect(result.parts![0]).toMatchObject({
    fill: "#ffffff80",
    stroke: "#0000ff",
    strokeWidth: 3,
    opacity: 0.25,
  });
  const inherited = importSvg(
    svg('<g color="red" fill="currentColor"><path d="M0 0L10 10" color="blue"/></g>'),
    "color.svg",
  );
  expect(inherited.parts![0]!.fill).toBe("#0000ff");
  const current = importSvg(
    svg('<g color="blue"><path d="M0 0L10 10" color="currentColor" fill="currentColor"/></g>'),
    "color.svg",
  );
  expect(current.parts![0]!.fill).toBe("#0000ff");
});
it("rejects multi-shape group or root opacity instead of changing overlap alpha", () => {
  for (const body of [
    '<g opacity=".5"><rect width="10" height="10"/><rect x="5" width="10" height="10"/></g>',
    '<g style="opacity:.5"><g>' + path + "</g>" + path + "</g>",
  ])
    expect(() => importSvg(svg(body), "bad.svg")).toThrow("Group opacity");
  expect(() => importSvg(svg(path + path, 'viewBox="0 0 20 20" opacity=".5"'), "bad.svg")).toThrow(
    "Group opacity",
  );
  expect(importSvg(svg('<g opacity=".5">' + path + "</g>"), "one.svg").parts![0]!.opacity).toBe(
    0.5,
  );
});
it("combines parent transforms in SVG order and retains all supported transform forms", () => {
  const result = importSvg(
    svg(
      '<g transform="translate(10 20) scale(2)"><path d="M0 0L10 10" transform="rotate(90 1 2)"/></g>',
    ),
    "transform.svg",
  );
  const matrix = result.parts![0]!.matrix!;
  expect(matrix[0]).toBeCloseTo(0);
  expect(matrix[1]).toBeCloseTo(2);
  expect(matrix[2]).toBeCloseTo(-2);
  expect(matrix[3]).toBeCloseTo(0);
  expect(matrix[4]).toBeCloseTo(16);
  expect(matrix[5]).toBeCloseTo(22);
  for (const transform of [
    "matrix(1 2 3 4 5 6)",
    "translate(3)",
    "scale(2 3)",
    "rotate(30)",
    "skewX(15)",
    "skewY(-15)",
    "translate(1,2),rotate(30)",
  ])
    expect(
      importSvg(svg(`<path d="M0 0L1 1" transform="${transform}"/>`), "x.svg").parts![0]!.matrix,
    ).toHaveLength(6);
});
it("converts primitive geometry, rounded rectangles, scientific numbers and intrinsic dimensions to paths", () => {
  const result = importSvg(
    svg(
      '<rect x="1" y="2" width="20" height="10"/><rect width="20" height="10" rx="2"/><circle cx="4" cy="5" r="3"/><ellipse rx="3" ry="2"/><line x1="1" y1="2" x2="3" y2="4"/><polyline points="0,0 1,2 3,4"/><polygon points="0,0 1,2 3,4"/><path d="M1e-2 -2E+1L3 4"/>',
      'width="100px" height="80"',
    ),
    "primitives.svg",
  );
  expect(result.viewBox).toBe("0 0 100 80");
  expect(result.parts).toHaveLength(8);
  expect(result.parts![0]!.path).toBe("M1 2h20v10h-20Z");
  expect(result.parts![1]!.path).toContain("A2 2");
  expect(result.parts![2]!.path).toBe("M1 5A3 3 0 1 0 7 5A3 3 0 1 0 1 5Z");
  expect(result.parts![4]!.path).toBe("M1 2L3 4");
  expect(result.parts![5]!.path).toBe("M0 0 1 2 3 4");
  expect(result.parts![6]!.path).toBe("M0 0 1 2 3 4Z");
});
it("supports RGB/RGBA normalization, existing alpha and transparent paints", () => {
  const result = importSvg(
    svg(
      '<path d="M0 0L1 1" fill="rgba(12, 34, 56, 0.5)" fill-opacity=".5" stroke="rgb(12, 34, 56)"/><path d="M0 0L1 1" fill="none" stroke="transparent"/>',
    ),
    "rgba.svg",
  );
  expect(result.parts![0]).toMatchObject({ fill: "#0c223840", stroke: "#0c2238" });
  expect(result.parts![1]).toMatchObject({ fill: "none", stroke: "transparent" });
  expect(importSvg(svg(path), "").name).toBe("Imported SVG");
  expect(importSvg(svg(path), "a".repeat(150) + ".SVG").name).toHaveLength(120);
});
it.each([
  ["<script>alert(1)</script>", "Unsupported element"],
  ["<foreignObject/>", "Unsupported element"],
  ['<image href="https://example.com/x"/>', "Unsupported element"],
  ['<use href="#x"/>', "Unsupported element"],
  ["<style>path{fill:red}</style>", "Unsupported element"],
  ['<path d="M0 0" onclick="x()"/>', "Unsupported attribute"],
  ['<g xmlns="https://evil.example">' + path + "</g>", "Foreign content"],
  ['<path d="M0 0" href="https://example.com"/>', "Unsupported attribute"],
  ['<path d="M0 0" style="filter:blur(1px)"/>', "Unsupported style"],
  ['<path d="M0 0" style="broken"/>', "Unsupported style"],
  ['<path d="M0 0" fill="url(#gradient)"/>', "Unsupported color"],
  ['<path d="M0 0" fill="var(--color)"/>', "Unsupported color"],
  ['<path d="M0 0" fill="not-a-color"/>', "Unsupported color"],
  ['<path d="M0 0" fill="color(display-p3 1 0 0)"/>', "sRGB solid"],
  ['<path d="M0 0" stroke-width="-1"/>', "numeric value"],
  ['<path d="M0 0" opacity="2"/>', "numeric value"],
  ['<path d="M0 0" fill-rule="invalid"/>', "fill rule"],
  ['<path d="M0 0" stroke-linecap="triangle"/>', "stroke cap"],
  ['<path d="M0 0" stroke-linejoin="arcs"/>', "stroke join"],
  ['<rect width="-1" height="4"/>', "negative dimensions"],
  ['<rect width="4" height="4" rx="-1"/>', "negative corners"],
  ['<circle r="-1"/>', "negative radius"],
  ['<polygon points="1 2 3"/>', "polygon points"],
  ['<path d="M0 0X1 1"/>', "unsupported commands"],
  ['<path d="M0 0" transform="translate()"/>', "translation"],
  ['<path d="M0 0" transform="translate(1 2 3)"/>', "translation"],
  ['<path d="M0 0" transform="scale()"/>', "scale"],
  ['<path d="M0 0" transform="rotate(1 2)"/>', "rotation"],
  ['<path d="M0 0" transform="skewX(1 2)"/>', "skew"],
  ['<path d="M0 0" transform="matrix(1 2)"/>', "six numbers"],
  ['<path d="M0 0" transform="warp(1)"/>', "Unsupported transform"],
  ['<path d="M0 0" transform="translate(1) junk"/>', "Unsupported transform"],
  ['<path d="M0 0" transform="scale(1000) scale(1000)"/>', "too large"],
  ['<g transform="scale(1000)"><path d="M0 0" transform="scale(1000)"/></g>', "too large"],
  ['<line x1="NaN"/>', "numeric value"],
  ['<line x1="100001"/>', "numeric value"],
])("rejects unsafe or unrepresentable input %s", (body, message) => {
  expect(() => importSvg(svg(body), "invalid.svg")).toThrow(message);
});
it("enforces bounded source, nesting, path and element limits before producing portable artwork", () => {
  expect(() => importSvg("x".repeat(256001), "large.svg")).toThrow("256 KB");
  expect(() => importSvg("<!DOCTYPE svg>" + svg(path), "doctype.svg")).toThrow("Document types");
  expect(() => importSvg('<!ENTITY x "hello">' + svg(path), "entity.svg")).toThrow(
    "Document types",
  );
  expect(() => importSvg("<?danger x?>" + svg(path), "pi.svg")).toThrow("Processing instructions");
  for (const source of [
    "<html/>",
    "<svg><path></svg>",
    svg(path, 'viewBox="0 0 0 0"'),
    svg(path, 'viewBox="0 0 10"'),
    svg(path, 'width="100%" height="10"'),
  ])
    expect(() => importSvg(source, "invalid.svg")).toThrow();
  expect(() => importSvg(svg("<g/>".repeat(513)), "elements.svg")).toThrow("too many elements");
  expect(() => importSvg(svg("<g>".repeat(33) + path + "</g>".repeat(33)), "deep.svg")).toThrow(
    "too deeply",
  );
  expect(() => importSvg(svg('<path d="M' + "1 1 ".repeat(5001) + '"/>'), "path.svg")).toThrow(
    "path is too large",
  );
  expect(() => importSvg(svg(path.repeat(65)), "paths.svg")).toThrow("64 paths");
  expect(() =>
    importSvg(svg('<path d="M' + "1 1 ".repeat(3500) + '"/>'.repeat(1)), "none.svg"),
  ).not.toThrow();
  expect(() =>
    importSvg(
      svg(Array.from({ length: 5 }, () => '<path d="M' + "1 1 ".repeat(4200) + '"/>').join("")),
      "total.svg",
    ),
  ).toThrow("64 paths");
  expect(() =>
    importSvg(
      svg('<path d="M0 0" transform="' + "translate(1) ".repeat(33) + '"/>'),
      "transforms.svg",
    ),
  ).toThrow("Unsupported transform");
  for (const body of [
    "",
    "<path/>",
    '<rect width="0" height="1"/>',
    '<circle r="0"/>',
    '<ellipse rx="1" ry="0"/>',
  ])
    expect(() => importSvg(svg(body), "empty.svg")).toThrow("no supported visible shapes");
});
it("rejects unavailable native color conversion and accepts safe metadata/attributes and XML declaration", () => {
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValueOnce(null);
  expect(() => importSvg(svg(path), "none.svg")).toThrow("Color conversion");
  expect(
    importSvg(
      '<?xml version="1.0"?>' +
        svg(
          '<title>Safe</title><path d="M0 0L1 1" aria-label="shape" data-id="local" fill="#11223380" fill-opacity=".5"/>',
        ),
      "safe.svg",
    ).parts![0]!.fill,
  ).toBe("#11223340");
});

it("retains none as geometry semantics when fill/stroke opacity is inherited", () => {
  const result = importSvg(
    svg('<g fill="none" fill-opacity=".5"><path d="M0 0L10 10" stroke="#ffffff"/></g>'),
    "outline.svg",
  );
  expect(result.parts![0]!.fill).toBe("none");
  expect(result.parts![0]!.stroke).toBe("#ffffff");
});
