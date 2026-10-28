// Copied from ResumI (MIT); see docs/legal/resumi-MIT.txt.
// Solid input colors are normalized by the browser without reading pixels.
import type { VectorArtwork } from "@musart/assets";

type Vector = VectorArtwork;
type Part = NonNullable<Vector["parts"]>[number];
type Matrix = [number, number, number, number, number, number];
type Paint = {
  fill: string;
  stroke: string;
  color: string;
  strokeWidth: number;
  fillOpacity: number;
  strokeOpacity: number;
  opacity: number;
  fillRule: "nonzero" | "evenodd";
  linecap: "butt" | "round" | "square";
  linejoin: "miter" | "round" | "bevel";
};
export type ImportedSvg = Vector & { id: string; name: string };
const identity: Matrix = [1, 0, 0, 1, 0, 0];
const numeric = /^[+-]?(?:\d*\.\d+|\d+\.?\d*)(?:e[+-]?\d+)?$/i;
const pathPattern = /^[MmZzLlHhVvCcSsQqTtAaEe0-9.,+\s-]+$/;
const paints = new Set([
  "fill",
  "stroke",
  "color",
  "stroke-width",
  "fill-rule",
  "fill-opacity",
  "stroke-opacity",
  "opacity",
  "stroke-linecap",
  "stroke-linejoin",
]);
const attributes = new Set([
  "id",
  "class",
  "role",
  "xmlns",
  "xmlns:xlink",
  "version",
  "style",
  "transform",
  "viewBox",
  "width",
  "height",
  "preserveAspectRatio",
  "x",
  "y",
  "rx",
  "ry",
  "cx",
  "cy",
  "r",
  "x1",
  "y1",
  "x2",
  "y2",
  "points",
  "d",
  ...paints,
]);
function fail(message: string): never {
  throw new Error(`SVG import: ${message}`);
}
function number(value: string | null, fallback = 0, min = -100000, max = 100000) {
  if (value == null || value === "") return fallback;
  const text = value.trim().replace(/px$/, "");
  const parsed = Number(text);
  if (!numeric.test(text) || !Number.isFinite(parsed) || parsed < min || parsed > max)
    fail(`Unsupported numeric value “${value}”.`);
  return parsed;
}
function numbers(value: string) {
  if (!value.trim()) return [];
  return value
    .trim()
    .split(/[\s,]+/)
    .map((part) => number(part));
}
function format(value: number) {
  return value.toFixed(6).replace(/\.?0+$/, "") || "0";
}
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}
function transform(value: string | null): Matrix {
  if (!value?.trim()) return identity;
  const matches = [...value.matchAll(/([a-z]+)\s*\(([^)]*)\)/gi)];
  if (
    !matches.length ||
    matches.length > 32 ||
    value.replace(/([a-z]+)\s*\(([^)]*)\)/gi, "").replace(/[\s,]/g, "")
  )
    fail("Unsupported transform.");
  return matches.reduce<Matrix>((matrix, match) => {
    const args = numbers(match[2]),
      [a, b, c] = args;
    let next: Matrix;
    switch (match[1]) {
      case "matrix":
        if (args.length !== 6) fail("A matrix needs six numbers.");
        next = args as Matrix;
        break;
      case "translate":
        if (args.length < 1 || args.length > 2) fail("Unsupported translation.");
        next = [1, 0, 0, 1, a, b ?? 0];
        break;
      case "scale":
        if (args.length < 1 || args.length > 2) fail("Unsupported scale.");
        next = [a, 0, 0, b ?? a, 0, 0];
        break;
      case "rotate": {
        if (args.length !== 1 && args.length !== 3) fail("Unsupported rotation.");
        const angle = (a * Math.PI) / 180;
        next = [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0];
        if (args.length === 3)
          next = multiply(multiply([1, 0, 0, 1, b, c], next), [1, 0, 0, 1, -b, -c]);
        break;
      }
      case "skewX":
      case "skewY": {
        if (args.length !== 1) fail("Unsupported skew.");
        const amount = Math.tan((a * Math.PI) / 180);
        next = match[1] === "skewX" ? [1, 0, amount, 1, 0, 0] : [1, amount, 0, 1, 0, 0];
        break;
      }
      default:
        return fail(`Unsupported transform “${match[1]}”.`);
    }
    const result = multiply(matrix, next);
    if (result.some((entry) => !Number.isFinite(entry) || Math.abs(entry) > 100000))
      fail("The transform is too large.");
    return result;
  }, identity);
}
function color(value: string, context: CanvasRenderingContext2D) {
  const text = value.trim();
  if (text === "none") return "none";
  if (text === "transparent") return "transparent";
  if (/url\s*\(|var\s*\(/i.test(text) || !CSS.supports("color", text))
    fail(`Unsupported color “${text}”. Use a solid color.`);
  context.fillStyle = "#000000";
  context.fillStyle = text;
  const normalized = context.fillStyle;
  if (/^#[0-9a-f]{6,8}$/i.test(normalized)) return normalized;
  const rgba = normalized.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/,
  );
  if (!rgba) fail(`Unsupported color “${text}”. Use an sRGB solid color.`);
  const rgb = rgba.slice(1, 4).map(Number);
  const opacity = rgba[4] === undefined ? 1 : Number(rgba[4]);
  return `#${[...rgb, ...(opacity === 1 ? [] : [Math.round(opacity * 255)])]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}
function alpha(value: string, opacity: number) {
  if (value === "none" || value === "transparent" || opacity === 1) return value;
  const existing = value.length === 9 ? parseInt(value.slice(7), 16) / 255 : 1;
  return `${value.slice(0, 7)}${Math.round(existing * opacity * 255)
    .toString(16)
    .padStart(2, "0")}`;
}
function paint(node: Element, inherited: Paint, context: CanvasRenderingContext2D): Paint {
  const rules = new Map<string, string>();
  for (const key of paints) {
    const value = node.getAttribute(key);
    if (value !== null) rules.set(key, value);
  }
  for (const declaration of (node.getAttribute("style") ?? "").split(";")) {
    if (!declaration.trim()) continue;
    const colon = declaration.indexOf(":"),
      key = declaration.slice(0, colon).trim();
    if (colon < 0 || !paints.has(key)) fail(`Unsupported style “${key}”.`);
    rules.set(key, declaration.slice(colon + 1).trim());
  }
  const next = { ...inherited };
  if (rules.has("color") && rules.get("color") !== "currentColor")
    next.color = color(rules.get("color")!, context);
  for (const key of ["fill", "stroke"] as const) {
    const value = rules.get(key);
    if (value) next[key] = value === "currentColor" ? "currentColor" : color(value, context);
  }
  next.strokeWidth = number(rules.get("stroke-width") ?? null, inherited.strokeWidth, 0, 100);
  next.fillOpacity = number(rules.get("fill-opacity") ?? null, inherited.fillOpacity, 0, 1);
  next.strokeOpacity = number(rules.get("stroke-opacity") ?? null, inherited.strokeOpacity, 0, 1);
  next.opacity *= number(rules.get("opacity") ?? null, 1, 0, 1);
  const rule = rules.get("fill-rule"),
    cap = rules.get("stroke-linecap"),
    join = rules.get("stroke-linejoin");
  if (rule) {
    if (rule !== "nonzero" && rule !== "evenodd") fail("Unsupported fill rule.");
    next.fillRule = rule;
  }
  if (cap) {
    if (cap !== "butt" && cap !== "round" && cap !== "square") fail("Unsupported stroke cap.");
    next.linecap = cap;
  }
  if (join) {
    if (join !== "miter" && join !== "round" && join !== "bevel") fail("Unsupported stroke join.");
    next.linejoin = join;
  }
  return next;
}
function geometry(node: Element) {
  const n = (key: string, fallback = 0) => number(node.getAttribute(key), fallback);
  const f = (key: string, fallback = 0) => format(n(key, fallback));
  switch (node.localName) {
    case "path":
      return node.getAttribute("d")?.trim() ?? "";
    case "line":
      return `M${f("x1")} ${f("y1")}L${f("x2")} ${f("y2")}`;
    case "polyline":
    case "polygon": {
      const points = numbers(node.getAttribute("points") ?? "");
      if (points.length < 4 || points.length % 2) fail("Invalid polygon points.");
      return `M${points.map(format).join(" ")}${node.localName === "polygon" ? "Z" : ""}`;
    }
    case "rect": {
      const x = n("x"),
        y = n("y"),
        w = n("width"),
        h = n("height");
      if (w < 0 || h < 0) fail("A rectangle cannot have negative dimensions.");
      if (!w || !h) return "";
      const rx = Math.min(w / 2, n("rx", n("ry"))),
        ry = Math.min(h / 2, n("ry", n("rx")));
      if (rx < 0 || ry < 0) fail("A rectangle cannot have negative corners.");
      if (!rx || !ry) return `M${format(x)} ${format(y)}h${format(w)}v${format(h)}h${format(-w)}Z`;
      return `M${format(x + rx)} ${format(y)}H${format(x + w - rx)}A${format(rx)} ${format(ry)} 0 0 1 ${format(x + w)} ${format(y + ry)}V${format(y + h - ry)}A${format(rx)} ${format(ry)} 0 0 1 ${format(x + w - rx)} ${format(y + h)}H${format(x + rx)}A${format(rx)} ${format(ry)} 0 0 1 ${format(x)} ${format(y + h - ry)}V${format(y + ry)}A${format(rx)} ${format(ry)} 0 0 1 ${format(x + rx)} ${format(y)}Z`;
    }
    case "circle":
    case "ellipse": {
      const x = n("cx"),
        y = n("cy"),
        rx = n(node.localName === "circle" ? "r" : "rx"),
        ry = n(node.localName === "circle" ? "r" : "ry");
      if (rx < 0 || ry < 0) fail("A circle cannot have a negative radius.");
      if (!rx || !ry) return "";
      return `M${format(x - rx)} ${format(y)}A${format(rx)} ${format(ry)} 0 1 0 ${format(x + rx)} ${format(y)}A${format(rx)} ${format(ry)} 0 1 0 ${format(x - rx)} ${format(y)}Z`;
    }
    default:
      return fail(`Unsupported element <${node.localName}>. Convert it to paths first.`);
  }
}

/** Called only in a browser file-input event; no source SVG enters the live DOM. */
export function importSvg(source: string, filename: string): ImportedSvg {
  if (new TextEncoder().encode(source).length > 256000) fail("Choose a file under 256 KB.");
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) fail("Document types and entities are not supported.");
  if (/<\?(?!xml\s)/i.test(source)) fail("Processing instructions are not supported.");
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = parsed.documentElement;
  if (root.localName !== "svg" || parsed.querySelector("parsererror"))
    fail("This file is not valid SVG.");
  const all = [root, ...root.querySelectorAll("*")];
  if (all.length > 512) fail("This SVG contains too many elements.");
  const supported = new Set([
    "svg",
    "g",
    "title",
    "desc",
    "metadata",
    "path",
    "rect",
    "circle",
    "ellipse",
    "polyline",
    "polygon",
    "line",
  ]);
  for (const node of all) {
    if (!supported.has(node.localName))
      fail(`Unsupported element <${node.localName}>. Convert it to paths first.`);
    if (node.namespaceURI && node.namespaceURI !== "http://www.w3.org/2000/svg")
      fail("Foreign content is not supported.");
    for (const attribute of node.attributes) {
      if (
        !attributes.has(attribute.name) &&
        !attribute.name.startsWith("aria-") &&
        !attribute.name.startsWith("data-")
      )
        fail(`Unsupported attribute “${attribute.name}”.`);
    }
  }
  const box = root.getAttribute("viewBox");
  const bounds = box
    ? numbers(box)
    : [0, 0, number(root.getAttribute("width")), number(root.getAttribute("height"))];
  if (bounds.length !== 4 || bounds[2] <= 0 || bounds[3] <= 0)
    fail("Add a viewBox or numeric width and height.");
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) fail("Color conversion is unavailable in this browser.");
  const parts: Part[] = [];
  function walk(node: Element, inherited: Paint, matrix: Matrix, depth: number) {
    if (depth > 32) fail("The SVG is nested too deeply.");
    if (["title", "desc", "metadata"].includes(node.localName)) return;
    const next = paint(node, inherited, context!),
      combined = multiply(matrix, transform(node.getAttribute("transform")));
    if (combined.some((value) => Math.abs(value) > 100000)) fail("The transform is too large.");
    if (node.localName === "g" || node === root) {
      // A flat parts list cannot isolate overlapping shapes before applying group opacity.
      if (
        next.opacity !== inherited.opacity &&
        next.opacity > 0 &&
        node.querySelectorAll("path,rect,circle,ellipse,polyline,polygon,line").length > 1
      )
        fail("Group opacity across multiple shapes is unsupported. Flatten it before importing.");
      for (const child of node.children) walk(child, next, combined, depth + 1);
      return;
    }
    const path = geometry(node);
    if (!path) return;
    if (path.length > 20000 || !pathPattern.test(path))
      fail("The path is too large or contains unsupported commands.");
    parts.push({
      path,
      fill: alpha(next.fill === "currentColor" ? next.color : next.fill, next.fillOpacity),
      stroke: alpha(next.stroke === "currentColor" ? next.color : next.stroke, next.strokeOpacity),
      strokeWidth: next.strokeWidth,
      opacity: next.opacity,
      fillRule: next.fillRule,
      linecap: next.linecap,
      linejoin: next.linejoin,
      matrix: combined,
    });
    if (parts.length > 64 || parts.reduce((sum, part) => sum + part.path.length, 0) > 80000)
      fail("Simplify this SVG to at most 64 paths.");
  }
  walk(
    root,
    {
      fill: "#000000",
      stroke: "transparent",
      color: "#000000",
      strokeWidth: 1,
      fillOpacity: 1,
      strokeOpacity: 1,
      opacity: 1,
      fillRule: "nonzero",
      linecap: "butt",
      linejoin: "miter",
    },
    identity,
    0,
  );
  if (!parts.length) fail("This SVG has no supported visible shapes.");
  const name = filename.replace(/\.svg$/i, "").slice(0, 120) || "Imported SVG";
  return {
    id: crypto.randomUUID(),
    name,
    viewBox: bounds.map(format).join(" "),
    path: parts[0].path,
    parts,
    attribution:
      `Imported SVG: ${filename}\n${root.querySelector("title")?.textContent ?? ""}\n${root.querySelector("desc")?.textContent ?? ""}`.slice(
        0,
        12000,
      ),
  };
}
