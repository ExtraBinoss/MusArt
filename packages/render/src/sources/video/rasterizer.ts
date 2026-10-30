import { assertTextureSize, gpuTextureLimit } from "../../cache/texture-limits";
import { compileGpuScene } from "../../compositing/compile";
import {
  Color,
  Matrix3,
  Mesh,
  MeshBasicNodeMaterial,
  NoBlending,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  VideoFrameTexture,
  type Node,
  type RenderTarget,
  type WebGPURenderer,
} from "three/webgpu";
import { sRGBTransferOETF, texture, uniform, uv, vec3, vec4 } from "three/tsl";
import type { VideoFrameLease } from "./model";
import { VideoFrameTextureOwner } from "./texture";
import { videoOrientationMatrix } from "./orientation";
import { settleVideoUpload } from "./settle";
import { VIDEO_MAX_STREAMS } from "./budgets";
interface Slot {
  readonly owner: VideoFrameTextureOwner;
  bytes: number;
  pending: Promise<void> | null;
  admitted: boolean;
}
function pendingUploads(slots: readonly Slot[]): Promise<void>[] {
  const pending: Promise<void>[] = [];
  for (const slot of slots) if (slot.pending) pending.push(slot.pending);
  return pending;
}
interface RasterizerOptions {
  reserveBytes?: (bytes: number) => void;
}
const SLOTS_PER_STREAM = 3,
  MAX_STREAMS = VIDEO_MAX_STREAMS,
  SAMPLE_LIMIT = 256;
function sample(values: number[], value: number): void {
  values.push(value);
  if (values.length > SAMPLE_LIMIT) values.shift();
}
function trace(name: string, start: number): void {
  if (typeof performance.measure !== "function") return;
  performance.measure(name, { start, end: performance.now() });
  performance.clearMeasures(name);
}

/** Bounded GPU submissions: each stream owns ≤3 VFTs/leases until REAL queue acknowledgement.
 * render() resolves after successful submission; completion/errors/disposal retain explicit ownership.
 * Decode/GPU-copy/whole-composition commands stay ordered on Three's same renderer queue.
 */
