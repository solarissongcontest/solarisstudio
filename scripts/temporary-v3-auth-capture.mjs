/**
 * Local-only screenshot evidence for authenticated Solaris V3 Organizer and
 * delegation experiences. Never uses production accounts or hosted Supabase.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
const base = new URL(process.env.E2E_BASE_URL || "http://127.0.0.1:4173");
const db = new URL(process.env.E2E_SUPABASE_URL || "");
const key = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const isLoopback = (url) => url.protocol==="http:" && ["127.0.0.1","localhost","::1","[::1]"].includes(url.hostname);
if (!isLoopback(base)||!isLoopback(db)||!key) throw new Error("Refusing non-loopback visual audit");
const supabaseKeys=["SUPABASE_URL","VITE_SUPABASE_URL","E2E_SUPABASE_URL","CONFIRMATIONS_SUPABASE_URL","VITE_CONFIRMATIONS_SUPABASE_URL"];
for(const item of supabaseKeys){if(!process.env[item]||!isLoopback(new URL(process.env[item])))throw new Error("Unsafe/missing test target "+item);}
const allow=new Set([base.origin,...supabaseKeys.map(k=>new URL(process.env[k]).origin)]);
const directory="artifacts/v3-permanent-auth-captures";
await fs.mkdir(directory,{recursive:true});
const personas=[
 {id:"organizer",email:process.env.E2E_ORGANIZER_EMAIL,password:process.env.E2E_ORGANIZER_PASSWORD,routes:[
  "/admin/ssc22","/admin/tasks","/admin/operations","/admin/countries",
  "/confirmations/admin","/confirmations/admin/sync","/admin/entries/ssc22",
  "/admin/shows/ssc22","/admin/voting-system/ssc22","/televoting/admin",
  "/admin/results","/admin/results-reveal","/admin/publication/ssc22",
  "/admin/communications","/admin/incidents","/admin/access-permissions",
  "/admin/sync-health","/admin/system","/admin/more","/admin/design/ssc22",
  "/admin/fantasy","/admin/time-machine","/admin/command-assistant",
  "/admin/control-room","/admin/guide","/admin/inbox","/admin/action-centre",
  "/admin/feature-rollout","/admin/integrity-investigations","/admin/status",
  "/admin/system-operations","/admin/media-assets"]},
 {id:"delegation",email:process.env.E2E_COUNTRY_EMAIL,password:process.env.E2E_COUNTRY_PASSWORD,routes:[
  "/","/participate","/me","/my-solaris/tasks","/my-solaris/entry",
  "/my-solaris/history","/my-solaris/saved","/settings","/notifications",
  "/jury-voting","/televoting","/confirmations","/countries/BRW"]},
];
const viewports=[{id:"phone-390",width:390,height:844},{id:"desktop-1440",width:1440,height:900}];
const manifest={source:"current V3 source, local isolated fixture",capture_utc:new Date().toISOString(),screenshots:[],skipped:[],blocked_origins:{}};
const browser=await chromium.launch({headless:true});
function slug(s){return s.replace(/^\/+|\/+$/g,"").replace(/[^a-z0-9_-]+/gi,"-")||"home"}
async function authenticatedSession(email,password){
 if(!email||!password)throw new Error("Local seeded actor account missing");
 const res=await fetch(new URL("/auth/v1/token?grant_type=password",db),{method:"POST",headers:{"apikey":key,"Content-Type":"application/json"},body:JSON.stringify({email,password})});
 if(!res.ok)throw new Error("Isolated actor authentication failed with "+res.status);
 return await res.json();
}
async function screenshot(page,preset,persona,route,part,fullPage){
 const dest=path.join(directory,preset.id+"__"+persona.id+"__"+slug(route)+"__"+part+".png");
 await page.screenshot({path:dest,fullPage,animations:"disabled",caret:"hide",timeout:15000});
 manifest.screenshots.push({file:dest,viewport:preset.id,persona:persona.id,route,part});
}
for(const persona of personas){
 const session=await authenticatedSession(persona.email,persona.password);
 const tokenKey="sb-"+db.hostname.split(".")[0]+"-auth-token";
 for(const preset of viewports){
  const context=await browser.newContext({viewport:{width:preset.width,height:preset.height},colorScheme:"dark",reducedMotion:"reduce",serviceWorkers:"block"});
  await context.addCookies([{name:"solaris_e2e_maintenance_bypass",value:"1",url:base.origin}]);
  await context.addInitScript(({k,s})=>localStorage.setItem(k,JSON.stringify(s)),{k:tokenKey,s:session});
  const page=await context.newPage();
  await page.route("**/*",async r=>{
    let target;try{target=new URL(r.request().url());}catch{return r.abort();}
    if(["about:","data:","blob:"].includes(target.protocol)||allow.has(target.origin))return r.continue();
    manifest.blocked_origins[target.origin]=(manifest.blocked_origins[target.origin]||0)+1;
    return r.abort();
  });
  for(const route of persona.routes){
   try{
    const resp=await page.goto(new URL(route,base).href,{waitUntil:"domcontentloaded",timeout:15000});
    const status=resp?.status()||0;
    await page.waitForTimeout(400);
    if(status>=400||status<200||page.url().includes("/auth?")||new URL(page.url()).pathname==="/auth" ||
       !await page.locator("main").first().isVisible().catch(()=>false)){
      manifest.skipped.push({persona:persona.id,viewport:preset.id,route,status,redirect:new URL(page.url()).pathname});
      continue;
    }
    await screenshot(page,preset,persona,route,"full",true);
    await screenshot(page,preset,persona,route,"top",false);
    const needsBottom=await page.evaluate(()=>document.documentElement.scrollHeight>window.innerHeight+150);
    if(needsBottom){await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(130);await screenshot(page,preset,persona,route,"bottom",false);}
   }catch(e){manifest.skipped.push({persona:persona.id,viewport:preset.id,route,error:String(e).slice(0,300)});}
  }
  await context.close();
 }
}
await browser.close();
await fs.writeFile(path.join(directory,"manifest.json"),JSON.stringify(manifest,null,2));
console.log("Captured "+manifest.screenshots.length+" authenticated Organizer/delegation screenshots; skipped "+manifest.skipped.length+" routes");
