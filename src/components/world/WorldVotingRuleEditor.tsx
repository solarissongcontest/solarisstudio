import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Scale, ShieldCheck } from "lucide-react";

import {
  configureWorldVotingRule, getWorldManagedInstitutions, getWorldVotingRules,
  votingRulesRolloutEnabled,
  type WorldBallotType, type WorldPublicationMode, type WorldThreshold,
  type WorldTiePolicy, type WorldVotingRule,
  type WorldVotingRuleInput, type WorldVotingRuleReceipt,
} from "@/lib/world-voting-rule-commands";

type Pending = { description: string; input: WorldVotingRuleInput };
const rejected = (error: unknown) =>
  error !== null && typeof error === "object" && "code" in error &&
  ["40001", "22023", "42501", "23514", "23505", "25006"].includes(String(error.code));
const explain = (error: unknown): string => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "The server response is uncertain. Retry the SAME operation or reload authoritative state.";
  }
  switch (String(error.code)) {
    case "40001": return "Another editor changed this rule. Refresh its current revision.";
    case "42501": return "Your current institution settings authority could not be verified.";
    case "22023": return "The rule is incomplete or unsupported by current legislative voting authority.";
    case "23514": return "The institution is no longer eligible for configuration.";
    case "25006": return "The platform has disabled new configuration mutations.";
    default: return "This operation could not be confirmed. Reconcile the exact request first.";
  }
};
const labelForBallot: Record<WorldBallotType, string> = {
  recorded_roll_call: "Published roll-call",
  restricted_roll_call: "Restricted roll-call",
  aggregate_only: "Aggregate-only legislative vote",
};
const labelForThreshold: Record<WorldThreshold, string> = {
  simple_majority: "Strict simple majority",
  fraction: "Exact fraction",
  unanimity: "Unanimous support",
};

