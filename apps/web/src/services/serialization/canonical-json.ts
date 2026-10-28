/** Stable portable JSON, with bounded reuse of repeated object-key layouts during one call. */
export function canonicalJson(value: unknown): string {
  const layouts = new Map<string, readonly string[]>();
  const serialized = JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const keys = Object.keys(item);
    const signature = JSON.stringify(keys);
    let ordered = layouts.get(signature);
    if (!ordered) {
      ordered = keys.sort((a, b) => a.localeCompare(b, "en"));
      if (layouts.size < 128 && signature.length <= 4096) layouts.set(signature, ordered);
    }
    // fromEntries preserves own __proto__ data safely and gives V8 fast property layouts.
    return Object.fromEntries(ordered.map((key) => [key, (item as Record<string, unknown>)[key]]));
  });
  if (serialized === undefined) throw new TypeError("Value is not JSON serializable.");
  return serialized;
}
