import { hasActiveExports, stopAllExports } from "./jobs";

let pending: Promise<boolean> | null = null;
let answer: ((leave: boolean) => void) | null = null;
const listeners = new Set<() => void>();
export const exportLeaveRequested = () => answer !== null;
export const subscribeExportLeave = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
function notify() {
  for (const listener of listeners) listener();
}
export function answerExportLeave(leave: boolean) {
  const resolve = answer;
  answer = null;
  notify();
  resolve?.(leave);
}
/** Shared by navigation and project replacement; simultaneous attempts share one question. */
export async function confirmExportLeave(): Promise<boolean> {
  if (!hasActiveExports()) return true;
  if (!pending) {
    pending = new Promise<boolean>((resolve) => {
      answer = resolve;
      notify();
    }).then(async (leave) => {
      try {
        if (leave) await stopAllExports();
        return leave;
      } finally {
        pending = null;
      }
    });
  }
  return pending;
}

export class ExportLeaveCancelled extends Error {
  constructor() {
    super("Project change cancelled");
    this.name = "ExportLeaveCancelled";
  }
}

export function guardExportNavigation(action: () => void) {
  if (!hasActiveExports()) action();
  else
    void confirmExportLeave().then((leave) => {
      if (leave) action();
    });
}
