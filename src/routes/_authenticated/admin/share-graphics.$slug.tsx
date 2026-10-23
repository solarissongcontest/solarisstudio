import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, ImageIcon, RefreshCw, Save, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { WorkspaceHeader } from "@/components/admin/AdminWorkspacePrimitives";
import { editionLabel, useEditions } from "@/lib/data";
import {
  createDefaultJuryShareThemeComposition,
  createJuryShareThemeOperationIdentity,
  loadJuryShareThemeSnapshot,
  reconcileJuryShareThemeOperation,
  saveJuryShareThemeDraft,
  setJuryShareThemeState,
  type JuryShareThemeComposition,
  type JuryShareThemeOperationIdentity,
  type JuryShareThemeSnapshot,
} from "@/lib/v3-jury-share-theme";

export const Route = createFileRoute("/_authenticated/admin/share-graphics/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} Share graphics — Solaris Organizer` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EditionShareGraphicsPage,
});

type PendingReview = {
  action: "save_draft" | "ready";
  editionId: string;
  editionName: string;
  reviewedVersion: number;
  identity: JuryShareThemeOperationIdentity;
  composition?: JuryShareThemeComposition;
};

const SAMPLE_VOTES = [
  ["Country A", 12],
  ["Country B", 10],
  ["Country C", 8],
  ["Country D", 7],
  ["Country E", 6],
  ["Country F", 5],
  ["Country G", 4],
  ["Country H", 3],
  ["Country I", 2],
  ["Country J", 1],
] as const;

