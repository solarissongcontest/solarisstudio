import { useEffect, useRef, useState } from "react";
import {
  loadWorldOrganizationFollow,
  setWorldOrganizationFollow,
  setWorldOrganizationFollowCategory,
  WORLD_ORGANIZATION_FOLLOW_CATEGORIES,
  type WorldFollowCategory,
  type WorldFollowLevel,
  type WorldOrganizationFollowPreference,
} from "@/lib/world-organization-follows";

const CATEGORY_LABELS: Record<WorldFollowCategory, string> = {
  statements: "Official statements",
  resolutions: "Resolutions",
  leadership: "Leadership",
  sessions: "Institutional sessions",
  documents: "Documents",
  proposals: "Proposals",
  membership: "Membership",
};

type FollowState =
  | { scope: string; status: "loading" }
  | { scope: string; status: "error" }
  | { scope: string; status: "ready"; preference: WorldOrganizationFollowPreference };

export function WorldOrganizationFollowControl({
  organizationId, organizationName, profileId, onChanged,
}: {
  organizationId: string;
  organizationName: string;
  /** Signed-in user's ID, never a country controller or historic person ID. */
  profileId?: string | null;
  /** Allows the outer Me/Explore surface to invalidate its existing follow query. */
  onChanged?: () => void;
}) {
  const scope = [profileId ?? "", organizationId].join(":");
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [snapshot, setSnapshot] = useState<FollowState>({ scope, status: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const current = scope;
    let active = true;
    setError(null);
    setBusy(false);
    if (!profileId) return () => { active = false; };

    setSnapshot({ scope, status: "loading" });
    void loadWorldOrganizationFollow(profileId, organizationId)
      .then((preference) => {
        if (active && currentScope.current === current) {
          setSnapshot({ scope: current, status: "ready", preference });
        }
      })
      .catch(() => {
        if (active && currentScope.current === current) {
          setSnapshot({ scope: current, status: "error" });
        }
      });
    return () => { active = false; };
  }, [scope, profileId, organizationId, retry]);

  // Ignore a cached previous actor/organization snapshot in this very render,
  // even before the effect clears it. No cross-account private-state flash.
  const visible = snapshot.scope === scope ? snapshot : { scope, status: "loading" } as FollowState;
  if (!profileId) {
    return (
      <section aria-label="Follow institution" className="space-y-2 py-3">
        <p className="text-sm text-muted-foreground">Sign in to follow official updates from {organizationName}.</p>
      </section>
    );
  }

  async function apply(operation: () => Promise<unknown>) {
    if (busy || !profileId) return;
    const actorScope = scope;
    setBusy(true);
    setError(null);
    try {
      await operation();
      const updated = await loadWorldOrganizationFollow(profileId, organizationId);
      if (actorScope !== currentScope.current) return;
      setSnapshot({ scope: actorScope, status: "ready", preference: updated });
      onChanged?.();
    } catch {
      if (actorScope === currentScope.current) {
        setError("The preference was not confirmed. Refresh the follow state before trying again.");
      }
    } finally {
      if (actorScope === currentScope.current) setBusy(false);
    }
  }

  if (visible.status === "loading") {
    return <section aria-label="Follow institution"><p role="status" className="py-3 text-sm text-muted-foreground">Loading your follow settings…</p></section>;
  }
  if (visible.status === "error") {
    return (
      <section aria-label="Follow institution" className="space-y-3 py-3">
        <p role="alert" className="text-sm">Follow settings are unavailable. No preference changes were made.</p>
        <button type="button" onClick={() => setRetry((value) => value + 1)}
          className="min-h-11 rounded-lg border px-4 py-2">Retry</button>
      </section>
    );
  }

  const { preference } = visible;
  const { following, publicAvailable, followId, notificationLevel, categoryEnabled } = preference;

  return (
    <section aria-label={"Follow " + organizationName} className="max-w-xl space-y-3 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button" aria-pressed={following} disabled={busy || (!following && !publicAvailable)}
          className={"min-h-11 rounded-xl border px-5 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 " +
            (following ? "border-border" : "border-primary bg-primary text-primary-foreground")}
          onClick={() => void apply(() =>
            setWorldOrganizationFollow(organizationId, !following, notificationLevel))}
        >
          {busy ? "Saving…" : following ? "Following · Unfollow" : "Follow institution"}
        </button>
        <p className="text-sm text-muted-foreground">
          {following ? "Your organization follow is saved." : "Receive public institutional updates."}
        </p>
      </div>

      {!publicAvailable && (
        <p role="status" className="text-sm text-muted-foreground">
          Institutional following is currently unavailable. You can still remove a previous follow.
        </p>
      )}

      {following && publicAvailable && followId && (
        <>
          <label htmlFor={"world-follow-level-" + organizationId} className="block text-sm font-medium">
            Optional notification level
          </label>
          <select
            id={"world-follow-level-" + organizationId}
            disabled={busy} value={notificationLevel}
            onChange={(event) => {
              const next = event.target.value as WorldFollowLevel;
              void apply(() => setWorldOrganizationFollow(organizationId, true, next));
            }}
            className="min-h-11 w-full max-w-sm rounded-lg border bg-background px-3"
          >
            <option value="none">None</option>
            <option value="important">Important announcements</option>
            <option value="all">All published updates</option>
          </select>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Optional follows never replace mandatory responsibilities or official participant notices.
            Delivery depends on your notification settings and the publication policy.
          </p>
          <fieldset disabled={busy || notificationLevel === "none"} className="space-y-1">
            <legend className="pb-2 text-sm font-semibold">Updates to follow</legend>
            {WORLD_ORGANIZATION_FOLLOW_CATEGORIES.map((category) => (
              <label key={category} className="flex min-h-11 cursor-pointer items-center gap-3 py-1 text-sm">
                <input
                  type="checkbox" checked={categoryEnabled[category]}
                  className="h-5 w-5 accent-primary"
                  onChange={(event) => {
                    void apply(() => setWorldOrganizationFollowCategory(
                      followId, category, event.target.checked,
                    ));
                  }}
                />
                <span>{CATEGORY_LABELS[category]}</span>
              </label>
            ))}
          </fieldset>
        </>
      )}
      {error && (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{error}</p>
          <button className="min-h-11 rounded-lg border px-4" type="button"
            onClick={() => setRetry((value) => value + 1)}>Refresh saved preferences</button>
        </div>
      )}
    </section>
  );
}
