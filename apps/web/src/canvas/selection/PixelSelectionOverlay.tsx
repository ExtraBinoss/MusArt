import {
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type RefObject,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { createLayerGeometryIndex } from "@musart/core";
import { Blend, FlipVertical2, X, Eraser } from "lucide-react";
import type { PixelSelectionPort } from "../../services/selection/wand/model";
import type { SceneController } from "../session/scene-controller";
import type { ViewSource } from "../viewport/motion";
import { Button } from "../../components/ui/button";
import { ButtonGroup } from "../../components/ui/button-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { Kbd, KbdGroup } from "../../components/ui/kbd";
import { modifierLabel } from "../../components/search/shortcuts";
import { formatUiError } from "../../state/i18n/errors/format";
import "../../services/selection/wand/messages";
import "./pixel-selection.css";
export function PixelSelectionOverlay({
  port,
  controller,
  viewSource,
  viewport,
}: {
  port?: PixelSelectionPort;
  controller: SceneController;
  viewSource: ViewSource;
  viewport: RefObject<HTMLDivElement | null>;
}) {
  const element = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const svg = element.current;
    if (!svg || !port) return;
    const group = svg.querySelector("g")!,
      paths = svg.querySelectorAll("path");
    function paint() {
      const state = port!.read(),
        frame = controller.read(),
        view = viewSource.read(),
        layer = state ? createLayerGeometryIndex(frame.page).byId.get(state.layerId) : undefined;
      svg!.style.display = state?.path && layer && !frame.playback ? "" : "none";
      if (!state || !layer) return;
      const width = viewport.current?.clientWidth ?? 0,
        height = viewport.current?.clientHeight ?? 0;
      svg!.setAttribute("viewBox", `0 0 ${Math.max(1, width)} ${Math.max(1, height)}`);
      const matrix = createLayerGeometryIndex(frame.page).worldMatrix(layer.id),
        transform = `translate(${width / 2 + view.x - (frame.page.width * view.zoom) / 2} ${height / 2 + view.y - (frame.page.height * view.zoom) / 2}) scale(${view.zoom}) matrix(${matrix.join(",")}) scale(${layer.width / state.width},${layer.height / state.height})`;
      if (group.getAttribute("transform") !== transform) group.setAttribute("transform", transform);
      for (const path of paths) {
        if (path.getAttribute("d") !== state.path) path.setAttribute("d", state.path);
      }
      svg!.dataset.selectionPixels = String(state.selected);
      svg!.dataset.selectionDragging = String(state.dragging);
      svg!.dataset.selectionTolerance = String(state.tolerance);
    }
    paint();
    const resize = new ResizeObserver(paint);
    if (viewport.current) resize.observe(viewport.current);
    const stops = [port.subscribe(paint), controller.subscribe(paint), viewSource.subscribe(paint)];
    return () => {
      for (const stop of stops) stop();
      resize.disconnect();
    };
  }, [port, controller, viewSource, viewport]);
  return (
    <svg
      ref={element}
      className="pixel-selection-outline"
      data-testid="pixel-selection-outline"
      aria-hidden="true"
      style={{ display: "none" }}
    >
      <g>
        <path className="pixel-selection-white" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path className="pixel-selection-ants" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </g>
    </svg>
  );
}
const emptySubscribe = () => () => {},
  emptyRead = () => null;
function SelectionAction({
  label,
  hint,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  hint: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="secondary" size="sm" disabled={disabled} onClick={onClick}>
          {children}
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="floating-panel" side="top">
        <span>{hint}</span>
        {shortcut && (
          <KbdGroup>
            {shortcut.split("+").map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </KbdGroup>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
export function PixelSelectionToolbar({
  port,
  onError,
}: {
  port?: PixelSelectionPort;
  onError?: (message: string) => void;
}) {
  const { t } = useTranslation("pixelSelection"),
    state = useSyncExternalStore(
      port?.subscribe ?? emptySubscribe,
      port?.read ?? emptyRead,
      emptyRead,
    );
  if (!state) return null;
  const busy = state.busy || state.dragging;
  async function run(action: () => Promise<void>) {
    try {
      await action();
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError"))
        onError?.(formatUiError(error));
    }
  }
  return (
    <aside
      className="pixel-selection-toolbar floating-panel"
      data-canvas-control
      aria-label={t("title")}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          port?.deselect();
        }
      }}
    >
      <div className="pixel-selection-status">
        <strong>{t("title")}</strong>
        <span>{busy ? t("working") : t("selected", { count: state.selected })}</span>
      </div>
      <ButtonGroup aria-label={t("title")}>
        <SelectionAction
          label={t("erase")}
          hint={t("eraseHint")}
          shortcut={t("eraseKey")}
          disabled={busy || state.selected === 0}
          onClick={() => {
            void run(() => port!.erase());
          }}
        >
          <Eraser size={14} />
        </SelectionAction>
        <SelectionAction
          label={t("keep")}
          hint={t("keepHint")}
          disabled={busy || state.selected === 0}
          onClick={() => {
            void run(() => port!.createMask());
          }}
        >
          <Blend size={14} />
        </SelectionAction>
      </ButtonGroup>
      <ButtonGroup aria-label={t("title")}>
        <SelectionAction
          label={t("invert")}
          hint={t("invert")}
          disabled={busy}
          onClick={() => {
            void run(() => port!.invert());
          }}
        >
          <FlipVertical2 size={14} />
        </SelectionAction>
        <SelectionAction
          label={t("deselect")}
          hint={t("deselect")}
          shortcut={`${modifierLabel()}+D`}
          onClick={() => port!.deselect()}
        >
          <X size={14} />
        </SelectionAction>
      </ButtonGroup>
      <small>{t("selectionReady")}</small>
    </aside>
  );
}
