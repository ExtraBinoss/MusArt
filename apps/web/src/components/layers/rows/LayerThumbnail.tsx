import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Image, Type, Shapes, Folder, Square, Circle, Clapperboard } from "lucide-react";
import { isImageAsset, type Layer, type Asset } from "@musart/core";
import { scheduleLayerThumbnail } from "./thumbnail-idle";
import { observeLayerThumbnail } from "./thumbnail-visibility";
import type { EditorServices, LayerPreviewVariant } from "../../../state/contracts";
const icons = {
  image: Image,
  video: Clapperboard,
  text: Type,
  vector: Shapes,
  group: Folder,
  rectangle: Square,
  ellipse: Circle,
};
const revealed = new WeakSet<Blob>();
interface PreviewValue {
  key: string;
  url: string;
  blob: Blob;
  exporter: EditorServices["previewExport"];
}
/** One visible row owns one abortable request and explicitly releases its browser URL. */
export const LayerThumbnail = memo(function LayerThumbnail({
  layer,
  asset,
  services,
  previewKey,
  pageId,
  variant,
}: {
  layer: Layer;
  asset?: Asset;
  services?: Pick<EditorServices, "previewExport">;
  previewKey: string;
  pageId?: string;
  variant?: LayerPreviewVariant;
}) {
  const node = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState<PreviewValue | null>(null);
  const owned = useRef<PreviewValue | null>(null);
  const kind = variant?.kind,
    effectId = variant?.kind === "effect" ? variant.effectId : undefined;
  const requestVariant = useMemo<LayerPreviewVariant | undefined>(
    () =>
      kind === "mask" ? { kind } : kind === "effect" ? { kind, effectId: effectId! } : undefined,
    [kind, effectId],
  );
  const key = JSON.stringify([previewKey, pageId, layer.id, requestVariant ?? null]);
  const observerKey = JSON.stringify([pageId, layer.id, requestVariant ?? null]);
  const [visibility, setVisibility] = useState<{ key: string; visible: boolean } | null>(null);
  const visible =
    typeof IntersectionObserver === "undefined" ||
    (visibility?.key === observerKey && visibility.visible);
  const previewExport = services?.previewExport;
  useEffect(() => {
    if (!node.current || typeof IntersectionObserver === "undefined") return;
    return observeLayerThumbnail(node.current, (active) =>
      setVisibility({ key: observerKey, visible: active }),
    );
  }, [observerKey]);
  // The virtual window already bounds ownership. Keep a decoded image while its
  // row crosses the observer margin, rather than revoking and decoding it again.
  useEffect(() => {
    return () => {
      if (owned.current) URL.revokeObjectURL(owned.current.url);
      owned.current = null;
    };
  }, [key, previewExport]);
  useEffect(() => {
    if (!visible || !previewExport) return;
    if (owned.current?.key === key && owned.current.exporter === previewExport) return;
    const controller = new AbortController();
    let active = true;
    const cancelIdle = scheduleLayerThumbnail(() => {
      if (!active || controller.signal.aborted) return;
      if (node.current)
        node.current.dataset.previewRequests = String(
          Number(node.current.dataset.previewRequests ?? 0) + 1,
        );
      return previewExport(
        {
          selection: [layer.id],
          ...(pageId ? { pageId } : {}),
          ...(requestVariant ? { variant: requestVariant } : {}),
          edge: 96,
          priority: "visible",
        },
        controller.signal,
      ).then(
        (result) => {
          if (!active || controller.signal.aborted) return;
          const next = {
            key,
            url: URL.createObjectURL(result.blob),
            blob: result.blob,
            exporter: previewExport,
          };
          owned.current = next;
          setValue(next);
        },
        () => {
          /* A failed/stale preview retains its truthful layer-kind placeholder. */
        },
      );
    });
    return () => {
      active = false;
      cancelIdle();
      controller.abort();
    };
  }, [visible, previewExport, layer.id, key, pageId, requestVariant]);
  const Icon = icons[layer.kind];
  const source =
    value?.key === key && value.exporter === previewExport
      ? value.url
      : !services?.previewExport && !requestVariant
        ? asset && isImageAsset(asset)
          ? asset.dataUrl
          : undefined
        : undefined;
  return (
    <span
      ref={node}
      className="layer-thumbnail"
      data-thumbnail-layer-id={layer.id}
      data-thumbnail-variant={requestVariant?.kind ?? "layer"}
      data-thumbnail-effect-id={effectId}
      data-preview-ready={Boolean(source)}
    >
      <Icon size={14} aria-hidden="true" style={source ? { display: "none" } : undefined} />
      {source && (
        <img
          key={source}
          src={source}
          alt=""
          draggable={false}
          onLoad={(event) => {
            const image = event.currentTarget;
            if (
              !image.isConnected ||
              node.current?.querySelector("img") !== image ||
              image.getAttribute("src") !== source
            )
              return;
            if (value?.key === key && !revealed.has(value.blob)) {
              revealed.add(value.blob);
              image.dataset.thumbnailReveal = "true";
            }
          }}
        />
      )}
    </span>
  );
});
