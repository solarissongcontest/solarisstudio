import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({ useQuery: queryMock }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(() => { throw new Error("Unexpected Supabase I/O"); }) },
}));

import { WorldBodyOfficePager } from "./WorldBodyOfficePager";

const organization = {
  id: "org-1", slug: "guard", shortName: "GUARD",
  officialName: "Global Union", status: "active",
};
const body = {
  id: "body-1", organizationId: "org-1", slug: "gag",
  name: "General Assembly", shortName: "GAG",
  type: "assembly", description: null,
  status: "active" as const, sortOrder: 1,
};
const office = {
  id: "office-1", organizationId: "org-1", organId: "body-1",
  title: "Chairperson", officeType: "leadership",
};
function render(online = true) {
  return renderToStaticMarkup(
    <WorldBodyOfficePager
      organization={organization} body={body}
      verificationVersion={123} online={online}
    />,
  );
}
function useVerifiedData(total: number, offices = [office]) {
  queryMock.mockReturnValue({
    data: { offices, total, page: 0 },
    isSuccess: true, isError: false, isPending: false,
    isFetching: false, isFetchedAfterMount: true,
    isRefetchError: false,
  });
}

beforeEach(() => { vi.clearAllMocks(); });

describe("TG3 published body-office pager UI", () => {
  it("renders a verified public office and count with keyboard-reachable page controls", () => {
    useVerifiedData(21, Array.from({ length: 20 }, (_, index) => ({ ...office, id: "o-" + index })));
    const html = render();
    expect(html).toContain("Showing 1–20 of 21 offices");
    expect(html).toContain("Chairperson");
    expect(html).toContain('aria-label="Public office pages"');
    expect(html).toContain(">Next</button>");
    expect(html).toContain(">Previous</button>");
    const key = queryMock.mock.calls[0][0].queryKey;
    expect(key).toEqual(["world", "public", "body-offices-paged", "org-1", "body-1", 123, 0]);
    expect(queryMock.mock.calls[0][0].refetchOnMount).toBe("always");
    expect(queryMock.mock.calls[0][0].retry).toBe(false);
  });

  it("shows verified empty state without a misleading page navigator", () => {
    useVerifiedData(0, []);
    const html = render();
    expect(html).toContain("No active public offices are recorded.");
    expect(html).not.toContain('aria-label="Public office pages"');
  });

  it("does not show cached office records when offline, even with a successful cache snapshot", () => {
    useVerifiedData(1);
    const html = render(false);
    expect(html).toContain("Reconnect to verify published offices");
    expect(html).not.toContain("Chairperson");
    expect(queryMock.mock.calls[0][0].enabled).toBe(false);
  });

  it("hides old office content while background publication verification is fetching", () => {
    queryMock.mockReturnValue({
      data: { offices: [office], total: 1, page: 0 },
      isSuccess: true, isError: false, isPending: false,
      isFetching: true, isFetchedAfterMount: true,
      isRefetchError: false,
    });
    const html = render();
    expect(html).toContain("Checking public offices");
    expect(html).not.toContain("Chairperson");
    expect(queryMock.mock.calls[0][0]).not.toHaveProperty("placeholderData");
  });

  it("hides previously cached records on refetch error and offers retry", () => {
    queryMock.mockReturnValue({
      data: { offices: [office], total: 1, page: 0 },
      isSuccess: false, isError: true, isPending: false,
      isFetching: false, isFetchedAfterMount: true,
      isRefetchError: true, refetch: vi.fn(),
    });
    const html = render();
    expect(html).toContain("Public office records could not be verified");
    expect(html).toContain("Retry office records");
    expect(html).not.toContain("Chairperson");
  });

  it("does not trust a cached success before the current mount has verified publication", () => {
    queryMock.mockReturnValue({
      data: { offices: [office], total: 1, page: 0 },
      isSuccess: true, isError: false, isPending: false,
      isFetching: false, isFetchedAfterMount: false,
      isRefetchError: false,
    });
    const html = render();
    expect(html).toContain("Checking public offices");
    expect(html).not.toContain("Chairperson");
  });
});
