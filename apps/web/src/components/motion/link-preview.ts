import {
  addMotionTime,
  compareMotionTime,
  resolveMotionProperty,
  type Composition,
  type MotionTime,
} from "@musart/core";
import { projectEasingSegments } from "./tree";

interface Surface {
  root: HTMLElement;
  left: number;
  width: number;
  scale: number;
}
interface RowDraft {
  row: HTMLElement;
  controls: Map<HTMLButtonElement, boolean>;
  links: Map<string, HTMLElement>;
}

/** Bounded visible links follow the same retimed draft/frame as the canvas, without React edits. */
export function createTimelineLinkPreview(
  page: Composition,
  keyIds: readonly string[],
  surface: () => Surface | null,
) {
  const selected = new Set(keyIds);
  const properties = (page.motion?.tracks ?? []).flatMap((track, trackIndex) =>
    track.properties.flatMap((property, propertyIndex) =>
      property.keyframes.some((key) => selected.has(key.id)) &&
      resolveMotionProperty(page, property.target)?.interpolation === "continuous"
        ? [{ id: property.id, trackIndex, propertyIndex }]
        : [],
    ),
  );
  const drafts = new Map<string, RowDraft>();
  let disposed = false,
    pending: number | null = null,
    generation = 0;
  let scheduledWindow: Window | null = null,
    latest: MotionTime | null = null;
  function restore(draft: RowDraft) {
    for (const [node, disabled] of draft.controls) {
      node.disabled = disabled;
      delete node.dataset.motionLinkSource;
    }
    for (const link of draft.links.values()) link.remove();
  }
  const controller = {
    render(preview: Composition) {
      if (disposed) return;
      const view = surface();
      if (!view) return;
      const rows = new Map(
        [
          ...view.root.querySelectorAll<HTMLElement>(".motion-row-time[data-motion-property-id]"),
        ].map((node) => [node.dataset.motionPropertyId!, node]),
      );
      for (const [id, draft] of drafts) {
        if (rows.get(id) === draft.row) continue;
        restore(draft);
        drafts.delete(id);
      }
      for (const { id, trackIndex, propertyIndex } of properties) {
        const row = rows.get(id),
          property = preview.motion?.tracks[trackIndex]?.properties[propertyIndex];
        if (!row || !property || property.id !== id) continue;
        let draft = drafts.get(id);
        if (!draft) {
          draft = { row, controls: new Map(), links: new Map() };
          drafts.set(id, draft);
        }
        const controls = row.querySelectorAll<HTMLButtonElement>("button.motion-easing-segment");
        for (const node of draft.controls.keys())
          if (!node.isConnected) draft.controls.delete(node);
        for (const node of controls) {
          if (!draft.controls.has(node)) draft.controls.set(node, node.disabled);
          node.disabled = true;
          node.dataset.motionLinkSource = "";
        }
        const segments = projectEasingSegments(
          property.keyframes,
          view.left,
          view.width,
          view.scale,
        );
        const visible = new Set(segments.map((segment) => segment.destination.id));
        for (const [key, node] of draft.links) {
          if (visible.has(key)) continue;
          node.remove();
          draft.links.delete(key);
        }
        for (const segment of segments) {
          let node = draft.links.get(segment.destination.id);
          if (!node || node.parentElement !== row) {
            node = row.ownerDocument.createElement("span");
            node.className = "motion-easing-segment";
            node.dataset.motionLinkPreview = segment.destination.id;
            node.setAttribute("aria-hidden", "true");
            node.style.pointerEvents = "none";
            row.append(node);
            draft.links.set(segment.destination.id, node);
          }
          const left = `${segment.left + 6}px`,
            width = `${Math.max(1, segment.width - 12)}px`;
          if (node.style.left !== left) node.style.left = left;
          if (node.style.width !== width) node.style.width = width;
        }
      }
    },
    shift(delta: MotionTime) {
      if (disposed) return;
      latest = delta;
      if (pending !== null) return;
      scheduledWindow = surface()?.root.ownerDocument.defaultView ?? null;
      if (!scheduledWindow) return;
      const token = ++generation;
      pending = scheduledWindow.requestAnimationFrame(() => {
        pending = null;
        if (disposed || token !== generation || !latest || !page.motion) return;
        const changed = new Map(
          properties.map(({ id, trackIndex, propertyIndex }) => {
            const property = page.motion!.tracks[trackIndex]!.properties[propertyIndex]!;
            return [
              id,
              {
                ...property,
                keyframes: property.keyframes
                  .map((key) =>
                    selected.has(key.id) ? { ...key, time: addMotionTime(key.time, latest!) } : key,
                  )
                  .sort((a, b) => compareMotionTime(a.time, b.time)),
              },
            ] as const;
          }),
        );
        controller.render({
          ...page,
          motion: {
            ...page.motion,
            tracks: page.motion.tracks.map((track) => ({
              ...track,
              properties: track.properties.map((property) => changed.get(property.id) ?? property),
            })),
          },
        });
      });
    },
    clear() {
      disposed = true;
      generation++;
      if (pending !== null) scheduledWindow?.cancelAnimationFrame(pending);
      pending = null;
      latest = null;
      for (const draft of drafts.values()) restore(draft);
      drafts.clear();
    },
  };
  return controller;
}
