import {
  listLayerMotionOccurrences,
  createLayerGeometryIndex,
  planMotionInitialization,
  type EnginePort,
} from "@musart/core";
import { createMotionTransport } from "../../../services/motion/transport";
import {
  getMotionConfirmation,
  MotionConfirmationError,
} from "../../../state/session/motion-confirmation";
import { captureTransitionOrigin, type TransitionOrigin } from "./authoring";
export interface TransitionRequest {
  id: number;
  token: object;
  origin: TransitionOrigin;
  choices?: readonly TransitionOrigin[];
  point: { x: number; y: number };
}
export interface TransitionRequests {
  read: () => TransitionRequest | null;
  clear: (token?: object) => void;
  select: (token: object, trackId: string) => boolean;
  remember: (point: { x: number; y: number }) => void;
  subscribe: (listener: () => void) => () => void;
  open: (
    compositionId: string,
    layerId: string,
    point?: { x: number; y: number },
    trackId?: string,
  ) => Promise<boolean>;
}
const ports = new WeakMap<EnginePort, TransitionRequests>();
function createPort(engine: EnginePort): TransitionRequests {
  let request: TransitionRequest | null = null,
    point = { x: 24, y: 64 };
  let sequence = 0,
    stop: (() => void) | null = null;
  let pendingPublish: { cancel(): void } | null = null;
  function afterMenuClose() {
    pendingPublish?.cancel();
    return new Promise<void>((resolve) => {
      const finish = () => {
        pendingPublish = null;
        resolve();
      };
      const timer = setTimeout(finish, 0);
      pendingPublish = {
        cancel() {
          clearTimeout(timer);
          finish();
        },
      };
    });
  }
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  const clear = (token?: object) => {
    if (!request || (token && request.token !== token)) return;
    request = null;
    emit();
  };
  const remember = (value: { x: number; y: number }) => {
    if (Number.isFinite(value.x) && Number.isFinite(value.y)) point = value;
  };
  return {
    read: () => request,
    clear,
    remember,
    select(token, trackId) {
      const snapshot = engine.getSnapshot();
      if (
        !request ||
        request.token !== token ||
        snapshot.project !== request.origin.project ||
        snapshot.revision !== request.origin.revision ||
        snapshot.pageId !== request.origin.compositionId
      )
        return false;
      const origin = request.choices?.find((item) => item.trackId === trackId);
      if (!origin) return false;
      request = { id: request.id, token: request.token, point: request.point, origin };
      emit();
      return true;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      stop ??= engine.subscribe(() => {
        const snapshot = engine.getSnapshot();
        if (
          request &&
          (snapshot.project !== request.origin.project ||
            snapshot.revision !== request.origin.revision ||
            snapshot.pageId !== request.origin.compositionId)
        )
          clear();
      });
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          stop?.();
          stop = null;
          request = null;
          sequence++;
          pendingPublish?.cancel();
        }
      };
    },
    async open(
      compositionId: string,
      layerId: string,
      anchor?: { x: number; y: number },
      trackId?: string,
    ): Promise<boolean> {
      const before = engine.getSnapshot(),
        page = before.project.pages.find((item) => item.id === compositionId);
      if (
        before.pageId !== compositionId ||
        !page ||
        !page.layers.some((item) => item.id === layerId) ||
        createLayerGeometryIndex(page).isLocked(layerId)
      )
        return false;
      const owner = ++sequence;
      if (page.motion?.mode !== "motion") {
        if (!page.motion) {
          const plan = planMotionInitialization(before);
          try {
            if (!(await getMotionConfirmation(engine).request(plan, { reason: "transition" })))
              return false;
          } catch (error) {
            if (error instanceof MotionConfirmationError && error.code === "stale") return false;
            throw error;
          }
          const current = engine.getSnapshot();
          if (
            owner !== sequence ||
            current.project !== before.project ||
            current.revision !== before.revision ||
            current.pageId !== compositionId
          )
            return false;
          engine.execute({
            type: "setCompositionMode",
            mode: "motion",
            plan,
            confirmed: plan.requiresConfirmation,
          });
        } else engine.execute({ type: "setCompositionMode", mode: "motion" });
      }
      if (owner !== sequence) return false;
      createMotionTransport(engine).pause();
      const clock = createMotionTransport(engine).read();
      const captured = captureTransitionOrigin(engine, compositionId, layerId, trackId, clock.time);
      const currentPage = engine
        .getSnapshot()
        .project.pages.find((page) => page.id === compositionId)!;
      const choices =
        !captured && trackId === undefined
          ? listLayerMotionOccurrences(currentPage, layerId).flatMap((track) => {
              const item = captureTransitionOrigin(engine, compositionId, layerId, track.id);
              return item ? [item] : [];
            })
          : [];
      const origin = captured ?? choices[0];
      if (!origin) return false;
      // External-store publication is synchronous. Let the originating modal menu
      // release its focus trap before mounting the new popover's focus scope.
      await afterMenuClose();
      const settled = engine.getSnapshot();
      if (
        owner !== sequence ||
        settled.project !== origin.project ||
        settled.revision !== origin.revision ||
        settled.pageId !== compositionId
      )
        return false;
      if (anchor) remember(anchor);
      request = { id: owner, token: {}, origin, ...(choices.length > 1 ? { choices } : {}), point };
      emit();
      return true;
    },
  };
}
export function getTransitionRequests(engine: EnginePort) {
  let port = ports.get(engine);
  if (!port) {
    port = createPort(engine);
    ports.set(engine, port);
  }
  return port;
}
/** A direct user action may initialize Motion through its real confirmation broker. */
export function requestLayerTransition(
  engine: EnginePort,
  compositionId: string,
  layerId: string,
  point?: { x: number; y: number },
  trackId?: string,
): Promise<boolean> {
  return getTransitionRequests(engine).open(compositionId, layerId, point, trackId);
}
