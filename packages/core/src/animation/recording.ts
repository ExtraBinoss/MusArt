import { sameAssetOriginal } from "../assets/identity";
import { freezeValue } from "../document/immutable";
import type { Asset, EnginePort } from "../document/model";
import type {
  ReplayObserveOptions,
  ReplayRecordOptions,
  ReplayRecording,
  ReplaySpec,
  ReplayEvent,
  ReplayCommandSummary,
} from "./model";
import { normalizeReplayCommands } from "./state";
import { diffReplayState } from "./delta";
import { observeReplayTransitions } from "./transitions";
function clock(now?: () => number): () => number {
  let ticks = 0;
  return now ?? (() => ++ticks * (1000 / 30));
}
export function observeReplay(engine: EnginePort, options: ReplayObserveOptions): () => void {
  const summary = options.commandMode === "summary";
  return observeReplayTransitions(engine, {
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.checkpointInterval === undefined
      ? {}
      : { checkpointInterval: options.checkpointInterval }),
    commandMode: options.commandMode ?? "full",
    onTransition: (transition) => {
      const {
        before,
        after,
        previousAssets: beforeAssets,
        snapshot,
        at,
        kind,
        types,
        checkpoint,
      } = transition;
      let emitted = false,
        failed = false,
        error: unknown,
        pending: void | Promise<void>;
      const emit = (): void | Promise<void> => {
        if (failed) throw error;
        if (emitted) return pending;
        emitted = true;
        try {
          const addedAssets: Record<string, Asset> = Object.fromEntries(
            Object.entries(snapshot.project.assets).filter(
              ([id, asset]) => !sameAssetOriginal(beforeAssets[id], asset),
            ),
          );
          const commands = summary
            ? types
                .filter((type): type is ReplayCommandSummary["type"] => type !== "setReplay")
                .map((type): ReplayCommandSummary => ({ type, summary: true }))
            : normalizeReplayCommands(transition.commands!);
          const event: ReplayEvent = freezeValue({
            at,
            projectId: after.id,
            pageId: snapshot.pageId,
            kind,
            commands,
            delta: diffReplayState(before, after),
            ...(checkpoint ? { after } : {}),
          });
          pending = options.onEvent(event, freezeValue(addedAssets), snapshot);
          return pending;
        } catch (caught) {
          failed = true;
          error = caught;
          throw caught;
        }
      };
      // Captures advance synchronously; a platform scheduler owns FIFO awaiting/error handling.
      // Already captured commits remain drainable after the subscription is removed.
      if (options.schedule) options.schedule(emit);
      else void emit();
    },
  });
}
export function recordSession(
  engine: EnginePort,
  options: ReplayRecordOptions = {},
): ReplayRecording {
  const now = clock(options.now),
    start = now(),
    snapshot = engine.getSnapshot();
  const { replay: _replay, ...initial } = snapshot.project;
  const events: ReplayEvent[] = [],
    assets: Record<string, Asset> = {};
  let stopped = false,
    last: ReplaySpec | undefined,
    lastAt = 0;
  const read = (): ReplaySpec =>
    freezeValue({
      version: 1,
      initial,
      pageId: snapshot.pageId,
      assets: { ...assets },
      events: [...events],
      duration: Math.max(lastAt, Math.max(0, now() - start)),
    });
  const stopObserving = observeReplay(engine, {
    now,
    checkpointInterval: options.checkpointInterval ?? 250,
    onEvent: (event, added) => {
      // A portable replay is one project; a platform observer may route a load to another journal.
      if (event.projectId !== initial.id) {
        stopped = true;
        stopObserving();
        last = read();
        return;
      }
      lastAt = event.at;
      if (options.retainEvents !== false) events.push(event);
      for (const [id, asset] of Object.entries(added))
        if (!Object.hasOwn(initial.assets, id)) assets[id] = asset;
      options.onEvent?.(event, added);
    },
  });
  return {
    snapshot: () => last ?? read(),
    stop: () => {
      if (!stopped) {
        stopped = true;
        stopObserving();
        last = read();
      }
      return (last ??= read());
    },
    dispose: () => {
      if (!stopped) {
        stopped = true;
        stopObserving();
        last = read();
      }
    },
  };
}
