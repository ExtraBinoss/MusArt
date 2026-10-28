import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover";
import { Button } from "../../ui/button";
import { ColorControl } from "../ColorControl";
import "./guide-color.css";
import "./messages";

/** The same compact picker as layer paint, scoped to one current guide. */
export function GuideColor({
  identity,
  value,
  disabled,
  onPreview,
  onCommit,
  onCancel,
}: {
  identity: string;
  value: string;
  disabled?: boolean;
  onPreview: (color: string) => void;
  onCommit: (color: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("guidePanel");
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const cancel = useRef(onCancel);
  useLayoutEffect(() => {
    cancel.current = onCancel;
  }, [onCancel]);
  useEffect(() => () => cancel.current(), [identity]);
  useEffect(() => {
    if (disabled) cancel.current();
  }, [disabled]);
  return (
    <Popover
      open={openedFor === identity && !disabled}
      onOpenChange={(open) => {
        setOpenedFor(open ? identity : null);
        if (!open) onCancel();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="guide-color-trigger"
          aria-label={t("color")}
        >
          <span style={{ "--guide-swatch": value } as CSSProperties} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="guide-color-popover" align="end" aria-label={t("color")}>
        <ColorControl
          identity={identity}
          value={value}
          alpha={false}
          disabled={disabled}
          onPreview={onPreview}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      </PopoverContent>
    </Popover>
  );
}
