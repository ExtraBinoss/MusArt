export interface SliderValueSource {
  readonly read: () => readonly number[];
  readonly subscribe: (listener: () => void) => () => void;
}

/** Small presentation store shared by clocks and genuine Radix sliders. No parent React updates. */
export function createSliderValue(initial: readonly number[] = [0]) {
  let value = Object.freeze([...initial]);
  const listeners = new Set<() => void>();
  return {
    read: () => value,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: (next: readonly number[]) => {
      if (!next.length || next.some((item) => !Number.isFinite(item)))
        throw new RangeError("Invalid slider value");
      if (
        next.length === value.length &&
        next.every((item, index) => Object.is(item, value[index]))
      )
        return;
      value = Object.freeze([...next]);
      for (const listener of listeners) listener();
    },
  };
}
