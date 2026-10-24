import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BarChart3, Calculator, Clock3, ExternalLink, Globe2, ListChecks, ListOrdered, MoreHorizontal, Plus, RadioTower, Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAdminContext } from "@/components/admin/AdminContext";
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
import { getMergedTelevotingRoundsPage } from "@/integrations/televoting/rounds.functions";
import { resolveBroadcast, type ShowModeManualPhase } from "@/lib/broadcast";
import { editionLabel, useEdition, useParticipants, useShows, type Show } from "@/lib/data";
import { DEFAULT_PUBLICATION_CONFIG, hasAnyPublicInformation, resolveShowPublication } from "@/lib/publication";
import {
  createShow,
  createShowLifecycleIdentity,
  deleteShow as executeShowDelete,
  previewShowLifecycle,
  reauthenticateShowLifecycleR3,
  updateShow,
  updateShowMode,
  type ShowLifecycleIdentity,
  type ShowLifecyclePreview,
} from "@/lib/show-lifecycle-authority";
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

type ShowIdentitySnapshot = {
  name: string;
  kind: string;
  sortOrder: number;
};

type PendingShowSaveReview = {
  mode: "create" | "update";
  editionId: string;
  showId: string | null;
  showName: string;
  before: ShowIdentitySnapshot | null;
  after: ShowIdentitySnapshot;
  expectedVersion: number | null;
  identity: ShowLifecycleIdentity;
};

type ShowModeDraft = {
  phase: ShowModeManualPhase;
  scheduledStart: string;
  youtubeUrl: string;
  televoteRoundId: string;
};

type ResolvedShowMode = ReturnType<typeof resolveBroadcast>["showMode"];

type ShowModeSnapshot = {
  phase: ShowModeManualPhase;
  scheduledStart: string | null;
  youtubeUrl: string;
  televoteRoundId: string | null;
};

type PendingShowModeReview = {
  editionId: string;
  showId: string;
  showName: string;
  expectedVersion: number;
  before: ShowModeSnapshot;
  after: ShowModeSnapshot;
  identity: ShowLifecycleIdentity;
};

