import { useEffect, useState, type RefObject } from "react";
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
  const [resource, setResource] = useState<{
    key: string;
    lease: ProjectThumbnailLease | null;
    failed: boolean;
    release: () => void;
  } | null>(null);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const ids = JSON.parse(pageKey) as string[];
    if (typeof IntersectionObserver === "undefined") return;
    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
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
    for (const node of element.querySelectorAll<HTMLElement>(".canvas-artboard-inactive"))
      observer.observe(node);
    return () => observer.disconnect();
  }, [root, pageKey]);
  const visibleKey = JSON.stringify(
    (typeof IntersectionObserver === "undefined" ? pageIds : visible).filter((id) =>
      pageIds.includes(id),
    ),
  );
  const requestKey = JSON.stringify([projectId, visibleKey, !!services]);
  useEffect(() => () => resource?.release(), [resource, requestKey]);
  useEffect(() => {
    const ids = JSON.parse(visibleKey) as string[];
    if (!services || !ids.length) return;
    let active = true;
    void services.loadProjectThumbnails(projectId, ids).then(
      (lease) => {
        if (active) {
          let retained = true;
          setResource({
            key: requestKey,
            lease,
            failed: false,
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
        if (active) setResource({ key: requestKey, lease: null, failed: true, release: () => {} });
      },
    );
    return () => {
      active = false;
    };
  }, [services, projectId, visibleKey, revision, requestKey]);
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
  return {
    items: resource?.key === requestKey ? (resource.lease?.items ?? []) : [],
    failed: !services || (resource?.key === requestKey && resource.failed),
    retry: () => setRevision((value) => value + 1),
  };
}
