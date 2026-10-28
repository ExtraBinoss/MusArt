import { ensure } from "../errors";
import { freezeValue } from "../document/immutable";
import type { Asset, EnginePort } from "../document/model";
import type {
  CommandCommit,
  CommandCommitInfo,
  ReplayObserveOptions,
  ReplayRecordOptions,
  ReplayRecording,
  ReplaySpec,
  ReplayEvent,
  ReplayCommandSummary,
} from "./model";
import { stateFromProject, normalizeReplayCommands } from "./state";
import { diffReplayState } from "./delta";
interface ObservableEngine extends EnginePort {
  subscribeCommands(listener: (commit: CommandCommit) => void): () => void;
}
interface SummaryEngine extends EnginePort {
  subscribeCommitInfo(listener: (commit: CommandCommitInfo) => void): () => void;
}
function summaryObservable(engine: EnginePort): engine is SummaryEngine {
  return "subscribeCommitInfo" in engine && typeof engine.subscribeCommitInfo === "function";
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
  const summary = options.commandMode === "summary";
  ensure(
    options.commandMode === undefined || summary || options.commandMode === "full",
    "INVALID_COMMAND",
    "Invalid replay command mode",
  );
  if (!summary || !summaryObservable(engine)) observable(engine);
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
  const capture = (commit: CommandCommit | CommandCommitInfo): void => {
    const types = "types" in commit ? commit.types : commit.commands.map((command) => command.type);
    if (commit.kind === "commit" && types.every((type) => type === "setReplay")) return;
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
    const before = previous,
      beforeAssets = previousAssets,
      projectChanged = before.id !== after.id;
    sequence++;
    const checkpoint = projectChanged || commit.kind === "load" || sequence % interval === 0;
    previous = after;
    previousAssets = snapshot.project.assets;
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
            ([id, asset]) => beforeAssets[id]?.dataUrl !== asset.dataUrl,
          ),
        );
        const commands = summary
          ? types
              .filter((type): type is ReplayCommandSummary["type"] => type !== "setReplay")
              .map((type): ReplayCommandSummary => ({ type, summary: true }))
          : normalizeReplayCommands((commit as CommandCommit).commands);
        const event: ReplayEvent = freezeValue({
          at,
          projectId: after.id,
          pageId: snapshot.pageId,
          kind: commit.kind,
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
  };
  if (summary && summaryObservable(engine)) return engine.subscribeCommitInfo(capture);
  observable(engine);
  return engine.subscribeCommands(capture);
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
