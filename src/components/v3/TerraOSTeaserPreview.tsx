import type { SolarisTask } from "@/lib/participation-os";
import {
  projectV3Bootstrap,
  type V3BootstrapSource,
} from "@/lib/v3-bootstrap";
import type { V3ExploreRootProjection } from "@/lib/v3-explore";
import { useEffect, useRef } from "react";
import { V3BottomNavigation } from "./V3AppShell";
import { V3ExploreScreen } from "./V3ExploreScreen";
import {
  V3FoundationShell,
  V3TopContext,
} from "./V3Foundation";
import { V3HomeScreen } from "./V3HomeScreen";
import { V3ParticipateScreen } from "./V3ParticipateScreen";

export type TerraOSTeaserScreen = "home" | "explore" | "participate";

const PREVIEW_NOW = "2026-10-18T11:00:00.000Z";
const PREVIEW_FOCUSABLE_SELECTOR =
  'a[href], button, input, select, textarea, [tabindex]';

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

/**
 * Public, fixture-only renderer used by the maintenance teaser.
 *
 * The teaser deliberately renders the production V3 screen components and the
 * shared canonical V3 bottom navigation rather than maintaining a second
 * hand-built imitation. It never loads live account data, performs no
 * mutations and removes all nested controls from keyboard navigation. The
 * iframe is therefore an accurate visual preview without becoming a
 * maintenance bypass.
 */
export function TerraOSTeaserPreview({ screen }: { screen: TerraOSTeaserScreen }) {
  const previewRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = previewRootRef.current;
    if (!root) return;

    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(PREVIEW_FOCUSABLE_SELECTOR),
    );
    const previousTabIndex = focusable.map((element) => [
      element,
      element.getAttribute("tabindex"),
    ] as const);

    for (const element of focusable) {
      element.setAttribute("tabindex", "-1");
    }

    return () => {
      for (const [element, previous] of previousTabIndex) {
        if (previous === null) element.removeAttribute("tabindex");
        else element.setAttribute("tabindex", previous);
      }
    };
  }, [screen]);

  useEffect(() => {
    // The preview is a same-origin iframe hosted by the maintenance teaser.
    // Keep the host card's first line clear of iPhone status/Dynamic Island
    // chrome without changing the production V3 page itself.
    const frame = window.frameElement as HTMLElement | null;
    const hostWindow = frame?.ownerDocument.defaultView ?? null;
    const firstLook = frame?.closest<HTMLElement>(".first-look") ?? null;
    if (!frame || !hostWindow || !firstLook) return;

    const applyHostSafeArea = () => {
      if (hostWindow.innerWidth <= 560) {
        firstLook.style.paddingTop =
          "max(5.5rem, calc(env(safe-area-inset-top) + 3.75rem))";
      } else {
        firstLook.style.removeProperty("padding-top");
      }
    };

    applyHostSafeArea();
    hostWindow.addEventListener("resize", applyHostSafeArea);

    return () => {
      hostWindow.removeEventListener("resize", applyHostSafeArea);
      firstLook.style.removeProperty("padding-top");
    };
  }, []);

  return (
    <div
      ref={previewRootRef}
      className="relative h-dvh min-h-dvh overflow-hidden bg-[var(--v3-bg-base)]"
      data-terraos-teaser-preview={screen}
      onClickCapture={(event) => event.preventDefault()}
      onKeyDownCapture={(event) => {
        if (event.key === "Enter" || event.key === " ") event.preventDefault();
      }}
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
                  description: "19 Oct · 21:00",
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

          <V3BottomNavigation activeArea={screen} />
        </V3FoundationShell>
      </div>
    </div>
  );
}
