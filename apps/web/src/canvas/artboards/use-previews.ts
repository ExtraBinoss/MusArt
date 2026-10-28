import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { EditorServices, ProjectThumbnailLease } from "../../state/contracts";

export type ArtboardServices = Pick<
  EditorServices,
  "loadProjectThumbnails" | "subscribeProjectThumbnails"
>;

/** One visible-page batch and one subscription, regardless of the project size. */
export function useArtboardPreviews(
  root: RefObject<HTMLDivElement | null>,
  projectId: string,
  pageIds: readonly string[],
  services?: ArtboardServices,
) {
  const pageKey = JSON.stringify(pageIds);
  const [visible, setVisible] = useState<string[]>([]),
    [revision, setRevision] = useState(0);
  const visibility = useRef<{ projectId: string; ids: Set<string> }>({ projectId, ids: new Set() });
  const [failure, setFailure] = useState<string | null>(null);
  const [resource, setResource] = useState<{
    projectId: string;
    services: ArtboardServices;
    lease: ProjectThumbnailLease;
    retained: () => boolean;
    release: () => void;
  } | null>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const ids = JSON.parse(pageKey) as string[];
    if (typeof IntersectionObserver === "undefined") return;
    // Artboard activation changes neither these stable backdrops nor their requested IDs.
    // Keep still-visible boards when adding/removing a page rebuilds the observer.
    const seen = new Set(
      visibility.current.projectId === projectId
        ? [...visibility.current.ids].filter((id) => ids.includes(id))
        : [],
    );
    visibility.current = { projectId, ids: seen };
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!active) return;
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.artboardId!;
          if (entry.isIntersecting) seen.add(id);
          else seen.delete(id);
        }
        const next = ids.filter((id) => seen.has(id));
        setVisible((previous) =>
          JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
        );
      },
      { root: element, rootMargin: "200px" },
    );
    for (const node of element.querySelectorAll<HTMLElement>(".canvas-artboard-backdrop"))
      observer.observe(node);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [root, pageKey, projectId]);
  const visibleKey = JSON.stringify(
    (typeof IntersectionObserver === "undefined" ? pageIds : visible).filter((id) =>
      pageIds.includes(id),
    ),
  );
  const requestKey = JSON.stringify([projectId, visibleKey, !!services]);
  // A new visibility batch must not revoke the artwork still shown by the previous batch.
  useEffect(() => () => resource?.release(), [resource, projectId, services]);
  useEffect(() => {
    const ids = JSON.parse(visibleKey) as string[];
    if (!services || !ids.length) return;
    let active = true;
    void services.loadProjectThumbnails(projectId, ids).then(
      (lease) => {
        if (active) {
          let retained = true;
          setFailure(null);
          setResource({
            projectId,
            services,
            lease,
            retained: () => retained,
            release: () => {
              if (retained) {
                retained = false;
                lease.release();
              }
            },
          });
        } else lease.release();
      },
      () => {
        if (active) setFailure(requestKey);
      },
    );
    return () => {
      active = false;
    };
  }, [services, projectId, visibleKey, revision, requestKey]);
  useEffect(() => {
    const ids = new Set(JSON.parse(visibleKey) as string[]);
    if (!resource?.lease.items.some((item) => ids.has(item.pageId))) resource?.release();
  }, [resource, visibleKey]);
  useEffect(() => {
    if (!services) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const stop = services.subscribeProjectThumbnails((id) => {
      if (id !== projectId || timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        setRevision((value) => value + 1);
      }, 50);
    });
    return () => {
      stop();
      if (timer !== null) clearTimeout(timer);
    };
  }, [services, projectId]);
  const items = useMemo(() => {
    if (resource?.projectId !== projectId || resource.services !== services || !resource.retained())
      return [];
    const ids = new Set(JSON.parse(visibleKey) as string[]),
      rows = resource.lease.items;
    return rows.every((item) => ids.has(item.pageId))
      ? rows
      : rows.filter((item) => ids.has(item.pageId));
  }, [resource, projectId, services, visibleKey]);
  return {
    items,
    failed: !services || failure === requestKey,
    retry: () => setRevision((value) => value + 1),
  };
}
