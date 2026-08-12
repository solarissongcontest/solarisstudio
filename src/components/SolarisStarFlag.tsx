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

// This clip is deliberately tucked inside the real IMG_6171 outline.
// The visible shape is always the original image, never a recreated star.
const INNER_STAR_CLIP =
  "polygon(50% 8%, 61% 34%, 90% 39%, 69% 59%, 75% 88%, 50% 74%, 24% 88%, 29% 59%, 8% 39%, 38% 34%)";

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
        className="absolute inset-[5%] overflow-hidden"
        style={{
          clipPath: INNER_STAR_CLIP,
          WebkitClipPath: INNER_STAR_CLIP,
          backgroundColor: color || "#7dd3fc",
        }}
      >
        {image && (
          <>
            {/*
              Extension layer: the same flag is stretched only underneath the
              areas outside the intact centre image. There is deliberately no
              blur, glow or recolouring here.
            */}
            <img
              src={image}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-fill"
              style={{ objectPosition: imagePosition }}
            />

            {/*
              Main layer: preserves the complete original flag and its aspect
              ratio. This is what the eye reads; the layer behind merely
              continues the design to the edges of the star.
            */}
            <img
              src={image}
              alt=""
              aria-hidden="true"
              className="absolute left-[10%] top-[18%] h-[64%] w-[80%] object-contain"
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
          className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-100 drop-shadow-[0_6px_14px_rgba(0,0,0,0.22)]"
        />
      )}
    </span>
  );
}
