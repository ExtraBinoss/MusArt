import { ensure } from "../errors";
import { cloneValue, freezeValue } from "../document/immutable";
import type { Asset, Layer, Project } from "../document/model";
import type { ReplaySpec, ReplayState } from "./model";
import { stateFromProject } from "./state";
import { applyReplayDelta } from "./delta";
import { validateReplaySpec, projectFromReplayState } from "./validation";
import { validateProject } from "../document/validation";
import { ZERO_INSETS } from "../layout/model";
interface Compiled {
  checkpoints: Map<number, ReplayState>;
  assets: Record<string, Asset>;
  lastIndex: number;
  lastState: ReplayState;
  pair?: { index: number; current: ReplayState; next: ReplayState };
}
const compiled = new WeakMap<ReplaySpec, Compiled>();
function compile(spec: ReplaySpec): Compiled {
  const existing = compiled.get(spec);
  if (existing) return existing;
  validateReplaySpec(spec);
  const initial = stateFromProject(cloneValue(spec.initial)),
    checkpoints = new Map<number, ReplayState>([[-1, initial]]);
  let state = initial;
  for (const [index, event] of spec.events.entries()) {
    state = event.after ? cloneValue(event.after) : applyReplayDelta(state, event.delta);
    if (event.after || (index + 1) % 250 === 0) checkpoints.set(index, state);
  }
  const result = {
    checkpoints,
    assets: cloneValue({ ...spec.initial.assets, ...spec.assets }),
    lastIndex: -1,
    lastState: initial,
  };
  compiled.set(spec, result);
  return result;
}
function stateAt(spec: ReplaySpec, cache: Compiled, index: number): ReplayState {
  if (index === cache.lastIndex) return cache.lastState;
  let start = -1,
    state = cache.checkpoints.get(-1)!;
  if (index > cache.lastIndex && index - cache.lastIndex <= 250) {
    start = cache.lastIndex;
    state = cache.lastState;
  } else
    for (const [checkpoint, value] of cache.checkpoints)
      if (checkpoint <= index && checkpoint > start) {
        start = checkpoint;
        state = value;
      }
  for (let cursor = start + 1; cursor <= index; cursor++) {
    const event = spec.events[cursor]!;
    state = event.after ? cloneValue(event.after) : applyReplayDelta(state, event.delta);
  }
  cache.lastIndex = index;
  cache.lastState = state;
  return state;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function tweenLayer(layer: Layer, next: Layer, t: number): Layer {
  const result = { ...layer };
  for (const key of [
    "x",
    "y",
    "width",
    "height",
    "rotation",
    "opacity",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "strokeWidth",
    "radius",
  ] as const)
    result[key] = lerp(layer[key], next[key], t);
  for (const key of ["padding", "margin"] as const)
    if (layer[key] || next[key]) {
      const a = layer[key] ?? ZERO_INSETS,
        b = next[key] ?? ZERO_INSETS;
      result[key] = {
        top: lerp(a.top, b.top, t),
        right: lerp(a.right, b.right, t),
        bottom: lerp(a.bottom, b.bottom, t),
        left: lerp(a.left, b.left, t),
      };
    }
  if (layer.guides)
    result.guides = layer.guides.map((guide) => ({
      ...guide,
      position: Math.min(guide.position, guide.axis === "x" ? result.width : result.height),
    }));
  const nextEffects = new Map(next.effects.map((effect) => [effect.id, effect]));
  result.effects = layer.effects.map((effect) => {
    const future = nextEffects.get(effect.id);
    return future && future.type === effect.type
      ? {
          ...effect,
          amount: lerp(effect.amount, future.amount, t),
          scale: lerp(effect.scale, future.scale, t),
          levels: lerp(effect.levels, future.levels, t),
        }
      : effect;
  });
  return result;
}
function interpolate(a: ReplayState, b: ReplayState, t: number): ReplayState {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const pages = new Map(b.pages.map((page) => [page.id, page]));
  return {
    ...a,
    pages: a.pages.map((page) => {
      const next = pages.get(page.id);
      if (!next) return page;
      const layers = new Map(next.layers.map((layer) => [layer.id, layer]));
      return {
        ...page,
        layers: page.layers.map((layer) => {
          const future = layers.get(layer.id);
          return future && future.kind === layer.kind && future.parentId === layer.parentId
            ? tweenLayer(layer, future, t)
            : layer;
        }),
      };
    }),
  };
}
/** Milliseconds; transforms/opacity/effect values interpolate, structural/text changes are discrete. */
export function evaluateReplay(spec: ReplaySpec, timeMs: number): Project {
  ensure(Number.isFinite(timeMs), "INVALID_COMMAND", "Replay time must be finite");
  const cache = compile(spec),
    time = Math.max(0, Math.min(spec.duration, timeMs));
  let left = 0,
    right = spec.events.length - 1,
    index = -1;
  while (left <= right) {
    const middle = (left + right) >> 1;
    if (spec.events[middle]!.at <= time) {
      index = middle;
      left = middle + 1;
    } else right = middle - 1;
  }
  let state = cache.pair?.index === index ? cache.pair.current : stateAt(spec, cache, index);
  const next = spec.events[index + 1];
  if (next && next.at > time) {
    const start = index < 0 ? 0 : spec.events[index]!.at;
    const future = cache.pair?.index === index ? cache.pair.next : stateAt(spec, cache, index + 1);
    cache.pair = { index, current: state, next: future };
    state = interpolate(state, future, (time - start) / (next.at - start));
  }
  const project = projectFromReplayState(state, cache.assets);
  validateProject(project);
  return freezeValue(project);
}
