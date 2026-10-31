import { useState, type FocusEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../ui/tooltip";
import { formatBytes } from "./format-bytes";
import "./storage.css";
export interface StorageSection {
  key: string;
  label: string;
  value: number;
  details?: ReactNode;
}
/** One local highlight links the measured bar and legend, including keyboard and touch help. */
export function StorageBreakdown({
  sections,
  label,
}: {
  sections: StorageSection[];
  label: string;
}) {
  const { i18n } = useTranslation();
  const [active, setActive] = useState<{ key: string; part: "bar" | "row" } | null>(null);
  const total = sections.reduce((sum, section) => sum + section.value, 0);
  const bytes = (value: number) => formatBytes(value, i18n.language);
  function tip(section: StorageSection, part: "bar" | "row", children: ReactNode) {
    const percent = new Intl.NumberFormat(i18n.language, {
      style: "percent",
      maximumFractionDigits: 1,
    }).format(total ? section.value / total : 0);
    return (
      <Tooltip
        key={`${part}:${section.key}`}
        open={active?.key === section.key && active.part === part}
        onOpenChange={(open) => {
          if (open) setActive({ key: section.key, part });
          else
            setActive((current) =>
              current?.key === section.key && current.part === part ? null : current,
            );
        }}
      >
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>
          <strong>{section.label}</strong>
          <span className="storage-tooltip-value">
            {bytes(section.value)} · {percent}
          </span>
        </TooltipContent>
      </Tooltip>
    );
  }
  const interaction = (key: string, part: "bar" | "row") => ({
    onPointerEnter: () => setActive({ key, part }),
    onPointerLeave: () =>
      setActive((current) => (current?.key === key && current.part === part ? null : current)),
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (event.target === event.currentTarget) setActive({ key, part });
    },
    onBlur: () => setActive(null),
    onClick: () => setActive({ key, part }),
  });
  return (
    <div className="storage-chart">
      <div className="storage-distribution" role="group" aria-label={label}>
        {sections.map(
          (section, index) =>
            section.value > 0 && (
              <span
                key={section.key}
                className="storage-segment-slot"
                style={{ flexGrow: section.value }}
              >
                {tip(
                  section,
                  "bar",
                  <button
                    type="button"
                    aria-label={`${section.label}: ${bytes(section.value)}`}
                    className={`storage-segment storage-segment-${index}`}
                    data-section={section.key}
                    data-dimmed={!!active && active.key !== section.key}
                    {...interaction(section.key, "bar")}
                  />,
                )}
              </span>
            ),
        )}
      </div>
      <dl className="storage-breakdown">
        {sections.map((section, index) =>
          tip(
            section,
            "row",
            <div
              className="storage-row"
              tabIndex={0}
              data-section={section.key}
              data-dimmed={!!active && active.key !== section.key}
              {...interaction(section.key, "row")}
            >
              <dt>
                <span className={`storage-dot storage-segment-${index}`} />
                {section.label}
                {section.details}
              </dt>
              <dd>{bytes(section.value)}</dd>
            </div>,
          ),
        )}
      </dl>
    </div>
  );
}