function EditionShareGraphicsPage() {
  const { slug } = Route.useParams();
  const { editionId: organizerEditionId } = useAdminContext();
  const { data: editions = [], isLoading: editionsLoading } = useEditions();
  const edition = useMemo(() => editions.find((item) => item.slug === slug) ?? null, [editions, slug]);
  const editionArtwork = edition
    ? ((edition as unknown as { artwork_storage_path?: string | null }).artwork_storage_path ?? null)
    : null;

  const [snapshot, setSnapshot] = useState<JuryShareThemeSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<JuryShareThemeComposition>(() => createDefaultJuryShareThemeComposition());
  const [dirty, setDirty] = useState(false);
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const exactEditionContext = Boolean(edition && organizerEditionId === edition.id);
  const latest = snapshot?.themes[0] ?? null;
  const latestVersion = latest?.version ?? 0;

  const reload = useCallback(async () => {
    if (!edition || organizerEditionId !== edition.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const next = await loadJuryShareThemeSnapshot(edition.id);
      setSnapshot(next);
    } catch (error) {
      setSnapshot(null);
      setLoadError(error instanceof Error ? error.message : "Could not load Edition share graphics.");
    } finally {
      setLoading(false);
    }
  }, [edition, organizerEditionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setPendingReview(null);
    setMessage(null);
    setMutationError(null);
  }, [organizerEditionId, edition?.id]);

  useEffect(() => {
    if (!exactEditionContext || dirty) return;
    setDraft(latest?.composition ?? createDefaultJuryShareThemeComposition(editionArtwork));
  }, [exactEditionContext, latest?.id, latest?.version, latest?.composition, editionArtwork, dirty]);

  function patchDraft(next: JuryShareThemeComposition) {
    setDraft(next);
    setDirty(true);
    setMessage(null);
    setMutationError(null);
  }

  function patchArtwork(patch: Partial<NonNullable<JuryShareThemeComposition["artwork"]>>) {
    const current = draft.artwork ?? (editionArtwork
      ? createDefaultJuryShareThemeComposition(editionArtwork).artwork
      : null);
    if (!current) return;
    patchDraft({ ...draft, artwork: { ...current, ...patch } });
  }

  function openSaveReview() {
    if (!edition || !exactEditionContext || busy) return;
    setPendingReview({
      action: "save_draft",
      editionId: edition.id,
      editionName: editionLabel(edition),
      reviewedVersion: latestVersion,
      identity: createJuryShareThemeOperationIdentity({
        editionId: edition.id,
        action: "save_draft",
        version: latestVersion,
      }),
      composition: structuredClone(draft),
    });
  }

  function openReadyReview() {
    if (!edition || !exactEditionContext || !latest || busy) return;
    setPendingReview({
      action: "ready",
      editionId: edition.id,
      editionName: editionLabel(edition),
      reviewedVersion: latest.version,
      identity: createJuryShareThemeOperationIdentity({
        editionId: edition.id,
        action: "ready",
        version: latest.version,
      }),
    });
  }

  async function applyPendingReview() {
    const review = pendingReview;
    if (!review || !edition || organizerEditionId !== review.editionId || edition.id !== review.editionId || busy) return;
    setBusy(true);
    setMessage(null);
    setMutationError(null);
    try {
      if (review.action === "save_draft") {
        if (!review.composition) throw new Error("Reviewed share-graphics draft is missing.");
        await saveJuryShareThemeDraft({
          editionId: review.editionId,
          composition: review.composition,
          expectedVersion: review.reviewedVersion,
          identity: review.identity,
        });
        setDirty(false);
        setMessage("Edition share graphics draft saved with an operation receipt.");
      } else {
        await setJuryShareThemeState({
          editionId: review.editionId,
          version: review.reviewedVersion,
          targetState: "ready",
          identity: review.identity,
        });
        setDirty(false);
        setMessage(`Edition share graphics v${review.reviewedVersion} is Ready.`);
      }
      setPendingReview(null);
      await reload();
    } catch (error) {
      const directMessage = error instanceof Error ? error.message : "Share-graphics operation did not return normally.";
      try {
        await reconcileJuryShareThemeOperation(review.identity.operationId);
        setPendingReview(null);
        setDirty(false);
        setMessage("The network response was uncertain, but Solaris reconciled the same operation receipt successfully.");
        await reload();
      } catch {
        setMutationError(`${directMessage} Solaris could not prove the outcome yet. The reviewed operation identity has been preserved; retrying this same review will not mint a second operation.`);
      }
    } finally {
      setBusy(false);
    }
  }

  if (editionsLoading) {
    return <AdminPage><AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading edition branding…</p></AdminCard></AdminPage>;
  }

  if (!edition) {
    return (
      <AdminPage>
        <AdminCard>
          <AdminEmptyState
            icon={ImageIcon}
            title="Edition not found"
            description="Choose an edition before configuring its share graphics."
            action={<Link to="/admin/control" className="admin-action-secondary">Back to Control</Link>}
          />
        </AdminCard>
      </AdminPage>
    );
  }

  if (!exactEditionContext) {
    return (
      <AdminPage>
        <AdminCard>
          <AdminEmptyState
            icon={ShieldCheck}
            title="Confirming edition context"
            description="Share graphics only open when this route matches the exact edition selected in Solaris Organizer. No newest-edition fallback is used."
            action={<Link to="/admin/control" className="admin-action-secondary">Back to Control</Link>}
          />
        </AdminCard>
      </AdminPage>
    );
  }

  const validation = latest?.validation ?? null;
  const canMarkReady = Boolean(latest && (latest.state === "draft" || latest.state === "invalid") && validation?.valid && !dirty);

  return (
    <AdminPage>
      <WorkspaceHeader
        eyebrow="Control · Contest · Edition branding"
        title="Share graphics"
        description={`Configure the optional Edition design used for jury-vote share cards in ${editionLabel(edition)}. Default Solaris and Liquid Glass remain product-owned themes.`}
        actions={<Link to="/admin/$slug" params={{ slug }} className="admin-action-secondary"><ArrowLeft className="size-4" /> Edition home</Link>}
      />

      {loadError ? (
        <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.055] p-3 text-sm text-rose-100">
          <div className="flex items-start gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><span>{loadError}</span></div>
          <button type="button" className="admin-action-secondary mt-3" onClick={() => void reload()}><RefreshCw className="size-4" /> Retry</button>
        </div>
      ) : null}
      {mutationError ? <div className="rounded-xl border border-amber-200/15 bg-amber-200/[0.055] p-3 text-sm text-amber-100">{mutationError}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-200/15 bg-emerald-200/[0.05] p-3 text-sm text-emerald-100">{message}</div> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <ThemeSummary title="Default" status="Always available" detail="Read-only Solaris design." tone="neutral" />
        <ThemeSummary
          title="Edition"
          status={latest ? `v${latest.version} · ${latest.state.replaceAll("_", " ")}` : loading ? "Loading" : "Not configured"}
          detail="Versioned edition-branding recipe. This is the only editable design here."
          tone={latest?.state === "ready" ? "success" : latest?.state === "invalid" ? "attention" : "info"}
        />
        <ThemeSummary title="Liquid Glass" status="Solaris theme" detail="Read-only universal renderer theme." tone="neutral" />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]">
        <div className="min-w-0 space-y-4">
          <AdminCard>
            <AdminCardHeader
              eyebrow="Artwork composition"
              title="Edition artwork"
              description="Use the edition-owned artwork only. The renderer receives structured composition tokens, never arbitrary CSS, HTML, JavaScript or remote URLs."
              action={<ImageIcon className="size-4 text-sky-100" />}
            />
            {editionArtwork ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Placement">
                  <select value={draft.artwork?.placement ?? "top_fade"} onChange={(event) => patchArtwork({ placement: event.target.value as NonNullable<JuryShareThemeComposition["artwork"]>["placement"] })} className="admin-field">
                    <option value="top">Top</option><option value="top_fade">Top + fade</option><option value="background">Background</option><option value="bottom">Bottom</option><option value="bottom_fade">Bottom + fade</option><option value="full">Full</option>
                  </select>
                </Field>
                <Field label="Scale">
                  <select value={draft.artwork?.scale ?? "cover"} onChange={(event) => patchArtwork({ scale: event.target.value as "cover" | "contain" })} className="admin-field"><option value="cover">Cover</option><option value="contain">Contain</option></select>
                </Field>
                <RangeField label="Focal X" value={draft.artwork?.focalX ?? 0.5} min={0} max={1} step={0.01} onChange={(value) => patchArtwork({ focalX: value })} />
                <RangeField label="Focal Y" value={draft.artwork?.focalY ?? 0.5} min={0} max={1} step={0.01} onChange={(value) => patchArtwork({ focalY: value })} />
                <RangeField label="Opacity" value={draft.artwork?.opacity ?? 0.9} min={0} max={1} step={0.05} onChange={(value) => patchArtwork({ opacity: value })} />
                <RangeField label="Scrim" value={draft.artwork?.scrimStrength ?? 0.36} min={0} max={1} step={0.05} onChange={(value) => patchArtwork({ scrimStrength: value })} />
              </div>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">This edition has no edition-owned artwork configured. The share theme can still use the structured scoreboard, header, background and footer recipe.</p>
            )}
          </AdminCard>

          <AdminCard>
            <AdminCardHeader eyebrow="Scoreboard inheritance" title="Vote rows" description="Start from the edition scoreboard, then change only the small subset needed by the 9:16 jury card." />
            <div className="grid gap-4 sm:grid-cols-2">
              <RangeField label="Row radius" value={draft.scoreboard.rowRadius} min={0} max={48} step={2} onChange={(value) => patchDraft({ ...draft, scoreboard: { ...draft.scoreboard, rowRadius: value } })} />
              <RangeField label="Row height" value={draft.scoreboard.rowHeight} min={84} max={132} step={2} onChange={(value) => patchDraft({ ...draft, scoreboard: { ...draft.scoreboard, rowHeight: value } })} />
              <Field label="12-point treatment"><select value={draft.scoreboard.topScoreTreatment} onChange={(event) => patchDraft({ ...draft, scoreboard: { ...draft.scoreboard, topScoreTreatment: event.target.value as "gold" | "edition" } })} className="admin-field"><option value="gold">Solaris gold</option><option value="edition">Edition accent</option></select></Field>
              <Field label="Flag frame"><select value={draft.scoreboard.flagTreatment} onChange={(event) => patchDraft({ ...draft, scoreboard: { ...draft.scoreboard, flagTreatment: event.target.value as "standard" | "framed" } })} className="admin-field"><option value="standard">Standard</option><option value="framed">Framed</option></select></Field>
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader eyebrow="Header & footer" title="Identity treatment" description="Keep the edition identity expressive while preserving the protected Story safe area." />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Header alignment"><select value={draft.header.alignment} onChange={(event) => patchDraft({ ...draft, header: { ...draft.header, alignment: event.target.value as "left" | "center" } })} className="admin-field"><option value="center">Center</option><option value="left">Left</option></select></Field>
              <Field label="Title treatment"><select value={draft.header.titleTreatment} onChange={(event) => patchDraft({ ...draft, header: { ...draft.header, titleTreatment: event.target.value as "compact" | "display" } })} className="admin-field"><option value="compact">Compact</option><option value="display">Display</option></select></Field>
              <Field label="Source country"><select value={draft.footer.sourceCountryTreatment} onChange={(event) => patchDraft({ ...draft, footer: { ...draft.footer, sourceCountryTreatment: event.target.value as "name" | "flag_name" } })} className="admin-field"><option value="flag_name">Flag + name</option><option value="name">Name</option></select></Field>
              <RangeField label="Motif strength" value={draft.footer.motifStrength} min={0} max={1} step={0.05} onChange={(value) => patchDraft({ ...draft, footer: { ...draft.footer, motifStrength: value } })} />
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader eyebrow="Validation" title="Ready checks" description="Server validation remains authoritative. Saving recalculates validation; Ready revalidates again before activation." />
            {!latest ? <p className="text-sm text-muted-foreground">Save the first draft to run canonical validation.</p> : null}
            {latest ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2"><AdminStatus tone={validation?.valid ? "success" : "attention"}>{validation?.valid ? "Valid" : "Needs work"}</AdminStatus><span className="text-xs text-muted-foreground">Version {latest.version} · {latest.state}</span></div>
                {validation?.errors.length ? <IssueList title="Errors" issues={validation.errors} /> : null}
                {validation?.warnings.length ? <IssueList title="Warnings" issues={validation.warnings} /> : null}
                {validation?.valid ? <p className="flex items-center gap-2 text-sm text-emerald-100"><CheckCircle2 className="size-4" /> Canonical theme-shape validation passed.</p> : null}
              </div>
            ) : null}
          </AdminCard>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className="admin-action-primary" disabled={busy || loading} onClick={openSaveReview}><Save className="size-4" /> Review draft save</button>
            <button type="button" className="admin-action-secondary" disabled={!canMarkReady || busy || loading} onClick={openReadyReview}><ShieldCheck className="size-4" /> Review Ready activation</button>
            <button type="button" className="admin-action-secondary" disabled={busy || loading} onClick={() => void reload()}><RefreshCw className="size-4" /> Refresh authority</button>
          </div>
          {dirty && latest ? <p className="text-xs text-amber-100">Unsaved edits are preview-only. Save the draft before Ready can be activated.</p> : null}
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <AdminCard strong>
            <AdminCardHeader eyebrow="Sample preview" title="9:16 Story" description="This preview deliberately uses non-sensitive sample votes. Hidden real jury ballots are never loaded for branding work." action={<Sparkles className="size-4 text-amber-100" />} />
            <JuryShareSamplePreview editionName={editionLabel(edition)} composition={draft} hasArtwork={Boolean(editionArtwork)} />
          </AdminCard>
        </div>
      </div>

      <AdminConfirmSheet
        open={Boolean(pendingReview)}
        onClose={() => { if (!busy) setPendingReview(null); }}
        onConfirm={applyPendingReview}
        title={pendingReview?.action === "ready" ? "Make Edition share graphics Ready?" : "Save Edition share graphics draft?"}
        description={pendingReview ? (
          <div className="space-y-3 text-xs leading-relaxed text-muted-foreground">
            <p><span className="font-semibold text-foreground">{pendingReview.editionName}</span> · reviewed version {pendingReview.reviewedVersion}</p>
            <p>{pendingReview.action === "ready" ? "This R2 operation activates the validated Edition recipe. A previous Ready version is archived by the server authority before this version becomes Ready." : "This R1 operation saves only the structured Edition recipe. Editing an already Ready version creates a new version rather than silently rewriting history."}</p>
            <p>Operation <code className="text-foreground">{pendingReview.identity.operationId}</code> is frozen for this review. If the response is lost, Solaris reconciles this same operation before any retry.</p>
          </div>
        ) : "Review the Edition share-graphics operation."}
        confirmLabel={pendingReview?.action === "ready" ? "Make Ready" : "Save draft"}
        busy={busy}
      />
    </AdminPage>
  );
}

