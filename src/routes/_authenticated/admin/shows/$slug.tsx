import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Calculator, Clock3, ExternalLink, Globe2, ListChecks, ListOrdered, MoreHorizontal, Plus, RadioTower, Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminActionItem,
  AdminCard,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { getMergedTelevotingRoundsPage } from "@/integrations/televoting/rounds.functions";
import { resolveBroadcast, type ShowModeManualPhase } from "@/lib/broadcast";
import { editionLabel, useEdition, useParticipants, useShows, type Show } from "@/lib/data";
import { DEFAULT_PUBLICATION_CONFIG, hasAnyPublicInformation, resolveShowPublication } from "@/lib/publication";
import {
  safeShowModeYoutubeUrl,
  transitionShowModePhase,
} from "@/lib/show-mode";

export const Route = createFileRoute("/_authenticated/admin/shows/$slug")({
  head: () => ({ meta: [{ title: "Shows — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: ShowsWorkspace,
});

const SHOW_KIND_OPTIONS = [
  "heat",
  "semi-final",
  "second-chance",
  "grand-final",
  "special",
  "other",
] as const;

type ShowDraft = {
  id?: string;
  name: string;
  kind: (typeof SHOW_KIND_OPTIONS)[number];
  sort_order: number;
};

type ShowModeDraft = {
  phase: ShowModeManualPhase;
  scheduledStart: string;
  youtubeUrl: string;
  televoteRoundId: string;
};

const emptyDraft: ShowDraft = { name: "", kind: "semi-final", sort_order: 1 };

const emptyShowModeDraft: ShowModeDraft = {
  phase: "scheduled",
  scheduledStart: "",
  youtubeUrl: "",
  televoteRoundId: "",
};

function isoToLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function localInputToIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function ShowsWorkspace() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const getRoundsPage = useServerFn(getMergedTelevotingRoundsPage);
  const { data: edition, isLoading: loadingEdition } = useEdition(slug);
  const { data: shows = [], isLoading: loadingShows } = useShows(edition?.id);
  const { data: participants = [] } = useParticipants(edition?.id);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<ShowDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Show | null>(null);
  const [actionsTarget, setActionsTarget] = useState<Show | null>(null);
  const [showModeTarget, setShowModeTarget] = useState<Show | null>(null);
  const [showModeDraft, setShowModeDraft] = useState<ShowModeDraft>(emptyShowModeDraft);

  const roundsQuery = useQuery({
    enabled: Boolean(edition?.id),
    queryKey: ["admin-show-mode-televoting-rounds", edition?.id ?? "none"],
    queryFn: () => getRoundsPage({ data: { editionId: edition!.id } }),
    staleTime: 30_000,
  });

  const orderedShows = useMemo(() => [...shows].sort((a, b) => a.sort_order - b.sort_order), [shows]);
  const canonicalEntries = participants.filter((participant) => participant.show_id == null);
  const logicalEntries = canonicalEntries.length
    ? canonicalEntries
    : [...new Map(
        participants.map((participant) => [
          participant.contest_entity_id ?? participant.country_id,
          participant,
        ] as const),
      ).values()];

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["shows"] }),
      qc.invalidateQueries({ queryKey: ["participants"] }),
      qc.invalidateQueries({ queryKey: ["edition"] }),
    ]);
  }

  function openCreate() {
    setDraft({ ...emptyDraft, sort_order: (orderedShows.at(-1)?.sort_order ?? 0) + 1 });
    setSheetOpen(true);
  }

  function openEdit(show: Show) {
    setDraft({ id: show.id, name: show.name, kind: show.kind as ShowDraft["kind"], sort_order: show.sort_order });
    setSheetOpen(true);
  }

  function openShowMode(show: Show) {
    const config = resolveBroadcast(show.broadcast_config).showMode;
    setShowModeTarget(show);
    setShowModeDraft({
      phase: config.phase,
      scheduledStart: isoToLocalInput(config.scheduledStart),
      youtubeUrl: config.youtubeUrl,
      televoteRoundId: config.televoteRoundId ?? "",
    });
  }

  async function saveShowMode() {
    if (!showModeTarget) return;

    const youtubeUrl = showModeDraft.youtubeUrl.trim();
    const safeYoutube = youtubeUrl ? safeShowModeYoutubeUrl(youtubeUrl) : null;
    if (youtubeUrl && !safeYoutube) {
      toast.error("Use a valid HTTPS YouTube or youtu.be URL.");
      return;
    }

    const scheduledStart = localInputToIso(showModeDraft.scheduledStart);
    if (showModeDraft.scheduledStart && !scheduledStart) {
      toast.error("Choose a valid scheduled start time.");
      return;
    }

    setBusy(true);
    try {
      const raw =
        showModeTarget.broadcast_config &&
        typeof showModeTarget.broadcast_config === "object"
          ? showModeTarget.broadcast_config
          : {};
      const current = resolveBroadcast(raw).showMode;
      const transitioned = transitionShowModePhase(current, showModeDraft.phase);
      const nextShowMode = {
        ...transitioned,
        scheduledStart,
        youtubeUrl: safeYoutube ?? "",
        televoteRoundId: showModeDraft.televoteRoundId || null,
      };

      const { error } = await (supabase.from("shows") as any)
        .update({
          broadcast_config: {
            ...raw,
            showMode: nextShowMode,
          },
        })
        .eq("id", showModeTarget.id);
      if (error) throw error;

      toast.success("Show Mode companion updated");
      setShowModeTarget(null);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Show Mode could not be updated");
    } finally {
      setBusy(false);
    }
  }

  async function saveShow() {
    if (!edition || !draft.name.trim()) return;
    setBusy(true);
    try {
      if (draft.id) {
        const { error } = await (supabase.from("shows") as any)
          .update({ name: draft.name.trim(), kind: draft.kind, sort_order: draft.sort_order })
          .eq("id", draft.id);
        if (error) throw error;
        toast.success("Show updated");
      } else {
        const { error } = await supabase.from("shows").insert({
          edition_id: edition.id,
          name: draft.name.trim(),
          kind: draft.kind,
          sort_order: draft.sort_order,
          published: false,
          publication_config: DEFAULT_PUBLICATION_CONFIG,
        });
        if (error) throw error;
        toast.success("Show created");
      }
      setSheetOpen(false);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Show could not be saved");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(show: Show) {
    setBusy(true);
    try {
      const { error } = await (supabase.from("shows") as any).update({ published: !show.published }).eq("id", show.id);
      if (error) throw error;
      toast.success(show.published ? "Show made private" : "Show route published");
      setActionsTarget(null);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Publication state could not be changed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteShow() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("shows").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success(`${deleteTarget.name} deleted`);
      setDeleteTarget(null);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Show could not be deleted");
    } finally {
      setBusy(false);
    }
  }

  if (loadingEdition || loadingShows) {
    return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading shows…</p></AdminCard>;
  }

  if (!edition) {
    return <AdminCard><AdminEmptyState icon={ListChecks} title="Edition not found" description="Return to the edition workspace and choose another edition." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={editionLabel(edition)}
        title="Shows"
        description="Create the contest stages and keep their basic identity clear. Heat → Semi-Final → Grand Final progression is supported, and Second Chance can feed eliminated heat entries back into the semi-final."
        actions={<button type="button" className="admin-action-primary" onClick={openCreate}><Plus className="size-4" /> New show</button>}
      />

      <Link to="/admin/$slug" params={{ slug }} className="admin-action-quiet mb-4 inline-flex"><ArrowLeft className="size-4" /> Edition home</Link>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Metric label="Shows" value={orderedShows.length} />
        <Metric label="Entries" value={logicalEntries.length} />
        <Metric label="Public" value={orderedShows.filter((show) => show.published && hasAnyPublicInformation(resolveShowPublication(show))).length} />
      </div>

      {!orderedShows.length ? (
        <AdminCard>
          <AdminEmptyState icon={ListChecks} title="Create the first show" description="Start with a heat, semi-final, Grand Final or another stage. You can build its line-up immediately afterwards." action={<button type="button" className="admin-action-primary" onClick={openCreate}><Plus className="size-4" /> Create show</button>} />
        </AdminCard>
      ) : (
        <div className="space-y-3">
          {orderedShows.map((show) => {
            const count = participants.filter((participant) => participant.show_id === show.id).length;
            const publication = resolveShowPublication(show);
            const isPublic = show.published && hasAnyPublicInformation(publication);
            return (
              <AdminCard key={show.id} className="!p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-muted-foreground"><ListChecks className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-bold text-foreground">{show.name}</h2>
                      <AdminStatus tone={isPublic ? "ready" : "neutral"}>{isPublic ? "Public" : "Private"}</AdminStatus>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{show.kind.replaceAll("-", " ")} · {count} {count === 1 ? "entry" : "entries"} · order {show.sort_order}</p>
                  </div>
                  <button type="button" className="admin-action-secondary !min-h-10 !px-3" aria-label={`More actions for ${show.name}`} onClick={() => setActionsTarget(show)}><MoreHorizontal className="size-4" /></button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link to="/admin/entries/$slug" params={{ slug }} search={{ show: show.id }} className="admin-action-primary w-full"><ListOrdered className="size-4" /> Entries</Link>
                  <Link to="/admin/jury/$slug" params={{ slug }} search={{ show: show.id }} className="admin-action-secondary w-full"><Scale className="size-4" /> Jury</Link>
                </div>
              </AdminCard>
            );
          })}
        </div>
      )}

      <AdminSheet open={sheetOpen} onClose={() => !busy && setSheetOpen(false)} title={draft.id ? "Edit show" : "Create show"} description="Choose the real role of the show. Qualifier counts are configured separately in Voting system, including for heats and Second Chance.">
        <div className="space-y-4">
          <label className="block"><span className="admin-section-label">Show name</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Grand Final" className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30" /></label>
          <label className="block"><span className="admin-section-label">Type</span><select value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as ShowDraft["kind"] }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30">{SHOW_KIND_OPTIONS.map((kind) => <option key={kind} value={kind}>{kind.replaceAll("-", " ")}</option>)}</select></label>
          <label className="block"><span className="admin-section-label">Show order</span><input type="number" min={1} value={draft.sort_order} onChange={(event) => setDraft((current) => ({ ...current, sort_order: Number(event.target.value) || 1 }))} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30" /></label>
          <button type="button" disabled={busy || !draft.name.trim()} onClick={() => void saveShow()} className="admin-action-primary w-full">{busy ? "Saving…" : draft.id ? "Save changes" : "Create show"}</button>
        </div>
      </AdminSheet>

      <AdminSheet open={!!actionsTarget} onClose={() => setActionsTarget(null)} title={actionsTarget?.name ?? "Show actions"} description="Edit the show itself or jump directly to a specialist workspace.">
        {actionsTarget ? <div className="space-y-2">
          <AdminActionItem title="Edit show" description="Change the name, type or order." onClick={() => { const show = actionsTarget; setActionsTarget(null); openEdit(show); }} />
          <AdminActionItem
            icon={RadioTower}
            title="Show Mode companion"
            description="Set the YouTube link, scheduled start and the few live phases Solaris cannot infer automatically."
            onClick={() => {
              const show = actionsTarget;
              setActionsTarget(null);
              openShowMode(show);
            }}
          />
          <Link to="/admin/televote/$slug" params={{ slug }} search={{ show: actionsTarget.id }} onClick={() => setActionsTarget(null)} className="admin-action-row flex w-full items-center gap-3 text-left"><span className="admin-action-row-icon"><BarChart3 className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Televote totals</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">Review aggregate televote points feeding this show.</span></span></Link>
          <Link to="/admin/voting-system/$slug" params={{ slug }} search={{ show: actionsTarget.id }} onClick={() => setActionsTarget(null)} className="admin-action-row flex w-full items-center gap-3 text-left"><span className="admin-action-row-icon"><Calculator className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Voting system</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">Configure scales, weighting, qualifiers and tie-breaks.</span></span></Link>
          <Link to="/admin/publication/$slug" params={{ slug }} onClick={() => setActionsTarget(null)} className="admin-action-row flex w-full items-center gap-3 text-left"><span className="admin-action-row-icon"><Globe2 className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Publication</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">Control which layers of this show are public.</span></span></Link>
          <Link to="/admin/design/$slug" params={{ slug }} onClick={() => setActionsTarget(null)} className="admin-action-row flex w-full items-center gap-3 text-left"><span className="admin-action-row-icon"><RadioTower className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Design & broadcast</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">Theme, scoreboard and broadcast presentation.</span></span></Link>
          <AdminActionItem title={actionsTarget.published ? "Make show private" : "Publish show route"} description={actionsTarget.published ? "Hide the public show route while keeping all data intact." : "Make the show route available. Individual publication layers still follow their publication settings."} onClick={() => void togglePublished(actionsTarget)} />
          <AdminActionItem icon={Trash2} tone="danger" title="Delete show" description="Permanently remove this show and dependent show data." onClick={() => { setDeleteTarget(actionsTarget); setActionsTarget(null); }} />
        </div> : null}
      </AdminSheet>

      <AdminSheet
        open={Boolean(showModeTarget)}
        onClose={() => !busy && setShowModeTarget(null)}
        title={showModeTarget ? `${showModeTarget.name} · Show Mode` : "Show Mode"}
        description="YouTube owns the actual broadcast timing. Solaris only tracks reliable companion events and linked voting state."
      >
        <div className="space-y-4">
          <label className="block">
            <span className="admin-section-label">Manual show phase</span>
            <select
              value={showModeDraft.phase}
              onChange={(event) =>
                setShowModeDraft((current) => ({
                  ...current,
                  phase: event.target.value as ShowModeManualPhase,
                }))
              }
              className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            >
              <option value="scheduled">Scheduled</option>
              <option value="live">Live</option>
              <option value="results_in_progress">Results in progress</option>
              <option value="ended">Ended</option>
            </select>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Voting open/closed comes from the linked Televoting round. Results published comes from the publication engine.
            </p>
          </label>

          <label className="block">
            <span className="admin-section-label">Scheduled start</span>
            <input
              type="datetime-local"
              value={showModeDraft.scheduledStart}
              onChange={(event) =>
                setShowModeDraft((current) => ({
                  ...current,
                  scheduledStart: event.target.value,
                }))
              }
              className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              This is a scheduled start, never a promise about exact YouTube timing.
            </p>
          </label>

          <label className="block">
            <span className="admin-section-label">YouTube live / replay URL</span>
            <div className="mt-2 flex gap-2">
              <input
                type="url"
                value={showModeDraft.youtubeUrl}
                onChange={(event) =>
                  setShowModeDraft((current) => ({
                    ...current,
                    youtubeUrl: event.target.value,
                  }))
                }
                placeholder="https://www.youtube.com/watch?v=..."
                className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
              />
              {safeShowModeYoutubeUrl(showModeDraft.youtubeUrl) ? (
                <a
                  href={safeShowModeYoutubeUrl(showModeDraft.youtubeUrl)!}
                  target="_blank"
                  rel="noreferrer"
                  className="admin-action-secondary !min-h-11 !px-3"
                  aria-label="Open YouTube link"
                >
                  <ExternalLink className="size-4" />
                </a>
              ) : null}
            </div>
          </label>

          <label className="block">
            <span className="admin-section-label">Linked Televoting round</span>
            <select
              value={showModeDraft.televoteRoundId}
              onChange={(event) =>
                setShowModeDraft((current) => ({
                  ...current,
                  televoteRoundId: event.target.value,
                }))
              }
              className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
            >
              <option value="">No linked public voting round</option>
              {(roundsQuery.data?.edition?.rounds ?? []).map((round) => (
                <option key={round.id} value={round.id}>
                  {round.name} · {round.status}
                </option>
              ))}
            </select>
            {roundsQuery.isLoading ? (
              <p className="mt-2 text-xs text-muted-foreground">Loading linked Televoting rounds…</p>
            ) : roundsQuery.error ? (
              <p className="mt-2 text-xs text-amber-200">
                Voting rounds could not be loaded. Existing linkage can still be left unchanged.
              </p>
            ) : null}
          </label>

          <div className="rounded-xl border border-sky-200/15 bg-sky-200/[0.04] p-3">
            <div className="flex items-start gap-2">
              <Clock3 className="mt-0.5 size-4 shrink-0 text-sky-200" aria-hidden="true" />
              <p className="text-xs leading-5 text-muted-foreground">
                Solaris never estimates the current performer. The YouTube stream remains the source of truth for what is actually happening on air.
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void saveShowMode()}
            className="admin-action-primary w-full"
          >
            {busy ? "Saving…" : "Save Show Mode"}
          </button>
        </div>
      </AdminSheet>

      <AdminConfirmSheet
        open={!!deleteTarget}
        onClose={() => !busy && setDeleteTarget(null)}
        onConfirm={deleteShow}
        title={`Delete ${deleteTarget?.name ?? "show"}?`}
        description={<>This permanently removes the show and dependent participant/voting data. Official archived results should only be deleted when you are certain this show is disposable.</>}
        confirmLabel="Delete show"
        confirmationText={deleteTarget?.name}
        confirmationHint={deleteTarget ? `Type ${deleteTarget.name} to confirm` : undefined}
        busy={busy}
        danger
      />
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}
