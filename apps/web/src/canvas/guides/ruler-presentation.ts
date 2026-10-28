import { rulerTicks, type RulerTick } from "./geometry";
const namespace = "http://www.w3.org/2000/svg";
/** Retain ticks through camera motion; only their positions and changed major marks update. */
export function paintRuler(root: SVGGElement, axis: "x" | "y", ticks: RulerTick[]): void {
  const previous = new Map(
    [...root.children].map((element) => [
      (element as SVGGElement).dataset.value!,
      element as SVGGElement,
    ]),
  );
  for (const tick of ticks) {
    const key = String(tick.value);
    let group = previous.get(key);
    previous.delete(key);
    if (!group) {
      group = document.createElementNS(namespace, "g");
      group.dataset.value = key;
      group.append(document.createElementNS(namespace, "line"));
      root.append(group);
    }
    group.setAttribute(
      "transform",
      axis === "x" ? `translate(${tick.position} 0)` : `translate(0 ${tick.position})`,
    );
    if (group.dataset.major === String(tick.major) && group.dataset.axis === axis) continue;
    group.dataset.major = String(tick.major);
    group.dataset.axis = axis;
    const line = group.querySelector("line")!;
    for (const [name, value] of Object.entries({
      x1: axis === "x" ? 0 : tick.major ? 12 : 16,
      y1: axis === "x" ? (tick.major ? 12 : 16) : 0,
      x2: axis === "x" ? 0 : 20,
      y2: axis === "x" ? 20 : 0,
    }))
      line.setAttribute(name, String(value));
    group.querySelector("text")?.remove();
    if (tick.major) {
      const text = document.createElementNS(namespace, "text");
      text.setAttribute("x", "3");
      text.setAttribute("y", axis === "x" ? "10" : "-3");
      if (axis === "y") text.setAttribute("transform", "rotate(-90 3 -3)");
      text.textContent = String(Math.round(tick.value * 100) / 100);
      group.append(text);
    }
  }
  for (const element of previous.values()) element.remove();
}

/** Pan one overscanned strip; tick text and transforms only change when coverage or scale changes. */
export class RulerPresentation {
  private anchor = NaN;
  private zoom = 0;
  private length = 0;
  private buffer = 0;
  private transform = "";
  constructor(
    private readonly root: SVGGElement,
    private readonly axis: "x" | "y",
    private readonly strip: HTMLElement,
  ) {
    strip.style.willChange = "transform";
  }
  paint(length: number, origin: number, zoom: number): void {
    if (!Number.isFinite(length + origin + zoom) || length <= 0 || zoom <= 0) {
      this.root.replaceChildren();
      this.strip.style.transform = "";
      this.anchor = NaN;
      this.transform = "";
      return;
    }
    if (
      this.zoom !== zoom ||
      this.length !== length ||
      !Number.isFinite(this.anchor) ||
      Math.abs(origin - this.anchor) > this.buffer / 2
    ) {
      this.buffer = Math.max(128, Math.min(512, length));
      this.strip.style.width = `${this.axis === "x" ? length + this.buffer * 2 : 20}px`;
      this.strip.style.height = `${this.axis === "y" ? length + this.buffer * 2 : 20}px`;
      paintRuler(
        this.root,
        this.axis,
        rulerTicks(length + this.buffer * 2, origin + this.buffer, zoom),
      );
      this.anchor = origin;
      this.zoom = zoom;
      this.length = length;
    }
    const offset = origin - this.anchor - this.buffer;
    const transform =
      this.axis === "x" ? `translate3d(${offset}px, 0, 0)` : `translate3d(0, ${offset}px, 0)`;
    if (transform !== this.transform) {
      this.strip.style.transform = transform;
      this.transform = transform;
    }
  }
}
