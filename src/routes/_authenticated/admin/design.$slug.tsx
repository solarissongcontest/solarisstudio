import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImageIcon, MonitorPlay, Palette, RadioTower, RotateCcw, Save } from "lucide-react";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { BroadcastEditor } from "@/components/studio/BroadcastEditor";
import { EditionArtworkControl } from "@/components/studio/EditionArtworkControl";
import { ScoreboardEditor } from "@/components/studio/ScoreboardEditor";
import { ThemeEditor } from "@/components/studio/ThemeEditor";
import { supabase } from "@/integrations/supabase/client";
import { reportSupabaseError } from "@/lib/errors";
import {
  editionLabel,
  useAllParticipants,
  useAllShows,
  useContestEntities,
  useCountries,
  useEditions,
  useIsOrganizer,
  useThemes,
} from "@/lib/data";
import { entityDisplayMap } from "@/lib/entities";
import { resolveTheme, type ThemeConfig } from "@/lib/theme";
import { resolveBroadcast, type BroadcastConfig } from "@/lib/broadcast";
import { resolveScoreboard, type BroadcastRowData, type ScoreboardConfig } from "@/lib/scoreboard";

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

function EditionDesignPage() {
  const { slug } = Route.useParams();
  const { data: editions = [], isLoading: editionsLoading } = useEditions();
  const { data: shows = [] } = useAllShows();
  const { data: participants = [] } = useAllParticipants();
  const { data: countries = [] } = useCountries();
  const { data: themes = [] } = useThemes();
  const { data: isOrganizer } = useIsOrganizer();
  const qc = useQueryClient();

  const edition = useMemo(() => editions.find((item) => item.slug === slug) ?? null, [editions, slug]);
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

  async function saveEditionDefault() {
    if (!edition || saving || !previewShow) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const cleanBase = normalizeScoreboard(scoreboardDraft, previewParticipants.length);
      let themeId = edition.theme_id;
      const themeConfig = { ...themeDraft, scoreboardConfig: cleanBase };

      if (themeId) {
        const { error: themeError } = await supabase.from("themes").update({ config: themeConfig }).eq("id", themeId);
        if (themeError) {
          setError(reportSupabaseError(themeError, "Could not save the edition theme."));
          return;
        }
      } else {
        const { data: createdTheme, error: themeError } = await supabase.from("themes").insert({
          name: `${editionLabel(edition)} default design`,
          description: `Default design for every round of ${editionLabel(edition)}`,
          config: themeConfig,
          is_public: false,
        }).select().maybeSingle();
        if (themeError || !createdTheme) {
          setError(themeError ? reportSupabaseError(themeError, "Could not create the edition theme.") : "Could not create the edition theme.");
          return;
        }
        themeId = createdTheme.id;
      }

      const { error: editionError } = await supabase.from("editions").update({ theme_id: themeId }).eq("id", edition.id);
      if (editionError) {
        setError(reportSupabaseError(editionError, "Could not attach the saved theme to this edition."));
        return;
      }

      for (const show of editionShows) {
        const count = participantCountByShow.get(show.id) ?? 0;
        const showScoreboard = normalizeScoreboard(cleanBase, count);
        const { error: showError } = await supabase.from("shows").update({
          theme_id: themeId,
          broadcast_config: { ...broadcastDraft, scoreboard: showScoreboard },
        }).eq("id", show.id);
        if (showError) {
          setError(reportSupabaseError(showError, `${editionLabel(edition)} theme saved, but ${show.name} could not receive the shared design.`));
          return;
        }
      }

      setMsg(`${editionLabel(edition)} default design was saved to all ${editionShows.length} round${editionShows.length === 1 ? "" : "s"}. Each round kept an automatic layout for its own number of entries.`);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function saveRoundOverride() {
    if (!edition || !selectedShow || saving) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const count = participantCountByShow.get(selectedShow.id) ?? 0;
      const cleanScoreboard = normalizeScoreboard(scoreboardDraft, count);
      let roundThemeId = selectedShow.theme_id && selectedShow.theme_id !== edition.theme_id ? selectedShow.theme_id : null;
      const roundThemeConfig = { ...themeDraft, scoreboardConfig: cleanScoreboard };

      if (roundThemeId) {
        const { error: themeError } = await supabase.from("themes").update({ config: roundThemeConfig }).eq("id", roundThemeId);
        if (themeError) {
          setError(reportSupabaseError(themeError, "Could not save the round theme."));
          return;
        }
      } else {
        const { data: roundTheme, error: themeError } = await supabase.from("themes").insert({
          name: `${editionLabel(edition)} · ${selectedShow.name} override`,
          description: `Visual override for ${selectedShow.name}`,
          config: roundThemeConfig,
          is_public: false,
        }).select().maybeSingle();
        if (themeError || !roundTheme) {
          setError(themeError ? reportSupabaseError(themeError, "Could not create the round override.") : "Could not create the round override.");
          return;
        }
        roundThemeId = roundTheme.id;
      }

      const { error: showError } = await supabase.from("shows").update({
        theme_id: roundThemeId,
        broadcast_config: { ...broadcastDraft, scoreboard: cleanScoreboard },
      }).eq("id", selectedShow.id);
      if (showError) {
        setError(reportSupabaseError(showError, "Could not save this round override."));
        return;
      }

      setMsg(`${selectedShow.name} now has its own design override. Every other round still uses the edition default.`);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  async function resetRound() {
    if (!edition || !selectedShow || !edition.theme_id || saving) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const count = participantCountByShow.get(selectedShow.id) ?? 0;
      const cleanScoreboard = normalizeScoreboard(editionScoreboard, count);
      const { error: showError } = await supabase.from("shows").update({
        theme_id: edition.theme_id,
        broadcast_config: { ...editionBroadcast, scoreboard: cleanScoreboard },
      }).eq("id", selectedShow.id);
      if (showError) {
        setError(reportSupabaseError(showError, "Could not reset this round to the edition default."));
        return;
      }
      setMsg(`${selectedShow.name} is using the edition default again.`);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  if (editionsLoading) return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading design…</p></AdminCard>;
  if (!edition) return <AdminCard><AdminEmptyState icon={Palette} title="Edition not found" description="Choose another edition from the organizer workspace." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;

  const roundHasOverride = !!selectedShow && !!selectedShow.theme_id && selectedShow.theme_id !== edition.theme_id;

  return (
    <AdminPage>
      <AdminPageHeader
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
          <button type="button" disabled={saving} onClick={() => void resetRound()} className="admin-action-secondary mt-4 w-full"><RotateCcw className="size-4" /> Reset to edition default</button>
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
        <div className="min-w-0 overflow-x-auto border-t border-white/[0.07] p-3 sm:p-5">
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
        <div className="min-w-0 overflow-x-auto border-t border-white/[0.07] p-3 sm:p-5"><ThemeEditor theme={themeDraft} onChange={setThemeDraft} /></div>
      </details>

      <details className="admin-card overflow-hidden">
        <summary className="cursor-pointer list-none p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100"><RadioTower className="size-4" /></span>
            <div className="min-w-0"><p className="admin-section-label">Broadcast</p><h2 className="mt-1 text-base font-bold text-foreground">Reveal & production behaviour</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Timing and production behaviour. Leave this closed when you only need appearance changes.</p></div>
          </div>
        </summary>
        <div className="min-w-0 overflow-x-auto border-t border-white/[0.07] p-3 sm:p-5"><BroadcastEditor config={broadcastDraft} onChange={setBroadcastDraft} /></div>
      </details>

      <AdminCard>
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100"><ImageIcon className="size-4" /></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-foreground">Preview context</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{previewShow ? `${previewShow.name} · ${previewParticipants.length} entries. Preview scores are illustrative only and never write contest results.` : "No show is available for preview yet."}</p></div>
        </div>
      </AdminCard>

      <div className="admin-sticky-actions rounded-2xl border border-white/[0.08] bg-[#081326]/95 p-2.5 backdrop-blur-xl">
        <button type="button" disabled={saving || !previewShow} onClick={() => void (scope === "edition" ? saveEditionDefault() : saveRoundOverride())} className="admin-action-primary min-h-12 w-full">
          <Save className="size-4" /> {saving ? "Saving…" : scope === "edition" ? `Save default to all ${editionShows.length} show${editionShows.length === 1 ? "" : "s"}` : `Save ${selectedShow?.name ?? "show"} override`}
        </button>
        {scope === "edition" ? <p className="mt-2 px-2 text-center text-xs leading-relaxed text-muted-foreground">The theme is shared at edition level. Broadcast and scoreboard settings are normalized and copied to each show.</p> : null}
      </div>
    </AdminPage>
  );
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
