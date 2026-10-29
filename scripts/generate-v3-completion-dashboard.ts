import { isResolvedV3DomainConsequence, isV3ReadOnlyConsequenceReplacement } from "../src/lib/v3-domain-consequence-registry";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  V3_DOMAIN_CONSEQUENCE_REGISTRY,
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  V3_PUBLIC_CAPABILITIES,
  V3_REQUIRED_SYSTEM_CONCEPTS,
  V3_SYSTEM_CONCEPT_OWNER,
  V3_SYSTEM_DOMAIN_REGISTRY,
} from "../src/lib/v3-capability-registry";
import { buildV3PublicProductReviewRows } from "../src/lib/v3-public-product-review";
import { inspectV3NavigationReferencePackage, describeV3NavigationGeometryEvidence } from "./lib/v3-navigation-reference-evidence";

type CompletionState =
  | "missing"
  | "foundation"
  | "implemented"
  | "integrated"
  | "tested"
  | "parity"
  | "cutover"
  | "certified";

type EvidenceRow = {
  id: string;
  name: string;
  state: CompletionState;
  evidence: string;
  blocker?: string;
};

const STATE_RANK: Record<CompletionState, number> = {
  missing: 0,
  foundation: 1,
  implemented: 2,
  integrated: 3,
  tested: 4,
  parity: 5,
  cutover: 6,
  certified: 7,
};

const PUBLIC_STATUS_STATE: Record<string, CompletionState> = {
  discovered: "missing",
  mapped: "foundation",
  specified: "foundation",
  building: "implemented",
  parity: "parity",
  cutover: "cutover",
  retired: "cutover",
};

const ORGANIZER_STATUS_STATE: Record<string, CompletionState> = {
  planned: "foundation",
  building: "implemented",
  parity: "parity",
  cutover: "cutover",
  retired: "cutover",
};

function minState(states: readonly CompletionState[], fallback: CompletionState = "missing") {
  if (!states.length) return fallback;
  return states.reduce((lowest, current) =>
    STATE_RANK[current] < STATE_RANK[lowest] ? current : lowest,
  );
}

function capState(state: CompletionState, ceiling: CompletionState) {
  return STATE_RANK[state] > STATE_RANK[ceiling] ? ceiling : state;
}

function sourceContains(path: string, needle: string | RegExp) {
  if (!existsSync(path)) return false;
  const source = readFileSync(path, "utf8");
  return typeof needle === "string" ? source.includes(needle) : needle.test(source);
}

function exactSha() {
  const envSha = process.env.GITHUB_SHA?.trim();
  if (envSha && /^[0-9a-f]{40}$/i.test(envSha)) return envSha.toLowerCase();
  try {
    const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    if (/^[0-9a-f]{40}$/i.test(gitSha)) return gitSha.toLowerCase();
  } catch {
    // Dashboard remains useful outside a git checkout, but it must say so.
  }
  return "unknown";
}

function compactEvidence(values: readonly string[], limit = 6) {
  if (!values.length) return "No machine-readable evidence found";
  const shown = values.slice(0, limit);
  return values.length > limit ? `${shown.join(", ")} (+${values.length - limit} more)` : shown.join(", ");
}

function publicSelection(ids: readonly string[] = [], routes: readonly RegExp[] = []) {
  const selected = V3_PUBLIC_CAPABILITIES.filter(
    (item) =>
      ids.includes(item.id) ||
      item.legacyRoutes.some((route) => routes.some((pattern) => pattern.test(route))),
  );
  return [...new Map(selected.map((item) => [item.id, item])).values()];
}

function publicRow(
  id: string,
  name: string,
  ids: readonly string[] = [],
  routes: readonly RegExp[] = [],
  ceiling: CompletionState = "parity",
): EvidenceRow {
  const items = publicSelection(ids, routes);
  if (!items.length) {
    return { id, name, state: "missing", evidence: "No matching Public capability registry row" };
  }
  const states = items.map((item) => PUBLIC_STATUS_STATE[item.specificationStatus] ?? "missing");
  const state = capState(minState(states), ceiling);
  const evidence = compactEvidence(items.map((item) => `${item.id}:${item.specificationStatus}`));
  const parityWithoutEvidence = items.filter(
    (item) =>
      ["parity", "cutover", "retired"].includes(item.specificationStatus) &&
      !("migrationEvidence" in item && item.migrationEvidence),
  );
  return {
    id,
    name,
    state,
    evidence,
    blocker: parityWithoutEvidence.length
      ? `Acceptance evidence reference missing for ${parityWithoutEvidence.map((item) => item.id).join(", ")}`
      : undefined,
  };
}

function organizerSelection(predicate: (item: (typeof V3_ORGANIZER_CAPABILITY_REGISTRY)[number]) => boolean) {
  return V3_ORGANIZER_CAPABILITY_REGISTRY.filter(predicate);
}

function organizerRow(
  id: string,
  name: string,
  predicate: (item: (typeof V3_ORGANIZER_CAPABILITY_REGISTRY)[number]) => boolean,
  ceiling: CompletionState = "parity",
): EvidenceRow {
  const items = organizerSelection(predicate);
  if (!items.length) {
    return { id, name, state: "missing", evidence: "No matching Organizer capability registry row" };
  }
  const state = capState(
    minState(items.map((item) => ORGANIZER_STATUS_STATE[item.migrationStatus] ?? "missing")),
    ceiling,
  );
  return {
    id,
    name,
    state,
    evidence: compactEvidence(items.map((item) => `${item.legacyId}:${item.migrationStatus}`)),
  };
}

