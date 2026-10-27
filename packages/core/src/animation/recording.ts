import { ensure } from "../errors";
import { freezeValue } from "../document/immutable";
import type { Asset, EnginePort } from "../document/model";
import type {
  CommandCommit,
  ReplayObserveOptions,
  ReplayRecordOptions,
  ReplayRecording,
  ReplaySpec,
  ReplayEvent,
} from "./model";
import { stateFromProject, normalizeReplayCommands } from "./state";
import { diffReplayState } from "./delta";
interface ObservableEngine extends EnginePort {
  subscribeCommands(listener: (commit: CommandCommit) => void): () => void;
}
function observable(engine: EnginePort): asserts engine is ObservableEngine {
  ensure(
    "subscribeCommands" in engine && typeof engine.subscribeCommands === "function",
    "INVALID_COMMAND",
    "This engine does not expose committed command observation",
  );
}
function clock(now?: () => number): () => number {
  let ticks = 0;
  return now ?? (() => ++ticks * (1000 / 30));
}
export function observeReplay(engine: EnginePort, options: ReplayObserveOptions): () => void {
  observable(engine);
  const now = clock(options.now),
    start = now(),
    interval = options.checkpointInterval ?? 250;
  ensure(
    Number.isInteger(interval) && interval >= 1 && interval <= 10000,
    "INVALID_COMMAND",
    "Invalid replay checkpoint interval",
  );
  let previous = stateFromProject(engine.getSnapshot().project),
    previousAssets = engine.getSnapshot().project.assets,
    sequence = 0,
    lastTime = 0;
  return engine.subscribeCommands((commit) => {
    if (
      commit.kind === "commit" &&
      commit.commands.every((command) => command.type === "setReplay")
    )
      return;
    const snapshot = commit.snapshot,
      after = stateFromProject(snapshot.project),
      elapsed = now() - start;
    ensure(
      Number.isFinite(elapsed),
      "INVALID_COMMAND",
      "Replay clock must return finite milliseconds",
    );
    const at = Math.max(lastTime, elapsed, 0);
    lastTime = at;
    const addedAssets: Record<string, Asset> = {};
    for (const [id, asset] of Object.entries(snapshot.project.assets))
      if (previousAssets[id]?.dataUrl !== asset.dataUrl) addedAssets[id] = asset;
    const projectChanged = previous.id !== after.id;
    const delta = diffReplayState(previous, after);
    sequence++;
    const event: ReplayEvent = freezeValue({
      at,
      projectId: after.id,
      pageId: snapshot.pageId,
      kind: commit.kind,
      commands: normalizeReplayCommands(commit.commands),
      delta,
      ...(projectChanged || commit.kind === "load" || sequence % interval === 0 ? { after } : {}),
    });
    previous = after;
    previousAssets = snapshot.project.assets;
    options.onEvent(event, addedAssets);
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
