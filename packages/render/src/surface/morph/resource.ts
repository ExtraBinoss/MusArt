import { resolveEffectSettings, type Effect, type Layer, type ShapeMorph } from "@musart/core";
import {
  DoubleSide,
  Mesh,
  MeshBasicNodeMaterial,
  NormalBlending,
  OrthographicCamera,
  Scene,
  type Node,
  type RenderTarget,
  type WebGPURenderer,
} from "three/webgpu";
import {
  Fn,
  If,
  Loop,
  attribute,
  clamp,
  float,
  int,
  ivec2,
  mix,
  textureLoad,
  uniform,
  varyingProperty,
  vec4,
} from "three/tsl";
import { compileGpuScene } from "../../compositing/compile";
import type { GpuResource } from "../../cache/GpuResourceCache";
import { glyphCoverage } from "../text/coverage";
import { glyphVertex } from "../text/vertex";
import { textPaint, textPaintNode, updateTextPaint } from "../text/paint";
import { buildMorphAtlas } from "./atlas";
import { morphGeometry } from "./geometry";
import { morphIdentity } from "./identity";

export const sourceMorph = (layer: Layer) =>
  layer.kind === "text" && !layer.text.trim()
    ? undefined
    : [...layer.effects].reverse().find((effect) => effect.enabled && effect.type === "morph");
export function morphResourceKey(layer: Layer, effect: Effect): string {
  const settings = resolveEffectSettings(effect);
  return JSON.stringify([
    layer.id,
    layer.text,
    layer.fontFamily,
    layer.fontSize,
    layer.fontWeight,
    layer.lineHeight,
    layer.letterSpacing,
    layer.textAlign,
    layer.width,
    layer.height,
    layer.vector,
    effect.shapeMorph ? morphIdentity(effect.shapeMorph) : null,
    settings.inflate,
    settings.stretch,
  ]);
}
export class MorphResource implements GpuResource {
  readonly targets = 0;
  readonly scene = new Scene();
  readonly paint = textPaint();
  readonly progress = uniform(0);
  readonly spread = uniform(0);
  readonly order = uniform(0);
  readonly amount = uniform(1);
  readonly camera: OrthographicCamera;
  readonly atlas;
  readonly geometry;
  readonly material;
  readonly bytes: number;
  private readonly key: string;
  private compiled = false;
  private closed = false;
  constructor(layer: Layer, effect: Effect, definition: ShapeMorph) {
    this.key = morphResourceKey(layer, effect);
    this.atlas = buildMorphAtlas(definition);
    const built = morphGeometry(layer, this.atlas);
    this.geometry = built.geometry;
    this.bytes = this.atlas.bytes + built.bytes;
    this.camera = new OrthographicCamera(0, layer.width, 0, layer.height, 0, 100);
    this.camera.position.z = 10;
    const fetch = (pointer: Node<"int">, state: Node<"int">) => {
      const address = pointer.add(state.mul(this.atlas.stride));
      return textureLoad(
        this.atlas.texture,
        ivec2(address.mod(int(this.atlas.width)), address.div(int(this.atlas.width))),
      );
    };
    const selected = varyingProperty("float", "morphStage"),
      blend = varyingProperty("float", "morphBlend");
    const placement = Fn(() => {
      const meta = attribute("morphMeta", "vec2"),
        rank = attribute("morphRank", "float");
      const ordered = this.order
        .equal(1)
        .select(float(1).sub(rank), this.order.equal(2).select(rank.sub(0.5).abs().mul(2), rank));
      const time = clamp(
        this.progress.sub(ordered.mul(this.spread)).div(float(1).sub(this.spread)),
        0,
        1,
      );
      const at = (index: Node<"int">) => fetch(int(meta.x).add(index.mul(2)), int(0));
      const timing = (index: Node<"int">) => fetch(int(meta.x).add(index.mul(2)).add(1), int(0));
      const box0 = at(int(0)),
        box = box0.toVar();
      selected.assign(0);
      blend.assign(0);
      Loop({ start: int(1), end: int(meta.y), type: "int", condition: "<" }, ({ i }) => {
        const destination = timing(i),
          left = timing(i.sub(1)).x;
        const linear = clamp(time.sub(left).div(destination.x.sub(left).max(1e-6)), 0, 1);
        const eased = destination.y
          .equal(1)
          .select(
            float(1).sub(float(1).sub(linear).pow(3)),
            destination.y
              .equal(2)
              .select(linear.mul(linear).mul(float(3).sub(linear.mul(2))), linear),
          );
        If(time.greaterThanEqual(left), () => {
          selected.assign(float(i.sub(1)));
          blend.assign(eased);
          box.assign(mix(at(i.sub(1)), at(i), eased));
        });
      });
      return mix(box0, box, this.amount).mul(
        vec4(layer.width, layer.height, layer.width, layer.height),
      );
    })();
    const vertex = glyphVertex(placement);
    const curve = (pointer: Node<"int">) => {
      const sample = (at: Node<"int">) =>
        mix(
          fetch(at, int(0)),
          mix(fetch(at, int(selected)), fetch(at, int(selected).add(1)), blend),
          this.amount,
        );
      return { first: sample(pointer), last: sample(pointer.add(1)) };
    };
    const paint = textPaintNode(this.paint, vertex.pixel),
      coverage = glyphCoverage(this.atlas.texture, this.atlas.width, vertex.coordinate, curve);
    this.material = new MeshBasicNodeMaterial({
      transparent: true,
      premultipliedAlpha: true,
      blending: NormalBlending,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });
    this.material.positionNode = vertex.position;
    this.material.fragmentNode = vec4(paint.rgb, paint.a.mul(coverage));
    const mesh = new Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.update(layer, effect);
  }
  matchesLayout(layer: Layer): boolean {
    const effect = sourceMorph(layer);
    return !!effect && this.key === morphResourceKey(layer, effect);
  }
  update(layer: Layer, effect: Effect) {
    const settings = resolveEffectSettings(effect);
    this.progress.value = Number(settings.progress);
    this.spread.value = Number(settings.stagger);
    this.order.value = settings.order === "reverse" ? 1 : settings.order === "center" ? 2 : 0;
    this.amount.value = effect.amount * (effect.opacity ?? 1);
    updateTextPaint(this.paint, layer);
  }
  async prepare(renderer: WebGPURenderer, target: RenderTarget, canContinue?: () => boolean) {
    if (this.compiled) return;
    await compileGpuScene(renderer, this.scene, this.camera, target, canContinue);
    this.compiled = true;
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.scene.clear();
    this.geometry.dispose();
    this.material.dispose();
    this.atlas.texture.dispose();
  }
}
