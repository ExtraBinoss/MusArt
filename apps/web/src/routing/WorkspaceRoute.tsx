import { lazy, Suspense, useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { readLanguage } from "../state/i18n";
import { BrandStatus } from "../ui/brand/BrandStatus";
const Studio = lazy(() =>
  import("../bootstrap/Studio").then((module) => ({ default: module.Studio })),
);

/** A pathless client layout keeps one editor/runtime alive across dashboard/editor navigation. */
export function WorkspaceRoute() {
  const { i18n } = useTranslation();
  useEffect(() => {
    void i18n.changeLanguage(readLanguage());
    document.documentElement.lang = readLanguage();
  }, [i18n]);
  const navigate = useNavigate();
  const location = useRouterState({ select: (state) => state.location });
  const view = location.pathname.replace(/\/$/, "").endsWith("/dashboard") ? "dashboard" : "editor";
  const search = location.search as Record<string, unknown>;
  return (
    <Suspense
      fallback={
        <div className="studio-loading" role="status">
          <BrandStatus size={40} state="preparing" />
        </div>
      }
    >
      <Studio
        routing={{
          view,
          projectId: typeof search.project === "string" ? search.project : undefined,
          templateId: typeof search.template === "string" ? search.template : undefined,
          navigate: (destination, projectId) => {
            void navigate({
              to:
                destination === "home"
                  ? "/"
                  : destination === "dashboard"
                    ? "/dashboard"
                    : "/editor",
              search: destination === "editor" && projectId ? { project: projectId } : {},
            });
          },
        }}
      />
    </Suspense>
  );
}
