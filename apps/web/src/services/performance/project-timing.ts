import type { SessionSnapshot } from "@musart/core";
import type { CanonicalOrigin } from "../../state/session/canonical-presentation";

const isDev = import.meta.env.DEV;
let sequence = 0;
export interface ProjectTiming {
  readonly waitingForFrame: boolean;
  identify(name: string): void;
  stage(name: string): void;
  finish(
    status: "ready" | "published" | "cancelled" | "failed" | "superseded",
    error?: unknown,
  ): void;
  waitForFrame(snapshot: SessionSnapshot): void;
}
let pending: { timing: ProjectTiming; origin: CanonicalOrigin; pageId: string } | undefined;

/** Development-only timings. No console calls, clocks or retained frame waits in production. */
export function beginProjectTiming(
  operation: string,
  details: Record<string, unknown> = {},
): ProjectTiming | undefined {
  if (!isDev) return;
  const id = ++sequence,
    started = performance.now();
  const rows: { stage: string; ms: number; elapsedMs: number }[] = [];
  let label = operation,
    stage = "Start",
    checkpoint = started,
    finished = false;
  const round = (value: number) => Math.round(value * 10) / 10;
  function closeStage() {
    const now = performance.now();
    rows.push({ stage, ms: round(now - checkpoint), elapsedMs: round(now - started) });
    checkpoint = now;
  }
  const timing: ProjectTiming = {
    get waitingForFrame() {
      return pending?.timing === timing;
    },
    identify(name) {
      label = `${operation}: ${name}`;
    },
    stage(name) {
      if (finished) return;
      closeStage();
      stage = name;
      console.info(`[Melt perf] #${id} ${label} — ${name}`);
    },
    finish(status, error) {
      if (finished) return;
      closeStage();
      finished = true;
      if (pending?.timing === timing) pending = undefined;
      console.groupCollapsed(
        `[Melt perf] #${id} ${label} — ${round(checkpoint - started)} ms (${status})`,
      );
      console.table(rows);
      console.info({
        ...details,
        totalMs: round(checkpoint - started),
        status,
        ...(error !== undefined
          ? { error: error instanceof Error ? error.message : error }
          : {}),
      });
      console.groupEnd();
    },
    waitForFrame(snapshot) {
      if (finished) return;
      if (pending && pending.timing !== timing) pending.timing.finish("superseded");
      timing.stage("First visible canvas frame");
      pending = {
        timing,
        origin: { projectId: snapshot.project.id, revision: snapshot.revision },
        pageId: snapshot.pageId,
      };
    },
  };
  console.info(`[Melt perf] #${id} ${operation} — started`, details);
  return timing;
}

/** Called after a matching canonical frame is actually submitted and made visible. */
export function reportProjectPresentation(origin: CanonicalOrigin, pageId: string): void {
  if (!isDev || !pending) return;
  if (
    origin.projectId === pending.origin.projectId &&
    origin.revision >= pending.origin.revision &&
    pageId === pending.pageId
  )
    pending.timing.finish("ready");
}

export function reportProjectRenderFailure(
  origin: CanonicalOrigin,
  pageId: string,
  error: unknown,
): void {
  if (!isDev || !pending) return;
  if (origin.projectId === pending.origin.projectId && pageId === pending.pageId)
    pending.timing.finish("failed", error);
}