const registryGuardsPassed = process.env.V3_REGISTRY_GUARDS_PASSED === "1";
const candidateSha = exactSha();
const publicProductReviewRows = buildV3PublicProductReviewRows();
const eventBackedConsequences = V3_DOMAIN_CONSEQUENCE_REGISTRY.filter(
  (item) => item.implementationState === "event-backed",
);
const resolvedConsequences = V3_DOMAIN_CONSEQUENCE_REGISTRY.filter(isResolvedV3DomainConsequence);
const readOnlyReplacements = V3_DOMAIN_CONSEQUENCE_REGISTRY.filter(isV3ReadOnlyConsequenceReplacement);
const unresolvedConsequences = V3_DOMAIN_CONSEQUENCE_REGISTRY.filter((item) => !isResolvedV3DomainConsequence(item));
const systemConceptsOwned = V3_REQUIRED_SYSTEM_CONCEPTS.every(
  (concept) => Boolean((V3_SYSTEM_CONCEPT_OWNER as Record<string, string>)[concept]),
);
const pendingPhysicalDomains = V3_SYSTEM_DOMAIN_REGISTRY.filter(
  (domain) => domain.physicalAuditStatus === "pending",
);

const s2Files = [
  "supabase/migrations/20261014194651_v3_s2_operation_receipt_idempotency.sql",
  "src/lib/v3-system-operation-receipts.test.ts",
  ".github/scripts/v3-operation-receipt-rehearsal.sh",
];
const s3Files = [
  "src/lib/v3-s3-confirmation-invariants.contract.test.ts",
  "src/lib/v3-s3-entry-invariants.contract.test.ts",
  "src/lib/v3-s3-media-invariants.contract.test.ts",
  "src/lib/v3-s3-jury-invariants.contract.test.ts",
  "src/lib/v3-s3-televote-invariants.contract.test.ts",
  "src/lib/v3-s3-publication-invariants.contract.test.ts",
  "src/lib/v3-s3-identity-access-invariants.contract.test.ts",
];
const s4Files = [
  "supabase/migrations/20261015180000_v3_s4_domain_event_outbox.sql",
  "src/lib/v3-s4-domain-event-outbox.contract.test.ts",
  ".github/scripts/v3-s4-domain-event-outbox-rehearsal.sh",
  ".github/workflows/v3-s4-domain-event-outbox-rehearsal.yml",
];

