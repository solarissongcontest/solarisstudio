import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, BellRing } from "lucide-react";
import { useMemo } from "react";

import { getCountryConfirmationAccess } from "@/lib/confirmation-country-account";
import { getPublicRounds } from "@/lib/confirmation-rounds.functions";
import { useMyCountryAccount } from "@/lib/country-account";
import {
  buildPersonalAttentionItems,
  homepagePersonalAttention,
} from "@/lib/personal-attention";
import { useFanSession } from "@/lib/prediction-data";

export function HomePersonalAttention({
  editionId,
}: {
  editionId: string | null;
}) {
  const userQuery = useFanSession();
  const countryAccountQuery = useMyCountryAccount();
  const hasCountry = Boolean(countryAccountQuery.data?.country);

  const roundsQuery = useQuery({
    enabled: Boolean(userQuery.data && hasCountry && editionId),
    queryKey: ["home-personal-attention", "rounds", editionId],
    queryFn: () => getPublicRounds(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const confirmationQuery = useQuery({
    enabled: Boolean(userQuery.data && hasCountry && editionId),
    queryKey: ["country-confirmation-access", "home-personal-attention"],
    queryFn: getCountryConfirmationAccess,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const items = useMemo(
    () =>
      homepagePersonalAttention(
        buildPersonalAttentionItems({
          editionId,
          responses: confirmationQuery.data?.responses ?? [],
          rounds: roundsQuery.data ?? [],
        }),
      ),
    [confirmationQuery.data?.responses, editionId, roundsQuery.data],
  );

  // Home is exception-driven. Anonymous users, users without a delegation,
  // loading states and completely clear accounts add no personal chrome at all.
  if (
    !userQuery.data ||
    !hasCountry ||
    !editionId ||
    roundsQuery.isLoading ||
    confirmationQuery.isLoading ||
    !items.length
  ) {
    return null;
  }

  return (
    <section
      aria-labelledby="home-personal-attention-title"
      className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.055] p-3 sm:p-4"
    >
      <div className="flex items-center gap-2">
        <BellRing className="size-4 text-amber-200" aria-hidden="true" />
        <h2
          id="home-personal-attention-title"
          className="text-xs font-black uppercase tracking-[0.14em] text-amber-100"
        >
          For you
        </h2>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {items.map((item) => (
          <Link
            key={item.id}
            to={item.to as any}
            search={item.search as any}
            className="flex min-w-0 items-start gap-3 rounded-xl border border-amber-300/15 bg-background/35 p-3 transition hover:border-amber-300/35 hover:bg-background/50"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-300/10 text-amber-200">
              <AlertTriangle className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{item.title}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                {item.description}
              </span>
              <span className="mt-2 inline-block text-xs font-semibold text-primary">
                {item.actionRequired ? "Review and continue →" : "Review →"}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
