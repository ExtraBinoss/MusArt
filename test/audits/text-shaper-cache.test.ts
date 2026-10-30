import { readFile } from "node:fs/promises";
import { afterEach, expect, it, vi } from "vitest";
import {
  Direction,
  Face,
  Font,
  GlyphBuffer,
  UnicodeBuffer,
  getGlyphPathWithVariation,
  shapeInto,
} from "text-shaper";

afterEach(() => vi.restoreAllMocks());

async function bytes() {
  return Uint8Array.from(await readFile("apps/web/public/fonts/inter/font.ttf")).buffer;
}
function coordinates(font: Font, weight: number) {
  return new Face(font, { wght: weight, opsz: 14 }).normalizedCoords.slice();
}
function extract(font: Font, weight: number, glyph = font.glyphId(65)) {
  return getGlyphPathWithVariation(font, glyph, coordinates(font, weight));
}

/** Observe only native coordinate-Map writes during a synchronous public outline request. */
function observeCoordinates(keys: ReadonlySet<string>) {
  const nativeSet = Map.prototype.set;
  const maps: Map<unknown, unknown>[] = [];
  let active = false;
  vi.spyOn(Map.prototype, "set").mockImplementation(function (
    this: Map<unknown, unknown>,
    key: unknown,
    value: unknown,
  ) {
    const result = nativeSet.call(this, key, value);
    if (active && typeof key === "string" && keys.has(key) && value instanceof Map) {
      if (!maps.includes(this)) maps.push(this);
    }
    return result;
  });
  return {
    maps,
    run<T>(work: () => T): T {
      active = true;
      try {
        return work();
      } finally {
        active = false;
      }
    },
  };
}

it("promotes an old coordinate set and evicts the least recently used set without changing its contours", async () => {
  const source = await bytes();
  const font = Font.load(source),
    reference = Font.load(source);
  const weights = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  const keys = weights.map((weight) => coordinates(font, weight).join(","));
  const expected = weights.map((weight) => extract(reference, weight));
  const probe = observeCoordinates(new Set(keys));
  for (let i = 0; i < 8; i++)
    expect(probe.run(() => extract(font, weights[i]!))).toEqual(expected[i]);
  expect(probe.maps).toHaveLength(1);
  const cache = probe.maps[0]!;
  expect([...cache.keys()]).toEqual(keys.slice(0, 8));
  const firstSet = cache.get(keys[0]),
    evictedSet = cache.get(keys[1]);
  expect(probe.run(() => extract(font, 100))).toEqual(expected[0]);
  expect(cache.get(keys[0])).toBe(firstSet);
  expect([...cache.keys()]).toEqual([...keys.slice(1, 8), keys[0]]);
  expect(probe.run(() => extract(font, 900))).toEqual(expected[8]);
  expect(cache.size).toBe(8);
  expect(cache.has(keys[1])).toBe(false);
  expect(cache.get(keys[0])).toBe(firstSet);
  expect(probe.run(() => extract(font, 200))).toEqual(expected[1]);
  expect(cache.size).toBe(8);
  expect(cache.get(keys[1])).not.toBe(evictedSet);
  expect([...cache.keys()].at(-1)).toBe(keys[1]);
});

it("bounds continuous fractional weights to eight sets and keeps independent fonts isolated", async () => {
  const source = await bytes(),
    font = Font.load(source),
    other = Font.load(source);
  const weights = Array.from({ length: 97 }, (_, index) => 100 + index * 7.123456);
  const keys = weights.map((weight) => coordinates(font, weight).join(","));
  const probe = observeCoordinates(new Set(keys));
  for (const weight of weights) {
    const path = probe.run(() => extract(font, weight));
    expect(path?.commands.length).toBeGreaterThan(0);
    expect(probe.maps[0]!.size).toBeLessThanOrEqual(8);
  }
  expect([...probe.maps[0]!.keys()]).toEqual(keys.slice(-8));
  const finalPath = extract(font, weights.at(-1)!);
  expect(probe.run(() => extract(other, weights.at(-1)!))).toEqual(finalPath);
  expect(probe.maps).toHaveLength(2);
  expect(probe.maps[1]!.size).toBe(1);
  expect(probe.maps[0]!.size).toBe(8);
});

it("retains the existing 256-glyph limit inside a coordinate set", async () => {
  const font = Font.load(await bytes()),
    weight = 637.25;
  const key = coordinates(font, weight).join(",");
  const probe = observeCoordinates(new Set([key]));
  let populated = 0,
    first = -1;
  for (let glyph = 0; glyph < Math.min(font.numGlyphs, 512) && populated < 300; glyph++) {
    probe.run(() => extract(font, weight, glyph));
    const set = probe.maps[0]?.get(key);
    if (!(set instanceof Map) || !set.has(glyph)) continue;
    if (first < 0) first = glyph;
    populated++;
    expect(set.size).toBeLessThanOrEqual(256);
  }
  expect(populated).toBe(300);
  const set = probe.maps[0]!.get(key) as Map<number, unknown>;
  expect(set.size).toBe(256);
  expect(set.has(first)).toBe(false);
});

it("retains the real format-3 anchor Device/VariationIndex data through the public font table", async () => {
  let retained = 0;
  for (const family of ["inter", "dm-sans", "merriweather"]) {
    const source = Uint8Array.from(
      await readFile(`apps/web/public/fonts/${family}/font.ttf`),
    ).buffer;
    const pending: unknown[] = [Font.load(source).gpos],
      seen = new Set<object>();
    while (pending.length) {
      const value = pending.pop();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      const record = value as Record<string, unknown>;
      if (typeof record.xCoordinate === "number" && typeof record.yCoordinate === "number") {
        for (const axis of ["x", "y"] as const) {
          const offset = record[`${axis}DeviceOffset`];
          if (typeof offset !== "number" || offset === 0) continue;
          const device = record[`${axis}Device`];
          expect(device).toBeTypeOf("object");
          expect(device).not.toBeNull();
          const table = device as Record<string, unknown>;
          if ("deltaSetOuterIndex" in table) {
            expect(table.deltaSetOuterIndex).toBeTypeOf("number");
            expect(table.deltaSetInnerIndex).toBeTypeOf("number");
          } else {
            expect(table.deltaFormat).toBeTypeOf("number");
            expect(Array.isArray(table.deltaValues)).toBe(true);
          }
          retained++;
        }
      }
      pending.push(...Object.values(record));
    }
  }
  expect(retained).toBeGreaterThan(0);
});

it("removes consumed Caveat ligature glyphs before the later contextual lookup", async () => {
  const source = Uint8Array.from(await readFile("apps/web/public/fonts/caveat/font.ttf")).buffer;
  const font = Font.load(source),
    face = new Face(font, { wght: 600, opsz: 14 });
  const input = new UnicodeBuffer().addStr("office.").setScript("Latn").setDirection(Direction.LTR);
  const output = GlyphBuffer.withCapacity(16);
  shapeInto(face, input, output, { script: "latn", direction: "ltr" });
  // Frozen HarfBuzz trace: liga lookup 2 precedes calt lookup 3 in these real bundled bytes.
  expect(output.infos.map((info) => info.glyphId)).toEqual([311, 441, 233, 392, 885]);
});
