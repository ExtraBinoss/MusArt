import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { MotionAnimationPreset } from "@musart/core";
import { MotionPresetStore } from "../../../services/motion/animations/presets";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import "./messages";

export function SavePreset({
  create,
  label,
}: {
  create: (name: string, id: string) => MotionAnimationPreset;
  label?: string;
}) {
  const { t } = useTranslation("animations");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  async function save() {
    if (!name.trim() || status === "saving") return;
    const store = new MotionPresetStore();
    setStatus("saving");
    try {
      await store.save(create(name.trim(), crypto.randomUUID()));
      setStatus("saved");
      setOpen(false);
    } catch {
      setStatus("failed");
    } finally {
      store.dispose();
    }
  }
  return (
    <>
      {open ? (
        <form
          className="animation-save-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Input
            aria-label={t("name")}
            placeholder={t("name")}
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            disabled={status === "saving"}
            autoFocus
          />
          <Button size="xs" disabled={!name.trim() || status === "saving"}>
            {t("save")}
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => {
            setOpen(true);
            setStatus("idle");
          }}
        >
          {label ?? t("save")}
        </Button>
      )}
      {status === "failed" && <span role="alert">{t("failed")}</span>}
      {status === "saved" && <span role="status">{t("saved")}</span>}
    </>
  );
}
