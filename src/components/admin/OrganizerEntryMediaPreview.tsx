import { useState } from "react";

import {
  resolveOrganizerEntryMediaPreview,
  type OrganizerEntryPreviewRole,
} from "@/lib/v3-organizer-entry-media-preview";

type EntryPreviewField = {
  role: OrganizerEntryPreviewRole;
  label: string;
  sourceUrl: string | null | undefined;
};

function EntryMediaSourcePlayer({ role, label, sourceUrl }: EntryPreviewField) {
  const preview = resolveOrganizerEntryMediaPreview(sourceUrl, role);
  const [loadRequested, setLoadRequested] = useState(false);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/10 p-3">
      <p className="text-xs font-semibold">{label}</p>
      {!preview ? (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {sourceUrl?.trim()
            ? "No supported inline preview for this source. Inspect the original link instead."
            : "No direct media source was submitted."}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            External {preview.kind} hosted by {preview.host}. Loading a preview
            contacts that host and may use data. Preview is not an editorial approval.
          </p>
          {!loadRequested ? (
            <button
              type="button"
              className="admin-action-secondary"
              onClick={() => setLoadRequested(true)}
            >
              Load {preview.kind} preview
            </button>
          ) : (
            <div className="space-y-2">
              {preview.kind === "audio" ? (
                <audio
                  controls
                  preload="none"
                  src={preview.url}
                  className="w-full"
                  aria-label={`${label} audio preview`}
                />
              ) : (
                <video
                  controls
                  preload="none"
                  playsInline
                  src={preview.url}
                  className="max-h-72 w-full rounded-lg bg-black object-contain"
                  aria-label={`${label} video preview`}
                />
              )}
              <button
                type="button"
                className="admin-action-secondary"
                onClick={() => setLoadRequested(false)}
              >
                Unload preview
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Mounted only while an Organizer Entry review sheet is open, and keyed by
 * exact response / immutable Entry version / source identity in the route.
 */
export function OrganizerEntryMediaPreview({
  songUrl,
  replacementVideoUrl,
  replacementVideoRequired,
}: {
  songUrl: string | null | undefined;
  replacementVideoUrl: string | null | undefined;
  replacementVideoRequired: boolean | null | undefined;
}) {
  return (
    <section aria-label="Review submitted Entry media" className="space-y-2">
      <p className="text-sm font-semibold">Inspect submitted media</p>
      <EntryMediaSourcePlayer role="song" label="Song source" sourceUrl={songUrl} />
      {replacementVideoRequired || replacementVideoUrl?.trim() ? (
        <EntryMediaSourcePlayer
          role="replacement_video"
          label="Replacement video"
          sourceUrl={replacementVideoUrl}
        />
      ) : null}
    </section>
  );
}
