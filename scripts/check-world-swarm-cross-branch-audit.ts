/**
 * Read-only TG19 World swarm migration preflight.
 * Offline: bun scripts/check-world-swarm-cross-branch-audit.ts --input snapshot.json
 * Live: GITHUB_TOKEN=... bun scripts/check-world-swarm-cross-branch-audit.ts --live
 * Never queries Supabase or authorizes a merge, production migration or release.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  auditWorldSwarmCrossBranches,
  isPotentialWorldSwarmPull,
  type WorldSwarmPull,
  type WorldSwarmSnapshot,
} from "../src/lib/world-swarm-cross-branch-audit.ts";

const REPO = "solarissongcontest/solarisstudio";
const BASE = `https://api.github.com/repos/${REPO}`;
const LIMIT = 5;

function usage(): string {
  return [
    "World swarm TG19 cross-PR migration preflight (read-only)",
    "Usage: bun scripts/check-world-swarm-cross-branch-audit.ts --input snapshot.json [--output report.json]",
    "   or: GITHUB_TOKEN=... bun scripts/check-world-swarm-cross-branch-audit.ts --live [--output report.json]",
    "--live reads GitHub main and World PR diffs, never production Supabase.",
    "Exit code 1 means conflict, invalid snapshot, or incomplete GitHub read.",
    "A clean report is never merge/release/deployment authorization.",
  ].join("\n");
}

function options(argv: string[]): { input?: string; live: boolean; output?: string } {
  const result: { input?: string; live: boolean; output?: string } = { live: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help") { process.stdout.write(`${usage()}\n`); process.exit(0); }
    if (arg === "--live") { result.live = true; continue; }
    if ((arg === "--input" || arg === "--output") && argv[i + 1]) {
      result[arg === "--input" ? "input" : "output"] = argv[++i];
      continue;
    }
    throw new Error(`Unknown or incomplete argument ${arg}\n${usage()}`);
  }
  if (Number(result.live) + Number(Boolean(result.input)) !== 1) {
    throw new Error("Specify exactly one of --input or --live");
  }
  return result;
}

async function github<T>(path: string, token: string): Promise<T> {
  if (!path.startsWith("/")) throw new Error("Invalid relative GitHub API path");
  const response = await fetch(`${BASE}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Solaris-World-TG19-Read-Only-Audit",
    },
  });
  if (!response.ok) throw new Error(`GitHub read failed (${response.status}) at ${path}`);
  return await response.json() as T;
}

async function pages<T>(path: string, token: string): Promise<T[]> {
  const result: T[] = [];
  for (let page = 1; page <= LIMIT; page++) {
    const divider = path.includes("?") ? "&" : "?";
    const items = await github<T[]>(`${path}${divider}per_page=100&page=${page}`, token);
    if (!Array.isArray(items)) throw new Error(`GitHub did not return list at ${path}`);
    result.push(...items);
    if (items.length < 100) return result;
  }
  throw new Error(`GitHub pagination exceeded ${LIMIT * 100} items at ${path}; snapshot incomplete`);
}

type GithubPull = {
  number: number; title: string; draft: boolean;
  head: { ref: string; sha: string };
  base: { ref: string };
};
type GithubFile = { filename: string; status: string; previous_filename?: string };

function isWorld(pull: GithubPull): boolean {
  return isPotentialWorldSwarmPull({ title: pull.title, branch: pull.head.ref });
}

async function liveSnapshot(): Promise<WorldSwarmSnapshot> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error("GITHUB_TOKEN required for bounded live GitHub reads; never commit it");
  const branch = () => github<{ commit: { sha: string } }>("/branches/main", token);
  const startMain = (await branch()).commit.sha;
  const mainFiles = await github<Array<{ path: string; type: string }>>(
    "/contents/supabase/migrations?ref=main", token,
  );
  if (!Array.isArray(mainFiles) || mainFiles.length >= 1000) {
    throw new Error("Main migration contents listing unavailable or incomplete");
  }
  const pulls = (await pages<GithubPull>("/pulls?state=open", token)).filter(isWorld);
  const candidates: WorldSwarmPull[] = [];
  for (const pull of pulls) {
    const files = await pages<GithubFile>(`/pulls/${pull.number}/files`, token);
    candidates.push({
      number: pull.number, title: pull.title, branch: pull.head.ref,
      baseRef: pull.base.ref, headSha: pull.head.sha, draft: pull.draft,
      files: files.filter((file) => file.filename.startsWith("supabase/migrations/") && file.filename.endsWith(".sql"))
        .map((file) => ({
          filename: file.filename,
          status: file.status as WorldSwarmPull["files"][number]["status"],
          ...(file.previous_filename ? { previousFilename: file.previous_filename } : {}),
        })),
    });
  }
  const endMain = (await branch()).commit.sha;
  if (startMain !== endMain) throw new Error(`main moved during live read (${startMain} -> ${endMain}); retry`);
  for (const candidate of candidates) {
    const latest = await github<GithubPull>(`/pulls/${candidate.number}`, token);
    if (latest.head.sha !== candidate.headSha || latest.base.ref !== candidate.baseRef) {
      throw new Error(`PR #${candidate.number} moved during snapshot; retry`);
    }
  }
  // Main can advance while hundreds of PR heads are checked. Do not
  // publish a clean snapshot tied to a main that has since moved.
  const finalMain = (await branch()).commit.sha;
  if (finalMain !== startMain) {
    throw new Error(`main moved during PR-head validation (${startMain} -> ${finalMain}); retry`);
  }
  return {
    repository: REPO,
    mainSha: startMain,
    mainMigrations: mainFiles.filter((item) => item.type === "file" && item.path.endsWith(".sql"))
      .map((item) => item.path),
    pulls: candidates,
  };
}

async function main() {
  const args = options(process.argv.slice(2));
  const snapshot = args.live
    ? await liveSnapshot()
    : JSON.parse(readFileSync(args.input!, "utf8")) as WorldSwarmSnapshot;
  const report = auditWorldSwarmCrossBranches(snapshot);
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (args.output) writeFileSync(args.output, json, "utf8");
  process.stdout.write(json);
  if (!report.clean) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`World swarm migration audit failed closed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