const systemRows: EvidenceRow[] = [
  {
    id: "S0",
    name: "system discovery",
    state: systemConceptsOwned && registryGuardsPassed ? "tested" : systemConceptsOwned ? "implemented" : "foundation",
    evidence: `${V3_REQUIRED_SYSTEM_CONCEPTS.length} required concepts; ${systemConceptsOwned ? "all have canonical owners" : "owner gaps remain"}`,
    blocker: systemConceptsOwned ? undefined : "At least one required System concept has no canonical owner",
  },
  {
    id: "S1",
    name: "domain registry",
    state:
      pendingPhysicalDomains.length === 0 && registryGuardsPassed
        ? "tested"
        : V3_SYSTEM_DOMAIN_REGISTRY.length
          ? "implemented"
          : "missing",
    evidence: `${V3_SYSTEM_DOMAIN_REGISTRY.length} domains; ${pendingPhysicalDomains.length} pending physical ownership audits`,
    blocker: pendingPhysicalDomains.length
      ? `${pendingPhysicalDomains.length} System domains still lack certified physical ownership evidence`
      : undefined,
  },
  {
    id: "S2",
    name: "operation infrastructure",
    state: s2Files.every(existsSync) ? "tested" : s2Files.some(existsSync) ? "implemented" : "missing",
    evidence: compactEvidence(s2Files.filter(existsSync)),
    blocker: s2Files.every(existsSync) ? undefined : "Canonical operation/idempotency/reconciliation evidence set is incomplete",
  },
  {
    id: "S3",
    name: "database invariants",
    state: s3Files.every(existsSync) ? "tested" : s3Files.some(existsSync) ? "implemented" : "missing",
    evidence: `${s3Files.filter(existsSync).length}/${s3Files.length} canonical invariant contract tests present`,
    blocker: s3Files.every(existsSync) ? undefined : "Not every S3 invariant family has contract evidence",
  },
  {
    id: "S4",
    name: "domain events/outbox",
    state: s4Files.every(existsSync) ? "tested" : s4Files.some(existsSync) ? "implemented" : "missing",
    evidence: compactEvidence(s4Files.filter(existsSync)),
    blocker: s4Files.every(existsSync) ? undefined : "S4 event/outbox migration, rehearsal or contract evidence is incomplete",
  },
  {
    id: "S5",
    name: "cross-system consequence migration",
    state:
      unresolvedConsequences.length === 0 && resolvedConsequences.length > 0
        ? "integrated"
        : resolvedConsequences.length > 0
          ? "implemented"
          : "foundation",
    evidence: `${eventBackedConsequences.length}/${V3_DOMAIN_CONSEQUENCE_REGISTRY.length} declared consequences are event-backed; ${readOnlyReplacements.length} are validated canonical read replacements`,
    blocker:
      unresolvedConsequences.length === 0
        ? undefined
        : `${unresolvedConsequences.length} consequences are still declaration-only`,
  },
  {
    id: "S6",
    name: "projections/reconciliation",
    state:
      existsSync("src/lib/v3-bootstrap.ts") && existsSync("src/lib/system-operation-reconciliation.server.ts")
        ? "foundation"
        : "missing",
    evidence: "Existing focused projection and operation reconciliation primitives; no complete S6 rebuild/reconciliation certification",
    blocker: "Core projection invalidation, rebuild and authoritative-source reconciliation are not phase-certified",
  },
  {
    id: "S7",
    name: "authorization hardening",
    state: existsSync("src/lib/permission-engine.ts") || existsSync("src/lib/permission-route-map.ts") ? "foundation" : "missing",
    evidence: "Existing Permission Engine/RLS foundations; S7 generated capability-object matrix still required",
    blocker: "No complete S7 generated authorization matrix evidence",
  },
  {
    id: "S8",
    name: "abuse/resource protection",
    state: existsSync("supabase/migrations/20261004224000_country_auth_rate_limits.sql") ? "foundation" : "missing",
    evidence: "Existing rate-limit/anti-abuse mechanisms predate the complete S8 audit",
    blocker: "S8 bounded retry, batch/upload/resource and replay protections are not phase-certified",
  },
  {
    id: "S9",
    name: "observability",
    state: existsSync("src/lib/public-ux-metrics.ts") || existsSync("src/lib/system-operation.functions.ts") ? "foundation" : "missing",
    evidence: "Existing operational and UX telemetry primitives; canonical S9 correlation/consumer/reconciliation visibility remains unfinished",
    blocker: "S9 structured end-to-end operation/event/consumer observability not certified",
  },
  { id: "S10", name: "SLOs/alerts", state: "missing", evidence: "No exact S10 release evidence artifact", blocker: "Measured SLO/alert baseline not certified" },
  { id: "S11", name: "recovery", state: "foundation", evidence: "Upgrade/recovery rehearsals exist, but full S11 restore/recovery proof is not present", blocker: "Restore/failover recovery evidence incomplete" },
  { id: "S12", name: "capacity", state: "missing", evidence: "No exact S12 capacity evidence artifact", blocker: "Peak/capacity budgets not certified" },
  {
    id: "S13",
    name: "migration hardening",
    state: existsSync(".github/workflows/v3-production-head-upgrade.yml") ? "foundation" : "missing",
    evidence: "Production-head upgrade rehearsal infrastructure exists; complete S13 compatibility window/recovery proof still required",
    blocker: "S13 migration hardening is not phase-certified",
  },
  { id: "S14", name: "full-contest rehearsal", state: "missing", evidence: "No exact-candidate full-contest rehearsal evidence", blocker: "Seeded end-to-end contest lifecycle has not passed" },
  { id: "S15", name: "zero-orphan system audit", state: "missing", evidence: "No exact-candidate zero-orphan certificate", blocker: "Final domains/commands/events/projections/tasks/notifications/routes/flags orphan scan has not passed" },
  { id: "S16", name: "final release certification", state: "missing", evidence: `Candidate ${candidateSha}; no exact-SHA S16 certificate`, blocker: "S16 cannot run before S14 and S15 pass on a frozen candidate" },
];

