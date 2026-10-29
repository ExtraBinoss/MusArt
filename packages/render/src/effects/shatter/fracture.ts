import type { Node } from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  abs,
  atan,
  cos,
  dot,
  float,
  floor,
  fract,
  max,
  min,
  mod,
  normalize,
  sin,
  vec2,
  vec4,
} from "three/tsl";
import { noise2d, type NoiseSeed } from "../shared/noise";

/** Hash only authored cell identities, never output pixels, time or target density. */
export function shatterHash(cell: Node<"vec2">, seed: NoiseSeed) {
  return noise2d(cell.add(1048576), seed);
}

/** Returns document-pixel facet center, true bisector distance and stable facet identity. */
export function cellularFracture(
  position: Node<"vec2">,
  size: Node<"float">,
  jitter: Node<"float">,
  seed: NoiseSeed,
) {
  return Fn(() => {
    const p = position.div(size),
      base = floor(p),
      nearest = float(1e10).toVar(),
      winner = vec2(0).toVar(),
      site = vec2(0).toVar();
    const feature = (cell: Node<"vec2">) =>
      cell.add(0.5).add(
        vec2(
          shatterHash(cell, seed),
          shatterHash(cell.add(vec2(137, 61)), seed),
          // Keeping features inside [0.2,0.8] makes the fixed nearest-cell search safe.
        )
          .sub(0.5)
          .mul(jitter)
          .mul(0.6),
      );
    Loop({ start: 0, end: 3, type: "int" }, { start: 0, end: 3, type: "int" }, ({ i, j }) => {
      const cell = base.add(vec2(float(i), float(j)).sub(1)),
        point = feature(cell),
        delta = point.sub(p),
        distance = dot(delta, delta);
      If(distance.lessThan(nearest), () => {
        nearest.assign(distance);
        winner.assign(cell);
        site.assign(point);
      });
    });
    const edge = float(1e10).toVar();
    // Fixed 5×5 around the winner includes distant neighbors of the jittered cell.
    // A bisector distance, unlike F2−F1, keeps crack width independent of facet size.
    Loop({ start: 0, end: 5, type: "int" }, { start: 0, end: 5, type: "int" }, ({ i, j }) => {
      const point = feature(winner.add(vec2(float(i), float(j)).sub(2))),
        delta = point.sub(site);
      If(dot(delta, delta).greaterThan(0.000001), () => {
        edge.assign(min(edge, dot(site.add(point).mul(0.5).sub(p), normalize(delta))));
      });
    });
    return vec4(site.mul(size), max(0, edge).mul(size), shatterHash(winner, seed));
  })();
}

/** Radial cracks and offset straight circumferential chords reproduce an impact web. */
export function impactFracture(
  position: Node<"vec2">,
  center: Node<"vec2">,
  size: Node<"float">,
  jitter: Node<"float">,
  spokes: Node<"float">,
  seed: NoiseSeed,
) {
  return Fn(() => {
    const relative = position.sub(center),
      step = float(Math.PI * 2).div(spokes),
      angle = fract(atan(relative.y, relative.x.add(0.000001)).div(Math.PI * 2)).mul(spokes),
      base = floor(angle),
      sector = base.toVar();
    const identity = (index: Node<"float">) => mod(index.add(spokes), spokes);
    const boundary = (index: Node<"float">) =>
      index.add(
        shatterHash(vec2(identity(index), 31), seed)
          .sub(0.5)
          .mul(jitter)
          .mul(0.7),
      );
    If(angle.lessThan(boundary(base)), () => {
      sector.subAssign(1);
    });
    If(angle.greaterThanEqual(boundary(base.add(1))), () => {
      sector.addAssign(1);
    });
    const left = boundary(sector).mul(step),
      right = boundary(sector.add(1)).mul(step),
      heading = left.add(right).mul(0.5),
      direction = vec2(cos(heading), sin(heading)),
      offset = shatterHash(vec2(identity(sector), 79), seed)
        .mul(jitter)
        .mul(0.7),
      radial = dot(relative, direction).div(size).add(offset),
      ring = floor(radial),
      phase = fract(radial),
      ringDistance = min(phase, phase.oneMinus()).mul(size),
      rayDistance = (a: Node<"float">) => abs(relative.x.mul(sin(a)).sub(relative.y.mul(cos(a)))),
      edge = min(ringDistance, min(rayDistance(left), rayDistance(right))),
      centroid = center.add(direction.mul(max(0, ring.add(0.5).sub(offset)).mul(size))),
      hash = shatterHash(vec2(identity(sector), ring), seed);
    return vec4(centroid, edge, hash);
  })();
}
