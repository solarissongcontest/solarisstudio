export type V3MeSummary = { viewer_id: string | null; country_id: string | null; available: boolean; receipt_count: number | null; history: Array<{ edition_id: string; edition_name: string; edition_number: number }> };
export function parseV3MeSummary(value: unknown): V3MeSummary {
  if (!value || typeof value !== "object") throw new Error("Account summary unavailable");
  const row = value as Partial<V3MeSummary>;
  if (typeof row.available !== "boolean" || !Array.isArray(row.history)) throw new Error("Account summary unavailable");
  return {
    viewer_id: typeof row.viewer_id === "string" ? row.viewer_id : null,
    available: row.available, country_id: typeof row.country_id === "string" ? row.country_id : null,
    receipt_count: row.available && Number.isSafeInteger(row.receipt_count) && row.receipt_count! >= 0 ? row.receipt_count! : null,
    history: row.history.filter((item) => typeof item?.edition_id === "string" && typeof item.edition_name === "string" && Number.isInteger(item.edition_number)).map(({ edition_id, edition_name, edition_number }) => ({ edition_id, edition_name, edition_number })),
  };
}


export function isScopedV3MeSummary(summary: V3MeSummary | undefined, viewerId: string, countryId: string | null | undefined) {
  return Boolean(countryId && summary?.available === true && summary.viewer_id === viewerId && summary.country_id === countryId);
}
