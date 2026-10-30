import { useEffect, useRef, useState } from "react";
import { FileImage } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  EditorServices,
  ProjectSummary,
  ProjectThumbnailLease,
} from "../../../state/contracts";
import type { TaskRunner } from "../ProjectDialog";
import "./library-messages";

/** A visible recent item leases only its first stored artboard thumbnail. It never renders one. */
export function RecentProject({
  project,
  services,
  busy,
  onTask,
  onOpen,
}: {
  project: ProjectSummary;
  services: EditorServices;
  busy: boolean;
  onTask: TaskRunner;
  onOpen: () => void;
}) {
  const { t } = useTranslation("library");
  const element = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const [revision, setRevision] = useState(0);
  const [failedUrl, setFailedUrl] = useState("");
  const [resource, setResource] = useState<{ key: string; lease: ProjectThumbnailLease } | null>(
    null,
  );
  const pageId = project.pages[0]?.id;
  const key = JSON.stringify([project.id, pageId, revision]);
  useEffect(() => {
    const node = element.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const shown = entries.some((entry) => entry.isIntersecting);
      setVisible(shown);
      if (!shown) setResource(null);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => resource?.lease.release(), [resource]);
  useEffect(() => {
    if (!visible || !pageId) return;
    let active = true;
    void services.loadProjectThumbnails(project.id, [pageId]).then(
      (lease) => {
        if (active) setResource({ key, lease });
        else lease.release();
      },
      (error: unknown) => {
        if (active) {
          setResource(null);
          void onTask(() => {
            throw error;
          });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [visible, services, project.id, pageId, key, onTask]);
  useEffect(
    () =>
      services.subscribeProjectThumbnails((id) => {
        if (id === project.id) setRevision((value) => value + 1);
      }),
    [services, project.id],
  );
  const url =
    visible && resource?.key === key
      ? resource.lease.items.find((item) => item.pageId === pageId)?.url
      : undefined;
  return (
    <button
      ref={element}
      type="button"
      className="library-recent-project"
      disabled={busy}
      aria-label={t("openRecent", { name: project.name })}
      onClick={onOpen}
    >
      <span className="library-recent-preview">
        {url && url !== failedUrl ? (
          <img
            src={url}
            alt=""
            loading="lazy"
            draggable={false}
            onError={() => {
              setFailedUrl(url);
              void onTask(() => {
                throw new Error(t("previewUnavailable"));
              });
            }}
          />
        ) : (
          <FileImage size={16} strokeWidth={1.5} aria-hidden />
        )}
      </span>
      <span className="library-recent-name">{project.name}</span>
    </button>
  );
}
