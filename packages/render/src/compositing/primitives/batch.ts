import type { Layer } from "@musart/core";
import {
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicNodeMaterial,
  NormalBlending,
  OrthographicCamera,
  Quaternion,
  Scene,
  Vector3,
  type InstancedBufferAttribute,
  type PlaneGeometry,
  type RenderTarget,
  type WebGPURenderer,
} from "three/webgpu";
import type { GpuResource } from "../../cache/GpuResourceCache";
import { parseColor } from "../nodes/color";
import {
  BASE_GEOMETRY_BYTES,
  INSTANCE_BYTES,
  MAX_PRIMITIVE_INSTANCES,
  primitiveCapacity,
  primitiveGeometry,
} from "./attributes";
import { primitiveNode } from "./node";
/** One bounded retained buffer is reused across contiguous ordered runs and isolated groups. */
export class PrimitiveBatch implements GpuResource {
  readonly targets = 0;
  passes = 0;
  instances = 0;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(0, 1, 0, 1, 0, 10);
  private readonly material = new MeshBasicNodeMaterial({
    transparent: true,
    premultipliedAlpha: true,
    blending: NormalBlending,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    side: DoubleSide,
  });
  private mesh: InstancedMesh<PlaneGeometry, MeshBasicNodeMaterial> | null = null;
  private capacity = 0;
  private closed = false;
  private readonly matrix = new Matrix4();
  private readonly position = new Vector3();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly axis = new Vector3(0, 0, 1);
  constructor(private readonly renderer: WebGPURenderer) {
    this.camera.position.z = 1;
    this.material.fragmentNode = primitiveNode();
  }
  get bytes(): number {
    return this.capacity ? BASE_GEOMETRY_BYTES + this.capacity * INSTANCE_BYTES : 0;
  }
  projectedBytes(count: number): number {
    return count
      ? BASE_GEOMETRY_BYTES + Math.max(this.capacity, primitiveCapacity(count)) * INSTANCE_BYTES
      : this.bytes;
  }
  private reserve(count: number): InstancedMesh<PlaneGeometry, MeshBasicNodeMaterial> {
    if (count > this.capacity) {
      const capacity = primitiveCapacity(count),
        geometry = primitiveGeometry(capacity);
      const mesh = new InstancedMesh(geometry, this.material, capacity);
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      if (this.mesh) {
        this.scene.remove(this.mesh);
        this.mesh.dispose();
        this.mesh.geometry.dispose();
      }
      this.mesh = mesh;
      this.capacity = capacity;
      this.scene.add(mesh);
    }
    return this.mesh!;
  }
  draw(
    layers: readonly Layer[],
    width: number,
    height: number,
    density: number,
    target: RenderTarget,
  ): void {
    if (this.closed) throw new Error("Primitive batch is disposed.");
    if (!layers.length) return;
    const mesh = this.reserve(Math.min(layers.length, MAX_PRIMITIVE_INSTANCES));
    this.camera.right = width;
    this.camera.bottom = height;
    this.camera.updateProjectionMatrix();
    const attributes = mesh.geometry.attributes as Record<string, InstancedBufferAttribute>;
    const before = this.renderer.getRenderTarget(),
      autoClear = this.renderer.autoClear;
    try {
      this.renderer.autoClear = false;
      this.renderer.setRenderTarget(target);
      for (let start = 0; start < layers.length; start += this.capacity) {
        const count = Math.min(this.capacity, layers.length - start);
        for (let index = 0; index < count; index++) {
          const layer = layers[start + index]!;
          this.position.set(layer.x + layer.width / 2, layer.y + layer.height / 2, 0);
          this.scale.set(layer.width, -layer.height, 1);
          this.rotation.setFromAxisAngle(this.axis, (layer.rotation * Math.PI) / 180);
          mesh.setMatrixAt(index, this.matrix.compose(this.position, this.rotation, this.scale));
          const fill = parseColor(layer.fill),
            stroke = parseColor(layer.stroke);
          attributes.primitiveFill!.setXYZW(index, fill.x, fill.y, fill.z, fill.w);
          attributes.primitiveStroke!.setXYZW(index, stroke.x, stroke.y, stroke.z, stroke.w);
          attributes.primitiveShape!.setXYZW(
            index,
            layer.width * density,
            layer.height * density,
            Math.min(layer.radius, layer.width / 2, layer.height / 2) * density,
            layer.strokeWidth * density,
          );
          attributes.primitiveKindOpacity!.setXY(
            index,
            layer.kind === "ellipse" ? 1 : 0,
            layer.opacity,
          );
        }
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
        for (const name of [
          "primitiveFill",
          "primitiveStroke",
          "primitiveShape",
          "primitiveKindOpacity",
        ])
          attributes[name]!.needsUpdate = true;
        this.renderer.render(this.scene, this.camera);
        this.passes++;
        this.instances += count;
      }
    } finally {
      this.renderer.setRenderTarget(before);
      this.renderer.autoClear = autoClear;
    }
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.dispose();
      this.mesh.geometry.dispose();
    }
    this.mesh = null;
    this.capacity = 0;
    this.material.dispose();
    this.scene.clear();
  }
}
