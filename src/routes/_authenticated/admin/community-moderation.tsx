import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { EyeOff, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

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

export const Route = createFileRoute("/_authenticated/admin/community-moderation")({
  head: () => ({
    meta: [
      { title: "Community moderation — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CommunityModerationPage,
});

function CommunityModerationPage() {
  const [query, setQuery] = useState("");
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
    }: {
      profileId: string;
      hidden: boolean;
      reason: string;
    }) => {
      const { data, error } = await (supabase as any).rpc(
        "admin_set_fan_profile_moderation",
        {
          p_profile_id: profileId,
          p_hidden: hidden,
          p_reason: reason,
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-fan-profile-moderation"] }),
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

  function hide(profile: FanProfileModerationRow) {
    const reason = window.prompt(
      `Why should “${profile.displayName}” be hidden from public community identity surfaces?`,
    );
    if (!reason?.trim()) return;
    moderate.mutate({ profileId: profile.profileId, hidden: true, reason: reason.trim() });
  }

  function restore(profile: FanProfileModerationRow) {
    if (!window.confirm(`Restore “${profile.displayName}” to eligible public identity surfaces?`)) {
      return;
    }
    moderate.mutate({ profileId: profile.profileId, hidden: false, reason: "Restored by Organizer" });
  }

  return (
    <AdminPage>
      <div className="mx-auto max-w-6xl space-y-4">
        <AdminPageHeader
          eyebrow="Engagement · Moderation"
          title="Community identity"
          description="Moderate public fan display identity without altering predictions, scores or historical competitive data. Hidden profiles keep their private account and scoring history."
        />

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
                      disabled={moderate.isPending}
                      onClick={() => restore(profile)}
                    >
                      <RotateCcw className="size-4" />
                      Restore identity
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="admin-action-secondary shrink-0"
                      disabled={moderate.isPending}
                      onClick={() => hide(profile)}
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

        {moderate.error ? (
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
