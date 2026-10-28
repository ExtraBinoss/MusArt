import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, LoaderCircle, FolderOpen } from "lucide-react";
import type { EditorServices, ProjectLibraryPage, ProjectSummary } from "../../../state/contracts";
import type { TaskRunner } from "../ProjectDialog";
import { Button } from "../../ui/button";
import { ProjectCard } from "./ProjectCard";
import { ProjectActionDialog } from "../actions/ProjectActionDialog";
import { ProjectInsightsDialog } from "../insights/ProjectInsightsDialog";
export function ProjectGallery({
  services,
  activeProjectId,
  onTask,
  onOpen,
  onCreate,
  showCreateAction = true,
  busy: dashboardBusy = false,
}: {
  services: EditorServices;
  activeProjectId?: string;
  onTask: TaskRunner;
  onOpen: () => void;
  onCreate: () => void;
  showCreateAction?: boolean;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<ProjectLibraryPage | null>(null),
    [failed, setFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [action, setAction] = useState<{
      kind: "delete" | "clearHistory";
      project: ProjectSummary;
    } | null>(null),
    [inspecting, setInspecting] = useState<ProjectSummary | null>(null);
  const scope = useRef({ alive: true, pending: false });
  useEffect(() => {
    const current = scope.current;
    current.alive = true;
    return () => {
      current.alive = false;
    };
  }, []);
  const disabled = busy || dashboardBusy;
  useEffect(() => {
    let live = true;
    void services.listProjectPage({ limit: 24 }).then(
      (value) => {
        if (live) {
          setLoaded(value);
          setFailed(false);
        }
      },
      (error) => {
        if (live) {
          setFailed(true);
          void onTask(() => {
            throw error;
          });
        }
      },
    );
    return () => {
      live = false;
    };
  }, [services, onTask, revision]);
  async function mutate(task: () => Promise<void>, success?: string, refresh = true) {
    const current = scope.current;
    if (!current.alive || current.pending || dashboardBusy) return false;
    current.pending = true;
    setBusy(true);
    const ok = await onTask(task, success);
    current.pending = false;
    if (!current.alive) return false;
    setBusy(false);
    if (ok && refresh) setRevision((value) => value + 1);
    return ok;
  }
  async function more() {
    if (!loaded?.before) return;
    await mutate(
      async () => {
        const result = await services.listProjectPage({ limit: 24, before: loaded.before! });
        if (scope.current.alive)
          setLoaded((current) =>
            current
              ? {
                  projects: [
                    ...current.projects,
                    ...result.projects.filter(
                      (item) => !current.projects.some((existing) => existing.id === item.id),
                    ),
                  ],
                  before: result.before,
                }
              : result,
          );
      },
      undefined,
      false,
    );
  }
  return (
    <>
      {!loaded && !failed ? (
        <p className="gallery-status" role="status">
          <LoaderCircle size={16} className="animate-spin" />
          {t("loadingProjects")}
        </p>
      ) : failed ? (
        <div className="gallery-status">
          <p>{t("projectsUnavailable")}</p>
          <Button variant="outline" onClick={() => setRevision((value) => value + 1)}>
            {t("retry")}
          </Button>
        </div>
      ) : loaded?.projects.length === 0 ? (
        <div className="empty-projects">
          <FolderOpen size={28} strokeWidth={1.2} />
          <p>{t("noProjects")}</p>
          {showCreateAction && (
            <Button onClick={onCreate}>
              <Plus size={15} />
              {t("newProject")}
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="gallery-summary">
            <span>{t("localProjectCount", { count: loaded?.projects.length ?? 0 })}</span>
            <span>{t("localOnly")}</span>
          </div>
          <div className="project-grid" aria-busy={disabled}>
            {loaded?.projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                services={services}
                active={project.id === activeProjectId}
                disabled={disabled}
                onOpen={() => {
                  void mutate(() => services.openProject(project.id), undefined, false).then(
                    (ok) => {
                      if (ok && scope.current.alive) onOpen();
                    },
                  );
                }}
                onRename={(name) =>
                  mutate(() => services.renameProject(project.id, name), t("projectRenamed"))
                }
                onDuplicate={() => {
                  void mutate(() => services.duplicateProject(project.id), t("projectDuplicated"));
                }}
                onDelete={() => setAction({ kind: "delete", project })}
                onInsights={() => setInspecting(project)}
                onClearHistory={() => setAction({ kind: "clearHistory", project })}
              />
            ))}
          </div>
          {loaded?.before && (
            <Button
              variant="outline"
              className="load-more-projects"
              disabled={disabled}
              onClick={() => {
                void more();
              }}
            >
              {busy ? <LoaderCircle size={14} className="animate-spin" /> : null}
              {t("loadMoreProjects")}
            </Button>
          )}
        </>
      )}
      {action && (
        <ProjectActionDialog
          key={`${action.kind}:${action.project.id}`}
          name={action.project.name}
          action={action.kind}
          onCancel={() => setAction(null)}
          onConfirm={() =>
            mutate(
              () =>
                action.kind === "delete"
                  ? services.deleteProject(action.project.id)
                  : services.clearHistory(action.project.id),
              t(action.kind === "delete" ? "projectDeleted" : "historyCleared"),
            )
          }
        />
      )}
      {inspecting && (
        <ProjectInsightsDialog
          key={inspecting.id}
          project={inspecting}
          services={services}
          revision={revision}
          onClose={() => setInspecting(null)}
          onClearHistory={() => setAction({ kind: "clearHistory", project: inspecting })}
        />
      )}
    </>
  );
}
