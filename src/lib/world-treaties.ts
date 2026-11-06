/** Public TG4 treaty projection. Invited parties are NOT signatories. */
export type PublishedTreatyParty = {
  countryId: string;
  countryName: string;
  countryCode: string;
  role: string;
  status: "invited" | "signed" | "ratified" | "withdrawn";
  signedAt: string | null;
  ratifiedAt: string | null;
  withdrewAt: string | null;
};

export type PublishedTreaty = {
  treatyId: string;
  documentId: string;
  organizationSlug: string;
  organizationName: string;
  documentSlug: string;
  title: string;
  treatyType: string;
  status: string;
  openedAt: string | null;
  effectiveAt: string | null;
  terminatedAt: string | null;
  versionNumber: number;
  contentHash: string;
  documentEffectiveFrom: string | null;
  parties: PublishedTreatyParty[];
};

const object = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? v as Record<string, unknown> : null;
const nonempty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const optionalDate = (v: unknown): v is string | null =>
  v === null || (typeof v === "string" && Number.isFinite(Date.parse(v)));

export function parsePublishedTreaties(value: unknown): PublishedTreaty[] {
  const root = object(value);
  if (!root || !Array.isArray(root.treaties) || root.treaties.length > 100) {
    throw new Error("The canonical treaty index is unavailable.");
  }
  const seen = new Set<string>();
  return root.treaties.map((raw: unknown) => {
    const t = object(raw);
    if (!t || !nonempty(t.treatyId) || seen.has(t.treatyId) ||
        !nonempty(t.documentId) || !nonempty(t.organizationSlug) ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t.organizationSlug) ||
        !nonempty(t.organizationName) || !nonempty(t.documentSlug) ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t.documentSlug) ||
        !nonempty(t.title) || !nonempty(t.treatyType) || !nonempty(t.status) ||
        !Number.isSafeInteger(t.versionNumber) || (t.versionNumber as number) < 1 ||
        typeof t.contentHash !== "string" || !/^[a-f0-9]{64}$/.test(t.contentHash) ||
        !optionalDate(t.openedAt) || !optionalDate(t.effectiveAt) ||
        !optionalDate(t.terminatedAt) || !optionalDate(t.documentEffectiveFrom) ||
        !Array.isArray(t.parties) || t.parties.length > 100) {
      throw new Error("The treaty index contains invalid or unverifiable official data.");
    }
    seen.add(t.treatyId);
    const parties = t.parties.map((entry: unknown) => {
      const p = object(entry);
      if (!p || !nonempty(p.countryId) || !nonempty(p.countryName) ||
          !nonempty(p.countryCode) || !nonempty(p.role) ||
          !["invited","signed","ratified","withdrawn"].includes(String(p.status)) ||
          !optionalDate(p.signedAt) || !optionalDate(p.ratifiedAt) ||
          !optionalDate(p.withdrewAt)) {
        throw new Error("The treaty party projection is incomplete.");
      }
      if (p.status === "invited" && (p.signedAt || p.ratifiedAt || p.withdrewAt)) {
        throw new Error("An invited treaty party cannot have a verified signature.");
      }
      return {
        countryId: p.countryId, countryName: p.countryName,
        countryCode: p.countryCode, role: p.role, status: p.status,
        signedAt: p.signedAt, ratifiedAt: p.ratifiedAt, withdrewAt: p.withdrewAt,
      } as PublishedTreatyParty;
    });
    if (new Set(parties.map((p) => p.countryId)).size !== parties.length) {
      throw new Error("A treaty party appeared more than once.");
    }
    return {
      treatyId: t.treatyId, documentId: t.documentId,
      organizationSlug: t.organizationSlug,
      organizationName: t.organizationName,
      documentSlug: t.documentSlug, title: t.title,
      treatyType: t.treatyType, status: t.status,
      openedAt: t.openedAt, effectiveAt: t.effectiveAt,
      terminatedAt: t.terminatedAt, versionNumber: t.versionNumber,
      contentHash: t.contentHash, documentEffectiveFrom: t.documentEffectiveFrom,
      parties,
    } as PublishedTreaty;
  });
}

export const TREATY_KINDS = [
  "bilateral","multilateral","founding","accession","protocol","other",
] as const;

export function validateTreatyRegistration(input: {
  treatyType: string;
  partyIds: readonly string[];
}): string | null {
  if (!TREATY_KINDS.includes(input.treatyType as (typeof TREATY_KINDS)[number])) {
    return "Select a supported treaty type.";
  }
  if (!input.partyIds.length || input.partyIds.length > 100 ||
      input.partyIds.some((id) => !id) ||
      new Set(input.partyIds).size !== input.partyIds.length) {
    return "Select 1–100 unique listed countries, without duplicates.";
  }
  return null;
}
