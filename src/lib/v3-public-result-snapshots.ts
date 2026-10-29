import type { ResultRow } from "./data";

export type PublicResultCoverage = { includedShows: number; unavailableShows: number };

export type PublicResultSnapshot = {
  showId: string;
  editionId: string;
  resultVersion: number;
  publicationVersion: number;
  availability: { results: true; jury: boolean; televote: boolean; detailedVoting: boolean };
  rows: ResultRow[];
};
export type PublicResultSnapshotHeader = Omit<PublicResultSnapshot, "rows"> & { winners: ResultRow[] };
export type PublicResultSnapshotClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const integer = (value: unknown): value is number => Number.isSafeInteger(value);
const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const invalid = () => new Error("Invalid canonical public result snapshot");

/** Validate the existing Public/Publication contract, never infer it from mutable
 * Results or show flags. Unpublished layers are zero only in legacy calculator
 * input rows; callers must use availability before exposing/consuming a layer. */
export function parsePublicResultSnapshot(value: unknown): PublicResultSnapshot {
  const payload = record(value);
  const show = record(payload?.show);
  const edition = record(payload?.edition);
  const availability = record(payload?.availability);
  if (!payload || payload.schemaVersion !== 1 || payload.publicationState !== "public"
      || !show || !edition || !nonempty(show.id) || !nonempty(show.editionId)
      || show.editionId !== edition.id || !positive(payload.resultVersion) || !positive(payload.publicationVersion)
      || !availability || availability.results !== true
      || ![availability.jury, availability.televote, availability.detailedVoting].every((flag) => typeof flag === "boolean")
      || !Array.isArray(payload.rows) || payload.rowCount !== payload.rows.length) throw invalid();
  const identities = new Set<string>();
  const rows = payload.rows.map((value) => {
    const row = record(value);
    const countryId = nonempty(row?.countryId) ? row.countryId : null;
    const entityId = nonempty(row?.contestEntityId) ? row.contestEntityId : null;
    const identity = entityId ?? countryId;
    if (!row || !identity || identities.has(identity) || !integer(row.totalPoints)
        || !(row.finalRank === null || positive(row.finalRank))
        || (availability.jury === true && !integer(row.juryPoints))
        || (availability.televote === true && !integer(row.televotePoints))) throw invalid();
    identities.add(identity);
    return {
      id: `${show.id}:${payload.resultVersion}:${identity}`, edition_id: show.editionId as string,
      show_id: show.id as string, country_id: countryId ?? "", contest_entity_id: entityId,
      total_points: row.totalPoints as number, final_rank: row.finalRank as number | null,
      jury_points: availability.jury === true ? row.juryPoints as number : 0,
      televote_points: availability.televote === true ? row.televotePoints as number : 0,
    };
  });
  return { showId: show.id, editionId: show.editionId, resultVersion: payload.resultVersion,
    publicationVersion: payload.publicationVersion,
    availability: { results: true, jury: availability.jury as boolean, televote: availability.televote as boolean, detailedVoting: availability.detailedVoting as boolean }, rows };
}

export function parsePublicResultSnapshotHeader(value: unknown): PublicResultSnapshotHeader {
  const payload = record(value);
  if (!payload || !integer(payload.rowCount) || payload.rowCount < 0 || !Array.isArray(payload.winners)
      || payload.winners.length > payload.rowCount || "rows" in payload) throw invalid();
  const parsed = parsePublicResultSnapshot({ ...payload, rows: payload.winners, rowCount: payload.winners.length });
  if (parsed.rows.some((row) => row.final_rank !== 1)) throw invalid();
  const { rows, ...metadata } = parsed;
  return { ...metadata, winners: rows };
}

/** Sequential bounded batches avoid per-show RPC fanout. Discovery transports
 * only exact-version metadata and tied winners; full rows are requested only by
 * the selected-show view or an actual archive calculation. No mutable fallback. */
async function loadBatch<T>(client: PublicResultSnapshotClient, showIds: readonly string[], includeRows: boolean,
  parse: (value: unknown) => T & { showId: string }) {
  const ids = [...new Set(showIds)];
  if (ids.some((id) => !nonempty(id))) throw invalid();
  const snapshots = new Map<string, T>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const { data, error } = await client.rpc("v3_public_published_result_snapshots", { p_show_ids: batch, p_include_rows: includeRows });
    if (error) throw new Error("Canonical published Results are unavailable");
    if (!Array.isArray(data)) throw invalid();
    for (const item of data) {
      const snapshot = parse(item);
      if (!batch.includes(snapshot.showId) || snapshots.has(snapshot.showId)) throw invalid();
      snapshots.set(snapshot.showId, snapshot);
    }
  }
  return snapshots;
}
export function loadPublicResultSnapshots(client: PublicResultSnapshotClient, showIds: readonly string[]) {
  return loadBatch(client, showIds, true, parsePublicResultSnapshot);
}
export function loadPublicResultSnapshotHeaders(client: PublicResultSnapshotClient, showIds: readonly string[]) {
  return loadBatch(client, showIds, false, parsePublicResultSnapshotHeader);
}
