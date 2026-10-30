import { useTranslation } from "react-i18next";
import type { EnginePort, MotionAudioTrack, Project } from "@musart/core";
import { InlineTimelineName } from "../InlineTimelineName";
import "./messages";
interface Origin {
  name: string;
  project: Project;
  pageId: string;
  track: MotionAudioTrack;
}

/** The same inline-name UX as visual tracks, with an independent audio command boundary. */
export function AudioTrackName({
  engine,
  track,
  active,
  onSelect,
}: {
  engine: EnginePort;
  track: MotionAudioTrack;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation("motionAudio"),
    snapshot = engine.getSnapshot();
  return (
    <InlineTimelineName<Origin>
      identity={`${snapshot.project.id}:${snapshot.pageId}:${track.id}`}
      name={track.name}
      label={track.name}
      renameLabel={t("rename")}
      changedLabel={t("changed")}
      failedLabel={t("renameFailed")}
      interactive={active}
      onSelect={onSelect}
      capture={() => {
        const current = engine.getSnapshot(),
          page = current.project.pages.find((item) => item.id === current.pageId);
        return page?.motion?.audioTracks?.find((item) => item.id === track.id) === track
          ? { name: track.name, project: current.project, pageId: current.pageId, track }
          : null;
      }}
      commit={(origin, name) => {
        const current = engine.getSnapshot();
        if (current.project !== origin.project || current.pageId !== origin.pageId)
          return "changed";
        if (name === origin.name) return "unchanged";
        try {
          engine.execute({
            type: "updateMotionAudioTrack",
            trackId: origin.track.id,
            patch: { name },
          });
          return "applied";
        } catch {
          return "failed";
        }
      }}
    />
  );
}
