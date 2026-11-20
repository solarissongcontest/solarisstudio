import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = read("src/routes/beta-test/index.tsx");
const uploadAuthority = read(
  "supabase/migrations/20261003212000_organisation_os_v5_platform_permission_enforcement.sql",
);

describe("Public V3 Beta feedback screenshot retry continuity", () => {
  it("keeps recovered upload identity separate from the feedback-row identity", () => {
    expect(route).toContain("const submissionId = crypto.randomUUID()");
    expect(route).toContain("id: submissionId");
    expect(route).not.toContain("setSubmissionId");
    expect(route).not.toContain("submissionId?: string");

    const betaAuthorityStart = uploadAuthority.indexOf("elsif v_domain = 'beta_feedback' then");
    const betaAuthorityEnd = uploadAuthority.indexOf("else\n    raise exception 'Unknown upload domain'", betaAuthorityStart);
    const betaAuthority = uploadAuthority.slice(betaAuthorityStart, betaAuthorityEnd);

    expect(betaAuthorityStart).toBeGreaterThanOrEqual(0);
    expect(betaAuthority).toContain("v_final_bucket := 'beta-feedback'");
    expect(betaAuthority).toContain("|| v_token_id::text || '.' || v_extension");
    expect(betaAuthority).not.toContain("submissionId");
  });

  it("persists a verified screenshot reference before the final feedback-row write", () => {
    const uploadIndex = route.indexOf("screenshotPath = await uploadBetaFeedbackScreenshot");
    const insertIndex = route.indexOf('.from("beta3_test_submissions" as never)');

    expect(uploadIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeGreaterThan(uploadIndex);

    const betweenUploadAndInsert = route.slice(uploadIndex, insertIndex);
    expect(betweenUploadAndInsert).toContain("{ ...item, screenshotPath }");
    expect(betweenUploadAndInsert).toContain("setBugs(workingBugs)");
    expect(betweenUploadAndInsert).toContain("persistBetaDraft({ answers, bugs: workingBugs, step })");
  });

  it("reuses already verified screenshot paths instead of uploading them again", () => {
    expect(route).toContain("if (bug.file && !screenshotPath)");
    expect(route).not.toContain("const uploadedPaths: string[] = []");
    expect(route).toContain("const screenshotPaths = preparedBugs");
    expect(route).toContain(".map((bug) => bug.screenshotPath)");
    expect(route).toContain("screenshot_paths: screenshotPaths");
    expect(route).toContain("Verified screenshots already attached are kept in this draft and reused on retry.");
    expect(route).toContain('role="status"');
  });

  it("treats choosing a new local file as an explicit screenshot replacement", () => {
    expect(route).toContain("nextBug.file !== previousBug?.file");
    expect(route).toContain("previousBug?.screenshotPath");
    expect(route).toContain("return { ...nextBug, screenshotPath: undefined }");
    expect(route).toContain("<BetaBugReports bugs={bugs} onChange={updateBugs} />");
  });

  it("does not widen the Public feedback boundary while adding retry continuity", () => {
    expect(route).toContain('supabase\n        .from("beta3_test_submissions" as never)');
    expect(route).not.toContain("service_role");
    expect(route).not.toContain("supabaseAdmin");
    expect(route).not.toContain("supabase.co");
    expect(route).not.toContain("admin: true");
  });
});
