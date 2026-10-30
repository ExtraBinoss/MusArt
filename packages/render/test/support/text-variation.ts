/** Small original SFNT fixtures; the underlying font bytes and all glyph outlines stay intact. */
class Bytes {
  readonly data: number[] = [];
  u16(value: number) {
    this.data.push((value >> 8) & 255, value & 255);
    return this;
  }
  u32(value: number) {
    this.u16(value >>> 16).u16(value);
    return this;
  }
  append(bytes: Uint8Array) {
    this.data.push(...bytes);
    return this;
  }
  bytes() {
    return new Uint8Array(this.data);
  }
}
export function replaceSfntTable(source: ArrayBuffer, tag: string, bytes: Uint8Array): ArrayBuffer {
  const offset = Math.ceil(source.byteLength / 4) * 4,
    output = new Uint8Array(offset + Math.ceil(bytes.length / 4) * 4);
  output.set(new Uint8Array(source));
  output.set(bytes, offset);
  const view = new DataView(output.buffer),
    name = Array.from(tag).reduce((value, c) => value * 256 + c.charCodeAt(0), 0);
  for (let i = 0; i < view.getUint16(4); i++) {
    const entry = 12 + i * 16;
    if (view.getUint32(entry) !== name) continue;
    let checksum = 0;
    for (let index = offset; index < output.length; index += 4)
      checksum = (checksum + view.getUint32(index)) >>> 0;
    view.setUint32(entry + 4, checksum);
    view.setUint32(entry + 8, offset);
    view.setUint32(entry + 12, bytes.length);
    return output.buffer;
  }
  throw Error(`Fixture requires existing ${tag}`);
}
export function removeHvar(source: ArrayBuffer): ArrayBuffer {
  const bytes = source.slice(0),
    view = new DataView(bytes);
  for (let i = 0; i < view.getUint16(4); i++) {
    const entry = 12 + i * 16;
    if (view.getUint32(entry) === 0x48564152) {
      view.setUint32(entry, 0x4d555352);
      return bytes;
    }
  }
  throw Error("Fixture requires HVAR");
}
export function gdefStore(axes: number, weightAxis: number): Uint8Array<ArrayBuffer> {
  const header = new Bytes().u16(1).u16(3).u16(0).u16(0).u16(0).u16(0).u16(0).u32(18);
  const dataOffset = 16 + axes * 6;
  const store = new Bytes().u16(1).u32(12).u16(1).u32(dataOffset).u16(axes).u16(1);
  for (let i = 0; i < axes; i++)
    store
      .u16(0)
      .u16(i === weightAxis ? 16384 : 0)
      .u16(i === weightAxis ? 16384 : 0);
  store.u16(1).u16(1).u16(1).u16(0).u16(60);
  return header.append(store.bytes()).bytes();
}
export function pairPositioning(
  format: 1 | 2,
  first: number,
  second: number,
): Uint8Array<ArrayBuffer> {
  const sub = new Bytes();
  const deviceStart = 48,
    coverageStart = 96;
  if (format === 1)
    sub.u16(1).u16(coverageStart).u16(0xff).u16(0xff).u16(1).u16(12).u16(1).u16(second);
  else sub.u16(2).u16(coverageStart).u16(0xff).u16(0xff).u16(102).u16(110).u16(1).u16(1);
  for (let glyph = 0; glyph < 2; glyph++) {
    for (let i = 0; i < 4; i++) sub.u16(3 + glyph * 4 + i);
    for (let i = 0; i < 4; i++)
      sub.u16(deviceStart + (glyph * 4 + i) * 6 - (format === 1 ? 12 : 0));
  }
  for (let i = 0; i < 8; i++) sub.u16(0).u16(0).u16(0x8000);
  sub.u16(1).u16(1).u16(first);
  if (format === 2) sub.u16(1).u16(first).u16(1).u16(0).u16(1).u16(second).u16(1).u16(0);
  const script = new Bytes().u16(1).u32(0x6c61746e).u16(8).u16(4).u16(0).u16(0).u16(0).u16(0);
  const feature = new Bytes().u16(1).u32(0x6b65726e).u16(8).u16(0).u16(1).u16(0);
  const lookup = new Bytes().u16(1).u16(4).u16(2).u16(0).u16(1).u16(8).append(sub.bytes());
  return new Bytes()
    .u16(1)
    .u16(0)
    .u16(10)
    .u16(10 + script.data.length)
    .u16(10 + script.data.length + feature.data.length)
    .append(script.bytes())
    .append(feature.bytes())
    .append(lookup.bytes())
    .bytes();
}
