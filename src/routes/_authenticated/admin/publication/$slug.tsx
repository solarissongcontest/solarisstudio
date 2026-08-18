import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff, Globe2, LockKeyhole, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { supabase } from "@/integrations/supabase/client";
import { editionLabel, useEdition, useShows, type Show } from "@/lib/data";
import {
  PUBLICATION_LABELS,
  PUBLICATION_PRESETS,
  applyPublicationPreset,
  hasAnyPublicInformation,
  normalisePublicationDependencies,
  resolveShowPublication,
  type PublicationConfig,
  type PublicationKey,
  type PublicationPresetId,
} from "@/lib/publication";

const PUBLICATION_KEYS = Object.keys(PUBLICATION_LABELS) as PublicationKey[];
const RESULT_KEYS: PublicationKey[] = ["results", "jury_results", "televote_results", "detailed_voting"];

type DraftState = {
  show: Show;
  config: PublicationConfig;
};

type PendingRelease = {
  show: Show;
  config: PublicationConfig;
};

export const Route = createFileRoute("/_authenticated/admin/publication/$slug")({
  head: () => ({ meta: [{ title: "Publication — Solaris Studio" }, { name: "robots", content: "noindex" }] }),
  component: PublicationWorkspace,
});

function PublicationWorkspace() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const { data: edition, isLoading: loadingEdition } = useEdition(slug);
  const { data: shows = [], isLoading: loadingShows } = useShows(edition?.id);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [pendingRelease, setPendingRelease] = useState<PendingRelease | null>(null);
  const [busy, setBusy] = useState(false);

  const orderedShows = useMemo(() => [...shows].sort((a, b) => a.sort_order - b.sort_order), [shows]);
  const publicCount = orderedShows.filter((show) => show.published && hasAnyPublicInformation(resolveShowPublication(show))).length;
  const resultCount = orderedShows.filter((show) => show.published && resolveShowPublication(show).results).length;

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["shows"] }),
      qc.invalidateQueries({ queryKey: ["edition"] }),
      qc.invalidateQueries({ queryKey: ["editions"] }),
    ]);
  }

  function openShow(show: Show) {
    setDraft({ show, config: resolveShowPublication(show) });
  }

  function presetFor(config: PublicationConfig) {
    return PUBLICATION_PRESETS.find((preset) => PUBLICATION_KEYS.every((key) => preset.config[key] === config[key]))?.id ?? null;
  }

  function setPreset(id: PublicationPresetId) {
    setDraft((current) => current ? { ...current, config: applyPublicationPreset(id) } : current);
  }

  function toggleLayer(key: PublicationKey) {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        config: normalisePublicationDependencies({ ...current.config, [key]: !current.config[key] }),
      };
    });
  }

  function needsResultConfirmation(show: Show, next: PublicationConfig) {
    const current = resolveShowPublication(show);
    return RESULT_KEYS.some((key) => next[key] && !current[key]);
  }

  async function persist(show: Show, config: PublicationConfig) {
    setBusy(true);
    try {
      const normalized = normalisePublicationDependencies(config);
      const shouldBePublic = hasAnyPublicInformation(normalized);
      const { error } = await (supabase.from("shows") as any)
        .update({ publication_config: normalized, published: shouldBePublic })
        .eq("id", show.id);
      if (error) throw error;
      toast.success(shouldBePublic ? `${show.name} publication updated` : `${show.name} made private`);
      setDraft(null);
      setPendingRelease(null);
      await refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Publication settings could not be saved");
    } finally {
      setBusy(false);
    }
  }

  function requestSave() {
    if (!draft) return;
    if (needsResultConfirmation(draft.show, draft.config)) {
      setPendingRelease({ show: draft.show, config: draft.config });
      return;
    }
    void persist(draft.show, draft.config);
  }

  async function makePrivate(show: Show) {
    await persist(show, applyPublicationPreset("private"));
  }

  if (loadingEdition || loadingShows) {
    return <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading publication controls…</p></AdminCard>;
  }

  if (!edition) {
    return <AdminCard><AdminEmptyState icon={Globe2} title="Edition not found" description="Choose another edition from the organizer workspace." action={<Link to="/admin" className="admin-action-secondary">Back to editions</Link>} /></AdminCard>;
  }

  return (
    <AdminPage>
      <AdminPageHeader
        eyebrow={editionLabel(edition)}
        title="Publication"
        description="Release each show in stages without changing its underlying entries, votes or results. Visibility is the only thing controlled here."
      />

      <Link to="/admin/$slug" params={{ slug }} className="admin-action-quiet mb-4 inline-flex"><ArrowLeft className="size-4" /> Edition home</Link>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Metric label="Shows" value={orderedShows.length} />
        <Metric label="Public" value={publicCount} />
        <Metric label="Results live" value={resultCount} />
      </div>

      <AdminCard strong className="mb-4">
        <AdminCardHeader eyebrow="Release model" title="Public information is staged" description="A show can reveal countries first, entries later, then qualifiers and results. Publishing a layer never edits the underlying contest data." />
        <div className="grid gap-2 sm:grid-cols-3">
          <GuideStep title="1 · Entries" text="Countries, artists, songs and running order." />
          <GuideStep title="2 · Outcomes" text="Qualifiers and overall results when the show is ready." />
          <GuideStep title="3 · Voting detail" text="Jury/televote totals and detailed ballots only when intentionally released." />
        </div>
      </AdminCard>

      {!orderedShows.length ? (
        <AdminCard><AdminEmptyState icon={Globe2} title="No shows to publish" description="Create the contest stages first. Publication is configured separately for each show." action={<Link to="/admin/shows/$slug" params={{ slug }} className="admin-action-primary">Create show</Link>} /></AdminCard>
      ) : (
        <div className="space-y-3">
          {orderedShows.map((show) => {
            const config = resolveShowPublication(show);
            const isPublic = show.published && hasAnyPublicInformation(config);
            const preset = presetFor(config);
            const visibleLayers = PUBLICATION_KEYS.filter((key) => config[key]).length;
            return (
              <AdminCard key={show.id} className="!p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.035] text-muted-foreground">
                    {isPublic ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-bold text-foreground">{show.name}</h2>
                      <AdminStatus tone={isPublic ? (config.results ? "ready" : "info") : "neutral"}>{isPublic ? (config.results ? "Results live" : "Public") : "Private"}</AdminStatus>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{preset ? PUBLICATION_PRESETS.find((item) => item.id === preset)?.name : "Custom release"} · {visibleLayers}/10 layers visible</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => openShow(show)} className="admin-action-primary w-full"><Settings2 className="size-4" /> Manage release</button>
                  {isPublic ? <button type="button" disabled={busy} onClick={() => void makePrivate(show)} className="admin-action-secondary w-full"><LockKeyhole className="size-4" /> Make private</button> : <button type="button" onClick={() => openShow(show)} className="admin-action-secondary w-full"><Eye className="size-4" /> Choose reveal</button>}
                </div>
              </AdminCard>
            );
          })}
        </div>
      )}

      <AdminSheet
        open={!!draft}
        onClose={() => !busy && setDraft(null)}
        title={draft ? `${draft.show.name} publication` : "Publication"}
        description="Choose a safe release stage or fine-tune individual public layers. Dependencies are added automatically."
      >
        {draft ? (
          <div className="space-y-5">
            <section>
              <p className="admin-section-label mb-2">Release stage</p>
              <div className="space-y-2">
                {PUBLICATION_PRESETS.map((preset) => {
                  const active = presetFor(draft.config) === preset.id;
                  const risky = preset.config.results || preset.config.detailed_voting;
                  return (
                    <button key={preset.id} type="button" onClick={() => setPreset(preset.id)} className={`admin-action-row w-full text-left ${active ? "!border-sky-200/25 !bg-sky-200/[0.07]" : ""}`}>
                      <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-sm font-semibold text-foreground">{preset.name}{risky ? <AdminStatus tone="attention">Result release</AdminStatus> : null}</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{preset.description}</span></span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <p className="admin-section-label mb-2">Fine tune</p>
              <div className="divide-y divide-white/[0.07] rounded-xl border border-white/[0.08]">
                {PUBLICATION_KEYS.map((key) => (
                  <label key={key} className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{PUBLICATION_LABELS[key].title}</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{PUBLICATION_LABELS[key].description}</span></span>
                    <input type="checkbox" checked={draft.config[key]} onChange={() => toggleLayer(key)} className="size-5 shrink-0 accent-sky-200" />
                  </label>
                ))}
              </div>
            </section>

            <button type="button" disabled={busy} onClick={requestSave} className="admin-action-primary w-full">{busy ? "Saving…" : hasAnyPublicInformation(draft.config) ? "Save publication" : "Make show private"}</button>
          </div>
        ) : null}
      </AdminSheet>

      <AdminConfirmSheet
        open={!!pendingRelease}
        onClose={() => !busy && setPendingRelease(null)}
        onConfirm={() => pendingRelease ? persist(pendingRelease.show, pendingRelease.config) : undefined}
        title="Release result information?"
        description={<>This change makes previously hidden result or voting information public. It does not recalculate anything, but visitors may immediately see the existing official data for this show.</>}
        confirmLabel="Release results"
        confirmationText={pendingRelease?.show.name}
        confirmationHint={pendingRelease ? `Type ${pendingRelease.show.name} to confirm` : undefined}
        busy={busy}
      />
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}

function GuideStep({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-sm font-semibold text-foreground">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p></div>;
}
