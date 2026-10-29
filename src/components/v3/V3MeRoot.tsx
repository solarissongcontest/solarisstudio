import { isScopedV3MeSummary } from "@/lib/v3-me-summary";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useMySolaris } from "@/components/mysolaris/MySolarisContext";
import { getV3MeSummary } from "@/lib/v3-me.functions";
import { editionLabel, useEditions } from "@/lib/data";
import { useMyFollows } from "@/lib/engagement-data";
import { useFanProfile } from "@/lib/prediction-data";
import { NAV_TARGETS } from "@/lib/navigation-targets";
import { CONFIRMATION_SUBMITTED_EVENT } from "@/lib/submission-receipts";
import { buildV3MeProjection } from "@/lib/v3-me";
import { V3AppShell } from "./V3AppShell";
import { V3MeScreen } from "./V3MeScreen";

export function V3MeRoot({ viewerId, editionId }: { viewerId: string; editionId: string | null }) {
  const workspace = useMySolaris();
  const ownsIdentity = workspace.user?.id === viewerId;
  const account = ownsIdentity && workspace.countryAccount?.access.userId === viewerId ? workspace.countryAccount : null;
  const profile = useFanProfile(ownsIdentity ? viewerId : undefined);
  const follows = useMyFollows(ownsIdentity ? viewerId : undefined);
  const editions = useEditions();
  const queryClient = useQueryClient();
  const summaryKey = ["v3-me-summary", viewerId] as const;
  const summary = useQuery({
    queryKey: summaryKey, enabled: ownsIdentity,
    queryFn: () => getV3MeSummary(),
    staleTime: 15_000, refetchOnWindowFocus: true, retry: false,
  });
  useEffect(() => {
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["v3-me-summary", viewerId] }); };
    window.addEventListener(CONFIRMATION_SUBMITTED_EVENT, refresh);
    return () => window.removeEventListener(CONFIRMATION_SUBMITTED_EVENT, refresh);
  }, [queryClient, viewerId]);

  if (!ownsIdentity || workspace.isLoading) {
    return <V3AppShell editionLabel="Solaris Studio" phaseLabel="Me" activeArea="me"><p role="status" className="p-6">Opening your account…</p></V3AppShell>;
  }
  const current = editions.data?.find((edition) => edition.id === editionId) ?? null;
  const scoped = !summary.isError && isScopedV3MeSummary(summary.data, viewerId, account?.country?.id);
  const followingReady = !follows.isPending && !follows.isError && follows.data?.schemaReady === true;
  const following = followingReady ? follows.data!.follows : null;
  const canManageDelegation =
    account?.country != null &&
    workspace.permissions.canManageCountry &&
    workspace.permissions.countryStatus === "active";
  const projection = buildV3MeProjection({
    identity: {
      userId: viewerId, displayName: profile.data?.display_name ?? "Your Solaris account",
      delegationName: account?.country?.name ?? null, delegationFlagUrl: account?.country?.flag_image ?? null,
      displayRole: workspace.permissions.countryStatus === "suspended" ? "Delegation access suspended" : workspace.permissions.canManageCountry ? "Head of Delegation" : null,
    },
    currentMembership: current && workspace.currentEntry?.edition_id === current.id && workspace.currentEntry.participation_status === "confirmed" && workspace.permissions.countryStatus === "active" && workspace.permissions.canManageCountry ? {
      editionId: current.id, editionName: editionLabel(current), roleLabel: "Current delegation responsibilities", href: NAV_TARGETS.participate,
    } : null,
    historyAvailable: scoped,
    history: scoped ? [...summary.data!.history].filter((item) => item.edition_id !== editionId).sort((a,b) => b.edition_number-a.edition_number).map((item) => ({ editionId: item.edition_id, editionName: item.edition_name, roleLabel: "Recorded delegation confirmation", completed: false, href: NAV_TARGETS.mySolarisHistory })) : [],
    activity: { verifiedReceiptCount: scoped ? summary.data!.receipt_count : null, awaitingAuthoritativeReceiptCount: null, href: NAV_TARGETS.mySolarisActivity },
    following: { followedCountryCount: following ? following.filter((item) => item.entity_type === "country").length : null, followedContentCount: following ? following.filter((item) => item.entity_type !== "country").length : null, href: NAV_TARGETS.mySolarisActivity },
    delegationLinks: canManageDelegation ? [
      { key: "country", label: "Country profile", href: NAV_TARGETS.mySolarisCountry },
      { key: "hod-history", label: "HOD history", href: NAV_TARGETS.mySolarisHistory },
      { key: "responsibilities", label: "Responsibilities", href: NAV_TARGETS.participate },
      { key: "entry", label: "Entry and readiness", href: NAV_TARGETS.mySolarisEntry },
      { key: "notices", label: "Official notices", href: NAV_TARGETS.mySolarisNotices },
      { key: "page-media", label: "Page and media", href: NAV_TARGETS.mySolarisPageBuilder },
      { key: "appearance", label: "Appearance", href: NAV_TARGETS.mySolarisTheme },
    ] : [],
    preferenceLinks: [{ key: "settings", label: "Experience preferences", href: "/settings" }, { key: "notifications", label: "Notifications", href: "/notifications" }],
    accountLinks: [{ key: "account", label: "Account and security", href: NAV_TARGETS.mySolarisAccount }],
    canEnterOrganizer: account?.access.isOrganizer === true, organizerHref: NAV_TARGETS.organizer,
  });
  return <V3AppShell editionLabel={current ? editionLabel(current) : "Solaris Studio"} phaseLabel="Me" activeArea="me"><div data-v3-me-root=""><V3MeScreen projection={projection} /></div></V3AppShell>;
}
