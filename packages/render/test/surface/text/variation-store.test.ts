import { expect, test } from "vitest";
import { Font, Reader } from "text-shaper";
import { readPositioningStore } from "../../../src/surface/text/variation-store";

function storeBytes(long = false) {
  const bytes = new ArrayBuffer(long ? 68 : 62),
    d = new DataView(bytes);
  d.setUint16(0, 1);
  d.setUint16(2, 3);
  d.setUint32(14, 18);
  d.setUint16(18, 1);
  d.setUint32(20, 12);
  d.setUint16(24, 1);
  d.setUint32(26, 28);
  d.setUint16(30, 1);
  d.setUint16(32, 2);
  d.setInt16(34, 0);
  d.setInt16(36, 16384);
  d.setInt16(38, 16384);
  d.setInt16(40, -16384);
  d.setInt16(42, -16384);
  d.setInt16(44, 0);
  d.setUint16(46, 2);
  d.setUint16(48, long ? 0x8001 : 1);
  d.setUint16(50, 2);
  d.setUint16(52, 0);
  d.setUint16(54, 1);
  if (long) {
    d.setInt32(56, 70000);
    d.setInt16(60, -30);
    d.setInt32(62, -40000);
    d.setInt16(66, 12);
  } else {
    d.setInt16(56, 60);
    d.setInt8(58, -20);
    d.setInt16(59, -40);
    d.setInt8(61, 12);
  }
  return bytes;
}
function source(bytes: ArrayBuffer | null) {
  return { getTableReader: () => (bytes ? new Reader(bytes) : null) } as unknown as Font;
}

test("reads positive/negative variation regions and signed narrow delta rows", () => {
  const store = readPositioningStore(source(storeBytes()))!;
  store.coordinates([1]);
  expect(store.delta(0, 0)).toBe(60);
  expect(store.delta(0, 1)).toBe(-40);
  store.coordinates([0.5]);
  expect(store.delta(0, 0)).toBe(30);
  store.coordinates([-0.5]);
  expect(store.delta(0, 0)).toBe(-10);
  expect(store.delta(0, 1)).toBe(6);
  store.coordinates([0]);
  expect(store.delta(0, 0)).toBe(0);
  expect(store.delta(1, 0)).toBe(0);
  expect(store.delta(0, 3)).toBe(0);
  expect(() => store.coordinates([])).toThrow("axis count");
});

test("reads long-word deltas and rejects truncated or malformed stores", () => {
  const bytes = storeBytes(true),
    store = readPositioningStore(source(bytes))!;
  store.coordinates([1]);
  expect(store.delta(0, 0)).toBe(70000);
  expect(store.delta(0, 1)).toBe(-40000);
  const invalid = bytes.slice(0);
  new DataView(invalid).setUint16(48, 3);
  const invalidStore = readPositioningStore(source(invalid))!;
  invalidStore.coordinates([1]);
  expect(() => invalidStore.delta(0, 0)).toThrow("delta count");
  const truncated = readPositioningStore(source(bytes.slice(0, 59)))!;
  truncated.coordinates([1]);
  expect(() => truncated.delta(0, 0)).toThrow();
  const unknown = bytes.slice(0);
  new DataView(unknown).setUint16(18, 2);
  expect(() => readPositioningStore(source(unknown))).toThrow("Unsupported");
});

test("skips absent, older and empty GDEF stores honestly", () => {
  expect(readPositioningStore(source(null))).toBeNull();
  expect(readPositioningStore(source(new ArrayBuffer(12)))).toBeNull();
  const old = storeBytes();
  new DataView(old).setUint16(2, 2);
  expect(readPositioningStore(source(old))).toBeNull();
  const empty = storeBytes();
  new DataView(empty).setUint32(14, 0);
  expect(readPositioningStore(source(empty))).toBeNull();
});

test("rejects oversized region declarations before allocating their coordinate triples", () => {
  const bytes = storeBytes(),
    view = new DataView(bytes);
  view.setUint16(30, 65535);
  view.setUint16(32, 65535);
  expect(() => readPositioningStore(source(bytes))).toThrow(
    /Unexpected end of data: need 25769017350 bytes/,
  );
});
