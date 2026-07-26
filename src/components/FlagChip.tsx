import { cn } from "@/lib/utils";

export function FlagChip({
  code,
  color,
  size = "md",
  className,
}: {
  code: string;
  color: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const dims = {
    sm: "h-6 w-9 text-[10px]",
    md: "h-8 w-12 text-xs",
    lg: "h-12 w-18 text-sm",
    xl: "h-24 w-36 text-2xl",
  }[size];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-semibold tracking-widest text-background shadow-lg",
        dims,
        className,
      )}
      style={{
        background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 45%, black))`,
        boxShadow: `0 6px 22px -8px ${color}`,
      }}
      aria-hidden="true"
    >
      {code}
    </span>
  );
}
