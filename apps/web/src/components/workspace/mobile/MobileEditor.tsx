import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { AnimatePresence } from "motion/react";
import { MobileNavigation } from "../../shared/navigation/MobileNavigation";
import { useAtom } from "jotai";
import { timelineOpenAtom } from "../../../state/motion/timeline-state";
import { Layers, SlidersHorizontal, Download, MousePointer2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEngine, useEngineValue } from "../../../state/session/editor";
import { EditorSidebar } from "../EditorSidebar";
import { MobileExport } from "./MobileExport";
import { MobileSheet } from "./MobileSheet";
import { ModeIcon } from "../../motion/ModeIcon";
import { CompositionMode } from "../../motion/CompositionMode";
import { TimelinePanel } from "../../motion/TimelinePanel";
import { createMotionTransport } from "../../../services/motion/transport";
import "./messages";
import "./mobile.css";

type Panel = "properties" | "layers" | "motion" | "tools";
type Props = ComponentProps<typeof EditorSidebar> & { tools: ReactNode };
const entries = ["properties", "motion", "layers", "tools", "export"] as const;
const icons = {
  properties: SlidersHorizontal,
  layers: Layers,
  tools: MousePointer2,
  export: Download,
};

export const MobileEditor = memo(function MobileEditor({ tools, ...props }: Props) {
  const { t } = useTranslation("mobile");
  const [exportBusy, setExportBusy] = useState(false);
  const [timelineOpen, setTimelineOpen] = useAtom(timelineOpenAtom);
  const [panel, setPanel] = useState<Panel | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const motionEnabled = useEngineValue(
    props.engine,
    (snapshot) =>
      snapshot.project.pages.find((page) => page.id === snapshot.pageId)?.motion?.mode === "motion",
  );
  const shown = props.exportOpen
    ? "export"
    : props.timelapseOpen
      ? "properties"
      : timelineOpen && motionEnabled
        ? "motion"
        : panel;
  function close() {
    if (props.exportOpen) props.onExportOpenChange(false);
    setPanel(null);
    setTimelineOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  return (
    <>
      <MobileNavigation
        className="mobile-editor-nav"
        label={t("navigation")}
        value={shown}
        disabled={exportBusy}
        selection="expanded"
        items={entries.map((item) => {
          const Icon = item === "motion" ? null : icons[item];
          return {
            value: item,
            label: t(item),
            icon: Icon ? (
              <Icon size={20} strokeWidth={1.6} />
            ) : (
              <ModeIcon mode="motion" size={23} />
            ),
          };
        })}
        onSelect={(value, event) => {
          const item = entries.find((entry) => entry === value);
          if (!item || exportBusy) return;
          trigger.current = event.currentTarget;
          if (item !== "export" && props.exportOpen) props.onExportOpenChange(false);
          if (item !== "motion") setTimelineOpen(false);
          if (item === "export") {
            setPanel(null);
            props.onExportOpenChange(!props.exportOpen);
          } else if (item === "motion") {
            setPanel(shown === "motion" ? null : "motion");
            setTimelineOpen(shown !== "motion");
          } else setPanel(panel === item ? null : item);
        }}
      />
      <AnimatePresence initial={false}>
        {shown === "export" ? (
          <MobileExport
            key="export"
            engine={props.engine}
            services={props.services}
            onTask={props.onTask}
            onClose={close}
            onPendingChange={setExportBusy}
          />
        ) : (
          shown && (
            <MobileSheet
              key={shown}
              title={t(shown)}
              onClose={close}
              className={
                shown === "motion" && !motionEnabled
                  ? ""
                  : shown === "tools"
                    ? ""
                    : `mobile-sheet-${shown}`
              }
              focusOnOpen={!props.timelapseOpen}
            >
              {shown === "tools" ? (
                tools
              ) : shown === "motion" ? (
                <MobileMotion engine={props.engine} onClose={close} />
              ) : (
                <EditorSidebar {...props} mobilePanel={shown} />
              )}
            </MobileSheet>
          )
        )}
      </AnimatePresence>
    </>
  );
});

function MobileMotion({ engine, onClose }: Pick<Props, "engine"> & { onClose: () => void }) {
  const snapshot = useEngine(engine);
  const transport = useMemo(() => createMotionTransport(engine), [engine]);
  const { t } = useTranslation("mobile");
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  useEffect(() => {
    if (page.motion?.mode !== "motion") transport.pause();
  }, [page.motion?.mode, transport]);
  return (
    <div className="mobile-motion-panel">
      {page.motion?.mode === "motion" ? (
        <>
          <CompositionMode engine={engine} snapshot={snapshot} />
          <TimelinePanel
            engine={engine}
            snapshot={snapshot}
            transport={transport}
            onClose={onClose}
            compact
          />
        </>
      ) : (
        <div className="mobile-motion-start">
          <CompositionMode
            engine={engine}
            snapshot={snapshot}
            presentation="button"
            buttonLabel={t("enableMotion")}
          />
        </div>
      )}
    </div>
  );
}
