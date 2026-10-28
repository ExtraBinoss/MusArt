import type { FragmentPart, FragmentPath } from "./model";
export const ARRAY_CHUNK_ITEMS = 64;
export const STRING_CHUNK_CHARS = 8192;
export const MAX_INLINE_BYTES = 32768;
const INLINE_STRING_CHARS = 1024;
type Pending = () => Generator<FragmentPart>;
interface Budget {
  bytes: number;
}
export class FragmentBudgetError extends Error {
  constructor() {
    super("Inline object exceeds its transport budget.");
    this.name = "FragmentBudgetError";
  }
}

/** Stream an owned immutable DTO; snapshot mutable callers before scheduling this traversal. */
export function* fragmentValue(frame: unknown): Generator<FragmentPart> {
  const pending: Pending[] = [];
  function charge(budget: Budget, bytes: number) {
    budget.bytes += bytes;
    if (budget.bytes > MAX_INLINE_BYTES) throw new FragmentBudgetError();
  }
  function split(value: unknown, path: FragmentPath, tasks: Pending[], budget: Budget): unknown {
    charge(budget, 16);
    if (typeof value === "string") {
      if (value.length <= INLINE_STRING_CHARS) {
        charge(budget, value.length * 2);
        return value;
      }
      tasks.push(function* () {
        for (let offset = 0; offset < value.length; offset += STRING_CHUNK_CHARS)
          yield {
            type: "string",
            path,
            offset,
            total: value.length,
            value: value.slice(offset, offset + STRING_CHUNK_CHARS),
          };
      });
      return "";
    }
    if (Array.isArray(value)) {
      if (value.length)
        tasks.push(function* () {
          let prepared: { item: unknown; tasks: Pending[]; bytes: number } | undefined;
          for (let offset = 0; offset < value.length;) {
            const nested: Pending[] = [],
              items: unknown[] = [];
            let bytes = 0;
            while (offset + items.length < value.length && items.length < ARRAY_CHUNK_ITEMS) {
              if (!prepared) {
                const childTasks: Pending[] = [],
                  childBudget = { bytes: 0 };
                const item = split(
                  value[offset + items.length],
                  [...path, offset + items.length],
                  childTasks,
                  childBudget,
                );
                prepared = { item, tasks: childTasks, bytes: childBudget.bytes };
              }
              if (items.length && bytes + prepared.bytes > MAX_INLINE_BYTES) break;
              items.push(prepared.item);
              nested.push(...prepared.tasks);
              bytes += prepared.bytes;
              prepared = undefined;
            }
            yield { type: "array", path, offset, total: value.length, value: items };
            for (const task of nested) yield* task();
            offset += items.length;
          }
        });
      return !value.length && Object.isFrozen(value) ? value : [];
    }
    if (!value || typeof value !== "object") return value;
    const keys = Object.keys(value),
      values: unknown[] = [];
    let changed = false;
    for (const key of keys) {
      charge(budget, key.length * 2);
      const child = (value as Record<string, unknown>)[key];
      let result: unknown;
      if (
        (child === null || typeof child !== "object") &&
        (typeof child !== "string" || child.length <= INLINE_STRING_CHARS)
      ) {
        charge(budget, 16 + (typeof child === "string" ? child.length * 2 : 0));
        result = child;
      } else if (Array.isArray(child) && !child.length && Object.isFrozen(child)) {
        charge(budget, 16);
        result = child;
      } else result = split(child, [...path, key], tasks, budget);
      changed ||= result !== child;
      values.push(result);
    }
    // Published immutable leaves already have fast stable object shapes. Reuse them rather than
    // allocating a path and tuple per scalar (hundreds of thousands for a large layer selection).
    if (!changed && Object.isFrozen(value)) return value;
    return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
  }
  yield { type: "base", value: split(frame, [], pending, { bytes: 0 }) };
  for (const task of pending) yield* task();
}
