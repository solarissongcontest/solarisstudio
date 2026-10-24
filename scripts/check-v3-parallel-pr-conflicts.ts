import { appendFileSync } from "node:fs";

export type PullRequestRef = { ref: string };

export type PullRequestSummary = {
  number: number;
  title: string;
  body: string | null;
  draft?: boolean;
  head: PullRequestRef;
  base: PullRequestRef;
};

export type PullRequestWithFiles = PullRequestSummary & {
  files: string[];
  migrationContractKeys: string[];
};

export type ConflictRecord = {
  peerNumber: number;
  peerTitle: string;
  dependencyDeclared: boolean;
  overlappingFiles: string[];
  redZoneFiles: string[];
  semanticMigrationKeys: string[];
  blocking: boolean;
};

const RED_ZONE_EXACT = new Set([
  "package.json",
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "src/router.tsx",
  "src/routeTree.gen.ts",
  "src/routes/__root.tsx",
  "src/index.css",
  "src/lib/v3-capability-registry.ts",
  "src/lib/v3-public-capability-registry.ts",
  "src/lib/v3-organizer-capability-registry.ts",
  "src/lib/v3-notification-provider-registry.ts",
  "src/lib/v3-search-provider-registry.ts",
]);

const RED_ZONE_PREFIXES = [
  ".github/workflows/",
  ".github/scripts/",
  "supabase/migrations/",
  "src/styles/",
  "src/design-system/",
  "src/lib/design-system/",
  "src/lib/feature-flags/",
  "src/config/feature-flags/",
];

export function isV3PullRequest(pr: PullRequestSummary): boolean {
  return pr.head.ref.startsWith("v3/") || /^\[V3-[A-Z0-9_-]+\]/i.test(pr.title.trim());
}

export function isRedZonePath(path: string): boolean {
  if (RED_ZONE_EXACT.has(path)) return true;
  if (/^tsconfig(?:\.[^/]+)?\.json$/.test(path)) return true;
  if (/^vite\.config\.[cm]?[jt]s$/.test(path)) return true;
  return RED_ZONE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function migrationContractKeysFromPatch(filename: string, patch: string | undefined): string[] {
  if (!filename.startsWith("supabase/migrations/") || !filename.endsWith(".sql") || !patch) {
    return [];
  }

  // GitHub's unified patch prefixes every added line with `+`. A multiline
  // v3_register_migration_contract(...) call therefore cannot be parsed from
  // the raw patch as SQL. Reconstruct the post-change semantic text by keeping
  // context/additions, removing deletion/hunk lines, and stripping the added
  // line marker. This deliberately ignores removed contracts.
  const semanticText = patch
    .split("\n")
    .filter((line) => !line.startsWith("-") && !line.startsWith("@@"))
    .map((line) => (line.startsWith("+") ? line.slice(1) : line))
    .join("\n");

  const keys = new Set<string>();
  const pattern = /v3_register_migration_contract\s*\(\s*'([^']+)'/gim;
  for (const match of semanticText.matchAll(pattern)) {
    const key = match[1]?.trim();
    if (key) keys.add(key);
  }
  return [...keys].sort();
}

function dependencyPattern(number: number): RegExp {
  const relation =
    "(?:depends\\s+on|depends-on|dependency|requires?|blocked\\s+(?:by|on)|parent|child\\s+of|stacked\\s+(?:on|after)|based\\s+on|base\\s+on)";
  const optionalLane = "(?:(?:system|public|organizer|qa|nav(?:igation)?|pr)\\s+)?";
  return new RegExp(`${relation}\\s*:?\\s*${optionalLane}#${number}\\b`, "i");
}

export function hasDeclaredDependency(current: PullRequestSummary, peer: PullRequestSummary): boolean {
  if (current.base.ref === peer.head.ref || peer.base.ref === current.head.ref) return true;
  if (dependencyPattern(peer.number).test(current.body ?? "")) return true;
  if (dependencyPattern(current.number).test(peer.body ?? "")) return true;
  return false;
}

export function analyzeParallelConflicts(
  current: PullRequestWithFiles,
  peers: PullRequestWithFiles[],
): ConflictRecord[] {
  const currentFiles = new Set(current.files);
  const currentMigrationKeys = new Set(current.migrationContractKeys);

  return peers
    .filter((peer) => peer.number !== current.number && isV3PullRequest(peer))
    .map((peer) => {
      const overlappingFiles = [...new Set(peer.files.filter((file) => currentFiles.has(file)))].sort();
      const redZoneFiles = overlappingFiles.filter(isRedZonePath);
      const semanticMigrationKeys = [
        ...new Set(peer.migrationContractKeys.filter((key) => currentMigrationKeys.has(key))),
      ].sort();
      const dependencyDeclared = hasDeclaredDependency(current, peer);
      return {
        peerNumber: peer.number,
        peerTitle: peer.title,
        dependencyDeclared,
        overlappingFiles,
        redZoneFiles,
        semanticMigrationKeys,
        blocking:
          (redZoneFiles.length > 0 || semanticMigrationKeys.length > 0) && !dependencyDeclared,
      } satisfies ConflictRecord;
    })
    .filter(
      (conflict) =>
        conflict.overlappingFiles.length > 0 || conflict.semanticMigrationKeys.length > 0,
    )
    .sort((a, b) => {
      if (a.blocking !== b.blocking) return a.blocking ? -1 : 1;
      if (a.semanticMigrationKeys.length !== b.semanticMigrationKeys.length) {
        return b.semanticMigrationKeys.length - a.semanticMigrationKeys.length;
      }
      if (a.redZoneFiles.length !== b.redZoneFiles.length) {
        return b.redZoneFiles.length - a.redZoneFiles.length;
      }
      return a.peerNumber - b.peerNumber;
    });
}

