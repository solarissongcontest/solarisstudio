import { Archive, ShieldCheck } from "lucide-react";

import { useMySolaris } from "@/components/mysolaris/MySolarisContext";
import { editionLabel, useCountries, useEditions } from "@/lib/data";
import {
  useOwnedHodClaims,
  useOwnedHodHistory,
  type OwnedHodEditionStatus,
} from "@/lib/hod-self-history";
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

type HistoricalMembership = {
  countryId: string;
  editionId: string;
  status: OwnedHodEditionStatus;
  editionNumber: number | null;
  editionName: string;
};

export function V3DelegationHistoryScreen({ viewerId }: { viewerId: string }) {
  const workspace = useMySolaris();
  const ownsIdentity = workspace.user?.id === viewerId;
  const countryAccount =
    ownsIdentity && workspace.countryAccount?.access.userId === viewerId
      ? workspace.countryAccount
      : null;
  const activeCountryId = countryAccount?.country?.id ?? null;
  const editions = useEditions();
  const countries = useCountries();
  const currentHistory = useOwnedHodHistory(
    ownsIdentity && Boolean(activeCountryId),
    viewerId,
  );
  const historicalClaims = useOwnedHodClaims(viewerId, ownsIdentity);

  const currentHistoryPending = Boolean(activeCountryId) && currentHistory.isPending;
  if (
    workspace.isLoading ||
    (ownsIdentity && (historicalClaims.isPending || currentHistoryPending))
  ) {
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

  const currentHistoryScoped =
    !activeCountryId ||
    (!currentHistory.isError && currentHistory.data?.country_id === activeCountryId);
  if (historicalClaims.isError || !currentHistoryScoped) {
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
                match the active account. Organizer access never widens this Me projection.
              </p>
            </div>
          </div>
        </V3Surface>
      </V3Screen>
    );
  }

  const membershipByKey = new Map<string, HistoricalMembership>();
  for (const item of currentHistory.data?.editions ?? []) {
    if (!activeCountryId) continue;
    membershipByKey.set(`${activeCountryId}:${item.edition_id}`, {
      countryId: activeCountryId,
      editionId: item.edition_id,
      status: item.status,
      editionNumber: item.edition_number,
      editionName: item.edition_name,
    });
  }
  for (const claim of historicalClaims.data ?? []) {
    const edition = (editions.data ?? []).find((item) => item.id === claim.edition_id);
    membershipByKey.set(`${claim.country_id}:${claim.edition_id}`, {
      countryId: claim.country_id,
      editionId: claim.edition_id,
      status: claim.status,
      editionNumber: edition?.edition_number ?? null,
      editionName: edition ? editionLabel(edition) : "Historical edition",
    });
  }

  const rows = [...membershipByKey.values()].sort(
    (a, b) => (b.editionNumber ?? -1) - (a.editionNumber ?? -1),
  );
  const editionById = new Map((editions.data ?? []).map((edition) => [edition.id, edition]));
  const countryById = new Map((countries.data ?? []).map((country) => [country.id, country]));

  return (
    <V3Screen>
      <V3ScreenHeader
        kicker="Me · History"
        title="Delegation history"
        description="Past editions, delegations and HOD roles from caller-scoped Solaris history."
      />

      <V3Section
        title="Recorded memberships"
        meta={
          rows.length ? (
            <V3StatusChip tone="success">
              {rows.length} {rows.length === 1 ? "membership" : "memberships"}
            </V3StatusChip>
          ) : undefined
        }
      >
        {rows.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((item) => {
              const edition = editionById.get(item.editionId);
              const country = countryById.get(item.countryId);
              const canonicalEditionLabel = edition ? editionLabel(edition) : item.editionName;
              const href = edition?.slug ? `/editions/${edition.slug}` : "/editions";
              const mine = item.status === "mine";
              const countryLabel =
                country?.name ??
                (item.countryId === activeCountryId ? countryAccount?.country?.name : null) ??
                "Historical delegation";

              return (
                <V3ActionCard
                  key={`${item.countryId}:${item.editionId}`}
                  title={canonicalEditionLabel}
                  description={countryLabel}
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
            <p className="text-sm font-semibold">No recorded delegation memberships</p>
            <p className="mt-1 text-xs leading-5 text-white/48">
              Solaris has no caller-linked delegation history for this account yet.
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
