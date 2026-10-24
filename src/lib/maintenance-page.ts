import {
  MAINTENANCE_LAST_UPDATED,
  MAINTENANCE_RETURN_DATE,
  TERRAOS3_ESTIMATED_LAUNCH_AT,
} from "./maintenance";
import { getTerraOsPublicReadiness } from "./terraos-release-readiness";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const PREVIEW_SCREENS = [
  ["home", "Home", "What matters now."],
  ["explore", "Explore", "Discover Solaris."],
  ["participate", "Participate", "Know what needs you."],
  ["results", "Results", "See what happened."],
  ["me", "Me", "Your Solaris."],
] as const;

type PreviewScreen = (typeof PREVIEW_SCREENS)[number][0];

function previewFrame(screen: PreviewScreen, title: string, loading: "eager" | "lazy" = "lazy") {
  return `<iframe class="terra-preview-frame" src="/terraos-teaser-preview?screen=${screen}&chrome=content" title="${escapeHtml(title)}" tabindex="-1" loading="${loading}" scrolling="no" sandbox="allow-scripts allow-same-origin"></iframe>`;
}

function galleryMarkup() {
  return PREVIEW_SCREENS.map(
    ([screen, title, description], index) => `
      <article class="look-card look-card-${screen}" data-look-card>
        <div class="look-copy">
          <span class="look-index">0${index + 1}</span>
          <h3>${title}</h3>
          <p>${description}</p>
        </div>
        <div class="look-preview" aria-hidden="true">
          ${previewFrame(screen, `TerraOS ${title} preview`)}
        </div>
      </article>`,
  ).join("");
}

function featureChapter(options: {
  id: string;
  screen: PreviewScreen;
  kicker: string;
  title: string;
  copy: string;
  tone: "now" | "participate" | "explore" | "results" | "me";
  reverse?: boolean;
  art?: string;
}) {
  const art = options.art
    ? `<img class="feature-art" src="${options.art}" alt="" aria-hidden="true" loading="lazy" />`
    : "";
  return `
    <section class="feature-chapter feature-${options.tone}${options.reverse ? " feature-reverse" : ""}" id="${options.id}" aria-labelledby="${options.id}-title">
      ${art}
      <div class="feature-inner">
        <div class="feature-copy scroll-in">
          <p class="section-kicker">${options.kicker}</p>
          <h2 id="${options.id}-title">${options.title}</h2>
          <p>${options.copy}</p>
        </div>
        <div class="feature-preview-shell scroll-in" aria-label="TerraOS ${options.screen} preview">
          ${previewFrame(options.screen, `TerraOS ${options.screen} feature preview`)}
        </div>
      </div>
    </section>`;
}

