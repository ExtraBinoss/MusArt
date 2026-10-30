import {
  prepareMorphShape,
  validateShapeMorph,
  type MorphShapeFrame,
  type ShapeMorph,
} from "@musart/core";
import { DataTexture, FloatType, NearestFilter, NoColorSpace, RGBAFormat } from "three/webgpu";

export interface MorphAtlas {
  texture: DataTexture;
  width: number;
  stride: number;
  states: number;
  shapes: { frames: MorphShapeFrame[]; header: number; metadata: number }[];
  bytes: number;
}
/** Stable union bands cover every interpolated contour; playback never rebuilds an atlas. */
export function buildMorphAtlas(definition: ShapeMorph): MorphAtlas {
  validateShapeMorph(definition);
  const maximumStates = Math.max(...definition.shapes.map((shape) => shape.frames.length));
  const estimate =
    definition.shapes.reduce(
      (sum, shape) =>
        sum +
        Math.max(
          ...shape.frames.map((frame) =>
            frame.contours.reduce((n, c) => n + (c.hole ? 64 : 256), 0),
          ),
        ),
      0,
    ) * maximumStates;
  if (estimate > 262144) throw Error("Prepared morph geometry exceeds its point budget");
  const shapes = definition.shapes.map((shape) => ({
    frames: prepareMorphShape(shape.frames),
    header: 0,
    metadata: 0,
  }));
  const states = Math.max(...shapes.map((shape) => shape.frames.length));
  const data = Array.from({ length: states }, () => [] as number[]);
  for (const shape of shapes) {
    const frames = Array.from(
      { length: states },
      (_, i) => shape.frames[Math.min(i, shape.frames.length - 1)]!,
    );
    const curves = frames.map((frame) =>
      frame.contours.flatMap((contour) =>
        contour.points.map((p, i) => {
          const q = contour.points[(i + 1) % contour.points.length]!;
          return [p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, q[0], q[1], 0, 0];
        }),
      ),
    );
    shape.metadata = data[0]!.length / 4;
    for (const buffer of data)
      for (const frame of shape.frames)
        buffer.push(
          ...frame.box,
          frame.at,
          frame.easing === "easeOut" ? 1 : frame.easing === "easeInOut" ? 2 : 0,
          0,
          0,
        );
    const base = data[0]!.length / 4;
    for (let state = 0; state < states; state++)
      for (const curve of curves[state]!) data[state]!.push(...curve);
    shape.header = data[0]!.length / 4;
    for (const buffer of data) buffer.push(...Array.from({ length: 16 * 2 * 4 }, () => 0));
    const ranges = curves[0]!.map((_, i) => {
      const all = curves.map((state) => state[i]!);
      return {
        min: [
          Math.min(...all.map((c) => Math.min(c[0]!, c[2]!, c[4]!))),
          Math.min(...all.map((c) => Math.min(c[1]!, c[3]!, c[5]!))),
        ],
        max: [
          Math.max(...all.map((c) => Math.max(c[0]!, c[2]!, c[4]!))),
          Math.max(...all.map((c) => Math.max(c[1]!, c[3]!, c[5]!))),
        ],
      };
    });
    for (let axis = 0; axis < 2; axis++)
      for (let band = 0; band < 16; band++) {
        const start = data[0]!.length / 4;
        ranges.forEach((range, i) => {
          const cross = 1 - axis;
          if (range.max[cross]! >= band / 16 - 1e-5 && range.min[cross]! <= (band + 1) / 16 + 1e-5)
            for (const buffer of data) buffer.push(base + i * 2, 0, 0, 0);
        });
        const count = data[0]!.length / 4 - start;
        if (count > 1024) throw Error("Morph contour band exceeds the GPU loop budget");
        for (const buffer of data) {
          const offset = (shape.header + axis * 16 + band) * 4;
          buffer[offset] = start;
          buffer[offset + 1] = count;
        }
      }
  }
  const texels = data[0]!.length / 4;
  const width = Math.min(
    2048,
    2 ** Math.ceil(Math.log2(Math.max(1, Math.ceil(Math.sqrt(texels * states))))),
  );
  const rows = Math.max(1, Math.ceil(texels / width)),
    height = rows * states,
    stride = rows * width;
  if (height > 2048 || width * height * 16 > 64 * 1024 * 1024)
    throw Error("Morph atlas exceeds its 64 MiB budget");
  const pixels = new Float32Array(width * height * 4);
  data.forEach((buffer, i) => pixels.set(buffer, i * stride * 4));
  const texture = new DataTexture(pixels, width, height, RGBAFormat, FloatType);
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.colorSpace = NoColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return { texture, width, stride, states, shapes, bytes: pixels.byteLength };
}
