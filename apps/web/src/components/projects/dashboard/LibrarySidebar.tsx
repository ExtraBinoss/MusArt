import { useEffect, useRef, useState } from "react";
import { Settings2, FolderOpen, LayoutTemplate, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EditorServices, ProjectSummary } from "../../../state/contracts";
import type { TaskRunner } from "../ProjectDialog";
import { RecentProject } from "./RecentProject";
import "./library-messages";
import "./library-sidebar.css";

export interface LibrarySidebarProps {
  services: EditorServices;
  onTask: TaskRunner;
  view: "projects" | "templates";
  busy: boolean;
  onViewChange: (view: "projects" | "templates") => void;
  onChooseRecent: (id: string) => void;
  onPreferences: () => void;
}

/** Only five small metadata records and their visible cached previews belong to this sidebar. */
export function LibrarySidebar({
  services,
  onTask,
  view,
  busy,
  onViewChange,
  onChooseRecent,
  onPreferences,
}: LibrarySidebarProps) {
  const { t } = useTranslation("library");
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const report = useRef(onTask);
  useEffect(() => {
    report.current = onTask;
  }, [onTask]);
  useEffect(() => {
    if (busy) return;
    let active = true;
    void services.listProjectPage({ limit: 5 }).then(
      (result) => {
        if (active) {
          setProjects(result.projects.slice(0, 5));
          setFailed(false);
        }
      },
      (error: unknown) => {
        if (active) {
          setFailed(true);
          void report.current(() => {
            throw error;
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [services, busy, view, revision]);
  return (
    <aside className="library-sidebar">
      <nav className="library-navigation" aria-label={t("navigation")}>
        <button
          type="button"
          className="library-navigation-item"
          aria-current={view === "projects" ? "page" : undefined}
          disabled={busy}
          onClick={() => onViewChange("projects")}
        >
          <FolderOpen size={17} strokeWidth={1.6} />
          <span>{t("projects")}</span>
        </button>
        <button
          type="button"
          className="library-navigation-item"
          aria-current={view === "templates" ? "page" : undefined}
          disabled={busy}
          onClick={() => onViewChange("templates")}
        >
          <LayoutTemplate size={17} strokeWidth={1.6} />
          <span>{t("templates")}</span>
        </button>
        <button
          type="button"
          className="library-navigation-item library-community"
          aria-label={`${t("community")} · ${t("soon")}`}
          disabled
        >
          <Users size={17} strokeWidth={1.6} />
          <span>{t("community")}</span>
          <small>{t("soon")}</small>
        </button>
      </nav>
      <div className="library-sidebar-divider" />
      <section className="library-recents" aria-label={t("recent")}>
        <h2>{t("recent")}</h2>
        {failed ? (
          <div className="library-sidebar-status" role="status">
            <p>{t("unavailable")}</p>
            <button type="button" disabled={busy} onClick={() => setRevision((value) => value + 1)}>
              {t("retry")}
            </button>
          </div>
        ) : projects === null ? (
          <p className="library-sidebar-status" role="status">
            {t("loading")}
          </p>
        ) : !projects.length ? (
          <p className="library-sidebar-status">{t("empty")}</p>
        ) : (
          <div className="library-recent-list">
            {projects.map((project) => (
              <RecentProject
                key={project.id}
                project={project}
                services={services}
                busy={busy}
                onTask={onTask}
                onOpen={() => {
                  if (!busy) onChooseRecent(project.id);
                }}
              />
            ))}
          </div>
        )}
      </section>
      <button
        type="button"
        className="library-navigation-item library-preferences"
        disabled={busy}
        onClick={onPreferences}
      >
        <Settings2 size={17} strokeWidth={1.6} aria-hidden />
        <span>{t("preferences")}</span>
      </button>
    </aside>
  );
}
