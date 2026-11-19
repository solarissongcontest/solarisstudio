import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  },
}));

import { PublicEarlyAccessMe } from "@/components/public/PublicEarlyAccessMe";

describe("early-access Me produces a usable server-rendered account document", () => {
  it("shows accessible content without waiting for Supabase or app chrome", () => {
    const html = renderToStaticMarkup(<PublicEarlyAccessMe />);

    expect(html).toContain('data-public-early-access-me="true"');
    expect(html).toContain("Solaris Studio");
    expect(html).toContain("<h1");
    expect(html).toContain(">Me</h1>");
    expect(html).toContain("Opening your account");
    expect(html).toContain("Sign in manually");
    expect(html).toContain("Confirmation Editing");
    expect(html).toContain('href="/confirmations/recover"');
    expect(html).not.toContain("solaris-ambient-background");
    expect(html).not.toContain("solaris-app-toolbar");
  });
});
