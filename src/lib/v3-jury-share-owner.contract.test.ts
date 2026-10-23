import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const source = () => read("src/integrations/v3/jury-share-owner-source.server.ts");
const serverFn = () => read("src/lib/v3-jury-share-owner.functions.ts");
const runtime = () => read("src/lib/v3-jury-share-owner-runtime.ts");
const exporter = () => read("src/lib/v3-jury-share-export.ts");
const sharedComposer = () => read("src/components/v3/V3JuryShareProjectionComposer.tsx");
const ownerComposer = () => read("src/components/v3/V3OwnerJuryShareComposer.tsx");
const route = () => read("src/routes/_authenticated/my-solaris/jury-share.tsx");

describe("V3 Jury Share authenticated owner consumer", () => {
  it("uses the authenticated canonical System projection without reconstructing Jury truth", () => {
    const text = source();
    expect(text).toContain("createSolarisAuthenticatedClientServer");
    expect(text).toContain('client.rpc("v3_jury_share_projection"');
    expect(text).not.toContain(".from(");
    expect(text).not.toContain("service_role");
    expect(text).not.toContain("jury_ballot_submissions");
    expect(text).not.toContain("jury_votes");
    expect(text).not.toContain("country_accounts");
  });

  it("lets the browser nominate only exact Show and Country identity", () => {
    const text = serverFn();
    expect(text).toContain("showId: z.string().uuid()");
    expect(text).toContain("countryId: z.string().uuid()");
    expect(text).toContain("loadV3OwnerJuryShareProjection(data)");
    expect(text).not.toMatch(/votes|points|resultVersionId|ballotId|userId/);
  });

  it("fails closed while rollout, the System projection or ownership is unavailable", () => {
    const text = source();
    expect(text).toContain('"JURY_SHARE_FEATURE_DISABLED"');
    expect(text).toContain('code: "JURY_SHARE_CONTRACT_UNAVAILABLE"');
    expect(text).toContain('code: "JURY_SHARE_NOT_AUTHORIZED"');
    expect(text).toContain('details.code === "42501"');
    expect(text).toContain('envelope.visibility !== "private" && envelope.visibility !== "public"');
    expect(text).toContain("projectionSchema.safeParse");
    expect(text).toContain("normalizeJuryShareVotes(parsed.data.votes)");
    expect(text).not.toContain("fallback");

    const copy = ownerComposer();
    expect(copy).toContain('case "JURY_SHARE_FEATURE_DISABLED"');
    expect(copy).toContain("Jury sharing is not enabled yet");
    expect(copy).toContain("not enabled for this Edition or account yet");
  });

  it("keeps the owner query bounded and non-polling", () => {
    const text = runtime();
    expect(text).toContain('["v3-owner-jury-share", input.showId, input.countryId]');
    expect(text).toContain("staleTime: 60_000");
    expect(text).toContain("refetchOnWindowFocus: false");
    expect(text).toContain("refetchOnReconnect: true");
    expect(text).toContain("retry: false");
    expect(text).not.toMatch(/refetchInterval|setInterval|Date\.now/);
  });

  it("revalidates the canonical projection immediately before every export", () => {
    const text = sharedComposer();
    expect(text).toContain("const refreshed = await refreshProjection()");
    expect(text).toContain("const fresh = await freshProjection()");
    expect(text).toContain("refreshed.stateVersion !== previousState");
    expect(text).toContain("Connect to create this image");
    expect(ownerComposer()).toContain("const refreshed = await query.refetch()");
    expect(ownerComposer()).toContain("This jury vote is no longer shareable under the current official state");
  });

  it("creates exact Story-sized files and capability-detects native file sharing", () => {
    const text = exporter();
    expect(text).toContain("canvas.width = model.width");
    expect(text).toContain("canvas.height = model.height");
    expect(text).toContain('width: 1080');
    expect(text).toContain('height: 1920');
    expect(text).toContain('mimeType = format === "png" ? "image/png" : "image/jpeg"');
    expect(text).toContain("nav.canShare?.({ files: [file] })");
    expect(text).toContain("await nav.share({ files: [file]");
    expect(text).toContain("downloadJuryShareImage(image)");
  });

  it("keeps browser-only export effects import-safe for the server route graph", () => {
    const text = exporter();
    const guardIndex = text.indexOf("function ensureBrowser");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(text.indexOf("document.createElement")).toBeGreaterThan(guardIndex);
    expect(text.indexOf("new Image()")).toBeGreaterThan(guardIndex);
    expect(text.indexOf("navigator as Navigator")).toBeGreaterThan(guardIndex);
  });

  it("does not confuse a public projection with proof that the nominated ballot is personally owned", () => {
    const text = ownerComposer();
    expect(text).toContain('initial.visibility === "private" ? "Private owner access" : "Published detailed voting"');
    expect(text).toContain("the URL itself as ownership proof");
    expect(text).toContain("public visibility remains controlled by canonical publication policy");
  });

  it("keeps future themes honest while the shared Default renderer is the only implemented export", () => {
    const text = sharedComposer();
    expect(text).toContain('id: "default", state: "available"');
    expect(text).toContain('id: "edition"');
    expect(text).toContain('id: "liquid_glass"');
    expect(text).toContain('option.id === "default"');
    expect(text).toContain('theme === "default"');
  });

  it("keeps the Me deep route authenticated, private-indexing-safe and identity-explicit", () => {
    const text = route();
    expect(text).toContain('createFileRoute("/_authenticated/my-solaris/jury-share")');
    expect(text).toContain('{ name: "robots", content: "noindex, nofollow" }');
    expect(text).toContain('showId: typeof search.showId === "string" ? search.showId : ""');
    expect(text).toContain('countryId: typeof search.countryId === "string" ? search.countryId : ""');
    expect(text).toContain("isUuid(showId) && isUuid(countryId)");
    expect(text).toContain("does not infer ballot identity from names, browser history, or the current delegation");
    expect(text).not.toMatch(/localStorage|sessionStorage|slugify|toLocaleLowerCase/);
  });

  it("adds no mutation authority to the owner sharing surface", () => {
    for (const text of [source(), serverFn(), runtime(), ownerComposer(), sharedComposer()]) {
      expect(text).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    }
  });
});
