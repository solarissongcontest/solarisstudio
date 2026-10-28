/**
 * Audited edition metadata consequence boundary.
 *
 * Critical edition truth is committed synchronously by the governed command
 * before this event can exist. The event is therefore an invalidation/audit
 * consequence, not mutation authority and not a prerequisite for the write to
 * become canonical.
 */
export const V3_EDITION_CHANGE_CONSEQUENCE = {
  event: "edition.changed",
  canonicalState: "public.editions",
  commands: [
    "public.v3_create_edition",
    "public.v3_apply_edition_metadata_change",
    "public.v3_apply_edition_editing_change",
    "public.v3_apply_edition_theme_change",
    "public.v3_apply_edition_visual_change",
  ],
  role: "compact invalidation/audit signal after a synchronously committed edition-owned mutation",
  persistence: "private.v3_domain_events and the S2 operation/audit records are written in the same database transaction as canonical edition state",
  payload: "edition id, change kind, changed field names and canonical revision only; consumers re-read canonical state",
  asyncConsumers: [],
  canonicalRead: "public.editions row + data_revision",
  reconciliation: "operation receipt/readback and canonical row revision; optional future projections may rebuild by re-reading the edition",
  failureSemantics: "event persistence failure aborts the command transaction; optional downstream delivery cannot alter committed edition truth",
  missingMaturity: "optional realtime/dashboard/analytics consumers only",
  releaseClass: "derived",
  evidence: [
    "supabase/migrations/20261027204500_v3_edition_authority.sql",
    "supabase/migrations/20261027205200_v3_edition_theme_authority.sql",
    "supabase/migrations/20261027210000_v3_retire_confirmation_round_legacy_writers.sql",
    "src/lib/edition-authority.ts",
    "src/lib/edition-theme-command.ts",
    ".github/tests/v3-edition-authority.sql",
    "src/lib/v3-edition-authority.contract.test.ts",
  ],
} as const;
