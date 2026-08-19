import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const moderationMigration = source("supabase/migrations/20260819200500_televoting_integrity_human_moderation.sql");
const exclusionMigration = source("supabase/migrations/20260819200600_televoting_integrity_ballot_exclusion_action.sql");
const organizerMigration = source("supabase/migrations/20260819200700_televoting_integrity_organizer_rpcs.sql");
const moderationUi = source("src/components/televoting/IntegrityModerationHub.tsx");

 describe("human voting-integrity moderation", () => {
  it("never turns an automatic flag directly into a ban", () => {
    expect(moderationMigration).toContain("automatic flag never creates a misconduct finding or sanction");
    expect(moderationMigration).toContain("v_decision.decision<>'false_declaration_confirmed'");
    expect(moderationMigration).toContain("An organizer must explicitly confirm a false declaration before imposing an SSC sanction");
    expect(moderationUi).toContain("Automatic warnings are evidence for review, not misconduct findings");
    expect(moderationUi).toContain("This does NOT create a ban automatically");
  });

  it("requires a human reason and a separate deliberate sanction action", () => {
    expect(moderationMigration).toContain("A meaningful organizer reason is required");
    expect(moderationMigration).toContain("A detailed sanction reason is required");
    expect(organizerMigration).toContain("public.has_role(auth.uid(),'organizer'::public.app_role)");
    expect(moderationUi).toContain("Type ${expected} to confirm");
    expect(moderationUi).toContain("Create permanent SSC ban");
    expect(moderationUi).toContain("Create temporary suspension");
  });

  it("blocks sanctioned HOD/country/username identities server-side without IP geography matching", () => {
    expect(moderationMigration).toContain("trg_block_sanctioned_preflight");
    expect(moderationMigration).toContain("trg_block_sanctioned_submission");
    expect(moderationMigration).toContain("scope_type in ('hod','country','username')");
    expect(moderationMigration).toContain("when 'hod'");
    expect(moderationMigration).toContain("when 'country'");
    expect(moderationMigration).toContain("when 'username'");
    expect(moderationMigration).not.toMatch(/ip_country[^\n]*sanction/i);
    expect(moderationMigration).not.toMatch(/ip_hash[^\n]*sanction/i);
  });

  it("excludes ballots without deleting their evidence", () => {
    expect(exclusionMigration).toContain("set status='deleted', deletion_category='integrity_moderation'");
    expect(exclusionMigration).not.toContain("delete from televoting.vote_submissions");
    expect(exclusionMigration).not.toContain("delete from televoting.vote_entries");
    expect(exclusionMigration).toContain("'preserved',true");
  });

  it("revocation restores future access but never restores an excluded ballot", () => {
    expect(moderationMigration).toContain("Revoking voting access never restores a previously excluded ballot");
    expect(moderationMigration).toContain("'ballot_restored',false");
    expect(moderationUi).toContain("Revocation does not restore any ballot that was previously excluded");
  });

  it("keeps organizer actions in a durable audit trail", () => {
    expect(moderationMigration).toContain("create table if not exists televoting.integrity_action_audit");
    expect(moderationMigration).toContain("'decision_recorded'");
    expect(moderationMigration).toContain("'sanction_created'");
    expect(moderationMigration).toContain("'sanction_revoked'");
    expect(exclusionMigration).toContain("'ballot_excluded'");
  });
});
