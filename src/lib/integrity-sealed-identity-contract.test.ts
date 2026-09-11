import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const core = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910213000_integrity_core.sql"),
  "utf8",
);
const governance = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910213200_integrity_case_governance.sql"),
  "utf8",
);
const breakglass = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910220700_integrity_sealed_identity_breakglass.sql"),
  "utf8",
);
const expiry = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260910220800_integrity_sealed_identity_expiry.sql"),
  "utf8",
);
const identityModel = readFileSync(
  resolve(process.cwd(), "src/lib/integrity.ts"),
  "utf8",
);
const api = readFileSync(
  resolve(process.cwd(), "src/lib/integrity-identity.ts"),
  "utf8",
);
const adminRoute = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/integrity-identity.tsx"),
  "utf8",
);

describe("sealed identity break-glass governance", () => {
  it("keeps fully anonymous cases structurally identity-less", () => {
    expect(core).toContain("fully_anonymous_has_no_reporter_identity");
    expect(core).toContain("identity_mode <> 'anonymous' or reporter_user_id is null");
  });

  it("keeps ordinary organizer identity access blocked for sealed cases", () => {
    expect(governance).toContain("Reporter identity is sealed and cannot be revealed to case reviewers");
    expect(governance).toContain("Fully anonymous cases have no reporter identity");
    expect(governance).toContain("Confidential reporter identity was accessed by an organizer");
  });

  it("stores break-glass requests behind RLS and no direct client grants", () => {
    expect(breakglass).toContain("create table if not exists public.integrity_identity_disclosure_requests");
    expect(breakglass).toContain("alter table public.integrity_identity_disclosure_requests enable row level security");
    expect(breakglass).toContain("revoke all on public.integrity_identity_disclosure_requests from anon, authenticated");
    expect(breakglass).toContain("integrity_identity_one_active_request_per_case_idx");
  });

  it("requires a different second organizer to decide the request", () => {
    expect(breakglass).toContain("The requesting organizer cannot approve or reject their own sealed identity request");
    expect(breakglass).toContain("if v_requester = auth.uid()");
    expect(adminRoute).toContain("A different organizer must approve or reject this request");
  });

  it("uses a short one-time approval instead of standing identity access", () => {
    expect(breakglass).toContain("now() + interval '30 minutes'");
    expect(breakglass).toContain("Only the organizer who requested disclosure may use the approved break-glass request");
    expect(breakglass).toContain("Sealed identity disclosure approval has expired");
    expect(breakglass).toContain("set status = 'used', disclosed_at = now()");
    expect(adminRoute).toContain("One-time disclosure window");
    expect(adminRoute).toContain("Reveal sealed identity once");
  });

  it("makes actual sealed identity disclosure visible to the reporter", () => {
    expect(breakglass).toContain("'identity.sealed_disclosed'");
    expect(breakglass).toContain("The sealed reporter identity was disclosed through the two-organizer break-glass process");
    expect(breakglass).toMatch(/identity\.sealed_disclosed'[\s\S]*?true,[\s\S]*?auth\.uid\(\)/);
  });

  it("expires stale approvals so they cannot block future requests forever", () => {
    expect(expiry).toContain("'expired'");
    expect(expiry).toContain("status = 'approved'");
    expect(expiry).toContain("approval_expires_at <= now()");
    expect(expiry).toContain("set status = 'expired'");
    expect(expiry).toContain("d.status = 'approved' and d.approval_expires_at > now()");
  });

  it("does not make historical publication depend on an organizer account surviving forever", () => {
    expect(breakglass).toContain("decided_by uuid null references auth.users(id) on delete set null");
    expect(expiry).not.toContain("status = 'approved' and decided_by is not null");
    expect(expiry).not.toContain("status = 'used' and decided_by is not null");
  });

  it("documents the exceptional path accurately to sealed reporters", () => {
    expect(identityModel).toContain("ordinary reviewers cannot reveal your identity");
    expect(identityModel).toContain("approval by a second different organizer");
    expect(identityModel).toContain("30-minute one-use approval");
    expect(identityModel).toContain("reporter-visible audit event");
  });

  it("exposes only narrow organizer RPC helpers in the client", () => {
    expect(api).toContain("admin_sealed_integrity_cases");
    expect(api).toContain("admin_identity_disclosure_requests");
    expect(api).toContain("admin_request_sealed_identity_disclosure");
    expect(api).toContain("admin_decide_sealed_identity_disclosure");
    expect(api).toContain("admin_reveal_sealed_identity");
  });

  it("keeps revealed identity transient in the organizer UI", () => {
    expect(adminRoute).toContain("useState<RevealedSealedIdentity | null>(null)");
    expect(adminRoute).toContain("Identity revealed in this browser session");
    expect(adminRoute).toContain("not written back into the case UI model");
  });
});
