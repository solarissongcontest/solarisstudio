type BackgroundFlagProps = {
  image?: string | null;
  className?: string;
  opacity?: number;
};

export function BackgroundFlag({
  image,
  className = "",
  opacity = 0.16,
}: BackgroundFlagProps) {
  if (!image) {
    return null;
  }

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
      {/* BLURRED BASE
          This extends past the circle and actually melts
          the outer pixels into the surrounding background.
      */}
      <div
        className="
          absolute
          -inset-[5%]
          rounded-full
        "
        style={{
          filter: "blur(22px)",
          WebkitMaskImage:
            "radial-gradient(circle, black 0%, black 58%, rgba(0,0,0,0.95) 68%, rgba(0,0,0,0.72) 78%, rgba(0,0,0,0.38) 88%, rgba(0,0,0,0.12) 95%, transparent 100%)",
          maskImage:
            "radial-gradient(circle, black 0%, black 58%, rgba(0,0,0,0.95) 68%, rgba(0,0,0,0.72) 78%, rgba(0,0,0,0.38) 88%, rgba(0,0,0,0.12) 95%, transparent 100%)",
        }}
      >
        <img
          src={image}
          alt=""
          className="
            h-full
            w-full
            scale-[1.08]
            rounded-full
            object-cover
          "
        />
      </div>

      {/* SHARP CENTRE
          The middle stays readable, but it fades away
          BEFORE reaching the original circular edge.
      */}
      <div
        className="
          absolute
          inset-0
          rounded-full
        "
        style={{
          WebkitMaskImage:
            "radial-gradient(circle, black 0%, black 48%, rgba(0,0,0,0.98) 56%, rgba(0,0,0,0.82) 64%, rgba(0,0,0,0.55) 72%, rgba(0,0,0,0.28) 80%, rgba(0,0,0,0.08) 87%, transparent 94%)",
          maskImage:
            "radial-gradient(circle, black 0%, black 48%, rgba(0,0,0,0.98) 56%, rgba(0,0,0,0.82) 64%, rgba(0,0,0,0.55) 72%, rgba(0,0,0,0.28) 80%, rgba(0,0,0,0.08) 87%, transparent 94%)",
        }}
      >
        <img
          src={image}
          alt=""
          className="
            h-full
            w-full
            rounded-full
            object-cover
          "
        />
      </div>
    </div>
  );
}
