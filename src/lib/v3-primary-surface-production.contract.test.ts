import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverSource = () =>
  readFileSync(
    resolve(process.cwd(), "src/integrations/v3/primary-surface-source.server.ts"),
    "utf8",
  );
const serverFunction = () =>
  readFileSync(
    resolve(process.cwd(), "src/lib/v3-primary-surface.functions.ts"),
    "utf8",
  );

describe("Solaris Studio V3 production primary-surface source architecture", () => {
  it("keeps database IO in the integration layer rather than V3 projection modules", () => {
    const source = serverSource();
    const fn = serverFunction();

    expect(source).toContain("integrations/supabase");
    expect(fn).toContain("@/integrations/v3/primary-surface-source.server");
    expect(fn).not.toContain("v3-primary-surface-source.server");
  });

  it("derives viewer identity from the authenticated request instead of browser input", () => {
    const source = serverSource();
    const fn = serverFunction();

    expect(source).toContain('getRequestHeader("authorization")');
    expect(source).toContain("createSolarisAuthenticatedClientServer");
    expect(source).toContain("client.auth.getUser(token)");
    expect(source).toContain("request.viewerId !== actualViewerId");
    expect(fn).not.toContain("viewerId");
    expect(fn).not.toContain("userId");
  });

  it("keeps public and participant database authority separate", () => {
    const source = serverSource();

    expect(source).toContain("createConfirmationPublicRuntimeClient");
    expect(source).toContain("createSolarisAuthenticatedClientServer");
    expect(source).not.toContain("supabaseAdmin");
    expect(source).not.toContain("service_role");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("narrows public reads to published/current-edition data instead of recreating the archive query graph", () => {
    const source = serverSource();

    expect(source).toContain('.eq("published", true)');
    expect(source).toContain('.eq("edition_id", editionId)');
    expect(source).toContain('const PARTICIPANT_IDENTITY_COLUMNS = "country_id,contest_entity_id"');
    expect(source).toContain('.is("show_id", null)');
    expect(source).toContain("countDistinctV3Delegations");
    expect(source).not.toContain('select("*")');
    expect(source).not.toContain("useAllResults");
    expect(source).not.toContain("useAllShows");
    expect(source).not.toContain("useCountries");
    expect(source).not.toContain("useEditions");
  });

  it("uses existing RLS-aware participant RPCs once inside the server bootstrap", () => {
    const source = serverSource();

    expect(source).toContain("public_country_account_confirmation_access");
    expect(source).toContain("public_country_account_confirmation_requirements");
    expect(source).toContain("public_confirmation_rounds");
    expect(source).toContain("country_jury_voting_context");
    expect(source).toContain("studio2_feature_enabled");
    expect(source).toContain("studio2_my_notice_inbox");
    expect(source).toContain("assembleV3PrimarySurfaceSnapshot");
  });

  it("preserves canonical participant preferences and task timing semantics", () => {
    const source = serverSource();

    expect(source).toContain('.from("notification_preferences")');
    expect(source).toContain('.select("spoiler_free")');
    expect(source).toContain("hideResultSpoilers: preferences.data?.spoiler_free === true");
    expect(source).toContain("countPendingAcknowledgementTasks(inbox.data)");
    expect(source).toContain('typeof round.closed_at === "string" ? round.closed_at : null');
    expect(source).not.toContain("round.closes_at");
  });

  it("preserves existing open-televote parity through the public televoting schema", () => {
    const source = serverSource();

    expect(source).toContain('.schema("televoting")');
    expect(source).toContain('.select("id,name,closed_at,editions(name)")');
    expect(source).toContain('.eq("status", "open")');
    expect(source).toContain("televoteTaskFromRound");
    expect(source).toContain("televote: participant.televote");
    expect(source).not.toContain("televotingSupabase");
    expect(source).not.toContain("@/integrations/televoting/client");
  });

  it("captures server time inside the server source and never uses browser clock or polling", () => {
    const source = serverSource();

    expect(source).toContain("const serverTime = new Date().toISOString()");
    for (const forbidden of [
      "Date.now(",
      "setInterval(",
      "setTimeout(",
      "useQuery(",
      "useMutation(",
      "useEffect(",
      "localStorage",
      "sessionStorage",
      "refetchInterval",
      "refetchOnWindowFocus",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("exposes one TanStack server function and dynamically keeps server-only readers off the client path", () => {
    const fn = serverFunction();

    expect(fn).toContain('createServerFn({ method: "GET" })');
    expect(fn).toContain(
      'await import(\n      "@/integrations/v3/primary-surface-source.server"',
    );
    expect(fn).toContain("loadCurrentV3PrimarySurfaceBundle");
    expect(fn).not.toContain("@supabase/supabase-js");
  });

  it("does not add direct production mutations, realtime or retry loops", () => {
    const source = serverSource();

    for (const forbidden of [
      ".insert(",
      ".upsert(",
      ".update(",
      ".delete(",
      ".channel(",
      ".subscribe(",
      "setInterval(",
      "while (",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});