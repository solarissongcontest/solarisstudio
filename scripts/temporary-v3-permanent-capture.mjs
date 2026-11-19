/**
 * Temporary Solaris V3 design-evidence capture.
 * Runs ONLY inside a disposable local Supabase + local Worker CI runner.
 * Never visits the hosted public site or any hosted Supabase endpoint.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:4173";
const base = new URL(baseUrl);
if (base.protocol !== "http:" || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(base.hostname))
  throw new Error("Permanent V3 capture refuses non-local app host");
const supabaseKeys = [
  "VITE_SUPABASE_URL","SUPABASE_URL","E2E_SUPABASE_URL",
  "VITE_CONFIRMATIONS_SUPABASE_URL","CONFIRMATIONS_SUPABASE_URL"
];
for (const key of supabaseKeys) {
  const value = process.env[key];
  if (!value) throw new Error("Missing isolated Supabase target " + key);
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1","localhost","::1","[::1]"].includes(url.hostname))
    throw new Error("Unsafe Supabase URL in capture " + key);
}
const localAllowed = new Set([base.origin, ...supabaseKeys.map(k => new URL(process.env[k]).origin)]);
const directory = "artifacts/v3-permanent-captures";
await fs.mkdir(directory,{recursive:true});
const routes = [
  "/","/explore","/participate","/results","/me",
  "/countries","/editions","/shows","/wiki","/rules",
  "/site-directory","/tools","/records","/settings",
  "/show-mode","/televoting","/jury-voting","/auth",
  "/stories","/archive","/notifications"
];
const viewports = [
  { name:"mobile-web-390", width:390, height:844, mobile:true },
  { name:"mobile-web-320", width:320, height:568, mobile:true },
  { name:"desktop-web-1440", width:1440, height:900, mobile:false },
  { name:"desktop-web-1920", width:1920, height:1080, mobile:false },
];
const browser = await chromium.launch({headless:true});
const meta = {
  provenance: { source_sha:process.env.GITHUB_SHA || null, environment:"isolated local Supabase fixture", no_production_requests:true },
  captures:[], skipped:[], blocked:[], started:new Date().toISOString()
};
function slug(s) { return s.replace(/^\/+|\/+$/g,"").replace(/[^a-z0-9_-]+/gi,"-") || "home"; }
async function shot(page, name, fullPage, info) {
  const file=path.join(directory,name+".png");
  await page.screenshot({path:file,fullPage,animations:"disabled",caret:"hide",timeout:15000});
  meta.captures.push({...info, file, fullPage});
}
for(const preset of viewports) {
  const context=await browser.newContext({
    viewport:{width:preset.width,height:preset.height},
    isMobile:preset.mobile,hasTouch:preset.mobile,
    deviceScaleFactor:1, colorScheme:"dark", reducedMotion:"reduce",
    serviceWorkers:"block",
  });
  await context.addCookies([{name:"solaris_e2e_maintenance_bypass",value:"1",url:base.origin}]);
  const page=await context.newPage();
  await page.route("**/*", async route=>{
    let requestUrl;
    try { requestUrl=new URL(route.request().url()); } catch { return route.abort(); }
    if (["about:","data:","blob:"].includes(requestUrl.protocol)) return route.continue();
    if (!localAllowed.has(requestUrl.origin)) {
      meta.blocked.push({view:preset.name,url:requestUrl.origin});
      return route.abort();
    }
    return route.continue();
  });
  const candidates=[...routes];
  // Detailed entity URLs are discovered from real local test fixtures, never guessed.
  const discovered=new Set();
  for(const current of candidates) {
    try {
      const response=await page.goto(new URL(current,base).href,{waitUntil:"domcontentloaded",timeout:15000});
      const status=response?.status()||0;
      if (status>=400||status<200) {
        meta.skipped.push({viewport:preset.name,path:current,status,reason:"Not publicly available in isolated capture"});
        continue;
      }
      await page.waitForTimeout(280);
      if(!await page.locator("main").first().isVisible().catch(()=>false)) {
        meta.skipped.push({viewport:preset.name,path:current,status,reason:"No visible main content"});
        continue;
      }
      if (["/countries","/editions","/wiki","/shows"].includes(current)) {
        const links=await page.locator('main a[href]').evaluateAll(anchors=>anchors.map(a=>a.getAttribute("href")||""));
        const first=links.find(h=>h.startsWith(current+"/")&&h.length>current.length+1&&!h.includes("?"));
        if (first && !discovered.has(first)) {discovered.add(first);candidates.push(first);}
      }
      const id=slug(current), info={viewport:preset.name,path:current,status,runtime:preset.name,source:"actual isolated test build"};
      await shot(page,preset.name+"__"+id+"__full",true,{...info,part:"full"});
      await shot(page,preset.name+"__"+id+"__top",false,{...info,part:"top"});
      const dimensions=await page.evaluate(()=>({
        scrollHeight:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight),
        innerHeight:window.innerHeight
      }));
      if (dimensions.scrollHeight>dimensions.innerHeight+150) {
        await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
        await page.waitForTimeout(200);
        await shot(page,preset.name+"__"+id+"__bottom",false,{...info,part:"bottom"});
      }
      if(["/countries","/editions","/wiki","/shows"].includes(current)) {
        const search=page.locator('main input[type="search"], main input[placeholder*="Search"], main input[placeholder*="search"]').first();
        if(await search.isVisible().catch(()=>false)) {
          await search.fill("zzzx_no_such_solaris_entity_zzzx");
          await page.waitForTimeout(300);
          await shot(page,preset.name+"__"+id+"__empty-search",false,{...info,part:"empty-search"});
          await search.fill("");
        }
      }
    } catch(e) {
      meta.skipped.push({viewport:preset.name,path:current,reason:String(e).slice(0,450)});
    }
  }
  await context.close();
}
await browser.close();
meta.finished=new Date().toISOString();
await fs.writeFile(path.join(directory,"manifest.json"),JSON.stringify(meta,null,2));
console.log("Captured "+meta.captures.length+" images; skipped "+meta.skipped.length+" views. All requests restricted to loopback.");
