/**
 * Defense-in-depth at the voting audit read boundary.
 *
 * Historical audit rows remain untouched in the database. Only the Organizer
 * response projection masks fields that could contain authentication material.
 * Do not use this for authorization or to overwrite canonical audit evidence.
 */
export type VotingAuditJson =
  | string
  | number
  | boolean
  | null
  | VotingAuditJson[]
  | { [key: string]: VotingAuditJson };

export const REDACTED_VOTING_AUDIT_VALUE = "[redacted credential]";

const SENSITIVE_NAMES = new Set([
  "password",
  "passwd",
  "passphrase",
  "authorization",
  "authheader",
  "cookie",
  "setcookie",
  "jwt",
  "apikey",
  "servicekey",
  "servicerolekey",
  "privatekey",
  "clientsecret",
  "secret",
  "credential",
  "credentials",
  "otp",
  "recoverycode",
  "recoverytoken",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "sessiontoken",
  "bearertoken",
]);

export function isSensitiveVotingAuditField(field: string): boolean {
  const normalized = field.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (
    SENSITIVE_NAMES.has(normalized) ||
    /(?:password|passwd|passphrase|token|apikey|privatekey|secret|credential|cookie)$/.test(normalized)
  );
}

export function redactVotingAuditPayload(
  value: VotingAuditJson,
  depth = 0,
): VotingAuditJson {
  // Malformed or unexpectedly deep audit objects must not consume unbounded
  // recursion or expose nested credential-like content.
  if (depth >= 32) return REDACTED_VOTING_AUDIT_VALUE;
  if (Array.isArray(value)) {
    return value.map((item) => redactVotingAuditPayload(item, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([field, item]) => [
        field,
        isSensitiveVotingAuditField(field)
          ? REDACTED_VOTING_AUDIT_VALUE
          : redactVotingAuditPayload(item, depth + 1),
      ]),
    );
  }
  return value;
}
