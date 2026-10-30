import {
  applyMotionValue,
  getMotionOccurrenceAt,
  compareMotionTime,
  listMotionProperties,
  readMotionValue,
  resolveMotionProperty,
  type Command,
  type Composition,
  type EnginePort,
  type Layer,
  type MotionPropertyTarget,
  type MotionTime,
  type SessionSnapshot,
} from "@musart/core";
import { createMotionTransport } from "../../services/motion/transport";
import { getMotionAuthoring } from "./motion-authoring";
import { motionTargetKey, hasMotionKeys } from "../motion/keyframes";
export { motionTargetKey, motionPropertyTrack, hasMotionKeys } from "../motion/keyframes";

export interface MotionEditOrigin {
  snapshot: SessionSnapshot;
  time: MotionTime;
  mode: "static" | "motion";
  auto: boolean;
  occurrences: ReadonlyMap<string, string>;
  targets?: readonly MotionPropertyTarget[];
}
export type MotionEditTarget = MotionPropertyTarget | readonly MotionPropertyTarget[];
export interface MotionEffectIntent {
  effectId: string;
  patch: Partial<Layer["effects"][number]>;
}

export function captureMotionEdit(engine: EnginePort, target?: MotionEditTarget): MotionEditOrigin {
  const transport = createMotionTransport(engine);
  transport.pause();
  const { time, mode } = transport.read();
  const snapshot = engine.getSnapshot();
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  return {
    snapshot,
    occurrences: new Map(
      page.layers.flatMap((layer) => {
        const track = getMotionOccurrenceAt(page, layer.id, time, { terminalPreview: true });
        return track ? [[layer.id, track.id] as const] : [];
      }),
    ),
    time,
    mode,
    auto: getMotionAuthoring(engine).read(),
    ...(target
      ? { targets: Array.isArray(target) ? target : [target as MotionPropertyTarget] }
      : {}),
  };
}

function patchTargets(
  page: Composition,
  next: Layer,
  patch: Partial<Layer>,
  origin: MotionEditOrigin,
  intent?: MotionEffectIntent,
) {
  const hints = origin.targets?.filter((target) => resolveMotionProperty(page, target)) ?? [];
  return listMotionProperties({ ...page, layers: [next] }).filter((descriptor) => {
    const target = descriptor.target,
      previous = resolveMotionProperty(page, target);
    if (!previous) return false;
    let touched = false;
    if (target.kind === "layer") {
      touched = Object.hasOwn(patch, target.property.split(".")[0]!);
      if (
        target.property.includes(".") &&
        !hints.some((hint) => hint.kind === "layer" && hint.property === target.property)
      )
        touched &&= previous.value !== descriptor.value;
    } else if (patch.effects) {
      if (intent)
        touched =
          target.effectId === intent.effectId &&
          (target.kind === "effectSetting"
            ? Object.hasOwn(intent.patch.settings ?? {}, target.property)
            : Object.hasOwn(intent.patch, target.property));
      else touched = previous.value !== descriptor.value;
    }
    if (hints.length)
      touched &&= hints.some((hint) =>
        hint.kind === "layer" && target.kind === "layer"
          ? hint.property === target.property
          : motionTargetKey(hint) === motionTargetKey(target),
      );
    return touched;
  });
}

/** An effect draft changes only its intended fields on the evaluated pose. */
export function motionPreviewPatch(
  engine: EnginePort,
  origin: MotionEditOrigin,
  ids: readonly string[],
  patch: Partial<Layer>,
  intent?: MotionEffectIntent,
): Partial<Layer> {
  if (origin.mode !== "motion" || ids.length !== 1) return patch;
  if (!origin.occurrences.has(ids[0]!)) return {};
  if (!intent && !patch.fillGradient) return patch;
  const page = origin.snapshot.project.pages.find((item) => item.id === origin.snapshot.pageId)!;
  const base = page.layers.find((layer) => layer.id === ids[0]);
  let live = createMotionTransport(engine)
    .readFrame()
    ?.layers.find((layer) => layer.id === ids[0]);
  if (!base || !live) return patch;
  for (const descriptor of patchTargets(page, { ...base, ...patch }, patch, origin, intent))
    live = applyMotionValue(live, descriptor.target, descriptor.value);
  return {
    ...patch,
    ...(intent ? { effects: live.effects } : {}),
    ...(patch.fillGradient && live.fillGradient
      ? {
          fillGradient: {
            ...patch.fillGradient,
            kind: live.fillGradient.kind,
            angle: live.fillGradient.angle,
          },
        }
      : {}),
  };
}

export function isMotionEditCurrent(engine: EnginePort, origin: MotionEditOrigin): boolean {
  const snapshot = engine.getSnapshot(),
    state = createMotionTransport(engine).read();
  return (
    snapshot.project === origin.snapshot.project &&
    snapshot.pageId === origin.snapshot.pageId &&
    snapshot.revision === origin.snapshot.revision &&
    state.mode === origin.mode &&
    compareMotionTime(state.time, origin.time) === 0
  );
}

