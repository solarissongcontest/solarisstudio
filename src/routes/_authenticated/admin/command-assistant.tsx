import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { matchSolarisAssistantCommands } from "@/lib/solaris-command-assistant";
import { isStudio2FeatureEnabled } from "@/lib/studio2-feature-flags";

export const Route = createFileRoute("/_authenticated/admin/command-assistant")({
  head: () => ({
    meta: [
      { title: "Command Assistant — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CommandAssistantPage,
});

type EditionSnapshot = {
  participants: number;
  missingSong: number;
  unpublishedEntries: number;
  openIncidents: number;
};

function CommandAssistantPage() {
  const { editionId } = useAdminContext();
  const [prompt, setPrompt] = useState("");
  const feature = useQuery({
    queryKey: ["studio2-feature", "solaris_command_assistant"],
    queryFn: () => isStudio2FeatureEnabled("solaris_command_assistant"),
    staleTime: 30_000,
  });

  const snapshot = useQuery({
    enabled: feature.data === true && Boolean(editionId),
    queryKey: ["command-assistant-snapshot", editionId],
    queryFn: async (): Promise<EditionSnapshot> => {
      const [participants, missingSong, unpublishedEntries, incidents] = await Promise.all([
        (supabase as any).from("participants").select("id", { count: "exact", head: true }).eq("edition_id", editionId),
        (supabase as any).from("participants").select("id", { count: "exact", head: true }).eq("edition_id", editionId).is("song", null),
        (supabase as any).from("participants").select("id", { count: "exact", head: true }).eq("edition_id", editionId).neq("publication_status", "published"),
        (supabase as any).from("studio2_incidents").select("id", { count: "exact", head: true }).eq("edition_id", editionId).neq("status", "resolved"),
      ]);
      for (const response of [participants, missingSong, unpublishedEntries, incidents]) {
        if (response.error) throw response.error;
      }
      return {
        participants: participants.count ?? 0,
        missingSong: missingSong.count ?? 0,
        unpublishedEntries: unpublishedEntries.count ?? 0,
        openIncidents: incidents.count ?? 0,
      };
    },
  });

  const matches = useMemo(() => matchSolarisAssistantCommands(prompt), [prompt]);

  if (feature.isLoading) {
    return <AdminPage><p className="text-sm text-muted-foreground">Loading Command Assistant…</p></AdminPage>;
  }
  if (feature.data !== true) {
    return (
      <AdminPage>
        <AdminEmptyState
          icon={Sparkles}
          title="Command Assistant is disabled"
          description="The read-only command registry is installed, but its rollout flag remains off until verification is complete."
        />
      </AdminPage>
    );
  }

  return (
    <AdminPage>
      <div className="mx-auto max-w-5xl space-y-4">
        <AdminPageHeader
          eyebrow="Organizer command layer"
          title="Solaris Command Assistant"
          description="Read-only first: natural wording is matched to a fixed command registry and existing Solaris workspaces. It cannot generate arbitrary SQL, bypass permissions or silently execute a write."
        />

        <AdminCard strong>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Ask Solaris</span>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Show SSC entries still missing a song"
                className="min-h-12 w-full rounded-xl border border-white/[0.09] bg-black/15 pl-10 pr-3 text-sm outline-none focus:border-sky-300/30"
              />
            </div>
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            Requests are matched locally against registered operations. Human beings have, against all odds, been denied a natural-language DELETE FROM production button.
          </p>
        </AdminCard>

        {editionId ? (
          <AdminCard>
            <AdminCardHeader eyebrow="Current edition" title="Bounded live summary" description="A small read-only status projection, not model guesswork." />
            {snapshot.isLoading ? (
              <p className="text-sm text-muted-foreground">Reading canonical state…</p>
            ) : snapshot.error ? (
              <AdminStatus tone="blocked">{snapshot.error instanceof Error ? snapshot.error.message : "Could not load edition state"}</AdminStatus>
            ) : snapshot.data ? (
              <div className="grid gap-3 sm:grid-cols-4">
                <Metric label="Participants" value={snapshot.data.participants} />
                <Metric label="Missing song" value={snapshot.data.missingSong} tone={snapshot.data.missingSong ? "attention" : "ready"} />
                <Metric label="Unpublished entries" value={snapshot.data.unpublishedEntries} />
                <Metric label="Open incidents" value={snapshot.data.openIncidents} tone={snapshot.data.openIncidents ? "attention" : "ready"} />
              </div>
            ) : null}
          </AdminCard>
        ) : (
          <AdminCard><AdminStatus tone="attention">Select an edition to load operational context.</AdminStatus></AdminCard>
        )}

        <AdminCard>
          <AdminCardHeader eyebrow="Registered commands" title={prompt ? "Best matches" : "Available read-only workflows"} />
          <div className="space-y-2">
            {matches.length ? matches.map((command) => (
              <Link
                key={command.id}
                to={command.route as any}
                className="block rounded-xl border border-white/[0.08] bg-black/10 p-4 transition hover:bg-white/[0.04]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{command.label}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{command.description}</p>
                  </div>
                  <AdminStatus tone="info">Read-only navigation</AdminStatus>
                </div>
                {command.capability ? <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Capability context: {command.capability}</p> : null}
              </Link>
            )) : (
              <AdminEmptyState icon={Search} title="No registered command matched" description="Try a status, results, voting, confirmation, Inbox or Integrity request. Unknown wording is not converted into an invented database operation." />
            )}
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "ready" | "attention" }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-2xl font-bold tabular-nums">{value}</span>
        {tone !== "neutral" ? <AdminStatus tone={tone}>{tone === "ready" ? "Clear" : "Review"}</AdminStatus> : null}
      </div>
    </div>
  );
}
