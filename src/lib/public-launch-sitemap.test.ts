import { afterEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_LAUNCH_ROUTES } from "./public-launch-availability";

// Only the router registration carrier is mocked. Execute the actual GET
// handler with public-data reads disabled: no hosted SDK or network fallback.
vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options: unknown) => options }));
import { Route } from "@/routes/sitemap[.]xml";

afterEach(() => vi.unstubAllEnvs());
describe("public soft-launch sitemap", () => {
  it("indexes core contest destinations without advertising hidden or tester-only families", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    const handler = (
      Route as unknown as {
        server: { handlers: { GET: (input: { request: Request }) => Promise<Response> } };
      }
    ).server.handlers.GET;
    const response = await handler({ request: new Request("http://127.0.0.1:3000/sitemap.xml") });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/xml");
    const xml = await response.text();
    for (const path of [
      "/editions",
      "/countries",
      "/results",
      "/rules",
      "/confirmations",
      "/jury-voting",
      "/televoting",
    ]) {
      expect(xml).toContain(`<loc>http://127.0.0.1:3000${path}</loc>`);
    }
    for (const { path } of PUBLIC_LAUNCH_ROUTES) {
      expect(xml).not.toContain(`<loc>http://127.0.0.1:3000${path}</loc>`);
    }
  });
});
