import { CanvasPreparation } from "../../canvas/render/CanvasPreparation";
import { lazy, memo, Suspense, useMemo, useRef } from "react";
import { useAtomValue, useStore } from "jotai";
import type { EnginePort } from "@musart/core";
import type { FontResolver } from "@musart/render";
import type { ArtboardServices } from "../../canvas/artboards/use-previews";
import { toolAtom } from "../../state/session/editor";

import { createPreviewSource } from "../../state/session/preview-source";
import { useRenderMetrics } from "../../state/session/render-metrics";

const EditorCanvas = lazy(() =>
  import("../../canvas/EditorCanvas").then((module) => ({ default: module.EditorCanvas })),
);
export const CanvasArea = memo(function CanvasArea({
  engine,
  onError,
  onDropFiles,
  onImagePoint,
  fontResolver,
  services,
}: {
  engine: EnginePort;
  fontResolver?: FontResolver;
  services?: ArtboardServices &
    Pick<import("../../state/contracts").EditorServices, "pixelSelection" | "mediaResolverFor">;
  onError(this: void, message: string, details?: string): void;
  onDropFiles(this: void, files: File[]): void;
  onImagePoint(this: void, layerId: string, x: number, y: number): void;
}) {
  const tool = useAtomValue(toolAtom);
  const store = useStore();
  const previewSource = useMemo(() => createPreviewSource(store), [store]);
  const element = useRef<HTMLDivElement>(null);
  useRenderMetrics(element);
  return (
    <div className="canvas-area" ref={element}>
      <Suspense fallback={<CanvasPreparation />}>
        {" "}
        <EditorCanvas
          engine={engine}
          tool={tool}
          previewSource={previewSource}
          onError={onError}
          onDropFiles={onDropFiles}
          onImagePoint={onImagePoint}
          fontResolver={fontResolver}
          services={services}
        />
      </Suspense>
    </div>
  );
});
