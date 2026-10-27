import { ensure } from "../errors";
import { assertList, assertNumber, assertRecord, assertText } from "../document/guards";
import { validateProject } from "../document/validation";
import type { Asset, Project } from "../document/model";
import type { ReplaySpec, ReplayState } from "./model";
import { applyReplayDelta } from "./delta";
import { stateFromProject } from "./state";
import { COMMAND_HANDLERS } from "../session/registry";

function validatePath(value: unknown): void {
  assertList(value, 128);
  for (const key of value)
    ensure(
      (typeof key === "number" && Number.isInteger(key) && key >= 0) ||
        (typeof key === "string" && !["__proto__", "prototype", "constructor"].includes(key)),
      "INVALID_DOCUMENT",
      "Unsafe replay path",
    );
  ensure(
    value[0] !== "assets" && value[0] !== "replay",
    "INVALID_DOCUMENT",
    "Replay states cannot embed originals",
  );
}
export function projectFromReplayState(
  state: ReplayState,
  pool: Readonly<Record<string, Asset>>,
): Project {
  assertRecord(state);
  assertList(state.assetIds, 5000);
  const assets: Record<string, Asset> = {};
  const seen = new Set<string>();
  for (const id of state.assetIds) {
    assertText(id);
    ensure(
      !seen.has(id) && Object.hasOwn(pool, id),
      "INVALID_DOCUMENT",
      `Replay original is missing or repeated: ${id}`,
    );
    seen.add(id);
    Object.defineProperty(assets, id, {
      value: pool[id],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  const { assetIds: _ids, ...project } = state;
  ensure(
    !("assets" in project) && !("replay" in project),
    "INVALID_DOCUMENT",
    "Nested replay data is not allowed",
  );
  return { ...project, assets };
}
/** Validate portable journals at the trust boundary; states contain original IDs only. */
export function validateReplaySpec(value: unknown): asserts value is ReplaySpec {
  assertRecord(value);
  ensure(value.version === 1, "INVALID_DOCUMENT", "Unsupported replay version");
  assertNumber(value.duration, 0, Number.MAX_SAFE_INTEGER);
  assertRecord(value.initial);
  ensure(
    value.initial.replay === undefined,
    "INVALID_DOCUMENT",
    "Nested replay data is not allowed",
  );
  validateProject(value.initial);
  assertText(value.pageId);
  ensure(
    value.initial.pages.some((page) => page.id === value.pageId),
    "INVALID_DOCUMENT",
    "Replay page is missing",
  );
  assertRecord(value.assets);
  const pool: Record<string, Asset> = { ...value.initial.assets };
  for (const [id, asset] of Object.entries(value.assets)) {
    assertRecord(asset);
    const existing = pool[id];
    ensure(
      !existing ||
        (existing.dataUrl === asset.dataUrl &&
          existing.mime === asset.mime &&
          existing.width === asset.width &&
          existing.height === asset.height),
      "INVALID_DOCUMENT",
      "A replay original ID cannot change its bytes",
    );
    Object.defineProperty(pool, id, {
      value: asset,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  // Also validate originals introduced after the initial frame.
  validateProject({ ...value.initial, assets: pool });
  assertList(value.events, 100_000);
  let state = stateFromProject(value.initial),
    previous = 0;
  for (const event of value.events) {
    assertRecord(event);
    assertNumber(event.at, previous, value.duration);
    previous = event.at;
    ensure(
      event.projectId === value.initial.id,
      "INVALID_DOCUMENT",
      "A replay belongs to one project",
    );
    assertText(event.pageId);
    if (event.kind !== undefined)
      ensure(
        typeof event.kind === "string" && ["commit", "undo", "redo", "load"].includes(event.kind),
        "INVALID_DOCUMENT",
        "Invalid replay event kind",
      );
    assertList(event.commands, 1000);
    for (const command of event.commands) {
      assertRecord(command);
      assertText(command.type);
      ensure(
        Object.hasOwn(COMMAND_HANDLERS, command.type) && command.type !== "setReplay",
        "INVALID_DOCUMENT",
        "Unknown replay command",
      );
    }
    assertList(event.delta, 100_000);
    for (const operation of event.delta) {
      assertRecord(operation);
      validatePath(operation.path);
      ensure(
        operation.op === "set" ||
          operation.op === "insert" ||
          operation.op === "remove" ||
          operation.op === "move",
        "INVALID_DOCUMENT",
        "Unknown replay delta operation",
      );
      if (operation.op === "move") validatePath(operation.from);
      if (operation.op === "set" || operation.op === "insert")
        ensure(Object.hasOwn(operation, "value"), "INVALID_DOCUMENT", "Missing replay value");
    }
    const typed = event as unknown as ReplaySpec["events"][number];
    state = typed.after ?? applyReplayDelta(state, typed.delta);
    if (typed.after) validateProject(projectFromReplayState(state, pool));
  }
  validateProject(projectFromReplayState(state, pool));
}
