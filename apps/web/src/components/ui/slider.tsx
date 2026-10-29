// shadcn/ui, MIT. Source: https://ui.shadcn.com/r/styles/new-york-v4/slider.json
// Pill geometry adapted from the user-authorized Converta components/ui/slider.tsx.
"use client";

import * as React from "react";
import { cn } from "./utils";
import { Slider as SliderPrimitive } from "radix-ui";
import type { SliderValueSource } from "./slider-value";
import "./glass-controls.css";

const subscribeNothing = () => () => {};
const readNothing = () => null;

function Slider({
  className,
  defaultValue,
  value,
  valueSource,
  tone = "primary",
  "aria-label": ariaLabel,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root> & {
  valueSource?: SliderValueSource;
  tone?: "primary" | "neutral";
}) {
  const external = React.useSyncExternalStore(
    valueSource?.subscribe ?? subscribeNothing,
    valueSource?.read ?? readNothing,
    valueSource?.read ?? readNothing,
  );
  const actualValue = external ? Array.from(external) : value;
  const _values = React.useMemo(
    () =>
      Array.isArray(actualValue) ? actualValue : Array.isArray(defaultValue) ? defaultValue : [min],
    [actualValue, defaultValue, min],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      data-tone={tone}
      defaultValue={defaultValue}
      value={actualValue}
      min={min}
      max={max}
      className={cn(
        "glass-slider relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn("relative grow overflow-hidden rounded-full select-none")}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            "absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full",
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          aria-label={ariaLabel}
          key={index}
          className="glass-slider-thumb block shrink-0 rounded-full select-none focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
