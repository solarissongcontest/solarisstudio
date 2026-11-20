import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, UsersRound } from "lucide-react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { useAuthenticatedUser } from "@/components/auth/AuthenticatedUserContext";
import { useMyCountryAccount } from "@/lib/country-account";
import { GLOBAL_MAINTENANCE_MODE } from "@/lib/maintenance";
import {
  loadMembershipWithdrawal,
  membershipWithdrawalError,
  newMembershipWithdrawalOperation,
  withdrawWorldMembership,
  type MembershipWithdrawalOperation,
  type WithdrawalMember,
} from "@/lib/terra-governance-membership-withdrawal";

export const Route = createFileRoute("/_authenticated/world/membership/withdraw")({
  beforeLoad: () => {
    if (GLOBAL_MAINTENANCE_MODE) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Withdraw institutional membership — Solaris Studio" },
      { name: "description", content: "Confirm sovereign country withdrawal from GUARD or UNITY." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: WorldMembershipWithdrawalPage,
});

type Pending = {
  actorScope: string;
  member: WithdrawalMember;
  operation: MembershipWithdrawalOperation;
};

function WorldMembershipWithdrawalPage() {
  const user = useAuthenticatedUser();
  const account = useMyCountryAccount();
  const client = useQueryClient();
  const countryId = account.data?.access.userId === user.id
    && account.data?.access.countryStatus === "active"
    ? account.data.access.countryId : null;
  const actorScope = countryId ? user.id + ":" + countryId : null;
  const currentActorScope = useRef(actorScope);
  currentActorScope.current = actorScope;

  const snapshot = useQuery({
    queryKey: ["world", "tg5", "membership-withdrawal", user.id, countryId],
    queryFn: () => loadMembershipWithdrawal(countryId!),
    enabled: Boolean(countryId),
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  const [selected, setSelected] = useState<string | null>(null);
  const [acknowledge, setAcknowledge] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const mutation = useMutation({
    mutationFn: ({ member, operation, countryId: chosenCountry }: {
      member: WithdrawalMember;
      operation: MembershipWithdrawalOperation;
      countryId: string;
      actorScope: string;
    }) => withdrawWorldMembership({
      member, operation, countryId: chosenCountry,
    }),
    onSuccess: async (result, variables) => {
      if (variables.actorScope !== currentActorScope.current) return;
      setReceipt(
        "Confirmed at " + new Date(result.endedAt).toLocaleString()
        + ". " + result.representationsEnded + " representation(s) ended and "
        + result.proxiesRevoked + " proxy request(s)/approval(s) revoked."
      );
      setSelected(null);
      setAcknowledge(false);
      pendingRef.current = null;
      await client.invalidateQueries({
        queryKey: ["world", "tg5", "membership-withdrawal", user.id, countryId],
      });
    },
  });

  useEffect(() => {
    setSelected(null);
    setAcknowledge(false);
    setReceipt(null);
    pendingRef.current = null;
    mutation.reset();
    // Mutation identity is preserved only inside one current country session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorScope]);

  function startReview(member: WithdrawalMember) {
    if (!member.membershipId || !member.canWithdraw || mutation.isPending) return;
    pendingRef.current = null;
    setSelected(member.membershipId);
    setAcknowledge(false);
    setReceipt(null);
    mutation.reset();
  }

  function confirmWithdrawal(member: WithdrawalMember) {
    if (!countryId || !actorScope || !acknowledge || !member.membershipId
      || selected !== member.membershipId || !member.canWithdraw
      || member.requiresOfficeTransition || mutation.isPending) return;

    // Preserve the operation identity, scope and exact revision across an
    // uncertain response. A changed source record creates a new operation.
    const prior = pendingRef.current;
    const operation = prior?.actorScope === actorScope
      && prior.member.membershipId === member.membershipId
      && prior.member.revision === member.revision
      ? prior.operation : newMembershipWithdrawalOperation();
    pendingRef.current = { actorScope, member, operation };
    mutation.mutate({ countryId, actorScope, member, operation });
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Terra Solaris · Institutional membership"
        title="Withdraw membership"
        description="The authorized country controller may leave GUARD or UNITY without a vote, subject to safeguarding active institutional leadership."
      />
      <main className="mx-auto w-full max-w-3xl space-y-5 pb-20">
        <section className="flex items-start gap-3 border-b border-border pb-5">
          <ShieldCheck className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Immediate, consequential action</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              A confirmed withdrawal immediately ends your country's current institutional
              membership, voting representation, and pending or approved representation proxies.
              Current membership-based private spaces and future member voting eligibility end.
              Past votes, proceedings and membership history remain archived.
              UNITY membership will not automatically resume after a voluntary withdrawal.
            </p>
          </div>
        </section>

        {account.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Checking country controller authority…
          </p>
        ) : account.isError ? (
          <div role="alert" className="space-y-3 rounded-xl border border-border p-5">
            <p>Country authority could not be verified.</p>
            <button type="button" onClick={() => void account.refetch()}
              className="min-h-11 rounded-xl border border-border px-4 text-sm">
              Retry account check
            </button>
          </div>
        ) : !countryId ? (
          <div role="status" className="rounded-xl border border-border p-5">
            <h2 className="font-semibold">Active country controller required</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              This action is unavailable to fans, unassigned accounts, former controllers,
              suspended delegations, and users without current country authority.
            </p>
          </div>
        ) : snapshot.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Checking actual GUARD and UNITY membership records…
          </p>
        ) : snapshot.isError ? (
          <div role="alert" className="space-y-3 rounded-xl border border-border p-5">
            <p className="font-semibold">Cannot verify institutional membership</p>
            <p className="text-sm text-muted-foreground">
              {membershipWithdrawalError(snapshot.error)}
            </p>
            <button type="button" onClick={() => void snapshot.refetch()}
              className="min-h-11 rounded-xl border border-border px-4 text-sm">
              Refresh current records
            </button>
          </div>
        ) : snapshot.data ? (
          <>
            <p className="text-sm text-muted-foreground">
              Acting for <strong className="text-foreground">
                {account.data?.country?.name ?? "your authorized country"}
              </strong>. Only actual institutional membership records are shown.
            </p>
            {receipt && (
              <div role="status" className="flex gap-3 rounded-xl border border-border p-4">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <p className="text-sm">{receipt}</p>
              </div>
            )}
            <div className="divide-y divide-border border-y border-border">
              {snapshot.data.items.map((member) => {
                const isSelected = selected === member.membershipId
                  && member.membershipId !== null;
                const isCurrent = member.membershipId !== null
                  && member.endedAt === null;
                return (
                  <section key={member.organizationId} className="py-6">
                    <header className="flex items-start gap-3">
                      <UsersRound className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
                      <div>
                        <h2 className="text-lg font-semibold">{member.organizationName}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {!member.membershipId ? "No membership on record"
                            : isCurrent
                              ? "Current status: " + member.membershipStatus
                              : "Historical status: " + member.membershipStatus}
                        </p>
                        {member.joinedAt && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Joined {new Date(member.joinedAt).toLocaleDateString()}
                            {member.endedAt
                              ? " · Ended " + new Date(member.endedAt).toLocaleDateString() : ""}
                          </p>
                        )}
                      </div>
                    </header>

                    {isCurrent && member.requiresOfficeTransition ? (
                      <div role="status" className="mt-4 flex gap-3 rounded-xl border border-border p-4">
                        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden="true" />
                        <div>
                          <p className="font-semibold">Institutional office transition required</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            A current or scheduled officer is linked to this country.
                            The official resignation, acting successor and election-task
                            workflow must be resolved before withdrawal can complete.
                            The country is not silently removed from its leadership duties.
                          </p>
                        </div>
                      </div>
                    ) : isCurrent && !member.canWithdraw ? (
                      <p role="status" className="mt-4 text-sm text-muted-foreground">
                        This membership cannot be withdrawn yet. It may not be legally
                        effective or your current account may lack authority.
                      </p>
                    ) : null}

                    {member.canWithdraw && !isSelected && (
                      <button type="button" disabled={mutation.isPending}
                        onClick={() => startReview(member)}
                        className="mt-4 min-h-11 rounded-xl border border-destructive px-4 text-sm font-semibold text-destructive disabled:opacity-60">
                        Review {member.organizationName} withdrawal
                      </button>
                    )}

                    {member.canWithdraw && isSelected && (
                      <div className="mt-4 space-y-4 rounded-xl border border-destructive/60 p-5">
                        <h3 className="font-semibold">
                          Confirm sovereign withdrawal from {member.organizationName}
                        </h3>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          This is effective immediately, requires no member vote, ends
                          representation and live membership-based privileges, and
                          keeps all historical records. It cannot be undone by closing
                          this page. Rejoining requires the institution's actual process.
                        </p>
                        <label className="flex min-h-11 items-start gap-3 text-sm">
                          <input type="checkbox" checked={acknowledge}
                            disabled={mutation.isPending}
                            onChange={(event) => setAcknowledge(event.target.checked)}
                            className="mt-1 size-4 accent-primary"/>
                          <span>I understand the immediate membership and access consequences.</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled={!acknowledge || mutation.isPending}
                            onClick={() => confirmWithdrawal(member)}
                            className="min-h-11 rounded-xl border border-destructive px-4 text-sm font-semibold text-destructive disabled:opacity-60">
                            {mutation.isPending ? "Recording official withdrawal…" : "Confirm withdrawal"}
                          </button>
                          <button type="button" disabled={mutation.isPending}
                            onClick={() => {
                              setSelected(null);
                              setAcknowledge(false);
                              pendingRef.current = null;
                              mutation.reset();
                            }}
                            className="min-h-11 rounded-xl border border-border px-4 text-sm">
                            Keep membership
                          </button>
                        </div>
                        {mutation.isError && (
                          <div role="alert" className="space-y-2 text-sm">
                            <p className="text-destructive">{membershipWithdrawalError(mutation.error)}</p>
                            <button type="button" onClick={() => void snapshot.refetch()}
                              className="min-h-11 rounded-lg border border-border px-3">
                              Check authoritative membership status
                            </button>
                            <button type="button"
                              disabled={mutation.isPending || !pendingRef.current
                                || pendingRef.current.member.membershipId !== member.membershipId
                                || pendingRef.current.member.revision !== member.revision}
                              onClick={() => confirmWithdrawal(member)}
                              className="ml-2 min-h-11 rounded-lg border border-border px-3 disabled:opacity-60">
                              Retry identical withdrawal
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
            <button type="button" onClick={() => void snapshot.refetch()}
              className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold">
              Refresh membership state
            </button>
          </>
        ) : null}
      </main>
    </AppShell>
  );
}
