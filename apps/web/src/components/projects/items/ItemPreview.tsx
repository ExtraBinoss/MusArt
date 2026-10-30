import { useEffect, useState } from "react";
import { FileImage } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EditorServices } from "../../../state/contracts";
import type { LibraryItem } from "../../../services/projects/library/favorites";
import { ProjectMotionPreview } from "../gallery/ProjectMotionPreview";
import { MotionTemplatePreview } from "../templates/motion-preview/MotionTemplatePreview";
import { TEMPLATE_CATALOG } from "../../../services/projects/templates/catalog";
import { isMotionTemplateId } from "../../../services/projects/templates/motion/identity";
export function ItemPreview({ item, services }: { item: LibraryItem; services: EditorServices }) {
  const { t } = useTranslation("libraryItem");
  const [source, setSource] = useState<{ key: string; url?: string; failed?: boolean } | null>(
    null,
  );
  const key = `${item.kind}:${item.id}:${item.pageId ?? ""}`;
  useEffect(() => {
    if (item.kind !== "project" || !item.pageId) return;
    let active = true,
      release: (() => void) | undefined;
    void services.loadProjectThumbnails(item.id, [item.pageId]).then(
      (lease) => {
        if (!active) {
          lease.release();
          return;
        }
        release = lease.release;
        setSource({ key, url: lease.items.find((entry) => entry.pageId === item.pageId)?.url });
      },
      () => {
        if (active) setSource({ key, failed: true });
      },
    );
    return () => {
      active = false;
      release?.();
    };
  }, [item.kind, item.id, item.pageId, services, key]);
  const template =
    item.kind === "template" ? TEMPLATE_CATALOG.find((entry) => entry.id === item.id) : undefined;
  const poster =
    template?.preview ?? (source?.key === key ? source.url : undefined) ?? item.preview;
  const fallback = (
    <span className="library-item-preview-empty">
      <FileImage size={36} />
      {source?.key === key && source.failed ? <span role="status">{t("failed")}</span> : null}
    </span>
  );
  return (
    <div className="library-item-preview" data-preview-owner tabIndex={0}>
      {item.kind === "template" && item.mode === "motion" && isMotionTemplateId(item.id) ? (
        <MotionTemplatePreview templateId={item.id} poster={poster ?? ""} />
      ) : item.kind === "project" && item.mode === "motion" && item.pageId ? (
        <ProjectMotionPreview
          projectId={item.id}
          pageId={item.pageId}
          services={services}
          poster={poster}
        >
          {fallback}
        </ProjectMotionPreview>
      ) : poster ? (
        <img src={poster} alt="" />
      ) : (
        fallback
      )}
    </div>
  );
}
