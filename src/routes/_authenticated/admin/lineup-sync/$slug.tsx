import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, ClipboardCheck, ListOrdered, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { FlagChip } from "@/components/FlagChip";
import { AdminCard, AdminCardHeader, AdminEmptyState, AdminPageHeader, AdminStatus } from "@/components/admin/AdminUI";
import { addCountriesToShow } from "@/lib/admin-lineup.functions";
import { editionLabel, useCountries, useEdition, useParticipants, useShows, type Participant } from "@/lib/data";
import { DEFAULT_ACCENT } from "@/lib/entities";

type ParticipantWithStatus = Participant & { participation_status?: string | null };

export const Route = createFileRoute("/_authenticated/admin/lineup-sync/$slug")({
  head: ({ params }) => ({ meta: [{ title: `${params.slug} confirmed countries — Solaris Studio` }, { name: "robots", content: "noindex" }] }),
  component: LineupSyncPage,
});

function LineupSyncPage() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const addToShow = useServerFn(addCountriesToShow);
  const { data: edition, isLoading: loadingEdition } = useEdition(slug);
  const { data: shows = [] } = useShows(edition?.id);
  const { data: participants = [] } = useParticipants(edition?.id);
  const { data: countries = [] } = useCountries();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const orderedShows = useMemo(() => [...shows].sort((a, b) => a.sort_order - b.sort_order), [shows]);
  const canonical = useMemo(
    () => participants.filter((participant) => {
      const status = (participant as ParticipantWithStatus).participation_status;
      return participant.show_id === null && Boolean(participant.country_id) && status === "confirmed";
    }),
    [participants],
  );
  const memberships = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const participant of participants) {
      if (!participant.country_id || !participant.show_id) continue;
      const set = map.get(participant.country_id) ?? new Set<string>();
      set.add(participant.show_id);
      map.set(participant.country_id, set);
    }
    return map;
  }, [participants]);
  const countryMap = useMemo(() => new Map(countries.map((country) => [country.id, country])), [countries]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["participants"] });
  }

  async function addMany(showId: string, countryIds: string[], key: string) {
    if (!edition || !countryIds.length) return;
    setBusyKey(key);
    try {
      const result = await addToShow({ data: { editionId: edition.id, showId, countryIds } });
      toast.success(`${result.added} added to ${result.showName}${result.refreshed ? ` · ${result.refreshed} refreshed` : ""}`);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Line-up could not be updated.");
    } finally {
      setBusyKey(null);
    }
  }

  if (loadingEdition) return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading confirmed countries…</p></AdminCard>;
  if (!edition) return <AdminCard><AdminEmptyState title="Edition not found" description="Choose another edition from the organizer workspace." /></AdminCard>;

  return (
    <div className="admin-page pb-5">
      <AdminPageHeader
        eyebrow={editionLabel(edition)}
        title="Sync confirmed countries to shows"
        description="Every confirmed country exists once for the edition. Add that same entry to any show with one click, including its artist, song and listening links."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/confirmations/admin/sync" className="admin-action-primary"><ClipboardCheck className="size-4" /> Sync confirmation waves</Link>
            <Link to="/admin/$slug" params={{ slug }} className="admin-action-secondary"><ArrowLeft className="size-4" /> Edition</Link>
          </div>
        }
      />

      {!orderedShows.length ? (
        <AdminCard><AdminEmptyState icon={ListOrdered} title="No shows yet" description="Create the edition shows before building their line-ups." action={<Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary">Create shows</Link>} /></AdminCard>
      ) : (
        <>
          <AdminCard strong className="mb-4">
            <AdminCardHeader
              eyebrow="Confirmed edition countries"
              title={`${canonical.length} ready to place`}
              description="Use the show cards below to add every missing confirmed country at once. Or use the country list to add countries individually."
              action={<AdminStatus tone={canonical.length ? "ready" : "attention"}>{canonical.length ? "Ready" : "Sync Confirmations first"}</AdminStatus>}
            />
          </AdminCard>

          <div className="mb-4 grid gap-3 md:grid-cols-2">
            {orderedShows.map((show) => {
              const inShow = canonical.filter((participant) => memberships.get(participant.country_id)?.has(show.id)).length;
              const missing = canonical.filter((participant) => !memberships.get(participant.country_id)?.has(show.id));
              const key = `all:${show.id}`;
              return (
                <AdminCard key={show.id} strong>
                  <AdminCardHeader
                    eyebrow={show.kind.replaceAll("-", " ")}
                    title={show.name}
                    description={`${inShow}/${canonical.length} confirmed edition countries are currently in this show.`}
                    action={<AdminStatus tone={missing.length ? "attention" : "ready"}>{missing.length ? `${missing.length} missing` : "Complete"}</AdminStatus>}
                  />
                  <button
                    type="button"
                    className="admin-action-primary w-full"
                    disabled={!missing.length || busyKey !== null}
                    onClick={() => void addMany(show.id, missing.map((participant) => participant.country_id), key)}
                  >
                    <RefreshCw className={busyKey === key ? "size-4 animate-spin" : "size-4"} />
                    {busyKey === key ? "Adding confirmed countries…" : missing.length ? `Add all ${missing.length} confirmed countries` : "All confirmed countries added"}
                  </button>
                </AdminCard>
              );
            })}
          </div>

          <AdminCard>
            <AdminCardHeader
              eyebrow="Countries"
              title={`${canonical.length} confirmed edition entries`}
              description="A checked show means the country already appears there. An unchecked show button adds the same edition entry without creating another participation."
            />
            {!canonical.length ? (
              <AdminEmptyState title="No confirmed edition entries yet" description="Sync Confirmations first, then they will appear here automatically." action={<Link to="/confirmations/admin/sync" className="admin-action-primary">Sync confirmation waves</Link>} />
            ) : (
              <div className="divide-y divide-white/[0.07]">
                {canonical.map((participant) => {
                  const country = countryMap.get(participant.country_id);
                  return (
                    <div key={participant.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex min-w-0 items-center gap-3">
                        <FlagChip code={country?.short_code ?? "?"} color={country?.accent_color ?? DEFAULT_ACCENT} image={country?.flag_image ?? null} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{country?.name ?? "Unknown country"}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {participant.artist && participant.song ? `${participant.artist} · ${participant.song}` : "Entry details pending"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 pl-0 sm:pl-12">
                        {orderedShows.map((show) => {
                          const present = memberships.get(participant.country_id)?.has(show.id) ?? false;
                          const key = `${participant.country_id}:${show.id}`;
                          return (
                            <button
                              key={show.id}
                              type="button"
                              disabled={present || busyKey !== null}
                              onClick={() => void addMany(show.id, [participant.country_id], key)}
                              className={present ? "admin-action-secondary !min-h-9 !px-3 opacity-80" : "admin-action-primary !min-h-9 !px-3"}
                            >
                              {present ? <Check className="size-3.5" /> : null}
                              {present ? show.name : `Add to ${show.name}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </AdminCard>
        </>
      )}
    </div>
  );
}
