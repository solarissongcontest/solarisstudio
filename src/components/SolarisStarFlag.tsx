import { cn } from "@/lib/utils";

type SolarisStarFlagSize = "xs" | "sm" | "md" | "lg" | "xl" | "hero";
type SolarisStarFlagFit = "display" | "compact";

const SIZES: Record<SolarisStarFlagSize, string> = {
  xs: "h-8 w-8",
  sm: "h-10 w-10",
  md: "h-12 w-12",
  lg: "h-14 w-14",
  xl: "h-[4.1rem] w-[4.1rem]",
  hero: "h-24 w-24 sm:h-28 sm:w-28",
};

// The visible star is ALWAYS the original IMG_6171.png asset.
// This inner polygon only protects the flag fill from leaking through the
// outline and is intentionally smaller than the visible white border.
const INNER_STAR_CLIP =
  "polygon(50% 11%, 60% 35%, 86.5% 39%, 67.5% 57.5%, 72.5% 84.5%, 50% 72%, 27.5% 84.5%, 32.5% 57.5%, 13.5% 39%, 40% 35%)";

const FIT = {
  display: {
    extension: "absolute -left-[14%] -top-[14%] h-[128%] w-[128%] object-fill",
    main: "absolute left-[4.5%] top-[13.5%] h-[73%] w-[91%] object-contain",
  },
  compact: {
    extension: "absolute -left-[18%] -top-[18%] h-[136%] w-[136%] object-fill",
    main: "absolute left-[8%] top-[17%] h-[66%] w-[84%] object-contain",
  },
} as const;

export function SolarisStarFlag({
  image,
  name,
  color = "#7dd3fc",
  size = "md",
  fit = "display",
  className,
  imagePosition = "center",
  outline = true,
}: {
  image?: string | null;
  name?: string;
  color?: string | null;
  size?: SolarisStarFlagSize;
  fit?: SolarisStarFlagFit;
  className?: string;
  imagePosition?: string;
  outline?: boolean;
}) {
  const label = name ? `${name} flag` : undefined;
  const tuning = FIT[fit];

  return (
    <span
      className={cn("relative inline-block shrink-0", SIZES[size], className)}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <span
        className="absolute inset-[6.5%] overflow-hidden"
        style={{
          clipPath: INNER_STAR_CLIP,
          WebkitClipPath: INNER_STAR_CLIP,
          backgroundColor: color || "#7dd3fc",
        }}
      >
        {image && (
          <>
            {/* Exact same flag, stretched only to continue its colours/patterns into the star points. */}
            <img
              src={image}
              alt=""
              aria-hidden="true"
              draggable={false}
              className={tuning.extension}
              style={{ objectPosition: imagePosition }}
            />

            {/* Full undistorted flag remains sharp and readable in the centre. */}
            <img
              src={image}
              alt=""
              aria-hidden="true"
              draggable={false}
              className={tuning.main}
              style={{ objectPosition: imagePosition }}
            />
          </>
        )}
      </span>

      {outline && (
        <img
          src="/IMG_6171.png"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-100 drop-shadow-[0_6px_14px_rgba(0,0,0,0.22)]"
        />
      )}
    </span>
  );
}
