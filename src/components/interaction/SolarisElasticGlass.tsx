import { type CSSProperties, type HTMLAttributes, type ReactNode } from "react";

import { KubeLiquidGlassBackdrop } from "@/components/app/KubeLiquidGlassBackdrop";
import { cn } from "@/lib/utils";

export function SolarisElasticGlass({
  children,
  className,
  sourceKey = "solaris-elastic-glass",
  stretchX = 0,
  stretchY = 0,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  sourceKey?: string;
  stretchX?: number;
  stretchY?: number;
}) {
  const safeX = Math.max(-0.08, Math.min(0.08, stretchX));
  const safeY = Math.max(-0.08, Math.min(0.08, stretchY));
  const style = {
    ...props.style,
    "--solaris-elastic-scale-x": 1 + safeX,
    "--solaris-elastic-scale-y": 1 + safeY,
  } as CSSProperties;

  return (
    <div
      {...props}
      style={style}
      data-solaris-elastic-glass=""
      className={cn(
        "relative isolate overflow-hidden rounded-[inherit]",
        "transition-transform duration-200 motion-reduce:transform-none motion-reduce:transition-none",
        "[transform:scaleX(var(--solaris-elastic-scale-x))_scaleY(var(--solaris-elastic-scale-y))]",
        className,
      )}
    >
      <KubeLiquidGlassBackdrop
        className="pointer-events-none absolute inset-0 size-full rounded-[inherit]"
        sourceKey={sourceKey}
      />
      <div className="relative z-[1]">{children}</div>
    </div>
  );
}
