import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  hasSolarisOrganizerAccess: vi.fn(),
  countryMaybeSingle: vi.fn(),
  useFanSession: vi.fn(),
  useQuery: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
  useQuery: mocks.useQuery,
}));

vi.mock("@/integrations/supabase/access", () => ({
  hasSolarisOrganizerAccess: mocks.hasSolarisOrganizerAccess,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: mocks.getUser,
    },
    from: vi.fn((table: string) => {
      if (table !== "country_accounts") {
        throw new Error(`Unexpected table in account-access test: ${table}`);
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: mocks.countryMaybeSingle,
          })),
        })),
      };
    }),
    storage: {
      from: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prediction-data", () => ({
  useFanSession: mocks.useFanSession,
}));

vi.mock("@/lib/upload-safety", () => ({
  uploadVerifiedFile: vi.fn(),
}));

import { getCurrentAccountAccess, useMyCountryAccount } from "./country-account";

beforeEach(() => {
  mocks.getUser.mockReset();
  mocks.hasSolarisOrganizerAccess.mockReset();
  mocks.countryMaybeSingle.mockReset();
  mocks.useFanSession.mockReset();
  mocks.useQuery.mockReset();

  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.hasSolarisOrganizerAccess.mockResolvedValue(false);
  mocks.countryMaybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.useFanSession.mockReturnValue({
    data: null,
    error: null,
    isError: false,
    isLoading: false,
  });
  mocks.useQuery.mockImplementation((options) => options);
});

describe("country-account access authority", () => {
  it("returns authoritative organizer and country state when both reads succeed", async () => {
    mocks.hasSolarisOrganizerAccess.mockResolvedValue(true);
    mocks.countryMaybeSingle.mockResolvedValue({
      data: {
        country_id: "country-1",
        status: "suspended",
        suspension_reason: "review",
      },
      error: null,
    });

    await expect(getCurrentAccountAccess("user-1")).resolves.toEqual({
      userId: "user-1",
      isOrganizer: true,
      countryId: "country-1",
      countryStatus: "suspended",
      suspensionReason: "review",
      schemaReady: true,
    });
  });

  it("treats Supabase AuthSessionMissingError as ordinary verified anonymity", async () => {
    const noSession = Object.assign(new Error("Auth session missing!"), {
      name: "AuthSessionMissingError",
      status: 400,
      code: undefined,
    });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: noSession });

    await expect(getCurrentAccountAccess()).resolves.toEqual({
      userId: null,
      isOrganizer: false,
      countryId: null,
      countryStatus: null,
      suspensionReason: null,
      schemaReady: true,
    });
    expect(mocks.hasSolarisOrganizerAccess).not.toHaveBeenCalled();
    expect(mocks.countryMaybeSingle).not.toHaveBeenCalled();
  });

  it("fails closed when verified Auth identity cannot be read", async () => {
    const authError = new Error("auth authority unavailable");
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: authError });

    await expect(getCurrentAccountAccess()).rejects.toBe(authError);
    expect(mocks.hasSolarisOrganizerAccess).not.toHaveBeenCalled();
    expect(mocks.countryMaybeSingle).not.toHaveBeenCalled();
  });

  it("does not confuse server session_not_found with the client-side no-session sentinel", async () => {
    const serverSessionError = Object.assign(new Error("Session not found"), {
      name: "AuthApiError",
      status: 403,
      code: "session_not_found",
    });
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: serverSessionError });

    await expect(getCurrentAccountAccess()).rejects.toBe(serverSessionError);
  });

  it("fails closed when organizer authority cannot be read", async () => {
    const organizerError = Object.assign(new Error("organizer authority unavailable"), {
      code: "PGRST301",
    });
    mocks.hasSolarisOrganizerAccess.mockRejectedValue(organizerError);

    await expect(getCurrentAccountAccess("user-1")).rejects.toBe(organizerError);
  });

  it("fails closed on non-schema country-account read failures", async () => {
    const countryError = {
      code: "PGRST301",
      message: "country account authority unavailable",
    };
    mocks.countryMaybeSingle.mockResolvedValue({ data: null, error: countryError });

    await expect(getCurrentAccountAccess("user-1")).rejects.toBe(countryError);
  });

  it("does not mislabel permission denial as a missing schema just because the table is named", async () => {
    const permissionError = {
      code: "42501",
      message: "permission denied for table country_accounts",
    };
    mocks.countryMaybeSingle.mockResolvedValue({ data: null, error: permissionError });

    await expect(getCurrentAccountAccess("user-1")).rejects.toBe(permissionError);
  });

  it("preserves the explicit schemaReady=false compatibility state for a missing country-account schema", async () => {
    mocks.hasSolarisOrganizerAccess.mockResolvedValue(true);
    mocks.countryMaybeSingle.mockResolvedValue({
      data: null,
      error: {
        code: "42P01",
        message: 'relation "country_accounts" does not exist',
      },
    });

    await expect(getCurrentAccountAccess("user-1")).resolves.toEqual({
      userId: "user-1",
      isOrganizer: true,
      countryId: null,
      countryStatus: null,
      suspensionReason: null,
      schemaReady: false,
    });
  });

  it("preserves schemaReady=false for schema-cache column rollout gaps", async () => {
    mocks.countryMaybeSingle.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST204",
        message: "Could not find the 'suspension_reason' column of 'country_accounts' in the schema cache",
      },
    });

    await expect(getCurrentAccountAccess("user-1")).resolves.toMatchObject({
      userId: "user-1",
      schemaReady: false,
    });
  });

  it("returns a verified anonymous state when Auth returns no user and no error", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(getCurrentAccountAccess()).resolves.toEqual({
      userId: null,
      isOrganizer: false,
      countryId: null,
      countryStatus: null,
      suspensionReason: null,
      schemaReady: true,
    });
  });

  it("propagates fan-session read failure through useMyCountryAccount instead of inventing anonymity", async () => {
    const sessionError = new Error("session storage unavailable");
    mocks.useFanSession.mockReturnValue({
      data: null,
      error: sessionError,
      isError: true,
      isLoading: false,
    });

    const accountQuery = useMyCountryAccount() as unknown as {
      enabled: boolean;
      queryFn: () => Promise<unknown>;
    };

    expect(accountQuery.enabled).toBe(true);
    await expect(accountQuery.queryFn()).rejects.toBe(sessionError);
    expect(mocks.countryMaybeSingle).not.toHaveBeenCalled();
  });
});
