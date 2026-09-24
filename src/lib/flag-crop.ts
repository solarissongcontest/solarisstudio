export type FlagCrop = { x: number; y: number; zoom: number };
export const CENTER_FLAG_CROP: FlagCrop = { x: 50, y: 50, zoom: 1 };

export function clampFlagCrop(crop: FlagCrop): FlagCrop {
  // PostgREST clients and SQL transports may represent NUMERIC as strings.
  const x = Number(crop.x);
  const y = Number(crop.y);
  const zoom = Number(crop.zoom);
  return {
    x: Math.max(0, Math.min(100, Number.isFinite(x) ? x : 50)),
    y: Math.max(0, Math.min(100, Number.isFinite(y) ? y : 50)),
    zoom: Math.max(1, Math.min(2, Number.isFinite(zoom) ? zoom : 1)),
  };
}
