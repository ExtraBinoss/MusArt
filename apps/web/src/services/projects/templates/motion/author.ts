import {
  createLayer,
  createPage,
  createProject,
  EditorEngine,
  planMotionInitialization,
  type Command,
  type Layer,
  type LayerMotionProperty,
  type MotionEasing,
  type MotionPropertyTarget,
  type MotionValue,
} from "@musart/core";
import type { BuiltMotionTemplate, MotionTemplateId, MotionTemplateMedia } from "./model";

const CREATED_AT = "2026-10-29T00:00:00.000Z";
export const seconds = (value: number) => ({ value: Math.round(value * 1000), rate: 1000 });

/** A DOM/GPU/storage-free authoring adapter; every document edit uses the public command port. */
export class TemplateAuthor {
  readonly initial;
  readonly engine;
  private readonly batches: Command[][] = [];

  constructor(id: MotionTemplateId, name: string, width: number, height: number) {
    this.initial = createProject({
      id: `template-${id}`,
      name,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      pages: [createPage({ id: `${id}-composition`, name, width, height, background: "#142621" })],
    });
    this.engine = new EditorEngine(this.initial, { now: () => CREATED_AT });
  }

  layer(kind: Layer["kind"], id: string, name: string, patch: Partial<Layer> = {}): Layer {
    return createLayer(kind, { id, name, x: 0, y: 0, fill: "#f1f2df", ...patch });
  }

  commit(commands: Command[]): void {
    if (!commands.length) return;
    this.engine.transaction(commands);
    this.batches.push(structuredClone(commands));
  }

  add(layers: Layer[], media?: MotionTemplateMedia): void {
    this.commit([
      { type: "addLayers", layers, ...(media ? { assets: [...media.photos, media.video] } : {}) },
    ]);
  }

  initialize(): void {
    const plan = planMotionInitialization(this.engine.getSnapshot(), seconds(5));
    this.commit([{ type: "setCompositionMode", mode: "motion", plan, confirmed: true }]);
  }

  group(ids: string[], name: string, patch: Partial<Layer> = {}): string {
    this.commit([{ type: "groupLayers", ids }]);
    const id = this.engine.getSnapshot().selection[0]!;
    this.commit([{ type: "updateLayers", ids: [id], patch: { name, ...patch } }]);
    return id;
  }

  track(layerId: string): string {
    const track = this.engine
      .getSnapshot()
      .project.pages[0]!.motion!.tracks.find((item) => item.layerId === layerId);
    if (!track) throw Error(`Missing template track: ${layerId}`);
    return track.id;
  }

  keys(
    target: MotionPropertyTarget,
    values: readonly (readonly [number, MotionValue, MotionEasing?])[],
  ): Command[] {
    return values.map(([time, value, easing]) => ({
      type: "upsertMotionKeyframe",
      target,
      time: seconds(time),
      value,
      ...(easing ? { easing } : {}),
    }));
  }

  layerKeys(
    layerId: string,
    property: LayerMotionProperty,
    values: readonly (readonly [number, MotionValue, MotionEasing?])[],
  ): Command[] {
    return this.keys({ kind: "layer", layerId, property }, values);
  }

  finish(): BuiltMotionTemplate {
    return {
      initial: this.initial,
      project: this.engine.getSnapshot().project,
      batches: this.batches,
    };
  }
}
