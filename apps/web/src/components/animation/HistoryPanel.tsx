import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Circle, Pause, History, Download, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import type { AnimationSession, AnimationState } from "../../services/animation/session";
import type { HistoryPage } from "../../services/history/model";
import { Button } from "../ui/button";
import { NumberInput } from "../shared/NumberInput";
import styles from "./AnimatePanel.module.css";
import "./messages";

const commandLabels: Record<string, string> = {
  addLayers: "addLayers",
  updateLayers: "updateLayers",
  deleteLayers: "deleteLayers",
  duplicateLayers: "duplicateLayers",
  reorderLayer: "reorderLayer",
  groupLayers: "groupLayers",
  ungroupLayers: "ungroupLayers",
  addPage: "addPage",
  updatePage: "updatePage",
  deletePage: "deletePage",
  renameProject: "renameProject",
  addGuide: "guide",
  updateGuide: "guide",
  deleteGuide: "guide",
  alignLayers: "align",
  distributeLayers: "align",
  attachLayerMask: "mask",
  createMaskFromSelection: "mask",
  updateMask: "mask",
  removeLayerMask: "mask",
  addAssets: "import",
};
export function HistoryPanel({
  session,
  state,
  projectId,
  busy,
  onPrepare,
  onDownload,
  onClear,
}: {
  session: AnimationSession;
  state: AnimationState;
  projectId: string;
  busy: boolean;
  onPrepare: () => void;
  onDownload: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation("animation");
  const [loaded, setLoaded] = useState<{
    projectId: string;
    version: number;
    page: HistoryPage | null;
    failed: boolean;
  } | null>(null);
  const [pending, setPending] = useState(false);
  const requests = useRef(0);
  const current =
    loaded?.projectId === projectId && loaded.version === state.version ? loaded : null;
  const page = current?.page;
  const loading = pending || !current;
  const failed = current?.failed ?? false;
  useEffect(() => {
    let active = true;
    const request = ++requests.current;
    void session
      .page()
      .then(
        (page) => {
          if (active && request === requests.current)
            setLoaded({ projectId, version: state.version, page, failed: false });
        },
        () => {
          if (active && request === requests.current)
            setLoaded({ projectId, version: state.version, page: null, failed: true });
        },
      )
      .finally(() => {
        if (active && request === requests.current) setPending(false);
      });
    return () => {
      active = false;
    };
  }, [session, state.version, projectId]);
  async function load(before?: number) {
    const request = ++requests.current;
    setPending(true);
    try {
      const page = await session.page(before);
      if (request === requests.current)
        setLoaded({ projectId, version: state.version, page, failed: false });
    } catch {
      if (request === requests.current)
        setLoaded({ projectId, version: state.version, page: null, failed: true });
    } finally {
      if (request === requests.current) setPending(false);
    }
  }
  return (
    <div className={styles.history}>
      <div className={styles.historyHeading}>
        <History size={14} />
        <strong>{t("history")}</strong>
        <span>{state.events.toLocaleString()}</span>
      </div>
      <p className={styles.hint}>{t("automaticHint")}</p>
      <NumberInput
        label={t("retention")}
        value={state.limit}
        decimalScale={0}
        min={10}
        max={100000}
        step={100}
        unit={t("entriesUnit")}
        disabled={!state.ready || busy}
        onCommit={(limit) => {
          void session.configure({ limit });
        }}
      />
      <Button
        variant="outline"
        disabled={!state.ready || busy}
        onClick={() => {
          void (state.recording ? session.stop() : session.start());
        }}
      >
        {state.recording ? <Pause size={14} /> : <Circle size={14} />}
        {t(state.recording ? "pauseRecording" : "resumeRecording")}
      </Button>
      <div className={styles.historyActions}>
        <Button disabled={!state.events || busy || !state.ready} onClick={onPrepare}>
          <History size={14} />
          {t("prepare")}
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={t("downloadHistory")}
          disabled={!state.ready || busy}
          onClick={onDownload}
        >
          <Download size={14} />
        </Button>
      </div>
      <Button variant="ghost" disabled={!state.ready || busy || !state.events} onClick={onClear}>
        <Trash2 size={13} />
        {t("clearHistory", { ns: "translation" })}
      </Button>
      <ol className={styles.historyList} aria-label={t("history")} aria-busy={loading}>
        {page?.entries.map(({ event, sequence }) => (
          <li key={sequence}>
            <span className={styles.historyIndex}>{sequence + 1}</span>
            <span>
              {t(
                `commands.${event.kind && event.kind !== "commit" ? event.kind : (commandLabels[event.commands[0]?.type ?? ""] ?? "edit")}`,
              )}
            </span>
            <time>{(event.at / 1000).toFixed(1)}s</time>
          </li>
        ))}
        {!page?.entries.length && <li>{t(loading ? "loadingHistory" : "empty")}</li>}
      </ol>
      <div className={styles.pagination}>
        <Button
          variant="ghost"
          size="sm"
          disabled={loading || !state.events}
          onClick={() => {
            void load();
          }}
        >
          <ChevronLeft size={12} />
          {t("newest")}
        </Button>
        <span>{t("pageSize", { count: page?.entries.length ?? 0 })}</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={loading || page?.before == null}
          onClick={() => {
            void load(page!.before!);
          }}
        >
          {t("older")}
          <ChevronRight size={12} />
        </Button>
      </div>
      {(failed || state.error) && (
        <p className={styles.error} role="alert">
          {t("historyFailed")}
        </p>
      )}
    </div>
  );
}