export function WorldVotingRuleEditor() {
  const client = useQueryClient();
  const feature = useQuery({
    queryKey: ["world", "voting-rules", "enabled"],
    queryFn: votingRulesRolloutEnabled, retry: false, staleTime: 60_000,
  });
  const organizations = useQuery({
    queryKey: ["world", "voting-rules", "organizations"],
    queryFn: getWorldManagedInstitutions,
    enabled: feature.data === true, retry: false,
  });
  const [selectedId, setSelectedId] = useState("");
  const organization = organizations.data?.find((item) => item.id === selectedId)
    ?? organizations.data?.[0] ?? null;
  const rules = useQuery({
    queryKey: ["world", "voting-rules", "rule-list", organization?.id],
    queryFn: () => getWorldVotingRules(organization!.id),
    enabled: feature.data === true && Boolean(organization),
    retry: false, staleTime: 0,
  });

  const [key, setKey] = useState("legislative");
  const [label, setLabel] = useState("");
  const [ballotType, setBallotType] = useState<WorldBallotType>("recorded_roll_call");
  const [quorumNum, setQuorumNum] = useState("1");
  const [quorumDen, setQuorumDen] = useState("2");
  const [thresholdKind, setThresholdKind] = useState<WorldThreshold>("fraction");
  const [thresholdNum, setThresholdNum] = useState("2");
  const [thresholdDen, setThresholdDen] = useState("3");
  const [publicationMode, setPublicationMode] = useState<WorldPublicationMode>("after_certification");
  const [tiePolicy, setTiePolicy] = useState<WorldTiePolicy>("no_passage");
  const [prepared, setPrepared] = useState<Pending | null>(null);
  const retry = useRef<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<WorldVotingRuleReceipt | null>(null);

  const activeRule = rules.data?.find((rule) => rule.key === key) ?? null;
  function useCurrentRule(rule: WorldVotingRule) {
    if (retry.current || busy || prepared) return;
    setKey(rule.key);
    setLabel(rule.label);
    setBallotType(rule.ballotType);
    setQuorumNum(rule.quorumNumerator);
    setQuorumDen(rule.quorumDenominator);
    setThresholdKind(rule.thresholdKind);
    setThresholdNum(rule.thresholdNumerator ?? "");
    setThresholdDen(rule.thresholdDenominator ?? "");
    setPublicationMode(rule.publicationMode);
    setTiePolicy(rule.tiePolicy);
    setError(null);
  }

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization || rules.isError || rules.isLoading || retry.current || prepared || busy) {
      setError("Confirm your institution and existing rule revision before submitting.");
      return;
    }
    const normalizedKey = key.trim().toLowerCase();
    const normalizedLabel = label.trim();
    const operationId = crypto.randomUUID();
    const input: WorldVotingRuleInput = {
      organizationId: organization.id,
      key: normalizedKey,
      label: normalizedLabel,
      ballotType,
      quorumNumerator: quorumNum.trim(),
      quorumDenominator: quorumDen.trim(),
      thresholdKind,
      thresholdNumerator: thresholdKind === "fraction" ? thresholdNum.trim() : null,
      thresholdDenominator: thresholdKind === "fraction" ? thresholdDen.trim() : null,
      publicationMode, tiePolicy,
      expectedRevision: rules.data?.find((rule) => rule.key === normalizedKey)?.revision ?? 0,
      operationId, idempotencyKey: "world.voting_rule.configure:" + operationId,
    };
    const ruleSummary = thresholdKind === "fraction"
      ? thresholdNum + "/" + thresholdDen : labelForThreshold[thresholdKind];

    setError(null);
    setPrepared({
      input,
      description: "Institution: " + organization.name +
        ". Rule: " + normalizedKey +
        ". Quorum: " + quorumNum + "/" + quorumDen +
        ". Threshold: " + ruleSummary +
        ". All cast abstentions count. Ballots are locked after casting. " +
        "The previous rule version remains immutable and this configuration cannot open a vote.",
    });
  }

  async function execute(action: Pending) {
    if (busy) return;
    retry.current = action;
    setBusy(true);
    setError(null);
    try {
      const next = await configureWorldVotingRule(action.input);
      setReceipt(next);
      setPrepared(null);
      retry.current = null;
      await client.invalidateQueries({ queryKey: ["world", "voting-rules"] });
    } catch (cause) {
      setPrepared(null);
      setError(explain(cause));
      if (rejected(cause)) {
        retry.current = null;
        await client.invalidateQueries({ queryKey: ["world", "voting-rules"] });
      }
    } finally {
      setBusy(false);
    }
  }

  if (feature.isLoading) return <p role="status">Checking the Governance rollout…</p>;
  if (feature.isError || feature.data !== true) {
    return <section role="status" className="rounded-xl border border-border p-5">
      <h2 className="font-semibold">Institutional voting-rule editing is unavailable</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This workflow cannot open without server-confirmed TG8 rollout.
      </p>
      <button type="button" className="mt-3 rounded-lg border px-4 py-2"
        onClick={() => void feature.refetch()}>Recheck availability</button>
    </section>;
  }

  return <main className="mx-auto max-w-4xl space-y-7 pb-20">
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <Scale className="size-6 text-primary" aria-hidden="true" />
        <h2 className="text-2xl font-semibold">Institutional voting rules</h2>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Define exact constitutional thresholds for future institutional legislative votes.
        These rules do not open a vote, make a person eligible to vote or certify an outcome.
        Secret elections require a separate, fully verified ballot and winner-rule system.
      </p>
      {organizations.isLoading ? <p role="status">Checking managed institutions…</p> :
        organizations.isError ? <p role="alert">
          Institutional permissions cannot be verified.
          <button type="button" className="ml-2 underline" onClick={() => void organizations.refetch()}>Retry</button>
        </p> : organizations.data?.length ? <label className="block max-w-sm text-sm font-medium">
          Institution you are authorized to configure
          <select className="mt-2 w-full rounded-lg border border-border bg-background p-3"
            value={organization?.id ?? ""} disabled={busy || Boolean(prepared) || Boolean(retry.current)}
            onChange={(event) => {
              if (retry.current || prepared || busy) return;
              setSelectedId(event.target.value);
              setReceipt(null); setError(null);
            }}>
            {organizations.data.map((item) =>
              <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label> : <p role="status" className="text-sm text-muted-foreground">
          No current institution settings grants were found. Configuration is unavailable.
        </p>}
    </section>

    {error && <p role="alert" className="rounded-xl border border-destructive/60 p-3 text-sm">{error}</p>}
    {receipt && <p role="status" className="flex flex-wrap items-center gap-2 text-sm">
      <ShieldCheck className="size-5" aria-hidden="true" />
      Rule version {receipt.revision} recorded with operation
      <code className="break-all">{receipt.operationId}</code>.
    </p>}
    {retry.current && <section className="rounded-xl border border-border p-4">
      <p className="text-sm">
        The previous request might have committed. Its exact operation ID is retained.
        Do not submit another version until this operation is reconciled.
      </p>
      <button type="button" className="mt-3 rounded-lg border px-4 py-2" disabled={busy}
        onClick={() => void execute(retry.current!)}>Retry the same operation</button>
    </section>}

    {prepared && <section aria-labelledby="world-rule-confirm" className="rounded-xl border border-primary/50 p-5">
      <h3 id="world-rule-confirm" className="font-semibold">Review institutional rule change</h3>
      <p className="mt-2 text-sm">{prepared.description}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
          type="button" disabled={busy} onClick={() => void execute(prepared)}>
          Confirm recorded rule revision
        </button>
        <button type="button" disabled={busy} className="rounded-lg border px-4 py-2"
          onClick={() => setPrepared(null)}>Cancel</button>
      </div>
    </section>}

    {organization && <section className="space-y-5 border-t border-border pt-6">
      <h3 className="text-xl font-semibold">Current institutional policies</h3>
      {rules.isLoading ? <p role="status">Loading authoritative rule versions…</p> :
        rules.isError ? <p role="alert">
          Rule versions could not be verified.
          <button type="button" className="ml-2 underline" onClick={() => void rules.refetch()}>Retry</button>
        </p> :
          rules.data?.length ? <div className="grid gap-3 sm:grid-cols-2">
            {rules.data.map((rule) => <button type="button" key={rule.id}
              disabled={busy || Boolean(prepared) || Boolean(retry.current)}
              onClick={() => useCurrentRule(rule)}
              className="rounded-xl border border-border p-4 text-left hover:bg-accent disabled:opacity-50">
              <span className="block font-semibold">{rule.label}</span>
              <span className="block text-xs text-muted-foreground">
                {rule.key} · version {rule.revision} · {labelForBallot[rule.ballotType]}
              </span>
            </button>)}
          </div> :
          <p className="text-sm text-muted-foreground">
            No active rules have been configured for this institution.
          </p>}

      <form onSubmit={prepare} className="max-w-3xl space-y-4">
        <h3 className="text-lg font-semibold">{activeRule ? "Revise the existing rule" : "Configure a new rule"}</h3>
        <p className="text-sm text-muted-foreground">
          Expected current version: {activeRule?.revision ?? 0}.
          A revision appends a new immutable record rather than rewriting the old rule.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">Rule key
            <input required value={key} maxLength={80} pattern="[a-z][a-z0-9_.-]*"
              onChange={(e) => setKey(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background p-3" />
          </label>
          <label className="block text-sm font-medium">Public label
            <input required value={label} maxLength={160}
              onChange={(e) => setLabel(e.target.value)} className="mt-2 w-full rounded-lg border border-border bg-background p-3" />
          </label>
          <label className="block text-sm font-medium">Legislative ballot privacy
            <select value={ballotType} onChange={(e) => setBallotType(e.target.value as WorldBallotType)}
              className="mt-2 w-full rounded-lg border border-border bg-background p-3">
              {Object.entries(labelForBallot).map(([value, name]) =>
                <option key={value} value={value}>{name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Approval threshold
            <select value={thresholdKind} onChange={(e) => setThresholdKind(e.target.value as WorldThreshold)}
              className="mt-2 w-full rounded-lg border border-border bg-background p-3">
              {Object.entries(labelForThreshold).map(([value, name]) =>
                <option key={value} value={value}>{name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium">Quorum numerator
            <input required inputMode="numeric" value={quorumNum}
              onChange={(e) => setQuorumNum(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-background p-3" />
          </label>
          <label className="block text-sm font-medium">Quorum denominator
            <input required inputMode="numeric" value={quorumDen}
              onChange={(e) => setQuorumDen(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-background p-3" />
          </label>
          {thresholdKind === "fraction" && <>
            <label className="block text-sm font-medium">Threshold numerator
              <input required inputMode="numeric" value={thresholdNum}
                onChange={(e) => setThresholdNum(e.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-background p-3" />
            </label>
            <label className="block text-sm font-medium">Threshold denominator
              <input required inputMode="numeric" value={thresholdDen}
                onChange={(e) => setThresholdDen(e.target.value)}
                className="mt-2 w-full rounded-lg border border-border bg-background p-3" />
            </label>
          </>}
          <label className="block text-sm font-medium">Publication policy
            <select value={publicationMode}
              onChange={(e) => setPublicationMode(e.target.value as WorldPublicationMode)}
              className="mt-2 w-full rounded-lg border border-border bg-background p-3">
              <option value="after_certification">After certification</option>
              <option value="aggregate_after_certification">Only aggregate after certification</option>
              <option value="withheld">Withheld</option>
            </select>
          </label>
          <label className="block text-sm font-medium">Tie policy
            <select value={tiePolicy} onChange={(e) => setTiePolicy(e.target.value as WorldTiePolicy)}
              className="mt-2 w-full rounded-lg border border-border bg-background p-3">
              <option value="no_passage">No automatic passage</option>
              <option value="manual_review">Manual authority review</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          Abstentions are included in the approval denominator. Ballots cannot be edited
          after casting under this supported legislative policy. Quorum defaults to 1/2
          and thresholds must be exact fractions, not rounded percentages.
        </p>
        <button type="submit" disabled={busy || rules.isLoading || rules.isError || Boolean(prepared) || Boolean(retry.current)}
          className="rounded-lg bg-primary px-5 py-3 text-primary-foreground disabled:opacity-50">
          Review rule configuration
        </button>
      </form>
    </section>}
  </main>;
}
