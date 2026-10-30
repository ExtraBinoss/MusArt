import { useCallback } from "react";
import type { MotionTemplateId } from "../../../../services/projects/templates/motion/model";
import { MotionPreviewSurface } from "./MotionPreviewSurface";
import { startMotionTemplatePreview, type PreviewStatus } from "./runtime";

export function MotionTemplatePreview({
  templateId,
  poster,
  disabled = false,
  className,
}: {
  templateId: MotionTemplateId;
  poster: string;
  disabled?: boolean;
  className?: string;
}) {
  const start = useCallback(
    (host: HTMLElement, onStatus: (status: PreviewStatus, error?: unknown) => void) =>
      startMotionTemplatePreview({ templateId, host, onStatus }),
    [templateId],
  );
  return (
    <MotionPreviewSurface
      startPreview={start}
      poster={poster}
      disabled={disabled}
      className={className}
    />
  );
}
