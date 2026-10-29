import { memo, useMemo, type PointerEvent, type RefObject } from "react";
import { createLayerGeometryIndex, type EnginePort } from "@musart/core";
import { useEngineValue } from "../../state/session/editor";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
import { GuideOverlay } from "../guides/GuideOverlay";
import { SelectionOverlays } from "./SelectionOverlays";

/** Only selection decorations subscribe to selected IDs; the retained canvas stays untouched. */
export const CanvasSelection = memo(function CanvasSelection({
  engine,
  controller,
  viewSource,
  viewport,
  showHandles,
  onHandle,
}: {
  engine: EnginePort;
  controller: SceneController;
  viewSource: ViewSource;
  viewport: RefObject<HTMLDivElement | null>;
  showHandles: boolean;
  onHandle: (event: PointerEvent<HTMLButtonElement>) => void;
}) {
  const page = useEngineValue(
    engine,
    (snapshot) =>
      snapshot.project.pages.find((item) => item.id === snapshot.pageId) ??
      snapshot.project.pages[0]!,
  );
  const selection = useEngineValue(engine, (snapshot) => snapshot.selection);
  const view = viewSource.read();
  const selected = useMemo(() => {
    const ids = new Set(selection),
      index = createLayerGeometryIndex(page);
    return page.layers.filter((layer) => ids.has(layer.id) && index.isVisible(layer.id));
  }, [page, selection]);
  return (
    <>
      <GuideOverlay
        controller={controller}
        engine={engine}
        page={page}
        selected={selection}
        view={view}
        viewSource={viewSource}
        viewport={viewport}
      />
      {showHandles && (
        <SelectionOverlays
          page={page}
          selected={selected}
          zoom={view.zoom}
          controller={controller}
          viewSource={viewSource}
          onHandle={onHandle}
        />
      )}
    </>
  );
});
