import type { Font, Reader } from "text-shaper";
interface ItemData {
  reader: Reader;
  count: number;
  words: number;
  long: boolean;
  regions: number[];
  start: number;
  stride: number;
}
/** GDEF1.3 ItemVariationStore, per the OpenType common variation formats. */
export function readPositioningStore(font: Font) {
  const table = font.getTableReader(0x47444546);
  if (!table || table.length < 18) return null;
  if (table.uint16() !== 1 || table.uint16() < 3) return null;
  table.seek(14);
  const offset = table.uint32();
  if (!offset) return null;
  const reader = table.sliceFrom(offset);
  if (reader.uint16() !== 1) throw Error("Unsupported GDEF variation store.");
  const regionOffset = reader.uint32(),
    count = reader.uint16();
  const offsets = Array.from({ length: count }, () => reader.uint32());
  const regionReader = reader.sliceFrom(regionOffset),
    axes = regionReader.uint16(),
    regionCount = regionReader.uint16();
  regionReader.ensureRemaining(axes * regionCount * 6);
  const regions = Array.from({ length: regionCount }, () =>
    Array.from(
      { length: axes },
      () => [regionReader.f2dot14(), regionReader.f2dot14(), regionReader.f2dot14()] as const,
    ),
  );
  const data = new Map<number, ItemData>();
  function getData(index: number): ItemData | null {
    if (!Number.isInteger(index) || index < 0 || index >= offsets.length) return null;
    const cached = data.get(index);
    if (cached) return cached;
    const row = reader.sliceFrom(offsets[index]!);
    const count = row.uint16(),
      packed = row.uint16(),
      regionCount = row.uint16();
    const words = packed & 0x7fff,
      long = (packed & 0x8000) !== 0;
    if (words > regionCount) throw Error("Invalid GDEF variation delta count.");
    const indexes = Array.from({ length: regionCount }, () => row.uint16());
    const stride = words * (long ? 4 : 2) + (regionCount - words) * (long ? 2 : 1);
    row.ensureRemaining(count * stride);
    const result = { reader: row, count, words, long, regions: indexes, start: row.offset, stride };
    data.set(index, result);
    return result;
  }
  let scalars: number[] = [];
  return {
    coordinates(coordinates: readonly number[]) {
      if (axes !== coordinates.length)
        throw Error("GDEF variation axis count does not match the font.");
      scalars = regions.map((region) => {
        let scalar = 1;
        for (let i = 0; i < region.length; i++) {
          const [start, peak, end] = region[i]!,
            value = coordinates[i]!;
          if (
            start > peak ||
            peak > end ||
            (start < 0 && end > 0 && peak !== 0) ||
            peak === 0 ||
            value === peak
          )
            continue;
          if (value <= start || value >= end) return 0;
          scalar *= value < peak ? (value - start) / (peak - start) : (end - value) / (end - peak);
        }
        return scalar;
      });
    },
    delta(outer: number, inner: number): number {
      const table = getData(outer);
      if (!table || !Number.isInteger(inner) || inner < 0 || inner >= table.count) return 0;
      const row = table.reader.slice(table.start + inner * table.stride, table.stride);
      let sum = 0;
      for (let i = 0; i < table.regions.length; i++) {
        const delta =
          i < table.words
            ? table.long
              ? row.int32()
              : row.int16()
            : table.long
              ? row.int16()
              : row.int8();
        sum += delta * (scalars[table.regions[i]!] ?? 0);
      }
      return Math.round(sum);
    },
  };
}
