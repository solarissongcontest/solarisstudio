import { useId } from "react";

import { cn } from "@/lib/utils";

type SolarisStarFlagSize = "xs" | "sm" | "md" | "lg" | "xl" | "hero";

const SIZES: Record<SolarisStarFlagSize, string> = {
  xs: "h-7 w-7",
  sm: "h-9 w-9",
  md: "h-12 w-12",
  lg: "h-16 w-16",
  xl: "h-20 w-20",
  hero: "h-24 w-24 sm:h-28 sm:w-28",
};

const STAR_PATH =
  "M50 6 " +
  "C54 6 56.5 8.4 58.8 13.2 " +
  "L67.4 30.4 " +
  "C68.4 32.4 70.2 33.6 72.5 34 " +
  "L91.3 36.8 " +
  "C97.3 37.7 99.7 45 95.3 49.1 " +
  "L81.8 61.8 " +
  "C80.1 63.4 79.3 65.8 79.7 68.1 " +
  "L82.9 86.5 " +
  "C84 92.6 77.5 97.2 72 94.3 " +
  "L55.2 85.5 " +
  "C51.8 83.8 48.2 83.8 44.8 85.5 " +
  "L28 94.3 " +
  "C22.5 97.2 16 92.6 17.1 86.5 " +
  "L20.3 68.1 " +
  "C20.7 65.8 19.9 63.4 18.2 61.8 " +
  "L4.7 49.1 " +
  "C0.3 45 2.7 37.7 8.7 36.8 " +
  "L27.5 34 " +
  "C29.8 33.6 31.6 32.4 32.6 30.4 " +
  "L41.2 13.2 " +
  "C43.5 8.4 46 6 50 6 Z";

export function SolarisStarFlag({
  image,
  name,
  color = "#7dd3fc",
  size = "md",
  className,
  outline = true,
}: {
  image?: string | null;
  name?: string;
  color?: string | null;
  size?: SolarisStarFlagSize;
  className?: string;
  outline?: boolean;
}) {
  const rawId = useId().replace(/:/g, "");
  const clipId = `solaris-star-clip-${rawId}`;
  const blurId = `solaris-star-blur-${rawId}`;
  const label = name ? `${name} flag` : undefined;

  return (
    <span
      className={cn("relative inline-block shrink-0", SIZES[size], className)}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <svg
        viewBox="0 0 100 100"
        className="h-full w-full overflow-visible drop-shadow-[0_6px_14px_rgba(0,0,0,0.22)]"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <path d={STAR_PATH} />
          </clipPath>

          <filter id={blurId} x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          <rect x="0" y="0" width="100" height="100" fill={color || "#7dd3fc"} />

          {image && (
            <>
              <image
                href={image}
                x="-10"
                y="-10"
                width="120"
                height="120"
                preserveAspectRatio="xMidYMid slice"
                filter={`url(#${blurId})`}
                opacity="0.95"
              />

              <rect x="0" y="0" width="100" height="100" fill="rgba(255,255,255,0.025)" />

              <image
                href={image}
                x="13"
                y="18"
                width="74"
                height="64"
                preserveAspectRatio="xMidYMid meet"
              />
            </>
          )}
        </g>

        {outline && (
          <path
            d={STAR_PATH}
            fill="none"
            stroke="white"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            opacity="0.98"
          />
        )}
      </svg>
    </span>
  );
}