const publicRows: EvidenceRow[] = [
  {
    id: "P0",
    name: "exhaustive capability freeze",
    state: registryGuardsPassed ? "tested" : "implemented",
    evidence: `${V3_PUBLIC_CAPABILITIES.length} Public capabilities in canonical aggregate registry${registryGuardsPassed ? "; source guards passed in this run" : ""}`,
    blocker: registryGuardsPassed ? undefined : "Run canonical route/non-route registry guards before treating P0 as tested",
  },
  {
    id: "P1",
    name: "shared design and interaction foundation",
    state: existsSync("src/components/v3/V3AppShell.tsx") ? "implemented" : "missing",
    evidence: "V3 AppShell/shared primitives exist; phase remains capped below parity until the complete primitive acceptance set is proven",
  },
  publicRow("P2", "identity, auth and sessions", ["authentication", "country-account"], [/^\/auth/, /^\/login/, /^\/register/], "tested"),
  {
    id: "P3",
    name: "canonical public projections",
    state: existsSync("src/lib/v3-bootstrap.ts") && existsSync("src/lib/v3-architecture.contract.test.ts") ? "tested" : "foundation",
    evidence: "Canonical bootstrap/Home/Journey/Action projection architecture and contract coverage",
    blocker: "P3 remains below parity until every canonical projection consumer is cut over",
  },
  {
    id: "P4",
    name: "Home",
    state: existsSync("src/components/v3/V3HomeScreen.tsx") && existsSync("src/lib/v3-home.test.ts") ? "tested" : "foundation",
    evidence: "V3HomeScreen + deterministic Home projection tests",
    blocker: "Home route/cutover evidence remains separate from component/projection tests",
  },
  publicRow("P5", "Explore", ["explore-root"], [/^\/explore/, /^\/editions/, /^\/countries/]),
  publicRow("P6", "Search", ["global-search"], [/^\/search/]),
  publicRow("P7", "Edition entity", ["edition-hub"], [/^\/editions/]),
  publicRow("P8", "Country", ["country-profile", "delegation-detail"], [/^\/countries/]),
  publicRow("P9", "Artist and Song", [], [/^\/artists/, /^\/songs/]),
  publicRow("P10", "Shows and public Live", ["live-show"], [/^\/shows/, /^\/show-mode/]),
  publicRow("P11", "Participate shell", ["participant-view", "participant-voting-overview"], [/^\/participate/, /^\/my-solaris\/tasks/]),
  publicRow("P12", "Confirmation", ["confirmations"], [/^\/confirmations/]),
  publicRow("P13", "Entry submission", ["entry"], [/entry/]),
  publicRow("P14", "Media", [], [/media/]),
  publicRow("P15", "Jury", ["jury"], [/^\/jury-voting/]),
  publicRow("P16", "Public Televote", ["televote"], [/^\/televoting/]),
  publicRow("P17", "Next in Line and side participation", ["next-in-line"], [/^\/next-in-line/]),
  publicRow("P18", "Fantasy", ["fantasy"], [/^\/fantasy/]),
  publicRow("P19", "Predictions and Prediction League", ["predictions"], [/^\/predictions/]),
  publicRow("P20", "Pulse", [], [/^\/pulse/]),
  publicRow("P21", "Taste DNA", [], [/taste-dna/, /taste/]),
  publicRow("P22", "Following and Saved", ["saved-items"], [/saved/, /following/]),
  publicRow("P23", "Notifications and Notices", ["official-notices", "push-delivery"], [/notifications/, /notices/]),
  publicRow("P24", "Results root", ["results"], [/^\/results/]),
  publicRow("P25", "Scorecharts", ["scoreboard"], [/scorechart/, /scoreboard/]),
  publicRow("P26", "Country breakdown and Relationships", [], [/relationships/, /country-breakdown/]),
  publicRow("P27", "Voting DNA", [], [/voting-dna/]),
  publicRow("P28", "Records", [], [/records/]),
  publicRow("P29", "Compare", [], [/compare/]),
  publicRow("P30", "Result Lab", [], [/result-lab/, /tools/]),
  publicRow("P31", "Replay", [], [/replay/]),
  publicRow("P32", "Stories", [], [/stories/]),
  publicRow("P33", "Wiki and Encyclopedia", [], [/wiki/, /encyclopedia/]),
  publicRow("P34", "Archive", [], [/archive(?!-games)/]),
  publicRow("P35", "Archive Games", [], [/archive-games/]),
  publicRow("P36", "Anniversary", [], [/anniversary/]),
  publicRow("P37", "Guide and Help", [], [/guide/, /help/]),
  publicRow("P38", "Library", [], [/library/]),
  publicRow("P39", "Rules", ["rules"], [/^\/rules/]),
  publicRow("P40", "Me", ["delegation-history", "participant-activity", "fan-public-identity"], [/^\/my-solaris/, /^\/me/]),
  publicRow("P41", "Preferences", ["push-delivery"], [/settings/, /notifications/]),
  publicRow("P42", "Account", ["country-account", "authentication"], [/account/, /^\/auth/]),
  publicRow("P43", "Country Hub", ["delegation-detail", "country-profile"], [/my-solaris\/country/, /^\/countries/]),
  publicRow("P44", "Notifications deep links", ["official-notices"], [/notifications/, /notices/], "tested"),
  {
    id: "P45",
    name: "PWA",
    state: existsSync("src/lib/v3-client-lifecycle.ts") ? "implemented" : "foundation",
    evidence: "PWA/install shell exists; safe-update/resume/offline acceptance is tracked separately from domain truth",
    blocker: "P45 standalone/update/resume/offline release matrix not certified",
  },
  {
    id: "P46",
    name: "SEO and public sharing",
    state: publicRow("P46", "SEO and public sharing", [], [/site-directory/, /share/], "tested").state,
    evidence: "Public metadata/sharing capability evidence from canonical registry; final public metadata audit remains required",
  },
  {
    id: "P47",
    name: "performance architecture",
    state: existsSync("scripts/check-client-bundle-budget.mjs") ? "tested" : "foundation",
    evidence: "Blocking client bundle budget exists in Quality CI",
    blocker: "Release field-performance evidence remains required",
  },
  {
    id: "P48",
    name: "privacy",
    state: publicSelection(["public-ux-diagnostics"], []).length ? "foundation" : "missing",
    evidence: "Privacy-bounded diagnostics capability is registered; complete P48 public/private response audit remains required",
    blocker: "No release-level private-data leakage certificate",
  },
  {
    id: "P49",
    name: "accessibility",
    state: existsSync("src/lib/v3-accessibility-error-policy.ts") || existsSync("src/lib/v3-app-shell.contract.test.ts") ? "implemented" : "foundation",
    evidence: "Accessible shell/error-state foundations exist; release verification must add keyboard/focus/reduced effects/large text evidence",
    blocker: "P49 manual + automated release accessibility evidence incomplete",
  },
  {
    id: "P50",
    name: "responsive",
    state: existsSync("src/components/v3/V3AppShell.tsx") ? "implemented" : "foundation",
    evidence: "Responsive V3 shell exists; candidate viewport/browser matrix not certified",
    blocker: "P50 exact-candidate responsive release matrix incomplete",
  },
];

