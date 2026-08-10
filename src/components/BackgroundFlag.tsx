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
      {/* Soft blurred edge only */}
      <div
        className="
          absolute
          -inset-[3%]
          overflow-hidden
          rounded-full
        "
        style={{
          WebkitMaskImage:
            "radial-gradient(circle, transparent 0%, transparent 55%, rgba(0,0,0,0.18) 66%, rgba(0,0,0,0.55) 76%, rgba(0,0,0,0.85) 84%, rgba(0,0,0,0.45) 92%, transparent 100%)",
          maskImage:
            "radial-gradient(circle, transparent 0%, transparent 55%, rgba(0,0,0,0.18) 66%, rgba(0,0,0,0.55) 76%, rgba(0,0,0,0.85) 84%, rgba(0,0,0,0.45) 92%, transparent 100%)",
        }}
      >
        <img
          src={image}
          alt=""
          className="
            h-full
            w-full
            scale-[1.04]
            object-cover
            blur-[14px]
          "
        />
      </div>

      {/* Main flag stays sharp */}
      <div
        className="
          absolute
          inset-0
          overflow-hidden
          rounded-full
        "
        style={{
          WebkitMaskImage:
            "radial-gradient(circle, black 0%, black 52%, rgba(0,0,0,0.96) 60%, rgba(0,0,0,0.82) 68%, rgba(0,0,0,0.55) 76%, rgba(0,0,0,0.28) 84%, rgba(0,0,0,0.08) 92%, transparent 100%)",
          maskImage:
            "radial-gradient(circle, black 0%, black 52%, rgba(0,0,0,0.96) 60%, rgba(0,0,0,0.82) 68%, rgba(0,0,0,0.55) 76%, rgba(0,0,0,0.28) 84%, rgba(0,0,0,0.08) 92%, transparent 100%)",
        }}
      >
        <img
          src={image}
          alt=""
          className="
            h-full
            w-full
            object-cover
          "
        />
      </div>
    </div>
  );
}
