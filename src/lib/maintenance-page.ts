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
  ["participate", "Participate", "Know what's next."],
  ["results", "Results", "See what happened."],
  ["me", "Me", "Your Solaris."],
] as const;

function previewFrame(screen: (typeof PREVIEW_SCREENS)[number][0], title: string, loading: "eager" | "lazy" = "lazy") {
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
      --muted:rgba(245,245,247,.66);
      --muted-soft:rgba(245,245,247,.48);
      --primary:#79ddff;
      --line:rgba(255,255,255,.11);
      --ink:#17171a;
      --paper:#f5f5f7;
      --wide:1380px;
      --content:1120px;
      font-family:"Gotham",ui-sans-serif,system-ui,sans-serif;
      background:#000;
      color:var(--fg);
    }
    * { box-sizing:border-box; }
    html { min-height:100%; scroll-behavior:smooth; background:#000; }
    body { margin:0; min-width:320px; min-height:100%; overflow-x:hidden; background:#000; color:var(--fg); }
    button,a,input { font:inherit; }
    a { color:inherit; }
    img { display:block; max-width:100%; }
    .sr-only { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
    .content { min-height:100vh; overflow:hidden; background:#000; }

    .product-bar {
      position:fixed;
      z-index:80;
      top:max(.65rem,env(safe-area-inset-top));
      left:50%;
      width:min(calc(100% - 1.4rem),1180px);
      min-height:3.35rem;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:1rem;
      padding:.55rem .68rem .55rem 1rem;
      transform:translateX(-50%);
      border:1px solid transparent;
      border-radius:1.25rem;
      transition:background .25s ease,border-color .25s ease,box-shadow .25s ease,transform .25s ease;
    }
    .product-bar[data-scrolled="true"] {
      border-color:rgba(255,255,255,.14);
      background:rgba(17,18,22,.72);
      box-shadow:0 15px 44px rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.08);
      -webkit-backdrop-filter:blur(24px) saturate(150%);
      backdrop-filter:blur(24px) saturate(150%);
    }
    .product-name { display:flex; align-items:center; gap:.65rem; min-width:0; font-size:.83rem; font-weight:700; letter-spacing:-.01em; text-decoration:none; }
    .product-mark { width:1.45rem; height:1.45rem; border-radius:.42rem; object-fit:cover; }
    .product-links { display:flex; align-items:center; gap:.1rem; }
    .product-links a { min-height:2.35rem; display:inline-flex; align-items:center; padding:0 .78rem; border-radius:999px; color:rgba(255,255,255,.72); font-size:.73rem; font-weight:600; text-decoration:none; }
    .product-links a:hover { color:#fff; background:rgba(255,255,255,.07); }
    .product-links .confirmation-link { color:#08111e; background:#eefaff; }
    .product-links .confirmation-link:hover { color:#08111e; background:#fff; }

    .hero {
      --hero-progress:0;
      position:relative;
      min-height:100svh;
      display:grid;
      align-items:end;
      overflow:hidden;
      padding:clamp(7.5rem,13vh,10rem) max(1.25rem,5vw) clamp(3.2rem,7vh,5.5rem);
      isolation:isolate;
      background:
        radial-gradient(circle at 68% 36%,rgba(56,174,255,.15),transparent 24rem),
        radial-gradient(circle at 88% 56%,rgba(126,77,255,.12),transparent 25rem),
        #000;
    }
    .hero::before { content:""; position:absolute; z-index:-1; inset:auto -12vw -28vh 32vw; height:72vh; border-radius:50%; background:radial-gradient(circle,rgba(74,185,255,.19),transparent 66%); filter:blur(34px); pointer-events:none; }
    .hero-grid { width:min(100%,var(--wide)); margin:0 auto; display:grid; grid-template-columns:minmax(340px,.72fr) minmax(560px,1.28fr); align-items:end; gap:clamp(2rem,5vw,6rem); }
    .hero-copy { position:relative; z-index:4; padding-bottom:clamp(.5rem,5vh,4rem); transform:translateY(calc(var(--hero-progress) * -28px)); opacity:calc(1 - var(--hero-progress) * .42); }
    .hero-kicker,.section-kicker { margin:0 0 .8rem; color:#75ddff; font-size:.75rem; font-weight:700; letter-spacing:.15em; text-transform:uppercase; }
    .hero h1 { margin:0; font-size:clamp(4.7rem,9.4vw,9.4rem); line-height:.84; letter-spacing:-.072em; text-wrap:balance; }
    .hero-tagline { max-width:34rem; margin:1.35rem 0 0; font-size:clamp(1.8rem,3.1vw,3.35rem); font-weight:600; line-height:.98; letter-spacing:-.052em; text-wrap:balance; }
    .hero-intro { max-width:33rem; margin:1.25rem 0 0; color:rgba(245,245,247,.62); font-size:clamp(.98rem,1.4vw,1.13rem); line-height:1.52; }
    .hero-actions { display:flex; flex-wrap:wrap; gap:.65rem; margin-top:1.55rem; }
    .hero-action { min-height:2.85rem; display:inline-flex; align-items:center; justify-content:center; padding:0 1rem; border:1px solid rgba(255,255,255,.14); border-radius:999px; background:rgba(255,255,255,.055); color:#fff; font-size:.78rem; font-weight:700; text-decoration:none; }
    .hero-action-primary { border-color:#dff8ff; background:#dff8ff; color:#071425; }

    .release-card { max-width:36rem; margin-top:2rem; padding:1rem 1.05rem 1.05rem; border:1px solid rgba(255,255,255,.11); border-radius:1.25rem; background:rgba(255,255,255,.045); }
    .arrival-line { display:flex; align-items:baseline; justify-content:space-between; gap:1rem; color:rgba(255,255,255,.88); font-size:.8rem; }
    .arrival-line strong { font-size:.86rem; }
    .arrival-label { color:rgba(255,255,255,.48); }
    .readiness-head { display:flex; align-items:end; justify-content:space-between; gap:1rem; margin-top:1rem; }
    .readiness-head span { color:rgba(255,255,255,.68); font-size:.76rem; font-weight:700; }
    .readiness-head strong { font-size:1.55rem; letter-spacing:-.04em; }
    .readiness-track { position:relative; height:.72rem; margin-top:.52rem; overflow:hidden; border:1px solid rgba(255,255,255,.09); border-radius:999px; background:rgba(255,255,255,.06); }
    .readiness-fill { position:absolute; inset:0 auto 0 0; width:${readiness.percent}%; overflow:hidden; border-radius:inherit; background:linear-gradient(90deg,#45ccff,#6d8bff 54%,#a271ff); box-shadow:0 0 25px rgba(91,184,255,.28); }
    .readiness-fill::before { content:""; position:absolute; inset:-120% -8% -120% 0; background:radial-gradient(circle at 12% 45%,rgba(255,255,255,.82) 0 1px,transparent 2px),radial-gradient(circle at 36% 68%,rgba(255,255,255,.58) 0 1px,transparent 2px),radial-gradient(circle at 57% 30%,rgba(218,248,255,.84) 0 1.2px,transparent 2.2px),radial-gradient(circle at 78% 58%,rgba(255,255,255,.7) 0 1px,transparent 2px); background-size:72px 28px,96px 35px,84px 31px,112px 37px; animation:readiness-drift 8s linear infinite; opacity:.7; }
    .readiness-fill::after { content:""; position:absolute; top:50%; right:-.15rem; width:1rem; height:1rem; transform:translateY(-50%); border-radius:50%; background:#effcff; box-shadow:0 0 8px #fff,0 0 22px #7de3ff,0 0 38px rgba(160,111,255,.7); }
    .readiness-stage { margin:.6rem 0 0; color:#fff; font-size:.77rem; font-weight:700; }
    .readiness-note { margin:.25rem 0 0; color:rgba(255,255,255,.42); font-size:.68rem; line-height:1.45; }
    @keyframes readiness-drift { from { transform:translateX(-40px); } to { transform:translateX(40px); } }

    .hero-product { position:relative; min-height:clamp(560px,64vw,800px); transform:translateY(calc(var(--hero-progress) * -36px)) scale(calc(.965 + var(--hero-progress) * .055)); transform-origin:50% 70%; }
    .hero-device { position:absolute; overflow:hidden; border:1px solid rgba(255,255,255,.16); background:#06101e; box-shadow:0 40px 130px rgba(0,0,0,.58); }
    .hero-device-main { z-index:3; left:50%; bottom:0; width:min(360px,31vw); aspect-ratio:390/844; transform:translateX(-50%); border-radius:2.8rem; }
    .hero-device-left,.hero-device-right { z-index:2; bottom:7%; width:min(300px,26vw); aspect-ratio:390/844; border-radius:2.5rem; opacity:.72; filter:saturate(.86) brightness(.78); }
    .hero-device-left { left:3%; transform:perspective(1000px) rotateY(11deg) rotateZ(-4deg) scale(.91); }
    .hero-device-right { right:3%; transform:perspective(1000px) rotateY(-11deg) rotateZ(4deg) scale(.91); }
    .terra-preview-frame { width:100%; height:100%; border:0; pointer-events:none; background:#030914; }
    .hero-device::after { content:""; position:absolute; inset:0; border-radius:inherit; box-shadow:inset 0 1px 0 rgba(255,255,255,.12); pointer-events:none; }

    .manifesto { background:var(--paper); color:var(--ink); }
    .manifesto-inner { width:min(calc(100% - 2.5rem),var(--content)); margin:0 auto; padding:clamp(7rem,13vw,12rem) 0; }
    .manifesto .section-kicker { color:#236e8c; }
    .manifesto h2,.look h2,.live-copy h2,.confirmation-intro h2,.finale h2,.immersive-copy h2 { margin:0; font-size:clamp(3.4rem,7.1vw,7.25rem); line-height:.9; letter-spacing:-.065em; text-wrap:balance; }
    .manifesto-lead { max-width:850px; margin:1.6rem 0 0; color:#5a5a62; font-size:clamp(1.2rem,2vw,1.6rem); line-height:1.45; }
    .principles { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:clamp(1.5rem,4vw,4.5rem); margin-top:clamp(4rem,7vw,6.5rem); }
    .principle { padding-top:1rem; border-top:1px solid rgba(22,22,26,.16); }
    .principle strong { display:block; font-size:clamp(1.25rem,2vw,1.6rem); letter-spacing:-.035em; }
    .principle p { margin:.7rem 0 0; color:#6b6b73; font-size:.9rem; line-height:1.55; }

    .immersive { position:relative; min-height:100svh; overflow:hidden; display:grid; align-items:end; isolation:isolate; background:#031224; }
    .immersive-art { position:absolute; z-index:-3; inset:0; width:100%; height:100%; object-fit:cover; }
    .immersive::before { content:""; position:absolute; z-index:-2; inset:0; background:linear-gradient(90deg,rgba(1,10,24,.7) 0%,rgba(2,14,34,.25) 46%,rgba(3,3,18,.36) 100%),linear-gradient(0deg,rgba(0,0,0,.58),transparent 42%); }
    .immersive-inner { position:relative; width:min(calc(100% - 2.5rem),var(--wide)); min-height:100svh; margin:0 auto; padding:clamp(7rem,13vh,10rem) 0 clamp(4rem,8vh,6rem); display:flex; flex-direction:column; justify-content:flex-end; }
    .immersive-copy { position:relative; z-index:4; max-width:850px; }
    .immersive-copy h2 { font-size:clamp(4.2rem,9.3vw,9rem); }
    .immersive-status { position:absolute; z-index:4; min-width:230px; max-width:330px; padding:1rem; border:1px solid rgba(255,255,255,.14); border-radius:1.25rem; background:rgba(10,27,51,.58); box-shadow:0 24px 80px rgba(0,0,0,.28); -webkit-backdrop-filter:blur(22px) saturate(145%); backdrop-filter:blur(22px) saturate(145%); }
    .immersive-status small { display:block; color:rgba(255,255,255,.52); font-size:.68rem; }
    .immersive-status strong { display:block; margin-top:.35rem; font-size:1rem; }
    .immersive-status-home { top:20%; right:7%; }
    .immersive-status-participate { top:45%; right:19%; }
    .immersive-liquid { position:absolute; z-index:4; right:7%; bottom:8%; width:min(340px,38vw); height:4.3rem; display:grid; grid-template-columns:repeat(5,1fr); align-items:center; padding:.35rem; border:1px solid rgba(255,255,255,.16); border-radius:1.55rem; background:rgba(20,34,57,.58); -webkit-backdrop-filter:blur(24px) saturate(150%); backdrop-filter:blur(24px) saturate(150%); }
    .immersive-liquid i { width:1.25rem; height:1.25rem; justify-self:center; border:1.8px solid rgba(255,255,255,.54); border-radius:.38rem; }
    .immersive-liquid i:first-child { background:rgba(255,255,255,.15); border-color:#fff; }

    .look { position:relative; overflow:hidden; padding:clamp(7rem,11vw,10rem) 0 clamp(7rem,10vw,9rem); background:#111113; }
    .look::before { content:""; position:absolute; inset:0; background:url('/terraos-maintenance/purple-tunnel.svg') center/cover no-repeat; opacity:.13; pointer-events:none; }
    .look-head { position:relative; z-index:2; width:min(calc(100% - 2.5rem),var(--wide)); margin:0 auto 3rem; display:flex; align-items:end; justify-content:space-between; gap:2rem; }
    .look-controls { display:flex; gap:.55rem; }
    .look-control { width:3rem; height:3rem; display:grid; place-items:center; border:1px solid rgba(255,255,255,.14); border-radius:50%; background:rgba(255,255,255,.07); color:#fff; cursor:pointer; }
    .look-control:hover { background:rgba(255,255,255,.12); }
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
    .look-preview { position:absolute; left:8%; right:8%; bottom:-11%; height:72%; overflow:hidden; border:1px solid rgba(255,255,255,.15); border-radius:2.3rem 2.3rem 0 0; background:#041020; box-shadow:0 28px 70px rgba(0,0,0,.48); }

    .live { position:relative; min-height:120svh; overflow:hidden; isolation:isolate; background:#000; }
    .live-art { position:absolute; z-index:-4; inset:0; width:100%; height:100%; object-fit:cover; }
    .live::before { content:""; position:absolute; z-index:-3; inset:0; background:linear-gradient(180deg,rgba(0,0,0,.28),rgba(0,0,0,.1) 35%,rgba(0,0,0,.76) 88%,#000),linear-gradient(90deg,rgba(0,0,0,.52),transparent 62%); }
    .live-inner { width:min(calc(100% - 2.5rem),var(--wide)); min-height:120svh; margin:0 auto; display:grid; grid-template-columns:minmax(0,.8fr) minmax(430px,1.2fr); align-items:center; gap:clamp(2rem,6vw,7rem); padding:8rem 0; }
    .live-copy { align-self:start; position:sticky; top:20vh; padding-top:4vh; }
    .live-copy p:not(.section-kicker) { max-width:33rem; margin:1.3rem 0 0; color:rgba(255,255,255,.62); font-size:1rem; line-height:1.55; }
    .live-ui { align-self:center; min-height:640px; padding:clamp(1.2rem,3vw,2.2rem); border:1px solid rgba(255,255,255,.14); border-radius:2.4rem; background:rgba(3,11,23,.68); box-shadow:0 45px 130px rgba(0,0,0,.5); -webkit-backdrop-filter:blur(24px) saturate(140%); backdrop-filter:blur(24px) saturate(140%); }
    .live-top { display:flex; align-items:center; justify-content:space-between; gap:1rem; color:rgba(255,255,255,.58); font-size:.72rem; text-transform:uppercase; letter-spacing:.12em; }
    .live-chip { padding:.45rem .72rem; border:1px solid rgba(255,255,255,.15); border-radius:999px; color:#fff; background:rgba(255,255,255,.06); }
    .live-now { margin-top:4rem; }
    .live-now small { color:#70ddff; font-size:.72rem; font-weight:700; letter-spacing:.14em; text-transform:uppercase; }
    .live-now strong { display:block; margin-top:.6rem; font-family:"Classica Crastao",Georgia,serif; font-size:clamp(4rem,8vw,7rem); font-weight:400; line-height:.9; letter-spacing:-.045em; }
    .live-meta { margin-top:1.2rem; padding-top:1rem; border-top:1px solid rgba(255,255,255,.09); color:rgba(255,255,255,.64); }
    .live-steps { display:grid; gap:.55rem; margin-top:4rem; }
    .live-step { min-height:3.6rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:.75rem .9rem; border:1px solid rgba(255,255,255,.08); border-radius:1rem; color:rgba(255,255,255,.42); background:rgba(255,255,255,.03); transition:background .25s ease,color .25s ease,border-color .25s ease; }
    .live-step[data-active="true"] { color:#fff; border-color:rgba(123,222,255,.26); background:rgba(80,176,255,.11); }
    .live-step span { font-size:.75rem; font-weight:700; }
    .live-step small { color:inherit; opacity:.7; }

    .confirmation-section { background:#f4f6f8; color:#16171a; padding:clamp(7rem,12vw,11rem) 0; }
    .confirmation-layout { width:min(calc(100% - 2.5rem),var(--content)); margin:0 auto; }
    .confirmation-intro { max-width:920px; }
    .confirmation-intro .section-kicker { color:#226c89; }
    .confirmation-intro p:not(.section-kicker) { max-width:720px; margin:1.4rem 0 0; color:#64666d; font-size:clamp(1rem,1.7vw,1.22rem); line-height:1.55; }
    .confirmation-host { margin-top:clamp(3rem,6vw,5rem); }
    .confirmation-fallback { max-width:820px; margin:0 auto; padding:1.15rem 1.2rem; border:1px solid rgba(20,35,50,.1); border-radius:1.4rem; background:#fff; color:#50545a; font-size:.86rem; line-height:1.5; box-shadow:0 25px 70px rgba(31,43,55,.07); }
    .confirmation-host .hod-portal { max-width:820px; margin:0 auto!important; padding:clamp(1.2rem,3vw,2rem)!important; border-radius:2rem!important; border-color:rgba(117,205,232,.22)!important; background:linear-gradient(180deg,rgba(15,38,66,.96),rgba(4,15,34,.99))!important; box-shadow:0 35px 90px rgba(25,42,56,.2),inset 0 1px 0 rgba(255,255,255,.08)!important; }
    .confirmation-host .hod-portal h2 { font-size:clamp(1.55rem,3vw,2.05rem)!important; letter-spacing:-.04em!important; }
    .confirmation-host .hod-portal-copy { font-size:.86rem!important; }
    .confirmation-host .hod-button { border-radius:999px!important; min-height:2.75rem!important; padding-inline:1rem!important; }
    .confirmation-host .hod-field input { min-height:3rem!important; border-radius:.9rem!important; }

    .finale { position:relative; min-height:82svh; display:grid; place-items:center; overflow:hidden; text-align:center; isolation:isolate; background:#000; }
    .finale::before { content:""; position:absolute; z-index:-2; inset:0; background:url('/terraos-maintenance/purple-tunnel.svg') center 58%/cover no-repeat; opacity:.18; }
    .finale::after { content:""; position:absolute; z-index:-1; inset:0; background:radial-gradient(circle at 50% 58%,transparent 0 18%,rgba(0,0,0,.32) 52%,#000 88%); }
    .finale-inner { width:min(calc(100% - 2.5rem),1000px); padding:8rem 0; }
    .finale .section-kicker { color:rgba(255,255,255,.52); }
    .finale h2 { font-size:clamp(4rem,9.4vw,9rem); }
    .finale p { margin:1.2rem auto 0; color:rgba(255,255,255,.6); font-size:1rem; }
    .finale-link { display:inline-flex; min-height:2.8rem; align-items:center; margin-top:1.6rem; padding:0 1rem; border:1px solid rgba(255,255,255,.14); border-radius:999px; background:rgba(255,255,255,.06); color:#fff; font-size:.76rem; font-weight:700; text-decoration:none; }

    footer { width:min(calc(100% - 2.5rem),var(--wide)); margin:0 auto; padding:2.3rem 0 max(2.3rem,env(safe-area-inset-bottom)); display:flex; align-items:flex-start; justify-content:space-between; gap:2rem; border-top:1px solid rgba(255,255,255,.08); color:rgba(255,255,255,.4); font-size:.68rem; line-height:1.5; }
    footer strong { display:block; color:rgba(255,255,255,.7); font-size:.7rem; }

    .scroll-in { opacity:0; transform:translateY(24px); transition:opacity .75s cubic-bezier(.2,.8,.2,1),transform .75s cubic-bezier(.2,.8,.2,1); }
    .scroll-in.seen { opacity:1; transform:none; }
    :focus-visible { outline:3px solid #7ddfff; outline-offset:3px; }

    @media (max-width:980px) {
      .product-links a:not(.confirmation-link) { display:none; }
      .hero { min-height:auto; padding-top:8.5rem; }
      .hero-grid { grid-template-columns:1fr; gap:2.8rem; }
      .hero-copy { max-width:780px; padding-bottom:0; }
      .hero-product { min-height:600px; width:min(100%,720px); margin:0 auto; }
      .hero-device-main { width:300px; }
      .hero-device-left,.hero-device-right { width:250px; }
      .principles { grid-template-columns:1fr; gap:2rem; }
      .immersive-status-home { right:4%; }
      .immersive-status-participate { right:10%; }
      .look-track { grid-auto-columns:min(560px,72vw); }
      .live { min-height:auto; }
      .live-inner { min-height:auto; grid-template-columns:1fr; padding:7rem 0; }
      .live-copy { position:relative; top:auto; align-self:auto; padding:0; }
      .live-ui { min-height:560px; }
    }

    @media (max-width:640px) {
      .product-bar { top:max(.45rem,env(safe-area-inset-top)); width:calc(100% - .9rem); min-height:3.1rem; padding:.45rem .5rem .45rem .75rem; border-radius:1.1rem; }
      .product-name span { font-size:.76rem; }
      .product-links .confirmation-link { min-height:2.15rem; padding:0 .7rem; font-size:.68rem; }
      .hero { min-height:100svh; padding:7.6rem .85rem 2.2rem; align-items:start; }
      .hero h1 { font-size:clamp(4rem,20vw,5.6rem); }
      .hero-tagline { font-size:clamp(2rem,10vw,3rem); }
      .hero-intro { font-size:.93rem; }
      .hero-actions { margin-top:1.2rem; }
      .release-card { margin-top:1.35rem; }
      .hero-product { min-height:430px; margin-top:.5rem; }
      .hero-device-main { width:min(230px,58vw); border-radius:2rem; }
      .hero-device-left,.hero-device-right { width:min(190px,48vw); border-radius:1.8rem; bottom:5%; }
      .hero-device-left { left:-4%; }
      .hero-device-right { right:-4%; }
      .manifesto-inner,.confirmation-layout,.look-head,.immersive-inner,.live-inner,.finale-inner { width:min(calc(100% - 1.5rem),var(--content)); }
      .manifesto-inner { padding:6rem 0 7rem; }
      .manifesto h2,.look h2,.live-copy h2,.confirmation-intro h2,.finale h2 { font-size:clamp(3.15rem,15vw,4.8rem); }
      .manifesto-lead { font-size:1.06rem; }
      .immersive { min-height:92svh; }
      .immersive-inner { min-height:92svh; padding:7rem 0 3rem; }
      .immersive-copy h2 { font-size:clamp(4rem,20vw,5.8rem); }
      .immersive-status { min-width:0; width:min(230px,68vw); padding:.85rem; }
      .immersive-status-home { top:16%; right:3%; }
      .immersive-status-participate { top:34%; right:11%; }
      .immersive-liquid { right:3%; bottom:16%; width:min(300px,78vw); height:3.8rem; }
      .look { padding:6rem 0 6.5rem; }
      .look-head { align-items:flex-start; }
      .look-controls { display:none; }
      .look-track { grid-auto-columns:86vw; gap:.85rem; padding-inline:.75rem; }
      .look-card { min-height:620px; border-radius:1.65rem; }
      .look-copy { padding:1.45rem; }
      .look-preview { left:5%; right:5%; height:70%; border-radius:1.8rem 1.8rem 0 0; }
      .live-inner { width:min(calc(100% - 1.5rem),var(--content)); padding:6.5rem 0; }
      .live-ui { min-height:500px; padding:1rem; border-radius:1.8rem; }
      .live-now { margin-top:3rem; }
      .live-now strong { font-size:4.7rem; }
      .live-steps { margin-top:3rem; }
      .confirmation-section { padding:6.5rem 0; }
      .confirmation-host { margin-top:2.5rem; }
      .confirmation-host .hod-portal { border-radius:1.6rem!important; }
      .finale { min-height:72svh; }
      footer { width:calc(100% - 1.5rem); flex-direction:column; gap:.4rem; }
    }

    @supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))) {
      .product-bar[data-scrolled="true"],.immersive-status,.immersive-liquid,.live-ui { background:rgba(15,26,45,.96); }
    }
    @media (prefers-reduced-transparency:reduce) {
      .product-bar[data-scrolled="true"],.immersive-status,.immersive-liquid,.live-ui { -webkit-backdrop-filter:none; backdrop-filter:none; background:rgba(15,26,45,.96); }
    }
    @media (prefers-reduced-motion:reduce) {
      html { scroll-behavior:auto; }
      *,*::before,*::after { animation-duration:.001ms!important; animation-iteration-count:1!important; transition-duration:.001ms!important; scroll-behavior:auto!important; }
      .hero-copy,.hero-product { transform:none!important; opacity:1!important; }
      .readiness-fill::before { animation:none!important; }
      .scroll-in { opacity:1!important; transform:none!important; }
    }
  </style>
</head>
<body>
<div class="content" data-solaris-maintenance="true">
  <nav class="product-bar" aria-label="TerraOS 3 page navigation" data-product-bar>
    <a class="product-name" href="#overview"><img class="product-mark" src="/solaris-studio-mark.png" alt="" aria-hidden="true" width="256" height="256" /><span>TerraOS 3</span></a>
    <div class="product-links">
      <a href="#overview">Overview</a>
      <a href="#preview">Preview</a>
      <a class="confirmation-link" href="#confirmation-access">Confirmation</a>
    </div>
  </nav>

  <header class="hero" id="overview" aria-labelledby="maintenance-title" data-hero>
    <div class="hero-grid">
      <div class="hero-copy">
        <p class="hero-kicker">Solaris Studio</p>
        <h1 id="maintenance-title">TerraOS 3</h1>
        <p class="hero-tagline">Solaris, reimagined.</p>
        <p class="hero-intro">A new generation of Solaris Studio is taking shape around what is happening, what matters to you, and what comes next.</p>
        <div class="hero-actions">
          <a class="hero-action hero-action-primary" href="#preview">Explore TerraOS 3</a>
          <a class="hero-action" href="#confirmation-access">Access Confirmation</a>
        </div>
        <div class="release-card">
          <div class="arrival-line">${arrivalMarkup}</div>
          <div class="readiness-head"><span>TerraOS 3 readiness</span><strong>${readiness.percent}%</strong></div>
          <div class="readiness-track" role="progressbar" aria-label="TerraOS 3 readiness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${readiness.percent}">
            <span class="readiness-fill" aria-hidden="true"></span>
          </div>
          <p class="readiness-stage">${readinessStage}</p>
          <p class="readiness-note">Based on tracked release criteria, not time elapsed.</p>
        </div>
      </div>

      <div class="hero-product" aria-label="TerraOS 3 interface preview">
        <div class="hero-device hero-device-left" aria-hidden="true">${previewFrame("participate", "TerraOS Participate preview")}</div>
        <div class="hero-device hero-device-main" aria-hidden="true">${previewFrame("home", "TerraOS Home preview", "eager")}</div>
        <div class="hero-device hero-device-right" aria-hidden="true">${previewFrame("explore", "TerraOS Explore preview")}</div>
      </div>
    </div>
  </header>

  <main class="product-story">
    <section class="manifesto" aria-labelledby="generation-title">
      <div class="manifesto-inner scroll-in">
        <p class="section-kicker">TerraOS 3</p>
        <h2 id="generation-title">A new generation of Solaris.</h2>
        <p class="manifesto-lead">Solaris Studio is being rebuilt around the contest itself: what is happening, what matters to you, and what you need to do next.</p>
        <div class="principles">
          <article class="principle"><strong>What matters now</strong><p>The important thing comes first instead of hiding behind a maze of competing screens.</p></article>
          <article class="principle"><strong>Everything in its place</strong><p>Discover, participate, follow results and manage your Solaris identity through a clearer structure.</p></article>
          <article class="principle"><strong>Built for the moment</strong><p>The experience can stay calm on ordinary days and become expressive when Solaris goes live.</p></article>
        </div>
      </div>
    </section>

    <section class="immersive" aria-labelledby="place-title">
      <img class="immersive-art" src="/terraos-maintenance/blue-motion.svg" alt="" aria-hidden="true" loading="lazy" />
      <div class="immersive-inner">
        <div class="immersive-copy scroll-in">
          <p class="section-kicker">Designed around you</p>
          <h2 id="place-title">Everything<br />in its place.</h2>
        </div>
        <div class="immersive-status immersive-status-home scroll-in" aria-hidden="true"><small>Right now</small><strong>You're all caught up ✓</strong></div>
        <div class="immersive-status immersive-status-participate scroll-in" aria-hidden="true"><small>Participate</small><strong>1 thing needs attention</strong></div>
        <div class="immersive-liquid scroll-in" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      </div>
    </section>

    <section class="look" id="preview" aria-labelledby="look-title">
      <div class="look-head scroll-in">
        <div><p class="section-kicker">TerraOS 3</p><h2 id="look-title">Take a closer look.</h2></div>
        <div class="look-controls" aria-label="Preview gallery controls">
          <button class="look-control" type="button" data-gallery-prev aria-label="Previous preview">←</button>
          <button class="look-control" type="button" data-gallery-next aria-label="Next preview">→</button>
        </div>
      </div>
      <div class="look-track" data-look-track tabindex="0" aria-label="TerraOS 3 destinations">
        ${galleryMarkup()}
      </div>
    </section>

    <section class="live" aria-labelledby="live-title" data-live-section>
      <img class="live-art" src="/terraos-maintenance/live-stage.svg" alt="" aria-hidden="true" loading="lazy" />
      <div class="live-inner">
        <div class="live-copy scroll-in">
          <p class="section-kicker">Live</p>
          <h2 id="live-title">Built for<br />contest night.</h2>
          <p>When Solaris goes live, TerraOS moves with it without turning every ordinary screen into a permanent light show.</p>
        </div>
        <div class="live-ui scroll-in" aria-label="Illustrative TerraOS Live preview">
          <div class="live-top"><span>SSC 22 · Grand Final</span><span class="live-chip" data-live-chip>Live</span></div>
          <div class="live-now"><small data-live-kicker>Now</small><strong data-live-main>12 · Oland</strong><div class="live-meta" data-live-meta>Artist · Song</div></div>
          <div class="live-steps" aria-hidden="true">
            <div class="live-step" data-live-step="0" data-active="true"><span>SHOW</span><small>Performance sequence</small></div>
            <div class="live-step" data-live-step="1" data-active="false"><span>VOTING OPEN</span><small>Participation becomes available</small></div>
            <div class="live-step" data-live-step="2" data-active="false"><span>RESULTS</span><small>Published outcome</small></div>
          </div>
        </div>
      </div>
    </section>

    <section class="confirmation-section" id="confirmation-access" aria-labelledby="confirmation-title">
      <div class="confirmation-layout">
        <div class="confirmation-intro scroll-in">
          <p class="section-kicker">Available during the transition</p>
          <h2 id="confirmation-title">Your delegation<br />keeps moving.</h2>
          <p>While TerraOS 3 is being prepared, eligible delegation members can continue managing their current Confirmation. The rest of Solaris Studio remains under maintenance.</p>
        </div>
        <div class="confirmation-host" data-confirmation-host>
          <div class="confirmation-fallback" data-confirmation-fallback>Confirmation access appears here for eligible delegation accounts.</div>
        </div>
      </div>
    </section>

    <section class="finale" aria-labelledby="finale-title">
      <div class="finale-inner scroll-in">
        <p class="section-kicker">Solaris Studio</p>
        <h2 id="finale-title">TerraOS 3</h2>
        <p>Built for what happens next.</p>
        <a class="finale-link" href="#confirmation-access">Confirmation access ↑</a>
      </div>
    </section>
  </main>

          <footer>
    <div><strong>Terra Solaris Broadcasting Coalition</strong>Solaris Studio · TerraOS 3</div>
    <div>Maintenance notice updated ${updated} · HTTP 503</div>
  </footer>
</div>
<script>
(function(){
  var root=document.querySelector('[data-solaris-maintenance="true"]');
  var portal=document.querySelector('.hod-portal');
  var confirmationHost=document.querySelector('[data-confirmation-host]');
  var confirmationFallback=document.querySelector('[data-confirmation-fallback]');
  if(root&&portal&&confirmationHost){
    confirmationHost.appendChild(portal);
    if(confirmationFallback)confirmationFallback.hidden=true;
  }

  var productBar=document.querySelector('[data-product-bar]');
  function syncProductBar(){if(productBar)productBar.setAttribute('data-scrolled',window.scrollY>28?'true':'false');}
  syncProductBar();
  window.addEventListener('scroll',syncProductBar,{passive:true});

  var reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  var hero=document.querySelector('[data-hero]');
  var heroFrame=0;
  function clamp01(value){return Math.max(0,Math.min(1,value));}
  function updateHero(){
    heroFrame=0;
    if(!hero||reduceMotion.matches){if(hero)hero.style.setProperty('--hero-progress','0');return;}
    var travel=Math.max(320,Math.min(hero.offsetHeight*.8,window.innerHeight*.9));
    var progress=clamp01(window.scrollY/travel);
    hero.style.setProperty('--hero-progress',progress.toFixed(4));
  }
  function requestHero(){if(!heroFrame)heroFrame=requestAnimationFrame(updateHero);}
  updateHero();
  window.addEventListener('scroll',requestHero,{passive:true});
  window.addEventListener('resize',requestHero,{passive:true});

  var track=document.querySelector('[data-look-track]');
  var prev=document.querySelector('[data-gallery-prev]');
  var next=document.querySelector('[data-gallery-next]');
  function galleryStep(direction){
    if(!track)return;
    var card=track.querySelector('[data-look-card]');
    var gap=parseFloat(getComputedStyle(track).columnGap||getComputedStyle(track).gap||'0')||0;
    var width=card?card.getBoundingClientRect().width:track.clientWidth*.82;
    track.scrollBy({left:(width+gap)*direction,behavior:reduceMotion.matches?'auto':'smooth'});
  }
  if(prev)prev.addEventListener('click',function(){galleryStep(-1);});
  if(next)next.addEventListener('click',function(){galleryStep(1);});
  if(track)track.addEventListener('keydown',function(event){if(event.key==='ArrowRight'){event.preventDefault();galleryStep(1);}if(event.key==='ArrowLeft'){event.preventDefault();galleryStep(-1);}});

  var live=document.querySelector('[data-live-section]');
  var liveSteps=Array.from(document.querySelectorAll('[data-live-step]'));
  var liveChip=document.querySelector('[data-live-chip]');
  var liveKicker=document.querySelector('[data-live-kicker]');
  var liveMain=document.querySelector('[data-live-main]');
  var liveMeta=document.querySelector('[data-live-meta]');
  var liveFrame=0;
  var liveStates=[
    {chip:'Live',kicker:'Now',main:'12 · Oland',meta:'Artist · Song'},
    {chip:'Voting open',kicker:'Participate',main:'Voting is open',meta:'The active action comes forward.'},
    {chip:'Published',kicker:'Results',main:'The outcome',meta:'Official results become the focus.'}
  ];
  function setLiveState(index){
    var state=liveStates[index]||liveStates[0];
    liveSteps.forEach(function(step,i){step.setAttribute('data-active',i===index?'true':'false');});
    if(liveChip)liveChip.textContent=state.chip;
    if(liveKicker)liveKicker.textContent=state.kicker;
    if(liveMain)liveMain.textContent=state.main;
    if(liveMeta)liveMeta.textContent=state.meta;
  }
  function updateLive(){
    liveFrame=0;
    if(!live||reduceMotion.matches){setLiveState(0);return;}
    var rect=live.getBoundingClientRect();
    var total=Math.max(1,rect.height-window.innerHeight);
    var progress=clamp01((-rect.top)/total);
    setLiveState(progress<.34?0:progress<.7?1:2);
  }
  function requestLive(){if(!liveFrame)liveFrame=requestAnimationFrame(updateLive);}
  updateLive();
  window.addEventListener('scroll',requestLive,{passive:true});
  window.addEventListener('resize',requestLive,{passive:true});

  if('IntersectionObserver'in window&&!reduceMotion.matches){
    var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('seen');observer.unobserve(entry.target);}});},{threshold:.12});
    document.querySelectorAll('.scroll-in').forEach(function(node){observer.observe(node);});
  }else{
    document.querySelectorAll('.scroll-in').forEach(function(node){node.classList.add('seen');});
  }
})();
</script>
</body>
</html>`;
}
