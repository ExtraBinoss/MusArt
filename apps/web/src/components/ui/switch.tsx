// shadcn/ui, MIT. Source: https://ui.shadcn.com/r/styles/new-york-v4/switch.json
// Pill geometry adapted from the user-authorized Converta components/ui/switch.tsx.
"use client";

import * as React from "react";
import { cn } from "./utils";
import { Switch as SwitchPrimitive } from "radix-ui";
import "./glass-controls.css";

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "glass-switch peer group/switch relative inline-flex shrink-0 items-center rounded-full outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn("glass-switch-thumb pointer-events-none block rounded-full ring-0")}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
