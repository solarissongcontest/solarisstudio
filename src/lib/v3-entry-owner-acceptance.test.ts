import {execFileSync} from "node:child_process";
import {expect,it} from "vitest";
it("executes the real private Entry source with bounded canonical identities and no network",()=>{
 const proof=JSON.parse(execFileSync(process.execPath,["--env-file=/dev/null","run","scripts/fixtures/v3-entry-owner-proof.ts"],{encoding:"utf8",env:process.env}));
 expect(proof).toEqual({passed:true,authenticated:true,publicationBoundary:true,exactScope:true,immutableVersion:true,networkAttempts:0});
});
