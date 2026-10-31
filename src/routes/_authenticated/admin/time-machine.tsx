import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Clock3, History } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";

export const Route = createFileRoute("/_authenticated/admin/time-machine")({
  head: () => ({
    meta: [
      { title: "Time Machine — Solaris Organizer" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TimeMachinePage,
});

type HistoricalEvent = {
  id: string;
  occurredAt: string;
  type: string;
  entityType: string | null;
  entityId: string | null;
};

type AuditMarker = {
  id: number;
  createdAt: string;
  action: string;
  tableName: string;
  recordId: string | null;
};

type TimeMachineSnapshot = {
  edition: { id: string; name: string; editionNumber: number | null; status: string; published: boolean } | null;
  asOf: string;
  events: HistoricalEvent[];
  audit: AuditMarker[];
  evidenceStart: string | null;
  evidenceComplete: boolean;
};

type TimelineRow = {
  id: string;
  at: string;
  title: string;
  detail: string;
  source: "Contest event" | "Audit marker";
};

const TIME_MACHINE_EVENT_LIMIT = 250;
const TIME_MACHINE_AUDIT_LIMIT = 100;

function validateSnapshotScope(
  value: unknown,
  editionId: string,
  requestedAsOf: string,
): TimeMachineSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("Time Machine returned an invalid historical snapshot.");
  }

  const snapshot = value as Partial<TimeMachineSnapshot>;
  if (snapshot.edition?.id !== editionId) {
    throw new Error("Time Machine evidence did not match the selected Organizer edition.");
  }

  const requestedAt = Date.parse(requestedAsOf);
  const returnedAt = Date.parse(snapshot.asOf ?? "");
  if (!Number.isFinite(requestedAt) || !Number.isFinite(returnedAt) || returnedAt !== requestedAt) {
    throw new Error("Time Machine evidence did not match the requested historical instant.");
  }

  if (
    !Array.isArray(snapshot.events) ||
    !Array.isArray(snapshot.audit) ||
    typeof snapshot.evidenceComplete !== "boolean" ||
    (snapshot.evidenceStart !== null && typeof snapshot.evidenceStart !== "string")
  ) {
    throw new Error("Time Machine returned malformed historical evidence.");
  }

  return snapshot as TimeMachineSnapshot;
}

async function loadSnapshot(editionId: string, asOf: string) {
  const { data, error } = await (supabase as any).rpc("studio2_time_machine", {
    _edition_id: editionId,
    _as_of: asOf,
  });
  if (error) throw error;
  return validateSnapshotScope(data, editionId, asOf);
}

function snapshotRows(snapshot: TimeMachineSnapshot | null | undefined): TimelineRow[] {
  if (!snapshot) return [];
  return [
    ...snapshot.events.map((event) => ({
      id: `event:${event.id}`,
      at: event.occurredAt,
      title: event.type,
      detail: [event.entityType, event.entityId].filter(Boolean).join(" · "),
      source: "Contest event" as const,
    })),
    ...snapshot.audit.map((audit) => ({
      id: `audit:${audit.id}`,
      at: audit.createdAt,
      title: audit.action,
      detail: [audit.tableName, audit.recordId].filter(Boolean).join(" · "),
      source: "Audit marker" as const,
    })),
  ];
}

function snapshotMayBeTruncated(snapshot: TimeMachineSnapshot | null | undefined) {
  return Boolean(
    snapshot &&
      (snapshot.events.length >= TIME_MACHINE_EVENT_LIMIT ||
        snapshot.audit.length >= TIME_MACHINE_AUDIT_LIMIT),
  );
}

function TimeMachinePage() {
  const { editionId } = useAdminContext();
  const [asOf, setAsOf] = useState(() => new Date().toISOString());
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareAsOf, setCompareAsOf] = useState(() => new Date(Date.now() - 60 * 60 * 1000).toISOString());
  const feature = useQuery({
    enabled: Boolean(editionId),
    queryKey: ["studio2-feature", "time_machine", editionId ?? "none"],
    queryFn: () => isStudio2FeatureEnabled("time_machine", editionId),
    staleTime: 30_000,
  });

  useEffect(() => {
    const now = Date.now();
    setAsOf(new Date(now).toISOString());
    setCompareAsOf(new Date(now - 60 * 60 * 1000).toISOString());
    setCompareEnabled(false);
  }, [editionId]);

  const snapshot = useQuery({
    enabled: feature.data === true && Boolean(editionId),
    queryKey: ["time-machine", editionId ?? "none", asOf],
    queryFn: () => loadSnapshot(editionId!, asOf),
  });

  const comparisonSnapshot = useQuery({
    enabled: feature.data === true && Boolean(editionId) && compareEnabled,
    queryKey: ["time-machine-compare", editionId ?? "none", compareAsOf],
    queryFn: () => loadSnapshot(editionId!, compareAsOf),
  });

  const timeline = useMemo(
    () => snapshotRows(snapshot.data).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 300),
    [snapshot.data],
  );

  const comparison = useMemo(() => {
    if (!compareEnabled || !snapshot.data || !comparisonSnapshot.data) return null;
    const first = Date.parse(snapshot.data.asOf) <= Date.parse(comparisonSnapshot.data.asOf)
      ? snapshot.data
      : comparisonSnapshot.data;
    const second = first === snapshot.data ? comparisonSnapshot.data : snapshot.data;
    const firstIds = new Set(snapshotRows(first).map((row) => row.id));
    const changes = snapshotRows(second)
      .filter((row) => !firstIds.has(row.id))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return {
      from: first,
      to: second,
      changes,
      eventCount: changes.filter((row) => row.source === "Contest event").length,
      auditCount: changes.filter((row) => row.source === "Audit marker").length,
      truncated: snapshotMayBeTruncated(first) || snapshotMayBeTruncated(second),
    };
  }, [compareEnabled, comparisonSnapshot.data, snapshot.data]);

  if (!editionId) {
    return <AdminPage><AdminEmptyState icon={History} title="Select an edition" description="Time Machine reconstructs evidence for the currently selected Organizer edition." /></AdminPage>;
  }
  if (feature.isLoading) return <AdminPage><p className="text-sm text-muted-foreground">Loading Time Machine…</p></AdminPage>;
  if (feature.data !== true) {
    return <AdminPage><AdminEmptyState icon={History} title="Time Machine is disabled" description="The read-only historical reconstruction surface is installed but remains behind its rollout flag during verification." /></AdminPage>;
  }

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-4">
        <AdminPageHeader
          eyebrow="Historical evidence"
          title="Time Machine"
          description="Read-only reconstruction from recorded contest events and audit markers. Missing history stays missing; Solaris does not manufacture a suspiciously perfect past because a dashboard would look prettier."
        />

        <AdminCard strong>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            <label className="text-xs font-semibold text-muted-foreground">
              Reconstruct at
              <input
                type="datetime-local"
                value={toLocalInput(asOf)}
                onChange={(event) => setAsOf(new Date(event.target.value).toISOString())}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-white/[0.09] bg-black/15 px-3 text-sm text-foreground"
              />
            </label>
            {compareEnabled ? (
              <label className="text-xs font-semibold text-muted-foreground">
                Compare with
                <input
                  type="datetime-local"
                  value={toLocalInput(compareAsOf)}
                  onChange={(event) => setCompareAsOf(new Date(event.target.value).toISOString())}
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-white/[0.09] bg-black/15 px-3 text-sm text-foreground"
                />
              </label>
            ) : <div />}
            <div className="flex gap-2">
              <button type="button" onClick={() => setCompareEnabled((value) => !value)} className="min-h-11 rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 text-sm font-semibold hover:bg-white/[0.07]">
                {compareEnabled ? "Close diff" : "Compare snapshots"}
              </button>
              <button type="button" onClick={() => setAsOf(new Date().toISOString())} className="min-h-11 rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 text-sm font-semibold hover:bg-white/[0.07]">
                Now
              </button>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Comparison reads the same authoritative edition evidence twice and shows only recorded events and audit markers introduced between the two timestamps. It never writes or reconstructs missing history by inference.
          </p>
        </AdminCard>

        {compareEnabled ? (
          comparisonSnapshot.isLoading ? (
            <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Reconstructing comparison snapshot…</p></AdminCard>
          ) : comparisonSnapshot.error ? (
            <AdminCard><AdminStatus tone="blocked">{comparisonSnapshot.error instanceof Error ? comparisonSnapshot.error.message : "Comparison snapshot failed"}</AdminStatus></AdminCard>
          ) : comparison ? (
            <AdminCard strong>
              <AdminCardHeader
                eyebrow={comparison.truncated ? "Bounded diff" : "Authoritative diff"}
                title={comparison.truncated ? "Recorded changes within snapshot limits" : "Recorded changes between snapshots"}
                description={`${new Date(comparison.from.asOf).toLocaleString()} → ${new Date(comparison.to.asOf).toLocaleString()}`}
              />
              {comparison.truncated ? (
                <div className="mt-4">
                  <AdminStatus tone="attention">
                    At least one snapshot reached the RPC evidence limit ({TIME_MACHINE_EVENT_LIMIT} events or {TIME_MACHINE_AUDIT_LIMIT} audit markers). Counts below are observed rows, not a complete authoritative diff. Narrow the time range before treating them as exhaustive.
                  </AdminStatus>
                </div>
              ) : null}
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <SmallMetric label={comparison.truncated ? "Observed events" : "Contest events"} value={comparison.eventCount} />
                <SmallMetric label={comparison.truncated ? "Observed audit" : "Audit markers"} value={comparison.auditCount} />
                <SmallMetric label={comparison.truncated ? "Observed changes" : "Recorded changes"} value={comparison.changes.length} />
              </div>
              {!comparison.from.evidenceComplete || !comparison.to.evidenceComplete ? (
                <div className="mt-4"><AdminStatus tone="attention">At least one snapshot predates complete recorded evidence. The diff contains recorded changes only.</AdminStatus></div>
              ) : null}
              <div className="mt-4 space-y-2">
                {comparison.changes.length ? comparison.changes.slice(0, 300).map((row) => (
                  <TimelineItem key={row.id} row={row} />
                )) : (
                  <AdminEmptyState icon={Clock3} title="No recorded changes" description="No contest events or audit markers were recorded between these two timestamps." />
                )}
              </div>
            </AdminCard>
          ) : null
        ) : null}

        {snapshot.isLoading ? (
          <AdminCard><p className="py-10 text-center text-sm text-muted-foreground">Reconstructing recorded evidence…</p></AdminCard>
        ) : snapshot.error ? (
          <AdminCard><AdminStatus tone="blocked">{snapshot.error instanceof Error ? snapshot.error.message : "Historical reconstruction failed"}</AdminStatus></AdminCard>
        ) : snapshot.data ? (
          <>
            <section className="grid gap-3 sm:grid-cols-4">
              <Metric label="Edition" value={snapshot.data.edition?.editionNumber ? `SSC ${snapshot.data.edition.editionNumber}` : snapshot.data.edition?.name ?? "—"} />
              <Metric label="Contest events" value={snapshot.data.events.length.toString()} />
              <Metric label="Audit markers" value={snapshot.data.audit.length.toString()} />
              <Metric label="Evidence start" value={snapshot.data.evidenceStart ? new Date(snapshot.data.evidenceStart).toLocaleDateString() : "Unknown"} />
            </section>

            {snapshotMayBeTruncated(snapshot.data) ? (
              <AdminCard><AdminStatus tone="attention">This snapshot reached the bounded evidence limit. The timeline is a partial recorded window, not proof that no older rows exist before this snapshot boundary.</AdminStatus></AdminCard>
            ) : null}

            {!snapshot.data.evidenceComplete ? (
              <AdminCard><AdminStatus tone="attention">Historical evidence is incomplete before the first recorded event. This view therefore shows recorded history, not invented state.</AdminStatus></AdminCard>
            ) : null}

            <AdminCard>
              <AdminCardHeader eyebrow="Read-only timeline" title="Recorded state changes" description={`Evidence at or before ${new Date(snapshot.data.asOf).toLocaleString()}.`} />
              <div className="mt-4 space-y-2">
                {timeline.length ? timeline.map((row) => <TimelineItem key={row.id} row={row} />) : <AdminEmptyState icon={Clock3} title="No recorded evidence yet" description="No contest events or audit markers exist at or before this timestamp." />}
              </div>
            </AdminCard>
          </>
        ) : null}
      </div>
    </AdminPage>
  );
}

function TimelineItem({ row }: { row: TimelineRow }) {
  return (
    <div className="grid gap-2 rounded-xl border border-white/[0.07] bg-black/10 p-3 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-center">
      <span className="text-xs tabular-nums text-muted-foreground">{new Date(row.at).toLocaleString()}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{row.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.detail || "No entity metadata recorded"}</p>
      </div>
      <AdminStatus tone="neutral">{row.source}</AdminStatus>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <AdminCard><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></AdminCard>;
}

function SmallMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold tabular-nums">{value}</p></div>;
}

function toLocalInput(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
