import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const driverPath = resolve(".github/scripts/v3-s14-stage-9-publication.sh");
const driver = readFileSync(driverPath, "utf8");

function exerciseUnpublishedShowAssertion(showId: string) {
  // Source only the QA functions. Override the anonymous reader before
  // invoking the assertion so this test never opens a network connection.
  const shell = [
    "source \"$1\"",
    "anonymous_result_snapshot() {",
    "  if [[ \"$1\" == leaked ]]; then",
    "    printf '%s' '[{\"id\":\"spoiler\"}]'",
    "  else",
    "    printf '%s' '[]'",
    "  fi",
    "}",
    "fail() { printf '%s\\n' \"$*\" >&2; return 1; }",
    "assert_anonymous_result_still_hidden \"$2\" 'local rehearsal regression'",
  ].join("\n");

  return spawnSync("bash", ["-c", shell, "s14-cross-show", driverPath, showId], {
    encoding: "utf8",
    timeout: 3000,
    env: { PATH: process.env.PATH },
  });
}

describe("S14 Stage 9 anonymous cross-show publication isolation", () => {
  it("rejects an unpublished show's anonymous Results leaking", () => {
    const hidden = exerciseUnpublishedShowAssertion("hidden");
    expect(hidden.error).toBeUndefined();
    expect(hidden.status).toBe(0);

    const leaked = exerciseUnpublishedShowAssertion("leaked");
    expect(leaked.error).toBeUndefined();
    expect(leaked.status).not.toBe(0);
    expect(leaked.stderr).toContain("exposed unpublished Results for show leaked");
  });

  it("guards other shows immediately after SF1 and SF2 public releases", () => {
    const firstPublish = driver.indexOf('first_semi_public_snapshot="$post_refresh"');
    const secondPublish = driver.indexOf('assert_anonymous_result_still_hidden "$FINAL_ID" "after SF2 publication"');
    expect(firstPublish).toBeGreaterThan(driver.indexOf('post_refresh="$(anonymous_result_snapshot "$show_id")"'));
    expect(driver).toContain('assert_anonymous_result_still_hidden "$SEMI_TWO_ID" "after SF1 publication"');
    expect(driver).toContain('assert_anonymous_result_still_hidden "$FINAL_ID" "after SF1 publication"');
    expect(secondPublish).toBeGreaterThan(firstPublish);
  });

  it("re-reads SF1 after SF2 and refuses a changed public immutable snapshot", () => {
    expect(driver).toContain('first_semi_public_snapshot="$post_refresh"');
    expect(driver).toContain('[[ -n "$first_semi_public_snapshot" ]]');
    expect(driver).toContain(
      '[[ "$(anonymous_result_snapshot "$SEMI_ONE_ID")" == "$first_semi_public_snapshot" ]]',
    );
    expect(driver).toContain(
      "SF2 publication changed the already-published immutable SF1 Results snapshot",
    );
  });
});
