import type { Node } from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  abs,
  clamp,
  float,
  floor,
  fract,
  int,
  max,
  mix,
  mx_cell_noise_float,
  mx_noise_float,
  mx_worley_noise_float_3d,
  pow,
  vec3,
} from "three/tsl";

export interface NoiseFieldControls {
  algorithm: Node<"float">;
  octaves: Node<"float">;
  lacunarity: Node<"float">;
  persistence: Node<"float">;
  jitter: Node<"float">;
}

/** Smooth value interpolation is distinct from gradient Perlin and nearest-cell noise. */
export function valueNoise3d(position: Node<"vec3">) {
  const cell = floor(position),
    f = fract(position);
  const fade = f
    .mul(f)
    .mul(f)
    .mul(f.mul(f.mul(6).sub(15)).add(10));
  const row = (y: number, z: number) =>
    mix(
      mx_cell_noise_float(cell.add(vec3(0, y, z))),
      mx_cell_noise_float(cell.add(vec3(1, y, z))),
      fade.x,
    );
  return mix(mix(row(0, 0), row(1, 0), fade.y), mix(row(0, 1), row(1, 1), fade.y), fade.z);
}

/** Only the uniform-selected field executes. Fractal variants have at most six octaves. */
export function noiseField(position: Node<"vec3">, controls: NoiseFieldControls): Node<"float"> {
  return Fn(() => {
    const p = vec3(position).toVar(),
      value = float(0).toVar();
    If(controls.algorithm.lessThan(0.5), () => {
      value.assign(mx_noise_float(p).mul(0.5).add(0.5));
    })
      .ElseIf(controls.algorithm.lessThan(1.5), () => {
        value.assign(valueNoise3d(p));
      })
      .ElseIf(controls.algorithm.lessThan(2.5), () => {
        value.assign(mx_cell_noise_float(p));
      })
      .ElseIf(controls.algorithm.lessThan(3.5), () => {
        value.assign(mx_worley_noise_float_3d(p, controls.jitter));
      })
      .Else(() => {
        const point = vec3(p).toVar(),
          sum = float(0).toVar(),
          norm = float(0).toVar(),
          weight = float(1).toVar();
        Loop({ start: 0, end: int(clamp(controls.octaves, 1, 6)), type: "int" }, () => {
          If(weight.greaterThan(0.00001), () => {
            const base = mx_noise_float(point).toVar(),
              sample = float(0).toVar();
            If(controls.algorithm.lessThan(4.5), () => {
              sample.assign(base.mul(0.5).add(0.5));
            })
              .ElseIf(controls.algorithm.lessThan(5.5), () => {
                sample.assign(pow(float(1).sub(abs(base)), 2));
              })
              .Else(() => {
                sample.assign(abs(base));
              });
            sum.addAssign(sample.mul(weight));
            norm.addAssign(weight);
          });
          point.mulAssign(controls.lacunarity);
          weight.mulAssign(controls.persistence);
        });
        value.assign(sum.div(max(norm, 0.00001)));
      });
    return clamp(value, 0, 1);
  })();
}
