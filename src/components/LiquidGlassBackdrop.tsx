import { Suspense, lazy, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

const LazyGlassMaterial = lazy(() =>
  import("@/vendor/liquid-glass/GlassMaterial").then((module) => ({
    default: module.GlassMaterial,
  })),
);

export type LiquidGlassBackdropVariant = "hero" | "control" | "surface";

const OPTICS = {
  hero: {
    strength: 0.038,
    depth: 0.56,
    curvature: 0.34,
    bend: 0.56,
    bendWidth: 0.14,
    dispersion: 0.22,
    frost: 3.5,
    saturate: 1.2,
    sheen: 0.4,
    sheenWidth: 2.8,
    sheenFalloff: 1.6,
    glow: 0.1,
    glowSpread: 1.1,
    glowFalloff: 0.55,
    specular: 1,
    brightness: 0,
  },
  control: {
    strength: 0.068,
    depth: 0.62,
    curvature: 0.38,
    bend: 0.62,
    bendWidth: 0.14,
    dispersion: 0.3,
    frost: 2.5,
    saturate: 1.24,
    sheen: 0.46,
    sheenWidth: 2.4,
    sheenFalloff: 1.72,
    glow: 0.12,
    glowSpread: 1,
    glowFalloff: 0.5,
    specular: 1.05,
    brightness: 0,
  },
  surface: {
    strength: 0.03,
    depth: 0.5,
    curvature: 0.3,
    bend: 0.5,
    bendWidth: 0.16,
    dispersion: 0.16,
    frost: 4,
    saturate: 1.16,
    sheen: 0.32,
    sheenWidth: 3,
    sheenFalloff: 1.5,
    glow: 0.07,
    glowSpread: 1,
    glowFalloff: 0.5,
    specular: 0.9,
    brightness: 0,
  },
} as const;

export function LiquidGlassBackdrop({
  variant = "surface",
  className,
  style,
}: {
  variant?: LiquidGlassBackdropVariant;
  className?: string;
  style?: CSSProperties;
}) {
  const materialStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "block",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    ...style,
  };

  const fallback = (
    <span
      aria-hidden="true"
      data-liquid-glass-fallback=""
      className={cn("solaris-liquid-glass-backdrop", className)}
      style={materialStyle}
    />
  );

  return (
    <Suspense fallback={fallback}>
      <LazyGlassMaterial
        aria-hidden="true"
        data-solaris-liquid-glass={variant}
        className={cn("solaris-liquid-glass-backdrop", className)}
        optics={OPTICS[variant]}
        style={materialStyle}
      />
    </Suspense>
  );
}
