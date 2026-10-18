import { AppTabBar } from "@/components/app/AppTabBar";
import type { SolarisTask } from "@/lib/participation-os";
import {
  projectV3Bootstrap,
  type V3BootstrapSource,
} from "@/lib/v3-bootstrap";
import type { V3ExploreRootProjection } from "@/lib/v3-explore";
import { V3ExploreScreen } from "./V3ExploreScreen";
import {
  V3FoundationShell,
  V3TopContext,
} from "./V3Foundation";
import { V3HomeScreen } from "./V3HomeScreen";
import { V3ParticipateScreen } from "./V3ParticipateScreen";

export type TerraOSTeaserScreen = "home" | "explore" | "participate";

const PREVIEW_NOW = "2026-10-18T11:00:00.000Z";

function completedTask(
  id: string,
  kind: "confirmation" | "entry",
  title: string,
  description: string,
  route: string,
): SolarisTask {
  return {
    id,
    editionId: "22",
    kind,
    title,
    description,
    state: "completed",
    importance: "required",
    blocking: false,
    actionRequired: false,
    opensAt: null,
    deadline: null,
    route,
    priority: 60,
    why: "Representative completed responsibility for the public TerraOS teaser.",
  };
}

function teaserBootstrapSource(): V3BootstrapSource {
  return {
    schemaVersion: 1,
    generatedAt: PREVIEW_NOW,
    serverTime: PREVIEW_NOW,
    identity: { userId: "terraos-teaser", displayName: "Solaris" },
    context: {
      editionId: "22",
      editionLabel: "SSC 22",
      delegationId: "oland",
      delegationName: "Oland",
    },
    capabilities: ["confirmation.manage", "entry.submit"],
    domain: {
      edition: "active",
      confirmationWindow: "closed",
      submissionWindow: "closed",
      show: "scheduled",
      jury: "finalized",
      televote: "upcoming",
      results: "hidden",
      publication: "scheduled",
    },
    tasks: [
      completedTask(
        "confirmation:ssc22",
        "confirmation",
        "Country confirmed",
        "Your current edition confirmation requirement is satisfied.",
        "/confirmations",
      ),
      completedTask(
        "entry:ssc22",
        "entry",
        "Entry ready",
        "Entry requirements and the current workflow are complete.",
        "/my-solaris/entry",
      ),
    ],
  };
}

const BOOTSTRAP = projectV3Bootstrap(teaserBootstrapSource());

const EXPLORE_PROJECTION: V3ExploreRootProjection = {
  search: {
    integration: "existing-global-search",
    action: "open-existing-search",
  },
  currentEdition: {
    id: "22",
    name: "Solaris Song Contest 22",
    editionNumber: 22,
    year: 2026,
    hostLabel: null,
    artworkUrl: null,
    experience: "pre-show",
    href: "/editions/ssc-22",
    nextEvent: null,
    resultsAvailable: false,
  },
  discover: [
    { key: "countries", label: "Countries", href: "/countries", publicItemCount: 35 },
    {
      key: "songs-and-artists",
      label: "Songs & artists",
      href: "/songs",
      publicItemCount: 70,
    },
    { key: "shows", label: "Shows", href: "/shows", publicItemCount: 2 },
    { key: "stories", label: "Stories", href: "/stories", publicItemCount: 12 },
  ],
  archive: {
    links: [
      { key: "editions", label: "Editions", href: "/editions" },
      { key: "wiki", label: "Wiki", href: "/wiki" },
    ],
    editions: [],
  },
  more: [],
};

function previewPath(screen: TerraOSTeaserScreen) {
  if (screen === "explore") return "/explore";
  if (screen === "participate") return "/participate";
  return "/";
}

/**
 * Public, fixture-only renderer used by the maintenance teaser.
 *
 * The teaser deliberately renders the production V3 screen components and the
 * real AppTabBar rather than maintaining a second hand-built imitation. It
 * never loads live account data, performs no mutations and disables pointer
 * interaction. The iframe is therefore an accurate visual preview without
 * becoming a maintenance bypass.
 */
export function TerraOSTeaserPreview({ screen }: { screen: TerraOSTeaserScreen }) {
  const pathname = previewPath(screen);

  return (
    <div
      className="relative h-dvh min-h-dvh overflow-hidden bg-[var(--v3-bg-base)]"
      data-terraos-teaser-preview={screen}
      aria-hidden="true"
    >
      <div className="pointer-events-none h-full select-none overflow-hidden">
        <V3FoundationShell>
          <V3TopContext edition="SSC 22" phase="Current edition" />

          {screen === "home" ? (
            <V3HomeScreen
              bootstrap={BOOTSTRAP}
              greeting="Solaris now"
              currentContest={{
                title: "Solaris Song Contest 22",
                headline: "SSC 22 is the current Solaris edition",
                meta: "Explore the edition, participating countries and published entry information.",
                stats: [
                  { value: "35", label: "Delegations" },
                  { value: "2", label: "Public shows" },
                ],
              }}
              upcoming={[
                {
                  id: "semi-final-1",
                  title: "Semi-final 1",
                  description: "Tomorrow · 21:00",
                },
              ]}
            />
          ) : null}

          {screen === "participate" ? (
            <V3ParticipateScreen
              bootstrap={BOOTSTRAP}
              delegationLabel="Oland"
            />
          ) : null}

          {screen === "explore" ? (
            <V3ExploreScreen projection={EXPLORE_PROJECTION} onOpenSearch={() => undefined} />
          ) : null}

          <AppTabBar
            pathname={pathname}
            signedIn={screen === "participate"}
          />
        </V3FoundationShell>
      </div>
    </div>
  );
}