export function renderMaintenancePage(now: Date = new Date()): string {
  const returnDate = escapeHtml(MAINTENANCE_RETURN_DATE);
  const updated = escapeHtml(MAINTENANCE_LAST_UPDATED);
  const launchAt = escapeHtml(TERRAOS3_ESTIMATED_LAUNCH_AT);
  const estimatedLaunchMs = Date.parse(TERRAOS3_ESTIMATED_LAUNCH_AT);
  const estimateStillFuture = Number.isFinite(estimatedLaunchMs) && estimatedLaunchMs > now.getTime();
  const readiness = getTerraOsPublicReadiness();
  const readinessStage = escapeHtml(readiness.stage);
  const arrivalMarkup = estimateStillFuture
    ? `<span class="arrival-label">Estimated arrival</span><strong>${returnDate}</strong>`
    : `<strong>TerraOS 3 is being prepared.</strong>`;

  return `<!doctype html>
<html lang="en" data-terraos-launch-at="${launchAt}" data-terraos-readiness="${readiness.percent}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#000000" />
  <meta name="color-scheme" content="dark" />
  <meta name="application-name" content="Solaris Studio" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Solaris Studio" />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="icon" href="/favicon.ico?v=img2340-20260929" sizes="any" />
  <link rel="icon" type="image/png" href="/icon-192.png?v=img2340-20260929" sizes="192x192" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=img2340-20260929" sizes="180x180" />
  <link rel="manifest" href="/site.webmanifest?v=img2340-20260929" />
  <title>TerraOS 3 — Solaris Studio</title>
  <style>
    @font-face { font-family:"Classica Crastao"; src:url("https://raw.githubusercontent.com/solarissongcontest/ssc-confirmations/main/public/classicacrastao-m2pj5.ttf") format("truetype"); font-display:swap; }
    @font-face { font-family:"Gotham"; src:url("https://raw.githubusercontent.com/solarissongcontest/ssc-confirmations/main/public/Gotham%20Book.otf") format("opentype"); font-weight:400; font-display:swap; }
    @font-face { font-family:"Gotham"; src:url("https://raw.githubusercontent.com/solarissongcontest/ssc-confirmations/main/public/Gotham%20Medium.otf") format("opentype"); font-weight:500; font-display:swap; }
    @font-face { font-family:"Gotham"; src:url("https://raw.githubusercontent.com/solarissongcontest/ssc-confirmations/main/public/Gotham%20Bold.otf") format("opentype"); font-weight:700; font-display:swap; }

    :root {
      color-scheme:dark;
      --bg:#000;
      --fg:#f5f5f7;
      --muted:rgba(245,245,247,.68);
      --muted-soft:rgba(245,245,247,.48);
      --primary:#79ddff;
      --ink:#17171a;
      --paper:#f5f5f7;
      --wide:1400px;
      --content:1120px;
      font-family:"Gotham",ui-sans-serif,system-ui,sans-serif;
      background:#000;
      color:var(--fg);
    }
    * { box-sizing:border-box; }
    html { min-height:100%; scroll-behavior:smooth; background:#000; }
    body { margin:0; min-width:320px; min-height:100%; overflow-x:clip; background:#000; color:var(--fg); }
    button,a,input { font:inherit; }
    a { color:inherit; }
    img { display:block; max-width:100%; }
    h1,h2,h3,p { overflow-wrap:anywhere; }
    .content { min-height:100vh; overflow-x:clip; background:#000; }
    .terra-wordmark,.product-name span,#maintenance-title,#finale-title { font-family:"Classica Crastao",Georgia,serif; font-weight:400; }
    .section-kicker,.hero-kicker { margin:0 0 .85rem; color:#75ddff; font-size:.78rem; font-weight:700; letter-spacing:.16em; text-transform:uppercase; }

    .product-bar { position:fixed; z-index:100; top:max(.7rem,env(safe-area-inset-top)); left:50%; width:min(calc(100% - 1.5rem),1180px); min-height:3.35rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.55rem .68rem .55rem 1rem; transform:translateX(-50%); border:1px solid rgba(255,255,255,.1); border-radius:1.3rem; background:rgba(8,13,22,.64); box-shadow:0 15px 44px rgba(0,0,0,.2),inset 0 1px 0 rgba(255,255,255,.06); -webkit-backdrop-filter:blur(24px) saturate(150%); backdrop-filter:blur(24px) saturate(150%); transition:background .25s ease,border-color .25s ease,box-shadow .25s ease; }
    .product-bar[data-scrolled="true"] { background:rgba(13,17,25,.88); border-color:rgba(255,255,255,.16); box-shadow:0 18px 54px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.08); }
    .product-name { display:flex; align-items:center; gap:.65rem; min-width:0; font-size:1rem; text-decoration:none; }
    .product-name span { font-size:1.15rem; letter-spacing:-.025em; }
    .product-mark { width:1.45rem; height:1.45rem; border-radius:.42rem; object-fit:cover; }
    .product-links { display:flex; align-items:center; gap:.1rem; }
    .product-links a { min-height:2.35rem; display:inline-flex; align-items:center; padding:0 .8rem; border-radius:999px; color:rgba(255,255,255,.72); font-size:.73rem; font-weight:600; text-decoration:none; }
    .product-links a:hover { color:#fff; background:rgba(255,255,255,.07); }
    .product-links .confirmation-link { color:#08111e; background:#eefaff; }

    .hero { --hero-progress:0; position:relative; overflow:clip; isolation:isolate; min-height:100svh; padding:clamp(8rem,13vh,10.5rem) max(1.25rem,5vw) clamp(4rem,8vh,6rem); background:radial-gradient(circle at 68% 35%,rgba(44,177,255,.15),transparent 25rem),radial-gradient(circle at 90% 62%,rgba(134,78,255,.14),transparent 28rem),#000; }
    .hero::before { content:""; position:absolute; z-index:-2; inset:0; background:url('/solaris-background.webp') center/cover no-repeat; opacity:.18; filter:saturate(1.15) contrast(1.08); }
    .hero::after { content:""; position:absolute; z-index:-1; inset:0; background:linear-gradient(90deg,rgba(0,0,0,.92) 0 28%,rgba(0,0,0,.52) 58%,rgba(0,0,0,.7)),linear-gradient(180deg,rgba(0,0,0,.16),#000 96%); }
    .hero-grid { width:min(100%,var(--wide)); min-height:calc(100svh - 14rem); margin:0 auto; display:grid; grid-template-columns:minmax(340px,.72fr) minmax(560px,1.28fr); align-items:center; gap:clamp(2rem,5vw,6rem); }
    .hero-copy { position:relative; z-index:4; transform:translateY(calc(var(--hero-progress) * -22px)); opacity:calc(1 - var(--hero-progress) * .3); }
    .hero h1 { margin:0; max-width:9ch; font-size:clamp(5.3rem,9.4vw,9.8rem); line-height:.84; letter-spacing:-.055em; }
    .hero-tagline { max-width:34rem; margin:1.2rem 0 0; font-size:clamp(1.8rem,3.1vw,3.35rem); font-weight:600; line-height:.99; letter-spacing:-.052em; text-wrap:balance; }
    .hero-intro { max-width:34rem; margin:1.25rem 0 0; color:rgba(245,245,247,.62); font-size:clamp(1rem,1.4vw,1.14rem); line-height:1.55; }
    .hero-actions { display:flex; flex-wrap:wrap; gap:.65rem; margin-top:1.55rem; }
    .hero-action { min-height:2.9rem; display:inline-flex; align-items:center; justify-content:center; padding:0 1rem; border:1px solid rgba(255,255,255,.16); border-radius:999px; background:rgba(255,255,255,.055); color:#fff; font-size:.78rem; font-weight:700; text-decoration:none; }
    .hero-action-primary { border-color:#dff8ff; background:#dff8ff; color:#071425; }

    .release-card { max-width:36rem; margin-top:2rem; padding:1.15rem; border:1px solid rgba(255,255,255,.13); border-radius:1.4rem; background:rgba(8,17,31,.66); -webkit-backdrop-filter:blur(18px); backdrop-filter:blur(18px); }
    .arrival-line { display:flex; align-items:baseline; justify-content:space-between; gap:1rem; color:rgba(255,255,255,.9); font-size:.82rem; }
    .arrival-label { color:rgba(255,255,255,.5); }
    .readiness-head { display:flex; align-items:end; justify-content:space-between; gap:1rem; margin-top:1.05rem; }
    .readiness-head span { color:rgba(255,255,255,.68); font-size:.78rem; font-weight:700; }
    .readiness-head strong { font-size:1.8rem; letter-spacing:-.04em; }
    .readiness-track { position:relative; height:.72rem; margin-top:.55rem; overflow:hidden; border:1px solid rgba(255,255,255,.09); border-radius:999px; background:rgba(255,255,255,.06); }
    .readiness-fill { position:absolute; inset:0 auto 0 0; width:${readiness.percent}%; overflow:hidden; border-radius:inherit; background:linear-gradient(90deg,#45ccff,#6d8bff 54%,#a271ff); box-shadow:0 0 25px rgba(91,184,255,.28); }
    .readiness-fill::before { content:""; position:absolute; inset:-120% -8% -120% 0; background:radial-gradient(circle at 12% 45%,rgba(255,255,255,.82) 0 1px,transparent 2px),radial-gradient(circle at 36% 68%,rgba(255,255,255,.58) 0 1px,transparent 2px),radial-gradient(circle at 57% 30%,rgba(218,248,255,.84) 0 1.2px,transparent 2.2px),radial-gradient(circle at 78% 58%,rgba(255,255,255,.7) 0 1px,transparent 2px); background-size:72px 28px,96px 35px,84px 31px,112px 37px; animation:readiness-drift 8s linear infinite; opacity:.7; }
    .readiness-fill::after { content:""; position:absolute; top:50%; right:-.15rem; width:1rem; height:1rem; transform:translateY(-50%); border-radius:50%; background:#effcff; box-shadow:0 0 8px #fff,0 0 22px #7de3ff,0 0 38px rgba(160,111,255,.7); }
    .readiness-stage { margin:.65rem 0 0; color:#fff; font-size:.8rem; font-weight:700; }
    .readiness-note { margin:.25rem 0 0; color:rgba(255,255,255,.43); font-size:.69rem; line-height:1.45; }
    @keyframes readiness-drift { from { transform:translateX(-40px); } to { transform:translateX(40px); } }

    .hero-product { position:relative; min-height:clamp(560px,64vw,810px); overflow:clip; transform:translateY(calc(var(--hero-progress) * -28px)) scale(calc(.97 + var(--hero-progress) * .035)); transform-origin:50% 70%; }
    .hero-device { position:absolute; overflow:hidden; border:1px solid rgba(255,255,255,.16); background:#06101e; box-shadow:0 40px 130px rgba(0,0,0,.58); }
    .hero-device-main { z-index:3; left:50%; bottom:0; width:min(365px,31vw); aspect-ratio:390/844; transform:translateX(-50%); border-radius:2.8rem; }
    .hero-device-left,.hero-device-right { z-index:2; bottom:7%; width:min(300px,26vw); aspect-ratio:390/844; border-radius:2.5rem; opacity:.65; filter:saturate(.86) brightness(.75); }
    .hero-device-left { left:2%; transform:perspective(1000px) rotateY(10deg) rotateZ(-3deg) scale(.9); }
    .hero-device-right { right:2%; transform:perspective(1000px) rotateY(-10deg) rotateZ(3deg) scale(.9); }
    .terra-preview-frame { width:100%; height:100%; border:0; pointer-events:none; background:#030914; }

    .manifesto { background:var(--paper); color:var(--ink); }
    .manifesto-inner { width:min(calc(100% - 2.5rem),var(--content)); min-height:82svh; margin:0 auto; padding:clamp(8rem,13vw,12rem) 0; display:flex; flex-direction:column; justify-content:center; }
    .manifesto .section-kicker { color:#226c89; }
    .manifesto h2 { margin:0; max-width:920px; font-size:clamp(4rem,7.3vw,7.3rem); line-height:.91; letter-spacing:-.06em; }
    .manifesto-lead { max-width:800px; margin:2rem 0 0; color:#686a70; font-size:clamp(1.15rem,2vw,1.45rem); line-height:1.5; }
    .principles { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:clamp(2rem,5vw,5rem); margin-top:5rem; }
    .principle { padding-top:1.15rem; border-top:1px solid rgba(20,20,25,.14); }
    .principle strong { display:block; font-size:1.05rem; }
    .principle p { margin:.6rem 0 0; color:#777980; line-height:1.55; font-size:.94rem; }

    .immersive { position:relative; min-height:110svh; overflow:clip; isolation:isolate; background:#06162d; }
    .immersive-art { position:absolute; z-index:-3; inset:0; width:100%; height:100%; object-fit:cover; object-position:center; opacity:.9; }
    .immersive::before { content:""; position:absolute; z-index:-2; inset:0; background:linear-gradient(180deg,rgba(0,8,20,.1),rgba(0,7,24,.42) 55%,rgba(0,4,14,.88)),linear-gradient(90deg,rgba(2,12,30,.5),transparent 70%); }
    .immersive-inner { width:min(calc(100% - 2.5rem),var(--wide)); min-height:110svh; margin:0 auto; padding:clamp(8rem,13vh,11rem) 0 clamp(6rem,10vh,8rem); display:grid; grid-template-columns:minmax(0,1fr) minmax(320px,430px); align-items:end; gap:4rem; }
    .immersive-copy h2 { margin:0; max-width:9ch; font-size:clamp(4.8rem,9vw,9.5rem); line-height:.89; letter-spacing:-.06em; }
    .immersive-copy p:last-child { max-width:600px; margin:1.4rem 0 0; color:rgba(255,255,255,.7); font-size:1.08rem; line-height:1.55; }
    .immersive-stack { display:grid; gap:1rem; align-self:center; }
    .immersive-status { padding:1.15rem 1.2rem; border:1px solid rgba(255,255,255,.14); border-radius:1.35rem; background:rgba(10,27,51,.58); box-shadow:0 24px 80px rgba(0,0,0,.28); -webkit-backdrop-filter:blur(22px) saturate(145%); backdrop-filter:blur(22px) saturate(145%); }
    .immersive-status small { display:block; color:rgba(255,255,255,.52); font-size:.72rem; }
    .immersive-status strong { display:block; margin-top:.35rem; font-size:1.08rem; }
    .immersive-liquid { min-height:4.3rem; display:grid; grid-template-columns:repeat(5,1fr); align-items:center; padding:.35rem; border:1px solid rgba(255,255,255,.16); border-radius:1.55rem; background:rgba(20,34,57,.58); -webkit-backdrop-filter:blur(24px) saturate(150%); backdrop-filter:blur(24px) saturate(150%); }
    .immersive-liquid i { width:1.25rem; height:1.25rem; justify-self:center; border:1.8px solid rgba(255,255,255,.54); border-radius:.38rem; }
    .immersive-liquid i:first-child { background:rgba(255,255,255,.15); border-color:#fff; }

    .feature-chapter { position:relative; overflow:clip; isolation:isolate; min-height:92svh; }
    .feature-inner { position:relative; z-index:2; width:min(calc(100% - 2.5rem),var(--wide)); min-height:92svh; margin:0 auto; padding:clamp(7rem,11vw,10rem) 0; display:grid; grid-template-columns:minmax(300px,.72fr) minmax(540px,1.28fr); align-items:center; gap:clamp(3rem,7vw,8rem); }
    .feature-reverse .feature-copy { order:2; }
    .feature-reverse .feature-preview-shell { order:1; }
    .feature-copy { max-width:520px; }
    .feature-copy h2 { margin:0; font-size:clamp(4rem,7vw,7rem); line-height:.91; letter-spacing:-.06em; text-wrap:balance; }
    .feature-copy > p:last-child { margin:1.45rem 0 0; color:var(--feature-muted,rgba(255,255,255,.64)); font-size:clamp(1rem,1.55vw,1.2rem); line-height:1.6; }
    .feature-preview-shell { position:relative; width:min(100%,760px); height:clamp(620px,63vw,790px); justify-self:center; overflow:hidden; border:1px solid rgba(255,255,255,.12); border-radius:2.8rem; background:#041020; box-shadow:0 42px 120px rgba(0,0,0,.36); }
    .feature-art { position:absolute; z-index:-2; inset:0; width:100%; height:100%; object-fit:cover; opacity:.32; }
    .feature-now { --feature-muted:rgba(255,255,255,.66); background:linear-gradient(145deg,#02060d,#071d34 68%,#07101c); }
    .feature-now::before { content:""; position:absolute; z-index:-1; inset:0; background:radial-gradient(circle at 75% 35%,rgba(63,177,255,.14),transparent 34rem); }
    .feature-participate { --feature-muted:rgba(237,252,255,.76); background:linear-gradient(140deg,#06324a,#08708a 48%,#071a2a); }
    .feature-participate::before { content:""; position:absolute; z-index:-1; inset:0; background:radial-gradient(circle at 18% 20%,rgba(101,241,255,.26),transparent 28rem),linear-gradient(120deg,transparent 50%,rgba(3,20,45,.56)); }
    .feature-explore { --feature-muted:rgba(255,255,255,.72); background:#170b2a; }
    .feature-explore::after { content:""; position:absolute; z-index:-1; inset:0; background:linear-gradient(100deg,rgba(13,4,30,.92) 0 36%,rgba(16,8,34,.52) 62%,rgba(8,4,20,.84)); }
    .feature-results { --feature-muted:rgba(255,255,255,.62); background:linear-gradient(145deg,#030306,#150c28 60%,#04030a); }
    .feature-results::before { content:"312"; position:absolute; right:-.04em; bottom:-.22em; font-family:"Classica Crastao",Georgia,serif; font-size:min(44vw,650px); color:rgba(155,111,255,.08); line-height:1; pointer-events:none; }
    .feature-me { --feature-muted:#686b72; background:#f1f1f3; color:#18191c; }
    .feature-me .section-kicker { color:#31758f; }
    .feature-me .feature-preview-shell { border-color:rgba(10,25,40,.1); box-shadow:0 42px 120px rgba(28,39,55,.16); }
    .feature-me::before { content:""; position:absolute; z-index:-1; inset:0; background:radial-gradient(circle at 75% 25%,rgba(93,190,255,.13),transparent 25rem); }

    .look { position:relative; overflow:clip; padding:clamp(8rem,12vw,11rem) 0 clamp(8rem,11vw,10rem); background:#101012; }
    .look::before { content:""; position:absolute; inset:0; background:url('/terraos-maintenance/purple-tunnel.svg') center/cover no-repeat; opacity:.11; pointer-events:none; }
    .look-head { position:relative; z-index:2; width:min(calc(100% - 2.5rem),var(--wide)); margin:0 auto 3rem; display:flex; align-items:end; justify-content:space-between; gap:2rem; }
    .look-head h2 { margin:0; font-size:clamp(4rem,7vw,7rem); line-height:.92; letter-spacing:-.06em; }
    .look-controls { display:flex; gap:.55rem; }
    .look-control { width:3rem; height:3rem; display:grid; place-items:center; border:1px solid rgba(255,255,255,.14); border-radius:50%; background:rgba(255,255,255,.07); color:#fff; cursor:pointer; }
    .look-track { position:relative; z-index:2; display:grid; grid-auto-flow:column; grid-auto-columns:min(620px,42vw); gap:1.25rem; overflow-x:auto; overscroll-behavior-inline:contain; scroll-snap-type:x mandatory; scrollbar-width:none; padding:0 max(1.25rem,calc((100vw - min(1380px,calc(100vw - 2.5rem)))/2)) 1.5rem; }
    .look-track::-webkit-scrollbar { display:none; }
    .look-card { position:relative; min-height:680px; overflow:hidden; scroll-snap-align:start; border:1px solid rgba(255,255,255,.1); border-radius:2rem; background:linear-gradient(155deg,#0a1424,#050608 70%); box-shadow:0 30px 90px rgba(0,0,0,.22); }
    .look-card-explore { background:linear-gradient(155deg,#1a0d35,#06152c 68%); }
    .look-card-participate { background:linear-gradient(155deg,#092a3a,#07111e 68%); }
    .look-card-results { background:linear-gradient(155deg,#1d1238,#070812 68%); }
    .look-card-me { background:linear-gradient(155deg,#18222d,#080b10 68%); }
    .look-copy { position:relative; z-index:3; padding:2rem 2rem 1rem; }
    .look-index { color:rgba(255,255,255,.38); font-size:.68rem; font-weight:700; letter-spacing:.14em; }
    .look-card h3 { margin:.75rem 0 0; font-size:clamp(2.6rem,4vw,4rem); line-height:.92; letter-spacing:-.055em; }
    .look-card p { margin:.65rem 0 0; color:rgba(255,255,255,.58); font-size:1rem; }
    .look-preview { position:absolute; left:8%; right:8%; bottom:-7%; height:72%; overflow:hidden; border:1px solid rgba(255,255,255,.15); border-radius:2.3rem 2.3rem 0 0; background:#041020; box-shadow:0 28px 70px rgba(0,0,0,.48); }

    .live { position:relative; min-height:125svh; overflow:clip; isolation:isolate; background:#000; }
    .live-art { position:absolute; z-index:-4; inset:0; width:100%; height:100%; object-fit:cover; opacity:.82; }
    .live::before { content:""; position:absolute; z-index:-3; inset:0; background:linear-gradient(180deg,rgba(0,0,0,.24),rgba(0,0,0,.08) 36%,rgba(0,0,0,.8) 90%,#000),linear-gradient(90deg,rgba(0,0,0,.55),transparent 62%); }
    .live-inner { width:min(calc(100% - 2.5rem),var(--wide)); min-height:125svh; margin:0 auto; display:grid; grid-template-columns:minmax(0,.8fr) minmax(430px,1.2fr); align-items:center; gap:clamp(2rem,6vw,7rem); padding:9rem 0; }
    .live-copy { align-self:start; position:sticky; top:20vh; padding-top:4vh; }
    .live-copy h2 { margin:0; font-size:clamp(4.5rem,8vw,8rem); line-height:.9; letter-spacing:-.06em; }
    .live-copy p:not(.section-kicker) { max-width:34rem; margin:1.35rem 0 0; color:rgba(255,255,255,.65); font-size:1.08rem; line-height:1.6; }
    .live-ui { align-self:center; min-height:640px; padding:clamp(1.2rem,3vw,2.2rem); border:1px solid rgba(255,255,255,.14); border-radius:2.4rem; background:rgba(3,11,23,.68); box-shadow:0 45px 130px rgba(0,0,0,.5); -webkit-backdrop-filter:blur(24px) saturate(140%); backdrop-filter:blur(24px) saturate(140%); }
    .live-top { display:flex; align-items:center; justify-content:space-between; gap:1rem; color:rgba(255,255,255,.58); font-size:.72rem; text-transform:uppercase; letter-spacing:.12em; }
    .live-chip { padding:.45rem .72rem; border:1px solid rgba(255,255,255,.15); border-radius:999px; color:#fff; background:rgba(255,255,255,.06); }
    .live-now { margin-top:4rem; }
    .live-now small { color:#70ddff; font-size:.72rem; font-weight:700; letter-spacing:.14em; text-transform:uppercase; }
    .live-now strong { display:block; margin-top:.6rem; font-family:"Classica Crastao",Georgia,serif; font-size:clamp(4rem,8vw,7rem); font-weight:400; line-height:.9; letter-spacing:-.045em; }
    .live-meta { margin-top:1.2rem; padding-top:1rem; border-top:1px solid rgba(255,255,255,.09); color:rgba(255,255,255,.64); }
    .live-steps { display:grid; gap:.55rem; margin-top:4rem; }
    .live-step { min-height:3.6rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.75rem .9rem; border:1px solid rgba(255,255,255,.08); border-radius:1rem; color:rgba(255,255,255,.42); background:rgba(255,255,255,.03); }
    .live-step[data-active="true"] { color:#fff; border-color:rgba(123,222,255,.26); background:rgba(80,176,255,.11); }
    .live-step span { font-size:.75rem; font-weight:700; }
    .live-step small { color:inherit; opacity:.7; }

    .confirmation-section { background:#f4f6f8; color:#16171a; padding:clamp(8rem,12vw,11rem) 0 clamp(6rem,10vw,9rem); }
    .confirmation-layout { width:min(calc(100% - 2.5rem),var(--content)); margin:0 auto; }
    .confirmation-intro { max-width:920px; }
    .confirmation-intro .section-kicker { color:#226c89; }
    .confirmation-intro h2 { margin:0; font-size:clamp(4rem,7vw,7rem); line-height:.91; letter-spacing:-.06em; }
    .confirmation-intro p:not(.section-kicker) { max-width:740px; margin:1.45rem 0 0; color:#64666d; font-size:clamp(1rem,1.7vw,1.22rem); line-height:1.58; }
    .confirmation-host { margin-top:clamp(3rem,6vw,5rem); }
    .confirmation-fallback { max-width:820px; margin:0 auto; padding:1.15rem 1.2rem; border:1px solid rgba(20,35,50,.1); border-radius:1.4rem; background:#fff; color:#50545a; font-size:.86rem; line-height:1.5; box-shadow:0 25px 70px rgba(31,43,55,.07); }
    .confirmation-host .hod-portal { max-width:820px; margin:0 auto!important; padding:clamp(1.25rem,3vw,2rem)!important; border-radius:2rem!important; border-color:rgba(117,205,232,.22)!important; background:linear-gradient(180deg,rgba(15,38,66,.97),rgba(4,15,34,.995))!important; box-shadow:0 35px 90px rgba(25,42,56,.2),inset 0 1px 0 rgba(255,255,255,.08)!important; }
    .confirmation-host .hod-portal h2 { font-size:clamp(1.6rem,3vw,2.1rem)!important; letter-spacing:-.04em!important; }
    .confirmation-host .hod-button { border-radius:999px!important; min-height:2.85rem!important; padding-inline:1rem!important; }
    .confirmation-host .hod-field input { min-height:3rem!important; border-radius:.9rem!important; }

    .readiness-chapter { background:#eef1f5; color:#141519; padding:clamp(7rem,11vw,10rem) 0; }
    .readiness-chapter-inner { width:min(calc(100% - 2.5rem),1000px); margin:0 auto; }
    .readiness-chapter .section-kicker { color:#31758f; }
    .readiness-chapter h2 { margin:0; max-width:850px; font-size:clamp(4rem,7vw,7rem); line-height:.91; letter-spacing:-.06em; }
    .readiness-big { margin-top:clamp(3rem,6vw,5rem); padding:clamp(1.4rem,3vw,2rem); border:1px solid rgba(21,31,42,.1); border-radius:2rem; background:#fff; box-shadow:0 25px 80px rgba(26,39,58,.08); }
    .readiness-big-head { display:flex; align-items:end; justify-content:space-between; gap:1rem; }
    .readiness-big-head span { color:#6c7078; font-size:.95rem; font-weight:700; }
    .readiness-big-head strong { font-family:"Classica Crastao",Georgia,serif; font-size:clamp(4.5rem,9vw,8rem); font-weight:400; line-height:.75; letter-spacing:-.04em; color:#15161a; }
    .readiness-big .readiness-track { height:1rem; margin-top:1.8rem; background:#e4e7ec; border-color:#d9dde4; }
    .readiness-big .readiness-stage { color:#1b1c20; font-size:1rem; margin-top:1rem; }
    .readiness-big .readiness-note { color:#777b83; font-size:.78rem; }

    .finale { position:relative; min-height:92svh; display:grid; place-items:center; overflow:clip; text-align:center; isolation:isolate; background:#000; }
    .finale::before { content:""; position:absolute; z-index:-3; inset:0; background:url('/terraos-maintenance/purple-tunnel.svg') center 58%/cover no-repeat; opacity:.24; }
    .finale::after { content:""; position:absolute; z-index:-2; inset:0; background:radial-gradient(circle at 50% 58%,transparent 0 18%,rgba(0,0,0,.34) 55%,#000 90%); }
    .finale-inner { width:min(calc(100% - 2.5rem),1000px); padding:9rem 0; }
    .finale .section-kicker { color:rgba(255,255,255,.54); }
    .finale h2 { margin:0; font-size:clamp(5.5rem,11vw,11rem); line-height:.82; letter-spacing:-.04em; }
    .finale p { margin:1.4rem auto 0; color:rgba(255,255,255,.68); font-size:clamp(1.3rem,2.2vw,2rem); }
    .finale-link { display:inline-flex; min-height:2.9rem; align-items:center; margin-top:1.8rem; padding:0 1.05rem; border:1px solid rgba(255,255,255,.14); border-radius:999px; background:rgba(255,255,255,.07); color:#fff; font-size:.78rem; font-weight:700; text-decoration:none; }

    footer { width:min(calc(100% - 2.5rem),var(--wide)); margin:0 auto; padding:2.3rem 0 max(2.3rem,env(safe-area-inset-bottom)); display:flex; align-items:flex-start; justify-content:space-between; gap:2rem; border-top:1px solid rgba(255,255,255,.08); color:rgba(255,255,255,.4); font-size:.68rem; line-height:1.5; }
    footer strong { display:block; color:rgba(255,255,255,.7); font-size:.7rem; }
    .scroll-in { opacity:0; transform:translateY(24px); transition:opacity .72s cubic-bezier(.2,.8,.2,1),transform .72s cubic-bezier(.2,.8,.2,1); }
    .scroll-in.seen { opacity:1; transform:none; }
    :focus-visible { outline:3px solid #7ddfff; outline-offset:3px; }

    @media (max-width:980px) {
      .product-links a:not(.confirmation-link) { display:none; }
      .hero { min-height:auto; padding:calc(env(safe-area-inset-top) + 6.4rem) 1rem 5rem; }
      .hero-grid { min-height:0; grid-template-columns:1fr; gap:3.5rem; }
      .hero-copy { transform:none!important; opacity:1!important; }
      .hero h1 { max-width:none; font-size:clamp(4.7rem,14vw,7.2rem); }
      .hero-product { min-height:650px; max-width:720px; width:100%; margin:0 auto; transform:none!important; }
      .hero-device-main { width:min(370px,54vw); }
      .hero-device-left,.hero-device-right { width:min(285px,40vw); }
      .manifesto-inner { min-height:auto; padding:8rem 0; }
      .principles { gap:2rem; }
      .immersive-inner { min-height:auto; grid-template-columns:1fr; padding:8rem 0; }
      .immersive-stack { max-width:560px; width:100%; }
      .feature-inner { min-height:auto; grid-template-columns:1fr; gap:3rem; padding:7rem 0; }
      .feature-reverse .feature-copy,.feature-reverse .feature-preview-shell { order:initial; }
      .feature-copy { max-width:680px; }
      .feature-preview-shell { height:720px; }
      .live { min-height:auto; }
      .live-inner { min-height:auto; grid-template-columns:1fr; padding:8rem 0; }
      .live-copy { position:static; padding:0; }
      .look-track { grid-auto-columns:min(78vw,590px); }
    }

    @media (max-width:680px) {
      .product-bar { top:max(.6rem,env(safe-area-inset-top)); width:calc(100% - 1.1rem); min-height:3.2rem; padding:.48rem .55rem .48rem .78rem; border-radius:1.2rem; }
      .product-name { gap:.52rem; }
      .product-name span { font-size:1.08rem; }
      .product-links a { min-height:2.25rem; padding:0 .78rem; font-size:.72rem; }
      .hero { padding:calc(env(safe-area-inset-top) + 5.8rem) 1.25rem 4.5rem; }
      .hero::after { background:linear-gradient(180deg,rgba(0,0,0,.72),rgba(0,0,0,.42) 45%,#000 96%); }
      .hero-kicker,.section-kicker { font-size:.72rem; letter-spacing:.15em; }
      .hero h1 { font-size:clamp(4.4rem,19vw,6.4rem); line-height:.84; letter-spacing:-.04em; }
      .hero-tagline { margin-top:1.05rem; font-size:clamp(2rem,9.7vw,3rem); line-height:1; }
      .hero-intro { margin-top:1.1rem; font-size:1rem; line-height:1.55; }
      .hero-actions { display:grid; grid-template-columns:1fr; margin-top:1.35rem; }
      .hero-action { width:100%; min-height:3.1rem; }
      .release-card { margin-top:1.4rem; padding:1rem; border-radius:1.35rem; }
      .arrival-line { align-items:flex-start; flex-direction:column; gap:.25rem; }
      .readiness-head { margin-top:1rem; }
      .readiness-head strong { font-size:2rem; }
      .hero-product { min-height:0; height:auto; padding-top:1rem; display:grid; place-items:center; overflow:visible; }
      .hero-device { position:relative!important; inset:auto!important; transform:none!important; }
      .hero-device-main { width:min(88vw,390px); aspect-ratio:390/844; border-radius:2.4rem; }
      .hero-device-left,.hero-device-right { display:none; }
      .manifesto-inner { width:calc(100% - 2.5rem); padding:7rem 0 7.5rem; }
      .manifesto h2 { font-size:clamp(3.2rem,14vw,4.8rem); line-height:.93; }
      .manifesto-lead { margin-top:1.5rem; font-size:1.08rem; }
      .principles { grid-template-columns:1fr; gap:2rem; margin-top:3.5rem; }
      .immersive { min-height:auto; }
      .immersive-art { height:54svh; object-position:center; opacity:.95; }
      .immersive::before { background:linear-gradient(180deg,rgba(2,10,26,.08),rgba(3,15,36,.3) 30%,#06162d 53%); }
      .immersive-inner { width:100%; min-height:auto; padding:clamp(23rem,56svh,30rem) 1.25rem 6.5rem; gap:2.4rem; }
      .immersive-copy h2 { max-width:100%; font-size:clamp(3.5rem,15.5vw,5.1rem); line-height:.9; }
      .immersive-copy p:last-child { font-size:1rem; }
      .immersive-stack { gap:.8rem; }
      .immersive-status,.immersive-liquid { position:static!important; transform:none!important; width:100%!important; max-width:none!important; }
      .immersive-status { padding:1rem; border-radius:1.2rem; }
      .immersive-liquid { min-height:4rem; border-radius:1.35rem; }
      .feature-chapter { min-height:auto; }
      .feature-inner { width:calc(100% - 2.5rem); min-height:auto; padding:6.5rem 0 7rem; gap:2.6rem; }
      .feature-copy h2 { font-size:clamp(3.25rem,13.8vw,4.8rem); line-height:.92; }
      .feature-copy > p:last-child { margin-top:1.15rem; font-size:1rem; line-height:1.58; }
      .feature-preview-shell { width:100%; height:min(155vw,680px); border-radius:2rem; }
      .feature-explore .feature-art { opacity:.24; }
      .look { padding:6.5rem 0 7rem; }
      .look-head { width:calc(100% - 2.5rem); margin-bottom:2rem; display:block; }
      .look-head h2 { font-size:clamp(3.3rem,13.8vw,4.8rem); }
      .look-controls { margin-top:1.2rem; display:flex; }
      .look-control { width:2.8rem; height:2.8rem; }
      .look-track { grid-auto-columns:84vw; gap:.85rem; padding:0 1.25rem 1rem; }
      .look-card { min-height:590px; border-radius:1.65rem; }
      .look-copy { padding:1.45rem; }
      .look-preview { left:5%; right:5%; bottom:-4%; height:70%; border-radius:1.8rem 1.8rem 0 0; }
      .live { min-height:auto; }
      .live-art { height:48svh; opacity:.9; }
      .live::before { background:linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.35) 30%,#000 49%); }
      .live-inner { width:calc(100% - 2.5rem); min-height:auto; padding:clamp(21rem,51svh,28rem) 0 7rem; gap:2.6rem; }
      .live-copy { position:static; }
      .live-copy h2 { font-size:clamp(3.4rem,14.5vw,5rem); }
      .live-ui { min-height:500px; padding:1rem; border-radius:1.8rem; }
      .live-now { margin-top:3rem; }
      .live-now strong { font-size:clamp(3.6rem,15vw,5rem); }
      .live-steps { margin-top:3rem; }
      .confirmation-section { padding:7rem 0; }
      .confirmation-layout { width:calc(100% - 2.5rem); }
      .confirmation-intro h2 { font-size:clamp(3.3rem,14vw,4.8rem); }
      .confirmation-host { margin-top:2.4rem; }
      .confirmation-host .hod-portal { border-radius:1.45rem!important; padding:1.15rem!important; }
      .confirmation-host .hod-portal-head { display:block!important; }
      .confirmation-host .hod-dashboard-actions,.confirmation-host .hod-actions { width:100%!important; }
      .confirmation-host .hod-button { min-height:3rem!important; }
      .readiness-chapter { padding:7rem 0; }
      .readiness-chapter-inner { width:calc(100% - 2.5rem); }
      .readiness-chapter h2 { font-size:clamp(3.25rem,13.8vw,4.8rem); }
      .readiness-big { margin-top:2.7rem; padding:1.2rem; border-radius:1.55rem; }
      .readiness-big-head { align-items:flex-start; flex-direction:column; }
      .readiness-big-head strong { font-size:5.5rem; }
      .finale { min-height:82svh; }
      .finale-inner { width:calc(100% - 2.5rem); padding:8rem 0; }
      .finale h2 { font-size:clamp(5rem,21vw,7rem); }
      footer { width:calc(100% - 2.5rem); flex-direction:column; gap:.4rem; }
    }

    @supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))) { .product-bar,.release-card,.immersive-status,.immersive-liquid,.live-ui { background:rgba(15,26,45,.96); } }
    @media (prefers-reduced-transparency:reduce) { .product-bar,.release-card,.immersive-status,.immersive-liquid,.live-ui { -webkit-backdrop-filter:none; backdrop-filter:none; background:rgba(15,26,45,.96); } }
    @media (prefers-reduced-motion:reduce) { html { scroll-behavior:auto; } *,*::before,*::after { animation-duration:.001ms!important; animation-iteration-count:1!important; transition-duration:.001ms!important; scroll-behavior:auto!important; } .hero-copy,.hero-product { transform:none!important; opacity:1!important; } .readiness-fill::before { animation:none!important; } .scroll-in { opacity:1!important; transform:none!important; } .live-copy { position:static!important; } }
  </style>
</head>
<body>
<div class="content" data-solaris-maintenance="true">
  <nav class="product-bar" aria-label="TerraOS 3 page navigation" data-product-bar>
    <a class="product-name" href="#overview"><img class="product-mark" src="/solaris-studio-mark.png" alt="" aria-hidden="true" width="256" height="256" /><span>TerraOS 3</span></a>
    <div class="product-links"><a href="#overview">Overview</a><a href="#experience">Experience</a><a class="confirmation-link" href="#confirmation-access">Confirmation</a></div>
  </nav>

  <header class="hero" id="overview" aria-labelledby="maintenance-title" data-hero>
    <div class="hero-grid">
      <div class="hero-copy">
        <p class="hero-kicker">Solaris Studio</p>
        <h1 id="maintenance-title" class="terra-wordmark">TerraOS 3</h1>
        <p class="hero-tagline">Solaris, reimagined.</p>
        <p class="hero-intro">A new generation of Solaris Studio is taking shape around what is happening, what matters to you, and what comes next.</p>
        <div class="hero-actions"><a class="hero-action hero-action-primary" href="#experience">Explore TerraOS 3</a><a class="hero-action" href="#confirmation-access">Access Confirmation</a></div>
        <div class="release-card">
          <div class="arrival-line">${arrivalMarkup}</div>
          <div class="readiness-head"><span>TerraOS 3 readiness</span><strong>${readiness.percent}%</strong></div>
          <div class="readiness-track" role="progressbar" aria-label="TerraOS 3 readiness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${readiness.percent}"><span class="readiness-fill" aria-hidden="true"></span></div>
          <p class="readiness-stage">${readinessStage}</p><p class="readiness-note">Based on tracked release criteria, not time elapsed.</p>
        </div>
      </div>
      <div class="hero-product" aria-label="TerraOS 3 interface preview"><div class="hero-device hero-device-left" aria-hidden="true">${previewFrame("participate", "TerraOS Participate preview")}</div><div class="hero-device hero-device-main" aria-hidden="true">${previewFrame("home", "TerraOS Home preview", "eager")}</div><div class="hero-device hero-device-right" aria-hidden="true">${previewFrame("explore", "TerraOS Explore preview")}</div></div>
    </div>
  </header>

  <main class="product-story" id="experience">
    <section class="manifesto" aria-labelledby="generation-title"><div class="manifesto-inner scroll-in"><p class="section-kicker">TerraOS 3</p><h2 id="generation-title">A new generation of Solaris.</h2><p class="manifesto-lead">Solaris Studio is being rebuilt around the contest itself: what is happening, what matters to you, and what you need to do next.</p><div class="principles"><article class="principle"><strong>What matters now</strong><p>The important thing comes first instead of hiding behind a maze of competing screens.</p></article><article class="principle"><strong>Everything in its place</strong><p>Discover, participate, follow results and manage your Solaris identity through a clearer structure.</p></article><article class="principle"><strong>Built for the moment</strong><p>The experience can stay calm on ordinary days and become expressive when Solaris goes live.</p></article></div></div></section>

    <section class="immersive" aria-labelledby="place-title"><img class="immersive-art" src="/terraos-maintenance/blue-motion.svg" alt="" aria-hidden="true" loading="lazy" /><div class="immersive-inner"><div class="immersive-copy scroll-in"><p class="section-kicker">Designed around you</p><h2 id="place-title">Everything<br />in its place.</h2><p>A calmer Solaris experience keeps the next important thing where you expect it, without turning every screen into a dashboard.</p></div><div class="immersive-stack" aria-hidden="true"><div class="immersive-status scroll-in"><small>Right now</small><strong>You're all caught up ✓</strong></div><div class="immersive-status scroll-in"><small>Participate</small><strong>1 thing needs attention</strong></div><div class="immersive-liquid scroll-in"><i></i><i></i><i></i><i></i><i></i></div></div></div></section>

    ${featureChapter({ id:"solaris-now", screen:"home", kicker:"Solaris Now", title:"What matters, now.", copy:"TerraOS brings the current contest, your next action and the most relevant Solaris updates into one clear starting point.", tone:"now" })}
    ${featureChapter({ id:"participate-feature", screen:"participate", kicker:"Participate", title:"Know exactly what needs you.", copy:"Confirmation, entries, Jury and other responsibilities become one clear journey instead of separate destinations you have to remember.", tone:"participate", reverse:true })}
    ${featureChapter({ id:"explore-feature", screen:"explore", kicker:"Explore", title:"More Solaris. Less searching.", copy:"Editions, countries, stories, archive material and discovery live together in a more visual, editorial Explore experience.", tone:"explore", art:"/solaris-background.webp" })}
    ${featureChapter({ id:"results-feature", screen:"results", kicker:"Results", title:"See what happened.", copy:"Published results become a focused story of the outcome, with the official result first and deeper context available when you want it.", tone:"results", reverse:true })}
    ${featureChapter({ id:"me-feature", screen:"me", kicker:"Me", title:"Your Solaris.", copy:"Your identity, current delegation and participation history come together in one calm place that belongs to you.", tone:"me", art:"/solaris-studio-social.jpg" })}

    <section class="look" id="preview" aria-labelledby="look-title"><div class="look-head scroll-in"><div><p class="section-kicker">TerraOS 3</p><h2 id="look-title">Take a closer look.</h2></div><div class="look-controls" aria-label="Preview gallery controls"><button class="look-control" type="button" data-gallery-prev aria-label="Previous preview">←</button><button class="look-control" type="button" data-gallery-next aria-label="Next preview">→</button></div></div><div class="look-track" data-look-track tabindex="0" aria-label="TerraOS 3 destinations">${galleryMarkup()}</div></section>

    <section class="live" aria-labelledby="live-title" data-live-section><img class="live-art" src="/terraos-maintenance/live-stage.svg" alt="" aria-hidden="true" loading="lazy" /><div class="live-inner"><div class="live-copy scroll-in"><p class="section-kicker">Live</p><h2 id="live-title">Built for<br />contest night.</h2><p>When Solaris goes live, TerraOS moves with it. Show, voting and results each become the focus when the moment calls for them.</p></div><div class="live-ui scroll-in" aria-label="Illustrative TerraOS Live preview"><div class="live-top"><span>SSC 22 · Grand Final</span><span class="live-chip" data-live-chip>Live</span></div><div class="live-now"><small data-live-kicker>Now</small><strong data-live-main>12 · Oland</strong><div class="live-meta" data-live-meta>Artist · Song</div></div><div class="live-steps" aria-hidden="true"><div class="live-step" data-live-step="0" data-active="true"><span>SHOW</span><small>Performance sequence</small></div><div class="live-step" data-live-step="1" data-active="false"><span>VOTING OPEN</span><small>Participation becomes available</small></div><div class="live-step" data-live-step="2" data-active="false"><span>RESULTS</span><small>Published outcome</small></div></div></div></div></section>

    <section class="confirmation-section" id="confirmation-access" aria-labelledby="confirmation-title"><div class="confirmation-layout"><div class="confirmation-intro scroll-in"><p class="section-kicker">Available during the transition</p><h2 id="confirmation-title">Your delegation<br />keeps moving.</h2><p>While TerraOS 3 is being prepared, eligible delegation members can continue managing their current Confirmation. The rest of Solaris Studio remains under maintenance.</p></div><div class="confirmation-host" data-confirmation-host><div class="confirmation-fallback" data-confirmation-fallback>Confirmation access appears here for eligible delegation accounts.</div></div></div></section>

    <section class="readiness-chapter" aria-labelledby="readiness-title"><div class="readiness-chapter-inner scroll-in"><p class="section-kicker">What's next</p><h2 id="readiness-title">TerraOS 3 is taking shape.</h2><div class="readiness-big"><div class="readiness-big-head"><span>TerraOS 3 readiness</span><strong>${readiness.percent}%</strong></div><div class="readiness-track" role="progressbar" aria-label="TerraOS 3 readiness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${readiness.percent}"><span class="readiness-fill" aria-hidden="true"></span></div><p class="readiness-stage">${readinessStage}</p><p class="readiness-note">Progress reflects tracked release readiness rather than time remaining.</p></div></div></section>

    <section class="finale" aria-labelledby="finale-title"><div class="finale-inner scroll-in"><p class="section-kicker">Solaris Studio</p><h2 id="finale-title" class="terra-wordmark">TerraOS 3</h2><p>Built for what happens next.</p><a class="finale-link" href="#confirmation-access">Access Confirmation ↑</a></div></section>
  </main>

  <footer><div><strong>Terra Solaris Broadcasting Coalition</strong>Solaris Studio · TerraOS 3</div><div>Maintenance notice updated ${updated} · HTTP 503</div></footer>
</div>
<script>
(function(){
  var root=document.querySelector('[data-solaris-maintenance="true"]');var portal=document.querySelector('.hod-portal');var confirmationHost=document.querySelector('[data-confirmation-host]');var confirmationFallback=document.querySelector('[data-confirmation-fallback]');if(root&&portal&&confirmationHost){confirmationHost.appendChild(portal);if(confirmationFallback)confirmationFallback.hidden=true;}
  var productBar=document.querySelector('[data-product-bar]');function syncProductBar(){if(productBar)productBar.setAttribute('data-scrolled',window.scrollY>28?'true':'false');}syncProductBar();window.addEventListener('scroll',syncProductBar,{passive:true});
  var reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');var hero=document.querySelector('[data-hero]');var heroFrame=0;function clamp01(value){return Math.max(0,Math.min(1,value));}function updateHero(){heroFrame=0;if(!hero||reduceMotion.matches||window.innerWidth<981){if(hero)hero.style.setProperty('--hero-progress','0');return;}var travel=Math.max(320,Math.min(hero.offsetHeight*.8,window.innerHeight*.9));var progress=clamp01(window.scrollY/travel);hero.style.setProperty('--hero-progress',progress.toFixed(4));}function requestHero(){if(!heroFrame)heroFrame=requestAnimationFrame(updateHero);}updateHero();window.addEventListener('scroll',requestHero,{passive:true});window.addEventListener('resize',requestHero,{passive:true});
  var track=document.querySelector('[data-look-track]');var prev=document.querySelector('[data-gallery-prev]');var next=document.querySelector('[data-gallery-next]');function galleryStep(direction){if(!track)return;var card=track.querySelector('[data-look-card]');var gap=parseFloat(getComputedStyle(track).columnGap||getComputedStyle(track).gap||'0')||0;var width=card?card.getBoundingClientRect().width:track.clientWidth*.82;track.scrollBy({left:(width+gap)*direction,behavior:reduceMotion.matches?'auto':'smooth'});}if(prev)prev.addEventListener('click',function(){galleryStep(-1);});if(next)next.addEventListener('click',function(){galleryStep(1);});if(track)track.addEventListener('keydown',function(event){if(event.key==='ArrowRight'){event.preventDefault();galleryStep(1);}if(event.key==='ArrowLeft'){event.preventDefault();galleryStep(-1);}});
  var live=document.querySelector('[data-live-section]');var liveSteps=Array.from(document.querySelectorAll('[data-live-step]'));var liveChip=document.querySelector('[data-live-chip]');var liveKicker=document.querySelector('[data-live-kicker]');var liveMain=document.querySelector('[data-live-main]');var liveMeta=document.querySelector('[data-live-meta]');var liveFrame=0;var liveStates=[{chip:'Live',kicker:'Now',main:'12 · Oland',meta:'Artist · Song'},{chip:'Voting open',kicker:'Participate',main:'Voting is open',meta:'The active action comes forward.'},{chip:'Published',kicker:'Results',main:'The outcome',meta:'Official results become the focus.'}];function setLiveState(index){var state=liveStates[index]||liveStates[0];liveSteps.forEach(function(step,i){step.setAttribute('data-active',i===index?'true':'false');});if(liveChip)liveChip.textContent=state.chip;if(liveKicker)liveKicker.textContent=state.kicker;if(liveMain)liveMain.textContent=state.main;if(liveMeta)liveMeta.textContent=state.meta;}function updateLive(){liveFrame=0;if(!live||reduceMotion.matches||window.innerWidth<681){setLiveState(0);return;}var rect=live.getBoundingClientRect();var total=Math.max(1,rect.height-window.innerHeight);var progress=clamp01((-rect.top)/total);setLiveState(progress<.34?0:progress<.7?1:2);}function requestLive(){if(!liveFrame)liveFrame=requestAnimationFrame(updateLive);}updateLive();window.addEventListener('scroll',requestLive,{passive:true});window.addEventListener('resize',requestLive,{passive:true});
  if('IntersectionObserver'in window&&!reduceMotion.matches){var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('seen');observer.unobserve(entry.target);}});},{threshold:.1});document.querySelectorAll('.scroll-in').forEach(function(node){observer.observe(node);});}else{document.querySelectorAll('.scroll-in').forEach(function(node){node.classList.add('seen');});}
})();
</script>
</body>
</html>`;
}
