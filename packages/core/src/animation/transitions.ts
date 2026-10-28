import { ensure } from "../errors";
import { freezeValue } from "../document/immutable";
import type { EnginePort } from "../document/model";
import type { CommandCommit, CommandCommitInfo, ReplayTransitionOptions } from "./model";
import { stateFromProject } from "./state";

interface DetailedEngine extends EnginePort {
  subscribeCommands(listener: (commit: CommandCommit) => void): () => void;
}
interface SummaryEngine extends EnginePort {
  subscribeCommitInfo(listener: (commit: CommandCommitInfo) => void): () => void;
}
function summaryObservable(engine: EnginePort): engine is SummaryEngine {
  return "subscribeCommitInfo" in engine && typeof engine.subscribeCommitInfo === "function";
}
function observable(engine: EnginePort): asserts engine is DetailedEngine {
  ensure(
    "subscribeCommands" in engine && typeof engine.subscribeCommands === "function",
    "INVALID_COMMAND",
    "This engine does not expose committed command observation",
  );
}
/** Capture only: no replay diff, command normalization, browser API or original copying. */
export function observeReplayTransitions(
  engine: EnginePort,
  options: ReplayTransitionOptions,
): () => void {
  const summary = options.commandMode !== "full";
  ensure(
    options.commandMode === undefined || options.commandMode === "summary" || !summary,
    "INVALID_COMMAND",
    "Invalid replay command mode",
  );
  if (!summary || !summaryObservable(engine)) observable(engine);
  let ticks = 0;
  const now = options.now ?? (() => ++ticks * (1000 / 30));
  const start = now(),
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
    const at = Math.max(lastTime, elapsed, 0),
      before = previous,
      beforeAssets = previousAssets;
    lastTime = at;
    sequence++;
    previous = after;
    previousAssets = snapshot.project.assets;
    options.onTransition(
      freezeValue({
        before,
        after,
        previousAssets: beforeAssets,
        snapshot,
        at,
        kind: commit.kind,
        types,
        checkpoint: before.id !== after.id || commit.kind === "load" || sequence % interval === 0,
        ...(!summary && "commands" in commit ? { commands: commit.commands } : {}),
      }),
    );
  };
  if (summary && summaryObservable(engine)) return engine.subscribeCommitInfo(capture);
  observable(engine);
  return engine.subscribeCommands(capture);
}