const organizerRows: EvidenceRow[] = [
  {
    id: "O0",
    name: "capability inventory lock",
    state: registryGuardsPassed ? "tested" : "implemented",
    evidence: `${V3_ORGANIZER_CAPABILITY_REGISTRY.length} Organizer capabilities classified${registryGuardsPassed ? "; source guards passed in this run" : ""}`,
  },
  {
    id: "O1",
    name: "shared architecture",
    state: V3_ORGANIZER_CAPABILITY_REGISTRY.length ? "implemented" : "missing",
    evidence: "Canonical Organizer capability/domain/route ownership registry present",
  },
  organizerRow("O2", "Organizer shell", (item) => item.legacyId.startsWith("current-edition-"), "implemented"),
  organizerRow("O3", "Overview and task engine", (item) => item.legacyId === "current-edition-overview" || item.legacyId === "current-edition-tasks"),
  organizerRow("O4", "Delegations & Confirmations", (item) => item.legacyId === "current-edition-delegations" || item.legacyId.startsWith("delegation-")),
  organizerRow("O5", "Entry & Media review", (item) => item.legacyId === "current-edition-contest" || /media|entry/.test(item.legacyId)),
  organizerRow("O6", "Contest operations", (item) => item.legacyId === "current-edition-contest" || /host|storytelling|contest/.test(item.legacyId)),
  organizerRow("O7", "Voting foundation", (item) => item.legacyId === "current-edition-voting" || item.legacyId.startsWith("voting-")),
  organizerRow("O8", "Voting integrity & analytics", (item) => /voting-(integrity|jury-integrity|analytics|intelligence|audit|anti-abuse|result-integrity)/.test(item.legacyId)),
  organizerRow("O9", "Results & Publication", (item) => item.legacyId === "current-edition-results" || /publish|result/.test(item.legacyId)),
  organizerRow("O10", "Communications", (item) => /communication|notice/.test(item.legacyId)),
  organizerRow("O11", "Production & Live", (item) => /broadcast|reveal|live-review/.test(item.legacyId)),
  organizerRow("O12", "Operations & Incidents", (item) => item.legacyId.startsWith("operations-")),
  organizerRow("O13", "Governance", (item) => item.legacyId.startsWith("trust-")),
  organizerRow("O14", "Platform", (item) => /workspace-(access|administration|feature-rollout|all-editions|country-accounts|system)/.test(item.legacyId)),
  organizerRow("O15", "Engagement and editorial", (item) => /predictions|fantasy|anniversary|community/.test(item.legacyId)),
  organizerRow("O16", "Product QA", (item) => /feedback|acceptance-test|beta-coverage|public-ux/.test(item.legacyId)),
  organizerRow("O17", "Specialist labs", (item) => /lab|time-machine|command-assistant/.test(item.legacyId)),
  {
    id: "O18",
    name: "legacy retirement",
    state: V3_ORGANIZER_CAPABILITY_REGISTRY.every((item) => ["parity", "cutover", "retired"].includes(item.migrationStatus)) ? "parity" : "missing",
    evidence: `${V3_ORGANIZER_CAPABILITY_REGISTRY.filter((item) => ["planned", "building"].includes(item.migrationStatus)).length} Organizer capabilities still planned/building`,
    blocker: V3_ORGANIZER_CAPABILITY_REGISTRY.some((item) => ["planned", "building"].includes(item.migrationStatus))
      ? "Organizer capability parity is incomplete; legacy retirement is forbidden"
      : undefined,
  },
];

const liquidTabBar = "src/components/v3/V3LiquidTabBar.tsx";
const liquidCss = "src/styles/v3-liquid-tabbar.css";
const interactionPhysics = "src/lib/interaction-physics.ts";
const appShell = "src/components/v3/V3AppShell.tsx";
const topLevelSwipeSurface = "src/components/v3/V3TopLevelSwipeSurface.tsx";
const legacyPageViewport = "src/components/v3/V3PageViewport.tsx";
const hasLiquid = existsSync(liquidTabBar);
const hasVisualProgress = sourceContains(liquidTabBar, /visualProgress|navigationProgress/);
const hasPointerDrag = sourceContains(liquidTabBar, /onPointerMove|pointermove/);
const hasVelocity = sourceContains(interactionPhysics, /velocity/i);
const hasInterruptionCleanup = sourceContains(liquidTabBar, /visibilitychange|orientationchange|blur/);
const hasReducedEffects = sourceContains(liquidCss, /prefers-reduced-motion|prefers-reduced-transparency/);
const hasCanonicalTopLevelSwipeViewport =
  sourceContains(topLevelSwipeSurface, /type SwipeSlot = "previous" \| "current" \| "next"/) &&
  sourceContains(topLevelSwipeSurface, /previousSurface/) &&
  sourceContains(topLevelSwipeSurface, /nextSurface/) &&
  sourceContains(topLevelSwipeSurface, /--v3-navigation-progress/);
const hasProductionTopLevelSwipeIntegration =
  hasCanonicalTopLevelSwipeViewport &&
  sourceContains(appShell, /V3TopLevelSwipeSurface/) &&
  sourceContains(appShell, /<V3TopLevelSwipeSurface\b/);
const hasLegacyPageViewportFoundation =
  sourceContains(legacyPageViewport, /previous.*current.*next|visualProgress/s);
const hasLegacyPageViewportIntegration =
  hasLegacyPageViewportFoundation &&
  sourceContains(appShell, /V3PageViewport/) &&
  sourceContains(appShell, /<V3PageViewport\b/);
