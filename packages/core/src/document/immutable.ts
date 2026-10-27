/** Copies structured data while sharing immutable primitive strings (including original bytes). */
export function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => cloneValue(item)) as T;
  if (value !== null && typeof value === "object") {
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const child = cloneValue((value as Record<string, unknown>)[key]);
      if (key === "__proto__")
        Object.defineProperty(copy, key, {
          value: child,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      else copy[key] = child;
    }
    return copy as T;
  }
  return value;
}
export function freezeValue<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeValue(child);
    Object.freeze(value);
  }
  return value;
}
