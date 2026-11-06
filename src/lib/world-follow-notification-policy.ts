import type {
  WorldFollowCategory,
  WorldOrganizationFollowState,
} from "./world-organization-follows";

/** Server-produced PUBLIC event classification. This is a *delivery filter*
 * only; it must never be treated as permission to read an institution or
 * evidence that its source was published. Caller MUST validate current World
 * rollout, source-publication status and organization visibility in SQL first.
 */
export type WorldPublicFollowEvent = {
  organizationId: string;
  category: WorldFollowCategory;
  importance: "normal" | "important";
  /** Source authority must explicitly verify this particular event's publication. */
  verifiedPublic: boolean;
  /** Category comes from canonical producer, not a fan/subscriber-selected label. */
  sourceEventType: string;
};

const categories = new Set<WorldFollowCategory>([
  "statements", "resolutions", "leadership", "sessions",
  "documents", "proposals", "membership",
]);

/**
 * Important: all official statements and published leadership transitions;
 * certified resolutions only if authoritative source marks them major.
 * This matches the World canonical default rather than spamming every bill.
 */
export function eligibleWorldFollowCategory(
  category: WorldFollowCategory,
  importance: "normal" | "important",
  notificationLevel: "none" | "important" | "all",
): boolean {
  if (!categories.has(category) || notificationLevel === "none") return false;
  if (notificationLevel === "all") return true;
  return category === "statements" || category === "leadership" ||
    (category === "resolutions" && importance === "important");
}

/** Never evaluates required role work. Role tasks bypass optional fan follows
 * and MUST be validated in the canonical Task Engine recipient authority.
 */
export function shouldQueueOptionalWorldFollowNotification(
  event: WorldPublicFollowEvent,
  follow: WorldOrganizationFollowState | null,
): boolean {
  if (!follow || event.verifiedPublic !== true ||
      event.organizationId !== follow.organizationId ||
      !event.sourceEventType || !categories.has(event.category) ||
      follow.categories[event.category] !== true) return false;

  return eligibleWorldFollowCategory(
    event.category, event.importance, follow.notificationLevel,
  );
}

/** No sensitive text is ever composed into a lock-screen push candidate. */
export function publicWorldFollowPushPreview(
  organizationDisplayName: string,
  event: WorldPublicFollowEvent,
): { title: string; body: string } {
  // Caller must still validate org identity, public publication and recipient
  // authorization before dispatch. This intentionally has NO event title/body.
  // Never reflect a candidate organization name on a lock screen until the
  // authoritative publication check is complete. Required-role/private notices
  // must use a separate generic sensitive-message delivery class.
  if (event.verifiedPublic !== true) {
    return { title: "Terra Solaris", body: "An update is available in Solaris." };
  }
  const title = organizationDisplayName.trim().slice(0, 80) || "Terra Solaris";
  return { title, body: event.category === "statements"
    ? "A new official statement is available."
    : "A new institutional update is available." };
}
