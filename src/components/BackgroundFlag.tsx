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
      {/* =====================================================
          OUTER BLUR

          Very blurred copy of the flag.
          It extends beyond the original circle so the colours
          actually bleed into the background.
         ===================================================== */}
      <img
        src={image}
        alt=""
        className="
          absolute
          inset-[-8%]
          h-[116%]
          w-[116%]
          object-cover
        "
        style={{
          borderRadius: "50%",
          filter: "blur(28px)",
          transform: "scale(1.03)",

          WebkitMaskImage:
            "radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.12) 52%, rgba(0,0,0,0.45) 66%, rgba(0,0,0,0.8) 78%, rgba(0,0,0,0.55) 90%, transparent 100%)",

          maskImage:
            "radial-gradient(circle at center, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.12) 52%, rgba(0,0,0,0.45) 66%, rgba(0,0,0,0.8) 78%, rgba(0,0,0,0.55) 90%, transparent 100%)",
        }}
      />

      {/* =====================================================
          MEDIUM BLUR

          Bridges the sharp centre and the heavily blurred edge.
          This is what stops it looking like a sharp circle
          surrounded by a random glow.
         ===================================================== */}
      <img
        src={image}
        alt=""
        className="
          absolute
          inset-[-3%]
          h-[106%]
          w-[106%]
          object-cover
        "
        style={{
          borderRadius: "50%",
          filter: "blur(11px)",
          transform: "scale(1.025)",

          WebkitMaskImage:
            "radial-gradient(circle at center, transparent 0%, transparent 38%, rgba(0,0,0,0.12) 47%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.9) 72%, rgba(0,0,0,0.6) 84%, rgba(0,0,0,0.18) 93%, transparent 100%)",

          maskImage:
            "radial-gradient(circle at center, transparent 0%, transparent 38%, rgba(0,0,0,0.12) 47%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.9) 72%, rgba(0,0,0,0.6) 84%, rgba(0,0,0,0.18) 93%, transparent 100%)",
        }}
      />

      {/* =====================================================
          MAIN FLAG

          Sharp in the centre.
          It disappears gradually BEFORE reaching the outside,
          allowing the blurred copies underneath to take over.
         ===================================================== */}
      <img
        src={image}
        alt=""
        className="
          absolute
          inset-0
          h-full
          w-full
          object-cover
        "
        style={{
          borderRadius: "50%",

          WebkitMaskImage:
            "radial-gradient(circle at center, black 0%, black 45%, rgba(0,0,0,0.98) 52%, rgba(0,0,0,0.9) 59%, rgba(0,0,0,0.7) 66%, rgba(0,0,0,0.42) 73%, rgba(0,0,0,0.18) 80%, rgba(0,0,0,0.05) 86%, transparent 92%)",

          maskImage:
            "radial-gradient(circle at center, black 0%, black 45%, rgba(0,0,0,0.98) 52%, rgba(0,0,0,0.9) 59%, rgba(0,0,0,0.7) 66%, rgba(0,0,0,0.42) 73%, rgba(0,0,0,0.18) 80%, rgba(0,0,0,0.05) 86%, transparent 92%)",
        }}
      />
    </div>
  );
}
