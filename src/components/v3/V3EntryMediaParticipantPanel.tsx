import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
} from "lucide-react";
import { useId, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  loadMyEntryMediaProjection,
  uploadVerifiedEntryMedia,
  type V3EntryMediaAssetType,
} from "@/lib/v3-entry-media-authority";
import {
  participantEntryMediaAsset,
  presentV3EntryMediaAsset,
  validateV3EntryMediaSelection,
  V3_ENTRY_MEDIA_ACCEPTED_MIME_TYPES,
  V3_ENTRY_MEDIA_PARTICIPANT_SLOTS,
} from "@/lib/v3-entry-media-participant";
import { cn } from "@/lib/utils";
import { V3Surface } from "./V3Foundation";

const QUERY_PREFIX = "v3-entry-media-participant";

type UploadInput = {
  assetType: V3EntryMediaAssetType;
  file: File;
};

function attentionClass(attention: "neutral" | "working" | "success" | "danger") {
  if (attention === "success") return "text-emerald-300";
  if (attention === "danger") return "text-[var(--v3-danger)]";
  if (attention === "working") return "text-amber-200";
  return "text-[var(--v3-text-secondary)]";
}

function AttentionIcon({ attention }: { attention: "neutral" | "working" | "success" | "danger" }) {
  if (attention === "success") return <CheckCircle2 className="size-4" aria-hidden="true" />;
  if (attention === "danger") return <ShieldAlert className="size-4" aria-hidden="true" />;
  if (attention === "working") return <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />;
  return <Clock3 className="size-4" aria-hidden="true" />;
}

function EntryMediaSlot({
  assetType,
  label,
  description,
  asset,
  readOnly,
  pending,
  onUpload,
}: {
  assetType: V3EntryMediaAssetType;
  label: string;
  description: string;
  asset: ReturnType<typeof participantEntryMediaAsset>;
  readOnly: boolean;
  pending: boolean;
  onUpload: (input: UploadInput) => void;
}) {
  const inputId = useId();
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const presentation = presentV3EntryMediaAsset(asset);
  const replacement = presentation.state === "replacement_required" || presentation.state === "failed";

  return (
    <V3Surface className="p-4" data-v3-entry-media-slot={assetType}>
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-current/25",
            attentionClass(presentation.attention),
          )}
        >
          <AttentionIcon attention={presentation.attention} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold">{label}</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--v3-text-tertiary)]">{description}</p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full border border-current/25 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em]",
                attentionClass(presentation.attention),
              )}
            >
              {presentation.label}
            </span>
          </div>

          <p className="mt-3 text-sm leading-6 text-[var(--v3-text-secondary)]">
            {presentation.detail}
          </p>

          {!readOnly ? (
            <div className="mt-4">
              <input
                id={inputId}
                type="file"
                accept={V3_ENTRY_MEDIA_ACCEPTED_MIME_TYPES.join(",")}
                className="sr-only"
                disabled={pending}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (!file) return;
                  const error = validateV3EntryMediaSelection(file);
                  if (error) {
                    setSelectionError(error);
                    return;
                  }
                  setSelectionError(null);
                  onUpload({ assetType, file });
                }}
              />
              <label
                htmlFor={inputId}
                aria-disabled={pending || undefined}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[var(--v3-border)] px-4 text-sm font-semibold",
                  pending && "pointer-events-none opacity-60",
                )}
              >
                {pending ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : replacement ? (
                  <RefreshCw className="size-4" aria-hidden="true" />
                ) : (
                  <UploadCloud className="size-4" aria-hidden="true" />
                )}
                {pending ? "Uploading…" : replacement ? "Choose replacement" : asset ? "Replace image" : "Choose image"}
              </label>
              <p className="mt-2 text-xs leading-5 text-[var(--v3-text-tertiary)]">
                JPEG, PNG or WebP · maximum 5 MB. Solaris verifies the image again on the server before it becomes the current Entry source.
              </p>
              {selectionError ? (
                <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-[var(--v3-danger)]" role="alert">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {selectionError}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-xs leading-5 text-[var(--v3-text-tertiary)]">
              Participant View is read-only. Open the delegation’s authoritative Organizer workspace to change official state.
            </p>
          )}
        </div>
      </div>
    </V3Surface>
  );
}

export function V3EntryMediaParticipantPanel({
  entryId,
  readOnly = false,
}: {
  entryId: string;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const queryKey = [QUERY_PREFIX, entryId] as const;

  const projection = useQuery({
    queryKey,
    enabled: Boolean(entryId),
    queryFn: () => loadMyEntryMediaProjection({ client: supabase, entryId }),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  const upload = useMutation({
    mutationFn: ({ assetType, file }: UploadInput) =>
      uploadVerifiedEntryMedia({
        client: supabase,
        entryId,
        assetType,
        file,
      }),
    onMutate: () => setMessage(null),
    onSuccess: async (result) => {
      setMessage(
        result.commit.replayed
          ? "Solaris reconciled the existing verified upload. The current server state is shown below."
          : "Upload verified and committed. Solaris is now validating the current Entry source.",
      );
      await queryClient.invalidateQueries({ queryKey });
      await projection.refetch();
    },
    onError: async (error) => {
      setMessage(
        error instanceof Error
          ? error.message
          : "Solaris could not verify this media upload. Nothing was accepted from browser state alone.",
      );
      await projection.refetch();
    },
  });

  if (!entryId) {
    return (
      <V3Surface className="p-5" data-v3-entry-media-state="unavailable">
        <h2 className="font-semibold">Entry media unavailable</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--v3-text-secondary)]">
          Solaris needs an authoritative Entry before media can be attached.
        </p>
      </V3Surface>
    );
  }

  if (projection.isPending) {
    return (
      <V3Surface className="p-5" data-v3-entry-media-state="loading" aria-busy="true">
        <div className="flex items-center gap-3 text-sm text-[var(--v3-text-secondary)]">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Loading current Entry media…
        </div>
      </V3Surface>
    );
  }

  if (projection.isError || !projection.data) {
    return (
      <V3Surface className="p-5" data-v3-entry-media-state="error">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[var(--v3-danger)]" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Entry media could not be verified</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--v3-text-secondary)]" role="alert">
              {projection.error instanceof Error
                ? projection.error.message
                : "Solaris could not load the caller-scoped media projection."}
            </p>
            <button
              type="button"
              onClick={() => void projection.refetch()}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-[var(--v3-border)] px-4 text-sm font-semibold"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Retry
            </button>
          </div>
        </div>
      </V3Surface>
    );
  }

  return (
    <div className="space-y-3" data-v3-entry-media-state="ready">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--v3-text-tertiary)]">
          Entry media
        </p>
        <h2 className="mt-1 text-lg font-semibold">Current verified sources</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--v3-text-secondary)]">
          These states come from the caller-scoped Solaris media projection. Finishing a browser upload does not mean an image has been accepted.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {V3_ENTRY_MEDIA_PARTICIPANT_SLOTS.map((slot) => (
          <EntryMediaSlot
            key={slot.assetType}
            assetType={slot.assetType}
            label={slot.label}
            description={slot.description}
            asset={participantEntryMediaAsset(projection.data, slot.assetType)}
            readOnly={readOnly}
            pending={upload.isPending && upload.variables?.assetType === slot.assetType}
            onUpload={(input) => upload.mutate(input)}
          />
        ))}
      </div>

      {message ? (
        <p
          className={cn(
            "rounded-xl border border-[var(--v3-border)] px-3 py-2 text-sm leading-6",
            upload.isError ? "text-[var(--v3-danger)]" : "text-[var(--v3-text-secondary)]",
          )}
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
