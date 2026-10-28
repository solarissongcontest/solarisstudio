export const V3_ACCOUNT_SESSION_EVENT_AUTHORITY_VERSION = 1 as const;

export type V3AccountSessionEventAuthority = {
  eventType: "account.changed" | "session.changed" | "session.revoked";
  canonicalState: readonly string[];
  canonicalMutations: readonly string[];
  synchronousSecurityBoundary: readonly string[];
  eventPersistence: "tracked_optional_consequence";
  consumers: readonly string[];
  requiredConsequences: readonly string[];
  idempotency: string;
  reconciliation: string;
  failureImpact: string;
};

/**
 * Account/session events are intentionally consequences, not authorization
 * authorities. The table/Auth mutation is complete before an optional event can
 * matter, and every protected request revalidates canonical security state.
 *
 * Keeping the declared event identities here still makes their remaining
 * projection/realtime maturity auditable instead of deleting the findings just
 * because the security boundary no longer depends on them.
 */
export const V3_ACCOUNT_SESSION_EVENT_AUTHORITY: readonly V3AccountSessionEventAuthority[] = [
  {
    eventType: "account.changed",
    canonicalState: [
      "public.country_accounts",
      "auth.users for Supabase identity lifecycle only",
    ],
    canonicalMutations: [
      "public.v3_claim_country_account",
      "public.v3_set_country_account_status",
      "public.v3_set_owned_hod_auto_assign",
      "public.claim_country_from_signup (sanctioned pre-session auth trigger)",
    ],
    synchronousSecurityBoundary: [
      "country_accounts mutation grants are revoked from API/service roles",
      "governed account commands resolve the authenticated actor and capability",
      "permission-sensitive reads consult canonical active account state",
      "active-session validation precedes authenticated account commands",
    ],
    eventPersistence: "tracked_optional_consequence",
    consumers: [
      "Me/account projection invalidation",
      "Organizer country-account projection invalidation",
      "realtime/cache refresh where enabled",
      "analytics/audit enrichment where enabled",
    ],
    requiredConsequences: [
      "no event consumer may grant or preserve account authorization",
      "failed delivery may leave a projection stale only until canonical read/reconciliation",
    ],
    idempotency: "Canonical account commands use the shared operation/idempotency ledger; optional event consumers must dedupe by event identity if introduced.",
    reconciliation: "Reload account and permission projections from public.country_accounts and the canonical permission engine.",
    failureImpact: "Optional event loss may delay refresh/observability; it cannot restore suspended access or mutate canonical account truth.",
  },
  {
    eventType: "session.changed",
    canonicalState: [
      "auth.sessions",
      "auth.refresh_tokens as Supabase Auth-managed rotating credentials",
    ],
    canonicalMutations: [
      "Supabase Auth sign-in/session restoration",
      "Supabase Auth refresh-token rotation",
      "Supabase Auth sign-out/re-authentication",
    ],
    synchronousSecurityBoundary: [
      "JWT session_id is matched to the authenticated user in auth.sessions",
      "private.v3_require_active_auth_session locks and validates the current session row",
      "the shared Data API pre-request guard rejects absent/expired sessions",
    ],
    eventPersistence: "tracked_optional_consequence",
    consumers: [
      "ViewerContext/authentication-state refresh",
      "private query invalidation",
      "account-scoped cache namespace rotation",
      "device/session list refresh",
    ],
    requiredConsequences: [
      "refresh rotation must not create a second Solaris session authority",
      "stale client identity may not publish after the active actor/session changes",
    ],
    idempotency: "Supabase Auth owns refresh-token rotation/reuse semantics; Solaris does not mirror refresh tokens into a competing authority store.",
    reconciliation: "Re-read Supabase Auth session state and rebuild ViewerContext/private projections from the active authenticated actor.",
    failureImpact: "Missed optional notification may leave UI stale; protected requests still revalidate auth.sessions synchronously.",
  },
  {
    eventType: "session.revoked",
    canonicalState: [
      "absence of the revoked session in auth.sessions",
      "public.studio2_account_session_revocations as reconciliation/audit tombstone for Solaris-managed revocation",
    ],
    canonicalMutations: [
      "public.v3_revoke_session",
      "Supabase Auth current-session/global sign-out where applicable",
    ],
    synchronousSecurityBoundary: [
      "auth.sessions deletion is canonical revocation truth",
      "auth.refresh_tokens cascade from the deleted session",
      "the Data API active-session guard rejects stale access JWTs",
      "FOR KEY SHARE admission serializes already-authorized DB transactions with revocation DELETE",
      "revocation tombstones are not directly mutable by service_role",
    ],
    eventPersistence: "tracked_optional_consequence",
    consumers: [
      "device/session projection refresh",
      "private cache purge/invalidation",
      "security-history presentation",
      "optional realtime/analytics consumers",
    ],
    requiredConsequences: [
      "revocation denial is effective without waiting for event delivery",
      "a request admitted before revocation may finish its already-authorized DB transaction; later requests fail closed",
      "protected-mode session recovery cannot resurrect an absent auth.sessions row",
    ],
    idempotency: "public.v3_revoke_session is operation-ledger/idempotency protected and reconciles already-revoked targets.",
    reconciliation: "Rebuild the session list from auth.sessions plus privacy-safe tombstone history; absence of auth.sessions wins over stale UI/cache state.",
    failureImpact: "Optional event loss may delay visual invalidation only; it cannot preserve access after canonical revocation commits.",
  },
] as const;

export function v3AccountSessionEventAuthority(eventType: string) {
  return V3_ACCOUNT_SESSION_EVENT_AUTHORITY.find((entry) => entry.eventType === eventType) ?? null;
}
