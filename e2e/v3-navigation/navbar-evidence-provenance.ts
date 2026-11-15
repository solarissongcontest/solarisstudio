import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Browser Audit checks out the PR's exact head SHA, but GitHub's GITHUB_SHA
 * for pull_request events can identify the synthetic test-merge commit.
 * Never label that workflow SHA as the N14 source candidate. Device evidence
 * must refer to the actual checked-out code, and fail closed on a PR mismatch.
 */
export type NavbarEvidenceProvenance = {
  candidateSha: string | null;
  workflowSha: string | null;
  pullRequestHeadSha: string | null;
  exactHeadVerified: boolean | null;
};

export function resolveNavbarEvidenceProvenance({
  checkoutSha,
  workflowSha,
  pullRequestHeadSha,
  eventName,
  ci,
}: {
  checkoutSha: string | null | undefined;
  workflowSha: string | null | undefined;
  pullRequestHeadSha: string | null | undefined;
  eventName: string | null | undefined;
  ci: boolean;
}): NavbarEvidenceProvenance {
  const normalize = (value: string | null | undefined) => {
    const trimmed = value?.trim().toLowerCase() ?? "";
    return /^[a-f0-9]{40}$/.test(trimmed) ? trimmed : null;
  };

  const candidate = normalize(checkoutSha);
  const workflow = normalize(workflowSha);
  const eventHead = normalize(pullRequestHeadSha);

  if (ci && !candidate) {
    throw new Error("N14 evidence requires an exact 40-character checked-out Git commit");
  }
  if (ci && eventName === "pull_request" && !eventHead) {
    throw new Error("N14 PR evidence requires the GitHub event's exact PR head commit");
  }
  if (eventHead && candidate !== eventHead) {
    throw new Error(
      `N14 candidate does not match the PR's event head: checkout=${candidate ?? "missing"}, event=${eventHead}`,
    );
  }

  return {
    candidateSha: candidate,
    workflowSha: workflow,
    pullRequestHeadSha: eventHead,
    exactHeadVerified: eventHead ? candidate === eventHead : null,
  };
}

export function readNavbarEvidenceProvenance(): NavbarEvidenceProvenance {
  let checkoutSha: string | null = null;
  try {
    checkoutSha = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Local non-Git screenshots may be useful diagnostics, but cannot be
    // mistaken for CI/release evidence. The resolver rejects missing CI SHA.
  }

  let pullRequestHeadSha: string | null = null;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath) {
    try {
      const payload = JSON.parse(readFileSync(eventPath, "utf8")) as {
        pull_request?: { head?: { sha?: unknown } };
      };
      const sha = payload.pull_request?.head?.sha;
      if (typeof sha === "string") pullRequestHeadSha = sha;
    } catch (error) {
      if (process.env.CI) {
        throw new Error("N14 evidence could not read the exact GitHub event source", { cause: error });
      }
    }
  }

  return resolveNavbarEvidenceProvenance({
    checkoutSha,
    workflowSha: process.env.GITHUB_SHA,
    pullRequestHeadSha,
    eventName: process.env.GITHUB_EVENT_NAME,
    ci: Boolean(process.env.CI),
  });
}
