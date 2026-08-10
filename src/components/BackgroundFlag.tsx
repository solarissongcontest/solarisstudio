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
        overflow-hidden
        rounded-full
        select-none
        ${className}
      `}
      style={{
        opacity,
        WebkitMaskImage:
          "radial-gradient(circle, black 0%, black 56%, rgba(0,0,0,0.96) 66%, rgba(0,0,0,0.72) 78%, rgba(0,0,0,0.32) 89%, transparent 100%)",
        maskImage:
          "radial-gradient(circle, black 0%, black 56%, rgba(0,0,0,0.96) 66%, rgba(0,0,0,0.72) 78%, rgba(0,0,0,0.32) 89%, transparent 100%)",
      }}
    >
      <img
        src={image}
        alt=""
        className="
          h-full
          w-full
          scale-[1.02]
          rounded-full
          object-cover
          blur-[0.6px]
        "
      />
    </div>
  );
}
