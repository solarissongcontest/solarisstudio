import { describe, expect, it, vi } from "vitest";

import {
  createRequestAuthenticatedSupabaseContext,
  verifyRequestAuthenticatedViewer,
  type RequestAuthenticatedSupabaseContext,
} from "./request-auth.server";

const JWT = "header.payload.signature";

function fakeContext(claims: Record<string, unknown>) {
  const getClaims = vi.fn(async (token: string) => ({
    data: { claims },
    error: null,
  }));
  return {
    context: {
      client: {
        auth: { getClaims },
      } as unknown as RequestAuthenticatedSupabaseContext["client"],
      accessToken: JWT,
    } satisfies RequestAuthenticatedSupabaseContext,
    getClaims,
  };
}

describe("Solaris request-authenticated Supabase server client", () => {
  it("creates a caller-scoped client only from publishable key + Bearer JWT", () => {
    const context = createRequestAuthenticatedSupabaseContext({
      authorization: `Bearer ${JWT}`,
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_test",
    });

    expect(context.accessToken).toBe(JWT);
    expect(context.client).toBeTruthy();
  });

  it.each([null, "", "Basic hello", "Bearer ", "Bearer not-a-jwt"])(
    "fails closed for invalid authorization %s",
    (authorization) => {
      expect(() =>
        createRequestAuthenticatedSupabaseContext({
          authorization,
          url: "https://example.supabase.co",
          publishableKey: "sb_publishable_test",
        }),
      ).toThrow(/Bearer/);
    },
  );

  it("rejects secret-key configuration for participant request context", () => {
    expect(() =>
      createRequestAuthenticatedSupabaseContext({
        authorization: `Bearer ${JWT}`,
        url: "https://example.supabase.co",
        publishableKey: "sb_secret_do_not_use_here",
      }),
    ).toThrow(/must never use a secret\/service-role key/);
  });

  it("verifies the exact supplied JWT before trusting viewer identity", async () => {
    const { context, getClaims } = fakeContext({
      sub: "user-1",
      role: "authenticated",
      email: "arthur@example.test",
      is_anonymous: false,
      user_metadata: { display_name: "Arthur" },
    });

    await expect(
      verifyRequestAuthenticatedViewer(context, "user-1"),
    ).resolves.toEqual({
      userId: "user-1",
      email: "arthur@example.test",
      displayName: "Arthur",
      role: "authenticated",
      isAnonymous: false,
    });
    expect(getClaims).toHaveBeenCalledOnce();
    expect(getClaims).toHaveBeenCalledWith(JWT);
  });

  it("fails closed when verified JWT subject does not match requested viewer scope", async () => {
    const { context } = fakeContext({
      sub: "user-other",
      role: "authenticated",
      is_anonymous: false,
    });

    await expect(
      verifyRequestAuthenticatedViewer(context, "user-expected"),
    ).rejects.toThrow(/does not match the requested viewer scope/);
  });

  it("rejects non-authenticated claims even when a subject exists", async () => {
    const { context } = fakeContext({
      sub: "user-1",
      role: "anon",
      is_anonymous: true,
    });

    await expect(verifyRequestAuthenticatedViewer(context)).rejects.toThrow(
      /does not contain an authenticated user identity/,
    );
  });

  it("never treats editable user metadata as authorization evidence", async () => {
    const { context } = fakeContext({
      sub: "user-1",
      role: "authenticated",
      is_anonymous: false,
      user_metadata: {
        display_name: "Arthur",
        role: "superadmin",
        capabilities: ["system.manage"],
      },
    });

    const viewer = await verifyRequestAuthenticatedViewer(context);
    expect(viewer.displayName).toBe("Arthur");
    expect(viewer).not.toHaveProperty("capabilities");
    expect(viewer.role).toBe("authenticated");
  });

  it("uses presentation metadata fallback without requiring it", async () => {
    const named = fakeContext({
      sub: "user-1",
      role: "authenticated",
      user_metadata: { instagram_username: "arthurssc" },
    });
    await expect(verifyRequestAuthenticatedViewer(named.context)).resolves.toMatchObject({
      displayName: "arthurssc",
    });

    const unnamed = fakeContext({
      sub: "user-1",
      role: "authenticated",
    });
    await expect(verifyRequestAuthenticatedViewer(unnamed.context)).resolves.toMatchObject({
      displayName: null,
      email: null,
    });
  });
});
