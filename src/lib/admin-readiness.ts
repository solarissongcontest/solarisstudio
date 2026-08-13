import type { Participant, ResultRow } from "@/lib/data";

export type ReadinessItem = { id: string; level: "critical" | "action" | "warning" | "ok"; title: string; detail: string };

export function entryReadiness(entries: Participant[]): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  const songs = entries.filter((row) => !row.song?.trim()).length;
  const artists = entries.filter((row) => !row.artist?.trim()).length;
  if (songs) items.push({ id: "songs", level: "action", title: `${songs} songs missing`, detail: "Complete every song title." });
  if (artists) items.push({ id: "artists", level: "action", title: `${artists} artists missing`, detail: "Complete every artist name." });
  return items;
}

export function resultReadiness(results: ResultRow[]): ReadinessItem[] {
  const bad = results.filter((row) => row.total_points !== row.jury_points + row.televote_points).length;
  return bad ? [{ id: "totals", level: "critical", title: `${bad} result totals do not reconcile`, detail: "Total must equal jury plus televote." }] : [];
}
