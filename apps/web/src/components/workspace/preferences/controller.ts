import type {
  ProjectLayoutPreferences,
  ProjectPreferencesPort,
} from "../../../services/projects/preferences/model";
import {
  preferenceFields,
  validateProjectPreferences,
} from "../../../services/projects/preferences/schema";

type Field = keyof ProjectLayoutPreferences;
type Listener = { field: Field; notify(): void };

/** Field-scoped subscriptions keep hydration and pointer previews out of editor-root renders. */
export function createProjectPreferencesController(
  projectId: string,
  port: ProjectPreferencesPort | undefined,
  onError: (error: unknown) => void,
) {
  let values: ProjectLayoutPreferences = {};
  const revisions = new Map<Field, number>();
  const listeners = new Set<Listener>();
  let pending: ProjectLayoutPreferences = {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing = Promise.resolve();
  let loaded = false,
    loading = false,
    generation = 0;

  function notify(field: Field) {
    const snapshot = [...listeners];
    for (const listener of snapshot) if (listener.field === field) listener.notify();
  }
  function protect(field: Field) {
    revisions.set(field, (revisions.get(field) ?? 0) + 1);
  }
  function preview<K extends Field>(field: K, value: NonNullable<ProjectLayoutPreferences[K]>) {
    const checked = validateProjectPreferences({ [field]: value });
    protect(field);
    values = { ...values, ...checked };
    notify(field);
  }
  function flush() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const patch = pending;
    pending = {};
    if (!port || !Object.keys(patch).length) return writing;
    writing = writing.then(() => port.update(projectId, patch)).catch(onError);
    return writing;
  }
  function commit<K extends Field>(
    field: K,
    value: NonNullable<ProjectLayoutPreferences[K]>,
    delay = 0,
  ) {
    preview(field, value);
    pending = { ...pending, [field]: values[field] };
    if (timer !== undefined) clearTimeout(timer);
    if (delay > 0)
      timer = setTimeout(() => {
        void flush();
      }, delay);
    else void flush();
  }
  function load() {
    if (loaded || loading || !port) return;
    loading = true;
    const token = generation;
    const captured = new Map(revisions);
    void port
      .read(projectId)
      .then((stored) => {
        if (generation !== token) return;
        const checked = validateProjectPreferences(stored);
        loaded = true;
        for (const field of preferenceFields) {
          if ((captured.get(field) ?? 0) !== (revisions.get(field) ?? 0)) continue;
          values = { ...values, [field]: checked[field] };
          notify(field);
        }
      })
      .catch((error: unknown) => {
        if (generation === token) onError(error);
      })
      .finally(() => {
        if (generation === token) loading = false;
      });
  }
  return {
    read<K extends Field>(field: K): ProjectLayoutPreferences[K] {
      return values[field];
    },
    protect,
    preview,
    commit,
    flush,
    subscribe(field: Field, notifyListener: () => void) {
      const listener = { field, notify: notifyListener };
      listeners.add(listener);
      load();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          generation++;
          loading = false;
          void flush();
        }
      };
    },
  };
}

export type ProjectPreferencesController = ReturnType<typeof createProjectPreferencesController>;
