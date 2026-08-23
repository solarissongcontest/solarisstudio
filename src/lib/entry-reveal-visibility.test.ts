import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const sync = source("src/integrations/confirmations/sync.functions.ts");
const bulkSync = source("src/routes/confirmations/admin/sync.tsx");
const publicParticipants = source("src/lib/public-participants.ts");
const publicCountryArchive = source("src/lib/public-country-archive.ts");
const showRoute = source("src/routes/shows/$showId.tsx");
const editionRoute = source("src/routes/editions/$slug.tsx");
const countryRoute = source("src/routes/countries/$code.tsx");
const wikiRoute = source("src/routes/wiki/$code.tsx");
const protectionMigration = source("supabase/migrations/20260821201357_protect_confirmation_entry_reveals.sql");
const projectionMigration = source("supabase/migrations/20260821201620_public_safe_participant_projection.sql");
const historicalVisibilityMigration = source("supabase/migrations/20260823141500_historical_entry_visibility_guard.sql");
const confirmationsRpc = source("scripts/confirmations-admin-response-reveal-fields.sql");

describe("entry reveal visibility", () => {
  it("derives confirmation publication from explicit reveal rules without guessing approximate dates", () => {
    expect(sync).toContain("deriveConfirmationEntryPublication");
    expect(sync).toContain('revealType === "immediately"');
    expect(sync).toContain('revealType === "exact"');
    expect(sync).toContain('snapshot.selection_method === "national_final"');
    expect(sync).toContain('return { status: "draft", scheduledAt: null, publishedAt: null }');
    expect(sync).toContain("T00:00:00.000Z");
  });

  it("preserves an HOD manual publication override during later confirmation syncs", () => {
    expect(sync).toContain("publication_overridden");
    expect(sync).toContain("if (!participant.publication_overridden)");
    expect(sync).toContain('publication_source: "confirmation"');
  });

  it("carries reveal timing through the bulk Confirmations sync", () => {
    for (const field of [
      "reveal_date_type",
      "reveal_exact_date",
      "reveal_approximate_text",
      "nf_result_date_type",
      "nf_result_exact_date",
      "nf_result_approximate_text",
    ]) {
      expect(bulkSync).toContain(field);
      expect(confirmationsRpc).toContain(`'${field}'`);
    }
  });

  it("allows exact scheduled entries only after their release boundary", () => {
    expect(protectionMigration).toContain("publication_status = 'scheduled'");
    expect(protectionMigration).toContain("scheduled_publish_at <= now()");
    expect(protectionMigration).toContain("protect_confirmation_synced_entry_default");
  });

  it("redacts unrevealed artist, song and listening links in the public projection", () => {
    expect(projectionMigration).toContain("entry_visible");
    expect(projectionMigration).toContain("case when entry_visible and artists_visible then artist else null end");
    expect(projectionMigration).toContain("case when entry_visible and songs_visible then song else null end");
    expect(projectionMigration).toContain("case when entry_visible and songs_visible then youtube_url else null end");
    expect(projectionMigration).toContain("'notes', null");
  });

  it("forces public Show and Edition routes through the sanitized participant projection", () => {
    expect(publicParticipants).toContain('supabase.rpc("public_safe_participants"');
    expect(showRoute).toContain("usePublicShowParticipants(showId)");
    expect(showRoute).not.toContain("useShowParticipants(showId)");
    expect(editionRoute).toContain("usePublicEditionParticipants(edition?.id)");
    expect(editionRoute).not.toContain("useParticipants(edition?.id)");
    expect(editionRoute).toContain(".filter((entry) => Boolean(entry.song?.trim()))");
  });

  it("normalizes edition-only contest entities for public Show and Edition routes", () => {
    expect(publicParticipants).toContain("row.country_id ?? row.contest_entity_id ?? \"\"");
    expect(publicParticipants).toContain("data.map(normalisePublicParticipant)");
  });

  it("keeps populated historical entries public while leaving the newest edition reveal-controlled", () => {
    expect(historicalVisibilityMigration).toContain("keep_historical_entry_public");
    expect(historicalVisibilityMigration).toContain("v_edition_number < v_newest_edition_number");
    expect(historicalVisibilityMigration).toContain("new.publication_status = 'draft'");
    expect(historicalVisibilityMigration).toContain("new.scheduled_publish_at is null");
    expect(historicalVisibilityMigration).toContain("p.publication_status = 'draft'");
  });

  it("forces public Country and Wiki history through entry-level reveal gates too", () => {
    expect(publicCountryArchive).toContain("isEntryRevealed");
    expect(publicCountryArchive).toContain('participant.publication_status === "published"');
    expect(publicCountryArchive).toContain('participant.publication_status === "scheduled"');
    expect(publicCountryArchive).toContain("scheduledMs <= nowMs");
    expect(countryRoute).toContain("buildPublicCountryArchive");
    expect(wikiRoute).toContain("buildPublicCountryArchive");
    expect(wikiRoute).toContain('"Entry not revealed yet"');
  });
});
