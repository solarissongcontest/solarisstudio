import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { ExternalLink, LockKeyhole, RadioTower, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminCard, AdminConfirmSheet, AdminStatus } from "@/components/admin/AdminUI";
import { supabase as typedSupabase } from "@/integrations/supabase/client";
import { useEdition, useShows } from "@/lib/data";
import { resolveVoting } from "@/lib/voting";
import {
  isJuryWindowReviewScopeCurrent,
  resolveJuryWindowReadState,
  selectJuryWindowShow,
} from "@/lib/jury-window-control-state";
import { useOrganisationBackendContract } from "@/lib/organisation-backend-contract";

const supabase = typedSupabase as any;

type WindowRow = {
  show_id: string;
  edition_id: string;
  status: "open" | "closed";
  opened_at: string | null;
  closed_at: string | null;
  updated_at: string;
};

type JuryWindowPreview = {
  riskClass: "R2";
  showId: string;
  showName: string;
  editionId: string;
  requestedStatus: "open" | "closed";
  currentStatus: "open" | "closed";
  expectedVersion: number;
  submittedBallots: number;
  otherOpenWindows: Array<{ showId: string; showName: string }>;
  juryEnabled: boolean;
  allowSelfVote: boolean;
  participantCount: number;
  juryPointCount: number;
  alreadyApplied: boolean;
};

type PendingWindowChange = {
  status: "open" | "closed";
  preview: JuryWindowPreview;
  operationId: string;
  idempotencyKey: string;
};

