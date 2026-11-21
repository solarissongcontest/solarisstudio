import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const state = vi.hoisted(() => ({
  actor: "organizer" as string | null,
  query: { isSuccess: true, isFetching: false, isPending: false, isError: false, data: true },
  effects: [] as Array<() => (() => void) | void>,
  setActor: vi.fn(),
  clear: vi.fn(async () => undefined),
  getSession: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: () => [state.actor, state.setActor],
  useEffect: (effect: () => (() => void) | void) => { state.effects.push(effect); },
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => state.query }));
vi.mock("@/lib/prediction-data", () => ({ useFanSession: vi.fn() }));
vi.mock("@/lib/studio2-feature-flags", () => ({ isStudio2FeatureEnabled: vi.fn() }));
vi.mock("@/integrations/supabase/access", () => ({ hasSolarisOrganizerAccess: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: state.getSession, onAuthStateChange: state.subscribe } } }));
vi.mock("@/lib/admin-page-preview-client", () => ({ clearAdminPagePreviewSession: state.clear }));

import { PublicLaunchAvailabilityProvider } from "./PublicLaunchAvailability";
import { usePublicLaunchAvailability } from "@/lib/public-launch-context";

function Probe() {
  const access = usePublicLaunchAvailability();
  return <output data-preview={String(access.adminPreview)} data-checking={String(access.checking)}
    data-hidden={String(access.allowsReleased("/world"))} data-api={String(access.allows("/api/private"))} />;
}
function render() {
  return renderToStaticMarkup(<PublicLaunchAvailabilityProvider><Probe /></PublicLaunchAvailabilityProvider>);
}
beforeEach(() => {
  state.actor = "organizer";
  state.effects = [];
  vi.clearAllMocks();
  Object.assign(state.query, { isSuccess: true, isFetching: false, isPending: false, isError: false, data: true });
});

describe("limited-launch Organizer preview revalidation", () => {
  it("does not restore a stale initial session after logout and clears the server cookie", async () => {
    let resolve!: (value: unknown) => void;
    state.getSession.mockReturnValue(new Promise((done) => { resolve = done; }));
    let authEvent!: (event: string, session: unknown) => void;
    const unsubscribe = vi.fn();
    state.subscribe.mockImplementation((handler) => {
      authEvent = handler;
      return { data: { subscription: { unsubscribe } } };
    });
    render();
    const cleanup = state.effects[0]();
    authEvent("SIGNED_OUT", null);
    resolve({ data: { session: { user: { id: "old-organizer" } } } });
    await Promise.resolve();
    expect(state.setActor.mock.calls).toEqual([[null]]);
    expect(state.clear).toHaveBeenCalledTimes(1);
    cleanup?.();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
  it("allows verified hidden page discovery but never API access", () => {
    expect(render()).toContain('data-preview="true"');
    expect(render()).toContain('data-hidden="true"');
    expect(render()).toContain('data-api="false"');
  });
  it("withdraws cached grants during background checks and restores only after success", () => {
    state.query.isFetching = true;
    expect(render()).toContain('data-preview="false"');
    expect(render()).toContain('data-hidden="false"');
    expect(render()).toContain('data-checking="true"');
    state.query.isFetching = false;
    expect(render()).toContain('data-preview="true"');
  });
  it.each(["anonymous", "revoked", "error", "pending"])("fails closed for %s even with stale positive data", (scenario) => {
    if (scenario === "anonymous") state.actor = null;
    if (scenario === "revoked") state.query.data = false;
    if (scenario === "error") state.query.isError = true;
    if (scenario === "pending") Object.assign(state.query, { isSuccess: false, isPending: true });
    expect(render()).toContain('data-preview="false"');
    expect(render()).toContain('data-hidden="false"');
  });
});