type GitHubPull = PullRequestSummary;
type GitHubPullFile = { filename: string; patch?: string };
type PullSurface = { files: string[]; migrationContractKeys: string[] };

async function githubJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "solaris-v3-parallel-pr-conflict-guard",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status} ${response.statusText}: ${url}`);
  }
  return (await response.json()) as T;
}

async function fetchPaged<T>(url: string, token: string, maxPages = 10): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const separator = url.includes("?") ? "&" : "?";
    const batch = await githubJson<T[]>(`${url}${separator}per_page=100&page=${page}`, token);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

async function fetchPullSurface(repository: string, number: number, token: string): Promise<PullSurface> {
  const rows = await fetchPaged<GitHubPullFile>(
    `https://api.github.com/repos/${repository}/pulls/${number}/files`,
    token,
    5,
  );
  const migrationContractKeys = new Set<string>();
  for (const row of rows) {
    for (const key of migrationContractKeysFromPatch(row.filename, row.patch)) {
      migrationContractKeys.add(key);
    }
  }
  return {
    files: rows.map((row) => row.filename),
    migrationContractKeys: [...migrationContractKeys].sort(),
  };
}

export function renderConflictReport(current: PullRequestSummary, conflicts: ConflictRecord[]): string {
  const blocking = conflicts.filter((conflict) => conflict.blocking);
  const lines = [
    "## V3 parallel PR conflict guard",
    "",
    `Current PR: #${current.number} — ${current.title}`,
    `Blocking red-zone/semantic collisions: **${blocking.length}**`,
    `PRs with file or semantic migration overlap: **${conflicts.length}**`,
    "",
  ];

  if (conflicts.length === 0) {
    lines.push("No file overlap or duplicate S13 migration semantic key with other open V3 pull requests was found.");
    return lines.join("\n");
  }

  for (const conflict of conflicts) {
    const status = conflict.blocking
      ? "BLOCKING"
      : conflict.dependencyDeclared
        ? "declared stack"
        : "non-red-zone overlap";
    lines.push(`### #${conflict.peerNumber} — ${status}`);
    lines.push(conflict.peerTitle, "");
    if (conflict.overlappingFiles.length > 0) {
      lines.push(`Overlapping files (${conflict.overlappingFiles.length}):`);
      for (const file of conflict.overlappingFiles) {
        lines.push(`- \`${file}\`${conflict.redZoneFiles.includes(file) ? " **[red-zone]**" : ""}`);
      }
    }
    if (conflict.semanticMigrationKeys.length > 0) {
      lines.push(`Shared S13 migration semantic keys (${conflict.semanticMigrationKeys.length}):`);
      for (const key of conflict.semanticMigrationKeys) {
        lines.push(`- \`${key}\` **[semantic red-zone]**`);
      }
    }
    if (conflict.dependencyDeclared) {
      lines.push("- Intentional stack/dependency relationship detected; red-zone/semantic overlap is not blocked.");
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  const currentNumber = Number(process.env.V3_CURRENT_PR);
  if (!repository || !token || !Number.isInteger(currentNumber) || currentNumber <= 0) {
    throw new Error("GITHUB_REPOSITORY, GITHUB_TOKEN and positive integer V3_CURRENT_PR are required");
  }

  const current = await githubJson<GitHubPull>(
    `https://api.github.com/repos/${repository}/pulls/${currentNumber}`,
    token,
  );
  if (!isV3PullRequest(current)) {
    console.log(`PR #${current.number} is not a V3 pull request; nothing to compare.`);
    return;
  }

  const openPulls = await fetchPaged<GitHubPull>(
    `https://api.github.com/repos/${repository}/pulls?state=open`,
    token,
  );
  const candidates = openPulls.filter((pr) => pr.number !== current.number && isV3PullRequest(pr));
  const currentSurface = await fetchPullSurface(repository, current.number, token);
  const currentWithFiles: PullRequestWithFiles = { ...current, ...currentSurface };
  const peers: PullRequestWithFiles[] = [];
  for (const peer of candidates) {
    const surface = await fetchPullSurface(repository, peer.number, token);
    peers.push({ ...peer, ...surface });
  }

  const conflicts = analyzeParallelConflicts(currentWithFiles, peers);
  const report = renderConflictReport(current, conflicts);
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`, "utf8");
  }

  const blocking = conflicts.filter((conflict) => conflict.blocking);
  if (blocking.length > 0) {
    console.error(
      `\nFound ${blocking.length} undeclared V3 PR collision(s) in coordination-sensitive red-zone files or S13 semantic migration authority. ` +
        "Declare the intentional stack/dependency in the PR body or coordinate the conflicting implementation before merge.",
    );
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}
