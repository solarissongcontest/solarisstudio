import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { EyeOff, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminSheet,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  createOrganisationCommand,
  requiresImpactPreview,
} from "@/lib/organisation-operation-contract";
import {
  resolveSolarisV6OperationRecovery,
  type SolarisV6OperationRecovery,
} from "@/lib/solaris-v6-operation-recovery";

type FanProfileModerationRow = {
  profileId: string;
  displayName: string;
  visibility: "private" | "unlisted" | "public";
  leaderboardOptIn: boolean;
  hiddenAt: string | null;
  moderationReason: string | null;
  updatedAt: string;
  predictionCount: number;
};

type PendingModeration = {
  profile: FanProfileModerationRow;
  profileFingerprint: string;
  hidden: boolean;
  operationId: string;
  idempotencyKey: string;
  commandReason: string | null;
  commandAttempted: boolean;
};

const MODERATION_RISK = "R2" as const;

export const Route = createFileRoute("/_authenticated/admin/community-moderation")({
  head: () => ({
    meta: [
      { title: "Community moderation — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CommunityModerationPage,
});

function moderationReviewFingerprint(profile: FanProfileModerationRow) {
  return JSON.stringify({
    profileId: profile.profileId,
    displayName: profile.displayName,
    visibility: profile.visibility,
    leaderboardOptIn: profile.leaderboardOptIn,
    hiddenAt: profile.hiddenAt,
    moderationReason: profile.moderationReason,
    updatedAt: profile.updatedAt,
  });
}

async function loadExactModerationProfile(reviewed: FanProfileModerationRow) {
  const { data, error } = await (supabase as any).rpc("admin_fan_profile_moderation", {
    p_limit: 250,
    p_query: reviewed.displayName,
  });
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []) as FanProfileModerationRow[];
  return rows.find((profile) => profile.profileId === reviewed.profileId) ?? null;
}

function CommunityModerationPage() {
  const [query, setQuery] = useState("");
  const [pendingModeration, setPendingModeration] = useState<PendingModeration | null>(null);
  const [moderationReason, setModerationReason] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<SolarisV6OperationRecovery | null>(null);
  const queryClient = useQueryClient();

  const profilesQuery = useQuery({
    queryKey: ["admin-fan-profile-moderation"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("admin_fan_profile_moderation", {
        p_limit: 200,
        p_query: null,
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as FanProfileModerationRow[];
    },
  });

  const moderate = useMutation({
    mutationFn: async ({
      profileId,
      hidden,
      reason,
      operationId,
      idempotencyKey,
    }: {
      profileId: string;
      hidden: boolean;
      reason: string;
      operationId: string;
      idempotencyKey: string;
    }) => {
      const { data, error } = await (supabase as any).rpc(
        "admin_set_fan_profile_moderation",
        {
          p_profile_id: profileId,
          p_hidden: hidden,
          p_reason: reason,
          p_operation_id: operationId,
          p_idempotency_key: idempotencyKey,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      setPendingModeration(null);
      setModerationReason("");
      setReviewError(null);
      setRecovery(null);
      await queryClient.invalidateQueries({ queryKey: ["admin-fan-profile-moderation"] });
    },
    onError: async (error, variables) => {
      const next = resolveSolarisV6OperationRecovery(error, {
        online: typeof navigator === "undefined" ? true : navigator.onLine,
        stableOperationIdentity: Boolean(variables.operationId),
      });
      setRecovery(next);
      if (next.shouldRefreshCanonical) {
        await queryClient.invalidateQueries({
          queryKey: ["admin-fan-profile-moderation"],
        });
      }
      if (!next.keepOperationOpen) {
        setPendingModeration(null);
        setModerationReason("");
      }
    },
  });

  const profiles = profilesQuery.data ?? [];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return profiles;
    return profiles.filter((profile) =>
      [profile.displayName, profile.visibility, profile.moderationReason ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [profiles, query]);

  const hiddenCount = profiles.filter((profile) => Boolean(profile.hiddenAt)).length;
  const publicCount = profiles.filter(
    (profile) => profile.visibility === "public" && profile.leaderboardOptIn,
  ).length;

  function requestModeration(profile: FanProfileModerationRow, hidden: boolean) {
    const command = createOrganisationCommand({
      command: "community.fan_identity.moderate",
      riskClass: MODERATION_RISK,
      scope: { entityId: profile.profileId },
      payload: { profileId: profile.profileId, hidden },
    });
    setModerationReason("");
    setReviewError(null);
    setRecovery(null);
    moderate.reset();
    setPendingModeration({
      profile,
      profileFingerprint: moderationReviewFingerprint(profile),
      hidden,
      operationId: command.operationId,
      idempotencyKey: command.idempotencyKey,
      commandReason: null,
      commandAttempted: false,
    });
  }

  async function confirmModeration() {
    let reviewed = pendingModeration;
    if (!reviewed) return;

    const reason = reviewed.commandReason ?? (
      reviewed.hidden ? moderationReason.trim() : "Restored by Organizer"
    );
    if (reviewed.hidden && !reason) return;

    if (reviewed.commandReason === null) {
      reviewed = { ...reviewed, commandReason: reason };
      setModerationReason(reason);
      setPendingModeration(reviewed);
    }

    if (!reviewed.commandAttempted) {
      setReviewBusy(true);
      setReviewError(null);
      try {
        const live = await loadExactModerationProfile(reviewed.profile);
        if (
          !live ||
          moderationReviewFingerprint(live) !== reviewed.profileFingerprint
        ) {
          setPendingModeration(null);
          setModerationReason("");
          setRecovery(null);
          moderate.reset();
          setReviewError(
            `${reviewed.profile.displayName} changed while this moderation decision was being reviewed. Nothing was changed. Reload the current profile state and review the decision again.`,
          );
          await queryClient.invalidateQueries({
            queryKey: ["admin-fan-profile-moderation"],
          });
          return;
        }
      } catch (error) {
        setReviewError(
          error instanceof Error
            ? `Could not refresh the reviewed profile before moderation: ${error.message}`
            : "Could not refresh the reviewed profile before moderation. Nothing was changed.",
        );
        return;
      } finally {
        setReviewBusy(false);
      }

      reviewed = { ...reviewed, commandAttempted: true };
      setPendingModeration(reviewed);
    }

    moderate.mutate({
      profileId: reviewed.profile.profileId,
      hidden: reviewed.hidden,
      reason: reviewed.commandReason ?? reason,
      operationId: reviewed.operationId,
      idempotencyKey: reviewed.idempotencyKey,
    });
  }

  function closeReview() {
    if (moderate.isPending || reviewBusy) return;
    setPendingModeration(null);
    setModerationReason("");
    setRecovery(null);
    moderate.reset();
  }

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-4">
        <AdminPageHeader
          eyebrow="Engagement · Moderation"
          title="Community identity"
          description="Moderate public fan display identity without altering predictions, scores or historical competitive data. Hidden profiles keep their private account and scoring history."
          actions={<AdminStatus tone="info">Scope · global community identity</AdminStatus>}
        />

        {reviewError ? (
          <AdminCard className="!border-amber-200/15 !bg-amber-200/[0.045]">
            <p className="text-sm font-semibold text-amber-50">Moderation review needs refreshing</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{reviewError}</p>
          </AdminCard>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <Metric label="Profiles" value={profiles.length} />
          <Metric label="Public leaderboard opt-ins" value={publicCount} />
          <Metric label="Hidden identities" value={hiddenCount} attention={hiddenCount > 0} />
        </section>

        <AdminCard>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search display name or moderation reason…"
              className="min-h-11 pl-9"
            />
          </div>
        </AdminCard>

        {profilesQuery.isLoading ? (
          <AdminCard>
            <p className="py-12 text-center text-sm text-muted-foreground">
              Loading public fan identities…
            </p>
          </AdminCard>
        ) : profilesQuery.error ? (
          <AdminCard>
            <AdminEmptyState
              icon={ShieldCheck}
              title="Community moderation could not be loaded"
              description={
                profilesQuery.error instanceof Error
                  ? profilesQuery.error.message
                  : "The protected moderation projection is unavailable."
              }
            />
          </AdminCard>
        ) : filtered.length ? (
          <div className="space-y-3">
            {filtered.map((profile) => (
              <AdminCard key={profile.profileId} className="!p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{profile.displayName}</h2>
                      <AdminStatus tone={profile.hiddenAt ? "blocked" : "ready"}>
                        {profile.hiddenAt ? "Hidden" : profile.visibility}
                      </AdminStatus>
                      {profile.leaderboardOptIn ? (
                        <AdminStatus tone="neutral">Leaderboard opt-in</AdminStatus>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {profile.predictionCount} prediction
                      {profile.predictionCount === 1 ? "" : "s"} · updated{" "}
                      {formatDate(profile.updatedAt)}
                    </p>
                    {profile.hiddenAt ? (
                      <div className="mt-3 rounded-xl border border-amber-200/15 bg-amber-200/[0.045] p-3">
                        <p className="text-xs font-semibold">Moderation reason</p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {profile.moderationReason || "No reason recorded"}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Hidden {formatDate(profile.hiddenAt)}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  {profile.hiddenAt ? (
                    <button
                      type="button"
                      className="admin-action-secondary shrink-0"
                      disabled={moderate.isPending || reviewBusy}
                      onClick={() => requestModeration(profile, false)}
                    >
                      <RotateCcw className="size-4" />
                      Restore identity
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="admin-action-secondary shrink-0"
                      disabled={moderate.isPending || reviewBusy}
                      onClick={() => requestModeration(profile, true)}
                    >
                      <EyeOff className="size-4" />
                      Hide public identity
                    </button>
                  )}
                </div>
              </AdminCard>
            ))}
          </div>
        ) : (
          <AdminCard>
            <AdminEmptyState
              icon={ShieldCheck}
              title="No matching fan profiles"
              description="No public or private fan identity matches this search."
            />
          </AdminCard>
        )}

        {moderate.error && !pendingModeration ? (
          <AdminCard className="!border-rose-200/15 !bg-rose-200/[0.045]">
            <p className="text-sm font-semibold text-rose-100">Moderation was not saved</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {moderate.error instanceof Error
                ? moderate.error.message
                : "The moderation command failed."}
            </p>
          </AdminCard>
        ) : null}
      </div>

      <AdminSheet
        open={Boolean(pendingModeration)}
        onClose={closeReview}
        title={
          pendingModeration?.hidden
            ? "Hide public fan identity"
            : "Restore public fan identity"
        }
        description="Review the affected public surfaces before applying this moderation decision."
      >
        {pendingModeration ? (
          <div className="space-y-4" data-v3-organizer-community-fresh-review>
            <div className="flex flex-wrap items-center gap-2">
              <AdminStatus tone="attention">{MODERATION_RISK}</AdminStatus>
              <AdminStatus tone="info">Global public identity</AdminStatus>
              <AdminStatus tone="neutral">Reviewed {formatDate(pendingModeration.profile.updatedAt)}</AdminStatus>
              <p className="text-xs font-semibold text-muted-foreground">
                {requiresImpactPreview(MODERATION_RISK)
                  ? "Impact review required"
                  : "Review"}
              </p>
            </div>

            <div className="rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-3">
              <p className="text-sm font-semibold">{pendingModeration.profile.displayName}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <AdminStatus tone={pendingModeration.profile.hiddenAt ? "blocked" : "ready"}>
                  {pendingModeration.profile.hiddenAt ? "Hidden" : pendingModeration.profile.visibility}
                </AdminStatus>
                {pendingModeration.profile.leaderboardOptIn ? (
                  <AdminStatus tone="neutral">Leaderboard opt-in</AdminStatus>
                ) : null}
              </div>
              <ul className="mt-3 space-y-1.5 text-xs leading-5 text-muted-foreground">
                <li>Scope: public community identity across eligible surfaces, not an edition, show or competitive record.</li>
                <li>
                  {pendingModeration.hidden
                    ? "The display identity will disappear from eligible public leaderboard surfaces."
                    : "The display identity can appear again wherever the profile has opted into public identity."}
                </li>
                <li>Shared prediction pages will use the moderated identity projection.</li>
                <li>Predictions, scores, percentiles and historical competitive data remain unchanged.</li>
                <li>The Organizer decision is written to the canonical audit log.</li>
              </ul>
            </div>

            {pendingModeration.hidden ? (
              <label className="block">
                <span className="text-xs font-semibold text-foreground">
                  Moderation reason
                </span>
                <textarea
                  value={moderationReason}
                  onChange={(event) => setModerationReason(event.target.value)}
                  disabled={
                    pendingModeration.commandReason !== null ||
                    reviewBusy ||
                    moderate.isPending
                  }
                  className="mt-2 min-h-28 w-full rounded-xl border border-white/[0.1] bg-white/[0.035] p-3 text-sm outline-none focus:border-sky-200/30 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Record the concrete reason for hiding this public identity…"
                />
                {pendingModeration.commandReason !== null ? (
                  <span className="mt-2 block text-[11px] leading-4 text-muted-foreground">
                    Reason frozen for this operation identity. Close and reopen review to change it.
                  </span>
                ) : null}
              </label>
            ) : null}

            {!pendingModeration.commandAttempted ? (
              <div className="rounded-xl border border-sky-200/15 bg-sky-200/[0.04] p-3 text-xs leading-5 text-muted-foreground">
                Before the first command attempt, Solaris re-reads this protected profile and compares the reviewed identity/moderation fingerprint. Drift closes the review. System #1579 is still required to move that expected-version check into the authoritative transaction.
              </div>
            ) : null}

            {reviewBusy ? (
              <div role="status" className="rounded-xl border border-sky-200/15 bg-sky-200/[0.04] p-3 text-xs text-muted-foreground">
                Re-checking the exact reviewed profile before the first moderation attempt…
              </div>
            ) : recovery ? (
              <div role="status" className="rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-3 text-xs leading-5">
                <p className="font-semibold text-amber-50">{recovery.title}</p>
                <p className="mt-1 text-muted-foreground">{recovery.description}</p>
                {recovery.outcomeUnknown ? (
                  <p className="mt-2 font-semibold text-foreground">
                    The server outcome is unknown. Retrying here reuses the same frozen reason and operation identity; it does not run a new stale-state preflight against a command that may already have committed.
                  </p>
                ) : null}
              </div>
            ) : moderate.error ? (
              <p className="rounded-xl border border-rose-200/15 bg-rose-200/[0.05] p-3 text-xs text-rose-100">
                {moderate.error instanceof Error
                  ? moderate.error.message
                  : "The moderation command failed."}
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="admin-action-secondary w-full"
                disabled={moderate.isPending || reviewBusy}
                onClick={closeReview}
              >
                Cancel
              </button>
              <button
                type="button"
                className={pendingModeration.hidden ? "admin-action-danger w-full" : "admin-action-primary w-full"}
                disabled={
                  moderate.isPending ||
                  reviewBusy ||
                  (pendingModeration.hidden &&
                    !(pendingModeration.commandReason ?? moderationReason.trim()))
                }
                onClick={() => void confirmModeration()}
              >
                {reviewBusy
                  ? "Re-checking…"
                  : moderate.isPending
                    ? "Applying…"
                    : recovery?.allowSameIdentityRetry
                      ? "Retry same operation"
                      : pendingModeration.hidden
                        ? "Hide identity"
                        : "Restore identity"}
              </button>
            </div>
          </div>
        ) : null}
      </AdminSheet>
    </AdminPage>
  );
}

function Metric({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: number;
  attention?: boolean;
}) {
  return (
    <AdminCard>
      <p className="admin-section-label">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <AdminStatus tone={attention ? "attention" : "neutral"}>
          {attention ? "Review" : "Current"}
        </AdminStatus>
      </div>
    </AdminCard>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}
