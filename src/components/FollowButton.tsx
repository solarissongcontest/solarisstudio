import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";

import { useMyFollows, useSetFanFollow, type FollowEntityType } from "@/lib/engagement-data";
import { useFanSession } from "@/lib/prediction-data";
import { cn } from "@/lib/utils";

export function FollowButton({
  entityType,
  entityId,
  label,
  className,
}: {
  entityType: FollowEntityType;
  entityId: string;
  label: string;
  className?: string;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { data: user } = useFanSession();
  const { data: followData, isLoading } = useMyFollows(user?.id);
  const setFollow = useSetFanFollow(user?.id);
  const [message, setMessage] = useState<string | null>(null);
  const following = Boolean(
    followData?.follows.some(
      (follow) => follow.entity_type === entityType && follow.entity_id === entityId,
    ),
  );

  if (!user) {
    return (
      <Link
        to="/auth"
        search={{ redirect: pathname }}
        className={cn(
          "inline-flex min-h-10 items-center rounded-xl border border-border bg-surface px-3 text-xs font-semibold",
          className,
        )}
      >
        Sign in to follow
      </Link>
    );
  }

  if (followData?.schemaReady === false) {
    return (
      <span
        className={cn(
          "inline-flex min-h-10 items-center rounded-xl border border-border bg-surface px-3 text-xs text-muted-foreground",
          className,
        )}
      >
        Follows are being connected
      </span>
    );
  }

  const toggle = async () => {
    setMessage(null);
    try {
      await setFollow.mutateAsync({ entityType, entityId, following: !following });
      setMessage(following ? "Unfollowed." : `Following ${label}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Follow could not be updated.");
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={isLoading || setFollow.isPending}
        aria-pressed={following}
        className={cn(
          "inline-flex min-h-10 items-center rounded-xl border px-3 text-xs font-semibold disabled:opacity-60",
          following
            ? "border-primary/50 bg-primary/15 text-primary"
            : "border-border bg-surface",
          className,
        )}
      >
        {setFollow.isPending ? "Saving…" : following ? "Following" : `Follow ${label}`}
      </button>
      {message && <span className="text-[10px] text-muted-foreground">{message}</span>}
    </span>
  );
}
