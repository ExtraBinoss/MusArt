import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type {
  ProjectLayoutPreferences,
  ProjectPreferencesPort,
} from "../../../services/projects/preferences/model";
import {
  createProjectPreferencesController,
  type ProjectPreferencesController,
} from "./controller";

const ProjectPreferencesContext = createContext<ProjectPreferencesController | null>(null);

export function ProjectPreferencesProvider({
  projectId,
  port,
  onError,
  children,
}: {
  projectId: string;
  port?: ProjectPreferencesPort;
  onError: (error: unknown) => void;
  children: ReactNode;
}) {
  const controller = useMemo(
    () => createProjectPreferencesController(projectId, port, onError),
    [projectId, port, onError],
  );
  useEffect(() => {
    const flush = () => {
      void controller.flush();
    };
    const background = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", background);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", background);
      flush();
    };
  }, [controller]);
  return <ProjectPreferencesContext value={controller}>{children}</ProjectPreferencesContext>;
}

export function useProjectPreferences() {
  return useContext(ProjectPreferencesContext);
}

/** A consumer subscribes to one small field; playback and document revisions are irrelevant. */
export function useProjectPreference<K extends keyof ProjectLayoutPreferences>(field: K) {
  const controller = useProjectPreferences();
  const subscribe = useCallback(
    (notify: () => void) => controller?.subscribe(field, notify) ?? (() => {}),
    [controller, field],
  );
  const read = useCallback(() => controller?.read(field), [controller, field]);
  return useSyncExternalStore(subscribe, read, read);
}
