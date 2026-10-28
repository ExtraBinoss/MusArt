import { lazy, memo, Suspense, useMemo, useRef } from "react";
import { useAtomValue, useStore } from "jotai";
import { LoaderCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  services?: ArtboardServices;
  onError(this: void, message: string): void;
  onDropFiles(this: void, files: File[]): void;
  onImagePoint(this: void, layerId: string, x: number, y: number): void;
}) {
  const { t } = useTranslation();
  const tool = useAtomValue(toolAtom);
  const store = useStore();
  const previewSource = useMemo(() => createPreviewSource(store), [store]);
  const element = useRef<HTMLDivElement>(null);
  useRenderMetrics(element);
  return (
    <div className="canvas-area" ref={element}>
      <Suspense
        fallback={
          <div className="canvas-loading">
            <LoaderCircle size={20} className="animate-spin" />
            <span>{t("loadingCanvas")}</span>
          </div>
        }
      >
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
