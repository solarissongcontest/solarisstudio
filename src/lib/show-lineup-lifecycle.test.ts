import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const syncSource = source("src/lib/admin-lineup.functions.ts");
const workspace = source("src/components/admin/ShowLineupWorkspace.tsx");
const publicShow = source("src/routes/shows/$showId.tsx");
const migration = source("supabase/migrations/20260821193132_show_lineup_lifecycle.sql");
const atomicAllocation = source("supabase/migrations/20260919163323_atomic_show_allocation_draw.sql");
const s14RunningOrders = source(".github/scripts/v3-s14-stage-5-running-orders.sh");

describe("show line-up lifecycle", () => {
  it("never invents a running order when syncing confirmed countries", () => {
    expect(syncSource).toContain("running_order: null");
    expect(syncSource).toContain("running_order_allocation: null");
    expect(syncSource).not.toContain("let nextOrder");
  });

  it("models line-up, allocation draw and running order as separate stages", () => {
    expect(migration).toContain("'lineup', 'allocation', 'running_order'");
    expect(migration).toContain("running_order_allocation");
    expect(workspace).toContain('type LineupStage = "lineup" | "allocation" | "running_order"');
    expect(workspace).toContain('first_half: "First half"');
    expect(workspace).toContain('second_half: "Second half"');
    expect(workspace).toContain('producer_choice: "Producer choice"');
  });

  it("migrates active-only atomic allocation and order RPCs", () => {
    const activeMigration = source("supabase/migrations/20261121203500_live_lineup_excludes_inactive_participants.sql");
    expect(activeMigration).toContain("every active show participant exactly once.");
    expect(activeMigration).toContain("coalesce(p.participation_status, 'confirmed') = 'confirmed'");
    expect(activeMigration).toContain("p.running_order is distinct from");
    expect(activeMigration).toContain("p.running_order_allocation is distinct from");
  });

  it("preserves a deep-linked show while the show list is loading", () => {
    expect(workspace).toContain('const [showId, setShowId] = useState(initialShow ?? "");');
    expect(workspace).toContain("if (!orderedShows.length) return;");
    expect(workspace).not.toContain(
      'if (!orderedShows.length) {\\n      setShowId("");',
    );
    expect(workspace).toContain(
      "initialShow && orderedShows.some((show) => show.id === initialShow)",
    );
  });

  it("keeps pre-order stages alphabetical and position-free", () => {
    expect(workspace).toContain("stage === \"running_order\" ? runningDraftParticipants : alphaParticipants");
    expect(workspace).toContain("Position numbers are intentionally hidden.");
    expect(workspace).toContain("No running order exists yet.");
  });

  it("excludes historical inactive show rows from editable active allocation and order", () => {
    expect(workspace).toContain("(showParticipants as LifecycleParticipant[]).filter(isCompetingParticipant)");
    expect(workspace).toContain("(showParticipants as LifecycleParticipant[]).map(participantKey)");
  });

  it("opens running order directly without forcing a draw for active entries", () => {
    expect(workspace).toContain("const allocationComplete = lifecycleParticipants.length > 0 && allocatedCount === lifecycleParticipants.length");
    expect(workspace).toContain("if (!activeShow || !lifecycleParticipants.length) return");
    expect(workspace).toContain('rpc("admin_open_show_running_order"');
    expect(workspace).toContain("Edit running order without completing allocation");
    expect(workspace).not.toContain('await setStage("running_order")');
  });

  it("offers balanced random/bulk assignment without writing until save", () => {
    expect(workspace).toContain('randomizeAllocation("all")');
    expect(workspace).toContain('randomizeAllocation("unassigned")');
    expect(workspace).toContain("fillUnallocated(group)");
    expect(workspace).toContain("Random balanced draw");
    expect(workspace).toContain("Randomize blanks");
    expect(workspace).toContain("allocationCounts[group]");
    expect(workspace).toContain("setAllocationDirty(true)");
    expect(workspace).toContain("snapshotAllocationDraft()");
  });

  it("uses touch and pointer dragging with stable draft positions", () => {
    expect(workspace).toContain("onPointerDown={(event) => startRunningOrderDrag(event, participant.id)}");
    expect(workspace).toContain("onPointerMove={moveRunningOrderDrag}");
    expect(workspace).toContain("onPointerUp={finishRunningOrderDrag}");
    expect(workspace).toContain('document.elementFromPoint(event.clientX, event.clientY)');
    expect(workspace).toContain("reorderRunningOrder(current, drag.id, targetId)");
    expect(workspace).toContain("touch-none cursor-grab");
    expect(workspace).toContain("onKeyDown={(event) => {");
    expect(workspace).toContain("{index + 1}</span>");
    expect(workspace).toContain("onClick={() => moveEntry(index, -1)}");
  });

  it("resets an allocation draw only for live show participants", () => {
    expect(workspace).toContain('.in("id", lifecycleParticipants.map((participant) => participant.id))');
  });

  it("runs the full contest rehearsal against active-only allocation and ordering", () => {
    expect(s14RunningOrders).toContain("and coalesce(participation_status, 'confirmed') = 'confirmed'");
    expect(s14RunningOrders).toContain("participation_status.is.null,participation_status.eq.confirmed");
  });

  it("keeps allocation and running-order edits local until one atomic save", () => {
    expect(workspace).toContain("allocationDraft");
    expect(workspace).toContain("runningOrderDraft");
    expect(workspace).toContain('rpc("admin_set_show_allocations"');
    expect(workspace).toContain('rpc("admin_set_show_running_order"');
    expect(workspace).toContain("Unsaved running-order changes");
    expect(atomicAllocation).toContain("studio2_access_allowed('entry.edit'");
    expect(atomicAllocation).toContain("Allocation draw must contain every show participant exactly once.");
  });

  it("keeps inactive entries off the live published performance order", () => {
    expect(publicShow).toContain("const rows = participantRows.filter(isCompetingParticipant)");
    expect(publicShow).toContain("value={participantRows.filter(isCompetingParticipant).length}");
    expect(publicShow).toContain("publicLineupParticipants.map((participant, index)");
    expect(publicShow).toContain("{index + 1}");
  });

  it("keeps the public pre-order line-up alphabetical and unnumbered", () => {
    expect(publicShow).toContain("publicLineupParticipants");
    expect(publicShow).toContain("if (!publication.running_order) return rows.sort(byCountryName)");
    expect(publicShow).toContain('title={publication.running_order ? "Running order" : "Alphabetical line-up"}');
    expect(publicShow).toContain("The running order has not been published yet.");
    expect(publicShow).not.toContain('publication.running_order ? (participant.running_order ?? "—") : index + 1');
  });
});