type PendingShowDeleteReview = {
  editionId: string;
  showId: string;
  showName: string;
  preview: ShowLifecyclePreview;
  identity: ShowLifecycleIdentity;
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

function showModeSnapshot(config: ResolvedShowMode): ShowModeSnapshot {
  return {
    phase: config.phase,
    scheduledStart: config.scheduledStart,
    youtubeUrl: config.youtubeUrl,
    televoteRoundId: config.televoteRoundId ?? null,
  };
}

function sameShowMode(left: ShowModeSnapshot, right: ShowModeSnapshot) {
  return (
    left.phase === right.phase &&
    left.scheduledStart === right.scheduledStart &&
    left.youtubeUrl === right.youtubeUrl &&
    left.televoteRoundId === right.televoteRoundId
  );
}

function sameShowIdentity(preview: ShowLifecyclePreview, snapshot: ShowIdentitySnapshot) {
  return (
    preview.show.name === snapshot.name &&
    preview.show.kind === snapshot.kind &&
    preview.show.sortOrder === snapshot.sortOrder
  );
}

function sameDeleteReview(left: ShowLifecyclePreview, right: ShowLifecyclePreview) {
  return (
    left.expectedVersion === right.expectedVersion &&
    left.publication.state === right.publication.state &&
    left.publication.version === right.publication.version &&
    left.publication.hasPublicInformation === right.publication.hasPublicInformation &&
    left.dependencies.blockingTableCount === right.dependencies.blockingTableCount &&
    left.dependencies.blockingReferenceCount === right.dependencies.blockingReferenceCount &&
    JSON.stringify(left.dependencies.tables) === JSON.stringify(right.dependencies.tables) &&
    left.delete.allowed === right.delete.allowed &&
    JSON.stringify(left.delete.blockers) === JSON.stringify(right.delete.blockers)
  );
}

function showModeValue(value: string | null) {
  return value || "Not set";
}

function ShowsWorkspace() {
  const { slug } = Route.useParams();
  const { editionId: organizerEditionId } = useAdminContext();
  const qc = useQueryClient();
  const getRoundsPage = useServerFn(getMergedTelevotingRoundsPage);
  const { data: edition, isLoading: loadingEdition } = useEdition(slug);
  const { data: shows = [], isLoading: loadingShows } = useShows(edition?.id);
  const { data: participants = [] } = useParticipants(edition?.id);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<ShowDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [actionsTarget, setActionsTarget] = useState<Show | null>(null);
  const [pendingShowSaveReview, setPendingShowSaveReview] = useState<PendingShowSaveReview | null>(null);
  const [showModeTarget, setShowModeTarget] = useState<Show | null>(null);
  const [showModeDraft, setShowModeDraft] = useState<ShowModeDraft>(emptyShowModeDraft);
  const [pendingShowModeReview, setPendingShowModeReview] = useState<PendingShowModeReview | null>(null);
  const [pendingDeleteReview, setPendingDeleteReview] = useState<PendingShowDeleteReview | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [deletePassword, setDeletePassword] = useState("");

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

  useEffect(() => {
    setPendingShowSaveReview(null);
    setPendingShowModeReview(null);
    setPendingDeleteReview(null);
    setShowModeTarget(null);
    setSheetOpen(false);
    setDeleteReason("");
    setDeletePassword("");
  }, [organizerEditionId]);

  async function refresh() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["shows"] }),
      qc.invalidateQueries({ queryKey: ["participants"] }),
      qc.invalidateQueries({ queryKey: ["edition"] }),
    ]);
  }

  function assertEditionScope(target?: Show | null) {
    if (!edition || organizerEditionId !== edition.id || (target && target.edition_id !== edition.id)) {
      toast.error("Edition context changed before the show command. Reload Shows before retrying.");
      return false;
    }
    return true;
  }

  function openCreate() {
    setPendingShowSaveReview(null);
    setDraft({ ...emptyDraft, sort_order: (orderedShows.at(-1)?.sort_order ?? 0) + 1 });
    setSheetOpen(true);
  }

  function openEdit(show: Show) {
    setPendingShowSaveReview(null);
    setDraft({ id: show.id, name: show.name, kind: show.kind as ShowDraft["kind"], sort_order: show.sort_order });
    setSheetOpen(true);
  }

  function openShowMode(show: Show) {
    const config = resolveBroadcast(show.broadcast_config).showMode;
    setPendingShowModeReview(null);
    setShowModeTarget(show);
    setShowModeDraft({
      phase: config.phase,
      scheduledStart: isoToLocalInput(config.scheduledStart),
      youtubeUrl: config.youtubeUrl,
      televoteRoundId: config.televoteRoundId ?? "",
    });
  }

  async function reviewShowSave() {
    if (!edition || !draft.name.trim() || !assertEditionScope() || busy) return;
    if (!Number.isInteger(draft.sort_order) || draft.sort_order < 1) {
      toast.error("Show order must be a positive whole number.");
      return;
    }

    const after: ShowIdentitySnapshot = {
      name: draft.name.trim(),
      kind: draft.kind,
      sortOrder: draft.sort_order,
    };

    setBusy(true);
    try {
      if (draft.id) {
        const target = shows.find((show) => show.id === draft.id) ?? null;
        if (!target || !assertEditionScope(target)) return;
        const preview = await previewShowLifecycle({ editionId: edition.id, showId: draft.id });
        if (organizerEditionId !== edition.id) {
          throw new Error("Edition context changed while the show review was loading. Nothing was applied.");
        }
        const before: ShowIdentitySnapshot = {
          name: preview.show.name,
          kind: preview.show.kind,
          sortOrder: preview.show.sortOrder,
        };
        setPendingShowSaveReview({
          mode: "update",
          editionId: edition.id,
          showId: draft.id,
          showName: preview.show.name,
          before,
          after,
          expectedVersion: preview.expectedVersion,
          identity: createShowLifecycleIdentity("show-update"),
        });
      } else {
        setPendingShowSaveReview({
          mode: "create",
          editionId: edition.id,
          showId: null,
          showName: after.name,
          before: null,
          after,
          expectedVersion: null,
          identity: createShowLifecycleIdentity("show-create"),
        });
      }
      setSheetOpen(false);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Show review could not be prepared");
    } finally {
      setBusy(false);
    }
  }

  async function applyShowSaveReview() {
    if (!pendingShowSaveReview || busy) return;
    const review = pendingShowSaveReview;
    if (!edition || organizerEditionId !== review.editionId || edition.id !== review.editionId) {
      setPendingShowSaveReview(null);
      toast.error("Edition context changed while this show review was open. Nothing was applied.");
      return;
    }

    setBusy(true);
    try {
      if (review.mode === "update") {
        if (!review.showId || review.expectedVersion == null || !review.before) {
          throw new Error("The reviewed Show update is incomplete. Reopen the editor and review it again.");
        }
        const live = await previewShowLifecycle({ editionId: review.editionId, showId: review.showId });
        if (organizerEditionId !== review.editionId) {
          throw new Error("Edition context changed during Show revalidation. Nothing was applied.");
        }
        if (live.expectedVersion !== review.expectedVersion || !sameShowIdentity(live, review.before)) {
          throw new Error("The Show changed while this review was open. Nothing was applied. Reopen the editor from current state.");
        }
        const result = await updateShow({
          editionId: review.editionId,
          showId: review.showId,
          name: review.after.name,
          kind: review.after.kind,
          sortOrder: review.after.sortOrder,
          expectedVersion: review.expectedVersion,
          identity: review.identity,
        });
        toast.success(`Show updated · v${result.stateVersion} · receipt ${result.receiptId.slice(0, 8)}`);
      } else {
        const result = await createShow({
          editionId: review.editionId,
          name: review.after.name,
          kind: review.after.kind,
          sortOrder: review.after.sortOrder,
          publicationConfig: DEFAULT_PUBLICATION_CONFIG as unknown as Record<string, unknown>,
          identity: review.identity,
        });
        toast.success(`Show created · v${result.stateVersion} · receipt ${result.receiptId.slice(0, 8)}`);
      }
      setPendingShowSaveReview(null);
      await refresh();
    } catch (caught) {
      await refresh();
      toast.error(caught instanceof Error ? caught.message : "Show could not be saved");
    } finally {
      setBusy(false);
    }
  }

  async function reviewShowMode() {
    if (!showModeTarget || !edition || !assertEditionScope(showModeTarget) || busy) return;

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
      const preview = await previewShowLifecycle({ editionId: edition.id, showId: showModeTarget.id });
      if (organizerEditionId !== edition.id) {
        throw new Error("Edition context changed while the Show Mode review was loading. Nothing was applied.");
      }
      const current = resolveBroadcast(preview.show.broadcastConfig).showMode;
      const transitioned = transitionShowModePhase(current, showModeDraft.phase);
      const next: ResolvedShowMode = {
        ...transitioned,
        scheduledStart,
        youtubeUrl: safeYoutube ?? "",
        televoteRoundId: showModeDraft.televoteRoundId || null,
      };

      setPendingShowModeReview({
        editionId: edition.id,
        showId: showModeTarget.id,
        showName: preview.show.name,
        expectedVersion: preview.expectedVersion,
        before: showModeSnapshot(current),
        after: showModeSnapshot(next),
        identity: createShowLifecycleIdentity("show-mode"),
      });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Show Mode transition is not valid.");
    } finally {
      setBusy(false);
    }
  }

  async function applyShowModeReview() {
    if (!pendingShowModeReview || busy) return;
    const review = pendingShowModeReview;
    if (!edition || organizerEditionId !== review.editionId || edition.id !== review.editionId) {
      setPendingShowModeReview(null);
      toast.error("Edition context changed while this Show Mode review was open. Nothing was applied.");
      return;
    }

    setBusy(true);
    try {
      const live = await previewShowLifecycle({ editionId: review.editionId, showId: review.showId });
      if (organizerEditionId !== review.editionId) {
        throw new Error("Edition context changed during Show Mode revalidation. Nothing was applied.");
      }
      const current = resolveBroadcast(live.show.broadcastConfig).showMode;
      if (live.expectedVersion !== review.expectedVersion || !sameShowMode(showModeSnapshot(current), review.before)) {
        throw new Error("Show Mode changed while this review was open. Nothing was applied. Reopen the review from the current state.");
      }
      transitionShowModePhase(current, review.after.phase);

      const result = await updateShowMode({
        editionId: review.editionId,
        showId: review.showId,
        phase: review.after.phase,
        scheduledStart: review.after.scheduledStart,
        youtubeUrl: review.after.youtubeUrl,
        televoteRoundId: review.after.televoteRoundId,
        expectedVersion: review.expectedVersion,
        identity: review.identity,
      });

      toast.success(`Show Mode updated · v${result.stateVersion} · receipt ${result.receiptId.slice(0, 8)}`);
      setPendingShowModeReview(null);
      setShowModeTarget(null);
      await refresh();
    } catch (caught) {
      await refresh();
      toast.error(caught instanceof Error ? caught.message : "Show Mode could not be updated");
    } finally {
      setBusy(false);
    }
  }

  async function openDeleteReview(show: Show) {
    if (!edition || !assertEditionScope(show) || busy) return;
    setActionsTarget(null);
    setBusy(true);
    try {
      const preview = await previewShowLifecycle({ editionId: edition.id, showId: show.id });
      if (organizerEditionId !== edition.id) {
        throw new Error("Edition context changed while deletion preflight was loading. Nothing was applied.");
      }
      setDeleteReason("");
      setDeletePassword("");
      setPendingDeleteReview({
        editionId: edition.id,
        showId: show.id,
        showName: preview.show.name,
        preview,
        identity: createShowLifecycleIdentity("show-delete"),
      });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Show deletion review could not be prepared");
    } finally {
      setBusy(false);
    }
  }

  async function deleteShow() {
    if (!pendingDeleteReview || busy) return;
    const review = pendingDeleteReview;
    if (!edition || organizerEditionId !== review.editionId || edition.id !== review.editionId) {
      setPendingDeleteReview(null);
      toast.error("Edition context changed while this deletion review was open. Nothing was deleted.");
      return;
    }
    if (!review.preview.delete.allowed) {
      toast.error("System preflight blocks permanent deletion for this Show.");
      return;
    }
    if (deleteReason.trim().length < 5) {
      toast.error("Give a deletion reason of at least 5 characters.");
      return;
    }

    setBusy(true);
    try {
      const live = await previewShowLifecycle({ editionId: review.editionId, showId: review.showId });
      if (organizerEditionId !== review.editionId) {
        throw new Error("Edition context changed during deletion revalidation. Nothing was deleted.");
      }
      if (!sameDeleteReview(live, review.preview)) {
        throw new Error("Show publication or dependency state changed while this deletion review was open. Nothing was deleted. Review current System preflight again.");
      }
      if (!live.delete.allowed) {
        throw new Error(`System now blocks deletion: ${live.delete.blockers.join(" · ") || "dependency state changed"}.`);
      }
      if (live.delete.requiresFreshAuthentication) {
        await reauthenticateShowLifecycleR3(deletePassword);
      }
      const result = await executeShowDelete({
        editionId: review.editionId,
        showId: review.showId,
        expectedVersion: review.preview.expectedVersion,
        reason: deleteReason.trim(),
        identity: review.identity,
      });
      toast.success(`${review.showName} deleted · receipt ${result.receiptId.slice(0, 8)}`);
      setPendingDeleteReview(null);
      setDeleteReason("");
      setDeletePassword("");
      await refresh();
    } catch (caught) {
      setDeletePassword("");
      await refresh();
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

  if (!organizerEditionId || organizerEditionId !== edition.id) {
    return (
      <AdminPage>
        <AdminCard>
          <AdminEmptyState
            icon={ListChecks}
            title="Confirming edition context"
            description="Shows only operates when this route matches the exact edition selected in Solaris Organizer. It will not create, edit or delete show state in a different edition while context is changing."
            action={<Link to="/admin/control" className="admin-action-secondary">Back to Control</Link>}
          />
        </AdminCard>
      </AdminPage>
    );
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
          <button type="button" disabled={busy || !draft.name.trim()} onClick={() => void reviewShowSave()} className="admin-action-primary w-full">{busy ? "Preparing review…" : draft.id ? "Review changes" : "Review new show"}</button>
        </div>
      </AdminSheet>

      <AdminConfirmSheet
        open={Boolean(pendingShowSaveReview)}
        onClose={busy ? () => undefined : () => setPendingShowSaveReview(null)}
        onConfirm={applyShowSaveReview}
        title={pendingShowSaveReview?.mode === "create" ? `Create ${pendingShowSaveReview.showName}?` : `Update ${pendingShowSaveReview?.showName ?? "show"}?`}
        description={pendingShowSaveReview ? (
          <div className="space-y-3 text-xs">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <p className="font-semibold text-foreground">Exact governed target</p>
              <p className="mt-1 break-all">Edition ID: {pendingShowSaveReview.editionId}</p>
              {pendingShowSaveReview.showId ? <p className="mt-1 break-all">Show ID: {pendingShowSaveReview.showId}</p> : <p className="mt-1">New Show</p>}
              {pendingShowSaveReview.expectedVersion != null ? <p className="mt-1">Reviewed version: {pendingShowSaveReview.expectedVersion}</p> : null}
            </div>
            <div className="overflow-hidden rounded-xl border border-white/[0.08]">
              <div className="grid grid-cols-[90px_1fr_1fr] gap-2 border-b border-white/[0.07] bg-white/[0.025] p-2 font-semibold text-foreground">
                <span>Field</span><span>Current</span><span>After</span>
              </div>
              {[
                ["Name", pendingShowSaveReview.before?.name ?? "New", pendingShowSaveReview.after.name],
                ["Type", pendingShowSaveReview.before?.kind ?? "New", pendingShowSaveReview.after.kind],
                ["Order", pendingShowSaveReview.before ? String(pendingShowSaveReview.before.sortOrder) : "New", String(pendingShowSaveReview.after.sortOrder)],
              ].map(([label, before, after]) => (
                <div key={label} className="grid grid-cols-[90px_1fr_1fr] gap-2 border-b border-white/[0.05] p-2 last:border-b-0">
                  <span className="font-semibold text-foreground">{label}</span>
                  <span className="break-all text-muted-foreground">{before}</span>
                  <span className="break-all text-foreground">{after}</span>
                </div>
              ))}
            </div>
            <p className="leading-5 text-muted-foreground">
              Existing Shows are revalidated against the exact System lifecycle version before commit. The command is edition-scoped, idempotent and receipted; an uncertain transport outcome is reconciled by operation identity rather than blindly retried.
            </p>
          </div>
        ) : null}
        confirmLabel={pendingShowSaveReview?.mode === "create" ? "Create reviewed Show" : "Apply reviewed changes"}
        busy={busy}
      />

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
          <AdminActionItem icon={Trash2} tone="danger" title="Delete show" description="Run canonical dependency preflight before any permanent deletion." disabled={busy} onClick={() => void openDeleteReview(actionsTarget)} />
        </div> : null}
      </AdminSheet>

      <AdminSheet
        open={Boolean(showModeTarget)}
        onClose={() => !busy && !pendingShowModeReview && setShowModeTarget(null)}
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
            onClick={() => void reviewShowMode()}
            className="admin-action-primary w-full"
          >
            {busy ? "Preparing review…" : "Review Show Mode changes"}
          </button>
        </div>
      </AdminSheet>

      <AdminConfirmSheet
        open={Boolean(pendingShowModeReview)}
        onClose={busy ? () => undefined : () => setPendingShowModeReview(null)}
        onConfirm={applyShowModeReview}
        title={pendingShowModeReview ? `Apply Show Mode changes to ${pendingShowModeReview.showName}?` : "Apply Show Mode changes?"}
        description={pendingShowModeReview ? (
          <div className="space-y-3 text-xs">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <p className="font-semibold text-foreground">Exact production target</p>
              <p className="mt-1">Show: {pendingShowModeReview.showName}</p>
              <p className="mt-1 break-all">Show ID: {pendingShowModeReview.showId}</p>
              <p className="mt-1 break-all">Edition ID: {pendingShowModeReview.editionId}</p>
              <p className="mt-1">Reviewed version: {pendingShowModeReview.expectedVersion}</p>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/[0.08]">
              <div className="grid grid-cols-[110px_1fr_1fr] gap-2 border-b border-white/[0.07] bg-white/[0.025] p-2 font-semibold text-foreground">
                <span>Setting</span><span>Current</span><span>After</span>
              </div>
              {[
                ["Phase", pendingShowModeReview.before.phase, pendingShowModeReview.after.phase],
                ["Scheduled", showModeValue(pendingShowModeReview.before.scheduledStart), showModeValue(pendingShowModeReview.after.scheduledStart)],
                ["YouTube", showModeValue(pendingShowModeReview.before.youtubeUrl), showModeValue(pendingShowModeReview.after.youtubeUrl)],
                ["Televote", showModeValue(pendingShowModeReview.before.televoteRoundId), showModeValue(pendingShowModeReview.after.televoteRoundId)],
              ].map(([label, before, after]) => (
                <div key={label} className="grid grid-cols-[110px_1fr_1fr] gap-2 border-b border-white/[0.05] p-2 last:border-b-0">
                  <span className="font-semibold text-foreground">{label}</span>
                  <span className="break-all text-muted-foreground">{before}</span>
                  <span className="break-all text-foreground">{after}</span>
                </div>
              ))}
            </div>
            <p className="leading-5 text-muted-foreground">
              Organizer re-runs canonical Show lifecycle preflight and refuses the command if the reviewed version or Show Mode state changed while this review was open.
            </p>
            <p className="rounded-xl border border-sky-200/15 bg-sky-200/[0.04] p-3 leading-5 text-muted-foreground">
              The final mutation uses the governed Show lifecycle command: exact edition/show scope, optimistic versioning, idempotency, audit evidence and operation-receipt reconciliation stay server-authoritative.
            </p>
          </div>
        ) : null}
        confirmLabel="Apply reviewed Show Mode"
        confirmationText={pendingShowModeReview?.showName}
        confirmationHint={pendingShowModeReview ? `Type ${pendingShowModeReview.showName} exactly to confirm this production configuration change` : undefined}
        busy={busy}
      />

      <AdminConfirmSheet
        open={Boolean(pendingDeleteReview)}
        onClose={() => {
          if (busy) return;
          setPendingDeleteReview(null);
          setDeleteReason("");
          setDeletePassword("");
        }}
        onConfirm={deleteShow}
        title={`Delete ${pendingDeleteReview?.showName ?? "show"}?`}
        description={pendingDeleteReview ? (
          <div className="space-y-3 text-xs">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <p className="font-semibold text-foreground">Canonical deletion preflight</p>
              <p className="mt-1 break-all">Edition ID: {pendingDeleteReview.editionId}</p>
              <p className="mt-1 break-all">Show ID: {pendingDeleteReview.showId}</p>
              <p className="mt-1">Reviewed version: {pendingDeleteReview.preview.expectedVersion}</p>
              <p className="mt-1">Publication: {pendingDeleteReview.preview.publication.state} · v{pendingDeleteReview.preview.publication.version}</p>
              <p className="mt-1">Blocking references: {pendingDeleteReview.preview.dependencies.blockingReferenceCount}</p>
            </div>

            {pendingDeleteReview.preview.delete.blockers.length ? (
              <div className="rounded-xl border border-rose-200/15 bg-rose-200/[0.05] p-3">
                <p className="font-semibold text-rose-50">System blocks deletion</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-rose-50/85">
                  {pendingDeleteReview.preview.delete.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                </ul>
              </div>
            ) : (
              <p className="rounded-xl border border-amber-200/15 bg-amber-200/[0.045] p-3 leading-5 text-amber-50/90">
                Permanent deletion is R3. Solaris will revalidate publication and every discovered canonical dependency again at commit; dependency-bearing or public Show history is not silently cascaded away.
              </p>
            )}

            {Object.entries(pendingDeleteReview.preview.dependencies.tables).filter(([, dependency]) => dependency.count > 0).length ? (
              <div className="rounded-xl border border-white/[0.08] p-3">
                <p className="font-semibold text-foreground">Detected references</p>
                <div className="mt-2 space-y-1 text-muted-foreground">
                  {Object.entries(pendingDeleteReview.preview.dependencies.tables)
                    .filter(([, dependency]) => dependency.count > 0)
                    .map(([table, dependency]) => (
                      <p key={table} className="break-all">{table}: {dependency.count} · {dependency.deleteAction}{dependency.blocking ? " · blocking" : ""}</p>
                    ))}
                </div>
              </div>
            ) : null}

            <label className="block">
              <span className="font-semibold text-foreground">Deletion reason</span>
              <textarea
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder="Why is permanent deletion appropriate instead of retaining this Show?"
                rows={3}
                className="mt-2 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 py-2 text-sm text-foreground outline-none focus:border-sky-200/30"
              />
            </label>

            {pendingDeleteReview.preview.delete.requiresFreshAuthentication ? (
              <label className="block">
                <span className="font-semibold text-foreground">Current Solaris password</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  className="mt-2 min-h-11 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] px-3 text-sm text-foreground outline-none focus:border-sky-200/30"
                />
                <p className="mt-1 leading-5 text-muted-foreground">Fresh authentication is required immediately before the permanent command.</p>
              </label>
            ) : null}
          </div>
        ) : null}
        confirmLabel="Delete show permanently"
        confirmationText={pendingDeleteReview?.showName}
        confirmationHint={pendingDeleteReview ? `Type ${pendingDeleteReview.showName} exactly to confirm permanent deletion` : undefined}
        confirmDisabled={Boolean(
          pendingDeleteReview && (
            !pendingDeleteReview.preview.delete.allowed ||
            deleteReason.trim().length < 5 ||
            (pendingDeleteReview.preview.delete.requiresFreshAuthentication && !deletePassword.trim())
          )
        )}
        busy={busy}
        danger
      />
    </AdminPage>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="admin-card px-3 py-3 text-center"><p className="numeric text-xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{label}</p></div>;
}