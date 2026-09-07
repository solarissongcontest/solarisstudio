import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Network, Scale, ShieldCheck, Users } from "lucide-react";

import {
  AdminCard,
  AdminCardHeader,
  AdminEmptyState,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { listMergedIntegrityDeclarations } from "@/integrations/televoting/integrity-declarations.functions";
import type {
  IntegrityDeclarationRow,
  IntegrityJsonValue,
} from "@/integrations/televoting/integrity-declarations.server";

export const Route = createFileRoute("/televoting/admin/jury-integrity")({
  head: () => ({
    meta: [
      { title: "Jury Independence — Solaris Organizer" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JuryIntegrityPage,
});

type JsonObject = { [key: string]: IntegrityJsonValue };

type JuryEvidence = {
  independenceScore: number;
  risk: number;
  confidence: number;
  components: {
    history: number;
    deviation: number;
    reciprocity: number;
    coordination: number;
    network: number;
    crossChannel: number;
    persistence: number;
  };
  evidenceFamilyCount: number;
  strongEvidenceFamilies: string[];
  repeatedHistory: boolean;
  peerBallots: number;
  deviation: {
    risk: number;
    strongestTarget: string | null;
    targets: Array<{
      targetCode: string;
      currentNormalized: number;
      expectedNormalized: number;
      deviation: number;
      zScore: number;
      risk: number;
      peerCount: number;
    }>;
  };
  coordinationFingerprint: {
    risk: number;
    matchedPeers: number;
    strongestSimilarity: number;
    baselineMean: number;
    baselineSd: number;
    threshold: number;
  };
  recommendedSanctionLevel: number;
};

const object = (value: IntegrityJsonValue | undefined): JsonObject | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value : null;
const number = (value: IntegrityJsonValue | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;
const boolean = (value: IntegrityJsonValue | undefined) => value === true;
const string = (value: IntegrityJsonValue | undefined) => typeof value === "string" ? value : null;
const strings = (value: IntegrityJsonValue | undefined) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

function parseJuryEvidence(row: IntegrityDeclarationRow): JuryEvidence | null {
  const root = object(row.admin_evidence.juryIndependence);
  if (!root) return null;
  const components = object(root.components) ?? {};
  const deviation = object(root.deviation) ?? {};
  const fingerprint = object(root.coordinationFingerprint) ?? {};
  const targetsRaw = Array.isArray(deviation.targets) ? deviation.targets : [];
  const targets = targetsRaw.flatMap((item) => {
    const target = object(item);
    if (!target) return [];
    return [{
      targetCode: string(target.targetCode) ?? "?",
      currentNormalized: number(target.currentNormalized),
      expectedNormalized: number(target.expectedNormalized),
      deviation: number(target.deviation),
      zScore: number(target.zScore),
      risk: number(target.risk),
      peerCount: number(target.peerCount),
    }];
  });
  return {
    independenceScore: number(root.independenceScore),
    risk: number(root.risk),
    confidence: number(root.confidence),
    components: {
      history: number(components.history),
      deviation: number(components.deviation),
      reciprocity: number(components.reciprocity),
      coordination: number(components.coordination),
      network: number(components.network),
      crossChannel: number(components.crossChannel),
      persistence: number(components.persistence),
    },
    evidenceFamilyCount: number(root.evidenceFamilyCount),
    strongEvidenceFamilies: strings(root.strongEvidenceFamilies),
    repeatedHistory: boolean(root.repeatedHistory),
    peerBallots: number(root.peerBallots),
    deviation: {
      risk: number(deviation.risk),
      strongestTarget: string(deviation.strongestTarget),
      targets,
    },
    coordinationFingerprint: {
      risk: number(fingerprint.risk),
      matchedPeers: number(fingerprint.matchedPeers),
      strongestSimilarity: number(fingerprint.strongestSimilarity),
      baselineMean: number(fingerprint.baselineMean),
      baselineSd: number(fingerprint.baselineSd),
      threshold: number(fingerprint.threshold),
    },
    recommendedSanctionLevel: number(root.recommendedSanctionLevel),
  };
}

function JuryIntegrityPage() {
  const getDeclarations = useServerFn(listMergedIntegrityDeclarations);
  const { data = [], isLoading, error } = useQuery<IntegrityDeclarationRow[]>({
    queryKey: ["jury-independence-v5"],
    queryFn: () => getDeclarations({ data: { limit: 750, signedOnly: false } }),
    refetchInterval: 15_000,
  });

  const rows = data.flatMap((row) => {
    const evidence = parseJuryEvidence(row);
    return evidence ? [{ row, evidence }] : [];
  }).sort((a, b) => b.evidence.risk - a.evidence.risk || b.evidence.confidence - a.evidence.confidence);

  const highRisk = rows.filter(({ evidence }) => evidence.risk >= 80).length;
  const repeated = rows.filter(({ evidence }) => evidence.repeatedHistory).length;
  const strongDeviation = rows.filter(({ evidence }) => evidence.components.deviation >= 65).length;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <AdminPageHeader
        eyebrow="Voting integrity · jury"
        title="Jury Independence"
        description="Jury-specific integrity analysis compares historical HOD relationships with the rest of the independent jury field. Risk, confidence and evidence families are separate; automated analysis never changes a jury score or imposes a sanction by itself."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/televoting/admin/integrity" className="admin-action-secondary">Human moderation</Link>
            <Link to="/televoting/admin/intelligence" className="admin-action-secondary">Friend-voting intelligence</Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric icon={ShieldCheck} label="Jury v5 checks" value={rows.length} />
        <Metric icon={Activity} label="Risk 80+" value={highRisk} attention={highRisk > 0} />
        <Metric icon={Scale} label="Strong deviation" value={strongDeviation} />
        <Metric icon={Users} label="Repeated history" value={repeated} />
      </div>

      <AdminCard>
        <AdminCardHeader
          eyebrow="Evidence gates"
          title="How to read this page"
          description="A large 12-point deviation is not enough by itself. Risk above 50 requires multiple evidence families; 80+ requires repeated multi-family evidence; 90+ is reserved for persistent coordination with strong current corroboration."
        />
        <p className="text-xs leading-5 text-muted-foreground">
          The voter sees only broad categories. Exact target relationships, peer expectations, similarity thresholds and historical detail stay here for producers so the detector does not become an evasion manual.
        </p>
      </AdminCard>

      {isLoading ? (
        <AdminCard><p className="py-8 text-center text-sm text-muted-foreground">Loading jury independence evidence…</p></AdminCard>
      ) : error ? (
        <AdminCard className="!border-rose-200/15"><p className="text-sm text-rose-100">{error instanceof Error ? error.message : "Jury evidence could not be loaded."}</p></AdminCard>
      ) : rows.length ? (
        <div className="space-y-3">
          {rows.map(({ row, evidence }) => <JuryCase key={row.id} row={row} evidence={evidence} />)}
        </div>
      ) : (
        <AdminCard>
          <AdminEmptyState
            icon={ShieldCheck}
            title="No jury v5 records yet"
            description="Jury Independence evidence appears after a jury ballot reaches an integrity intervention that is retained in the declaration/review record."
          />
        </AdminCard>
      )}
    </div>
  );
}

function JuryCase({ row, evidence }: { row: IntegrityDeclarationRow; evidence: JuryEvidence }) {
  const componentEntries = Object.entries(evidence.components) as Array<[keyof JuryEvidence["components"], number]>;
  return (
    <AdminCard className="!p-4 sm:!p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-black">{row.username}</p>
            <AdminStatus tone="info">{row.country_code}</AdminStatus>
            <AdminStatus tone={evidence.risk >= 80 ? "blocked" : evidence.risk >= 50 ? "attention" : "info"}>Risk {evidence.risk}</AdminStatus>
            <AdminStatus tone={evidence.independenceScore >= 70 ? "ready" : "neutral"}>Independence {evidence.independenceScore}</AdminStatus>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{row.edition_name ? `${row.edition_name} · ` : ""}{row.round_name}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <p>Confidence <strong className="text-foreground">{evidence.confidence}/100</strong></p>
          <p className="mt-1">{evidence.evidenceFamilyCount} strong evidence families</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {componentEntries.map(([key, value]) => <Mini key={key} label={label(key)} value={`${Math.round(value)}/100`} />)}
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="admin-section-label">Expected-score deviation</p>
          <p className="mt-2 text-sm font-semibold">
            {evidence.deviation.strongestTarget ? `Strongest outlier: ${evidence.deviation.strongestTarget}` : "No scored outlier"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Compared with {evidence.peerBallots} other jury ballots in the same show.</p>
          {evidence.deviation.targets.slice(0, 4).map((target) => (
            <div key={target.targetCode} className="mt-2 grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-white/[0.06] p-2 text-xs">
              <div><strong>{target.targetCode}</strong><p className="text-muted-foreground">Given {pct(target.currentNormalized)} · peer expectation {pct(target.expectedNormalized)} · z {target.zScore}</p></div>
              <AdminStatus tone={target.risk >= 65 ? "attention" : "neutral"}>{target.risk}</AdminStatus>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="admin-section-label">Coordination fingerprint</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Mini label="Matched peers" value={String(evidence.coordinationFingerprint.matchedPeers)} />
            <Mini label="Fingerprint risk" value={`${evidence.coordinationFingerprint.risk}/100`} />
            <Mini label="Strongest similarity" value={pct(evidence.coordinationFingerprint.strongestSimilarity)} />
            <Mini label="Round threshold" value={pct(evidence.coordinationFingerprint.threshold)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {evidence.strongEvidenceFamilies.length
              ? evidence.strongEvidenceFamilies.map((family) => <AdminStatus key={family} tone="neutral">{label(family)}</AdminStatus>)
              : <span className="text-xs text-muted-foreground">No strong evidence family.</span>}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Suggested progressive level: <strong className="text-foreground">{evidence.recommendedSanctionLevel}/5</strong>. This is a review recommendation only. A producer must make and record the actual human decision.
          </p>
        </div>
      </div>
    </AdminCard>
  );
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function label(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .trim()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function Metric({ icon: Icon, label: text, value, attention = false }: { icon: typeof ShieldCheck; label: string; value: number; attention?: boolean }) {
  return <AdminCard className="!p-3"><div className="flex items-center gap-2"><Icon className={attention ? "size-4 text-amber-100" : "size-4 text-sky-100"} /><span className="text-xs text-muted-foreground">{text}</span></div><p className="mt-2 text-2xl font-black">{value}</p></AdminCard>;
}

function Mini({ label: text, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-white/[0.06] bg-black/10 p-2"><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{text}</p><p className="mt-1 text-sm font-bold">{value}</p></div>;
}
