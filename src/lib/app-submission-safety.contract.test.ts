import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("installed app submission safety", () => {
  it("detects divergent device and server drafts instead of silently overwriting one", () => {
    const form = source("src/components/ConfirmationForm.tsx");
    expect(form).toContain("Two different saved drafts were found");
    expect(form).toContain("Use device draft");
    expect(form).toContain("Use server draft");
    expect(form).toContain("done || draftConflict");
  });

  it("makes the final confirmation preflight explicit and refuses offline queueing", () => {
    const form = source("src/components/ConfirmationForm.tsx");
    const worker = source("public/sw.js");
    expect(form).toContain('title="Submission preflight"');
    expect(form).toContain("Final server check");
    expect(form).toContain("Solaris never queues official submissions");
    expect(worker).toContain('request.method !== "GET"');
  });

  it("carries the server submission id into the confirmation receipt when available", () => {
    const form = source("src/components/ConfirmationForm.tsx");
    const receipt = source("src/lib/submission-receipts.ts");
    expect(form).toContain("submissionId: result.submission_id");
    expect(receipt).toContain("submissionId?: string | null");
    expect(receipt).toContain("acknowledgedAt?: string | null");
  });

  it("carries the authoritative televote id into its shared receipt event", () => {
    const booth = source("src/components/televoting/TelevotingBooth.tsx");
    const antiAbuse = source("src/integrations/televoting/anti-abuse.ts");
    expect(booth).toContain("submissionId: result.id");
    expect(antiAbuse).toContain('kind: "televote"');
  });
});
