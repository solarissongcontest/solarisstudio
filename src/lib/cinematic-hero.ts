/** Focal coordinates are normalized 0..1; invalid historical values fail to centre. */
export type CinematicFocalPoint = readonly [number, number];

function coordinate(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0.5;
}

export function resolveCinematicObjectPosition(point?: CinematicFocalPoint | null): string {
  return `${Math.round(coordinate(point?.[0]) * 100)}% ${Math.round(coordinate(point?.[1]) * 100)}%`;
}

/** Untrusted decorative colour input must not be allowed to inject CSS values. */
export function safeCinematicColor(input?: string | null): string | null {
  if (!input || !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(input)) return null;
  return input.toLowerCase();
}
