import type { ReactNode } from "react";

import { CinematicEditorialHero } from "@/components/v3/CinematicEditorialHero";
import "@/styles/v3-show-web-cinematic.css";

export function ShowWebCinematicHero({
  name,
  edition,
  kind,
  artworkUrl,
  publishedDescription,
  actions,
}: {
  name: string;
  edition: string;
  kind: string;
  artworkUrl: string | null;
  publishedDescription: string;
  actions: ReactNode;
}) {
  return (
    <div className="show-web-cinematic" data-show-web-experience="editorial">
      <CinematicEditorialHero
        kind="show"
        eyebrow={edition}
        title={name}
        subtitle={kind.replace(/-/g, " ")}
        imageUrl={artworkUrl}
      />
      <div className="show-web-cinematic__identity">
        <p>{publishedDescription}</p>
        <div className="show-web-cinematic__actions">{actions}</div>
      </div>
    </div>
  );
}
