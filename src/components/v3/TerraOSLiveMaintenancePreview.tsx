import { Compass, Home, Trophy, UserRound, Vote, type LucideIcon } from "lucide-react";

import type { TerraOSTeaserScreen } from "./TerraOSTeaserPreview";
import { TerraOSTeaserPreview } from "./TerraOSTeaserPreview";
import "@/styles/terraos-live-maintenance-preview.css";

type PreviewDestination = {
  id: TerraOSTeaserScreen;
  label: string;
  icon: LucideIcon;
};

const PREVIEW_DESTINATIONS: readonly PreviewDestination[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "explore", label: "Explore", icon: Compass },
  { id: "participate", label: "Participate", icon: Vote },
  { id: "results", label: "Results", icon: Trophy },
  { id: "me", label: "Me", icon: UserRound },
];

/**
 * Direct maintenance-only V3 preview shell.
 *
 * The actual screen renderer stays fixture-only and non-interactive. This shell
 * owns only safe navigation between the five fixture screens, so inspecting the
 * preview cannot cross into live participant, voting, Results or account paths.
 */
export function TerraOSLiveMaintenancePreview({
  screen,
}: {
  screen: TerraOSTeaserScreen;
}) {
  return (
    <div
      data-terraos-live-preview-shell="true"
      data-terraos-teaser-preview={screen}
      data-terraos-teaser-chrome="full"
    >
      <div className="terraos-live-preview-badge" aria-label="Preview, fixture data, read only">
        <strong>Preview</strong>
        <span>Fixture data · read-only</span>
      </div>

      <TerraOSTeaserPreview screen={screen} showNavigation={false} />

      <nav
        className="v3-bottom-nav terraos-live-preview-nav"
        aria-label="TerraOS 3 preview navigation"
      >
        {PREVIEW_DESTINATIONS.map(({ id, label, icon: Icon }) => {
          const active = screen === id;
          return (
            <a
              key={id}
              href={`/terraos-teaser-preview?screen=${id}`}
              className="v3-bottom-nav__item terraos-live-preview-nav__item"
              data-active={active ? "true" : "false"}
              aria-current={active ? "page" : undefined}
              aria-label={label}
            >
              <Icon
                className="terraos-live-preview-nav__icon"
                strokeWidth={active ? 2.35 : 1.9}
                aria-hidden="true"
              />
              <span className="v3-bottom-nav__label terraos-live-preview-nav__label">
                {label}
              </span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
