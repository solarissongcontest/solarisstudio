import { useId } from "react";

import { cn } from "@/lib/utils";

type SolarisStarFlagSize = "xs" | "sm" | "md" | "lg" | "xl" | "hero";
type SolarisStarFlagFit = "display" | "compact";

const SIZES: Record<SolarisStarFlagSize, string> = {
  xs: "h-8 w-8",
  sm: "h-11 w-11",
  md: "h-12 w-12",
  lg: "h-16 w-16",
  xl: "h-[4.75rem] w-[4.75rem]",
  hero: "h-24 w-24 sm:h-28 sm:w-28",
};

/*
 * This path was extracted from the ACTUAL inner opening of IMG_6171.png.
 * The source image is 1259 × 1179, so both the flag clipping and the visible
 * PNG outline now use exactly the same coordinate system.
 */
const ORIGINAL_STAR_INNER_PATH =
  "M 637 294 L 661 294 L 685 312 L 744 428 L 759 445 L 784 455 L 970 483 L 984 489 L 995 502 L 998 523 L 991 540 L 867 663 L 852 684 L 848 700 L 849 714 L 875 848 L 866 872 L 848 887 L 826 889 L 808 883 L 664 813 L 643 815 L 506 883 L 484 883 L 472 879 L 463 873 L 451 858 L 447 845 L 447 825 L 473 678 L 472 664 L 463 649 L 368 554 L 359 535 L 359 510 L 365 497 L 383 482 L 525 458 L 553 445 L 569 419 L 619 311 Z";

const FIT = {
  display: {
    extension: { x: 300, y: 245, width: 760, height: 700 },
    main: { x: 330, y: 325, width: 700, height: 520 },
  },
  compact: {
    extension: { x: 275, y: 220, width: 810, height: 745 },
    main: { x: 355, y: 345, width: 650, height: 485 },
  },
} as const;

export function SolarisStarFlag({
  image,
  name,
  color = "#7dd3fc",
  size = "md",
  fit,
  className,
  outline = true,
}: {
  image?: string | null;
  name?: string;
  color?: string | null;
  size?: SolarisStarFlagSize;
  fit?: SolarisStarFlagFit;
  className?: string;
  outline?: boolean;
}) {
  const rawId = useId().replace(/:/g, "");
  const clipId = `solaris-original-star-${rawId}`;
  const resolvedFit: SolarisStarFlagFit = fit ?? (size === "xs" || size === "sm" ? "compact" : "display");
  const tuning = FIT[resolvedFit];
  const label = name ? `${name} flag` : undefined;

  return (
    <span
      className={cn("relative inline-block shrink-0", SIZES[size], className)}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <svg
        viewBox="0 0 1259 1179"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <path d={ORIGINAL_STAR_INNER_PATH} />
          </clipPath>
        </defs>

        <g clipPath={`url(#${clipId})`}>
          <rect x="0" y="0" width="1259" height="1179" fill={color || "#7dd3fc"} />

          {image && (
            <>
              {/*
               * Unblurred extension of the SAME flag. This layer fills the
               * star points while the complete undistorted flag sits on top.
               */}
              <image
                href={image}
                x={tuning.extension.x}
                y={tuning.extension.y}
                width={tuning.extension.width}
                height={tuning.extension.height}
                preserveAspectRatio="xMidYMid slice"
              />

              {/* Full original flag, centred and never cropped. */}
              <image
                href={image}
                x={tuning.main.x}
                y={tuning.main.y}
                width={tuning.main.width}
                height={tuning.main.height}
                preserveAspectRatio="xMidYMid meet"
              />
            </>
          )}
        </g>

        {outline && (
          <image
            href="/IMG_6171.png"
            x="0"
            y="0"
            width="1259"
            height="1179"
            preserveAspectRatio="xMidYMid meet"
          />
        )}
      </svg>
    </span>
  );
}
