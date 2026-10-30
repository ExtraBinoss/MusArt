import { expect, test } from "vitest";
import { createMascotSurface } from "../../../src/ui/brand/render-frame";
import { createDahliaEngine } from "../../../src/ui/brand/dahlia";
import { SEQUENCE } from "../../../src/ui/brand/engine/states";
const NS = "http://www.w3.org/2000/svg";
test("retains bounded real SVG paths for every engine state, keeps clip IDs local and disposes only owned nodes", () => {
  const svg = document.createElementNS(NS, "svg"),
    title = document.createElementNS(NS, "title");
  svg.append(title);
  document.body.append(svg);
  const surface = createMascotSurface(svg, "first"),
    otherSvg = document.createElementNS(NS, "svg"),
    other = createMascotSurface(otherSvg, "second");
  const engine = createDahliaEngine(),
    frame = engine.sample(0.75);
  surface.paint(frame);
  other.paint(frame);
  expect(svg.querySelector("clipPath")!.id).toBe("first-body");
  expect(otherSvg.querySelector("clipPath")!.id).toBe("second-body");
  expect(svg.querySelector('path[fill="#B39ADB"]')).toHaveAttribute("d", frame.bodyPath);
  for (const state of SEQUENCE) {
    const source = createDahliaEngine(state);
    surface.paint(source.sample(0.75));
  }
  expect(svg.innerHTML).not.toMatch(/NaN|Infinity/);
  const count = svg.querySelectorAll("*").length;
  for (const state of SEQUENCE) surface.paint(createDahliaEngine(state).sample(0.75));
  expect(svg.querySelectorAll("*")).toHaveLength(count);
  expect(count).toBeLessThan(180);
  expect(() =>
    surface.paint({
      ...frame,
      dots: Array.from({ length: 33 }, () => ({ x: 0, y: 0, r: 1, opacity: 1 })),
    }),
  ).toThrow("Mascot SVG pool exceeded");
  surface.dispose();
  surface.dispose();
  surface.paint(frame);
  expect(svg.children).toHaveLength(1);
  expect(svg.firstChild).toBe(title);
  other.dispose();
  svg.remove();
});
