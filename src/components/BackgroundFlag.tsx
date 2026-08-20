import {
  useId,
  type CSSProperties,
} from "react";

type BackgroundFlagProps = {
  image?: string | null;
  className?: string;
  opacity?: number;
};

type BackgroundFlagStyle = CSSProperties & {
  "--background-flag-image"?: string;
};

export function BackgroundFlag({
  image,
  className = "",
  opacity = 0.2,
}: BackgroundFlagProps) {
  const reactId =
    useId();

  const id =
    reactId.replace(
      /:/g,
      "",
    );

  if (!image) {
    return null;
  }

  const patternId =
    `background-flag-pattern-${id}`;

  const blurId =
    `background-flag-blur-${id}`;

  const sharpMaskId =
    `background-flag-sharp-mask-${id}`;

  const softMaskId =
    `background-flag-soft-mask-${id}`;

  const sharpGradientId =
    `background-flag-sharp-gradient-${id}`;

  const softGradientId =
    `background-flag-soft-gradient-${id}`;

  const style: BackgroundFlagStyle = {
    opacity,
    position: "absolute",
    "--background-flag-image": `url(${JSON.stringify(image)})`,
  };

  return (
    <div
      aria-hidden="true"
      className={`
        pointer-events-none
        absolute
        aspect-square
        select-none
        ${className}
      `}
      style={style}
    >
      <svg
        viewBox="-10 -10 120 120"
        xmlns="http://www.w3.org/2000/svg"
        className="
          absolute
          inset-0
          h-full
          w-full
          overflow-visible
        "
        style={{
          overflow:
            "visible",
        }}
      >
        <defs>
          <pattern
            id={patternId}
            patternUnits="userSpaceOnUse"
            width="100"
            height="100"
          >
            <image
              href={image}
              x="0"
              y="0"
              width="100"
              height="100"
              preserveAspectRatio="xMidYMid slice"
            />
          </pattern>

          <filter
            id={blurId}
            x="-60%"
            y="-60%"
            width="220%"
            height="220%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              stdDeviation="9"
            />
          </filter>

          {/* Sharp centre */}
          <radialGradient
            id={
              sharpGradientId
            }
            cx="50%"
            cy="50%"
            r="50%"
          >
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="50%" stopColor="white" stopOpacity="1" />
            <stop offset="60%" stopColor="white" stopOpacity="0.96" />
            <stop offset="69%" stopColor="white" stopOpacity="0.78" />
            <stop offset="77%" stopColor="white" stopOpacity="0.5" />
            <stop offset="84%" stopColor="white" stopOpacity="0.22" />
            <stop offset="90%" stopColor="white" stopOpacity="0.05" />
            <stop offset="95%" stopColor="white" stopOpacity="0" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>

          <mask
            id={sharpMaskId}
            maskUnits="userSpaceOnUse"
            x="0"
            y="0"
            width="100"
            height="100"
          >
            <circle
              cx="50"
              cy="50"
              r="50"
              fill={`url(#${sharpGradientId})`}
            />
          </mask>

          {/* Long blurred fade */}
          <radialGradient
            id={softGradientId}
            cx="50%"
            cy="50%"
            r="50%"
          >
            <stop offset="0%" stopColor="white" stopOpacity="1" />
            <stop offset="54%" stopColor="white" stopOpacity="1" />
            <stop offset="66%" stopColor="white" stopOpacity="0.96" />
            <stop offset="78%" stopColor="white" stopOpacity="0.72" />
            <stop offset="88%" stopColor="white" stopOpacity="0.4" />
            <stop offset="95%" stopColor="white" stopOpacity="0.14" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>

          <mask
            id={softMaskId}
            maskUnits="userSpaceOnUse"
            x="-20"
            y="-20"
            width="140"
            height="140"
          >
            <circle
              cx="50"
              cy="50"
              r="72"
              fill={`url(#${softGradientId})`}
            />
          </mask>
        </defs>

        {/* Bigger / longer blurred dissolve */}
        <circle
          cx="50"
          cy="50"
          r="58"
          fill={`url(#${patternId})`}
          filter={`url(#${blurId})`}
          mask={`url(#${softMaskId})`}
        />

        {/* Main sharp flag */}
        <circle
          cx="50"
          cy="50"
          r="50"
          fill={`url(#${patternId})`}
          mask={`url(#${sharpMaskId})`}
        />
      </svg>
    </div>
  );
}
