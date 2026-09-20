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
      { name: "robots", content: "noindex" },
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

function TimeMachinePage() {
  const { editionId } = useAdminContext();
  const [asOf, setAsOf] = useState(() => new Date().toISOString());
  const feature = useQuery({
    queryKey: ["studio2-feature", "time_machine"],
    queryFn: () => isStudio2FeatureEnabled("time_machine"),
    staleTime: 30_000,
  });

  useEffect(() => {
    setAsOf(new Date().toISOString());
  }, [editionId]);

  const snapshot = useQuery({
    enabled: feature.data === true && Boolean(editionId),
    queryKey: ["time-machine", editionId, asOf],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("studio2_time_machine", {
        _edition_id: editionId,
        _as_of: asOf,
      });
      if (error) throw error;
      return data as TimeMachineSnapshot;
    },
  });

  const timeline = useMemo(() => {
    const rows = [
      ...(snapshot.data?.events ?? []).map((event) => ({ id: `event:${event.id}`, at: event.occurredAt, title: event.type, detail: [event.entityType, event.entityId].filter(Boolean).join(" · "), source: "Contest event" })),
      ...(snapshot.data?.audit ?? []).map((audit) => ({ id: `audit:${audit.id}`, at: audit.createdAt, title: audit.action, detail: [audit.tableName, audit.recordId].filter(Boolean).join(" · "), source: "Audit marker" })),
    ];
    return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 300);
  }, [snapshot.data]);

  if (feature.isLoading) return <AdminPage><p className="text-sm text-muted-foreground">Loading Time Machine…</p></AdminPage>;
  if (feature.data !== true) {
    return <AdminPage><AdminEmptyState icon={History} title="Time Machine is disabled" description="The read-only historical reconstruction surface is installed but remains behind its rollout flag during verification." /></AdminPage>;
  }
  if (!editionId) {
    return <AdminPage><AdminEmptyState icon={History} title="Select an edition" description="Time Machine reconstructs evidence for the currently selected Organizer edition." /></AdminPage>;
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
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="text-xs font-semibold text-muted-foreground">
              Reconstruct at
              <input
                type="datetime-local"
                value={toLocalInput(asOf)}
                onChange={(event) => setAsOf(new Date(event.target.value).toISOString())}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-white/[0.09] bg-black/15 px-3 text-sm text-foreground"
              />
            </label>
            <button type="button" onClick={() => setAsOf(new Date().toISOString())} className="min-h-11 rounded-xl border border-white/[0.09] bg-white/[0.035] px-4 text-sm font-semibold hover:bg-white/[0.07]">
              Current time
            </button>
          </div>
        </AdminCard>

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

            {!snapshot.data.evidenceComplete ? (
              <AdminCard><AdminStatus tone="attention">Historical evidence is incomplete before the first recorded event. This view therefore shows recorded history, not invented state.</AdminStatus></AdminCard>
            ) : null}

            <AdminCard>
              <AdminCardHeader eyebrow="Read-only timeline" title="Recorded state changes" description={`Evidence at or before ${new Date(snapshot.data.asOf).toLocaleString()}.`} />
              <div className="mt-4 space-y-2">
                {timeline.length ? timeline.map((row) => (
                  <div key={row.id} className="grid gap-2 rounded-xl border border-white/[0.07] bg-black/10 p-3 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-center">
                    <span className="text-xs tabular-nums text-muted-foreground">{new Date(row.at).toLocaleString()}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{row.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{row.detail || "No entity metadata recorded"}</p>
                    </div>
                    <AdminStatus tone="neutral">{row.source}</AdminStatus>
                  </div>
                )) : <AdminEmptyState icon={Clock3} title="No recorded evidence yet" description="No contest events or audit markers exist at or before this timestamp." />}
              </div>
            </AdminCard>
          </>
        ) : null}
      </div>
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <AdminCard><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p><p className="mt-2 text-lg font-bold">{value}</p></AdminCard>;
}

function toLocalInput(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
