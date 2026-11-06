import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOrganizerEntryReviewWorklist,
  matchesOrganizerEntryWorkFilter,
  matchesOrganizerEntryWorkSearch,
  type OrganizerEntryWorkResponse,
} from "./v3-organizer-entry-review-worklist";

const entry = (id = "entry-1", version = "v2") => ({
  id, artist: "Solarian", song_title: "New Horizon",
  review_status: "accepted", current_version_id: version,
  reviewed_version_id: version, content_revision: 2,
});
const row = (override: Partial<OrganizerEntryWorkResponse> = {}): OrganizerEntryWorkResponse => ({
  id: "response-1", country: "Oland", instagram_username: "oland",
  participating: true, selection_method: "internal",
  entry_unknown: false, nf_entries_unknown: false,
  internal_entries: entry(), national_finals: null,
  editions: { id: "edition-A" },
  submission_rounds: { id: "round-1", name: "Delegation confirmation", edition_id: "edition-A" },
  ...override,
});
const work = (responses: OrganizerEntryWorkResponse[]) =>
  buildOrganizerEntryReviewWorklist(responses, "edition-A");

describe("V3 Organizer candidate-level Entry Review worklist", () => {
  it("projects a current accepted internal Entry with exact version and revision", () => {
    expect(work([row()])).toMatchObject([{
      responseId: "response-1", entryId: "entry-1", revision: 2,
      status: "accepted", revised: true, outdatedReview: false, storedWinner: false,
    }]);
  });
  it("reclassifies previous acceptance or decline as needing review", () => {
    for (const priorStatus of ["accepted", "declined"]) {
      const item=work([row({internal_entries:{
        ...entry(),review_status:priorStatus,reviewed_version_id:"v1",
      }})])[0];
      expect(item.status).toBe("needs_review");
      expect(item.outdatedReview).toBe(true);
      expect(matchesOrganizerEntryWorkFilter(item,"revised")).toBe(true);
    }
  });
  it("keeps current changes-required separate from pending or accepted", () => {
    const item=work([row({internal_entries:{
      ...entry(),review_status:"declined",review_reason:"Correct title",
    }})])[0];
    expect(item.status).toBe("changes_required");
    expect(item.note).toBe("Correct title");
  });
  it("does not turn unknown internal selection data into an actionable Entry", () => {
    expect(work([row({entry_unknown:true})])).toMatchObject([{
      entryId:null,status:"awaiting_entry",artist:null,songTitle:null,
    }]);
    expect(work([row({internal_entries:null})])).toMatchObject([{
      entryId:null,status:"awaiting_entry",
    }]);
  });
  it("creates one review row per active National Final candidate without reusing internal data", () => {
    const items=work([row({
      selection_method:"national_final",internal_entries:entry("inactive"),
      national_finals:{nf_name:"Oland Song",winning_entry_id:"nf-1",
        national_final_entries:[entry("nf-1"),{
          ...entry("nf-2"),review_status:"pending",reviewed_version_id:null,
        }]},
    })]);
    expect(items).toHaveLength(2);
    expect(items.find(x=>x.entryId==="inactive")).toBeUndefined();
    expect(items.find(x=>x.entryId==="nf-1")).toMatchObject({storedWinner:true,status:"accepted"});
    expect(items.find(x=>x.entryId==="nf-2")).toMatchObject({storedWinner:false,status:"needs_review"});
  });
  it("keeps removed NF candidates historical rather than accepted", () => {
    const item=work([row({
      selection_method:"national_final",
      national_finals:{nf_name:"NF",winning_entry_id:"nf-1",
        national_final_entries:[{...entry("nf-1"),removed:true}]},
    })])[0];
    expect(item).toMatchObject({status:"withdrawn",storedWinner:false});
  });
  it("does not reuse NF candidates while the selection is unknown", () => {
    expect(work([row({
      selection_method:"national_final",nf_entries_unknown:true,
      national_finals:{winning_entry_id:"nf-1",national_final_entries:[entry("nf-1")]},
    })])).toMatchObject([{status:"awaiting_entry",entryId:null}]);
  });
  it("excludes withdrawn delegations, foreign editions and foreign rounds", () => {
    expect(work([
      row({id:"foreign",editions:{id:"edition-B"}}),
      row({id:"wrong-round",submission_rounds:{id:"B",name:"Other",edition_id:"edition-B"}}),
      row({id:"withdrawn",participating:false}),
    ])).toEqual([]);
  });
  it("shows waiting states for empty NF and undecided selection", () => {
    const items=work([
      row({id:"no-nf",selection_method:"national_final",
        national_finals:{winning_entry_id:null,national_final_entries:[]}}),
      row({id:"unselected",selection_method:null}),
    ]);
    expect(items).toHaveLength(2);
    expect(items.every(x=>x.status==="awaiting_entry"&&x.entryId===null)).toBe(true);
  });
  it("searches by country, artist and song within loaded data", () => {
    const item=work([row()])[0];
    expect(matchesOrganizerEntryWorkSearch(item,"OLAND")).toBe(true);
    expect(matchesOrganizerEntryWorkSearch(item,"Solarian")).toBe(true);
    expect(matchesOrganizerEntryWorkSearch(item,"HORIZON")).toBe(true);
    expect(matchesOrganizerEntryWorkSearch(item,"unrelated")).toBe(false);
  });
  it("filters revised Entries only when they need a new decision", () => {
    const current=work([row()])[0];
    const outdated=work([row({internal_entries:{...entry(),reviewed_version_id:"v1"}})])[0];
    expect(matchesOrganizerEntryWorkFilter(current,"revised")).toBe(false);
    expect(matchesOrganizerEntryWorkFilter(outdated,"revised")).toBe(true);
  });
  it("orders needs-review before accepted and withdrawn history", () => {
    const items=work([
      row({id:"accepted",country:"A",internal_entries:entry()}),
      row({id:"withdrawn",country:"B",internal_entries:{...entry(),removed:true}}),
      row({id:"review",country:"C",internal_entries:{...entry(),review_status:"pending"}}),
    ]);
    expect(items.map(x=>x.status)).toEqual(["needs_review","accepted","withdrawn"]);
  });
  it("reuses the existing bounded response projection and cursor", () => {
    const code=readFileSync(resolve(process.cwd(),"src/routes/confirmations/admin/responses.tsx"),"utf8");
    expect(code).toContain('setMode("entry_review")');
    expect(code).toContain('validateSearch: (search: Record<string, unknown>)');
    expect(code).toContain('const { view: mode } = Route.useSearch()');
    expect(code).toContain('void navigate({ search: { view }, replace: true })');
    expect(code).toContain("buildOrganizerEntryReviewWorklist(rows, editionId)");
    expect(code).toContain("matchesOrganizerEntryWorkFilter");
    expect(code).toContain("matchesOrganizerEntryWorkSearch");
    expect(code).toContain('mode !== "next_in_line" && responseCursor');
    expect(code).toContain("loadMoreResponses()");
    expect(code).toContain('data-v3-organizer-entry-worklist=""');
    expect(code).toContain('hash={item.entryId ? `entry-${item.entryId}` : undefined}');
    expect(code).not.toContain("admin_all_entries");
  });
});
