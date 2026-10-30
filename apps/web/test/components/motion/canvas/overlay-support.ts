import { createProject, EditorEngine } from "@musart/core";
import { vi } from "vitest";
import type { TimelineTransport } from "../../../../src/components/motion/model";
import type { TimelineCanvasHost } from "../../../../src/components/motion/canvas/host";
import type { CanvasTimelineOverlayProps } from "../../../../src/components/motion/canvas/overlay-model";
import type {
  TimelineCanvasHit,
  TimelineCanvasModel,
} from "../../../../src/components/motion/canvas/model";
import { canvasFixture } from "./support";

export function overlayFixture() {
  const data = canvasFixture();
  const engine = new EditorEngine(
    createProject({
      pages: [data.page],
      assets: {
        photo: {
          id: "photo",
          name: "Photo",
          mime: "image/png",
          width: 1,
          height: 1,
          dataUrl: "data:image/png;base64,iVBORw0KGgo=",
        },
      },
    }),
  );
  const viewport = document.createElement("div"),
    root = document.createElement("div");
  viewport.className = "motion-timeline-scroll";
  root.className = "motion-canvas-root";
  viewport.append(root);
  document.body.append(viewport);
  let model: TimelineCanvasModel = data.model;
  let pointed: TimelineCanvasHit | null = {
    kind: "clip",
    rowKey: "hero",
    rowIndex: 0,
    layerId: "hero",
    trackId: "first",
    bounds: { x: 0, y: 3, width: 100, height: 18 },
  };
  const host: TimelineCanvasHost = {
    root: { current: root },
    viewport: { current: viewport },
    readModel: () => model,
    readHit: vi.fn(() => pointed),
    readSurface: () => null,
    invalidate: vi.fn(),
    setAudioDraft: vi.fn(),
    setHoverHit: vi.fn(),
    selectAudio: vi.fn(),
    readSelectedAudio: () => null,
    subscribeAudioSelection: () => () => {},
  };
  const transport: TimelineTransport = {
    read: () => ({
      compositionId: data.page.id,
      mode: "motion",
      time: { value: 0, rate: 1 },
      duration: { value: 4, rate: 1 },
      frameRate: { numerator: 30, denominator: 1 },
      playing: false,
      playbackMode: "once",
    }),
    subscribe: () => () => {},
    pause: vi.fn(),
    play: vi.fn(),
    seek: vi.fn(),
    setPlaybackMode: vi.fn(),
  };
  const audioGestures = {
    begin: vi.fn(),
    cancel: vi.fn(),
    readPreview: vi.fn(() => null),
    subscribePreview: vi.fn(() => () => {}),
  };
  const props: CanvasTimelineOverlayProps = {
    host,
    engine,
    compositionId: data.page.id,
    transport,
    unit: "ms",
    interactive: true,
    onSelect: vi.fn(),
    onAudioError: vi.fn(),
  };
  return {
    ...data,
    engine,
    viewport,
    root,
    host,
    transport,
    props,
    audioGestures,
    hit: () => pointed!,
    point(hit: TimelineCanvasHit | null) {
      pointed = hit;
    },
    model(next: TimelineCanvasModel) {
      model = next;
    },
  };
}
