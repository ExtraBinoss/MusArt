import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { EditorServices, ProjectThumbnailLease } from "../../state/contracts";

interface OwnedLease {
  lease: ProjectThumbnailLease;
  retained: () => boolean;
  release: () => void;
}
interface Resource {
  projectId: string;
  services: ArtboardServices;
  items: ProjectThumbnailLease["items"];
  owners: Map<string, OwnedLease>;
  retired: OwnedLease[];
}

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
  const held = useRef(new Set<OwnedLease>());
  const [resource, setResource] = useState<Resource | null>(null);
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
  useEffect(() => {
    const leases = held.current;
    return () => {
      for (const owner of leases) owner.release();
      leases.clear();
    };
  }, [projectId, services]);
  useEffect(() => {
    const ids = JSON.parse(visibleKey) as string[];
    if (!services || !ids.length) return;
    let active = true;
    void services.loadProjectThumbnails(projectId, ids).then(
      (lease) => {
        if (active) {
          let retained = true;
          const owner: OwnedLease = {
            lease,
            retained: () => retained,
            release: () => {
              if (retained) {
                retained = false;
                lease.release();
              }
            },
          };
          held.current.add(owner);
          setFailure(null);
          setResource((previous) => {
            const fresh = new Set(lease.items.map((item) => item.pageId)),
              matching = previous?.projectId === projectId && previous.services === services,
              keep = matching
                ? previous.items.filter(
                    (item) =>
                      ids.includes(item.pageId) &&
                      !fresh.has(item.pageId) &&
                      previous.owners.get(item.pageId)?.retained(),
                  )
                : [];
            const owners = new Map([
                ...keep.map((item) => [item.pageId, previous!.owners.get(item.pageId)!] as const),
                ...lease.items.map((item) => [item.pageId, owner] as const),
              ]),
              used = new Set(owners.values());
            return {
              projectId,
              services,
              items: keep.length ? [...lease.items, ...keep] : lease.items,
              owners,
              retired: [
                ...new Set([
                  ...(previous?.retired ?? []),
                  ...(previous?.owners.values() ?? []),
                  owner,
                ]),
              ].filter((entry) => entry.retained() && !used.has(entry)),
            };
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
    const ids = new Set(JSON.parse(visibleKey) as string[]),
      used = new Set<OwnedLease>();
    if (resource?.projectId === projectId && resource.services === services)
      for (const item of resource.items) {
        const owner = resource.owners.get(item.pageId);
        if (ids.has(item.pageId) && owner) used.add(owner);
      }
    // Examine only owners captured by this committed resource. A newer async
    // acquisition may already be waiting for its own state update to commit.
    const owners = resource ? [...resource.owners.values(), ...resource.retired] : [];
    for (const owner of owners)
      if (!used.has(owner)) {
        owner.release();
        held.current.delete(owner);
      }
  }, [resource, visibleKey, projectId, services]);
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
    if (resource?.projectId !== projectId || resource.services !== services) return [];
    const ids = new Set(JSON.parse(visibleKey) as string[]),
      rows = resource.items,
      available = (item: (typeof rows)[number]) =>
        ids.has(item.pageId) && resource.owners.get(item.pageId)?.retained();
    return rows.every(available) ? rows : rows.filter(available);
  }, [resource, projectId, services, visibleKey]);
  return {
    items,
    failed: !services || failure === requestKey,
    retry: () => setRevision((value) => value + 1),
  };
}
