/** Copies structured data while sharing immutable primitive strings (including original bytes). */
export function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item: unknown) => cloneValue(item)) as T;
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cloneValue(child)]),
    ) as T;
  return value;
}
export function freezeValue<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeValue(child);
    Object.freeze(value);
  }
  return value;
}
