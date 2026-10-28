import { useEffect, useMemo, useState } from "react";
import type { Composition } from "@musart/core";
import type { EditorServices } from "../../state/contracts";

interface Resource {
  page: Composition;
  key: string;
  revision: number;
  edge: number;
  services: Pick<EditorServices, "previewExport">;
  url: string | null;
  failed: boolean;
  width: number;
  height: number;
}
/** Owns only this popover's URL and consumer signal; shared encoded previews remain bounded. */
export function useExportPreview(
  page: Composition,
  selection: readonly string[],
  selectionOnly: boolean,
  revision: number,
  services: Pick<EditorServices, "previewExport">,
  edge: number | null,
) {
  const key = useMemo(
    () => JSON.stringify(selectionOnly ? selection : []),
    [selection, selectionOnly],
  );
  const requestedIds = useMemo(() => JSON.parse(key) as string[], [key]);
  const [resource, setResource] = useState<Resource | null>(null);
  useEffect(() => {
    if (!services.previewExport || edge === null) return;
    const controller = new AbortController();
    let url: string | undefined;
    void Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted();
        return services.previewExport!(
          selectionOnly
            ? { selection: requestedIds, edge, priority: "foreground" }
            : { all: true, edge, priority: "foreground" },
          controller.signal,
        );
      })
      .then(
        (preview) => {
          if (controller.signal.aborted) return;
          try {
            url = URL.createObjectURL(preview.blob);
            setResource({
              page,
              key,
              revision,
              edge,
              services,
              url,
              failed: false,
              width: preview.width,
              height: preview.height,
            });
          } catch {
            setResource({
              page,
              key,
              revision,
              edge,
              services,
              url: null,
              failed: true,
              width: 0,
              height: 0,
            });
          }
        },
        () => {
          if (!controller.signal.aborted)
            setResource({
              page,
              key,
              revision,
              edge,
              services,
              url: null,
              failed: true,
              width: 0,
              height: 0,
            });
        },
      );
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [page, requestedIds, selectionOnly, revision, services, key, edge]);
  if (!services.previewExport)
    return { url: null, loading: false, failed: true, width: 0, height: 0 };
  const current =
    resource?.page === page &&
    resource.key === key &&
    resource.revision === revision &&
    resource.edge === edge &&
    resource.services === services;
  return {
    url: current ? resource.url : null,
    loading: !current,
    failed: current && resource.failed,
    width: current ? resource.width : 0,
    height: current ? resource.height : 0,
  };
}
