import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export function FlagChip({
  code,
  color,
  image,
  size = "md",
  className,
}: {
  code: string;
  color: string;
  image?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [image]);

  const dims = {
    xs: "h-5 w-7.5 text-[8px]",
    sm: "h-6 w-9 text-[10px]",
    md: "h-8 w-12 text-xs",
    lg: "h-12 w-18 text-sm",
    xl: "h-24 w-36 text-2xl",
  }[size];

  if (image && !imageFailed) {
    return (
      <span
        data-flag-chip="true"
        data-flag-has-image="true"
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-transparent",
          dims,
          className,
        )}
        style={{
          position: "relative",
          isolation: "isolate",
          background: "transparent",
          boxShadow: `0 6px 22px -8px ${color}`,
        }}
      >
        <img
          src={image}
          alt={`Flag of ${code}`}
          loading="eager"
          decoding="async"
          onError={() => setImageFailed(true)}
          className="block h-full w-full object-cover"
          style={{
            display: "block",
            position: "relative",
            zIndex: 2,
            width: "100%",
            height: "100%",
            opacity: 1,
            visibility: "visible",
            filter: "none",
            mixBlendMode: "normal",
          }}
        />
      </span>
    );
  }

  return (
    <span
      data-flag-chip="true"
      data-flag-fallback="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-semibold tracking-widest text-background",
        dims,
        className,
      )}
      style={{
        background: `linear-gradient(135deg, ${color}, color-mix(in oklab, ${color} 45%, black))`,
        boxShadow: `0 6px 22px -8px ${color}`,
      }}
      aria-label={`Flag unavailable for ${code}`}
    >
      {code}
    </span>
  );
}
