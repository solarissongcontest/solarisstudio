import type { V3S16DomainDefinition } from "./v3-s16-mutation-authority";

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

/**
 * Forward-only S16 inventory additions introduced after the original domain
 * registry was frozen for the five-lane integration. Keeping these additions
 * explicit lets exact-SHA evidence prove new command ownership without treating
 * an owner-only primitive or trigger name as authority by itself.
 */
export function extendV3S16Domains(
  domains: readonly V3S16DomainDefinition[],
): readonly V3S16DomainDefinition[] {
  return domains.map((domain) => {
    if (domain.id === "jury") {
      return {
        ...domain,
        canonicalTables: unique([
          ...domain.canonicalTables,
          "public.studio2_jury_vote_versions",
        ]),
        canonicalCommands: unique([
          ...domain.canonicalCommands,
          "public.studio2_apply_jury_vote_change",
          "public.studio2_apply_jury_ballot_review",
        ]),
        knownLegacyWriterPatterns: [
          ...(domain.knownLegacyWriterPatterns ?? []),
          {
            id: "browser-direct-assign_jury_vote",
            pattern: /\.rpc\(\s*["']assign_jury_vote["']/,
          },
          {
            id: "browser-direct-clear_jury_point",
            pattern: /\.rpc\(\s*["']clear_jury_point["']/,
          },
        ],
      };
    }

    if (domain.id === "entry") {
      return {
        ...domain,
        canonicalCommands: unique([
          ...domain.canonicalCommands,
          "public.studio2_apply_participation_status",
        ]),
      };
    }

    return domain;
  });
}
