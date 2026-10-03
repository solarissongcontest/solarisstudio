import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function productionSourceFiles(directory = join(root, "src")): string[] {
  const result: string[] = [];
  for (const name of readdirSync(directory)) {
    const absolute = join(directory, name);
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      result.push(...productionSourceFiles(absolute));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(name)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(name)) continue;
    result.push(relative(root, absolute).split(sep).join("/"));
  }
  return result;
}

describe("Organisation OS V5 unified upload safety", () => {
  const helper = source("src/lib/upload-safety.ts");
  const quarantine = source(
    "supabase/migrations/20261003210000_organisation_os_v5_unified_upload_quarantine.sql",
  );
  const finalizer = source("supabase/functions/solaris-upload-finalize/index.ts");

  it("keeps one raw Storage upload implementation for all production source", () => {
    const directUploadFiles = productionSourceFiles().filter((path) =>
      /\.upload\s*\(/.test(source(path)),
    );

    expect(directUploadFiles).toEqual(["src/lib/upload-safety.ts"]);
  });

  it("routes every known user upload domain through one verified pipeline", () => {
    for (const path of [
      "src/lib/country-account.ts",
      "src/lib/visual-theme.ts",
      "src/lib/country-design-v2.ts",
      "src/lib/beta-feedback-upload.ts",
    ]) {
      const code = source(path);
      expect(code, path).toContain("uploadVerifiedFile");
      expect(code, path).not.toMatch(/\.upload\s*\(/);
    }

    expect(helper).toContain("prepareUnifiedUpload");
    expect(helper).toContain("uploadServerAuthorizedFile");
    expect(helper).toContain("finalizeUnifiedUpload");
    expect(helper).toContain('"solaris-upload-finalize"');
  });

  it("authorizes one exact short-lived quarantine path for every upload domain", () => {
    expect(quarantine).toContain("studio2_upload_authorizations");
    expect(quarantine).toContain("'solaris-upload-quarantine'");
    expect(quarantine).toContain("interval '10 minutes'");
    expect(quarantine).toContain("studio2_prepare_upload");
    expect(quarantine).toContain("studio2_upload_quarantine_path_allowed");
    expect(quarantine).toContain(
      "authorization.quarantine_path = p_path",
    );
    expect(quarantine).toContain(
      "authorization.actor_id = p_actor",
    );

    for (const domain of [
      "'country_media'",
      "'edition_artwork'",
      "'country_font'",
      "'beta_feedback'",
    ]) {
      expect(quarantine).toContain(domain);
    }
  });

  it("removes direct client insert/update policies from final application buckets", () => {
    for (const policy of [
      '"country media bucket owner insert"',
      '"country media tokenized insert"',
      '"organizers upload edition artwork"',
      '"country fonts authenticated upload"',
      '"Public beta testers can upload screenshots"',
    ]) {
      expect(quarantine).toContain(`drop policy if exists ${policy}`);
    }

    expect(quarantine).toContain(
      "The older country-media token RPCs are superseded by the unified quarantine",
    );
  });

  it("verifies actual bytes and publishes only after signature validation", () => {
    expect(finalizer).toContain("detectFile");
    expect(finalizer).toContain("Uploaded file signature is not an allowed Solaris file type.");
    expect(finalizer).toContain(
      "Uploaded file signature does not match the authorized file type.",
    );

    for (const signature of ["PNG", "GIF87a", "GIF89a", "RIFF", "WEBP", "wOF2", "wOFF", "OTTO"]) {
      expect(finalizer).toContain(signature);
    }

    expect(finalizer).toContain("bytes[0] === 0xff");
    expect(finalizer).toContain("bytes[1] === 0xd8");
    expect(finalizer).toContain("bytes.byteLength !== Number(row.expected_size)");
    expect(finalizer).toContain('.from("solaris-upload-quarantine")');
    expect(finalizer).toContain(".download(row.quarantine_path)");
    expect(finalizer).toContain(".from(row.final_bucket)");
    expect(finalizer).toContain(".upload(row.final_path");
    expect(finalizer).toContain(".remove([row.quarantine_path])");
    expect(finalizer).toContain('status: "verified"');
  });

  it("extracts verification metadata and records the scanner limitation explicitly", () => {
    expect(finalizer).toContain("jpegDimensions");
    expect(finalizer).toContain("width:");
    expect(finalizer).toContain("height:");
    expect(finalizer).toContain("signatureVerified: true");
    expect(finalizer).toContain('malwareScan: "not_available_in_current_runtime"');
    expect(finalizer).not.toContain('malwareScan: "clean"');
  });

  it("keeps the shared raw upload fail-closed and non-overwriting", () => {
    expect(helper).toContain('objectPath.startsWith("/")');
    expect(helper).toContain('objectPath.split("/").includes("..")');
    expect(helper).toContain("input.file.size <= 0");
    expect(helper).toContain("upsert: false");
    expect(helper).toContain('"application/octet-stream"');
    expect(helper).toContain('row.bucket !== "solaris-upload-quarantine"');
  });

  it("keeps all unified upload artifacts present in the repository", () => {
    for (const path of [
      "supabase/migrations/20261003210000_organisation_os_v5_unified_upload_quarantine.sql",
      "supabase/functions/solaris-upload-finalize/index.ts",
      "src/lib/upload-safety.ts",
    ]) {
      expect(existsSync(join(root, path)), path).toBe(true);
    }
  });
});