const hasPageViewport = hasProductionTopLevelSwipeIntegration || hasLegacyPageViewportIntegration;
const hasPageViewportFoundation =
  hasCanonicalTopLevelSwipeViewport || hasLegacyPageViewportFoundation || hasPageViewport;
const hasTabMemory = existsSync("src/lib/v3-tab-memory.ts") || sourceContains(appShell, /tab.*memory|scroll.*restor/i);
const referencePackage = inspectV3NavigationReferencePackage("docs/v3/navigation-reference");
const hasReferenceFreeze = referencePackage.pass;
const geometryEvidence = describeV3NavigationGeometryEvidence(hasLiquid, hasReferenceFreeze);

const navigationRows: EvidenceRow[] = [
  { id: "N0", name: "freeze reference", state: hasReferenceFreeze ? "tested" : "missing", evidence: hasReferenceFreeze ? "Frozen navigation reference package present" : "No frozen Instagram/iPhone reference package in version control", blocker: hasReferenceFreeze ? undefined : "Reference baseline is not frozen" },
  { id: "N1", name: "current bar geometry parity", ...geometryEvidence },
  { id: "N2", name: "material parity + Apple override", state: hasLiquid && existsSync(liquidCss) ? "implemented" : "foundation", evidence: hasLiquid ? "Liquid tab bar material/CSS present" : "Canonical liquid material implementation not integrated" },
  { id: "N3", name: "compact state parity", state: hasLiquid && sourceContains(liquidTabBar, /compact/) ? "implemented" : "foundation", evidence: "Scroll compaction is accepted only from the canonical liquid navigation implementation" },
  { id: "N4", name: "shared visual progress", state: hasVisualProgress ? "implemented" : "missing", evidence: hasVisualProgress ? "Continuous visual/navigation progress detected" : "No shared progress authority detected" },
  { id: "N5", name: "direct lens interaction parity", state: hasPointerDrag ? "implemented" : "missing", evidence: hasPointerDrag ? "Direct pointer/lens interaction detected" : "Direct lens drag not integrated" },
  {
    id: "N6",
    name: "top-level page viewport",
    state: hasPageViewport ? "integrated" : hasPageViewportFoundation ? "foundation" : "missing",
    evidence: hasPageViewport
      ? "Production V3AppShell mounts a live previous/current/next page viewport"
      : hasPageViewportFoundation
        ? "Swipe compositor foundation exists, but production V3AppShell activation was not detected"
        : "No canonical page viewport implementation detected",
    blocker: hasPageViewport
      ? undefined
      : "Whole-page swipe remains fail-closed until the production shell mounts safe live adjacent surfaces",
  },
  { id: "N7", name: "gesture arbitration", state: hasPageViewport && sourceContains(appShell, /gesture|horizontal|carousel/i) ? "implemented" : "missing", evidence: "Global swipe must fail closed around nested gestures and iOS back edge" },
  {
    id: "N8",
    name: "whole-page direct manipulation",
    state: hasPageViewport && hasVisualProgress
      ? "integrated"
      : hasPageViewportFoundation && hasVisualProgress
        ? "foundation"
        : "missing",
    evidence: hasPageViewport && hasVisualProgress
      ? "Production page viewport and shared navigation visual progress are both integrated"
      : "Compositor/progress primitives do not count as whole-page product integration until V3AppShell mounts them",
    blocker: hasPageViewport && hasVisualProgress
      ? undefined
      : "Production shell integration is required before whole-page direct manipulation can be credited",
  },
  { id: "N9", name: "release physics", state: hasVelocity ? "implemented" : "foundation", evidence: hasVelocity ? "Velocity-aware interaction physics detected" : "No candidate release-physics evidence" },
  { id: "N10", name: "tab memory", state: hasTabMemory ? "implemented" : "missing", evidence: hasTabMemory ? "Per-tab route/scroll memory implementation detected" : "Canonical per-tab memory not detected" },
  { id: "N11", name: "interruption hardening", state: hasInterruptionCleanup ? "implemented" : "missing", evidence: hasInterruptionCleanup ? "Blur/visibility/orientation cleanup detected" : "Interruption cleanup not integrated" },
  { id: "N12", name: "accessibility + performance", state: hasLiquid && hasReducedEffects ? "implemented" : "foundation", evidence: hasLiquid && hasReducedEffects ? "Reduced effects + semantic shell foundations detected" : "Final navigation accessibility/performance implementation incomplete" },
  { id: "N13", name: "Organizer parity", state: hasLiquid && sourceContains("src/components/admin/OrganizerV6TabBar.tsx", /rubber|velocity|liquid/i) ? "implemented" : "foundation", evidence: "Organizer must share canonical navigation physics without duplicating domain content" },
  { id: "N14", name: "final parity certification", state: "missing", evidence: `No exact-candidate Navigation certification for ${candidateSha}`, blocker: "Visual/routing/gesture/accessibility/responsive/performance regression evidence has not passed on a frozen candidate" },
];

