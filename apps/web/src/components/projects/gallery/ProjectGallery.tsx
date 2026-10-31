import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Plus, LoaderCircle, FolderOpen } from "lucide-react";
import type { EditorServices, ProjectLibraryPage, ProjectSummary } from "../../../state/contracts";
import type { TaskRunner } from "../ProjectDialog";
import { SearchInput } from "../../assets/SearchInput";
import { MeltLogo } from "../../../ui/brand/MeltLogo";
import "../dashboard/messages";
import { Button } from "../../ui/button";
import { LibraryModeFilter } from "../dashboard/LibraryModeFilter";
import { useLibraryMode, projectLibraryMode, type LibraryMode } from "../dashboard/library-mode";
import { ProjectCard } from "./ProjectCard";
import { ProjectActionDialog } from "../actions/ProjectActionDialog";
import { ProjectInsightsDialog } from "../insights/ProjectInsightsDialog";
import { useLibraryFavorites } from "../items/LibraryBrowser";
import { favoritesFirst } from "../../../services/projects/library/favorites";
export function ProjectGallery({
  services,
  activeProjectId,
  onTask,
  onOpen,
  onCreate,
  showCreateAction = true,
  busy: dashboardBusy = false,
  query: externalQuery,
  hideSearch = false,
  mode: externalMode,
  onQueryChange,
  onProjectsLoaded,
}: {
  services: EditorServices;
  activeProjectId?: string;
  onTask: TaskRunner;
  onOpen: () => void;
  onCreate: () => void;
  showCreateAction?: boolean;
  busy?: boolean;
  query?: string;
  hideSearch?: boolean;
  mode?: LibraryMode;
  onQueryChange?: (query: string) => void;
  onProjectsLoaded?: (projects: ProjectSummary[]) => void;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const favorites = useLibraryFavorites();
  const favoriteIds = useMemo(
    () => favorites?.items.filter((item) => item.kind === "project").map((item) => item.id) ?? [],
    [favorites?.items],
  );
  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);
  const [pinned, setPinned] = useState<ProjectSummary[]>([]);
  const [localQuery, setLocalQuery] = useState("");
  const query = externalQuery ?? localQuery;
  const term = query.trim().toLocaleLowerCase();
  const [localMode, setMode] = useLibraryMode();
  const mode = externalMode ?? localMode;
  const matches = (project: ProjectSummary) =>
    project.name.toLocaleLowerCase().includes(term) &&
    (mode === "all" || projectLibraryMode(project) === mode);
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
    if (!favoriteIds.length) return;
    let alive = true;
    void (async () => {
      const projects: ProjectSummary[] = [];
      for (let i = 0; i < favoriteIds.length && alive; i += 24) {
        const page = await services.listProjectPage({
          ids: favoriteIds.slice(i, i + 24),
          limit: 24,
        });
        projects.push(...page.projects);
      }
      if (alive) setPinned(projects);
    })().catch((error: unknown) => {
      if (alive)
        void onTask(() => {
          throw error;
        });
    });
    return () => {
      alive = false;
    };
  }, [favoriteIds, services, onTask, revision]);
  const projects = favoritesFirst(
    [
      ...pinned.filter(
        (item) =>
          favoriteSet.has(item.id) && !loaded?.projects.some((other) => other.id === item.id),
      ),
      ...(loaded?.projects ?? []),
    ].filter(matches),
    favoriteSet,
  );
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
  useEffect(() => {
    if (loaded) onProjectsLoaded?.(loaded.projects);
  }, [loaded, onProjectsLoaded]);
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
      {!hideSearch && (
        <div className="library-toolbar">
          <div className="project-library-search">
            <SearchInput
              aria-label={t("dashboard:searchProjects")}
              prefix={t("common.search")}
              hints={
                loaded?.projects.slice(0, 6).map((project) => ({
                  label: project.name,
                  preview: project.thumbnail ? (
                    <img src={project.thumbnail} alt="" />
                  ) : (
                    <MeltLogo size={20} />
                  ),
                })) ?? [{ label: t("dashboard:projects"), preview: <MeltLogo size={20} /> }]
              }
              value={query}
              disabled={disabled}
              onChange={(event) => {
                const next = event.target.value;
                if (externalQuery === undefined) setLocalQuery(next);
                onQueryChange?.(next);
              }}
            />
          </div>
          <LibraryModeFilter value={mode} onChange={setMode} disabled={disabled} />
        </div>
      )}
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
      ) : loaded?.projects.length === 0 && !projects.length ? (
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
            <span>{t("localProjectCount", { count: projects.length })}</span>
            <span>{t("localOnly")}</span>
          </div>
          <div className="project-grid" aria-busy={disabled}>
            {projects.map((project, index) => (
              <motion.div
                key={project.id}
                className="project-card-entry"
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: reduced ? 0 : 0.18,
                  delay: reduced ? 0 : Math.min(index * 0.025, 0.15),
                }}
              >
                <ProjectCard
                  key={project.id}
                  project={project}
                  services={services}
                  favorite={favoriteSet.has(project.id)}
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
                    void mutate(
                      () => services.duplicateProject(project.id),
                      t("projectDuplicated"),
                    );
                  }}
                  onDelete={() => setAction({ kind: "delete", project })}
                  onInsights={() => setInspecting(project)}
                  onClearHistory={() => setAction({ kind: "clearHistory", project })}
                />
              </motion.div>
            ))}
          </div>
          {loaded && !projects.length && (
            <p className="template-empty">{t("dashboard:noResults")}</p>
          )}
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
