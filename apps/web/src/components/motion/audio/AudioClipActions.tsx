import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import {
  Volume2,
  VolumeX,
  Trash2,
  AudioLines,
  CornerDownRight,
  CornerDownLeft,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EnginePort, MotionAudioTrack } from "@musart/core";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../../ui/context-menu";
import { Popover, PopoverTrigger, PopoverAnchor } from "../../ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "../../ui/tooltip";
import { TimelineIconButton } from "../ControlButton";
import { getMotionAudioSession } from "../../../services/motion/audio/session";
import { AudioVolumeContent } from "./AudioVolumeContent";
import {
  AudioProcessingEditor,
  type AudioProcessingOrigin,
  type AudioProcessingSection,
} from "./AudioProcessingEditor";
import { captureAudioTrackScope, createAudioMenuScope, type AudioTrackScope } from "./scope";
import "./messages";

export function AudioClipMenu({
  engine,
  track,
  children,
  disabled,
  onSelect,
}: {
  engine: EnginePort;
  track: MotionAudioTrack;
  children: ReactNode | ((open: (section: AudioProcessingSection) => void) => ReactElement);
  disabled: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("motionAudio"),
    service = getMotionAudioSession(engine);
  const [editor, setEditor] = useState<(AudioProcessingOrigin & { scope: AudioTrackScope }) | null>(
    null,
  );
  const menu = useMemo(() => createAudioMenuScope(engine), [engine]);
  useEffect(
    () =>
      engine.subscribe(() => {
        menu.read();
        if (editor && !editor.scope.read()) setEditor(null);
      }),
    [engine, editor, menu],
  );
  useEffect(
    () => () => {
      service?.stopPreview(track.id);
    },
    [service, track.id],
  );
  useEffect(() => {
    if (!editor && menu.isEditing()) {
      menu.edit(false);
      service?.stopPreview(track.id);
    }
  }, [editor, service, menu, track.id]);
  function close() {
    menu.edit(false);
    setEditor(null);
    service?.stopPreview(track.id);
  }
  function open(section: AudioProcessingSection, fromContext = false) {
    const currentTrack = fromContext ? menu.read() : captureAudioTrackScope(engine, track).read(),
      current = engine.getSnapshot();
    if (disabled || !currentTrack) return;
    const scope = captureAudioTrackScope(engine, currentTrack, section === "gain");
    onSelect();
    menu.edit(true);
    setEditor({
      project: current.project,
      pageId: current.pageId,
      track: currentTrack,
      section,
      scope,
    });
  }
  const content = typeof children === "function" ? children(open) : children;
  return (
    <Popover
      open={!!editor}
      onOpenChange={(value) => {
        if (!value) close();
      }}
    >
      <ContextMenu
        onOpenChange={(value) => {
          if (value) {
            if (menu.capture(track)) onSelect();
          } else menu.clear();
        }}
      >
        <ContextMenuTrigger asChild disabled={disabled}>
          <PopoverAnchor asChild>{content}</PopoverAnchor>
        </ContextMenuTrigger>
        <ContextMenuContent
          onPointerDown={(event) => event.stopPropagation()}
          onCloseAutoFocus={(event) => {
            if (menu.isEditing()) event.preventDefault();
          }}
        >
          <ContextMenuItem onSelect={() => open("fadeIn", true)}>
            <CornerDownRight size={14} />
            {t("fadeIn")}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => open("fadeOut", true)}>
            <CornerDownLeft size={14} />
            {t("fadeOut")}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => open("gain", true)}>
            <Volume2 size={14} />
            {t("volume")}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => open("reverb", true)}>
            <AudioLines size={14} />
            {t("reverb")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => {
              const current = menu.read();
              if (current)
                engine.execute({
                  type: "updateMotionAudioTrack",
                  trackId: current.id,
                  patch: { mute: !current.mute },
                });
            }}
          >
            {track.mute ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {t(track.mute ? "unmute" : "mute", { name: track.name })}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            variant="destructive"
            onSelect={() => {
              const current = menu.read();
              if (current) engine.execute({ type: "deleteMotionAudioTrack", trackId: current.id });
            }}
          >
            <Trash2 size={14} />
            {t("remove")}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {editor &&
        (editor.section === "gain" ? (
          <AudioVolumeContent engine={engine} track={track} scope={editor.scope} />
        ) : (
          <AudioProcessingEditor
            key={editor.section}
            engine={engine}
            origin={editor}
            onClose={close}
          />
        ))}
    </Popover>
  );
}

export function AudioFadeButtons({
  disabled,
  onOpen,
}: {
  disabled: boolean;
  onOpen: (section: AudioProcessingSection) => void;
}) {
  const { t } = useTranslation("motionAudio");
  return (
    <>
      {(["fadeIn", "fadeOut"] as const).map((section) => (
        <Tooltip key={section}>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={`motion-audio-fade-trigger ${section === "fadeIn" ? "is-start" : "is-end"}`}
              disabled={disabled}
              aria-label={t(section)}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onOpen(section)}
            >
              {section === "fadeIn" ? <CornerDownRight size={10} /> : <CornerDownLeft size={10} />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="motion-control-tooltip">
            {t(section)}
          </TooltipContent>
        </Tooltip>
      ))}
    </>
  );
}

export function AudioGainControl({
  engine,
  track,
  disabled,
  onSelect,
}: {
  engine: EnginePort;
  track: MotionAudioTrack;
  disabled: boolean;
  onSelect?: () => void;
}) {
  const { t } = useTranslation("motionAudio"),
    service = getMotionAudioSession(engine);
  const [scope, setScope] = useState<AudioTrackScope | null>(null);
  useEffect(
    () =>
      engine.subscribe(() => {
        if (scope && !scope.read()) setScope(null);
      }),
    [engine, scope],
  );
  return (
    <Popover
      open={!!scope}
      onOpenChange={(value) => {
        if (!value) {
          service?.stopPreview(track.id);
          setScope(null);
        } else {
          const captured = captureAudioTrackScope(engine, track);
          if (captured.read()) {
            setScope(captured);
            onSelect?.();
          }
        }
      }}
    >
      <PopoverTrigger asChild>
        <TimelineIconButton
          className="motion-audio-gain"
          disabled={disabled}
          label={t("volume")}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {track.mute || track.volume === 0 ? <VolumeX size={12} /> : <Volume2 size={12} />}
        </TimelineIconButton>
      </PopoverTrigger>
      {scope && <AudioVolumeContent engine={engine} track={track} scope={scope} />}
    </Popover>
  );
}
