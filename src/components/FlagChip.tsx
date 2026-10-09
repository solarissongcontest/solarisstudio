import type { CSSProperties } from "react";
import { FlagFrame } from "@/components/FlagMedia";
import { cn } from "@/lib/utils";

export function FlagChip({ code, color, image, size = "md", className }: {
  code: string;
  color: string;
  image?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const dims = {
    xs: "h-5 w-7.5 text-[8px]",
    sm: "h-6 w-9 text-[10px]",
    md: "h-8 w-12 text-xs",
    lg: "h-12 w-18 text-sm",
    xl: "h-24 w-36 text-2xl",
  }[size];
  const radius = {
    xs: "5px",
    sm: "7px",
    md: "9px",
    lg: "12px",
    xl: "18px",
  }[size];
  return <FlagFrame
    chip
    image={image}
    alt={`Flag of ${code}`}
    fallback={code}
    className={cn("font-semibold tracking-widest text-background", dims, className)}
    style={{
      "--solaris-flag-radius": radius,
      background: image ? undefined : `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 45%, black))`,
      boxShadow: size === "lg" || size === "xl" ? `0 6px 22px -10px ${color}` : "none",
    } as CSSProperties}
  />;
}
