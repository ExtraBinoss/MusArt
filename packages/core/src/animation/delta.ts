import { ensure } from "../errors";
import { cloneValue } from "../document/immutable";
import type { ReplayDelta, ReplayPath, ReplayState } from "./model";
const dangerous = new Set(["__proto__", "prototype", "constructor"]);
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function identities(items: unknown[]): string[] | null {
  const ids: string[] = [];
  for (const item of items) {
    if (!object(item) || typeof item.id !== "string" || ids.includes(item.id)) return null;
    ids.push(item.id);
  }
  return ids;
}
/** ID-bearing arrays are moved/inserted compactly instead of copying every following node. */
export function diffReplayState(before: ReplayState, after: ReplayState): ReplayDelta[] {
  const output: ReplayDelta[] = [];
  const walk = (a: unknown, b: unknown, path: (string | number)[]): void => {
    if (Object.is(a, b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      const beforeIds = identities(a),
        afterIds = identities(b);
      if (beforeIds && afterIds) {
        const working = [...beforeIds],
          original = new Map(beforeIds.map((id, index) => [id, a[index]]));
        for (const [index, id] of afterIds.entries()) {
          if (working[index] !== id) {
            const source = working.indexOf(id, index + 1);
            if (source >= 0) {
              output.push({ op: "move", from: [...path, source], path: [...path, index] });
              working.splice(index, 0, working.splice(source, 1)[0]!);
            } else {
              output.push({ op: "insert", path: [...path, index], value: cloneValue(b[index]) });
              working.splice(index, 0, id);
            }
          }
          if (original.has(id)) walk(original.get(id), b[index], [...path, index]);
        }
        for (let index = working.length - 1; index >= afterIds.length; index--)
          output.push({ op: "remove", path: [...path, index] });
        return;
      }
      const common = Math.min(a.length, b.length);
      for (let index = 0; index < common; index++) walk(a[index], b[index], [...path, index]);
      for (let index = a.length - 1; index >= b.length; index--)
        output.push({ op: "remove", path: [...path, index] });
      for (let index = common; index < b.length; index++)
        output.push({ op: "insert", path: [...path, index], value: cloneValue(b[index]) });
      return;
    }
    if (object(a) && object(b)) {
      for (const key of Object.keys(a))
        if (b[key] === undefined) output.push({ op: "remove", path: [...path, key] });
      for (const [key, value] of Object.entries(b))
        if (value !== undefined) walk(a[key], value, [...path, key]);
      return;
    }
    output.push({ op: "set", path, value: cloneValue(b) });
  };
  walk(before, after, []);
  return output;
}
function at(root: unknown, path: ReplayPath): unknown {
  let node = root;
  for (const key of path) {
    ensure(
      typeof key === "number" || !dangerous.has(key),
      "INVALID_DOCUMENT",
      "Unsafe replay path",
    );
    ensure(
      node !== null && typeof node === "object" && Object.hasOwn(node, key),
      "INVALID_DOCUMENT",
      "Replay path is missing",
    );
    node = (node as Record<string | number, unknown>)[key];
  }
  return node;
}
function change(
  root: unknown,
  path: ReplayPath,
  op: "set" | "insert" | "remove",
  value?: unknown,
): unknown {
  if (path.length === 0) {
    ensure(op === "set", "INVALID_DOCUMENT", "Cannot insert/remove the replay root");
    return cloneValue(value);
  }
  const [key, ...rest] = path;
  ensure(
    key !== undefined && (typeof key === "number" || !dangerous.has(key)),
    "INVALID_DOCUMENT",
    "Unsafe replay path",
  );
  ensure(root !== null && typeof root === "object", "INVALID_DOCUMENT", "Replay path is missing");
  const next: Array<unknown> | Record<string | number, unknown> = Array.isArray(root)
    ? [...root]
    : { ...root };
  if (rest.length) {
    const child = (root as Record<string | number, unknown>)[key];
    (next as Record<string | number, unknown>)[key] = change(child, rest, op, value);
    return next;
  }
  if (Array.isArray(next)) {
    ensure(
      typeof key === "number" &&
        Number.isInteger(key) &&
        key >= 0 &&
        key <= (op === "insert" ? next.length : next.length - 1),
      "INVALID_DOCUMENT",
      "Invalid replay array index",
    );
    if (op === "insert") next.splice(key, 0, cloneValue(value));
    else if (op === "remove") next.splice(key, 1);
    else next[key] = cloneValue(value);
  } else if (op === "remove") {
    ensure(Object.hasOwn(next, key), "INVALID_DOCUMENT", "Replay path is missing");
    delete next[key];
  } else {
    ensure(op === "set", "INVALID_DOCUMENT", "Object insertion requires set");
    next[key] = cloneValue(value);
  }
  return next;
}
export function applyReplayDelta(state: ReplayState, delta: readonly ReplayDelta[]): ReplayState {
  let result: unknown = state;
  for (const operation of delta) {
    if (operation.op === "move") {
      const value = at(result, operation.from);
      result = change(result, operation.from, "remove");
      result = change(result, operation.path, "insert", value);
    } else
      result = change(
        result,
        operation.path,
        operation.op,
        "value" in operation ? operation.value : undefined,
      );
  }
  return result as ReplayState;
}
