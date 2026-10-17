export type V3MusicEntityKind = "artist" | "song";

/**
 * P9 deliberately distinguishes a published Entry reference from a durable
 * first-class Artist/Song entity. The current schema has stable Entry UUIDs but
 * artist/song values are mutable text attached to entries/participations.
 *
 * `entry_reference` is useful catalogue evidence. It is not a license to mint
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
  const routeRoot = input.kind === "artist" ? "/artists" : "/songs";

  return {
    kind: input.kind,
    identity: "first_class",
    entryId: input.entryId?.trim() || null,
    label,
    publicEntityId,
    href: `${routeRoot}/${encodeURIComponent(publicEntityId)}`,
  };
}

export function musicIdentityIsRoutable(identity: V3MusicIdentity): identity is Extract<V3MusicIdentity, { identity: "first_class" }> {
  return identity.identity === "first_class";
}

export function musicEntityHref(identity: V3MusicIdentity): string | null {
  return musicIdentityIsRoutable(identity) ? identity.href : null;
}