const clockSources = new WeakMap<EnginePort, { subscribe(listener: () => void): () => void }>();
/** Gesture invalidation follows authored time/owner, independently of whether its value changes. */
export function motionTimeChanges(engine: EnginePort) {
  let source = clockSources.get(engine);
  if (!source) {
    const transport = createMotionTransport(engine);
    source = {
      subscribe(listener) {
        let before = transport.read(),
          projectId = engine.getSnapshot().project.id;
        return transport.subscribe(() => {
          const next = transport.read(),
            nextProjectId = engine.getSnapshot().project.id;
          const changed =
            projectId !== nextProjectId ||
            before.compositionId !== next.compositionId ||
            before.mode !== next.mode ||
            compareMotionTime(before.time, next.time) !== 0;
          before = next;
          projectId = nextProjectId;
          if (changed) listener();
        });
      },
    };
    clockSources.set(engine, source);
  }
  return source;
}
/** Revert keyed fields in a proposed base patch, including absence of optional/default fields. */
function restoreBase(layer: Layer, base: Layer, target: MotionPropertyTarget): Layer {
  if (target.kind === "layer") {
    if (target.property.startsWith("fillGradient."))
      return {
        ...layer,
        fillGradient: {
          ...layer.fillGradient!,
          [target.property.slice("fillGradient.".length)]:
            base.fillGradient![target.property === "fillGradient.angle" ? "angle" : "kind"],
        },
      };
    return { ...layer, [target.property]: base[target.property as keyof Layer] } as Layer;
  }
  const source = base.effects.find((effect) => effect.id === target.effectId)!;
  return {
    ...layer,
    effects: layer.effects.map((effect) => {
      if (effect.id !== source.id) return effect;
      if (target.kind === "effectSetting") {
        const settings = { ...effect.settings };
        if (Object.hasOwn(source.settings ?? {}, target.property))
          settings[target.property] = source.settings![target.property]!;
        else delete settings[target.property];
        return {
          ...effect,
          settings: source.settings || Object.keys(settings).length ? settings : undefined,
        };
      }
      const next = { ...effect };
      if (Object.hasOwn(source, target.property))
        Object.assign(next, { [target.property]: source[target.property] });
      else delete (next as unknown as Record<string, unknown>)[target.property];
      return next;
    }),
  };
}

/** Explicit adapter routing: one batch for keys and remaining base edits, never a monkeypatch. */
export function motionLayerCommands(
  engine: EnginePort,
  origin: MotionEditOrigin,
  ids: readonly string[],
  patch: Partial<Layer>,
  intent?: MotionEffectIntent,
): Command[] {
  if (!isMotionEditCurrent(engine, origin)) return [];
  if (origin.mode === "static") return [{ type: "updateLayers", ids: [...ids], patch }];
  const page = origin.snapshot.project.pages.find((item) => item.id === origin.snapshot.pageId)!;
  const frame = createMotionTransport(engine).readFrame() ?? page;
  const commands: Command[] = [];
  for (const id of ids) {
    const base = page.layers.find((layer) => layer.id === id);
    if (!base) continue;
    const trackId = origin.occurrences.get(id);
    if (!trackId) return [];
    let next: Layer = { ...base, ...patch };
    for (const descriptor of patchTargets(page, next, patch, origin, intent)) {
      const target = descriptor.target;
      const previous = resolveMotionProperty(page, target);
      if (!previous) continue;
      if (!origin.auto && !hasMotionKeys(page, target, { trackId })) continue;
      // A reset/preset is allowed to affect every explicitly written eligible parameter.
      const effective = resolveMotionProperty(frame, target)?.value;
      if (intent && !origin.targets?.length && effective === descriptor.value) {
        next = restoreBase(next, base, target);
        continue;
      }
      commands.push({
        type: "upsertMotionKeyframe",
        trackId,
        target,
        time: origin.time,
        value: descriptor.value,
      });
      next = restoreBase(next, base, target);
    }
    const basePatch: Partial<Layer> = {};
    for (const key of Object.keys(patch) as (keyof Layer)[])
      if (JSON.stringify(next[key]) !== JSON.stringify(base[key]))
        Object.assign(basePatch, { [key]: next[key] });
    if (Object.keys(basePatch).length)
      commands.unshift({ type: "updateLayers", ids: [id], patch: basePatch });
  }
  return commands;
}

export function addMotionPropertyKey(engine: EnginePort, target: MotionPropertyTarget): void {
  addMotionPropertyKeys(engine, [target]);
}
export function addMotionPropertyKeys(
  engine: EnginePort,
  targets: readonly MotionPropertyTarget[],
): void {
  const origin = captureMotionEdit(engine, targets);
  if (origin.mode !== "motion") return;
  const transport = createMotionTransport(engine),
    page =
      transport.readFrame() ??
      origin.snapshot.project.pages.find((item) => item.id === origin.snapshot.pageId)!;
  const commands = targets.map((target) => {
    const value = readMotionValue(page, target);
    const trackId = origin.occurrences.get(target.layerId);
    return trackId
      ? { type: "upsertMotionKeyframe" as const, trackId, target, time: origin.time, value }
      : undefined;
  });
  if (commands.length && commands.every((command) => command !== undefined))
    engine.transaction(commands);
}
