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
    "supabase/migrations/20261003211000_organisation_os_v5_unified_upload_quarantine.sql",
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

  it("rechecks platform mode before publishing quarantined bytes", () => {
    expect(finalizer).toContain("studio2_platform_operational_state");
    expect(finalizer).toContain('platformState.mode === "read_only"');
    expect(finalizer).toContain('platformState.mode === "maintenance"');
    expect(finalizer).toContain(
      "Upload publication is unavailable while Solaris is Read-only or in Maintenance.",
    );
  });

  it("extracts verification and processing metadata before public delivery", () => {
    expect(finalizer).toContain("jpegDimensions");
    expect(finalizer).toContain("originalSize:");
    expect(finalizer).toContain("publishedSize:");
    expect(finalizer).toContain("signatureVerified: true");
    expect(finalizer).toContain("quarantineVerified: true");
    expect(finalizer).toContain("orientationNormalized:");
    expect(finalizer).toContain("metadataStripped:");
    expect(finalizer).toContain("reencoded:");
    expect(finalizer).toContain("thumbnailPath");
  });

  it("decodes, normalizes, re-encodes and metadata-strips public images server-side", () => {
    expect(finalizer).toContain('npm:@imagemagick/magick-wasm@0.0.30');
    expect(finalizer).toContain("initializeImageMagick");
    expect(finalizer).toContain("image.autoOrient()");
    expect(finalizer).toContain("image.comment = null");
    expect(finalizer).toContain("image.label = null");
    expect(finalizer).toContain("MagickFormat.Jpeg");
    expect(finalizer).toContain("MagickFormat.Png");
    expect(finalizer).toContain("MagickFormat.WebP");
    expect(finalizer).toContain("stripJpegMetadata");
    expect(finalizer).toContain("stripPngMetadata");
    expect(finalizer).toContain("stripWebpMetadata");
    expect(finalizer).toContain('new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"])');
    expect(finalizer).toContain('type !== "EXIF" && type !== "XMP "');
    expect(finalizer).toContain("marker !== 0xe1");
    expect(finalizer).toContain("marker !== 0xed");
    expect(finalizer).toContain("marker !== 0xfe");
    expect(finalizer).toContain("processedThumbnailPath");
    expect(finalizer).toContain("THUMBNAIL_MAX_EDGE = 512");
    expect(finalizer).toContain('processingDecision = "decoded_oriented_stripped_reencoded"');
    expect(finalizer).not.toContain("image.strip()");
  });

  it("keeps public image processing within the supported Edge Function budget", () => {
    expect(finalizer).toContain("MAX_PUBLIC_IMAGE_BYTES = 5 * 1024 * 1024");
    expect(finalizer).toContain("MAX_PUBLIC_IMAGE_DIMENSION = 8192");
    expect(finalizer).toContain("MAX_PUBLIC_IMAGE_PIXELS = 40_000_000");
    expect(quarantine).toContain("p_size > 5242880");
    expect(quarantine).not.toContain("p_size > 15728640");
    expect(quarantine).not.toContain("'image/gif'");
  });

  it("restricts public custom-font delivery to structurally validated WOFF2", () => {
    expect(quarantine).toContain("v_ext = 'woff2'");
    expect(quarantine).toContain("lower(p_mime) = 'font/woff2'");
    expect(quarantine).toContain("v_mime <> 'font/woff2'");
    expect(finalizer).toContain("validateWoff2");
    expect(finalizer).toContain('ascii(bytes, 0, 4) !== "wOF2"');
    expect(finalizer).toContain("declaredLength !== bytes.length");
    expect(finalizer).toContain("numTables <= 0");
    expect(finalizer).toContain('fontDeliveryFormat: row.domain === "country_font" ? "woff2" : null');
  });

  it("records every V5 upload pipeline stage without pretending a malware scanner exists", () => {
    for (const stage of [
      "authorized",
      "size_checked",
      "extension_allowlisted",
      "mime_signature_verified",
      "generated_storage_id",
      "quarantined",
      "type_processed",
      "metadata_extracted",
      "safe_transform_applied",
      "moderation_decided",
      "published",
    ]) {
      expect(finalizer).toContain(`"${stage}"`);
    }

    expect(finalizer).toContain('moderationDecision: "auto_approved"');
    expect(finalizer).toContain('publicationDecision: "published_after_verification"');
    expect(finalizer).toContain('malwareScan: "not_available_in_current_runtime"');
    expect(finalizer).toContain("malwareScanSupported: false");
    expect(finalizer).not.toContain('malwareScan: "clean"');
  });

  it("keeps evidence on the same quarantine verifier while preserving its stricter protected policy", () => {
    const evidenceBridge = source(
      "supabase/migrations/20261003214000_organisation_os_v5_integrity_upload_quarantine.sql",
    );
    expect(evidenceBridge).toContain("'integrity_evidence'");
    expect(evidenceBridge).toContain("'application/pdf'");
    expect(evidenceBridge).toContain("'text/plain'");
    expect(evidenceBridge).toContain("'solaris-upload-quarantine'");
    expect(evidenceBridge).toContain("private.studio2_create_evidence_upload_authorization");
    expect(evidenceBridge).toContain(
      'drop policy if exists "integrity evidence token upload" on storage.objects',
    );
    expect(finalizer).toContain('row.domain === "integrity_evidence"');
    expect(finalizer).toContain('"/JavaScript"');
    expect(finalizer).toContain('"/EmbeddedFile"');
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
      "supabase/migrations/20261003211000_organisation_os_v5_unified_upload_quarantine.sql",
      "supabase/functions/solaris-upload-finalize/index.ts",
      "src/lib/upload-safety.ts",
    ]) {
      expect(existsSync(join(root, path)), path).toBe(true);
    }
  });
});
