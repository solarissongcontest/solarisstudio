import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import {
  validateV3NavigationReferenceBaseline,
  type V3NavigationReferenceBaseline,
} from "../../src/lib/v3-navigation-reference-baseline";

/** N0 needs approved capture bytes, not a README or an implementation screenshot. */
export function inspectV3NavigationReferencePackage(directory: string) {
  const failures: string[] = [];
  try {
    const root = realpathSync(directory);
    const baseline = JSON.parse(
      readFileSync(resolve(root, "baseline.json"), "utf8"),
    ) as V3NavigationReferenceBaseline & { captureSha256?: Record<string, string> };
    // The shared validator expects typed values; reject malformed JSON first.
    if (
      !baseline ||
      typeof baseline !== "object" ||
      !baseline.states ||
      typeof baseline.states !== "object" ||
      Array.isArray(baseline.states) ||
      (baseline.geometry && !Array.isArray(baseline.geometry.iconCenterX))
    ) {
      throw new Error("Malformed navigation reference manifest");
    }
    failures.push(...validateV3NavigationReferenceBaseline(baseline).failures);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(baseline.captureDate ?? "") ||
      !Number.isFinite(Date.parse(baseline.captureDate ?? ""))
    ) {
      failures.push("captureDate must identify the actual capture day");
    }
    for (const [state, filename] of Object.entries(baseline.states)) {
      if (
        typeof filename !== "string" ||
        isAbsolute(filename) ||
        !/\.(?:png|jpe?g|webp)$/i.test(filename)
      ) {
        failures.push(`Invalid capture path: ${state}`);
        continue;
      }
      try {
        const path = realpathSync(resolve(root, filename));
        const child = relative(root, path);
        if (child.startsWith("..") || isAbsolute(child)) throw new Error("Capture escapes package");
        const bytes = readFileSync(path);
        const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
        const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
        const webp =
          bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
        if (!(png || jpeg || webp) || bytes.length < 32) throw new Error("Capture is not an image");
        const expected = baseline.captureSha256?.[state];
        if (
          !expected ||
          !/^[a-f0-9]{64}$/.test(expected) ||
          createHash("sha256").update(bytes).digest("hex") !== expected
        ) {
          throw new Error("Capture fingerprint missing or changed");
        }
      } catch {
        failures.push(`Missing, unsafe or changed capture: ${state}`);
      }
    }
  } catch {
    failures.push("Approved navigation reference baseline.json and capture files are required");
  }
  return { pass: failures.length === 0, failures };
}
