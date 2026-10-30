import type { Font } from "text-shaper";
import { readPositioningStore } from "./variation-store";
interface Binding {
  record: Record<string, unknown>;
  field: string;
  original: unknown;
  outer: number;
  inner: number;
}
interface State {
  users: number;
  key: string;
  bindings: Binding[];
  store: NonNullable<ReturnType<typeof readPositioningStore>>;
}
const states = new WeakMap<Font, State>();
const fields = {
  xPlaDevice: "xPlacement",
  yPlaDevice: "yPlacement",
  xAdvDevice: "xAdvance",
  yAdvDevice: "yAdvance",
  xDevice: "xCoordinate",
  yDevice: "yCoordinate",
} as const;
/** Resolve variable positioning metadata once per axis change before synchronous shapeInto. */
export function acquirePositioning(font: Font) {
  let state = states.get(font);
  if (!state) {
    const store = font.isVariable ? readPositioningStore(font) : null;
    if (store) {
      const bindings: Binding[] = [],
        visited = new WeakSet<object>();
      function visit(value: unknown) {
        if (!value || typeof value !== "object" || visited.has(value)) return;
        visited.add(value);
        if (Array.isArray(value)) {
          for (const child of value) visit(child);
          return;
        }
        if (Object.getPrototypeOf(value) !== Object.prototype) return;
        const record = value as Record<string, unknown>;
        for (const device in record) {
          if (!Object.hasOwn(record, device)) continue;
          const index = record[device];
          if (!index || typeof index !== "object") continue;
          const field = Object.hasOwn(fields, device)
            ? fields[device as keyof typeof fields]
            : undefined;
          if (!field || !("deltaSetOuterIndex" in index) || !("deltaSetInnerIndex" in index)) {
            visit(index);
            continue;
          }
          if (
            typeof index.deltaSetOuterIndex !== "number" ||
            typeof index.deltaSetInnerIndex !== "number"
          )
            throw Error("Invalid positioning variation index.");
          bindings.push({
            record,
            field,
            original: record[field],
            outer: index.deltaSetOuterIndex,
            inner: index.deltaSetInnerIndex,
          });
        }
      }
      visit(font.gpos?.lookups);
      state = { users: 0, key: "", bindings, store };
      states.set(font, state);
    }
  }
  if (!state) return { apply(_coordinates: readonly number[]) {}, dispose() {} };
  state.users++;
  let owner: State | undefined = state;
  return {
    apply(coordinates: readonly number[]) {
      if (!owner) throw Error("Positioning variations are disposed.");
      const key = JSON.stringify(coordinates);
      if (owner.key === key) return;
      owner.store.coordinates(coordinates);
      const deltas = new Map<number, number>();
      const values = owner.bindings.map((binding) => {
        const index = binding.outer * 65536 + binding.inner;
        let delta = deltas.get(index);
        if (delta === undefined) {
          delta = owner!.store.delta(binding.outer, binding.inner);
          deltas.set(index, delta);
        }
        return Number(binding.original ?? 0) + delta;
      });
      for (const [index, binding] of owner.bindings.entries())
        binding.record[binding.field] = values[index]!;
      owner.key = key;
    },
    dispose() {
      if (!owner) return;
      if (--owner.users === 0) {
        for (const binding of owner.bindings) {
          if (binding.original === undefined) delete binding.record[binding.field];
          else binding.record[binding.field] = binding.original;
        }
        states.delete(font);
      }
      owner = undefined;
    },
  };
}
