import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImageIcon, MonitorPlay, Palette, RadioTower, RotateCcw, Save } from "lucide-react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminStatus,
} from "@/components/admin/AdminUI";
import {
  WorkspaceActionBar,
  WorkspaceHeader,
} from "@/components/admin/AdminWorkspacePrimitives";
import { BroadcastEditor } from "@/components/studio/BroadcastEditor";
import { EditionArtworkControl } from "@/components/studio/EditionArtworkControl";
import { ScoreboardEditor } from "@/components/studio/ScoreboardEditor";
import { ThemeEditor } from "@/components/studio/ThemeEditor";
import {
  editionLabel,
  useContestEntities,
  useCountries,
  useEditions,
  useIsOrganizer,
  useParticipants,
  useShows,
  useThemes,
} from "@/lib/data";
import { entityDisplayMap } from "@/lib/entities";
import { resolveTheme, type ThemeConfig } from "@/lib/theme";
import { resolveBroadcast, type BroadcastConfig } from "@/lib/broadcast";
import { resolveScoreboard, type BroadcastRowData, type ScoreboardConfig } from "@/lib/scoreboard";
import {
  commitOrganizerProductionDesignReview,
  prepareOrganizerProductionDesignReview,
  type OrganizerProductionDesignReview,
} from "@/lib/v3-organizer-production-design";
import type {
  ProductionDesignMutationRequest,
  ProductionDesignShowConfig,
} from "@/lib/v3-production-design";

export const Route = createFileRoute("/_authenticated/admin/design/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} Design & Broadcast — Solaris Organizer` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditionDesignPage,
});

type DesignScope = "edition" | string;
type DesignReviewKind = "edition-default" | "round-override" | "round-reset";

type ReviewShow = {
  id: string;
  name: string;
  participantCount: number;
};

type PendingDesignReview = {
  kind: DesignReviewKind;
  editionId: string;
  editionName: string;
  shows: ReviewShow[];
  authority: OrganizerProductionDesignReview;
};

