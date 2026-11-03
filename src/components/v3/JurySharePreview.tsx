import { useMemo } from "react";

import {
  JURY_SHARE_TARGETS,
  type JuryShareProjection,
  type JuryShareThemeId,
} from "@/lib/v3-jury-share-card-foundation";
import {
  buildJuryShareAltDescription,
  renderJuryShareSvg,
  type EditionJuryShareVisuals,
  type JuryShareRasterAssets,
} from "@/lib/v3-jury-share-svg";

/**
 * A non-interactive preview for an already-authorized projection. Does not
 * perform a network request, offer an export action or recheck permissions.
 * The future export endpoint MUST reauthorize and reload the result version.
 */
export function JurySharePreview({
  projection,
  assets,
  theme = "default",
  editionTheme,
  className = "",
}: {
  projection: JuryShareProjection;
  assets: JuryShareRasterAssets;
  theme?: JuryShareThemeId;
  editionTheme?: EditionJuryShareVisuals;
  className?: string;
}) {
  const svg = useMemo(
    () => renderJuryShareSvg(projection, { theme, assets, editionTheme }),
    [projection, theme, assets, editionTheme],
  );
  const alt = useMemo(() => buildJuryShareAltDescription(projection), [projection]);

  return (
    <figure className={"w-full max-w-[390px] " + className}>
      <img
        src={"data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)}
        alt={alt}
        width={JURY_SHARE_TARGETS.story.width}
        height={JURY_SHARE_TARGETS.story.height}
        loading="lazy"
        decoding="async"
        draggable={false}
        className="block aspect-[9/16] w-full rounded-2xl object-contain"
      />
    </figure>
  );
}
