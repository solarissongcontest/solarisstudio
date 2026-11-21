/** Pure, draft-only helpers for the Organizer allocation and running-order UI. */
export const ALLOCATION_GROUPS = ["first_half", "second_half", "producer_choice"] as const;
export type AllocationGroup = (typeof ALLOCATION_GROUPS)[number];
export type AllocationDraft = Record<string, AllocationGroup | "">;

function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const output = [...values];
  for (let index = output.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.max(0, Math.min(0.999999999, random())) * (index + 1));
    [output[index], output[swap]] = [output[swap]!, output[index]!];
  }
  return output;
}

/**
 * Randomly allocate countries across all three groups.
 * "unassigned" preserves manual draws and distributes the remaining countries
 * into the least-populated groups (subject to already locked assignments).
 * The function never changes a saved database row.
 */
export function balancedAllocationDraft(
  ids: readonly string[],
  saved: Readonly<AllocationDraft>,
  mode: "all" | "unassigned",
  random: () => number = Math.random,
): AllocationDraft {
  const uniqueIds = [...new Set(ids)];
  const output: AllocationDraft = Object.fromEntries(
    uniqueIds.map((id) => [id, mode === "unassigned" ? saved[id] ?? "" : ""]),
  );
  const counts: Record<AllocationGroup, number> = {
    first_half: 0,
    second_half: 0,
    producer_choice: 0,
  };
  for (const id of uniqueIds) {
    const value = output[id];
    if (value) counts[value]++;
  }

  const remaining = shuffled(uniqueIds.filter((id) => !output[id]), random);
  for (const id of remaining) {
    const minimum = Math.min(...ALLOCATION_GROUPS.map((group) => counts[group]));
    const ties = ALLOCATION_GROUPS.filter((group) => counts[group] === minimum);
    const choice = ties[Math.floor(Math.max(0, Math.min(0.999999999, random())) * ties.length)]!;
    output[id] = choice;
    counts[choice]++;
  }
  return output;
}

export function fillUnallocatedDraft(
  ids: readonly string[],
  saved: Readonly<AllocationDraft>,
  group: AllocationGroup,
): AllocationDraft {
  return Object.fromEntries(ids.map((id) => [id, saved[id] || group]));
}

/** Move a row before the one the finger/mouse is currently hovering over. */
export function reorderRunningOrder(
  ids: readonly string[],
  draggedId: string,
  targetId: string,
): string[] {
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return ids as string[];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, draggedId);
  return next;
}
