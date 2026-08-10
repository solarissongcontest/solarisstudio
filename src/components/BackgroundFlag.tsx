import {
  useId,
} from "react";

type BackgroundFlagProps = {
  image?: string | null;
  className?: string;
  opacity?: number;
};

export function BackgroundFlag({
  image,
  className = "",
  opacity = 0.18,
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
      style={{
        opacity,
      }}
    >
      <svg
        viewBox="-18 -18 136 136"
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
          {/* ================================================
              FLAG IMAGE

              The image is used as a fill for actual circles.
              This prevents the square source image from ever
              becoming visible.
             ================================================ */}

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

          {/* ================================================
              BLUR

              Blurs the circular flag outward.
             ================================================ */}

          <filter
            id={blurId}
            x="-45%"
            y="-45%"
            width="190%"
            height="190%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              stdDeviation="7"
            />
          </filter>

          {/* ================================================
              SHARP CENTRE GRADIENT

              Strong and clear in the middle.
              Gradually disappears toward the edge.
             ================================================ */}

          <radialGradient
            id={
              sharpGradientId
            }
            cx="50%"
            cy="50%"
            r="50%"
          >
            <stop
              offset="0%"
              stopColor="white"
              stopOpacity="1"
            />

            <stop
              offset="45%"
              stopColor="white"
              stopOpacity="1"
            />

            <stop
              offset="55%"
              stopColor="white"
              stopOpacity="0.98"
            />

            <stop
              offset="64%"
              stopColor="white"
              stopOpacity="0.82"
            />

            <stop
              offset="72%"
              stopColor="white"
              stopOpacity="0.58"
            />

            <stop
              offset="80%"
              stopColor="white"
              stopOpacity="0.32"
            />

            <stop
              offset="87%"
              stopColor="white"
              stopOpacity="0.12"
            />

            <stop
              offset="93%"
              stopColor="white"
              stopOpacity="0"
            />

            <stop
              offset="100%"
              stopColor="white"
              stopOpacity="0"
            />
          </radialGradient>

          <mask
            id={
              sharpMaskId
            }
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

          {/* ================================================
              SOFT OUTER GRADIENT

              Allows the blurred colours to spread beyond the
              main flag and then dissolve into the background.
             ================================================ */}

          <radialGradient
            id={
              softGradientId
            }
            cx="50%"
            cy="50%"
            r="50%"
          >
            <stop
              offset="0%"
              stopColor="white"
              stopOpacity="1"
            />

            <stop
              offset="55%"
              stopColor="white"
              stopOpacity="1"
            />

            <stop
              offset="68%"
              stopColor="white"
              stopOpacity="0.95"
            />

            <stop
              offset="78%"
              stopColor="white"
              stopOpacity="0.72"
            />

            <stop
              offset="87%"
              stopColor="white"
              stopOpacity="0.42"
            />

            <stop
              offset="94%"
              stopColor="white"
              stopOpacity="0.16"
            />

            <stop
              offset="100%"
              stopColor="white"
              stopOpacity="0"
            />
          </radialGradient>

          <mask
            id={
              softMaskId
            }
            maskUnits="userSpaceOnUse"
            x="-18"
            y="-18"
            width="136"
            height="136"
          >
            <circle
              cx="50"
              cy="50"
              r="65"
              fill={`url(#${softGradientId})`}
            />
          </mask>
        </defs>

        {/* ================================================
            BLURRED CIRCULAR FLAG

            IMPORTANT:
            This is a CIRCLE, not a rectangular image.

            The blur can spread outside the original circle,
            but its source shape remains circular.
           ================================================ */}

        <circle
          cx="50"
          cy="50"
          r="50"
          fill={`url(#${patternId})`}
          filter={`url(#${blurId})`}
          mask={`url(#${softMaskId})`}
        />

        {/* ================================================
            SHARP CIRCULAR FLAG

            Same exact flag underneath/above.
            Sharp centre fades gradually into blurred layer.
           ================================================ */}

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