export function JuryVotingWindowControl() {
  const location = useRouterState({
    select: (state) => ({ pathname: state.location.pathname, search: state.location.search }),
  });
  const match = location.pathname.match(/^\/admin\/jury\/([^/]+)\/?$/i);
  const matchedSlug = match?.[1];
  const slug = matchedSlug ? decodeURIComponent(matchedSlug) : null;
  const { data: edition } = useEdition(slug ?? "");
  const {
    data: shows = [],
    isLoading: showsLoading,
    isError: showsError,
    refetch: refetchShows,
  } = useShows(edition?.id);
  const queryClient = useQueryClient();
  const backend = useOrganisationBackendContract();
  const juryOperationsSupported =
    backend.data?.capabilities.juryWindowOperations === true;
  const [pendingChange, setPendingChange] = useState<PendingWindowChange | null>(null);

  const searchShow =
    location.search && typeof location.search === "object"
      ? (location.search as Record<string, unknown>).show
      : null;
  const orderedShows = [...shows].sort((a, b) => a.sort_order - b.sort_order);
  const requestedShowId = typeof searchShow === "string" ? searchShow : null;
  const selectedShow = selectJuryWindowShow(orderedShows, requestedShowId);

  // A reviewed R2 operation belongs to one exact edition/show. Never retain
  // its confirmation across a context switch, even within the same route.
  useEffect(() => {
    setPendingChange(null);
  }, [edition?.id, selectedShow?.id]);

  const { data: windows, isLoading, isError, isRefetchError, refetch } = useQuery<WindowRow[]>({
    enabled: Boolean(edition?.id && slug),
    queryKey: ["jury-voting-windows", edition?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jury_voting_windows")
        .select("show_id,edition_id,status,opened_at,closed_at,updated_at")
        .eq("edition_id", edition!.id);
      if (error) throw error;
      return (data ?? []) as WindowRow[];
    },
    staleTime: 5_000,
  });

  const windowState = resolveJuryWindowReadState({
    editionId: edition?.id,
    showId: selectedShow?.id,
    rows: windows,
    isLoading,
    hasError: isError || isRefetchError,
  });
  const windowReady = windowState === "open" || windowState === "closed";
  const currentPendingChange =
    windowReady &&
    isJuryWindowReviewScopeCurrent(pendingChange?.preview, {
      editionId: edition?.id,
      showId: selectedShow?.id,
    })
      ? pendingChange
      : null;

  const previewStatus = useMutation({
    mutationFn: async (status: "open" | "closed") => {
      if (!juryOperationsSupported) {
        throw new Error(
          "The production database does not yet support the safe jury-window operation contract.",
        );
      }
      if (!selectedShow || !edition?.id) throw new Error("Choose an edition and show first");
      if (!windowReady) {
        throw new Error("The current jury-window status could not be verified. Retry the status check.");
      }
      const { data, error } = await supabase.rpc("studio2_jury_window_change_preview", {
        p_show_id: selectedShow.id,
        p_status: status,
      });
      if (error) throw error;
      const preview = data as JuryWindowPreview;
      if (
        !isJuryWindowReviewScopeCurrent(preview, {
          editionId: edition.id,
          showId: selectedShow.id,
        }) ||
        preview.requestedStatus !== status
      ) {
        throw new Error("The jury-window preview did not match the selected edition, show or action.");
      }
      return {
        status,
        preview,
        operationId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
      } satisfies PendingWindowChange;
    },
    onSuccess: (pending) => {
      if (
        !isJuryWindowReviewScopeCurrent(pending.preview, {
          editionId: edition?.id,
          showId: selectedShow?.id,
        })
      ) {
        setPendingChange(null);
        toast.error("The selected jury show changed. Review the new context before making changes.");
        return;
      }
      if (pending.preview.alreadyApplied) {
        setPendingChange(null);
        toast.message(
          pending.status === "open"
            ? "Jury voting is already open for this show."
            : "Jury voting is already closed for this show.",
        );
        return;
      }
      setPendingChange(pending);
    },
    onError: (caught) => {
      toast.error(caught instanceof Error ? caught.message : "Jury voting impact could not be loaded");
    },
  });

  const setStatus = useMutation({
    mutationFn: async (pending: PendingWindowChange) => {
      if (
        !windowReady ||
        !isJuryWindowReviewScopeCurrent(pending.preview, {
          editionId: edition?.id,
          showId: selectedShow?.id,
        })
      ) {
        throw new Error("Jury context or status changed. Load and review a new operation.");
      }
      const { data, error } = await supabase.rpc("studio2_apply_jury_voting_status", {
        p_show_id: pending.preview.showId,
        p_status: pending.status,
        p_operation_id: pending.operationId,
        p_idempotency_key: pending.idempotencyKey,
        p_expected_version: pending.preview.expectedVersion,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async (_data, pending) => {
      setPendingChange(null);
      toast.success(
        pending.status === "open"
          ? "Country-account jury voting opened"
          : "Country-account jury voting closed",
      );
      await queryClient.invalidateQueries({ queryKey: ["jury-voting-windows"] });
    },
    onError: (caught) => {
      toast.error(caught instanceof Error ? caught.message : "Jury voting status could not be changed");
    },
  });

  if (!slug || !edition) return null;

  if (requestedShowId?.trim() && !selectedShow) {
    return (
      <AdminCard strong className="mb-4">
        <p role="alert" className="text-sm text-rose-100">
          {showsLoading
            ? "Checking the selected jury show…"
            : showsError
              ? "Solaris could not verify the shows in this edition. Jury-window operations remain disabled."
              : "This jury voting link refers to a show that does not belong to the selected edition. No voting-window operation is available for this link."}
        </p>
        {!showsLoading && showsError ? (
          <button
            type="button"
            className="admin-action-secondary mt-3 !min-h-10"
            onClick={() => void refetchShows()}
          >
            Retry show lookup
          </button>
        ) : null}
        {!showsLoading && !showsError ? (
          <Link
            to="/admin/jury/$slug"
            params={{ slug }}
            search={{}}
            className="admin-action-secondary mt-3 inline-flex !min-h-10"
          >
            Choose an edition show
          </Link>
        ) : null}
      </AdminCard>
    );
  }

  if (!selectedShow) return null;

  const open = windowState === "open";
  const voting = resolveVoting(selectedShow.voting_config);

  return (
    <AdminCard strong className="mb-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="admin-section-label">Country-account jury voting</p>
            <AdminStatus tone={open ? "ready" : "neutral"}>
              {windowState === "checking"
                ? "Checking…"
                : windowState === "unavailable"
                  ? "Status unavailable"
                  : open
                    ? "Open"
                    : "Closed"}
            </AdminStatus>
          </div>
          <h2 className="mt-1 text-base font-bold text-foreground">{selectedShow.name}</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            When open, signed-in country accounts in this show's jury roster can submit their official ballot. The existing manual jury editor below remains available for organizer entry and corrections.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>{voting.juryPoints.join(" · ")} points</span>
            <span>{voting.allowSelfVote ? "Self-voting allowed" : "Self-voting blocked"}</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3" /> Friend-voting integrity check required</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            to="/jury-voting"
            target="_blank"
            className="admin-action-secondary !min-h-10"
          >
            <ExternalLink className="size-3.5" /> Preview booth
          </Link>
          {open ? (
            <button
              type="button"
              className="admin-action-secondary !min-h-10"
              disabled={
                previewStatus.isPending ||
                setStatus.isPending ||
                !juryOperationsSupported ||
                !windowReady
              }
              onClick={() => previewStatus.mutate("closed")}
            >
              <LockKeyhole className="size-3.5" /> {previewStatus.isPending ? "Checking…" : setStatus.isPending ? "Closing…" : "Close jury voting"}
            </button>
          ) : (
            <button
              type="button"
              className="admin-action-primary !min-h-10"
              disabled={
                previewStatus.isPending ||
                setStatus.isPending ||
                !voting.juryEnabled ||
                !juryOperationsSupported ||
                !windowReady
              }
              onClick={() => previewStatus.mutate("open")}
            >
              <RadioTower className="size-3.5" /> {previewStatus.isPending ? "Checking…" : setStatus.isPending ? "Opening…" : "Open jury voting"}
            </button>
          )}
        </div>
      </div>

      {windowState === "unavailable" ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200/15 bg-rose-200/[0.05] p-3 text-xs text-rose-100">
          <span>
            The authoritative jury-window state could not be verified. Opening and closing are
            disabled until the selected edition and show have been checked successfully.
          </span>
          <button
            type="button"
            className="admin-action-secondary !min-h-10"
            onClick={() => void refetch()}
          >
            Retry status check
          </button>
        </div>
      ) : null}

      {!voting.juryEnabled ? (
        <p className="mt-3 rounded-xl border border-amber-200/10 bg-amber-200/[0.045] p-3 text-xs text-amber-100">
          Jury voting is disabled in this show's Voting system. Enable the jury component there before opening the country-account booth.
        </p>
      ) : null}

      {!backend.isLoading && !juryOperationsSupported ? (
        <p className="mt-3 rounded-xl border border-rose-200/15 bg-rose-200/[0.05] p-3 text-xs text-rose-100">
          Jury-window controls are read-only until the production database is upgraded to the matching V5 operation contract. Solaris will not fall back to the unsafe legacy mutation path.
        </p>
      ) : null}

      <AdminConfirmSheet
        open={Boolean(currentPendingChange)}
        onClose={() => {
          if (!setStatus.isPending) setPendingChange(null);
        }}
        onConfirm={async () => {
          if (currentPendingChange) await setStatus.mutateAsync(currentPendingChange);
        }}
        title={
          currentPendingChange?.status === "open"
            ? "Open country-account jury voting?"
            : "Close country-account jury voting?"
        }
        description={
          currentPendingChange ? (
            <JuryWindowImpactPreview pending={currentPendingChange} />
          ) : (
            "Review the jury-window impact before continuing."
          )
        }
        confirmLabel={currentPendingChange?.status === "open" ? "Open jury voting" : "Close jury voting"}
        confirmationText={currentPendingChange?.preview.showName}
        confirmationHint={
          currentPendingChange
            ? `Type ${currentPendingChange.preview.showName} to confirm this R2 voting-window change`
            : undefined
        }
        busy={setStatus.isPending}
        danger={currentPendingChange?.status === "closed"}
      />
    </AdminCard>
  );
}

function JuryWindowImpactPreview({ pending }: { pending: PendingWindowChange }) {
  const preview = pending.preview;
  return (
    <div className="space-y-3">
      <p>
        This is a <strong className="text-foreground">Risk R2</strong> voting-window change for{" "}
        <strong className="text-foreground">{preview.showName}</strong>.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Current → requested
          </span>
          <strong className="mt-1 block text-sm text-foreground">
            {preview.currentStatus} → {preview.requestedStatus}
          </strong>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Submitted ballots
          </span>
          <strong className="mt-1 block text-sm text-foreground">{preview.submittedBallots}</strong>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Eligible entries
          </span>
          <strong className="mt-1 block text-sm text-foreground">{preview.participantCount}</strong>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-black/10 p-3">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Jury scale
          </span>
          <strong className="mt-1 block text-sm text-foreground">
            {preview.juryPointCount} ranked places · {preview.allowSelfVote ? "self-vote allowed" : "self-vote blocked"}
          </strong>
        </div>
      </div>
      {pending.status === "open" && preview.otherOpenWindows.length ? (
        <div className="rounded-lg border border-amber-200/15 bg-amber-200/[0.05] p-3">
          <p className="text-xs font-semibold text-amber-50">
            Opening this window will close {preview.otherOpenWindows.length} other open jury window
            {preview.otherOpenWindows.length === 1 ? "" : "s"}:
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-100/90">
            {preview.otherOpenWindows.map((item) => (
              <li key={item.showId}>• {item.showName}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {pending.status === "closed" ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Existing submitted ballots remain recorded. Closing stops new country-account jury submissions
          until an organizer opens the window again.
        </p>
      ) : (
        <p className="text-xs leading-5 text-muted-foreground">
          The preview already ran the same jury-enabled, entry-count and self-vote eligibility checks used by the authoritative mutation. The apply step revalidates them again under the edition-wide lock.
        </p>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Expected edition jury-window version: v{preview.expectedVersion}. Solaris rejects this command if
        another administrator changes any jury window in the edition before confirmation.
      </p>
    </div>
  );
}
