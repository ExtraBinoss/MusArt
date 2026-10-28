import { ensure } from "../errors";
import { cloneValue } from "../document/immutable";
import type { ReplayDelta, ReplayPath, ReplayState } from "./model";
const dangerous = new Set(["__proto__", "prototype", "constructor"]);
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function identities(items: unknown[]): string[] | null {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!object(item)) return null;
    const id = item.id;
    if (typeof id !== "string" || seen.has(id)) return null;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}
/** A drag shifts one contiguous range; recognize both directions without repeated array searches. */
function singleIdentityMove(
  before: string[],
  after: string[],
): { from: number; to: number } | null {
  if (before.length !== after.length) return null;
  let first = 0;
  while (first < before.length && before[first] === after[first]) first++;
  if (first === before.length) return null;
  let last = before.length - 1;
  while (last > first && before[last] === after[last]) last--;
  if (before[first] === after[last]) {
    let index = first;
    while (index < last && before[index + 1] === after[index]) index++;
    if (index === last) return { from: first, to: last };
  }
  if (before[last] === after[first]) {
    let index = first;
    while (index < last && before[index] === after[index + 1]) index++;
    if (index === last) return { from: last, to: first };
  }
  return null;
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
        const original = new Map(beforeIds.map((id, index) => [id, a[index]])),
          move = singleIdentityMove(beforeIds, afterIds);
        if (move) {
          output.push({ op: "move", from: [...path, move.from], path: [...path, move.to] });
          for (const [index, id] of afterIds.entries())
            walk(original.get(id), b[index], [...path, index]);
          return;
        }
        const working = [...beforeIds];
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
        if (value !== undefined && !Object.is(a[key], value)) walk(a[key], value, [...path, key]);
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
  value: unknown,
  owned: WeakSet<object>,
): unknown {
  if (path.length === 0) {
    ensure(op === "set", "INVALID_DOCUMENT", "Cannot insert/remove the replay root");
    const replacement = cloneValue(value);
    if (replacement !== null && typeof replacement === "object") owned.add(replacement);
    return replacement;
  }
  const [key, ...rest] = path;
  ensure(
    key !== undefined && (typeof key === "number" || !dangerous.has(key)),
    "INVALID_DOCUMENT",
    "Unsafe replay path",
  );
  ensure(root !== null && typeof root === "object", "INVALID_DOCUMENT", "Replay path is missing");
  // Containers copied by an earlier operation are private to this batch and can be reused.
  const next: Array<unknown> | Record<string | number, unknown> = owned.has(root)
    ? (root as Array<unknown> | Record<string | number, unknown>)
    : Array.isArray(root)
      ? [...root]
      : { ...root };
  owned.add(next);
  if (rest.length) {
    const child = (root as Record<string | number, unknown>)[key];
    (next as Record<string | number, unknown>)[key] = change(child, rest, op, value, owned);
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
  const owned = new WeakSet<object>();
  for (const operation of delta) {
    if (operation.op === "move") {
      const value = at(result, operation.from);
      result = change(result, operation.from, "remove", undefined, owned);
      result = change(result, operation.path, "insert", value, owned);
    } else
      result = change(
        result,
        operation.path,
        operation.op,
        "value" in operation ? operation.value : undefined,
        owned,
      );
  }
  return result as ReplayState;
}
