/**
 * Terra Solaris / Court / Ethics push disclosure boundary.
 *
 * Lock-screen notifications are not an authenticated workspace. Until the
 * organization and case capability model is fully deployed, classify every
 * world-owned event conservatively, not only events whose producers remembered
 * to set a sensitivity flag. Full content remains in the authenticated app.
 */
export type WorldPushCandidate = {
  id?: unknown;
  category?: unknown;
  event_type?: unknown;
  route?: unknown;
  title?: unknown;
  body?: unknown;
  dedupe_key?: unknown;
  sensitive?: unknown;
  visibility?: unknown;
  privacy?: unknown;
};

function normalized(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isPrivateWorldPush(candidate: WorldPushCandidate): boolean {
  if (candidate.sensitive === true) return true;
  if (
    ["private", "confidential", "restricted", "committee", "sealed"].includes(
      normalized(candidate.visibility) || normalized(candidate.privacy),
    )
  ) return true;

  const category = normalized(candidate.category);
  const eventType = normalized(candidate.event_type);
  const route = normalized(candidate.route);

  // Event/route namespace is also a privacy boundary. Unknown world events
  // must not accidentally display their producer-provided case details.
  if (category === "world" || category.startsWith("world_") || category.startsWith("world.")) return true;
  if (eventType === "world" || eventType.startsWith("world.") || eventType.startsWith("world_")) return true;
  if (route === "/world" || route.startsWith("/world/") || route.startsWith("/world?")) return true;

  // Canonical responsibility/task kinds can be delivered through the ordinary
  // Task category, so never rely solely on category=world.
  return /(?:^|[._:-])(?:court|ethics|investigation|leadership)(?:[._:-]|$)/.test(
    `${category} ${eventType}`,
  );
}

export function publicPushEnvelope(candidate: WorldPushCandidate) {
  const sensitive = isPrivateWorldPush(candidate);
  if (!sensitive) {
    return {
      title: typeof candidate.title === "string" ? candidate.title : "Solaris Studio",
      body: typeof candidate.body === "string" ? candidate.body : "",
      tag: typeof candidate.dedupe_key === "string" ? candidate.dedupe_key : undefined,
      sensitivity: "public" as const,
    };
  }

  // Delivery ID is an opaque immutable key, unlike the dedupe key which may
  // contain the case or subject identity. Avoid sending that identifier to
  // the notification tray/provider as a tag for confidential events.
  const id = normalized(candidate.id);
  const opaqueId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)
    ? id
    : "unidentified";

  return {
    title: "Terra Solaris",
    body: "You have a new institutional update.",
    tag: `world-private:${opaqueId}`,
    sensitivity: "private" as const,
  };
}
