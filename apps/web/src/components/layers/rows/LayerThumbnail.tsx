import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Image, Type, Shapes, Folder, Square, Circle } from "lucide-react";
import type { Layer, Asset } from "@musart/core";
import { scheduleLayerThumbnail } from "./thumbnail-idle";
import type { EditorServices, LayerPreviewVariant } from "../../../state/contracts";
const icons = {
  image: Image,
  text: Type,
  vector: Shapes,
  group: Folder,
  rectangle: Square,
  ellipse: Circle,
};
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
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const [value, setValue] = useState<{ key: string; url: string } | null>(null);
  const kind = variant?.kind,
    effectId = variant?.kind === "effect" ? variant.effectId : undefined;
  const requestVariant = useMemo<LayerPreviewVariant | undefined>(
    () =>
      kind === "mask" ? { kind } : kind === "effect" ? { kind, effectId: effectId! } : undefined,
    [kind, effectId],
  );
  const key = JSON.stringify([previewKey, pageId, requestVariant ?? null]);
  const previewExport = services?.previewExport;
  useEffect(() => {
    if (!node.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const active = entries.some((entry) => entry.isIntersecting);
        setVisible(active);
        if (!active) setValue(null);
      },
      { rootMargin: "32px" },
    );
    observer.observe(node.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !previewExport) return;
    const controller = new AbortController();
    let active = true,
      url: string | null = null;
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
        },
        controller.signal,
      ).then(
        (result) => {
          if (!active || controller.signal.aborted) return;
          url = URL.createObjectURL(result.blob);
          setValue({ key, url });
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
      if (url) URL.revokeObjectURL(url);
    };
  }, [visible, previewExport, layer.id, key, pageId, requestVariant]);
  const Icon = icons[layer.kind];
  const source =
    visible && value?.key === key
      ? value.url
      : !services?.previewExport && !requestVariant
        ? asset?.dataUrl
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
      {source ? <img src={source} alt="" draggable={false} /> : <Icon size={14} />}
    </span>
  );
});
