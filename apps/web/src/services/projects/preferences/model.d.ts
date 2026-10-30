export interface ProjectLayoutPreferences {
  workspaceLayout?: { workspace: number; inspector: number };
  sidebarLayout?: { properties: number; layers: number };
  /** Requested height as a fraction of the browser viewport, before responsive clamping. */
  timelineHeight?: number;
  /** CSS pixels per second, shared by this project's compositions. */
  timelineZoom?: number;
}

export interface ProjectPreferencesPort {
  read(projectId: string): Promise<ProjectLayoutPreferences>;
  update(projectId: string, patch: ProjectLayoutPreferences): Promise<void>;
}
