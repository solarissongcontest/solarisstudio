import { ExternalLink, Headphones, Play } from "lucide-react";

import { listenLinksFrom } from "@/lib/entry-utils";
import { cn } from "@/lib/utils";

export function EntryListenLinks({
  entry,
  compact = false,
  className,
}: {
  entry?: unknown;
  compact?: boolean;
  className?: string;
}) {
  const links = listenLinksFrom(entry);
  const services = [
    links.youtube_url
      ? { label: "YouTube", href: links.youtube_url, icon: Play }
      : null,
    links.spotify_url
      ? { label: "Spotify", href: links.spotify_url, icon: Headphones }
      : null,
    links.apple_music_url
      ? { label: "Apple Music", href: links.apple_music_url, icon: Headphones }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (!services.length) return null;

  return (
    <div className={cn("flex min-w-0 flex-wrap gap-1.5", className)} aria-label="Listen to this entry">
      {services.map(({ label, href, icon: Icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/85 font-semibold text-foreground transition-colors hover:border-primary/35 hover:bg-surface-strong",
            compact ? "min-h-7 px-2.5 text-[10px]" : "min-h-9 px-3 text-xs",
          )}
          aria-label={`Listen on ${label} (opens in a new tab)`}
        >
          <Icon className={compact ? "size-3" : "size-3.5"} aria-hidden="true" />
          <span>{label}</span>
          {!compact && <ExternalLink className="size-3 opacity-55" aria-hidden="true" />}
        </a>
      ))}
    </div>
  );
}
