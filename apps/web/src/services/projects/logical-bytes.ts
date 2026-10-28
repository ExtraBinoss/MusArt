/** Logical UTF-8 JSON payload size. Browser origin estimates account for engine/index overhead. */
export function logicalBytes(value: unknown): number {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? 0 : new TextEncoder().encode(serialized).byteLength;
}