function EditionDesignPage() {
  const { slug } = Route.useParams();
  const { editionId: organizerEditionId } = useAdminContext();
  const { data: editions = [], isLoading: editionsLoading } = useEditions();
  const edition = useMemo(() => editions.find((item) => item.slug === slug) ?? null, [editions, slug]);
  const { data: shows = [] } = useShows(edition?.id);
  const { data: participants = [] } = useParticipants(edition?.id);
  const { data: countries = [] } = useCountries();
  const { data: themes = [] } = useThemes();
  const { data: isOrganizer } = useIsOrganizer();
  const qc = useQueryClient();

  const editionShows = useMemo(
    () => shows.filter((show) => show.edition_id === edition?.id).sort((a, b) => a.sort_order - b.sort_order),
    [shows, edition?.id],
  );

  const participantCountByShow = useMemo(() => {
    const counts = new Map<string, number>();
    participants.forEach((participant) => {
      if (!participant.show_id) return;
      counts.set(participant.show_id, (counts.get(participant.show_id) ?? 0) + 1);
    });
    return counts;
  }, [participants]);

  const [scope, setScope] = useState<DesignScope>("edition");
  const [previewShowId, setPreviewShowId] = useState("");

  useEffect(() => {
    if (!previewShowId && editionShows[0]) setPreviewShowId(editionShows[0].id);
    if (previewShowId && !editionShows.some((show) => show.id === previewShowId)) setPreviewShowId(editionShows[0]?.id ?? "");
    if (scope !== "edition" && !editionShows.some((show) => show.id === scope)) setScope("edition");
  }, [editionShows, previewShowId, scope]);

  const selectedShow = scope === "edition" ? null : editionShows.find((show) => show.id === scope) ?? null;
  const previewShow = selectedShow ?? editionShows.find((show) => show.id === previewShowId) ?? editionShows[0] ?? null;
  const previewParticipants = useMemo(
    () => participants.filter((participant) => participant.show_id === previewShow?.id).sort((a, b) => (a.running_order ?? 999) - (b.running_order ?? 999)),
    [participants, previewShow?.id],
  );

  const { data: entities = [] } = useContestEntities(edition?.id);
  const displayMap = useMemo(() => entityDisplayMap(entities, countries), [entities, countries]);

  const editionThemeRow = useMemo(() => themes.find((theme) => theme.id === edition?.theme_id) ?? null, [themes, edition?.theme_id]);
  const editionTheme = useMemo(() => resolveTheme(editionThemeRow?.config), [editionThemeRow]);

  const defaultBroadcastSourceShow = useMemo(() => {
    if (!editionShows.length) return null;
    if (edition?.theme_id) {
      const matching = editionShows.find((show) => show.theme_id === edition.theme_id && show.broadcast_config && typeof show.broadcast_config === "object");
      if (matching) return matching;
    }
    return editionShows.find((show) => show.broadcast_config && typeof show.broadcast_config === "object") ?? editionShows[0] ?? null;
  }, [editionShows, edition?.theme_id]);

  const editionBroadcast = useMemo(
    () => resolveBroadcast(defaultBroadcastSourceShow?.broadcast_config ?? null),
    [defaultBroadcastSourceShow?.broadcast_config],
  );

  const editionScoreboard = useMemo(() => {
    if (editionTheme.scoreboardConfig) return normalizeScoreboard(editionTheme.scoreboardConfig, previewParticipants.length);
    if (defaultBroadcastSourceShow?.broadcast_config && typeof defaultBroadcastSourceShow.broadcast_config === "object" && "scoreboard" in defaultBroadcastSourceShow.broadcast_config) {
      return normalizeScoreboard(resolveScoreboard(defaultBroadcastSourceShow.broadcast_config, { theme: editionTheme, rowCount: previewParticipants.length }), previewParticipants.length);
    }
    return normalizeScoreboard(resolveScoreboard(null, { theme: editionTheme, rowCount: previewParticipants.length }), previewParticipants.length);
  }, [editionTheme, defaultBroadcastSourceShow?.broadcast_config, previewParticipants.length]);

  const selectedShowThemeRow = useMemo(
    () => selectedShow ? themes.find((theme) => theme.id === selectedShow.theme_id) ?? null : null,
    [themes, selectedShow],
  );
  const selectedShowTheme = useMemo(
    () => selectedShow ? resolveTheme(selectedShowThemeRow?.config ?? editionTheme) : editionTheme,
    [selectedShow, selectedShowThemeRow, editionTheme],
  );
  const selectedShowBroadcast = useMemo(
    () => selectedShow ? resolveBroadcast(selectedShow.broadcast_config ?? defaultBroadcastSourceShow?.broadcast_config ?? null) : editionBroadcast,
    [selectedShow, defaultBroadcastSourceShow?.broadcast_config, editionBroadcast],
  );
  const selectedShowScoreboard = useMemo(() => {
    if (!selectedShow) return editionScoreboard;
    const count = participantCountByShow.get(selectedShow.id) ?? previewParticipants.length;
    if (selectedShow.broadcast_config && typeof selectedShow.broadcast_config === "object" && "scoreboard" in selectedShow.broadcast_config) {
      return normalizeScoreboard(resolveScoreboard(selectedShow.broadcast_config, { theme: selectedShowTheme, rowCount: count }), count);
    }
    if (selectedShowTheme.scoreboardConfig) return normalizeScoreboard(selectedShowTheme.scoreboardConfig, count);
    return normalizeScoreboard(editionScoreboard, count);
  }, [selectedShow, selectedShowTheme, editionScoreboard, participantCountByShow, previewParticipants.length]);

  const sourceTheme = scope === "edition" ? editionTheme : selectedShowTheme;
  const sourceBroadcast = scope === "edition" ? editionBroadcast : selectedShowBroadcast;
  const sourceScoreboard = useMemo(
    () => scope === "edition"
      ? normalizeScoreboard(editionScoreboard, previewParticipants.length)
      : normalizeScoreboard(selectedShowScoreboard, previewParticipants.length),
    [scope, editionScoreboard, selectedShowScoreboard, previewParticipants.length],
  );

  const [themeDraft, setThemeDraft] = useState<ThemeConfig>(sourceTheme);
  const [broadcastDraft, setBroadcastDraft] = useState<BroadcastConfig>(sourceBroadcast);
  const [scoreboardDraft, setScoreboardDraft] = useState<ScoreboardConfig>(sourceScoreboard);
  const [pendingReview, setPendingReview] = useState<PendingDesignReview | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setThemeDraft(sourceTheme);
    setBroadcastDraft(sourceBroadcast);
    setScoreboardDraft(sourceScoreboard);
    setMsg(null);
    setError(null);
  }, [scope, previewShow?.id, sourceTheme, sourceBroadcast, sourceScoreboard]);

  useEffect(() => {
    setPendingReview(null);
  }, [organizerEditionId, edition?.id, scope, selectedShow?.id]);

  const previewRows = useMemo<BroadcastRowData[]>(() => previewParticipants.map((participant, index) => {
    const display = displayMap.get(participant.country_id);
    const total = Math.max(0, 248 - index * 7);
    return {
      id: participant.country_id,
      entityType: display?.entityType ?? "global",
      name: display?.name ?? participant.country_id,
      abbreviation: display?.short_code ?? "",
      flagImage: display?.flag_image ?? null,
      accent: display?.accent_color ?? themeDraft.colors.primary,
      rank: index + 1,
      runningOrder: participant.running_order ?? index + 1,
      score: total,
      juryScore: Math.round(total * 0.53),
      televoteScore: Math.round(total * 0.47),
      movement: 0,
      qualified: participant.qualified,
      eliminated: participant.qualified === false,
      active: false,
      highlighted: false,
      leader: index === 0,
      winner: index === 0 && previewShow?.kind === "grand-final",
      subtitle: participant.artist && participant.song ? `${participant.artist} — ${participant.song}` : participant.artist ?? participant.song ?? null,
    };
  }), [previewParticipants, displayMap, themeDraft.colors.primary, previewShow?.kind]);

  async function refresh() {
    await Promise.all(["editions", "edition", "shows", "show", "themes", "participants"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
  }

  function requireEditionScope() {
    if (!edition || organizerEditionId !== edition.id) {
      throw new Error("Edition context changed before this Production operation. Reload the selected edition before retrying.");
    }
    return edition;
  }

  function reviewShow(show: (typeof editionShows)[number]): ReviewShow {
    return {
      id: show.id,
      name: show.name,
      participantCount: participantCountByShow.get(show.id) ?? 0,
    };
  }

  function editionDefaultRequest(): ProductionDesignMutationRequest {
    const themeConfig = recordClone(themeDraft);
    const broadcastConfig = recordClone(broadcastDraft);
    const scoreboardConfig = recordClone(normalizeScoreboard(scoreboardDraft, previewParticipants.length));
    const showConfigs: ProductionDesignShowConfig[] = editionShows.map((show) => ({
      showId: show.id,
      broadcastConfig: recordClone(broadcastDraft),
      scoreboardConfig: recordClone(normalizeScoreboard(scoreboardDraft, participantCountByShow.get(show.id) ?? 0)),
    }));
    return {
      mode: "edition_default",
      themeConfig,
      broadcastConfig,
      scoreboardConfig,
      showConfigs,
    };
  }

  function roundOverrideRequest(showId: string): ProductionDesignMutationRequest {
    const count = participantCountByShow.get(showId) ?? 0;
    return {
      mode: "show_override",
      showId,
      themeConfig: recordClone(themeDraft),
      broadcastConfig: recordClone(broadcastDraft),
      scoreboardConfig: recordClone(normalizeScoreboard(scoreboardDraft, count)),
    };
  }

  function roundResetRequest(showId: string): ProductionDesignMutationRequest {
    const count = participantCountByShow.get(showId) ?? 0;
    return {
      mode: "show_reset",
      showId,
      broadcastConfig: recordClone(editionBroadcast),
      scoreboardConfig: recordClone(normalizeScoreboard(editionScoreboard, count)),
    };
  }

  async function prepareReview(kind: DesignReviewKind, request: ProductionDesignMutationRequest, showsForReview: ReviewShow[]) {
    const currentEdition = requireEditionScope();
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const authority = await prepareOrganizerProductionDesignReview({
        editionId: currentEdition.id,
        request,
      });
      if (organizerEditionId !== currentEdition.id || edition?.id !== currentEdition.id) {
        throw new Error("Organizer edition changed while Production review was being prepared. Review again in the current edition.");
      }
      setPendingReview({
        kind,
        editionId: currentEdition.id,
        editionName: editionLabel(currentEdition),
        shows: showsForReview,
        authority,
      });
    } catch (caught) {
      setPendingReview(null);
      setError(caught instanceof Error ? caught.message : "Could not prepare authoritative Production review.");
    } finally {
      setSaving(false);
    }
  }

  function openSaveReview() {
    if (!edition || !previewShow || saving) return;
    try {
      requireEditionScope();
      if (scope === "edition") {
        void prepareReview("edition-default", editionDefaultRequest(), editionShows.map(reviewShow));
        return;
      }
      if (!selectedShow) return;
      void prepareReview("round-override", roundOverrideRequest(selectedShow.id), [reviewShow(selectedShow)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not prepare Production review.");
    }
  }

  function openResetReview() {
    if (!edition || !selectedShow || saving) return;
    try {
      requireEditionScope();
      void prepareReview("round-reset", roundResetRequest(selectedShow.id), [reviewShow(selectedShow)]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not prepare Production reset review.");
    }
  }

  async function applyReviewedDesign() {
    const review = pendingReview;
    if (!review || saving) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const currentEdition = requireEditionScope();
      if (currentEdition.id !== review.editionId) {
        throw new Error("Organizer edition changed after Production review. Review again.");
      }
      const result = await commitOrganizerProductionDesignReview({
        review: review.authority,
        currentEditionId: currentEdition.id,
      });
      const affectedCount = result.affectedShowIds?.length ?? review.shows.length;
      const receiptId = result.receiptId ?? result.operationId;
      if (review.kind === "edition-default") {
        setMsg(`${review.editionName} default design was saved atomically to ${affectedCount} show${affectedCount === 1 ? "" : "s"}. Receipt ${receiptId}.`);
      } else if (review.kind === "round-reset") {
        setMsg(`${review.shows[0]?.name ?? "Show"} is using the edition default again. Receipt ${receiptId}.`);
      } else {
        setMsg(`${review.shows[0]?.name ?? "Show"} now has its own Production design override. Receipt ${receiptId}.`);
      }
      setPendingReview(null);
      await refresh();
    } catch (caught) {
      setPendingReview(null);
      setError(caught instanceof Error ? caught.message : "Could not apply the reviewed Production change.");
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  if (editionsLoading) return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading design…</p></AdminCard>;
  if (!edition) return <AdminCard><AdminEmptyState icon={Palette} title="Edition not found" description="Choose another edition from the organizer workspace." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  if (!organizerEditionId || organizerEditionId !== edition.id) {
    return (
      <AdminPage>
        <AdminCard>
          <AdminEmptyState
            icon={Palette}
            title="Confirming edition context"
            description="This Production editor only opens when its route edition matches the exact edition selected in Solaris Organizer. It will not save into a different edition while context is changing."
            action={<Link to="/admin/control" className="admin-action-secondary">Back to Control</Link>}
          />
        </AdminCard>
      </AdminPage>
    );
  }

  const roundHasOverride = !!selectedShow && !!selectedShow.theme_id && selectedShow.theme_id !== edition.theme_id;
  const reviewShowTarget = pendingReview?.shows[0] ?? null;
  const reviewTarget = pendingReview?.kind === "edition-default" ? pendingReview.editionName : reviewShowTarget?.name ?? "show";

  return (
    <AdminPage>
      <WorkspaceHeader
        eyebrow="Present"
        title="Design & broadcast"
        description={`Control the visual identity, scoreboard and broadcast behaviour for ${editionLabel(edition)}. Start with the edition default and only create show overrides when they are genuinely needed.`}
        actions={<Link to="/admin/$slug" params={{ slug }} className="admin-action-secondary"><ArrowLeft className="size-4" /> Edition home</Link>}
      />

      {isOrganizer === false ? <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-3 text-sm text-rose-100">This account does not have organizer access, so saving will be rejected.</div> : null}
      {error ? <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-3 text-sm text-rose-100">{error}</div> : null}
      {!error && msg ? <div className="rounded-xl border border-emerald-200/15 bg-emerald-200/[0.05] p-3 text-sm text-emerald-100">{msg}</div> : null}

      <AdminCard strong>
        <AdminCardHeader eyebrow="Scope" title={scope === "edition" ? "Edition default" : selectedShow?.name ?? "Show override"} description={scope === "edition" ? "Saving here applies the shared design and broadcast behaviour to every show, with each scoreboard automatically fitted to its own entry count." : roundHasOverride ? "This show currently has its own visual override." : "This show currently inherits the edition default. Saving creates an override only for this show."} action={<AdminStatus tone={scope === "edition" ? "info" : roundHasOverride ? "attention" : "neutral"}>{scope === "edition" ? "All shows" : roundHasOverride ? "Override" : "Inherited"}</AdminStatus>} />

        <label className="block">
          <span className="admin-section-label">Editing</span>
          <select value={scope} onChange={(event) => setScope(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30">
            <option value="edition">All shows · edition default</option>
            {editionShows.map((show) => <option key={show.id} value={show.id}>{show.name}{show.theme_id && show.theme_id !== edition.theme_id ? " · custom" : ""}</option>)}
          </select>
        </label>

        {scope === "edition" && editionShows.length > 1 ? (
          <label className="mt-4 block">
            <span className="admin-section-label">Preview show</span>
            <select value={previewShow?.id ?? ""} onChange={(event) => setPreviewShowId(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30">
              {editionShows.map((show) => <option key={show.id} value={show.id}>{show.name} · {participantCountByShow.get(show.id) ?? 0} entries</option>)}
            </select>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">This changes preview participants only. Your edits still apply to the edition default.</p>
          </label>
        ) : null}

        {scope !== "edition" && roundHasOverride ? (
          <button type="button" disabled={saving} onClick={openResetReview} className="admin-action-secondary mt-4 w-full"><RotateCcw className="size-4" /> Review reset to edition default</button>
        ) : null}
      </AdminCard>

      <div>
        <p className="admin-section-label mb-2">Official identity</p>
        <EditionArtworkControl slug={slug} />
      </div>

      <AdminCard className="!p-0 overflow-hidden">
        <div className="p-4 sm:p-5">
          <AdminCardHeader eyebrow="Scoreboard" title={scope === "edition" ? "Scoreboard & country cards" : `${selectedShow?.name ?? "Show"} scoreboard`} description={scope === "edition" ? "The main presentation editor for scoreboard layout, country cards and background treatment." : "Only change what should be different for this show."} action={<MonitorPlay className="size-4 text-sky-100" />} />
        </div>
        <div className="min-w-0 max-w-full border-t border-white/[0.07] p-3 sm:p-5">
          {previewShow ? (
            <ScoreboardEditor config={scoreboardDraft} onChange={setScoreboardDraft} rows={previewRows} theme={themeDraft} showName={previewShow.name} onReset={scope === "edition" ? undefined : () => setScoreboardDraft(normalizeScoreboard(editionScoreboard, previewParticipants.length))} />
          ) : (
            <AdminEmptyState icon={MonitorPlay} title="Create a show first" description="The scoreboard preview needs at least one show." action={<Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary">Open Shows</Link>} />
          )}
        </div>
      </AdminCard>

      <details className="admin-card overflow-hidden">
        <summary className="cursor-pointer list-none p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100"><Palette className="size-4" /></span>
            <div className="min-w-0"><p className="admin-section-label">Theme</p><h2 className="mt-1 text-base font-bold text-foreground">Branding & visual identity</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Logo, base colours, fonts and the general contest background. Open only when you need the deeper visual controls.</p></div>
          </div>
        </summary>
        <div className="min-w-0 max-w-full border-t border-white/[0.07] p-3 sm:p-5"><ThemeEditor theme={themeDraft} onChange={setThemeDraft} /></div>
      </details>

      <details className="admin-card overflow-hidden">
        <summary className="cursor-pointer list-none p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100"><RadioTower className="size-4" /></span>
            <div className="min-w-0"><p className="admin-section-label">Broadcast</p><h2 className="mt-1 text-base font-bold text-foreground">Reveal & production behaviour</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Timing and production behaviour. Leave this closed when you only need appearance changes.</p></div>
          </div>
        </summary>
        <div className="min-w-0 max-w-full border-t border-white/[0.07] p-3 sm:p-5"><BroadcastEditor config={broadcastDraft} onChange={setBroadcastDraft} /></div>
      </details>

      <AdminCard>
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100"><ImageIcon className="size-4" /></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-foreground">Preview context</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{previewShow ? `${previewShow.name} · ${previewParticipants.length} entries. Preview scores are illustrative only and never write contest results.` : "No show is available for preview yet."}</p></div>
        </div>
      </AdminCard>

      <WorkspaceActionBar className="flex-col items-stretch rounded-2xl border border-white/[0.08] bg-[#081326]/95 p-2.5 backdrop-blur-xl">
        <button type="button" disabled={saving || !previewShow || organizerEditionId !== edition.id} onClick={openSaveReview} className="admin-action-primary min-h-12 w-full">
          <Save className="size-4" /> {saving ? "Checking authoritative state…" : scope === "edition" ? `Review default for all ${editionShows.length} show${editionShows.length === 1 ? "" : "s"}` : `Review ${selectedShow?.name ?? "show"} override`}
        </button>
        {scope === "edition" ? <p className="mt-2 px-2 text-center text-xs leading-relaxed text-muted-foreground">The theme is shared at edition level. Broadcast and scoreboard settings are normalized per show, then committed together by one atomic server operation.</p> : null}
      </WorkspaceActionBar>

      <AdminConfirmSheet
        open={Boolean(pendingReview)}
        onClose={() => !saving && setPendingReview(null)}
        onConfirm={applyReviewedDesign}
        title={pendingReview?.kind === "edition-default" ? `Apply ${pendingReview.editionName} Production default?` : pendingReview?.kind === "round-reset" ? `Reset ${reviewShowTarget?.name ?? "show"} to the edition default?` : `Apply ${reviewShowTarget?.name ?? "show"} Production override?`}
        description={pendingReview ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-xs text-muted-foreground">
              <p><span className="font-semibold text-foreground">Edition:</span> {pendingReview.editionName}</p>
              <p className="mt-1"><span className="font-semibold text-foreground">Operation:</span> {pendingReview.kind === "edition-default" ? "Replace the shared edition design/broadcast default atomically" : pendingReview.kind === "round-reset" ? "Remove this show's override and restore the edition default" : "Create or replace this show's design/broadcast override"}</p>
              <p className="mt-1"><span className="font-semibold text-foreground">Affected shows:</span> {pendingReview.shows.length}</p>
              <p className="mt-1"><span className="font-semibold text-foreground">Risk:</span> R2</p>
              <p className="mt-1"><span className="font-semibold text-foreground">Reviewed state:</span> <span className="font-mono text-foreground">{pendingReview.authority.expectedStateVersion.slice(0, 12)}…</span></p>
              <p className="mt-1"><span className="font-semibold text-foreground">Operation:</span> <span className="font-mono text-foreground">{pendingReview.authority.operationId}</span></p>
            </div>
            <div className="space-y-2">
              {pendingReview.shows.map((show) => (
                <div key={show.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs">
                  <p className="font-semibold text-foreground">{show.name}</p>
                  <p className="mt-1 text-muted-foreground">Stable show ID: {show.id}</p>
                  <p className="mt-1 text-muted-foreground">Reviewed scoreboard entries: {show.participantCount}</p>
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Solaris loaded the canonical exact-edition Production projection before opening this review. Commit re-reads that same scope and rejects the operation if its state version changed.
            </p>
            <p className="text-xs leading-relaxed text-emerald-100/85">
              Theme creation or update, edition attachment and every affected show write are now one server transaction. The edition-default command also verifies that this review still covers the complete current show set before it writes anything.
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Network uncertainty is reconciled by the same operation identity. Solaris does not blindly retry a consequential Production save.
            </p>
          </div>
        ) : null}
        confirmLabel={pendingReview?.kind === "round-reset" ? "Reset reviewed show" : "Apply reviewed Production change"}
        confirmationText={pendingReview ? reviewTarget : undefined}
        confirmationHint={pendingReview ? `Type ${reviewTarget} exactly to confirm this Production change` : undefined}
        busy={saving}
        danger={pendingReview?.kind === "round-reset"}
      />
    </AdminPage>
  );
}

function recordClone<T>(value: T): Record<string, unknown> {
  return structuredClone(value) as Record<string, unknown>;
}

function normalizeScoreboard(config: ScoreboardConfig, participantCount: number): ScoreboardConfig {
  const columns = columnsForCount(participantCount);
  const rowsPerColumn = columns > 1 ? Math.ceil(Math.max(participantCount, 1) / columns) : null;
  return {
    ...config,
    layout: {
      ...config.layout,
      columns,
      rowsPerColumn,
      distribution: "sequential",
      boardWidth: boardWidthForColumns(columns),
    },
    background: {
      ...config.background,
      pattern: "none",
      patternOpacity: 0,
    },
  };
}

function columnsForCount(count: number): 1 | 2 | 3 | 4 {
  if (count <= 14) return 1;
  if (count <= 30) return 2;
  if (count <= 48) return 3;
  return 4;
}

function boardWidthForColumns(columns: 1 | 2 | 3 | 4) {
  switch (columns) {
    case 1: return 920;
    case 2: return 1280;
    case 3: return 1460;
    case 4: return 1600;
  }
}
