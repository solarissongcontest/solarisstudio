import { Archive, ShieldCheck } from "lucide-react";

import { useMySolaris } from "@/components/mysolaris/MySolarisContext";
import { editionLabel, useEditions } from "@/lib/data";
import { useOwnedHodHistory, type OwnedHodEditionStatus } from "@/lib/hod-self-history";
import {
  V3ActionCard,
  V3Screen,
  V3ScreenHeader,
  V3Section,
  V3StatusChip,
  V3Surface,
} from "./V3Foundation";

function membershipLabel(status: OwnedHodEditionStatus) {
  if (status === "mine") return "You were HOD";
  if (status === "other") return "Another HOD";
  return "HOD unknown";
}

export function V3DelegationHistoryScreen({ viewerId }: { viewerId: string }) {
  const workspace = useMySolaris();
  const ownsIdentity = workspace.user?.id === viewerId;
  const countryAccount =
    ownsIdentity && workspace.countryAccount?.access.userId === viewerId
      ? workspace.countryAccount
      : null;
  const countryId = countryAccount?.country?.id ?? null;
  const editions = useEditions();
  const history = useOwnedHodHistory(ownsIdentity && Boolean(countryId), viewerId);

  if (workspace.isLoading || (ownsIdentity && history.isPending)) {
    return (
      <V3Screen>
        <V3ScreenHeader
          kicker="Me · History"
          title="Delegation history"
          description="Loading your caller-scoped Solaris participation history…"
        />
        <V3Surface className="p-4">
          <p className="text-sm text-white/55" role="status" aria-live="polite">
            Loading history…
          </p>
        </V3Surface>
      </V3Screen>
    );
  }

  if (!ownsIdentity) {
    return (
      <V3Screen>
        <V3ScreenHeader kicker="Me · History" title="Delegation history unavailable" />
        <V3Surface className="p-4">
          <p className="text-sm text-white/55">
            Solaris is refreshing your signed-in identity. Private history is not shown until the
            active viewer is confirmed.
          </p>
        </V3Surface>
      </V3Screen>
    );
  }

  if (!countryAccount?.country || !countryId) {
    return (
      <V3Screen>
        <V3ScreenHeader
          kicker="Me · History"
          title="No delegation history"
          description="This account is not currently bound to a Solaris delegation."
        />
        <V3ActionCard
          title="Back to Me"
          description="Open your Solaris identity and account overview"
          tone="neutral"
          to="/my-solaris"
        />
      </V3Screen>
    );
  }

  const historyData = history.data;
  const scoped = !history.isError && historyData?.country_id === countryId;

  if (!scoped || !historyData) {
    return (
      <V3Screen>
        <V3ScreenHeader
          kicker="Me · History"
          title="Delegation history unavailable"
          description="Solaris could not verify a caller-scoped history response for this account."
        />
        <V3Surface level="raised" className="p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-white/65" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Private data stayed closed</p>
              <p className="mt-1 text-xs leading-5 text-white/48">
                History is only rendered when the authenticated viewer and returned delegation both
                match the active account.
              </p>
            </div>
          </div>
        </V3Surface>
      </V3Screen>
    );
  }

  const rows = [...historyData.editions].sort(
    (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
  );
  const editionById = new Map((editions.data ?? []).map((edition) => [edition.id, edition]));

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Me · History"
        title={`${countryAccount.country.name} history`}
        description="Your private delegation participation and HOD history from Solaris's caller-scoped history source."
      />

      <V3Section
        title="Recorded editions"
        meta={
          rows.length ? (
            <V3StatusChip tone="success">
              {rows.length} {rows.length === 1 ? "edition" : "editions"}
            </V3StatusChip>
          ) : undefined
        }
      >
        {rows.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((item) => {
              const edition = editionById.get(item.edition_id);
              const canonicalLabel = edition ? editionLabel(edition) : item.edition_name;
              const href = edition?.slug ? `/editions/${edition.slug}` : "/editions";
              const mine = item.status === "mine";

              return (
                <V3ActionCard
                  key={item.edition_id}
                  title={canonicalLabel}
                  description="Confirmed delegation participation"
                  icon={Archive}
                  tone="neutral"
                  to={href}
                  meta={
                    <V3StatusChip tone={mine ? "success" : "neutral"}>
                      {membershipLabel(item.status)}
                    </V3StatusChip>
                  }
                />
              );
            })}
          </div>
        ) : (
          <V3Surface className="p-4">
            <p className="text-sm font-semibold">No recorded delegation editions</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Solaris has no confirmed edition participation for this delegation yet.
            </p>
          </V3Surface>
        )}
      </V3Section>

      <V3Section title="Continue">
        <div className="grid gap-3 sm:grid-cols-2">
          <V3ActionCard
            title="Back to Me"
            description="Identity, activity, following and account settings"
            tone="neutral"
            to="/my-solaris"
          />
          <V3ActionCard
            title="Explore editions"
            description="Browse the public Solaris archive"
            icon={Archive}
            tone="neutral"
            to="/editions"
          />
        </div>
      </V3Section>
    </V3Screen>
  );
}
