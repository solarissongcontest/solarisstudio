import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  VOTE_INTEGRITY_ATTESTATION,
  VOTE_INTEGRITY_CONSEQUENCE,
} from "@/integrations/televoting/integrity";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("pre-submit voting integrity", () => {
  it("does not treat fictional-country versus real-IP geography as fraud", () => {
    const migration = source("supabase/migrations/20260819150000_televoting_pre_submit_integrity.sql");
    const network = source("src/integrations/televoting/network.server.ts");
    const preflight = source("src/integrations/televoting/preflight.server.ts");

    expect(migration).not.toContain("upper(p_ip_country)<>upper(p_country_code)");
    expect(migration).toContain("fictional voting country");
    expect(network).toContain("ipCountry");
    expect(preflight).toContain("ipChanged");
    expect(preflight).toContain("latestHistoricalIp");
    expect(preflight).toContain("fictional country to match the real-world location");
  });

  it("checks HOD and country history across jury and televote before submission", () => {
    const preflight = source("src/integrations/televoting/preflight.server.ts");

    expect(preflight).toContain("loadCanonicalVotingContextServer");
    expect(preflight).toContain("canonical.juryVotes");
    expect(preflight).toContain('resolve(first.edition_id, first.voter_country_id, "jury")');
    expect(preflight).toContain('resolve(editionId, voterCountryId, "televote")');
    expect(preflight).toContain("calculateFriendVotingRisk");
    expect(preflight).toContain('targetCode,\n      "country"');
    expect(preflight).toContain('targetCode,\n        "hod"');
    expect(preflight).toContain("reciprocalSupport");
    expect(preflight).toContain("crossChannelEditions");
  });

  it("requires the exact checked ballot and a declaration when flagged", () => {
    const migration = source("supabase/migrations/20260819150000_televoting_pre_submit_integrity.sql");
    const booth = source("src/components/televoting/TelevotingBooth.tsx");
    const functions = source("src/integrations/televoting/vote.functions.ts");

    expect(migration).toContain("v_preflight.ballot_map<>v_ballot_map");
    expect(migration).toContain("v_preflight.requires_attestation and v_preflight.attested_at is null");
    expect(functions).toContain("preflightToken");
    expect(functions).toContain("attestMergedTelevotingVote");
    expect(booth).toContain("No person flagged this ballot");
    expect(booth).toContain("Automatic Voting Integrity System");
    expect(booth).toContain("Change my votes");
    expect(booth).toContain("Sign declaration & submit");
  });

  it("records an explicit independent-voting oath and consequence warning", () => {
    expect(VOTE_INTEGRITY_ATTESTATION).toMatch(/own independent preferences/i);
    expect(VOTE_INTEGRITY_ATTESTATION).toMatch(/friend-voting/i);
    expect(VOTE_INTEGRITY_ATTESTATION).toMatch(/reciprocal voting/i);
    expect(VOTE_INTEGRITY_CONSEQUENCE).toMatch(/knowingly lied/i);
    expect(VOTE_INTEGRITY_CONSEQUENCE).toMatch(/ban from SSC/i);
  });

  it("does not allow the legacy public RPC to bypass the checked submission path", () => {
    const migration = source("supabase/migrations/20260819150000_televoting_pre_submit_integrity.sql");
    const voteServer = source("src/integrations/televoting/vote.server.ts");

    expect(migration).toContain("revoke execute on function televoting.submit_vote");
    expect(migration).toContain("grant execute on function televoting.submit_vote_checked");
    expect(voteServer).toContain('rpc("submit_vote_checked"');
    expect(voteServer).not.toContain('rpc("submit_vote"');
  });
});
