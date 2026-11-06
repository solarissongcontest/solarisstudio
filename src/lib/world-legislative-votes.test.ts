import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock }=vi.hoisted(()=>({rpcMock:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({
  supabase:{rpc:rpcMock},
}));
import {
  castWorldBallot, certifyWorldVote, getMyWorldVote,
  getPublishedWorldVote, listPublishedWorldVotes, openWorldVote,
  parseMyWorldVote, parseVoteReceipt, parseWorldVoteResult,
} from "./world-legislative-votes";

const voteId="11111111-1111-4111-8111-111111111111";
const countryId="22222222-2222-4222-8222-222222222222";
const measureId="33333333-3333-4333-8333-333333333333";
const ruleId="44444444-4444-4444-8444-444444444444";
const operationId="55555555-5555-4555-8555-555555555555";
const versionId="66666666-6666-4666-8666-666666666666";
const hash="a".repeat(64);

const result={
  id:voteId,organizationSlug:"guard",organName:"GAG",
  measureId,measureVersionId:versionId,
  measureTitle:"An official bill",measureIdentifier:"GAG.2026.1.OL.TOP.Bill",
  outcome:"passed",ayeCount:4,nayCount:1,abstainCount:1,
  eligibleElectorate:10,castBallots:6,resultHash:hash,
  certifiedAt:"2026-11-07T09:00:00Z",
  quorumMet:true,thresholdMet:true,ruleKey:"ordinary",
  ruleRevision:"3",quorumNumerator:"1",quorumDenominator:"2",
  thresholdKind:"simple_majority",thresholdNumerator:null,
  thresholdDenominator:null,denominatorPolicy:"all_cast_including_abstentions",
  rollCall:[{countryCode:"OL",choice:"aye"},{countryCode:"EN",choice:"abstain"}],
};
const mine={
  id:voteId,measureId,status:"open",revision:1,
  openedAt:"2026-11-07T08:00:00Z",closesAt:"2026-11-07T12:00:00Z",
  ballotType:"recorded_roll_call",ruleKey:"ordinary",
  quorumNumerator:"1",quorumDenominator:"2",
  thresholdKind:"simple_majority",thresholdNumerator:null,thresholdDenominator:null,
  countries:[{countryId,countryCode:"OL",hasCast:false,myChoice:null,canCast:true}],
};
describe("WORLD-05 TG8 canonical voting consumer",()=>{
  beforeEach(()=>rpcMock.mockReset());

  it("rejects fake or mathematically inconsistent certified read projections",()=>{
    expect(parseWorldVoteResult(result)?.outcome).toBe("passed");
    expect(parseWorldVoteResult(null)).toBeNull();
    expect(()=>parseWorldVoteResult({...result,ayeCount:5})).toThrow();
    expect(()=>parseWorldVoteResult({...result,ruleRevision:null})).toThrow();
    expect(()=>parseWorldVoteResult({...result,quorumNumerator:"1.5"})).toThrow();
    expect(()=>parseWorldVoteResult({...result,
      rollCall:[{countryCode:"OL",choice:"secret"}]})).toThrow();
  });

  it("rejects malformed own-country ballots and unsupported secret election",()=>{
    expect(parseMyWorldVote(mine)?.countries[0].canCast).toBe(true);
    expect(parseMyWorldVote(null)).toBeNull();
    expect(()=>parseMyWorldVote({...mine,ballotType:"secret_election"})).toThrow();
    expect(()=>parseMyWorldVote({...mine,countries:[{
      ...mine.countries[0],hasCast:true,myChoice:null,
    }]})).toThrow();
    expect(()=>parseMyWorldVote({...mine,countries:[{
      ...mine.countries[0],canCast:true,hasCast:true,myChoice:"aye",
    }]})).toThrow();
  });

  it("will not accept another operation ID as a receipt",()=>{
    const result={ok:true,voteId,operationId,revision:1,status:"cast"};
    const envelope={status:"succeeded",operationId,replayed:false,result};
    expect(parseVoteReceipt(envelope,operationId)).toEqual({...result,replayed:false});
    expect(()=>parseVoteReceipt(result,operationId)).toThrow();
    expect(()=>parseVoteReceipt({...envelope,operationId:countryId},operationId)).toThrow();
    expect(()=>parseVoteReceipt({...envelope,replayed:null},operationId)).toThrow();
    expect(()=>parseVoteReceipt({...envelope,result:{...result,revision:0}},operationId)).toThrow();
    expect(()=>parseVoteReceipt({...envelope,result:{...result,operationId:countryId}},operationId)).toThrow();
  });

  it("reads only from public publication-filtered RPC and bounded results",async()=>{
    rpcMock.mockResolvedValueOnce({data:[result],error:null});
    const list=await listPublishedWorldVotes(null);
    expect(list[0].outcome).toBe("passed");
    expect(rpcMock).toHaveBeenCalledWith("world_vote_public_list_v1",
      {p_organization_slug:null,p_limit:30});
    rpcMock.mockResolvedValueOnce({data:null,error:null});
    expect(await getPublishedWorldVote(voteId)).toBeNull();
    rpcMock.mockResolvedValueOnce({data:Array(31).fill(result),error:null});
    await expect(listPublishedWorldVotes(null)).rejects.toThrow("directory");
  });

  it("uses only the server's private own-ballot projection",async()=>{
    rpcMock.mockResolvedValueOnce({data:mine,error:null});
    expect((await getMyWorldVote(voteId))?.countries[0].countryCode).toBe("OL");
    expect(rpcMock).toHaveBeenCalledWith("world_vote_my_ballot_v1",{p_vote_id:voteId});
  });

  it("cannot cast without explicitly choosing an eligible frozen country",async()=>{
    const data={voteId,countryId,expectedVoteRevision:1,
      choice:"abstain" as const,operationId};
    rpcMock.mockResolvedValueOnce({data:{
      status:"succeeded",operationId,replayed:false,
      result:{ok:true,voteId,operationId,revision:1,status:"cast"},
    },error:null});
    expect((await castWorldBallot(data)).status).toBe("cast");
    expect(rpcMock).toHaveBeenCalledWith("world_cast_ballot_v1",{
      p_vote_id:voteId,p_country_id:countryId,p_expected_vote_revision:1,
      p_choice:"abstain",p_operation_id:operationId,
      p_idempotency_key:"world.vote.ballot_cast:"+operationId,
    });
    await expect(castWorldBallot({...data,countryId:"invalid"})).rejects.toThrow();
  });

  it("opens and certifies only through governed R2/R3 command + stable exact idempotency key",async()=>{
    rpcMock.mockResolvedValueOnce({data:{
      status:"succeeded",operationId,replayed:false,
      result:{ok:true,voteId,measureId,revision:1,status:"open",operationId},
    },error:null});
    expect((await openWorldVote({measureId,expectedMeasureRevision:3,ruleId,
      closesAt:"2099-01-01T10:00:00Z",operationId})).status).toBe("open");
    expect(rpcMock).toHaveBeenCalledWith("world_open_vote_v1",expect.objectContaining({
      p_measure_id:measureId,p_expected_measure_revision:3,
      p_rule_id:ruleId,p_idempotency_key:"world.vote.open:"+operationId,
    }));
    // A completed opening must still reconcile after its deadline passes.
    // The server distinguishes a replay from an invalid NEW vote window.
    rpcMock.mockResolvedValueOnce({data:{
      status:"succeeded",operationId,replayed:true,
      result:{ok:true,voteId,measureId,revision:1,status:"open",operationId},
    },error:null});
    expect((await openWorldVote({measureId,expectedMeasureRevision:3,ruleId,
      closesAt:"2020-01-01T10:00:00Z",operationId})).replayed).toBe(true);
    rpcMock.mockResolvedValueOnce({data:{
      status:"succeeded",operationId,replayed:false,
      result:{ok:true,voteId,measureId,revision:2,status:"certified",operationId,
        resultHash:hash,outcome:"passed"},
    },error:null});
    expect((await certifyWorldVote({voteId,expectedVoteRevision:1,operationId})).outcome)
      .toBe("passed");
    expect(rpcMock).toHaveBeenCalledWith("world_certify_vote_v1",{
      p_vote_id:voteId,p_expected_vote_revision:1,p_operation_id:operationId,
      p_idempotency_key:"world.vote.certify:"+operationId,
    });
  });

  it("keeps publication, proxy authorization and secret-election rejection in SQL",()=>{
    const schema=readFileSync(resolve(process.cwd(),
      "supabase/migrations/20261107130000_v3_tg8_legislative_votes.sql"),"utf8");
    const mutations=readFileSync(resolve(process.cwd(),
      "supabase/migrations/20261107130100_v3_tg8_legislative_vote_commands.sql"),"utf8");
    const projections=readFileSync(resolve(process.cwd(),
      "supabase/migrations/20261107130200_v3_tg8_legislative_vote_projections.sql"),"utf8");
    const service=readFileSync(resolve(process.cwd(),"src/lib/world-legislative-votes.ts"),"utf8");
    expect(schema).toContain("terra_world_legislative_voting',false");
    expect(schema).toContain("create table private.world_ballots");
    expect(schema).toContain("before update or delete on private.world_ballots");
    expect(schema).toContain("revoke all on private.world_ballots");
    expect(mutations).toContain("private.world_legislative_tally_v1(");
    expect(mutations).toContain("world_vote_cast_authorized_v1");
    expect(mutations).toContain("p_country_id uuid");
    expect(mutations).toContain("for share of membership,rep");
    expect(mutations).toContain("v_rule.ballot_type not in ('recorded_roll_call','restricted_roll_call','aggregate_only')");
    expect(mutations).toContain("'world.vote.certified'");
    expect(projections).toContain("vote.rule_snapshot->>'publicationMode'<>'withheld'");
    expect(projections).toContain("vote.rule_snapshot->>'ballotType'='recorded_roll_call'");
    expect(projections).toContain("private.world_vote_cast_authorized_v1");
    expect(service).not.toMatch(/\.from\(["'](?:world_votes|world_vote_results|world_vote_eligibility|world_ballots)["']\)/);
    for(const path of [
      "src/routes/world/votes/index.tsx","src/routes/world/votes/new.tsx",
      "src/routes/world/votes/$voteId/index.tsx","src/routes/world/votes/$voteId/manage.tsx",
    ]){
      const source=readFileSync(resolve(process.cwd(),path),"utf8");
      expect(source).toContain("<WorldPublicGate verifyOnMount>");
    }
  });
});
