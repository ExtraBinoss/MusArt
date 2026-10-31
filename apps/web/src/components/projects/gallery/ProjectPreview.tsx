import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { LoaderCircle, RefreshCw } from "lucide-react";
import type {
  EditorServices,
  ProjectSummary,
  ProjectThumbnailLease,
} from "../../../state/contracts";
import { ProjectMotionPreview } from "./ProjectMotionPreview";
import { IconButton } from "../../shared/IconButton";
import "../dashboard/messages";

export const HOVER_PREVIEW_INTERVAL = 1400;

/** Visible cards acquire at most two cached page URLs, releasing their previous lease after DOM replacement. */
export function ProjectPreview({
  project,
  services,
  onOpen,
  onDoubleClick,
  previewLabel,
  children,
  disabled = false,
}: {
  project: ProjectSummary;
  services: EditorServices;
  onOpen: (event?: import("react").MouseEvent<HTMLButtonElement>) => void;
  onDoubleClick?: () => void;
  previewLabel?: string;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const element = useRef<HTMLDivElement>(null);
  const ready = useRef(false);
  const [phase, setPhase] = useState<"idle" | "forward" | "return">("idle");
  const pause = useCallback(
    () => setPhase((current) => (current === "forward" ? "return" : current)),
    [],
  );
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");
  const [hovered, setHovered] = useState(false),
    [focused, setFocused] = useState(false),
    [documentVisible, setDocumentVisible] = useState(() => !document.hidden);
  const [index, setIndex] = useState(0),
    [revision, setRevision] = useState(0);
  const [resource, setResource] = useState<{
    projectId: string;
    lease: ProjectThumbnailLease | null;
    failed: boolean;
    key: string;
  } | null>(null);
  const pages = project.pages;
  // A Motion project starts on a real Motion artboard; purely Static projects retain their carousel.
  const motionIndex = pages.findIndex((item) => item.mode === "motion");
  const hasMotion = motionIndex >= 0;
  const currentIndex = hasMotion ? motionIndex : index < pages.length ? index : 0;
  const page = pages[currentIndex];
  const next = pages[(currentIndex + 1) % pages.length];
  const key = `${project.id}:${page?.id ?? ""}:${next?.id ?? ""}:${revision}`;
  useEffect(() => {
    const node = element.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const active = entries.some((entry) => entry.isIntersecting);
        setVisible(active);
        if (!active) {
          setResource(null);
          setPhase("idle");
        }
      },
      { rootMargin: "80px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => resource?.lease?.release(), [resource]);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void services
      .loadProjectThumbnails(project.id, [
        ...new Set([page?.id, next?.id].filter((id): id is string => !!id)),
      ])
      .then(
        (lease) => {
          if (active) setResource({ projectId: project.id, lease, failed: false, key });
          else lease.release();
        },
        () => {
          if (active) setResource({ projectId: project.id, lease: null, failed: true, key });
        },
      );
    return () => {
      active = false;
    };
  }, [visible, services, project.id, page?.id, next?.id, key]);
  useEffect(
    () =>
      services.subscribeProjectThumbnails((id) => {
        if (id === project.id) setRevision((value) => value + 1);
      }),
    [services, project.id],
  );
  useEffect(() => {
    const change = () => {
      setDocumentVisible(!document.hidden);
      if (document.hidden) pause();
    };
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, [pause]);
  useEffect(() => {
    if (
      disabled ||
      !hovered ||
      focused ||
      !visible ||
      !documentVisible ||
      reduced ||
      pages.length < 2 ||
      hasMotion
    )
      return;
    const timer = setInterval(() => {
      if (ready.current) setPhase((current) => (current === "idle" ? "forward" : current));
    }, HOVER_PREVIEW_INTERVAL);
    return () => clearInterval(timer);
  }, [disabled, hovered, focused, visible, documentVisible, reduced, pages.length, hasMotion]);
  const items = visible && resource?.projectId === project.id ? resource.lease?.items : undefined;
  const image =
    items?.find((item) => item.pageId === page?.id)?.url ??
    (currentIndex === 0 ? project.thumbnail : undefined);
  const prefetched = items?.find(
    (item) => item.pageId === next?.id && item.pageId !== page?.id,
  )?.url;
  useEffect(() => {
    ready.current = Boolean(image && prefetched);
  }, [image, prefetched]);
  return (
    <div
      ref={element}
      className="project-preview"
      data-preview-owner
      data-preview-page={currentIndex + 1}
      data-preview-sliding={phase !== "idle" || undefined}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => {
        setHovered(false);
        pause();
      }}
      onFocusCapture={() => {
        setFocused(true);
        pause();
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <button
        type="button"
        className="project-preview-open"
        aria-label={previewLabel ?? t("openNamedProject", { name: project.name })}
        disabled={disabled}
        onClick={onOpen}
        onDoubleClick={onDoubleClick}
      >
        <motion.div
          className="project-preview-track"
          initial={false}
          animate={{ x: !reduced && !disabled && phase === "forward" ? "-100%" : "0%" }}
          transition={
            phase === "idle" || reduced
              ? { duration: 0 }
              : { duration: 0.42, ease: [0.22, 1, 0.36, 1] }
          }
          onAnimationComplete={() => {
            if (phase === "forward" && !reduced && !disabled)
              setIndex((value) => (value + 1) % pages.length);
            if (phase !== "idle") setPhase("idle");
          }}
        >
          <div className="project-preview-slide">
            {page?.mode === "motion" && services.loadProjectPreview ? (
              <ProjectMotionPreview
                key={`${project.id}:${page.id}:${project.updatedAt}`}
                projectId={project.id}
                pageId={page.id}
                services={services}
                poster={image}
                disabled={disabled || !visible}
              >
                <span className="preview-pending">
                  <LoaderCircle size={19} />
                  <span>{t("previewPreparing")}</span>
                </span>
              </ProjectMotionPreview>
            ) : (
              <>
                {image ? (
                  <img src={image} alt={page?.name ?? project.name} draggable={false} />
                ) : (
                  <span className="preview-pending">
                    <LoaderCircle size={19} className={resource?.failed ? "" : "animate-spin"} />
                    <span>
                      {t(
                        resource?.failed && resource.key === key
                          ? "previewUnavailable"
                          : "previewPreparing",
                      )}
                    </span>
                  </span>
                )}
              </>
            )}
          </div>
          <div className="project-preview-slide" aria-hidden>
            {prefetched && <img src={prefetched} alt="" draggable={false} />}
          </div>
        </motion.div>
      </button>
      {resource?.failed && resource.key === key && (
        <IconButton
          className="preview-retry"
          label={t("retryPreview")}
          onClick={() => setRevision((value) => value + 1)}
          data-no-swipe
        >
          <RefreshCw size={13} />
        </IconButton>
      )}
      <div className="preview-page-caption" aria-live="off">
        <span>{page?.name}</span>
        {pages.length > 1 && (
          <span
            aria-label={t("dashboard:previewCount", {
              current: currentIndex + 1,
              total: pages.length,
            })}
          >
            {currentIndex + 1} / {pages.length}
          </span>
        )}
      </div>
      {pages.length > 1 && pages.length <= 7 && (
        <div className="preview-dots" aria-hidden>
          {pages.map((item, at) => (
            <span key={item.id} data-active={at === currentIndex || undefined} />
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
