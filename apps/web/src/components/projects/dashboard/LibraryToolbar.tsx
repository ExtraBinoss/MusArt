import { useTranslation } from "react-i18next";
import type { ProjectSummary } from "../../../state/contracts";
import { TEMPLATE_CATALOG } from "../../../services/projects/templates/catalog";
import { SearchInput } from "../../assets/SearchInput";
import { SocialBrandIcon } from "../../assets/SocialBrandIcon";
import { MeltLogo } from "../../../ui/brand/MeltLogo";
import { LibraryModeFilter } from "./LibraryModeFilter";
import { projectLibraryMode, type LibraryMode } from "./library-mode";
import "./messages";
import "../templates/messages";

/** One retained search field; changing the library section never fades or replaces it. */
export function LibraryToolbar({
  view,
  query,
  onQueryChange,
  mode,
  onModeChange,
  projects,
  disabled,
}: {
  view: "projects" | "templates";
  query: string;
  onQueryChange: (query: string) => void;
  mode: LibraryMode;
  onModeChange: (mode: LibraryMode) => void;
  projects: readonly ProjectSummary[];
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const hints =
    view === "projects"
      ? projects
          .filter((project) => mode === "all" || projectLibraryMode(project) === mode)
          .slice(0, 6)
          .map((project) => ({
            label: project.name,
            preview: project.thumbnail ? (
              <img src={project.thumbnail} alt="" />
            ) : (
              <MeltLogo size={20} />
            ),
          }))
      : TEMPLATE_CATALOG.filter((item) => mode === "all" || item.mode === mode)
          .slice(0, 6)
          .map((item) => ({
            label: t(item.nameKey),
            preview: item.preview ? (
              <img src={item.preview} alt="" />
            ) : (
              <SocialBrandIcon id={item.brandId ?? ""} size={20} />
            ),
          }));
  return (
    <div className="library-toolbar">
      <div className="library-search">
        <SearchInput
          aria-label={t(view === "projects" ? "dashboard:searchProjects" : "templates:search")}
          prefix={t("common.search")}
          hints={
            hints.length
              ? hints
              : [{ label: t("dashboard:projects"), preview: <MeltLogo size={20} /> }]
          }
          value={query}
          disabled={disabled}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      <div className="library-mode-toggle">
        <LibraryModeFilter value={mode} onChange={onModeChange} disabled={disabled} />
      </div>
    </div>
  );
}
