export function resolveLineupShowSelection({
  selected,
  initial,
  shows,
  loading,
}: {
  selected: string;
  initial?: string;
  shows: readonly { id: string }[];
  loading: boolean;
}): string {
  // An entry-point query may be consumed before asynchronous show data arrives.
  if (loading) return selected;
  if (!shows.length) return "";
  if (initial && shows.some((show) => show.id === initial)) return initial;
  return shows.some((show) => show.id === selected) ? selected : shows[0].id;
}