function ThemeSummary({ title, status, detail, tone }: { title: string; status: string; detail: string; tone: "neutral" | "info" | "success" | "attention" }) {
  return <AdminCard><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-black text-foreground">{title}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p></div><AdminStatus tone={tone}>{status}</AdminStatus></div></AdminCard>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="admin-section-label">{label}</span><div className="mt-2">{children}</div></label>;
}

function RangeField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void }) {
  return <label className="block"><span className="flex items-center justify-between gap-2"><span className="admin-section-label">{label}</span><span className="text-xs tabular-nums text-muted-foreground">{value}</span></span><input className="mt-3 w-full accent-sky-300" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function IssueList({ title, issues }: { title: string; issues: Array<{ code: string; key?: string }> }) {
  return <div><p className="admin-section-label">{title}</p><ul className="mt-2 space-y-1 text-xs text-muted-foreground">{issues.map((issue, index) => <li key={`${issue.code}-${issue.key ?? ""}-${index}`}>• {issue.code.replaceAll("_", " ").toLowerCase()}{issue.key ? ` · ${issue.key}` : ""}</li>)}</ul></div>;
}

function JuryShareSamplePreview({ editionName, composition, hasArtwork }: { editionName: string; composition: JuryShareThemeComposition; hasArtwork: boolean }) {
  return (
    <div className="mx-auto aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-[28px] border border-white/[0.1] bg-[#071226] p-4 shadow-2xl" aria-label={`Sample ${editionName} jury share card preview`}>
      <div className="flex h-full flex-col">
        <div className={`rounded-2xl border border-white/[0.08] bg-white/[0.05] px-3 py-4 ${composition.header.alignment === "center" ? "text-center" : "text-left"}`}>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/60">{editionName}</p>
          <p className="mt-1 text-base font-black text-white">Grand Final · Jury votes</p>
          {hasArtwork ? <p className="mt-1 text-[9px] text-sky-100/60">Edition artwork · {composition.artwork?.placement ?? "configured"}</p> : null}
        </div>
        <div className="mt-3 flex-1 space-y-1.5 overflow-hidden">
          {SAMPLE_VOTES.map(([country, points], index) => (
            <div key={country} className={`flex items-center gap-2 border px-2.5 text-[10px] font-bold ${index === 0 ? "border-amber-200/30 bg-amber-100/15 text-amber-50" : "border-white/[0.07] bg-white/[0.055] text-white"}`} style={{ minHeight: Math.max(28, composition.scoreboard.rowHeight * 0.29), borderRadius: composition.scoreboard.rowRadius * 0.35 }}>
              <span className="grid size-5 shrink-0 place-items-center rounded-md bg-white/10 text-[8px]">FLAG</span><span className="min-w-0 flex-1 truncate">{country}</span><span className="tabular-nums">{points}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] p-3 text-center"><p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/50">Votes of</p><p className="mt-1 text-lg font-black text-white">SOURCE COUNTRY</p></div>
      </div>
    </div>
  );
}
