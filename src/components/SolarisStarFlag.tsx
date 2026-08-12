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

const STAR_CLIP =
  "polygon(50% 7%, 64% 34%, 94% 39%, 73% 60%, 79% 91%, 50% 75%, 21% 91%, 27% 60%, 6% 39%, 36% 34%)";

export function SolarisStarFlag({
  image,
  name,
  color = "#7dd3fc",
  size = "md",
  className,
  imagePosition = "center",
  outline = true,
}: {
  image?: string | null;
  name?: string;
  color?: string | null;
  size?: SolarisStarFlagSize;
  className?: string;
  imagePosition?: string;
  outline?: boolean;
}) {
  const label = name ? `${name} flag` : undefined;

  return (
    <span
      className={cn("relative inline-block shrink-0", SIZES[size], className)}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <span
        className="absolute inset-[4%] overflow-hidden"
        style={{
          clipPath: STAR_CLIP,
          WebkitClipPath: STAR_CLIP,
          backgroundColor: color || "#7dd3fc",
        }}
      >
        {image && (
          <img
            src={image}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover"
            style={{ objectPosition: imagePosition }}
          />
        )}
      </span>

      {outline && (
        <img
          src="/IMG_6171.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-95 drop-shadow-[0_6px_14px_rgba(0,0,0,0.22)]"
        />
      )}
    </span>
  );
}
