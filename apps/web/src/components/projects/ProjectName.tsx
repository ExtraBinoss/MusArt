import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "../ui/input";

export function ProjectName({
  name,
  onRename,
  id,
}: {
  name: string;
  id?: string;
  onRename(this: void, name: string): void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(name);
  const cancelBlur = useRef(false);
  return (
    <Input
      id={id}
      className="project-name-input"
      aria-label={t("projectName")}
      value={draft}
      maxLength={160}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (cancelBlur.current) {
          cancelBlur.current = false;
          return;
        }
        const next = draft.trim();
        if (next && next !== name) onRename(next);
        else setDraft(name);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelBlur.current = true;
          setDraft(name);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
