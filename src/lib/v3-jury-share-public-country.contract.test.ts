import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const source = () => read("src/integrations/v3/jury-share-source.server.ts");
const serverFn = () => read("src/lib/v3-jury-share.functions.ts");
const runtime = () => read("src/lib/v3-jury-share-runtime.ts");
const exporter = () => read("src/lib/v3-jury-share-export.ts");
const composer = () => read("src/components/v3/V3JuryShareComposer.tsx");
const route = () => read("src/routes/results/jury-share.tsx");
const matrix = () => read("src/components/VotingMatrix.tsx");
const showRoute = () => read("src/routes/shows/$showId.tsx");

describe("V3 Jury Share public-country consumer", () => {
  it("reads only the canonical System projection and never reconstructs ballots", () => {
    const text = source();
    expect(text).toContain("createConfirmationPublicRuntimeClient");
    expect(text).toContain('client.rpc("v3_jury_share_projection"');
    expect(text).not.toContain(".from(");
    expect(text).not.toContain("supabaseAdmin");
    expect(text).not.toContain("service_role");
    expect(text).not.toContain("jury_ballot_submissions");
    expect(text).not.toContain("jury_votes");
    expect(text).not.toContain("televote_votes");
  });

  it("accepts only exact show/country identity from the browser", () => {
    const text = serverFn();
    expect(text).toContain("showId: z.string().uuid()");
    expect(text).toContain("countryId: z.string().uuid()");
    expect(text).toContain("loadV3PublicJuryShareProjection(data)");
    expect(text).not.toMatch(/votes|points|resultVersionId|ballotId/);
  });

  it("fails closed unless the System projection is explicitly public", () => {
    const text = source();
    expect(text).toContain('envelope.visibility !== "public"');
    expect(text).toContain('code: "JURY_SHARE_NOT_AUTHORIZED"');
    expect(text).toContain("projectionSchema.safeParse");
    expect(text).toContain("normalizeJuryShareVotes(parsed.data.votes)");
  });

  it("keeps the client query bounded and non-polling", () => {
    const text = runtime();
    expect(text).toContain('["v3-public-jury-share", input.showId, input.countryId]');
    expect(text).toContain("staleTime: 60_000");
    expect(text).toContain("refetchOnWindowFocus: false");
    expect(text).toContain("refetchOnReconnect: true");
    expect(text).toContain("retry: false");
    expect(text).not.toMatch(/refetchInterval|setInterval/);
  });

  it("revalidates the canonical projection immediately before every export", () => {
    const text = composer();
    expect(text).toContain("const refreshed = await query.refetch()");
    expect(text).toContain("const fresh = await freshProjection()");
    expect(text).toContain("These jury results are no longer publicly available");
    expect(text).toContain("stateVersion !== previousState");
    expect(text).toContain("Connect to create this image");
  });

  it("keeps browser-only export effects import-safe for the TanStack server graph", () => {
    const client = exporter();
    const guardIndex = client.indexOf("function ensureBrowser");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(client.indexOf("document.createElement")).toBeGreaterThan(guardIndex);
    expect(client.indexOf("new Image()")).toBeGreaterThan(guardIndex);
    expect(client.indexOf("navigator as Navigator")).toBeGreaterThan(guardIndex);
    expect(composer()).toContain('from "@/lib/v3-jury-share-export"');
    expect(composer()).not.toContain("v3-jury-share-export.client");
  });

  it("creates exact Story-sized PNG/JPEG files and uses capability-detected native sharing", () => {
    const text = exporter();
    expect(text).toContain("canvas.width = model.width");
    expect(text).toContain("canvas.height = model.height");
    expect(text).toContain('mimeType = format === "png" ? "image/png" : "image/jpeg"');
    expect(text).toContain('width: 1080');
    expect(text).toContain('height: 1920');
    expect(text).toContain("nav.canShare?.({ files: [file] })");
    expect(text).toContain("await nav.share({ files: [file]");
    expect(text).toContain("downloadJuryShareImage(image)");
  });

  it("keeps Default usable while unavailable future themes degrade independently", () => {
    const text = composer();
    expect(text).toContain('id: "default", state: "available"');
    expect(text).toContain('id: "edition"');
    expect(text).toContain('state: "unconfigured"');
    expect(text).toContain('id: "liquid_glass"');
    expect(text).toContain('state: "unsupported"');
    expect(text).toContain('option.id === "default"');
  });

  it("keeps route identity explicit and does not derive objects from display labels", () => {
    const text = route();
    expect(text).toContain('showId: typeof search.showId === "string" ? search.showId : ""');
    expect(text).toContain('countryId: typeof search.countryId === "string" ? search.countryId : ""');
    expect(text).toContain("isUuid(showId) && isUuid(countryId)");
    expect(text).toContain("does not infer those identities from names or labels");
    expect(text).not.toMatch(/slugify|toLocaleLowerCase|displayName.*showId|displayName.*countryId/);
  });

  it("discovers share cards only through the already-public detailed-jury scorechart", () => {
    const show = showRoute();
    const votingMatrix = matrix();
    expect(show).toContain('tab === "matrix" && publication.detailed_voting && showJuryResults');
    expect(votingMatrix).toContain('to="/results/jury-share"');
    expect(votingMatrix).toContain("search={{ showId: shareShowId, countryId: country.id }}");
    expect(votingMatrix).toContain("Share these votes");
    expect(votingMatrix).toContain("votes.map((vote) => vote.voter_country_id)");
    expect(votingMatrix).not.toMatch(/search=\{\{[^}]*votes|search=\{\{[^}]*points|search=\{\{[^}]*ballot/u);
  });

  it("offers image share/save plus accessible text fallback without mutation authority", () => {
    const ui = composer();
    const client = exporter();
    expect(ui).toContain("Share image");
    expect(ui).toContain("Save PNG");
    expect(ui).toContain("Save JPEG");
    expect(ui).toContain("Copy votes as text");
    expect(client).toContain("formatJuryShareText(projection)");
    expect(source()).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    expect(serverFn()).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });
});
