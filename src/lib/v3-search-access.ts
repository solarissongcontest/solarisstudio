export type V3SearchVisibility = "public" | "authenticated" | "delegation" | "organizer" | "superadmin";

export type V3SearchAccessContext = {
  authenticated: boolean;
  delegationIds: readonly string[];
  organizer: boolean;
  superadmin: boolean;
};

export type V3SearchDocument = {
  id: string;
  kind: string;
  visibility: V3SearchVisibility;
  delegationId?: string | null;
  published?: boolean;
  sensitive?: boolean;
};

export type V3SearchAccessDecision = {
  allowed: boolean;
  reason:
    | "public"
    | "authenticated"
    | "delegation"
    | "organizer"
    | "superadmin"
    | "unpublished"
    | "sensitive"
    | "unauthenticated"
    | "wrong_delegation"
    | "insufficient_capability";
};

/**
 * Search snippets must never become an authorization bypass. The caller should
 * apply this policy server-side before returning either result metadata or
 * highlighted snippets. Direct-route authorization remains authoritative too.
 */
export function evaluateV3SearchAccess(
  document: V3SearchDocument,
  context: V3SearchAccessContext,
): V3SearchAccessDecision {
  if (document.sensitive && !context.superadmin && !context.organizer) {
    return { allowed: false, reason: "sensitive" };
  }

  if (document.published === false && !context.organizer && !context.superadmin) {
    return { allowed: false, reason: "unpublished" };
  }

  switch (document.visibility) {
    case "public":
      return { allowed: true, reason: "public" };
    case "authenticated":
      return context.authenticated
        ? { allowed: true, reason: "authenticated" }
        : { allowed: false, reason: "unauthenticated" };
    case "delegation":
      if (!context.authenticated) return { allowed: false, reason: "unauthenticated" };
      if (!document.delegationId || !context.delegationIds.includes(document.delegationId)) {
        return { allowed: false, reason: "wrong_delegation" };
      }
      return { allowed: true, reason: "delegation" };
    case "organizer":
      return context.organizer || context.superadmin
        ? { allowed: true, reason: "organizer" }
        : { allowed: false, reason: "insufficient_capability" };
    case "superadmin":
      return context.superadmin
        ? { allowed: true, reason: "superadmin" }
        : { allowed: false, reason: "insufficient_capability" };
  }
}

export function filterV3SearchDocuments(
  documents: readonly V3SearchDocument[],
  context: V3SearchAccessContext,
) {
  return documents.filter((document) => evaluateV3SearchAccess(document, context).allowed);
}
