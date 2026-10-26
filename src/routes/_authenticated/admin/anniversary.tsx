import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, CheckCircle2, History, Plus, RefreshCw, Save, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminConfirmSheet,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import {
  executeStudio2StoryOperation,
  loadStudio2Storytelling,
  storyOperationLabel,
  type StoryOperationExecution,
  type StorylineItem,
} from "@/lib/studio2-storytelling";

export const Route = createFileRoute("/_authenticated/admin/anniversary")({
  head: () => ({
    meta: [
      { title: "Anniversary Settings — Solaris Studio" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AnniversarySettingsPage,
});

const PREVIEWS = [
  { href: "/?anniversary=active", title: "Anniversary Day", description: "Full 17 September takeover with particles, archive facts and homepage anniversary editorial." },
  { href: "/?anniversary=countdown", title: "Countdown", description: "Pre-anniversary state without the full particle takeover." },
  { href: "/anniversary?anniversary=active", title: "Anniversary hub", description: "Open the permanent anniversary archive with published historical story data." },
  { href: "/my-solaris?anniversary=active", title: "MySolaris story", description: "Preview the route-native personalized country anniversary recap and share text." },
  { href: "/countries?anniversary=active", title: "Countries archive", description: "Preview the country directory with anniversary context and canonical delegation statistics." },
  { href: "/records?anniversary=active", title: "Records archive", description: "Preview the record book with anniversary styling and historical context." },
] as const;

type StoryAction = Parameters<typeof executeStudio2StoryOperation>[0]["action"];

type PendingPublication = {
  action: "publish_storyline" | "unpublish_storyline";
  editionId: string;
  editionLabel: string;
  contextVersion: number;
  expectedRevision: number;
  reason: string;
};

type StoryCommandInput = {
  action: StoryAction;
  editionId: string;
  contextVersion: number;
  expectedRevision: number | null;
  reason: string;
  itemId?: string | null;
  payload?: Record<string, unknown>;
};

type MilestoneDraft = {
  id: string | null;
  headline: string;
  summary: string;
  importance: string;
  occurredAt: string;
  included: boolean;
};

const EMPTY_MILESTONE: MilestoneDraft = {
  id: null,
  headline: "",
  summary: "",
  importance: "70",
  occurredAt: "",
  included: true,
};

function AnniversarySettingsPage() {
  const { editionId, editionLabel, editionSlug, contextVersion } = useAdminContext();
  const queryClient = useQueryClient();
  const [auditReason, setAuditReason] = useState("");
  const [draft, setDraft] = useState<MilestoneDraft>(EMPTY_MILESTONE);
  const [pendingPublication, setPendingPublication] = useState<PendingPublication | null>(null);
  const [lastReceipt, setLastReceipt] = useState<StoryOperationExecution | null>(null);

  const storyQuery = useQuery({
    queryKey: ["studio2-storytelling", editionId || "none"],
    enabled: Boolean(editionId),
    queryFn: () => loadStudio2Storytelling(editionId),
    staleTime: 8_000,
  });

  const snapshot = storyQuery.data ?? null;
  const story = snapshot?.storyline ?? null;
  const milestones = useMemo(
    () => (story?.items ?? [])
      .filter((item) => item.manualOverride)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.sortOrder - b.sortOrder),
    [story?.items],
  );

  useEffect(() => {
    setAuditReason("");
    setDraft(EMPTY_MILESTONE);
    setPendingPublication(null);
    setLastReceipt(null);
  }, [editionId, contextVersion]);

  const mutation = useMutation({
    mutationFn: async (input: StoryCommandInput) => {
      if (!input.editionId) throw new Error("Select an Organizer edition before changing Anniversary settings.");
      if (input.reason.trim().length < 5) throw new Error("Add an audit reason of at least 5 characters.");
      if (input.editionId !== editionId || input.contextVersion !== contextVersion) {
        throw Object.assign(
          new Error("Organizer context changed. Reload this edition and review the Anniversary change again."),
          { status: 409 },
        );
      }

      return executeStudio2StoryOperation({
        editionId: input.editionId,
        action: input.action,
        reason: input.reason.trim(),
        executionId: crypto.randomUUID(),
        expectedRevision: input.expectedRevision,
        itemId: input.itemId ?? null,
        payload: input.payload ?? {},
      });
    },
    onSuccess: async (execution) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["studio2-storytelling", execution.editionId] }),
        queryClient.invalidateQueries({ queryKey: ["studio2-anniversary-engine"] }),
      ]);
      if (execution.editionId === editionId) setLastReceipt(execution);
      toast.success(`${storyOperationLabel(execution.action)} completed.`);
    },
    onError: (error) => toast.error(operationErrorText(error)),
  });

  function currentCommand(input: Omit<StoryCommandInput, "editionId" | "contextVersion" | "reason">): StoryCommandInput | null {
    const reason = auditReason.trim();
    if (!editionId) {
      toast.error("Select an Organizer edition first.");
      return null;
    }
    if (reason.length < 5) {
      toast.error("Add an audit reason of at least 5 characters.");
      return null;
    }
    return {
      ...input,
      editionId,
      contextVersion,
      reason,
    };
  }

  async function ensureStoryline() {
    const command = currentCommand({
      action: "generate_storyline",
      expectedRevision: story?.revision ?? null,
      payload: story
        ? {}
        : {
            title: `${editionLabel || "Edition"}: The Story`,
            introduction: `A verified timeline of the moments that shaped ${editionLabel || "this edition"}, assembled from the canonical Solaris Studio event stream.`,
          },
    });
    if (command) await mutation.mutateAsync(command);
  }

  function editMilestone(item: StorylineItem) {
    setDraft({
      id: item.id,
      headline: item.headline,
      summary: item.summary,
      importance: String(item.importance),
      occurredAt: toLocalDateTime(item.occurredAt),
      included: item.included,
    });
  }

  async function saveMilestone() {
    if (!story) {
      toast.error("Generate the canonical edition storyline before adding an Anniversary milestone.");
      return;
    }
    const importance = Number(draft.importance);
    if (!Number.isFinite(importance) || importance < 0 || importance > 100) {
      toast.error("Importance must be between 0 and 100.");
      return;
    }
    if (draft.headline.trim().length < 3 || draft.summary.trim().length < 3) {
      toast.error("Headline and summary must each be at least 3 characters.");
      return;
    }

    const payload: Record<string, unknown> = {
      headline: draft.headline.trim(),
      summary: draft.summary.trim(),
      importance,
      included: draft.included,
    };
    if (!draft.id && draft.occurredAt) payload.occurredAt = new Date(draft.occurredAt).toISOString();

    const command = currentCommand({
      action: draft.id ? "update_item" : "create_manual_item",
      itemId: draft.id,
      expectedRevision: story.revision,
      payload,
    });
    if (!command) return;
    await mutation.mutateAsync(command);
    setDraft(EMPTY_MILESTONE);
  }

  function reviewPublication(action: PendingPublication["action"]) {
    const reason = auditReason.trim();
    if (!editionId || !story) return;
    if (reason.length < 5) {
      toast.error("Add an audit reason of at least 5 characters before reviewing publication.");
      return;
    }
    setPendingPublication({
      action,
      editionId,
      editionLabel: editionLabel || snapshot?.edition.name || "Selected edition",
      contextVersion,
      expectedRevision: story.revision,
      reason,
    });
  }

  async function applyPublication() {
    if (!pendingPublication) return;
    const reviewed = pendingPublication;
    if (reviewed.editionId !== editionId || reviewed.contextVersion !== contextVersion) {
      setPendingPublication(null);
      toast.error("Organizer context changed after publication review. Review the operation again in the selected edition.");
      return;
    }
    await mutation.mutateAsync({
      action: reviewed.action,
      editionId: reviewed.editionId,
      contextVersion: reviewed.contextVersion,
      expectedRevision: reviewed.expectedRevision,
      reason: reviewed.reason,
    });
    setPendingPublication(null);
  }

  const loading = storyQuery.isLoading;
  const error = storyQuery.error;

  return (
    <AdminPage>
      <div className="mx-auto max-w-5xl space-y-4">
        <AdminPageHeader
          eyebrow="Storytelling · Anniversary"
          title="Anniversary Settings"
          description="Manage Anniversary editorial milestones through the canonical Storytelling operation contract, then preview the public experience. Historical edition dates remain a separate governed authority."
          actions={
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/storytelling" className="admin-action-secondary">Full Storytelling workspace</Link>
              <Link to="/admin/anniversary-dates" className="admin-action-secondary">Historical edition dates</Link>
            </div>
          }
        />

        {!editionId ? (
          <AdminCard>
            <AdminEmptyState
              icon={CalendarDays}
              title="No edition selected"
              description="Select the exact Organizer edition before managing Anniversary content. Solaris will not substitute the newest or globally active edition."
            />
          </AdminCard>
        ) : loading ? (
          <AdminCard><p className="py-12 text-center text-sm text-muted-foreground">Loading canonical Storytelling state…</p></AdminCard>
        ) : error ? (
          <AdminCard>
            <AdminEmptyState icon={History} title="Anniversary settings unavailable" description={operationErrorText(error)} />
          </AdminCard>
        ) : snapshot ? (
          <>
            <AdminCard strong>
              <AdminCardHeader
                eyebrow={editionLabel || snapshot.edition.name}
                title={story ? story.title : "Canonical storyline not generated"}
                description={story
                  ? `Revision ${story.revision}. Anniversary milestones below are manual Storytelling items and publish only with the edition storyline.`
                  : "Create the canonical edition storyline before adding Anniversary milestones. This uses the existing server-authoritative Storytelling operation rather than a second Anniversary database writer."}
                action={story ? (
                  <AdminStatus tone={story.status === "published" ? "ready" : "attention"}>
                    {story.status === "published" ? "Published" : "Draft"}
                  </AdminStatus>
                ) : undefined}
              />
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="admin-action-primary" disabled={mutation.isPending} onClick={() => void ensureStoryline()}>
                  <RefreshCw className="size-4" /> {story ? "Refresh from canonical events" : "Generate storyline"}
                </button>
                {story ? (
                  <button
                    type="button"
                    className="admin-action-secondary"
                    disabled={mutation.isPending}
                    onClick={() => reviewPublication(story.status === "published" ? "unpublish_storyline" : "publish_storyline")}
                  >
                    <Save className="size-4" /> {story.status === "published" ? "Review unpublish" : "Review publication"}
                  </button>
                ) : null}
                {editionSlug ? (
                  <a href={`/stories/${editionSlug}`} target="_blank" rel="noreferrer" className="admin-action-secondary">Public story</a>
                ) : null}
              </div>
            </AdminCard>

            <AdminCard>
              <AdminCardHeader
                eyebrow="Operation scope"
                title="Audit reason"
                description="Every Anniversary editorial mutation is bound to the selected edition, expected Storytelling revision and one server execution identity. A stale revision is refused rather than overwritten."
              />
              <input
                aria-label="Anniversary audit reason"
                value={auditReason}
                onChange={(event) => setAuditReason(event.target.value)}
                placeholder="e.g. Add the official tenth-anniversary milestone"
                className="min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm outline-none focus:border-sky-200/30"
              />
            </AdminCard>

            {story ? (
              <AdminCard>
                <AdminCardHeader
                  eyebrow="Governed editorial milestones"
                  title={draft.id ? "Edit milestone" : "Add milestone"}
                  description="Milestones use Storytelling's revisioned, idempotent server command and immutable execution receipt. Removing a milestone from Anniversary output preserves its history by marking it excluded instead of deleting evidence."
                  action={draft.id ? (
                    <button type="button" className="admin-action-secondary" onClick={() => setDraft(EMPTY_MILESTONE)}>New milestone</button>
                  ) : undefined}
                />
                <div className="grid gap-3">
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                    Headline
                    <input value={draft.headline} onChange={(event) => setDraft((current) => ({ ...current, headline: event.target.value }))} className="min-h-11 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground" />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                    Summary
                    <textarea value={draft.summary} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} rows={3} className="rounded-xl border border-white/[0.1] bg-white/[0.035] p-3 text-sm text-foreground" />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                      Importance · 0–100
                      <input inputMode="numeric" value={draft.importance} onChange={(event) => setDraft((current) => ({ ...current, importance: event.target.value }))} className="min-h-11 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground" />
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
                      Occurred at {draft.id ? "(fixed after creation)" : ""}
                      <input type="datetime-local" disabled={Boolean(draft.id)} value={draft.occurredAt} onChange={(event) => setDraft((current) => ({ ...current, occurredAt: event.target.value }))} className="min-h-11 rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground disabled:opacity-60" />
                    </label>
                  </div>
                  <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-sm">
                    <span><span className="block font-semibold">Include in published storyline</span><span className="mt-1 block text-xs text-muted-foreground">Excluding keeps the audited milestone but removes it from public Storytelling output.</span></span>
                    <input type="checkbox" checked={draft.included} onChange={(event) => setDraft((current) => ({ ...current, included: event.target.checked }))} className="size-5 shrink-0" />
                  </label>
                  <button type="button" disabled={mutation.isPending} onClick={() => void saveMilestone()} className="admin-action-primary justify-self-start">
                    <Plus className="size-4" /> {draft.id ? "Save reviewed milestone" : "Add reviewed milestone"}
                  </button>
                </div>
              </AdminCard>
            ) : null}

            {story ? (
              <AdminCard>
                <AdminCardHeader
                  eyebrow="Current canonical state"
                  title={`Manual milestones · ${milestones.length}`}
                  description="This list is read back from the authoritative Storytelling snapshot after every command. No optimistic milestone is shown before server acknowledgement."
                />
                {milestones.length ? (
                  <div className="space-y-2">
                    {milestones.map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => editMilestone(item)}
                        className="flex w-full items-start justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 text-left transition-colors hover:bg-white/[0.05]"
                      >
                        <span>
                          <span className="block text-sm font-semibold text-foreground">{item.headline}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">{new Date(item.occurredAt).toLocaleString()} · importance {item.importance}</span>
                        </span>
                        <AdminStatus tone={item.included ? "ready" : "neutral"}>{item.included ? "Included" : "Excluded"}</AdminStatus>
                      </button>
                    ))}
                  </div>
                ) : (
                  <AdminEmptyState icon={Sparkles} title="No manual milestones" description="Canonical event-derived moments remain in Storytelling. Add only Anniversary milestones that require explicit editorial authorship." />
                )}
              </AdminCard>
            ) : null}

            {lastReceipt ? (
              <AdminCard>
                <AdminCardHeader
                  eyebrow="Operation receipt"
                  title={storyOperationLabel(lastReceipt.action)}
                  description="The server acknowledged this exact Storytelling operation. If the original response was lost and replayed, Solaris reuses the same execution identity instead of duplicating the mutation."
                  action={<AdminStatus tone="ready"><CheckCircle2 className="mr-1 size-3" /> Acknowledged</AdminStatus>}
                />
                <dl className="grid gap-2 text-xs sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Execution</dt><dd className="mt-1 break-all font-mono text-foreground">{lastReceipt.executionId}</dd></div>
                  <div><dt className="text-muted-foreground">Revision</dt><dd className="mt-1 font-semibold text-foreground">{lastReceipt.revision}</dd></div>
                  <div><dt className="text-muted-foreground">Edition</dt><dd className="mt-1 break-all font-mono text-foreground">{lastReceipt.editionId}</dd></div>
                  <div><dt className="text-muted-foreground">Replay</dt><dd className="mt-1 font-semibold text-foreground">{lastReceipt.idempotentReplay ? "Recovered existing receipt" : "New execution"}</dd></div>
                </dl>
              </AdminCard>
            ) : null}
          </>
        ) : null}

        <AdminCard>
          <AdminCardHeader
            eyebrow="Historical authority"
            title="Edition dates remain separate"
            description="Historical event-date/year changes are not part of this cutover. They stay in the dedicated date editor until System #633 provides its versioned, idempotent, receipted edition-date command."
            action={<AdminStatus tone="attention">System dependency</AdminStatus>}
          />
          <div className="mt-4"><Link to="/admin/anniversary-dates" className="admin-action-secondary">Open historical date editor →</Link></div>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader
            eyebrow="Preview states"
            title="Open an Anniversary surface"
            description="Preview URLs change only the current browser presentation. Official milestone/publication state comes from the canonical Storytelling snapshot above."
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {PREVIEWS.map((preview) => (
              <a key={preview.href} href={preview.href} target="_blank" rel="noreferrer" className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06]">
                <p className="text-sm font-semibold text-foreground">{preview.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{preview.description}</p>
                <p className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-primary">Open preview →</p>
              </a>
            ))}
          </div>
        </AdminCard>
      </div>

      <AdminConfirmSheet
        open={Boolean(pendingPublication)}
        onClose={() => setPendingPublication(null)}
        onConfirm={() => void applyPublication()}
        title={pendingPublication?.action === "publish_storyline" ? "Publish Anniversary editorial state?" : "Unpublish Anniversary editorial state?"}
        description={pendingPublication?.action === "publish_storyline"
          ? `Publish reviewed revision ${pendingPublication.expectedRevision} for ${pendingPublication.editionLabel}. The server rechecks that exact revision before making it public.`
          : `Remove reviewed revision ${pendingPublication?.expectedRevision ?? "?"} from public Storytelling for ${pendingPublication?.editionLabel ?? "the selected edition"}. Historical operation evidence remains.`}
        confirmLabel={pendingPublication?.action === "publish_storyline" ? "Publish reviewed revision" : "Unpublish reviewed revision"}
        busy={mutation.isPending}
        danger={pendingPublication?.action === "unpublish_storyline"}
      />
    </AdminPage>
  );
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function operationErrorText(error: unknown) {
  const message = error instanceof Error ? error.message : "Anniversary operation failed.";
  const status = typeof error === "object" && error && "status" in error
    ? Number((error as { status?: unknown }).status)
    : null;
  if (status === 409 || /stale|revision|state changed|conflict/i.test(message)) {
    return `Anniversary state changed while you were reviewing it. Reload the canonical state and try again. ${message}`;
  }
  if (/permission|forbidden|not authorized|authorization/i.test(message)) {
    return `You are not authorized to perform this Anniversary operation. ${message}`;
  }
  return message;
}
