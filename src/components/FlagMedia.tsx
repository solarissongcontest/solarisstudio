import { useEffect, useState, type CSSProperties, type ImgHTMLAttributes } from "react";

import { useCountries } from "@/lib/data";
import { CENTER_FLAG_CROP, clampFlagCrop, type FlagCrop } from "@/lib/flag-crop";
import { cn } from "@/lib/utils";

export { clampFlagCrop, type FlagCrop } from "@/lib/flag-crop";

/** One crop per original URL, shared by library, hero, Wiki, edition and broadcast. */
export function FlagMedia({ image, alt, mode = "standard", crop, className, style, onError, ...imageProps }: {
  image: string;
  alt: string;
  mode?: "standard" | "original" | "atmosphere";
  crop?: FlagCrop;
} & Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt">) {
  const countries = useCountries();
  const country = mode === "standard" && !crop
    ? countries.data?.find((row) => row.flag_image === image)
    : null;
  const saved = country
    ? { x: country.flag_crop_x ?? 50, y: country.flag_crop_y ?? 50, zoom: country.flag_crop_zoom ?? 1 }
    : CENTER_FLAG_CROP;
  const selected = clampFlagCrop(crop ?? saved);
  const standard = mode === "standard";
  const mediaStyle: CSSProperties = standard
    ? { ...style, objectFit: "cover", objectPosition: `${selected.x}% ${selected.y}%`, transform: selected.zoom > 1 ? `scale(${selected.zoom})` : undefined }
    : { ...style, objectFit: mode === "original" ? "contain" : "cover" };

  return <img {...imageProps} src={image} alt={alt} onError={onError} data-flag-role={mode} className={cn("flag-media-image", className)} style={mediaStyle} />;
}

export function FlagFrame({ image, alt, fallback, crop, className, imageClassName, style, loading = "lazy", chip = false }: {
  image?: string | null;
  alt: string;
  fallback: string;
  crop?: FlagCrop;
  className?: string;
  imageClassName?: string;
  style?: CSSProperties;
  loading?: "eager" | "lazy";
  chip?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  return (
    <span data-flag-frame="standard" data-flag-chip={chip ? "true" : undefined} className={cn("flag-media-frame", className)} style={style}>
      {image && !failed
        ? <FlagMedia image={image} alt={alt} crop={crop} className={imageClassName} loading={loading} decoding="async" onError={() => setFailed(true)} />
        : <span className="flag-media-fallback" aria-label={`${alt} unavailable`}>{fallback}</span>}
    </span>
  );
}
