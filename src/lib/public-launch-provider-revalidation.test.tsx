import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const runtime = vi.hoisted(() => ({
  session: {
    data: { id: "tester" } as { id: string } | null,
    dataUpdatedAt: 1,
    isSuccess: true,
    isPending: false,
    isFetching: false,
    isError: false,
  },
  flags: {
    data: { actor: "tester", flags: { fantasy_ssc: true } } as
      | { actor: string | null; flags: { fantasy_ssc: boolean } }
      | undefined,
    isSuccess: true,
    isPending: false,
    isFetching: false,
    isError: false,
  },
  placeholderData: null as
    | null
    | ((previous: { actor: string | null; flags: { fantasy_ssc: boolean } } | undefined) => unknown),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { placeholderData?: typeof runtime.placeholderData }) => {
    runtime.placeholderData = options.placeholderData ?? null;
    return runtime.flags;
  },
}));
vi.mock("@/lib/prediction-data", () => ({
  useFanSession: () => runtime.session,
}));
vi.mock("@/lib/studio2-feature-flags", () => ({
  isStudio2FeatureEnabled: vi.fn(),
}));

import { PublicLaunchAvailabilityProvider } from "@/components/public/PublicLaunchAvailability";
import { usePublicLaunchAvailability } from "./public-launch-context";

function DecisionProbe() {
  const availability = usePublicLaunchAvailability();
  return (
    <output
      data-allowed={String(availability.allows("/fantasy"))}
      data-checking={String(availability.checking)}
      data-error={String(availability.error)}
    />
  );
}

function renderDecision() {
  return renderToStaticMarkup(
    <PublicLaunchAvailabilityProvider>
      <DecisionProbe />
    </PublicLaunchAvailabilityProvider>,
  );
}

beforeEach(() => {
  Object.assign(runtime.session, {
    data: { id: "tester" },
    dataUpdatedAt: 1,
    isSuccess: true,
    isPending: false,
    isFetching: false,
    isError: false,
  });
  Object.assign(runtime.flags, {
    data: { actor: "tester", flags: { fantasy_ssc: true } },
    isSuccess: true,
    isPending: false,
    isFetching: false,
    isError: false,
  });
  runtime.placeholderData = null;
});

describe("same-actor Public launch revalidation", () => {
  it("keeps an approved route mounted during session and flag background checks", () => {
    runtime.session.isFetching = true;
    runtime.flags.isFetching = true;
    const html = renderDecision();
    expect(html).toContain('data-allowed="true"');
    expect(html).toContain('data-checking="false"');
  });

  it("reuses a prior verdict only for the identical caller when its query key refreshes", () => {
    renderDecision();
    const prior = { actor: "tester", flags: { fantasy_ssc: true } };
    expect(runtime.placeholderData?.(prior)).toEqual(prior);
    runtime.session.data = { id: "other-account" };
    renderDecision();
    expect(runtime.placeholderData?.(prior)).toBeUndefined();
    expect(renderDecision()).toContain('data-allowed="false"');
  });

  it("fails closed on the first check, a revoked rule, or a failed refresh", () => {
    runtime.flags.data = undefined;
    runtime.flags.isSuccess = false;
    runtime.flags.isPending = true;
    expect(renderDecision()).toContain('data-allowed="false"');
    runtime.flags.data = { actor: "tester", flags: { fantasy_ssc: false } };
    runtime.flags.isSuccess = true;
    runtime.flags.isPending = false;
    expect(renderDecision()).toContain('data-allowed="false"');
    runtime.flags.data = { actor: "tester", flags: { fantasy_ssc: true } };
    runtime.flags.isError = true;
    const errorHtml = renderDecision();
    expect(errorHtml).toContain('data-error="true"');
    expect(errorHtml).toContain('data-allowed="false"');
  });
});