const navigationAcceptanceRows: EvidenceRow[] = [
  { id: "geometry", name: "geometry and safe-area placement", ...geometryEvidence },
  { id: "material", name: "Liquid Glass material", state: hasLiquid && existsSync(liquidCss) ? "implemented" : "foundation", evidence: hasLiquid ? liquidCss : "Liquid parity branch not integrated" },
  { id: "lens", name: "active lens", state: hasLiquid ? "implemented" : "foundation", evidence: hasLiquid ? liquidTabBar : "No canonical liquid lens on main" },
  { id: "press", name: "press", state: hasLiquid && sourceContains(liquidTabBar, /pointerdown|press/i) ? "implemented" : "foundation", evidence: "Press response implementation signal" },
  { id: "long-press", name: "long press", state: hasLiquid && sourceContains(liquidTabBar, /hold|long/i) ? "implemented" : "missing", evidence: "Long-press deformation must not navigate accidentally" },
  { id: "drag", name: "drag", state: hasPointerDrag ? "implemented" : "missing", evidence: "Direct active-lens drag" },
  { id: "velocity-release", name: "velocity release", state: hasVelocity ? "implemented" : "foundation", evidence: interactionPhysics },
  { id: "edge-resistance", name: "edge resistance", state: hasLiquid && sourceContains(liquidTabBar, /rubber|edge/i) ? "implemented" : "missing", evidence: "First/last destination resistance" },
  { id: "scroll-compact", name: "scroll compact behavior", state: hasLiquid && sourceContains(liquidTabBar, /compact/) ? "implemented" : "foundation", evidence: "Expanded/compact morphology" },
  {
    id: "page-swipe",
    name: "page swipe",
    state: hasPageViewport && hasVisualProgress
      ? "integrated"
      : hasPageViewportFoundation && hasVisualProgress
        ? "foundation"
        : "missing",
    evidence: hasPageViewport
      ? "Live-DOM previous/current/next page composition is mounted by V3AppShell"
      : "Live-DOM compositor foundation exists but is not mounted by the production shell",
    blocker: hasPageViewport ? undefined : "Production shell activation remains intentionally fail-closed",
  },
  { id: "gesture-arbitration", name: "gesture arbitration", state: navigationRows.find((row) => row.id === "N7")?.state ?? "missing", evidence: "Nested horizontal content, vertical scroll and iOS back edge must win when appropriate" },
  { id: "route-memory", name: "route memory", state: hasTabMemory ? "implemented" : "missing", evidence: "Per-tab route/filter/scroll restoration" },
  { id: "focused-task-shell", name: "focused task shell", state: existsSync("src/components/v3/V3FocusedTaskShell.tsx") ? "implemented" : "foundation", evidence: "Critical workflows must suppress distracting global navigation" },
  { id: "keyboard", name: "keyboard", state: hasLiquid && sourceContains(liquidTabBar, /visualViewport|keyboard/i) ? "implemented" : "foundation", evidence: "Virtual-keyboard/safe-area behavior" },
  { id: "accessibility", name: "accessibility", state: hasLiquid && hasReducedEffects ? "implemented" : "foundation", evidence: "Semantic links, target size, reduced motion/transparency and focus behavior" },
  { id: "responsive", name: "responsive behavior", state: existsSync(appShell) ? "implemented" : "foundation", evidence: "Shared V3 shell responsive behavior" },
  { id: "standalone-pwa", name: "standalone PWA", state: sourceContains(appShell, /standalone|display-mode/) ? "implemented" : "foundation", evidence: "Standalone-specific shell behavior" },
  { id: "safe-updates", name: "safe updates", state: existsSync("src/lib/v3-client-lifecycle.ts") ? "implemented" : "foundation", evidence: "Critical workflows must defer unsafe activation" },
  { id: "resume", name: "resume reconciliation", state: existsSync("src/lib/v3-client-lifecycle.ts") ? "implemented" : "foundation", evidence: "Resume must refresh/reconcile canonical state" },
  { id: "offline-shell", name: "offline shell", state: existsSync("public/sw.js") || existsSync("src/sw.ts") ? "foundation" : "missing", evidence: "Offline shell is not domain authority" },
  { id: "performance", name: "performance", state: existsSync("scripts/check-client-bundle-budget.mjs") ? "tested" : "foundation", evidence: "Bundle budget exists; gesture/frame release measurements remain required" },
  { id: "visual-regression", name: "visual regression", state: existsSync(".github/workflows/browser-audit.yml") ? "foundation" : "missing", evidence: "Browser audit exists; exact navigation golden-set certification remains pending" },
];

