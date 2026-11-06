import { Link, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useFanSession } from "@/lib/prediction-data";
import {
  getWorldOrganizationFollow,
  setWorldOrganizationFollow,
  setWorldFollowCategory,
  WORLD_FOLLOW_IMPORTANT_CATEGORIES,
  WORLD_ORGANIZATION_FOLLOW_CATEGORIES,
  type WorldFollowCategory,
  type WorldFollowNotificationLevel,
} from "@/lib/world-organization-follows";

const labelByCategory: Record<WorldFollowCategory, string> = {
  statements: "Official statements",
  resolutions: "Resolutions",
  leadership: "Leadership changes",
  sessions: "Institutional sessions",
  documents: "Official documents",
  proposals: "Proposals",
  membership: "Membership changes",
};

/**
 * TG10 reusable World-only control. WORLD-00 owns placement on its published
 * institution page. Public rollout and parent publication gate must be
 * verified before rendering; mutation checks server authority regardless.
 */
export function WorldOrganizationFollowControl({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: user, isLoading: sessionLoading } = useFanSession();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);
  const key = ["world-organization-follow", user?.id, organizationId] as const;
  const preference = useQuery({
    queryKey: key,
    enabled: Boolean(user?.id && organizationId),
    queryFn: () => getWorldOrganizationFollow(user!.id, organizationId),
    staleTime: 15_000,
    retry: false,
  });
  const update = useMutation({
    mutationFn: async ({ following, level }: { following: boolean; level: WorldFollowNotificationLevel }) =>
      setWorldOrganizationFollow(organizationId, following, level),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: ["fan-follows", user?.id] }),
      ]);
    },
  });
  const categoryUpdate = useMutation({
    mutationFn: async (input: { followId: string; category: WorldFollowCategory; enabled: boolean }) =>
      setWorldFollowCategory(input.followId, input.category, input.enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const current = preference.data;
  const pending = update.isPending || categoryUpdate.isPending;
  async function changeFollow(following: boolean, level: WorldFollowNotificationLevel) {
    setFeedback(null);
    try {
      await update.mutateAsync({ following, level });
      setFeedback(following ? "Follow preferences saved." : "Institution unfollowed.");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Follow preference could not be saved.");
    }
  }
  async function changeCategory(category: WorldFollowCategory, enabled: boolean) {
    if (!current) return;
    setFeedback(null);
    try {
      await categoryUpdate.mutateAsync({ followId: current.followId, category, enabled });
      setFeedback("Category preference saved.");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Category preference could not be saved.");
    }
  }

  if (sessionLoading) return <span role="status" className="text-sm text-muted-foreground">Checking follow access…</span>;
  if (!user) {
    return <Link
      to="/auth"
      search={{ redirect: pathname }}
      className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold"
    >Sign in to follow</Link>;
  }
  if (preference.isPending) return <span role="status" className="text-sm text-muted-foreground">Loading follow preferences…</span>;
  if (preference.isError) {
    return <div className="flex flex-wrap items-center gap-3 text-sm" role="alert">
      <span>Following is temporarily unavailable.</span>
      <button className="min-h-11 rounded-xl border px-4" type="button"
        onClick={() => void preference.refetch()}>Try again</button>
    </div>;
  }
  if (!current) {
    return <button type="button" disabled={pending}
      className="min-h-11 rounded-xl border px-4 text-sm font-semibold disabled:opacity-60"
      onClick={() => void changeFollow(true, "important")}>
      {pending ? "Saving…" : "Follow " + organizationName}
    </button>;
  }

  const activeCategories: readonly WorldFollowCategory[] =
    current.notificationLevel === "important"
      ? WORLD_FOLLOW_IMPORTANT_CATEGORIES : WORLD_ORGANIZATION_FOLLOW_CATEGORIES;
  return (
    <section className="max-w-md space-y-3" aria-label={"Follow settings for " + organizationName}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">Following {organizationName}</span>
        <button type="button" disabled={pending}
          className="min-h-11 rounded-xl border px-4 text-sm disabled:opacity-60"
          onClick={() => void changeFollow(false, current.notificationLevel)}>
          Unfollow
        </button>
      </div>
      <label className="block text-sm font-medium">
        Notification level
        <select value={current.notificationLevel} disabled={pending}
          className="mt-1 block min-h-11 w-full rounded-xl border bg-background px-3"
          onChange={(e) => void changeFollow(true, e.target.value as WorldFollowNotificationLevel)}>
          <option value="important">Important updates</option>
          <option value="all">All eligible public updates</option>
          <option value="none">No follow notifications</option>
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        Important updates include official statements, major resolutions and leadership changes.
        Required institutional responsibilities are managed separately in Participate.
      </p>
      {current.notificationLevel !== "none" && (
        <fieldset disabled={pending} className="space-y-1 border-t pt-3">
          <legend className="mb-2 text-sm font-semibold">Notify me about</legend>
          {activeCategories.map((category) => (
            <label key={category} className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" className="size-4 accent-primary"
                checked={current.categories[category]}
                onChange={(e) => void changeCategory(category, e.target.checked)} />
              {labelByCategory[category]}
            </label>
          ))}
        </fieldset>
      )}
      {feedback && <p role="status" className="text-xs text-muted-foreground">{feedback}</p>}
    </section>
  );
}
