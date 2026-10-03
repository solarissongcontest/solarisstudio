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
  it("keeps one raw Storage upload implementation for all production source", () => {
    const directUploadFiles = productionSourceFiles().filter((path) =>
      /\.upload\s*\(/.test(source(path)),
    );

    expect(directUploadFiles).toEqual(["src/lib/upload-safety.ts"]);
  });

  it("routes every known user upload domain through the shared primitive", () => {
    for (const path of [
      "src/lib/country-account.ts",
      "src/lib/integrity-portal.ts",
      "src/lib/integrity-evidence.ts",
    ]) {
      const code = source(path);
      expect(code, path).toContain("uploadServerAuthorizedFile");
      expect(code, path).not.toMatch(/\.upload\s*\(/);
    }
  });

  it("server-authorizes country media to one exact short-lived object path", () => {
    const migration = source(
      "supabase/migrations/20261003170000_organisation_os_v5_country_media_upload_safety.sql",
    );

    expect(migration).toContain("studio2_country_media_upload_tokens");
    expect(migration).toContain("interval '10 minutes'");
    expect(migration).toContain("expected_size > 0 and expected_size <= 8388608");
    expect(migration).toContain(
      "mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')",
    );
    expect(migration).toContain("studio2_create_country_media_upload");
    expect(migration).toContain("studio2_finalize_country_media_upload");
    expect(migration).toContain(
      "private.studio2_country_media_upload_token_valid(auth.uid(), name)",
    );
    expect(migration).toContain(
      "grant execute on function private.studio2_country_media_upload_token_valid(uuid, text)",
    );
    expect(migration).not.toContain(
      "grant select on table public.studio2_country_media_upload_tokens to authenticated",
    );
  });

  it("keeps the shared raw upload fail-closed and non-overwriting", () => {
    const helper = source("src/lib/upload-safety.ts");

    expect(helper).toContain("uploadServerAuthorizedFile");
    expect(helper).toContain('objectPath.startsWith("/")');
    expect(helper).toContain('objectPath.split("/").includes("..")');
    expect(helper).toContain("input.file.size <= 0");
    expect(helper).toContain("upsert: false");
    expect(helper).toContain('"application/octet-stream"');
  });

  it("keeps the upload safety migration present in the repository", () => {
    expect(
      existsSync(
        join(
          root,
          "supabase/migrations/20261003170000_organisation_os_v5_country_media_upload_safety.sql",
        ),
      ),
    ).toBe(true);
  });
});
