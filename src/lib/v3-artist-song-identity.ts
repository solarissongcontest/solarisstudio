export type V3MusicEntityKind = "artist" | "song";

/**
 * P9 deliberately distinguishes a published Entry reference from a durable
 * first-class Artist/Song entity. Solaris currently has stable Entry IDs, while
 * artist/song values remain mutable display text on Entry/participation models.
 *
 * `entry_reference` is safe catalogue evidence. It is never authority to mint
 * `/artists/<slug>` or `/songs/<slug>` from display text.
 */
export type V3MusicIdentity =
  | {
      kind: V3MusicEntityKind;
      identity: "entry_reference";
      entryId: string;
      label: string;
      publicEntityId: null;
      href: null;
    }
  | {
      kind: V3MusicEntityKind;
      identity: "first_class";
      entryId: string | null;
      label: string;
      publicEntityId: string;
      href: string;
    };

function nonEmpty(value: string, label: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

/**
 * Public entity URLs must be derived from opaque System IDs, never from
 * display labels or a caller-supplied href. Reject "." and ".." because URL
 * parsers normalize even percent-encoded dot-only path segments.
 */
function canonicalMusicPath(kind: V3MusicEntityKind, rawPublicEntityId: string): string {
  const publicEntityId = nonEmpty(rawPublicEntityId, "Public entity id");
  if (publicEntityId === "." || publicEntityId === "..") {
    throw new Error("Public entity id is not a valid path segment");
  }

  return `/${kind === "artist" ? "artists" : "songs"}/${encodeURIComponent(publicEntityId)}`;
}

export function entryBoundMusicIdentity(input: {
  kind: V3MusicEntityKind;
  entryId: string;
  label: string;
}): V3MusicIdentity {
  return {
    kind: input.kind,
    identity: "entry_reference",
    entryId: nonEmpty(input.entryId, "Entry id"),
    label: nonEmpty(input.label, "Music entity label"),
    publicEntityId: null,
    href: null,
  };
}

/**
 * Routes become legal only after System supplies an opaque stable public entity
 * id. Display names never participate in identity or routing.
 */
export function firstClassMusicIdentity(input: {
  kind: V3MusicEntityKind;
  publicEntityId: string;
  label: string;
  entryId?: string | null;
}): V3MusicIdentity {
  const publicEntityId = nonEmpty(input.publicEntityId, "Public entity id");
  const label = nonEmpty(input.label, "Music entity label");

  return {
    kind: input.kind,
    identity: "first_class",
    entryId: input.entryId?.trim() || null,
    label,
    publicEntityId,
    href: canonicalMusicPath(input.kind, publicEntityId),
  };
}

export function musicIdentityIsRoutable(
  identity: V3MusicIdentity,
): identity is Extract<V3MusicIdentity, { identity: "first_class" }> {
  return (
    identity.identity === "first_class" &&
    (identity.kind === "artist" || identity.kind === "song") &&
    typeof identity.publicEntityId === "string" &&
    identity.publicEntityId.trim().length > 0 &&
    identity.publicEntityId.trim() !== "." &&
    identity.publicEntityId.trim() !== ".."
  );
}

export function musicEntityHref(identity: V3MusicIdentity): string | null {
  // The stored href is presentation metadata, not routing authority. Derive the
  // destination again so stale or tampered data cannot send users elsewhere.
  return musicIdentityIsRoutable(identity)
    ? canonicalMusicPath(identity.kind, identity.publicEntityId)
    : null;
}
