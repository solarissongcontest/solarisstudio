import { describe, expect, it } from "vitest";
import { juryAllocationError, juryConfigurationError } from "./jury-ballot-validation";

// Synthetic SSC22-shaped semi-finals: these are NOT SSC22's official roster or scale.
const semi1 = { pointScale: [12,10,8,7,6,5,4,3,2,1], participantIds: Array.from({length: 11}, (_, i) => `synthetic-sf1-${i}`), countryId: "synthetic-sf1-0", allowSelfVote: false };
const ballot = semi1.pointScale.map((points, i) => ({ points, target_country_id: semi1.participantIds[i + 1] }));
describe("synthetic SSC22 semi-final ballot preflight", () => {
  it("accepts all ten distinct scores for ten eligible recipients", () => expect(juryAllocationError({...semi1, entries: ballot})).toBeNull());
  it("rejects ten scores for nine eligible recipients", () => expect(juryConfigurationError({...semi1, participantIds: semi1.participantIds.slice(0,10)})).toMatch(/fewer eligible/));
  it.each([[], [12,12], [NaN], [1.5], [-1], [Infinity]])("rejects invalid scales %j", (...scale) => expect(juryConfigurationError({...semi1, pointScale: scale as number[]})).not.toBeNull());
  it("rejects duplicate targets, duplicate scores, missing scores and nonparticipants", () => {
    for (const entries of [[ballot[0], ...ballot.slice(0,9)], ballot.map(e=>({...e,points:12})), ballot.slice(1), ballot.map(e=>({...e,target_country_id:'synthetic-sf2-1'}))]) expect(juryAllocationError({...semi1,entries})).not.toBeNull();
  });
  it("enforces self-voting rules", () => {
    const entries = [{...ballot[0], target_country_id: semi1.countryId}, ...ballot.slice(1)];
    expect(juryAllocationError({...semi1,entries})).toMatch(/own country/);
    expect(juryAllocationError({...semi1,entries,allowSelfVote:true})).toBeNull();
  });
  it("counts distinct recipients rather than duplicate roster rows", () => expect(juryConfigurationError({...semi1,participantIds:Array(11).fill('same')})).not.toBeNull());
});
