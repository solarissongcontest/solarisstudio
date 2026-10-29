import assert from "node:assert/strict";
import { mock } from "bun:test";
let authenticated = true;
let published = true;
let foreign = false;
let failed = false;
const calls: string[] = [];
const context = { editionId: "edition", editionName: "Edition", countryId: "country", countryName: "Country", confirmationComplete: true, participantStatus: "confirmed", publicationStatus: "published", entry: null, juryMembersRequired: 1, juryMembersAssigned: 0, juryMembers: [], juryBallotSubmitted: false, unresolvedOrganizerIssues: 0 };
const client = {
 auth: { getUser: async () => ({data: {user: authenticated ? {id: "actor"} : null}, error: null}) },
 from(table: string) {
  assert.equal(table, "editions");
  const query = {select() {return query;}, eq(key: string, value: unknown) {assert.equal(key,"published");assert.equal(value,true);return query;}, order() {return query;}, then(resolve: (value: unknown) => unknown) {return Promise.resolve(resolve({data: [{id:"edition",name:"Edition",status:"active",edition_number:22,published}],error:null}));}};
  return query;
 },
 async rpc(name: string, args?: Record<string, unknown>) {
  calls.push(name);
  if(failed) return {data:null,error:new Error("backend unavailable")};
  if(name === "studio2_feature_enabled") return {data:true,error:null};
  if(name === "public_country_account_confirmation_access") return {data:{authenticated:true,country:{country_id:"country",name:"Country",short_code:"AA"},responses:[{edition_id:"foreign", submission_id:"foreign-submission"}, {edition_id:"edition",submission_id:"submission",round_id:"round",internal_entry:{id:"entry",current_version_id:"version",reviewed_version_id:"version",review_status:"accepted",artist:"Artist",song_title:"Song"}}]},error:null};
  if(name === "studio2_hod_context") {assert.deepEqual(args,{p_edition_id:"edition",p_country_id:"country"});return {data:{...context,editionId:foreign?"foreign":"edition"},error:null};}
  if(name === "v3_country_account_entry_receipt") {assert.equal(args?.p_submission_id,"submission");return {data:{found:false},error:null};}
  if(name === "v3_confirmation_entry_versions") {assert.equal(args?.p_entry_id,"entry");return {data:{versions:[{id:"version",revision:1,content:{artist:"Frozen Artist",song_title:"Frozen Song"}}]},error:null};}
  throw new Error(`Unexpected RPC: ${name}`);
 }
};
mock.module("../../src/integrations/supabase/organizer.server",()=>({getSolarisAccessTokenServer:()=>"actor-token",createSolarisAuthenticatedClientServer:()=>client}));
mock.module("../../src/integrations/confirmations/public-runtime.server",()=>({createConfirmationPublicRuntimeClient:()=>client}));
globalThis.fetch = (()=>{throw new Error("Proof forbids network");}) as typeof fetch;
const {loadCurrentV3EntryBundle:load}=await import("../../src/integrations/v3/entry-source.server");
authenticated=false; await assert.rejects(load(),/not authenticated/);assert.deepEqual(calls,[]);
authenticated=true;published=false;assert.equal((await load()).projection.state,"no-edition");assert.deepEqual(calls,[]);
published=true; const bundle=await load();assert.equal(bundle.projection.confirmation?.internalEntry?.currentVersionId,"version");assert.equal(bundle.projection.versionHistory[0].artist,"Frozen Artist");assert.equal(bundle.projection.confirmation?.receipt,null);
foreign=true;await assert.rejects(load(),/outside/);foreign=false;
failed=true;await assert.rejects(load(),/unavailable/);
console.log(JSON.stringify({passed:true,authenticated:true,publicationBoundary:true,exactScope:true,immutableVersion:true,networkAttempts:0}));
