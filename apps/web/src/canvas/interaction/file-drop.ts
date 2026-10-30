import type { DragEvent } from "react";

interface FileDropOptions {
  readonly onActive: (active: boolean) => void;
  readonly onFiles: (event: DragEvent<HTMLDivElement>, files: File[]) => void;
}
/** Internal layer drags must never claim a canvas import target or update its React state. */
export function createCanvasFileDropHandlers({ onActive, onFiles }: FileDropOptions) {
  const accepts = (event: DragEvent<HTMLDivElement>) =>
    Boolean(
      event.dataTransfer &&
      (Array.from(event.dataTransfer.types ?? []).includes("Files") ||
        event.dataTransfer.files?.length),
    );
  return {
    onDragOver(event: DragEvent<HTMLDivElement>) {
      if (!accepts(event)) return;
      event.preventDefault();
      onActive(true);
    },
    onDragLeave(event: DragEvent<HTMLDivElement>) {
      if (accepts(event) && !event.currentTarget.contains(event.relatedTarget as Node | null))
        onActive(false);
    },
    onDrop(event: DragEvent<HTMLDivElement>) {
      if (!accepts(event)) return;
      event.preventDefault();
      onActive(false);
      const files = Array.from(event.dataTransfer.files);
      if (files.length) onFiles(event, files);
    },
  };
}