export class VideoRasterizer {
  passes = 0;
  private readonly rings = new Map<string, Slot[]>();
  private readonly maxDimension: number;
  private readonly placeholder = new VideoFrameTexture();
  private readonly matrix = uniform(new Matrix3());
  private readonly textureNode = texture(this.placeholder, this.matrix.mul(vec3(uv(), 1)).xy);
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new PlaneGeometry(2, 2);
  private readonly material = new MeshBasicNodeMaterial({
    depthTest: false,
    depthWrite: false,
    blending: NoBlending,
    toneMapped: false,
  });
  private readonly failures: unknown[] = [];
  private closed = false;
  private disposal: Promise<void> | null = null;
  private textureBytes = 0;
  private pending = 0;
  private peakPending = 0;
  private acknowledgements = 0;
  private submitMs = 0;
  private compiled = false;
  private compilationMs = 0;
  private acknowledgementMs = 0;
  private readonly submissionSamples: number[] = [];
  private readonly acknowledgementSamples: number[] = [];
  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly options: RasterizerOptions = {},
  ) {
    this.maxDimension = gpuTextureLimit(renderer);
    this.material.fragmentNode = vec4(
      sRGBTransferOETF(this.textureNode.rgb) as Node<"vec3">,
      this.textureNode.a,
    );
    this.scene.add(new Mesh(this.geometry, this.material));
  }
  private assertOpen(): void {
    if (this.closed) throw Error("Video source rasterizer is closed.");
    if (this.failures.length)
      throw new AggregateError(this.failures, "Video GPU acknowledgement failed.");
  }
  private async acquire(streamId: string): Promise<Slot> {
    this.assertOpen();
    let ring = this.rings.get(streamId);
    if (!ring) {
      if (this.rings.size >= MAX_STREAMS) throw Error("Video upload stream budget exceeded.");
      ring = [];
      this.rings.set(streamId, ring);
    }
    for (;;) {
      this.assertOpen();
      const idle = ring.find((slot) => slot.pending === null && !slot.admitted);
      if (idle) {
        idle.admitted = true;
        return idle;
      }
      if (ring.length < SLOTS_PER_STREAM) {
        const slot: Slot = {
          owner: new VideoFrameTextureOwner(),
          bytes: 0,
          pending: null,
          admitted: true,
        };
        ring.push(slot);
        return slot;
      }
      await Promise.race(ring.map((slot) => slot.pending ?? Promise.resolve()));
    }
  }
  async render(
    lease: VideoFrameLease,
    target: RenderTarget,
    streamId = "default",
    profile = false,
  ): Promise<void> {
    let owned = false,
      admitted: Slot | null = null;
    try {
      const slot = await this.acquire(streamId);
      admitted = slot;
      this.assertOpen();
      assertTextureSize(lease.frame.displayWidth, lease.frame.displayHeight, this.maxDimension);
      const bytes = lease.frame.displayWidth * lease.frame.displayHeight * 4;
      if (!Number.isSafeInteger(bytes) || bytes <= 0)
        throw Error("Invalid video GPU texture dimensions.");
      const projected = this.textureBytes - slot.bytes + bytes;
      this.options.reserveBytes?.(projected);
      this.textureBytes = projected;
      slot.bytes = bytes;
      let submitted = false,
        submitError: unknown;
      owned = true;
      let finishSubmission!: () => void;
      const submission = new Promise<void>((resolve) => {
        finishSubmission = resolve;
      });
      const operation = slot.owner.withFrame(lease, async (source) => {
        this.textureNode.value = source;
        this.matrix.value.copy(videoOrientationMatrix(lease.rotation, lease.flip));
        const previous = this.renderer.getRenderTarget(),
          auto = this.renderer.autoClear,
          beforeCompile = performance.now();
        let start = beforeCompile;
        try {
          if (!this.compiled) {
            await compileGpuScene(this.renderer, this.scene, this.camera, target);
            this.compilationMs += performance.now() - beforeCompile;
            this.compiled = true;
          }
          start = performance.now();
          this.renderer.autoClear = false;
          this.renderer.setRenderTarget(target);
          this.renderer.render(this.scene, this.camera);
          this.passes++;
          submitted = true;
        } catch (error) {
          submitError = error;
        } finally {
          this.renderer.setRenderTarget(previous);
          this.renderer.autoClear = auto;
        }
        const submit = performance.now() - start;
        this.submitMs += submit;
        if (profile) {
          sample(this.submissionSamples, submit);
          trace(`musart.video.submit:${streamId}`, start);
        }
        finishSubmission();
        const ackStarted = performance.now();
        try {
          await settleVideoUpload(this.renderer);
        } finally {
          const elapsed = performance.now() - ackStarted;
          this.acknowledgementMs += elapsed;
          if (profile) {
            sample(this.acknowledgementSamples, elapsed);
            trace(`musart.video.gpu-ack:${streamId}`, ackStarted);
          }
        }
        if (submitError) throw submitError;
      });
      void operation.then(finishSubmission, finishSubmission);
      this.pending++;
      this.peakPending = Math.max(this.peakPending, this.pending);
      slot.pending = operation
        .then(
          () => {
            this.acknowledgements++;
          },
          (error: unknown) => {
            this.failures.push(error);
          },
        )
        .finally(() => {
          this.pending--;
          slot.pending = null;
          slot.admitted = false;
        });
      // Submission failures remain truthful errors. Success proceeds without waiting for each fence.
      await submission;
      if (!submitted) await operation;
    } catch (error) {
      if (!owned) {
        if (admitted) admitted.admitted = false;
        lease.release();
      }
      throw error;
    }
  }
  /** Called between serialized render jobs; inactive streams release only after their real acks. */
  async retainStreams(ids: ReadonlySet<string>): Promise<void> {
    for (const id of this.rings.keys()) if (!ids.has(id)) await this.retireStream(id);
    this.assertOpen();
  }
  /** A proxy/profile switch retires all old-size owners before allocating the replacement ring. */
  async retireStream(id: string): Promise<void> {
    const ring = this.rings.get(id);
    if (!ring) return;
    await Promise.all(pendingUploads(ring));
    await settleVideoUpload(this.renderer);
    await Promise.all(ring.map((slot) => slot.owner.dispose()));
    this.textureBytes -= ring.reduce((sum, slot) => sum + slot.bytes, 0);
    this.options.reserveBytes?.(this.textureBytes);
    this.rings.delete(id);
    this.assertOpen();
  }
  async settle(): Promise<void> {
    await Promise.all(pendingUploads([...this.rings.values()].flat()));
    if (this.failures.length)
      throw new AggregateError(this.failures, "Video GPU acknowledgement failed.");
  }
  stats() {
    return {
      streams: this.rings.size,
      slots: [...this.rings.values()].reduce((sum, ring) => sum + ring.length, 0),
      pending: this.pending,
      peakPending: this.peakPending,
      textureBytes: this.textureBytes,
      acknowledgements: this.acknowledgements,
      submitMs: this.submitMs,
      compilationMs: this.compilationMs,
      acknowledgementMs: this.acknowledgementMs,
      profile: this.submissionSamples.length
        ? { submit: [...this.submissionSamples], acknowledgement: [...this.acknowledgementSamples] }
        : null,
    };
  }
  clear(target: RenderTarget): void {
    const previous = this.renderer.getRenderTarget(),
      color = this.renderer.getClearColor(new Color()),
      alpha = this.renderer.getClearAlpha();
    try {
      this.renderer.setRenderTarget(target);
      this.renderer.setClearColor(0, 0);
      this.renderer.clear();
    } finally {
      this.renderer.setRenderTarget(previous);
      this.renderer.setClearColor(color, alpha);
    }
    this.passes++;
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.closed = true;
    this.disposal = (async () => {
      try {
        const slots = [...this.rings.values()].flat();
        await Promise.all(pendingUploads(slots));
        const closing = await Promise.allSettled(slots.map((slot) => slot.owner.dispose()));
        for (const result of closing)
          if (result.status === "rejected") this.failures.push(result.reason);
      } finally {
        this.rings.clear();
        const retained = this.textureBytes;
        this.textureBytes = 0;
        if (retained) {
          try {
            this.options.reserveBytes?.(0);
          } catch (error) {
            this.failures.push(error);
          }
        }
        this.placeholder.dispose();
        this.geometry.dispose();
        this.material.dispose();
        this.scene.clear();
      }
      if (this.failures.length)
        throw new AggregateError(this.failures, "Video upload disposal failed.");
    })();
    return this.disposal;
  }
}
