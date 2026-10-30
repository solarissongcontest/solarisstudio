import {isRedirect} from "@tanstack/react-router";
import {describe,expect,it} from "vitest";
import {NAV_TARGETS} from "./navigation-targets";
const aliases = [
 ["../routes/confirmations/next-in-line", "/next-in-line"],
 ["../routes/_authenticated/admin/edition-theme.$slug", "/admin/design/$slug"],
 ["../routes/_authenticated/country-hub/hod", NAV_TARGETS.participate],
 ["../routes/_authenticated/country-hub/index", NAV_TARGETS.mySolaris],
 ["../routes/_authenticated/country-hub/notices", NAV_TARGETS.mySolarisNotices],
 ["../routes/_authenticated/country-hub/page-builder", NAV_TARGETS.mySolarisPageBuilder],
 ["../routes/_authenticated/country-hub/readiness", NAV_TARGETS.participate],
 ["../routes/_authenticated/country-hub/theme", NAV_TARGETS.mySolarisTheme],
 ["../routes/confirmations/admin/sign-in", "/auth"],
 ["../routes/integrity/report/index", "/integrity/report/category"],
 ["../routes/televoting/admin/accounts", "/admin/operations"],
 ["../routes/televoting/admin/anti-abuse", "/televoting/admin/intelligence"],
 ["../routes/televoting/admin/detection", "/televoting/admin/intelligence"],
 ["../routes/televoting/admin/friend-voting", "/admin/friend-voting"],
 ["../routes/televoting/admin/intelligence", "/admin/friend-voting"],
 ["../routes/televoting/admin/sign-in", "/auth"],
 ["../routes/televoting/admin/televote", "/televoting/admin/results"],
] as const;
async function destination(path:string,search:Record<string,string>={}) {
 const {Route}=await import(path);
 try {await Route.options.beforeLoad({search,params:{slug:"ssc31"}});throw new Error("Retired alias rendered instead of redirecting");}
 catch(error) {expect(isRedirect(error)).toBe(true);if(!isRedirect(error))throw error;return error.options;}
}
describe("retired routes keep canonical redirects without lazy null-renderer chunks",()=>{
 for(const [path,target] of aliases)it(`redirects ${path}`,async()=>{
  const result=await destination(path);expect(result.to).toBe(target);
  if(path.includes("sign-in"))expect(result.search).toEqual({redirect:"/admin/operations"});
  if(path.includes("edition-theme"))expect(result.params).toEqual({slug:"ssc31"});
 });
 it("preserves explicit Organizer country inspection without impersonating participant context",async()=>{
  const hod=await destination("../routes/_authenticated/country-hub/hod",{country:"country-id"});expect(hod.to).toBe(NAV_TARGETS.mySolarisTasks);expect(hod.search).toEqual({country:"country-id"});
  const country=await destination("../routes/_authenticated/country-hub/index",{country:"country-id"});expect(country.to).toBe(NAV_TARGETS.mySolarisCountry);expect(country.search).toEqual({country:"country-id"});
  const readiness=await destination("../routes/_authenticated/country-hub/readiness",{country:"country-id"});expect(readiness.to).toBe(NAV_TARGETS.mySolarisEntry);expect(readiness.search).toEqual({country:"country-id",view:"readiness"});
 });
 it("preserves validated notice deep links",async()=>{
  const notice=await destination("../routes/_authenticated/country-hub/notices",{notice:"notice-id",state:"unread"});expect(notice.search).toEqual({notice:"notice-id",state:"unread"});
 });
});
