import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Panel } from "@/components/AppShell";
import { usePublishedWorldFollowing, type OwnedFollowingIdentity } from "@/lib/use-world-following-public";
import { WorldOrganizationFollowControl } from "./WorldOrganizationFollowControl";

/** Browser/PWA share one owner-scoped follow truth, not separate profile stores. */
export function WorldSavedInstitutionFollows({
  viewerId,
  follows,
  loading,
  failed,
  schemaReady,
}: {
  viewerId: string | null | undefined;
  follows: readonly OwnedFollowingIdentity[] | undefined;
  loading: boolean;
  failed: boolean;
  schemaReady: boolean;
}) {
  const world = usePublishedWorldFollowing({
    viewerId,
    follows: schemaReady ? follows : undefined,
    enabled: !loading && !failed && schemaReady,
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    setExpanded(null);
  }, [viewerId]);

  const nameById = new Map(world.organizations.map((organization) => [organization.id, organization]));
  return (
    <Panel title="Saved institutions" description="Manage the public organizations you follow and their notification topics.">
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">Loading your institution follows…</p>
      ) : failed || !schemaReady || !world.scoped ? (
        <p role="alert" className="text-sm text-muted-foreground">
          Institution follow preferences cannot be verified for this account.
        </p>
      ) : world.ids.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You are not following a Terra Solaris institution yet.
        </p>
      ) : (
        <div className="grid gap-3">
          {world.isError ? (
            <p role="status" className="text-sm text-muted-foreground">
              Institution names could not be verified. Your private follows remain available.
            </p>
          ) : null}
          {world.ids.map((id, index) => {
            const organization = nameById.get(id);
            const name = organization?.officialName ?? `Unavailable institution ${index + 1}`;
            const open = expanded === id;
            return (
              <section key={id} className="rounded-xl border border-border/70 p-4" aria-label={name}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    {organization ? (
                      <Link to={`/world/organizations/${encodeURIComponent(organization.slug)}` as any}
                        className="text-sm font-semibold underline-offset-4 hover:underline">
                        {name}
                      </Link>
                    ) : <p className="text-sm font-semibold">{name}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {organization ? "Public Terra Solaris institution" : "Public details not available"}
                    </p>
                  </div>
                  <button type="button" aria-expanded={open}
                    onClick={() => setExpanded(open ? null : id)}
                    className="min-h-11 rounded-xl border border-border px-3 text-sm font-semibold">
                    {open ? "Close preferences" : "Manage preferences"}
                  </button>
                </div>
                {open ? (
                  <div className="mt-3 border-t border-border/70 pt-3">
                    <WorldOrganizationFollowControl organizationId={id} organizationName={name} />
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
