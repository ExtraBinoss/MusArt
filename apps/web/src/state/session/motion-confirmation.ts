import {
  compareMotionTime,
  normalizeMotionFrameRate,
  validateMotionTime,
  type EnginePort,
  type MotionInitializationPlan,
} from "@musart/core";
import { i18n } from "../i18n";
import { registerFeatureTranslations } from "../i18n/feature-resources";

const errors = {
  en: {
    invalid: "The Motion conversion request is invalid.",
    busy: "Another Motion conversion is awaiting your decision.",
    stale: "The composition changed during video import. Please try again.",
    unavailable: "Motion conversion needs the editor confirmation dialog.",
  },
  fr: {
    invalid: "La demande de conversion Motion est invalide.",
    busy: "Une autre conversion Motion attend votre réponse.",
    stale: "La composition a changé pendant l’import vidéo. Réessayez.",
    unavailable: "La conversion Motion nécessite la boîte de confirmation de l’éditeur.",
  },
};
registerFeatureTranslations("motionConfirmation", errors);

export class MotionConfirmationError extends Error {
  constructor(readonly code: keyof typeof errors.en) {
    super(i18n.t(`motionConfirmation:${code}`));
    this.name = "MotionConfirmationError";
  }
}

export interface MotionConfirmation {
  request(this: void, plan: MotionInitializationPlan): Promise<boolean>;
  read(this: void): MotionInitializationPlan | null;
  subscribe(this: void, listener: () => void): () => void;
  /** A captured plan token prevents a late click from answering a newer import. */
  respond(this: void, plan: MotionInitializationPlan, accepted: boolean): boolean;
  cancel(this: void): void;
  /** The UI owns this lease; losing its last host cancels any pending request. */
  attachHost(this: void): () => void;
}
const sessions = new WeakMap<EnginePort, MotionConfirmation>();

function validatePlan(plan: MotionInitializationPlan): void {
  try {
    if (
      !plan ||
      !Number.isSafeInteger(plan.revision) ||
      plan.revision < 0 ||
      !Array.isArray(plan.layerIds) ||
      plan.layerIds.length > 100000 ||
      plan.layerIds.some((id) => typeof id !== "string" || !id) ||
      new Set(plan.layerIds).size !== plan.layerIds.length
    )
      throw Error();
    const needsConfirmation = plan.layerIds.length > 3;
    if (plan.requiresConfirmation !== needsConfirmation) throw Error();
    validateMotionTime(plan.duration);
    normalizeMotionFrameRate(plan.frameRate);
    if (compareMotionTime(plan.duration, { value: 0, rate: 1 }) <= 0) throw Error();
  } catch {
    throw new MotionConfirmationError("invalid");
  }
}

/** Presentation broker only: staging/import stays in services and no document edit occurs here. */
export function getMotionConfirmation(engine: EnginePort): MotionConfirmation {
  const existing = sessions.get(engine);
  if (existing) return existing;
  const listeners = new Set<() => void>();
  let hosts = 0;
  let pending: {
    plan: MotionInitializationPlan;
    projectId: string;
    resolve: (accepted: boolean) => void;
    reject: (error: Error) => void;
    stop: () => void;
  } | null = null;
  const emit = () => {
    for (const listener of listeners) listener();
  };
  const current = () => {
    if (!pending) return false;
    const snapshot = engine.getSnapshot();
    return (
      snapshot.project.id === pending.projectId &&
      snapshot.pageId === pending.plan.compositionId &&
      snapshot.revision === pending.plan.revision
    );
  };
  function settle(accepted: boolean, error?: Error) {
    const item = pending;
    if (!item) return;
    pending = null;
    item.stop();
    if (error) item.reject(error);
    else item.resolve(accepted);
    emit();
  }
  const port: MotionConfirmation = {
    read: () => pending?.plan ?? null,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    request(plan) {
      try {
        if (pending) throw new MotionConfirmationError("busy");
        validatePlan(plan);
        const snapshot = engine.getSnapshot();
        const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId);
        if (
          plan.compositionId !== snapshot.pageId ||
          plan.revision !== snapshot.revision ||
          !page ||
          page.motion
        )
          throw new MotionConfirmationError("stale");
        if (!plan.requiresConfirmation) return Promise.resolve(true);
        if (!hosts) throw new MotionConfirmationError("unavailable");
        // The staged count includes incoming media/groups not yet in the published document.
        const captured = Object.freeze({
          ...plan,
          layerIds: Object.freeze([...plan.layerIds]),
          duration: Object.freeze({ ...plan.duration }),
          frameRate: Object.freeze({ ...plan.frameRate }),
        }) as MotionInitializationPlan;
        const stop = engine.subscribe(() => {
          if (pending && !current()) settle(false, new MotionConfirmationError("stale"));
        });
        const result = new Promise<boolean>((resolve, reject) => {
          pending = {
            plan: captured,
            projectId: snapshot.project.id,
            resolve,
            reject,
            stop,
          };
        });
        emit();
        return result;
      } catch (error) {
        return Promise.reject(error);
      }
    },
    respond(plan, accepted) {
      if (pending?.plan !== plan) return false;
      if (!current()) {
        settle(false, new MotionConfirmationError("stale"));
        return false;
      }
      settle(accepted);
      return true;
    },
    cancel: () => settle(false),
    attachHost() {
      hosts++;
      let alive = true;
      return () => {
        if (!alive) return;
        alive = false;
        hosts--;
        if (!hosts) settle(false);
      };
    },
  };
  sessions.set(engine, port);
  return port;
}