function countStatus<T>(items: readonly T[], status: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(status(item), (counts.get(status(item)) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function table(rows: readonly EvidenceRow[]) {
  return [
    "| ID | Area | Evidence state | Objective evidence | Blocker |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map((row) =>
      `| ${row.id} | ${row.name} | **${row.state}** | ${row.evidence.replaceAll("|", "\\|")} | ${(row.blocker ?? "—").replaceAll("|", "\\|")} |`,
    ),
  ].join("\n");
}

function publicProductTable() {
  return [
    "| Capability | Capability migration | Product parity | Verification | Certification | Product evidence / blocker |",
    "| --- | --- | --- | --- | --- | --- |",
    ...publicProductReviewRows.map((row) => {
      const evidence = row.evidence.length ? row.evidence.join(", ") : row.blocker ?? "—";
      return `| ${row.capabilityId} | **${row.migrationStatus}** | **${row.productParity}** | **${row.verification}** | **${row.certification}** | ${evidence.replaceAll("|", "\\|")} |`;
    }),
  ].join("\n");
}

const blockers = [...systemRows, ...publicRows, ...organizerRows, ...navigationRows, ...navigationAcceptanceRows]
  .filter((row) => row.blocker)
  .map((row) => `${row.id} ${row.name}: ${row.blocker}`);

const payload = {
  schemaVersion: 2,
  candidateSha,
  generatedAt: new Date().toISOString(),
  registryGuardsPassed,
  system: systemRows,
  public: publicRows,
  publicProduct: publicProductReviewRows,
  organizer: organizerRows,
  navigation: navigationRows,
  navigationAcceptance: navigationAcceptanceRows,
  navigationIntegration: {
    compositorFoundation: hasCanonicalTopLevelSwipeViewport,
    productionShellIntegration: hasProductionTopLevelSwipeIntegration,
    legacyViewportFoundation: hasLegacyPageViewportFoundation,
    legacyViewportIntegration: hasLegacyPageViewportIntegration,
  },
  navigationReference: referencePackage,
  registrySummary: {
    public: Object.fromEntries(countStatus(V3_PUBLIC_CAPABILITIES, (item) => item.specificationStatus)),
    publicProductParity: Object.fromEntries(countStatus(publicProductReviewRows, (item) => item.productParity)),
    publicVerification: Object.fromEntries(countStatus(publicProductReviewRows, (item) => item.verification)),
    publicCertification: Object.fromEntries(countStatus(publicProductReviewRows, (item) => item.certification)),
    organizer: Object.fromEntries(countStatus(V3_ORGANIZER_CAPABILITY_REGISTRY, (item) => item.migrationStatus)),
    systemDomains: V3_SYSTEM_DOMAIN_REGISTRY.length,
    pendingPhysicalDomains: pendingPhysicalDomains.length,
    consequences: V3_DOMAIN_CONSEQUENCE_REGISTRY.length,
    eventBackedConsequences: eventBackedConsequences.length,
    resolvedConsequences: resolvedConsequences.length,
    readOnlyReplacements: readOnlyReplacements.length,
    unresolvedConsequences: unresolvedConsequences.length,
  },
  blockers,
};

if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
} else {
  const lines = [
    "# Solaris Studio V3 live completion dashboard",
    "",
    `- Exact SHA: \`${candidateSha}\``,
    `- Generated: ${payload.generatedAt}`,
    `- Canonical registry guards in this run: **${registryGuardsPassed ? "passed" : "not proven"}**`,
    "",
    "> Evidence states are deliberately not percentages. A later state is never inferred from route existence or an optimistic PR description.",
    "> Capability migration, product parity, verification and certification are separate facts. A cut-over route is not automatically a redesigned or certified V3 product surface.",
    "> Order: missing → foundation → implemented → integrated → tested → parity → cutover → certified.",
    "",
    "## System S0–S16",
    "",
    table(systemRows),
    "",
    "## Public P0–P50 capability migration",
    "",
    table(publicRows),
    "",
    "### Public capability registry",
    "",
    ...countStatus(V3_PUBLIC_CAPABILITIES, (item) => item.specificationStatus).map(([status, count]) => `- ${status}: **${count}**`),
    "",
    "## Public product parity / verification / certification",
    "",
    publicProductTable(),
    "",
    "### Public product evidence summary",
    "",
    ...countStatus(publicProductReviewRows, (item) => item.productParity).map(([status, count]) => `- Product parity ${status}: **${count}**`),
    ...countStatus(publicProductReviewRows, (item) => item.verification).map(([status, count]) => `- Verification ${status}: **${count}**`),
    ...countStatus(publicProductReviewRows, (item) => item.certification).map(([status, count]) => `- Certification ${status}: **${count}**`),
    "",
    "## Organizer O0–O18",
    "",
    table(organizerRows),
    "",
    "### Organizer capability registry",
    "",
    ...countStatus(V3_ORGANIZER_CAPABILITY_REGISTRY, (item) => item.migrationStatus).map(([status, count]) => `- ${status}: **${count}**`),
    "",
    "## Navigation N0–N14",
    "",
    table(navigationRows),
    "",
    "## Navigation acceptance areas",
    "",
    table(navigationAcceptanceRows),
    "",
    "### Navigation integration truth",
    "",
    `- Top-level swipe compositor foundation: **${hasCanonicalTopLevelSwipeViewport ? "present" : "missing"}**`,
    `- Production V3AppShell top-level swipe integration: **${hasProductionTopLevelSwipeIntegration ? "present" : "not detected"}**`,
    "",
    "## System registry/consequence summary",
    "",
    `- System domains: **${V3_SYSTEM_DOMAIN_REGISTRY.length}**`,
    `- Physical ownership audits pending: **${pendingPhysicalDomains.length}**`,
    `- Declared cross-domain consequences: **${V3_DOMAIN_CONSEQUENCE_REGISTRY.length}**`,
    `- Event-backed consequences: **${eventBackedConsequences.length}**`,
    `- Validated canonical read replacements: **${readOnlyReplacements.length}**`,
    `- Unresolved consequences: **${unresolvedConsequences.length}**`,
    "",
    "## Current release blockers",
    "",
    ...(blockers.length ? blockers.map((blocker) => `- ${blocker}`) : ["- No blocker was detected by this dashboard. This still does not replace S16 certification."]),
    "",
    "## Certification interpretation",
    "",
    "This dashboard is generated implementation-status evidence. It is not a release certificate. S16 remains impossible until a frozen exact SHA has passed S14 full-contest rehearsal, S15 zero-orphan audit, migration/security/production-isolation verification and the complete release matrix.",
    "",
  ];
  process.stdout.write(lines.join("\n"));
}
