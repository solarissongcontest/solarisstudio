import { useEffect, useRef, useState } from "react";

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
  const chipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setImageFailed(false);
  }, [image]);

  /*
   * FlagChip is used inside several public edition surfaces. Editorial had a
   * generic `.glass > :first-child` rule that added large horizontal padding
   * to the first child of a card. When the flag chip itself was that first
   * child, the global border-box sizing left its content box at effectively
   * zero width, so the image was loaded but there was literally no drawable
   * width left for it. That is why the Participating countries grid showed
   * blank rectangles while the same flags still appeared elsewhere.
   *
   * These are structural media thumbnails, not card content. Lock their box
   * model here with inline !important declarations so no design preset can
   * collapse the image again.
   */
  useEffect(() => {
    const node = chipRef.current;
    if (!node) return;
    node.style.setProperty("padding", "0", "important");
    node.style.setProperty("padding-inline", "0", "important");
    node.style.setProperty("box-sizing", "border-box", "important");
    node.style.setProperty("min-width", "0", "important");
  }, [image, imageFailed, size]);

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
        ref={chipRef}
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
          loading="lazy"
          decoding="async"
          onError={() => setImageFailed(true)}
          className="block h-full w-full object-cover"
          style={{
            display: "block",
            position: "relative",
            zIndex: 2,
            width: "100%",
            height: "100%",
            minWidth: "100%",
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
      ref={chipRef}
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
