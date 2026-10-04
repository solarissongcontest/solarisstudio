import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

import type { SolarisInteractionWeight } from "@/lib/interaction-physics";
import { cn } from "@/lib/utils";

export type SolarisPressableProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  weight?: SolarisInteractionWeight;
  pending?: boolean;
  success?: boolean;
  icon?: ReactNode;
};

/**
 * V6 baseline interaction primitive.
 *
 * It standardises touch acknowledgement and semantic operation state while
 * leaving product-specific layout/colour to the caller. Consequential actions
 * still require the server-side V5/V6 command contracts; this component is
 * interaction chrome, never authority.
 */
export const SolarisPressable = forwardRef<HTMLButtonElement, SolarisPressableProps>(
  function SolarisPressable(
    {
      weight = "light",
      pending = false,
      success = false,
      disabled,
      icon,
      className,
      children,
      type = "button",
      ...props
    },
    ref,
  ) {
    const unavailable = disabled || pending;
    return (
      <button
        {...props}
        ref={ref}
        type={type}
        disabled={unavailable}
        aria-busy={pending || undefined}
        data-solaris-pressable=""
        data-interaction-weight={weight}
        data-operation-state={pending ? "loading" : success ? "success" : "ready"}
        className={cn(
          "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl",
          "transition-[transform,background-color,border-color,opacity] duration-150",
          "active:scale-[0.97] motion-reduce:active:scale-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          unavailable && "cursor-not-allowed opacity-60",
          weight === "heavy" && "active:scale-[0.985]",
          className,
        )}
      >
        {icon}
        {children}
      </button>
    );
  },
);
