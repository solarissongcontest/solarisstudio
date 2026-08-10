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

  const blurId =
    `background-flag-blur-${id}`;

  const sharpMaskId =
    `background-flag-sharp-${id}`;

  const blurMaskId =
    `background-flag-soft-${id}`;

  const sharpGradientId =
    `background-flag-sharp-gradient-${id}`;

  const blurGradientId =
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
        viewBox="0 0 100 100"
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
              HEAVY EDGE BLUR

              This blurred version is allowed to spread
              outside the original flag area.
             ================================================ */}

          <filter
            id={blurId}
            x="-35%"
            y="-35%"
            width="170%"
            height="170%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur
              stdDeviation="6.5"
            />
          </filter>

          {/* ================================================
              SHARP CENTRE MASK

              Fully sharp through the middle, then smoothly
              disappears before reaching the outer edge.
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
            />

            <stop
              offset="48%"
              stopColor="white"
            />

            <stop
              offset="58%"
              stopColor="white"
              stopOpacity="0.95"
            />

            <stop
              offset="66%"
              stopColor="white"
              stopOpacity="0.72"
            />

            <stop
              offset="74%"
              stopColor="white"
              stopOpacity="0.42"
            />

            <stop
              offset="82%"
              stopColor="white"
              stopOpacity="0.16"
            />

            <stop
              offset="90%"
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
            x="-20"
            y="-20"
            width="140"
            height="140"
          >
            <rect
              x="-20"
              y="-20"
              width="140"
              height="140"
              fill={`url(#${sharpGradientId})`}
            />
          </mask>

          {/* ================================================
              BLURRED EDGE MASK

              The blurred copy remains underneath the sharp
              image and then itself fades into nothing.
             ================================================ */}

          <radialGradient
            id={
              blurGradientId
            }
            cx="50%"
            cy="50%"
            r="70%"
          >
            <stop
              offset="0%"
              stopColor="white"
            />

            <stop
              offset="58%"
              stopColor="white"
            />

            <stop
              offset="70%"
              stopColor="white"
              stopOpacity="0.95"
            />

            <stop
              offset="80%"
              stopColor="white"
              stopOpacity="0.72"
            />

            <stop
              offset="89%"
              stopColor="white"
              stopOpacity="0.38"
            />

            <stop
              offset="96%"
              stopColor="white"
              stopOpacity="0.1"
            />

            <stop
              offset="100%"
              stopColor="white"
              stopOpacity="0"
            />
          </radialGradient>

          <mask
            id={
              blurMaskId
            }
            maskUnits="userSpaceOnUse"
            x="-30"
            y="-30"
            width="160"
            height="160"
          >
            <rect
              x="-30"
              y="-30"
              width="160"
              height="160"
              fill={`url(#${blurGradientId})`}
            />
          </mask>
        </defs>

        {/* ================================================
            ONE BLURRED COPY

            Same exact size and crop as the sharp image.
            No larger circle underneath it.
           ================================================ */}

        <image
          href={image}
          x="0"
          y="0"
          width="100"
          height="100"
          preserveAspectRatio="xMidYMid slice"
          filter={`url(#${blurId})`}
          mask={`url(#${blurMaskId})`}
        />

        {/* ================================================
            ONE SHARP COPY

            EXACTLY aligned with the blurred copy.
            It gradually gives way to the blur.
           ================================================ */}

        <image
          href={image}
          x="0"
          y="0"
          width="100"
          height="100"
          preserveAspectRatio="xMidYMid slice"
          mask={`url(#${sharpMaskId})`}
        />
      </svg>
    </div>
  );
}
