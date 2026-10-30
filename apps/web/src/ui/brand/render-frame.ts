// DOM presentation of Maskot/Bloub BotFrame. Geometry remains owned by the copied engine.
import type { BotFrame, DotRender } from "./engine/bot-types";
import { mixHex } from "./engine/skins";
import { RAYON } from "./engine/repere";
import { brand } from "./config";
import { mascotTint } from "./tint";
const NS = "http://www.w3.org/2000/svg";
function node<K extends keyof SVGElementTagNameMap>(tag: K, parent: SVGElement) {
  const element = document.createElementNS(NS, tag);
  parent.append(element);
  return element;
}
function attrs(element: SVGElement, values: Record<string, string | number>) {
  for (const [name, value] of Object.entries(values)) {
    const text = String(value);
    if (element.getAttribute(name) !== text) element.setAttribute(name, text);
  }
}
function pool<K extends keyof SVGElementTagNameMap>(tag: K, parent: SVGElement, limit = 32) {
  const owned: SVGElementTagNameMap[K][] = [];
  return (count: number) => {
    if (!Number.isInteger(count) || count < 0 || count > limit)
      throw new RangeError("Mascot SVG pool exceeded.");
    while (owned.length < count) owned.push(node(tag, parent));
    owned.forEach((element, index) => {
      element.style.display = index < count ? "" : "none";
    });
    return owned;
  };
}
/** Bounded retained SVG nodes, including the original engine's depth ordering and masks. */
export function createMascotSurface(svg: SVGSVGElement, id: string) {
  const root = node("g", svg),
    defs = node("defs", root),
    clip = node("clipPath", defs),
    clipBody = node("path", clip);
  const tint = node("linearGradient", defs);
  tint.id = `${id}-tint`;
  attrs(tint, { x1: "0%", y1: "0%", x2: "100%", y2: "100%" });
  for (const stop of mascotTint)
    attrs(node("stop", tint), { offset: stop.offset, "stop-color": stop.color });
  clip.id = `${id}-body`;
  const back = node("g", root),
    behind = node("g", root),
    body = node("g", root),
    bodyPath = node("path", body),
    face = node("g", body),
    frontDots = node("g", root),
    notice = node("circle", root),
    front = node("g", root);
  bodyPath.setAttribute("data-mascot-part", "body");
  attrs(face, { "clip-path": `url(#${clip.id})`, fill: brand.colors.foreground });
  const eyeNodes = pool("path", face, 2),
    notch = node("circle", face),
    backArcs = pool("path", back),
    frontArcs = pool("path", front),
    gradients = pool("linearGradient", defs),
    behindDots = pool("path", behind),
    aheadDots = pool("path", frontDots);
  let disposed = false;
  function dotPath(dot: DotRender) {
    return (
      dot.d ??
      `M${dot.x - dot.r} ${dot.y}a${dot.r} ${dot.r} 0 1 0 ${dot.r * 2} 0a${dot.r} ${dot.r} 0 1 0 ${-dot.r * 2} 0Z`
    );
  }
  function paint(frame: BotFrame) {
    if (disposed) return;
    attrs(bodyPath, { d: frame.bodyPath, fill: `url(#${tint.id})` });
    attrs(clipBody, { d: frame.bodyPath });
    attrs(body, { opacity: frame.bodyAlpha });
    const eyes = eyeNodes(frame.eyes.length);
    frame.eyes.forEach((eye, i) =>
      attrs(eyes[i]!, { d: eye.d, transform: eye.matrix, opacity: eye.alpha }),
    );
    notch.style.display = frame.notch ? "" : "none";
    if (frame.notch) attrs(notch, { cx: frame.notch.x, cy: frame.notch.y, r: frame.notch.r });
    const dots = frame.dotsBehind ? behindDots(frame.dots.length) : aheadDots(frame.dots.length);
    (frame.dotsBehind ? aheadDots : behindDots)(0);
    frame.dots.forEach((dot, i) =>
      attrs(dots[i]!, {
        d: dotPath(dot),
        opacity: dot.opacity,
        fill:
          dot.color ??
          (dot.depth === undefined
            ? brand.colors.primary
            : mixHex(brand.colors.foreground, brand.colors.primary, dot.depth)),
        transform: dot.d
          ? `translate(${dot.x} ${dot.y}) rotate(${dot.rot ?? 0}) scale(${RAYON})`
          : "",
      }),
    );
    const under = backArcs(frame.arcs.length),
      over = frontArcs(frame.arcs.length),
      fills = gradients(frame.arcs.length);
    frame.arcs.forEach((arc, i) => {
      const gradient = fills[i]!,
        gradientId = `${id}-arc-${i}`;
      attrs(gradient, {
        id: gradientId,
        gradientUnits: "userSpaceOnUse",
        x1: arc.grad.x1,
        y1: arc.grad.y1,
        x2: arc.grad.x2,
        y2: arc.grad.y2,
      });
      while (gradient.children.length < arc.grad.stops.length) node("stop", gradient);
      while (gradient.children.length > arc.grad.stops.length) gradient.lastElementChild!.remove();
      arc.grad.stops.forEach((stop, j) =>
        attrs(gradient.children[j] as SVGStopElement, {
          offset: j / Math.max(1, arc.grad.stops.length - 1),
          "stop-color": stop,
        }),
      );
      const common = {
        fill: "none",
        stroke: `url(#${gradientId})`,
        "stroke-width": arc.width,
        "stroke-linecap": "round",
        opacity: arc.opacity,
      };
      attrs(under[i]!, { ...common, d: arc.back });
      attrs(over[i]!, { ...common, d: arc.front });
    });
    notice.style.display = frame.notif ? "" : "none";
    if (frame.notif)
      attrs(notice, {
        cx: frame.notif.x,
        cy: frame.notif.y,
        r: frame.notif.r,
        fill: brand.colors.ink,
      });
    svg.dataset.mascotState = "painted";
  }
  return {
    paint,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.remove();
    },
  };
}
