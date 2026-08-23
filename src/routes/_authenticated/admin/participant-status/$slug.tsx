import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, ShieldX, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import { AdminCard, AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { FlagChip } from "@/components/FlagChip";
import { supabase } from "@/integrations/supabase/client";
import {
  editionLabel,
  useContestEntities,
  useCountries,
  useEdition,
  useParticipants,
  useShows,
  type Participant,
} from "@/lib/data";
import { DEFAULT_ACCENT, entityDisplayMap } from "@/lib/entities";
import {
  participationStatus,
  participationStatusLabel,
  type ParticipationAwareParticipant,
  type ParticipationStatus,
} from "@/lib/participation-status";

export const Route = createFileRoute("/_authenticated/admin/participant-status/$slug")({
  head: () => ({ meta: [{ title: "Participation status — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: ParticipantStatusWorkspace,
});

type StatusGroup = {
  key: string;
  rows: ParticipationAwareParticipant[];
  status: ParticipationStatus;
  countryId: string | null;
  contestEntityId: string | null;
};

function ParticipantStatusWorkspace() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const { data: edition, isLoading } = useEdition(slug);
  const { data: participants = [] } = useParticipants(edition?.id);
  const { data: countries = [] } = useCountries();
  const { data: entities = [] } = useContestEntities(edition?.id);
  const { data: shows = [] } = useShows(edition?.id);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const displays = useMemo(() => entityDisplayMap(entities, countries), [entities, countries]);
  const countryIds = useMemo(() => new Set(countries.map((country) => country.id)), [countries]);
  const showNames = useMemo(() => new Map(shows.map((show) => [show.id, show.name])), [shows]);

  const groups = useMemo<StatusGroup[]>(() => {
    const byIdentity = new Map<string, ParticipationAwareParticipant[]>();
    for (const row of participants as ParticipationAwareParticipant[]) {
      const key = row.country_id;
      byIdentity.set(key, [...(byIdentity.get(key) ?? []), row]);
    }

    return [...byIdentity.entries()]
      .map(([key, rows]) => {
        const status = rows.some((row) => participationStatus(row) === "disqualified")
          ? "disqualified"
          : rows.some((row) => participationStatus(row) === "withdrawn")
            ? "withdrawn"
            : "confirmed";
        const sample = rows[0];
        const global = countryIds.has(sample.country_id);
        return {
          key,
          rows,
          status,
          countryId: global ? sample.country_id : null,
          contestEntityId: global ? sample.contest_entity_id : (sample.contest_entity_id ?? sample.country_id),
        };
      })
      .sort((a, b) => {
        const aName = displays.get(a.key)?.name ?? a.key;
        const bName = displays.get(b.key)?.name ?? b.key;
        return aName.localeCompare(bName, undefined, { sensitivity: "base" });
      });
  }, [participants, countryIds, displays]);

  async function setStatus(group: StatusGroup, status: ParticipationStatus) {
    if (!edition || group.status === status) return;
    setBusyKey(group.key);
    try {
      const { error } = await (supabase as any).rpc("admin_set_participation_status", {
        _edition_id: edition.id,
        _country_id: group.countryId,
        _contest_entity_id: group.contestEntityId,
        _status: status,
      });
      if (error) throw error;

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["participants"] }),
        qc.invalidateQueries({ queryKey: ["public-participants"] }),
        qc.invalidateQueries({ queryKey: ["results"] }),
      ]);
      toast.success(`${displays.get(group.key)?.name ?? "Country"} marked ${participationStatusLabel(status).toLowerCase()}`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Participation status could not be changed");
    } finally {
      setBusyKey(null);
    }
  }

  if (isLoading) {
    return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading participation statuses…</p></AdminCard>;
  }

  if (!edition) {
    return <AdminCard><AdminEmptyState icon={Ban} title="Edition not found" description="Choose another edition from the organizer workspace." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={editionLabel(edition)}
        title="Participation status"
        description="Mark a country active, withdrawn or disqualified. Withdrawn and disqualified countries stay in the published participant list but are excluded from public scoreboards and result statistics."
      />

      <Link to="/admin/$slug" params={{ slug }} className="admin-action-quiet mb-4 inline-flex"><ArrowLeft className="size-4" /> Edition home</Link>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Metric label="Active" value={groups.filter((group) => group.status === "confirmed").length} />
        <Metric label="Withdrawn" value={groups.filter((group) => group.status === "withdrawn").length} />
        <Metric label="Disqualified" value={groups.filter((group) => group.status === "disqualified").length} />
      </div>

      {!groups.length ? (
        <AdminCard><AdminEmptyState icon={Ban} title="No participants yet" description="Build a show line-up first. Countries will appear here automatically." action={<Link to="/admin/entries/$slug" params={{ slug }} className="admin-action-primary">Open entries</Link>} /></AdminCard>
      ) : (
        <AdminCard className="!p-0 overflow-hidden">
          <div className="divide-y divide-white/[0.07]">
            {groups.map((group) => {
              const display = displays.get(group.key);
              const showList = [...new Set(group.rows.map((row) => row.show_id ? showNames.get(row.show_id) : null).filter(Boolean))];
              const busy = busyKey === group.key;
              return (
                <div key={group.key} className="p-3 sm:p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <FlagChip code={display?.short_code ?? "?"} color={display?.accent_color ?? DEFAULT_ACCENT} image={display?.flag_image ?? null} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{display?.name ?? "Unknown country"}</p>
                        <AdminStatus tone={group.status === "confirmed" ? "ready" : group.status === "withdrawn" ? "attention" : "danger" as any}>
                          {participationStatusLabel(group.status)}
                        </AdminStatus>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{showList.length ? showList.join(" · ") : `${group.rows.length} edition record${group.rows.length === 1 ? "" : "s"}`}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button type="button" disabled={busy || group.status === "confirmed"} onClick={() => void setStatus(group, "confirmed")} className="admin-action-secondary !min-h-10 !px-2"><UserCheck className="size-3.5" /> Active</button>
                    <button type="button" disabled={busy || group.status === "withdrawn"} onClick={() => void setStatus(group, "withdrawn")} className="admin-action-secondary !min-h-10 !px-2"><Ban className="size-3.5" /> Withdrawn</button>
                    <button type="button" disabled={busy || group.status === "disqualified"} onClick={() => void setStatus(group, "disqualified")} className="admin-action-secondary !min-h-10 !px-2"><ShieldX className="size-3.5" /> Disqualified</button>
                  </div>
                </div>
              );
            })}
          </div>
        </AdminCard>
      )}
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}
