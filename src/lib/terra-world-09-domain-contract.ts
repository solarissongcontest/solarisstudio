/**
 * WORLD-09 domain-local ownership manifest.
 *
 * This file is deliberately self-contained until WORLD-01 admits these
 * additive contracts into the shared S15/S16 registry. In particular, no
 * "complete" status is asserted before disposable-DB RLS/command verification.
 */
export const WORLD_09_DOMAIN_CONTRACT = [
  {
    phase: "TG16",
    domain: "country-domestic-political-canon",
    authority: "public.country_accounts active country controller",
    reusedTruth: ["public.country_accounts", "public.country_profiles", "public.countries"],
    tables: [
      "public.world_domestic_parties",
      "public.world_domestic_elections",
      "public.world_domestic_record_revisions",
    ],
    migrations: ["20261107004000_v3_tg16_domestic_politics_history.sql"],
    commands: ["public.world_write_domestic_canon_v1"],
    projections: ["public.world_domestic_country_v1"],
    events: ["world.domestic_party.changed", "world.domestic_election.recorded"],
    publicRoute: "/world/domestic/:code",
    status: "implemented",
    verified: false,
  },
  {
    phase: "TG16",
    domain: "country-domestic-legislatures",
    authority: "public.country_accounts active country controller",
    reusedTruth: ["public.country_accounts", "public.country_profiles", "public.countries"],
    tables: [
      "public.world_domestic_legislatures",
      "public.world_domestic_chambers",
      "public.world_domestic_structure_revisions",
    ],
    migrations: ["20261107004100_v3_tg16_legislature_chambers.sql"],
    commands: ["public.world_write_domestic_structure_v1"],
    projections: ["public.world_domestic_legislature_v1"],
    events: ["world.domestic_legislature.changed", "world.domestic_chamber.changed"],
    publicRoute: "/world/domestic/:code",
    status: "implemented",
    verified: false,
  },
  {
    phase: "TG17",
    domain: "derived-world-history-and-editorial-lore",
    authority: "canonical published source domains; editorial lore uses country_accounts",
    reusedTruth: ["public.world_organizations", "public.world_domestic_elections", "public.countries"],
    tables: ["public.world_history_events"],
    migrations: ["20261107004000_v3_tg16_domestic_politics_history.sql"],
    commands: ["public.world_write_domestic_canon_v1"],
    projections: ["public.world_history_timeline_v1"],
    events: ["world.history.editorial_published"],
    publicRoute: "/world/archive",
    status: "implemented",
    verified: false,
  },
] as const;
