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
    xs: "h-5 w-7.5 text-[8px] rounded-[3px]",
    sm: "h-6 w-9 text-[10px] rounded-[4px]",
    md: "h-8 w-12 text-xs rounded-md",
    lg: "h-12 w-18 text-sm rounded-[10px]",
    xl: "h-24 w-36 text-2xl rounded-xl",
  }[size];
  return <FlagFrame
    chip
    image={image}
    alt={`Flag of ${code}`}
    fallback={code}
    className={cn("font-semibold tracking-widest text-background", dims, className)}
    style={{
      background: image ? undefined : `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 45%, black))`,
      boxShadow: `0 6px 22px -8px ${color}`,
    }}
  />;
}
