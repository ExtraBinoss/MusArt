import { useAnimationPresentation } from "./animations/presentation";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Diamond, Pause, Play } from "lucide-react";
import { getMotionAuthoring } from "../../state/session/motion-authoring";
import {
  compareMotionTime,
  type EnginePort,
  type MotionTime,
  type SessionSnapshot,
} from "@musart/core";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { TimelineIconButton } from "./ControlButton";
import { PlaybackMode } from "./PlaybackMode";
import { formatTimelineTime, parseTimelineTime } from "./time";
import { CurrentTime } from "./CurrentTime";
import { useKeybindings } from "../../state/keybindings/use-keybindings";
import { chordTokens } from "../../state/keybindings/chords";
import { modifierLabel } from "../search/shortcuts";
import type { TimelineTransport, TimelineUnit } from "./model";
import "./messages";

function AutoKey({ engine, active }: { engine: EnginePort; active: boolean }) {
  const { t } = useTranslation("motion");
  const port = useMemo(() => getMotionAuthoring(engine), [engine]);
  const [enabled, setEnabled] = useState(() => port.read());
  useEffect(() => port.subscribe(() => setEnabled(port.read())), [port]);
  return (
    <TimelineIconButton
      label={t("autoKey")}
      className={`motion-auto-key ${enabled ? "is-active" : ""}`}
      aria-pressed={enabled}
      disabled={!active}
      onClick={() => port.set(!port.read())}
    >
      <Diamond size={12} />
    </TimelineIconButton>
  );
}

function Duration({
  engine,
  snapshot,
  duration,
  unit,
  active,
}: {
  engine: EnginePort;
  snapshot: SessionSnapshot;
  duration: MotionTime;
  unit: TimelineUnit;
  active: boolean;
}) {
  const { t } = useTranslation("motion");
  const [text, setText] = useState(formatTimelineTime(duration, unit));
  const [error, setError] = useState<"invalidDuration" | "durationFailed" | "changed" | null>(null);
  const [focused, setFocused] = useState(false);
  const origin = useRef({
    projectId: snapshot.project.id,
    revision: snapshot.revision,
    pageId: snapshot.pageId,
  });
  const cancelled = useRef(false);
  const displayed = focused ? text : formatTimelineTime(duration, unit);
  function commit() {
    setFocused(false);
    if (!active) return;
    if (cancelled.current) {
      cancelled.current = false;
      setError(null);
      return;
    }
    const current = engine.getSnapshot(),
      value = parseTimelineTime(text, unit);
    const page = current.project.pages.find((item) => item.id === snapshot.pageId);
    if (!value || value.value <= 0) {
      setError("invalidDuration");
      return;
    }
    if (
      current.project.id !== origin.current.projectId ||
      current.revision !== origin.current.revision ||
      current.pageId !== origin.current.pageId ||
      !page?.motion
    ) {
      setError("changed");
      return;
    }
    try {
      if (compareMotionTime(value, page.motion.duration) !== 0)
        engine.execute({ type: "setMotionDuration", duration: value });
      setError(null);
    } catch {
      setError("durationFailed");
    }
  }
  return (
    <div className="motion-time-field">
      <Input
        type="number"
        step="any"
        min={0}
        value={displayed}
        aria-label={t("duration")}
        aria-invalid={error !== null}
        disabled={!active}
        onFocus={() => {
          const current = engine.getSnapshot();
          origin.current = {
            projectId: current.project.id,
            revision: current.revision,
            pageId: current.pageId,
          };
          setText(formatTimelineTime(duration, unit));
          setFocused(true);
        }}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancelled.current = true;
            setText(formatTimelineTime(duration, unit));
            event.currentTarget.blur();
          }
        }}
      />
      {error && (
        <span className="motion-field-error" role="alert">
          {t(error)}
        </span>
      )}
    </div>
  );
}

export const TimelineControls = memo(function TimelineControls({
  engine,
  snapshot,
  transport,
  unit,
  onUnit,
  collapseControl,
  active = true,
}: {
  engine: EnginePort;
  snapshot: SessionSnapshot;
  transport: TimelineTransport;
  unit: TimelineUnit;
  onUnit: () => void;
  collapseControl?: ReactNode;
  active?: boolean;
}) {
  const { t } = useTranslation("motion");
  const { details } = useAnimationPresentation(engine);
  const [state, setState] = useState(() => {
    const value = transport.read();
    return { playing: value.playing, playbackMode: value.playbackMode };
  });
  const current = useRef(state);
  useEffect(() => {
    const sync = () => {
      const next = transport.read();
      if (
        next.playing === current.current.playing &&
        next.playbackMode === current.current.playbackMode
      )
        return;
      const value = { playing: next.playing, playbackMode: next.playbackMode };
      current.current = value;
      setState(value);
    };
    sync();
    return transport.subscribe(sync);
  }, [transport]);
  const page = snapshot.project.pages.find((item) => item.id === snapshot.pageId)!;
  const duration = page.motion?.duration ?? transport.read().duration;
  const bindings = useKeybindings();
  const playbackChord = bindings.bindings.get("action:togglePlayback")?.[0];
  return (
    <div className="motion-transport">
      <TimelineIconButton
        label={t(state.playing ? "pause" : "play")}
        shortcut={
          playbackChord
            ? chordTokens(playbackChord).map((key) => (key === "Space" ? t("space") : key))
            : undefined
        }
        aria-keyshortcuts={
          playbackChord
            ? chordTokens(playbackChord)
                .map((key) =>
                  key === "Mod" ? (modifierLabel() === "⌘" ? "Meta" : "Control") : key,
                )
                .join("+")
            : undefined
        }
        disabled={!active}
        onClick={() => (state.playing ? transport.pause() : transport.play())}
      >
        {state.playing ? <Pause size={14} /> : <Play size={14} />}
      </TimelineIconButton>
      {details && <AutoKey engine={engine} active={active} />}
      <CurrentTime transport={transport} unit={unit} active={active} />
      <span className="motion-time-divider" aria-hidden>
        /
      </span>
      <Duration
        key={snapshot.pageId}
        engine={engine}
        snapshot={snapshot}
        duration={duration}
        unit={unit}
        active={active}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="motion-unit"
            aria-label={t("unit")}
            disabled={!active}
            onClick={onUnit}
          >
            {unit}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">{t("changeTimeFormat")}</TooltipContent>
      </Tooltip>
      <PlaybackMode
        active={active}
        value={state.playbackMode}
        onChange={(value) => transport.setPlaybackMode(value)}
      />
      {collapseControl}
    </div>
  );
});
