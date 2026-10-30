import {
  compareMotionTime,
  getMotionOccurrenceAt,
  listLayerMotionOccurrences,
  isMotionTime,
  subtractMotionTime,
  createLayerGeometryIndex,
  type ApplyMotionTransitionCommand,
  type EnginePort,
  type Project,
  type MotionTime,
} from "@musart/core";

export interface TransitionOrigin {
  readonly project: Project;
  readonly revision: number;
  readonly compositionId: string;
  readonly layerId: string;
  readonly trackId: string;
  readonly span: MotionTime;
}
export function captureTransitionOrigin(
  engine: EnginePort,
  compositionId: string,
  layerId: string,
  trackId?: string,
  time?: MotionTime,
): TransitionOrigin | null {
  const snapshot = engine.getSnapshot();
  const page = snapshot.project.pages.find(({ id }) => id === compositionId);
  const layer = page?.layers.find(({ id }) => id === layerId);
  const tracks = page ? listLayerMotionOccurrences(page, layerId) : [];
  const track =
    trackId !== undefined
      ? tracks.find((track) => track.id === trackId)
      : ((page && time
          ? getMotionOccurrenceAt(page, layerId, time, { terminalPreview: true })
          : undefined) ?? (tracks.length === 1 ? tracks[0] : undefined));
  if (
    snapshot.pageId !== compositionId ||
    page?.motion?.mode !== "motion" ||
    !layer ||
    !track ||
    createLayerGeometryIndex(page).isLocked(layerId)
  )
    return null;
  const span = subtractMotionTime(track.end ?? page.motion.duration, track.start);
  if (span.value <= 0) return null;
  return {
    project: snapshot.project,
    revision: snapshot.revision,
    compositionId,
    layerId,
    trackId: track.id,
    span,
  };
}
export function commitTransition(
  engine: EnginePort,
  origin: TransitionOrigin,
  options: Omit<ApplyMotionTransitionCommand, "type" | "layerId" | "trackId">,
): "applied" | "changed" | "invalid" | "failed" {
  const current = engine.getSnapshot();
  if (
    current.project !== origin.project ||
    current.revision !== origin.revision ||
    current.pageId !== origin.compositionId
  )
    return "changed";
  if (
    !isMotionTime(options.duration) ||
    options.duration.value <= 0 ||
    compareMotionTime(options.duration, origin.span) > 0
  )
    return "invalid";
  try {
    engine.execute({
      type: "applyMotionTransition",
      layerId: origin.layerId,
      ...options,
      trackId: origin.trackId,
    });
    return "applied";
  } catch {
    return "failed";
  }
}
