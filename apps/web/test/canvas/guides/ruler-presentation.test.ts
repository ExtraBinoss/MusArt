import { expect, it, vi } from "vitest";
import { paintRuler, RulerPresentation } from "../../../src/canvas/guides/ruler-presentation";
it("publishes complete new SVG marks in one live mutation and retains existing marks", () => {
  const namespace = "http://www.w3.org/2000/svg";
  const root = document.createElementNS(namespace, "g");
  const observer = new MutationObserver(() => {});
  observer.observe(root, { childList: true, subtree: true, attributes: true });
  paintRuler(root, "x", [
    { value: 0, position: 10, major: true },
    { value: 20, position: 30, major: false },
    { value: 40, position: 50, major: true },
  ]);
  const mutations = observer.takeRecords();
  expect(mutations).toHaveLength(1);
  expect(mutations[0]!.target).toBe(root);
  expect(mutations[0]!.addedNodes).toHaveLength(3);
  const retained = root.children[1]!;
  expect(
    [...root.querySelectorAll("g,line,text")].every(
      (element) => element.namespaceURI === namespace,
    ),
  ).toBe(true);
  expect(root.children[0]).toHaveAttribute("transform", "translate(10 0)");
  expect(root.children[0]!.querySelector("text")).toHaveTextContent("0");
  expect(retained.querySelector("text")).toBeNull();
  paintRuler(root, "x", [
    { value: 20, position: 45, major: false },
    { value: 60, position: 80, major: true },
  ]);
  expect(root.children).toHaveLength(2);
  expect(root.children[0]).toBe(retained);
  expect(retained).toHaveAttribute("transform", "translate(45 0)");
  expect(root.children[1]!.querySelector("text")).toHaveTextContent("60");
  observer.disconnect();
});
it("retains tick nodes through pan/zoom, replaces only major labels and removes obsolete ticks", () => {
  const root = document.createElementNS("http://www.w3.org/2000/svg", "g");
  paintRuler(root, "x", [
    { value: 0, position: 30, major: true },
    { value: 20, position: 50, major: false },
  ]);
  const first = root.children[0]!,
    second = root.children[1]!;
  expect(first.querySelector("text")).toHaveTextContent("0");
  paintRuler(root, "x", [
    { value: 0, position: 40, major: true },
    { value: 20, position: 80, major: true },
  ]);
  expect(root.children[0]).toBe(first);
  expect(root.children[1]).toBe(second);
  expect(first).toHaveAttribute("transform", "translate(40 0)");
  expect(second.querySelector("line")).toHaveAttribute("y1", "12");
  paintRuler(root, "y", [{ value: 20, position: 20, major: false }]);
  expect(root.children).toHaveLength(1);
  expect(root.children[0]).toBe(second);
  expect(second.querySelector("text")).toBeNull();
  expect(second.querySelector("line")).toHaveAttribute("x1", "16");
  paintRuler(root, "y", [{ value: 20, position: 30, major: true }]);
  expect(second.querySelector("text")).toHaveAttribute("transform", "rotate(-90 10 -3)");
  paintRuler(root, "y", []);
  expect(root.children).toHaveLength(0);
});

it("pans one cached ruler strip without rewriting any tick or label and refreshes bounded coverage", () => {
  const root = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const strip = document.createElement("div"),
    presentation = new RulerPresentation(root, "x", strip);
  presentation.paint(1000, 300, 1);
  const children = [...root.children],
    before = root.innerHTML,
    attribute = vi.spyOn(Element.prototype, "setAttribute");
  for (let index = 1; index <= 100; index++) presentation.paint(1000, 300 + index, 1);
  expect(root.innerHTML).toBe(before);
  expect([...root.children]).toEqual(children);
  expect(attribute).not.toHaveBeenCalled();
  expect(root.style.transform).toBe("");
  expect(strip.style.transform).toBe("translate3d(-412px, 0, 0)");
  const zero = root.querySelector<SVGGElement>('[data-value="0"]')!;
  expect(Number(zero.getAttribute("transform")!.match(/translate\(([-\d.]+)/)![1]) - 412).toBe(400);
  presentation.paint(1000, 700, 1);
  expect(attribute).toHaveBeenCalled();
  expect(strip.style.transform).toBe("translate3d(-512px, 0, 0)");
  expect(root.children.length).toBeLessThan(200);
  presentation.paint(800, 100, 2);
  expect(strip.style.transform).toBe("translate3d(-512px, 0, 0)");
  presentation.paint(800, 100, 2);
  attribute.mockRestore();
});

it("translates vertical marks, clears invalid extents and rebuilds after becoming visible", () => {
  const root = document.createElementNS("http://www.w3.org/2000/svg", "g"),
    strip = document.createElement("div"),
    presentation = new RulerPresentation(root, "y", strip);
  presentation.paint(200, 20, 0.5);
  presentation.paint(200, 40, 0.5);
  expect(strip.style.transform).toBe("translate3d(0, -180px, 0)");
  expect(strip.style.height).toBe("600px");
  presentation.paint(0, 0, 1);
  expect(root.children).toHaveLength(0);
  expect(strip.style.transform).toBe("");
  presentation.paint(200, 20, 0.5);
  expect(root.children.length).toBeGreaterThan(0);
  presentation.paint(200, 0, 0);
  presentation.paint(200, NaN, 1);
  expect(root.children).toHaveLength(0);
});
