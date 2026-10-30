import { useTranslation } from "react-i18next";
import type { ProjectSummary } from "../../../state/contracts";
import { TEMPLATE_CATALOG } from "../../../services/projects/templates/catalog";
import { SearchInput } from "../../assets/SearchInput";
import { SocialBrandIcon } from "../../assets/SocialBrandIcon";
import { MeltLogo } from "../../../ui/brand/MeltLogo";
import { ModeIcon } from "../../motion/ModeIcon";
import { SegmentedTabs } from "../../shared/segmented/SegmentedTabs";
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
  mode: "static" | "motion";
  onModeChange: (mode: "static" | "motion") => void;
  projects: readonly ProjectSummary[];
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const hints =
    view === "projects"
      ? projects.slice(0, 6).map((project) => ({
          label: project.name,
          preview: project.thumbnail ? (
            <img src={project.thumbnail} alt="" />
          ) : (
            <MeltLogo size={20} />
          ),
        }))
      : TEMPLATE_CATALOG.filter((item) => item.mode === mode)
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
      <div className="library-mode-toggle" hidden={view !== "templates"}>
        <SegmentedTabs
          mode="choice"
          label={t("templates:filter")}
          value={mode}
          disabled={disabled}
          onValueChange={(value) => {
            if (value === "static" || value === "motion") onModeChange(value);
          }}
          items={(["static", "motion"] as const).map((value) => ({
            value,
            label: t(`templates:${value}`),
            icon: <ModeIcon mode={value} size={17} />,
          }))}
        />
      </div>
    </div>
  );
}
