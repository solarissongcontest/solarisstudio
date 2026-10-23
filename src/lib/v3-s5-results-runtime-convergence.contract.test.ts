import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const diagnostics = readFileSync(
  ".github/scripts/v3-s5-results-runtime-convergence-diagnostics.sh",
  "utf8",
);
const workflow = readFileSync(
  ".github/workflows/v3-s5-results-consequences-rehearsal.yml",
  "utf8",
);

describe("S5 Results runtime convergence diagnostics", () => {
  it("proves installed runtime trigger/function definitions instead of trusting migration text", () => {
    expect(diagnostics).toContain("pg_get_triggerdef(trg.oid, true)");
    expect(diagnostics).toContain("pg_get_functiondef");
    expect(diagnostics).toContain("participants_sync_results");
    expect(diagnostics).toContain("v3_participation_status_refresh_qualifications");
    expect(diagnostics).toContain("trg.tgenabled in ('O','A')");
    expect(diagnostics).toContain("not trg.tgdeferrable");
    expect(diagnostics).toContain("not trg.tginitdeferred");
  });

  it("fails closed against hosted Supabase and proves the full status round trip", () => {
    expect(diagnostics).toContain("Refusing hosted Supabase runtime diagnostics");
    expect(diagnostics).toContain("Refusing non-local database runtime diagnostics");
    expect(diagnostics).toContain("set participation_status='withdrawn'");
    expect(diagnostics).toContain("set participation_status='confirmed'");
    expect(diagnostics).toContain("final_rank is null");
    expect(diagnostics).toContain("result_row.final_rank=10");
    expect(diagnostics).toContain("result_row.final_rank=11");
  });

  it("proves authoritative raw-vote preservation and idempotency", () => {
    expect(diagnostics).toContain("from public.jury_votes");
    expect(diagnostics).toContain("from public.televote_votes");
    expect(diagnostics).toContain("withdrawal mutated authoritative raw jury/televote rows");
    expect(diagnostics).toContain("reconfirmation mutated authoritative raw jury/televote rows");
    expect(diagnostics).toContain("idempotent confirmed update changed canonical Results");
    expect(diagnostics).toContain("S5_RESULT_RAW_VOTE_PRESERVATION_PROVEN");
    expect(diagnostics).toContain("S5_RESULT_STATUS_ROUNDTRIP_IDEMPOTENT");
  });

  it("runs the runtime proof after the canonical S5 rehearsal on clean replay and current-main upgrade", () => {
    expect(workflow).toContain(
      '      - ".github/scripts/v3-s5-results-runtime-convergence-diagnostics.sh"',
    );
    expect(workflow).toContain("Prove runtime Results and qualification convergence");
    expect(workflow).toContain(
      "Prove runtime Results and qualification convergence after upgrade",
    );
    expect(workflow).toContain(
      'bash .github/scripts/v3-s5-results-runtime-convergence-diagnostics.sh',
    );
    expect(workflow).toContain(
      'bash "$GITHUB_WORKSPACE/.github/scripts/v3-s5-results-runtime-convergence-diagnostics.sh"',
    );
  });

  it("keeps the diagnostic script syntactically valid", () => {
    expect(() =>
      execFileSync(
        "bash",
        ["-n", ".github/scripts/v3-s5-results-runtime-convergence-diagnostics.sh"],
        { stdio: "pipe" },
      ),
    ).not.toThrow();
  });
});
