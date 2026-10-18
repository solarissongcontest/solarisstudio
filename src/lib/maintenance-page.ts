import {
  MAINTENANCE_LAST_UPDATED,
  MAINTENANCE_RETURN_DATE,
  TERRAOS3_ESTIMATED_LAUNCH_AT,
} from "./maintenance";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderMaintenancePage(): string {
  const returnDate = escapeHtml(MAINTENANCE_RETURN_DATE);
  const updated = escapeHtml(MAINTENANCE_LAST_UPDATED);
  const launchAt = escapeHtml(TERRAOS3_ESTIMATED_LAUNCH_AT);

  return `<!doctype html>
<html lang="en" data-terraos-launch-at="${launchAt}">
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
      --muted:rgba(245,245,247,.62);
      --soft:rgba(245,245,247,.42);
      --muted-soft:var(--soft);
      --line:rgba(255,255,255,.09);
      --blue:#aee7ff;
      --primary:var(--blue);
      --wide:1180px;
      --narrow:900px;
      font-family:"Gotham",ui-sans-serif,system-ui,sans-serif;
      color:var(--fg);
      background:var(--bg);
    }
    * { box-sizing:border-box; }
    html { min-height:100%; background:#000; scroll-behavior:smooth; }
    body { margin:0; min-height:100svh; overflow-x:hidden; background:radial-gradient(circle at 50% -10%,rgba(80,160,198,.15),transparent 34rem),#000; color:var(--fg); letter-spacing:-.015em; -webkit-font-smoothing:antialiased; }
    button,input { font:inherit; }
    button { -webkit-tap-highlight-color:transparent; }
    .content { display:flex; min-height:100svh; flex-direction:column; }
    .hero { order:1; }
    .hod-portal { order:2; width:min(calc(100% - 2rem),var(--narrow)); margin-inline:auto; }
    .product-story { order:3; }
    footer { order:4; }

    .site-nav { position:absolute; z-index:20; top:max(16px,env(safe-area-inset-top)); left:50%; width:min(calc(100% - 2rem),var(--wide)); transform:translateX(-50%); display:flex; align-items:center; justify-content:space-between; pointer-events:none; }
    .brand { display:flex; align-items:center; gap:.7rem; pointer-events:auto; }
    .mark { width:38px; height:38px; border-radius:999px; object-fit:contain; }
    .brand-name { display:block; font-family:"Classica Crastao",Georgia,serif; font-size:.88rem; letter-spacing:.045em; text-transform:uppercase; }
    .brand-sub { display:block; margin-top:.12rem; color:var(--soft); font-size:.62rem; }
    .maintenance-pill { display:inline-flex; align-items:center; gap:.44rem; min-height:34px; padding:.45rem .7rem; border:1px solid rgba(255,255,255,.1); border-radius:999px; background:rgba(14,14,16,.68); color:rgba(245,245,247,.7); font-size:.66rem; font-weight:700; -webkit-backdrop-filter:blur(18px); backdrop-filter:blur(18px); }
    .maintenance-pill::before { content:""; width:.45rem; height:.45rem; border-radius:50%; background:#efc36f; }

    .hero { position:relative; min-height:min(1000px,100svh); overflow:hidden; display:grid; align-content:start; justify-items:center; padding:clamp(8rem,16vh,11rem) 1rem 2rem; isolation:isolate; }
    .hero::before { content:""; position:absolute; z-index:-2; inset:0; background:radial-gradient(circle at 50% 25%,rgba(101,190,229,.15),transparent 27rem),linear-gradient(180deg,#020304,#000 58%); }
    .hero::after { content:""; position:absolute; z-index:-1; top:47%; left:50%; width:min(950px,95vw); aspect-ratio:1.7; transform:translate(-50%,-50%); border-radius:50%; background:radial-gradient(ellipse,rgba(93,195,239,.10),transparent 68%); filter:blur(20px); }
    .hero-copy { position:relative; z-index:2; width:min(100%,950px); text-align:center; }
    .kicker { margin:0; color:rgba(245,245,247,.58); font-size:.75rem; font-weight:700; letter-spacing:.17em; text-transform:uppercase; }
    .hero h1 { margin:.8rem 0 0; font-family:"Classica Crastao",Georgia,serif; font-size:clamp(4.25rem,13vw,9.8rem); font-weight:400; line-height:.86; letter-spacing:-.025em; text-transform:uppercase; text-wrap:balance; }
    .tagline { margin:1.25rem auto 0; color:rgba(245,245,247,.9); font-size:clamp(1.18rem,2.8vw,2rem); font-weight:500; line-height:1.12; letter-spacing:-.035em; }
    .launch { margin:clamp(2rem,5vw,3.2rem) auto 0; display:grid; justify-items:center; gap:.7rem; }
    .launch-label { color:var(--soft); font-size:.68rem; font-weight:700; letter-spacing:.14em; text-transform:uppercase; }
    .launch-date { font-size:clamp(.95rem,2vw,1.16rem); font-weight:700; }
    .countdown { display:flex; align-items:flex-start; justify-content:center; gap:clamp(.3rem,1.2vw,.85rem); margin-top:.15rem; font-variant-numeric:tabular-nums; }
    .countdown-unit { min-width:clamp(3.7rem,10vw,6.2rem); text-align:center; }
    .countdown-value { display:block; font-size:clamp(2.1rem,7.7vw,4.7rem); font-weight:500; line-height:.92; letter-spacing:-.06em; }
    .countdown-name { display:block; margin-top:.45rem; color:rgba(245,245,247,.4); font-size:.6rem; font-weight:700; letter-spacing:.11em; text-transform:uppercase; }
    .colon { margin-top:clamp(.35rem,1.3vw,.75rem); color:rgba(245,245,247,.25); font-size:clamp(1.8rem,6vw,3.5rem); line-height:1; }

    .hero-stage { position:relative; width:min(1120px,116vw); height:clamp(310px,44vw,535px); margin-top:clamp(2.2rem,5vw,3.8rem); perspective:1400px; pointer-events:none; }
    .phone { position:absolute; left:50%; top:50%; width:clamp(180px,23vw,286px); aspect-ratio:.49; overflow:hidden; border:1px solid rgba(255,255,255,.19); border-radius:clamp(28px,4vw,44px); background:linear-gradient(180deg,#191d24,#060709 74%); box-shadow:0 45px 120px rgba(0,0,0,.64),inset 0 0 0 1px rgba(255,255,255,.04); }
    .phone::before { content:""; position:absolute; z-index:5; top:10px; left:50%; width:31%; height:18px; transform:translateX(-50%); border-radius:999px; background:#020203; }
    .phone.center { z-index:3; transform:translate(-50%,-45%); }
    .phone.left { z-index:1; transform:translate(-145%,-36%) rotateY(18deg) rotateZ(-4deg) scale(.88); opacity:.67; }
    .phone.right { z-index:2; transform:translate(45%,-36%) rotateY(-18deg) rotateZ(4deg) scale(.88); opacity:.67; }
    .screen { position:absolute; inset:0; padding:2.8rem .8rem .8rem; background:radial-gradient(circle at 45% 12%,rgba(98,190,226,.16),transparent 27%),linear-gradient(180deg,#11151c,#050608 72%); }
    .micro-label { color:rgba(255,255,255,.42); font-size:.45rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
    .screen-title { margin-top:.4rem; font-size:clamp(.9rem,1.5vw,1.2rem); font-weight:700; letter-spacing:-.04em; }
    .mini-card { margin-top:.72rem; padding:.72rem; border:1px solid rgba(255,255,255,.08); border-radius:1rem; background:rgba(255,255,255,.05); }
    .mini-row { display:flex; align-items:center; justify-content:space-between; gap:.5rem; color:rgba(255,255,255,.7); font-size:.53rem; }
    .mini-row + .mini-row { margin-top:.55rem; }
    .mini-row strong { color:#fff; font-size:.58rem; }
    .good { color:#c9f6dc; font-weight:700; }
    .phone-nav { position:absolute; left:.58rem; right:.58rem; bottom:.58rem; height:2.55rem; display:grid; grid-template-columns:repeat(5,1fr); align-items:center; padding:.22rem; border:1px solid rgba(255,255,255,.13); border-radius:999px; background:rgba(20,23,28,.64); -webkit-backdrop-filter:blur(18px); backdrop-filter:blur(18px); }
    .phone-nav i { width:.75rem; height:.75rem; margin:auto; border:1.5px solid rgba(255,255,255,.58); border-radius:50%; }
    .phone-nav i.on { border-color:#fff; background:#fff; box-shadow:0 0 0 .4rem rgba(255,255,255,.08); }
    .result-list { margin-top:1rem; display:grid; gap:.55rem; }
    .result-list div { display:grid; grid-template-columns:1.2rem 1fr auto; gap:.45rem; align-items:center; color:rgba(255,255,255,.55); font-size:.52rem; }
    .result-list div::before { content:""; width:1.2rem; aspect-ratio:3/2; border-radius:.18rem; background:linear-gradient(135deg,#6cc8ed,#665bbd); }
    .bar { height:.42rem; max-width:5rem; border-radius:999px; background:rgba(255,255,255,.15); }

    .product-story { background:#000; }
    .story { position:relative; width:min(calc(100% - 2rem),var(--wide)); margin:0 auto; padding:clamp(6rem,13vw,10.5rem) 0; }
    .story + .story { border-top:1px solid rgba(255,255,255,.06); }
    .story h2 { max-width:900px; margin:0; font-size:clamp(2.6rem,7vw,6.1rem); line-height:.94; letter-spacing:-.065em; text-wrap:balance; }
    .story h2.small { font-size:clamp(2.2rem,5.4vw,4.4rem); }
    .highlights { margin-top:clamp(2.2rem,5vw,4rem); display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:1rem; }
    .highlight { position:relative; min-height:clamp(350px,42vw,550px); overflow:hidden; padding:clamp(1.25rem,3vw,2rem); border:1px solid var(--line); border-radius:clamp(1.6rem,3.2vw,2.5rem); background:radial-gradient(circle at 50% 100%,rgba(101,182,219,.13),transparent 58%),#101012; }
    .highlight h3 { position:relative; z-index:2; margin:0; max-width:14rem; font-size:clamp(1.55rem,3.1vw,2.5rem); line-height:.98; letter-spacing:-.05em; }
    .highlight small { position:absolute; z-index:2; left:clamp(1.25rem,3vw,2rem); bottom:clamp(1.25rem,3vw,2rem); color:rgba(255,255,255,.46); font-size:.65rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; }
    .orbit { position:absolute; left:50%; bottom:-12%; width:84%; aspect-ratio:1; transform:translateX(-50%); border:1px solid rgba(255,255,255,.1); border-radius:50%; box-shadow:inset 0 0 70px rgba(103,191,227,.1); }
    .orbit::after { content:""; position:absolute; inset:18%; border:1px solid rgba(255,255,255,.1); border-radius:50%; }

    .story-grid { margin-top:clamp(2.7rem,7vw,5.4rem); display:grid; grid-template-columns:minmax(0,.82fr) minmax(0,1.18fr); gap:clamp(2rem,7vw,7rem); align-items:start; }
    .story-copy { position:sticky; top:max(6rem,12vh); padding-top:1rem; }
    .story-copy p { max-width:31rem; margin:1.2rem 0 0; color:rgba(245,245,247,.56); font-size:clamp(.92rem,1.65vw,1.15rem); line-height:1.55; }
    .visual { min-height:clamp(480px,70vw,820px); display:grid; place-items:center; }

    .liquid-shell { width:min(100%,660px); padding:clamp(1rem,3vw,1.8rem); border:1px solid var(--line); border-radius:clamp(1.8rem,4vw,3rem); background:radial-gradient(circle at 50% 18%,rgba(96,185,226,.11),transparent 30%),linear-gradient(180deg,#13161c,#08090c); box-shadow:0 45px 120px rgba(0,0,0,.55); }
    .liquid-screen { min-height:clamp(330px,50vw,500px); display:grid; align-content:end; overflow:hidden; border:1px solid rgba(255,255,255,.07); border-radius:clamp(1.3rem,3vw,2.1rem); background:radial-gradient(circle at 52% 18%,rgba(87,177,216,.2),transparent 30%),linear-gradient(180deg,#10131a,#050608); }
    .liquid-copy { padding:1.2rem 1.2rem 1.45rem; }
    .liquid-copy span { color:rgba(255,255,255,.43); font-size:.65rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
    .liquid-copy strong { display:block; margin-top:.45rem; font-size:clamp(1.6rem,3vw,2.5rem); letter-spacing:-.05em; }
    .liquid { --p:0; position:relative; width:calc(100% - 1.4rem); height:4.2rem; margin:0 auto .7rem; display:flex; align-items:center; padding:.35rem; touch-action:none; user-select:none; border:1px solid rgba(255,255,255,.14); border-radius:999px; background:rgba(30,33,39,.6); box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 12px 36px rgba(0,0,0,.3); -webkit-backdrop-filter:blur(22px) saturate(165%); backdrop-filter:blur(22px) saturate(165%); }
    .lens { position:absolute; z-index:1; top:.35rem; bottom:.35rem; left:.35rem; width:calc((100% - .7rem)/5); border:1px solid rgba(255,255,255,.18); border-radius:999px; background:linear-gradient(145deg,rgba(255,255,255,.19),rgba(255,255,255,.075)); box-shadow:inset 0 1px 0 rgba(255,255,255,.2),0 5px 18px rgba(0,0,0,.24); transform:translateX(calc(var(--p)*100%)); transition:transform .4s cubic-bezier(.2,.8,.2,1),border-radius .2s; pointer-events:none; }
    .liquid[data-dragging="true"] .lens { border-radius:42% 58% 58% 42%/50%; }
    .tab { position:relative; z-index:2; flex:1 1 20%; min-width:0; height:100%; display:grid; place-items:center; gap:.12rem; padding:.3rem .12rem; border:0; border-radius:999px; background:transparent; color:rgba(255,255,255,.46); cursor:pointer; }
    .tab[aria-selected="true"] { color:#fff; }
    .tab-icon { width:1.15rem; height:1.15rem; border:1.7px solid currentColor; border-radius:50%; }
    .tab:nth-of-type(4) .tab-icon { border-radius:.32rem; transform:rotate(45deg) scale(.88); }
    .tab:nth-of-type(5) .tab-icon { border-radius:.18rem; }
    .tab span:last-child { font-size:clamp(.45rem,1.3vw,.6rem); font-weight:700; white-space:nowrap; }
    .hint { margin:.65rem 0 0; text-align:center; color:rgba(255,255,255,.4); font-size:.68rem; }

    .part-phone { width:min(360px,82vw); padding:.8rem; border:1px solid rgba(255,255,255,.14); border-radius:2.5rem; background:#0a0b0e; box-shadow:0 45px 120px rgba(0,0,0,.58); }
    .part-screen { min-height:610px; padding:2rem 1rem 1rem; border-radius:1.9rem; background:radial-gradient(circle at 52% 0%,rgba(90,182,223,.18),transparent 25%),#101217; }
    .part-title { margin:.2rem 0 1.4rem; font-size:1.8rem; letter-spacing:-.055em; }
    .part-list { display:grid; gap:.72rem; }
    .part-card { display:grid; grid-template-columns:auto 1fr auto; align-items:center; gap:.72rem; min-height:4.2rem; padding:.72rem .8rem; border:1px solid rgba(255,255,255,.08); border-radius:1rem; background:rgba(255,255,255,.045); }
    .part-index { width:2.2rem; height:2.2rem; display:grid; place-items:center; border-radius:.72rem; background:rgba(255,255,255,.07); color:rgba(255,255,255,.62); font-size:.62rem; font-weight:800; }
    .part-card strong { display:block; font-size:.82rem; }
    .part-card small { display:block; margin-top:.16rem; color:rgba(255,255,255,.44); font-size:.62rem; }
    .part-state { color:rgba(255,255,255,.62); font-size:.62rem; font-weight:700; }
    .part-card[data-tone="good"] .part-state { color:#bdf4d8; }
    .part-card[data-tone="action"] .part-state { color:#ffc1c1; }
    .part-card[data-tone="soon"] .part-state { color:#ffe19a; }

    .results { position:relative; width:min(840px,100%); min-height:600px; overflow:hidden; display:grid; align-items:end; border:1px solid var(--line); border-radius:clamp(1.8rem,4vw,3rem); background:radial-gradient(circle at 50% 18%,rgba(78,162,205,.17),transparent 27rem),#08090c; box-shadow:0 45px 130px rgba(0,0,0,.55); }
    .points { position:absolute; inset:0; pointer-events:none; }
    .point { position:absolute; font-size:clamp(4.6rem,12vw,9.5rem); font-weight:700; letter-spacing:-.08em; }
    .p12 { top:9%; left:8%; opacity:.92; } .p10 { top:27%; right:10%; opacity:.44; } .p8 { top:49%; left:28%; opacity:.2; }
    .results-panel { position:relative; z-index:2; margin:0 clamp(1rem,4vw,2.4rem) clamp(1rem,4vw,2.4rem); padding:clamp(1rem,3vw,1.6rem); border:1px solid rgba(255,255,255,.1); border-radius:1.6rem; background:rgba(18,20,25,.7); -webkit-backdrop-filter:blur(24px); backdrop-filter:blur(24px); }
    .results-head { display:flex; justify-content:space-between; align-items:baseline; gap:1rem; margin-bottom:.75rem; }
    .results-head span { color:var(--soft); font-size:.65rem; }
    .result-row { display:grid; grid-template-columns:2rem 1fr auto; align-items:center; gap:.8rem; min-height:3.1rem; border-top:1px solid rgba(255,255,255,.07); }
    .rank { color:var(--soft); font-size:.7rem; font-weight:700; }
    .country { display:flex; align-items:center; gap:.65rem; }
    .flag { width:2rem; aspect-ratio:3/2; border-radius:.24rem; background:linear-gradient(135deg,#6ac8ee,#6659bc); }
    .country-bar { width:min(8rem,35vw); height:.55rem; border-radius:999px; background:rgba(255,255,255,.14); }
    .mask { position:absolute; z-index:3; left:0; right:0; bottom:0; height:31%; background:linear-gradient(180deg,transparent,#08090c 84%); pointer-events:none; }
    .details { margin-top:clamp(2.5rem,5vw,4rem); display:grid; grid-template-columns:1.1fr .9fr 1fr; gap:.8rem; }
    .detail { position:relative; min-height:clamp(250px,29vw,380px); overflow:hidden; border:1px solid var(--line); border-radius:1.5rem; background:radial-gradient(circle at 50% 100%,rgba(86,180,220,.12),transparent 55%),#111216; }
    .detail::after { content:""; position:absolute; left:10%; right:10%; bottom:14%; height:3.8rem; border:1px solid rgba(255,255,255,.13); border-radius:999px; background:rgba(255,255,255,.055); -webkit-backdrop-filter:blur(16px); backdrop-filter:blur(16px); }
    .detail:nth-child(2)::after { top:16%; bottom:auto; height:52%; border-radius:1.2rem; }
    .detail:nth-child(3)::after { left:20%; right:20%; bottom:18%; height:44%; border-radius:50%; }

    .gate { position:relative; }
    .gate[inert] .reveal { max-height:430px; overflow:hidden; visibility:hidden; opacity:0; }
    .gate[inert]::after { content:attr(data-locked-copy); position:absolute; z-index:8; left:50%; top:50%; transform:translate(-50%,-50%); min-width:min(88vw,18rem); padding:.82rem 1rem; border:1px solid rgba(255,255,255,.1); border-radius:999px; background:rgba(8,8,10,.82); color:rgba(255,255,255,.78); text-align:center; font-size:.68rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; -webkit-backdrop-filter:blur(18px); backdrop-filter:blur(18px); }
    .final { text-align:center; }
    .final h2 { margin-inline:auto; }
    .final-date { margin-top:1.5rem; color:rgba(255,255,255,.56); font-size:clamp(1rem,2.3vw,1.3rem); font-weight:700; }
    .final-clock { margin-top:1.6rem; display:inline-flex; gap:.55rem; font-size:clamp(2rem,6vw,4.6rem); font-weight:500; letter-spacing:-.06em; font-variant-numeric:tabular-nums; }

    footer { width:min(calc(100% - 2rem),var(--wide)); margin:0 auto; padding:1.5rem 0 max(1.5rem,env(safe-area-inset-bottom)); border-top:1px solid rgba(255,255,255,.07); display:flex; justify-content:space-between; gap:1rem; color:rgba(245,245,247,.38); font-size:.67rem; line-height:1.5; }
    footer strong { display:block; margin-bottom:.14rem; color:rgba(245,245,247,.65); font-weight:500; }
    .sr-only { position:absolute!important; width:1px!important; height:1px!important; padding:0!important; margin:-1px!important; overflow:hidden!important; clip:rect(0,0,0,0)!important; white-space:nowrap!important; border:0!important; }
    .scroll-in { opacity:1; transform:none; }

    @media (min-width:901px) and (prefers-reduced-motion:no-preference) {
      .scroll-in:not(.seen) { opacity:0; transform:translateY(34px); }
      .scroll-in { transition:opacity .8s cubic-bezier(.2,.8,.2,1),transform .8s cubic-bezier(.2,.8,.2,1); }
    }
    @media (max-width:900px) {
      .site-nav { width:min(calc(100% - 1.25rem),var(--wide)); }
      .maintenance-pill,.brand-sub { display:none; }
      .hero { min-height:920px; padding-top:max(7.5rem,calc(env(safe-area-inset-top) + 6rem)); }
      .hero-stage { width:118vw; height:390px; }
      .phone { width:clamp(165px,43vw,235px); }
      .phone.left { transform:translate(-139%,-35%) rotateY(18deg) rotateZ(-5deg) scale(.83); }
      .phone.right { transform:translate(39%,-35%) rotateY(-18deg) rotateZ(5deg) scale(.83); }
      .story-grid { grid-template-columns:1fr; gap:2rem; }
      .story-copy { position:static; padding-top:0; }
      .visual { min-height:0; }
      .highlights,.details { grid-template-columns:1fr; }
      .highlight { min-height:430px; }
    }
    @media (max-width:560px) {
      .site-nav { top:max(10px,env(safe-area-inset-top)); }
      .mark { width:34px; height:34px; }
      .brand-name { font-size:.78rem; }
      .hero { min-height:860px; padding-inline:.75rem; }
      .hero-stage { height:330px; margin-top:2rem; }
      .phone { width:180px; border-radius:31px; }
      .phone.left { transform:translate(-135%,-32%) rotateY(16deg) rotateZ(-5deg) scale(.78); }
      .phone.right { transform:translate(35%,-32%) rotateY(-16deg) rotateZ(5deg) scale(.78); }
      .countdown { gap:.2rem; }
      .countdown-unit { min-width:3.45rem; }
      .story { width:min(calc(100% - 1.25rem),var(--wide)); }
      .story h2 { font-size:clamp(2.65rem,15vw,4.3rem); }
      .story h2.small { font-size:clamp(2.3rem,12vw,3.6rem); }
      .liquid-shell { padding:.65rem; border-radius:1.75rem; }
      .liquid-screen { min-height:390px; }
      .liquid { width:calc(100% - .8rem); height:4rem; margin-bottom:.4rem; }
      .tab span:last-child { display:none; }
      .part-phone { width:min(350px,96vw); }
      .part-screen { min-height:570px; }
      .results { min-height:530px; }
      footer { width:min(calc(100% - 1.25rem),var(--wide)); flex-direction:column; gap:.3rem; }
    }
    @supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))) { .maintenance-pill,.phone-nav,.liquid,.results-panel,.gate[inert]::after { background:rgba(20,22,27,.97); } }
    @media (prefers-reduced-transparency:reduce) { .maintenance-pill,.phone-nav,.liquid,.results-panel,.gate[inert]::after { -webkit-backdrop-filter:none; backdrop-filter:none; background:rgba(20,22,27,.98); } }
    @media (prefers-reduced-motion:no-preference) {
      .hero-copy { animation:hero-in .8s cubic-bezier(.2,.8,.2,1) both; }
      .phone.center { animation:center-in .9s .12s cubic-bezier(.2,.8,.2,1) both; }
      @keyframes hero-in { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:none; } }
      @keyframes center-in { from { opacity:0; transform:translate(-50%,-38%) scale(.94); } to { opacity:1; transform:translate(-50%,-45%); } }
    }
    @media (prefers-reduced-motion:reduce) { html { scroll-behavior:auto; } *,*::before,*::after { animation-duration:.001ms!important; animation-iteration-count:1!important; transition-duration:.001ms!important; scroll-behavior:auto!important; } }
  </style>
</head>
<body>
<div class="content" data-solaris-maintenance="true">
  <section class="hero" aria-labelledby="maintenance-title">
    <header class="site-nav">
      <div class="brand" aria-label="Solaris Studio">
        <img class="mark" src="/solaris-studio-mark.png" alt="" aria-hidden="true" width="256" height="256" />
        <span><span class="brand-name">Solaris Studio</span><span class="brand-sub">Terra Solaris Broadcasting Coalition</span></span>
      </div>
      <span class="maintenance-pill">Maintenance in progress</span>
    </header>

    <div class="hero-copy">
      <p class="kicker">Introducing</p>
      <h1 id="maintenance-title">TerraOS 3</h1>
      <p class="tagline">Solaris Studio, rebuilt.</p>
      <div class="launch">
        <span class="launch-label">Estimated arrival</span>
        <span class="launch-date">${returnDate}</span>
        <div class="countdown" id="terraos-countdown" role="timer" aria-label="Estimated arrival ${returnDate}">
          <span class="countdown-unit"><span class="countdown-value" data-countdown="days">--</span><span class="countdown-name">Days</span></span><span class="colon" aria-hidden="true">:</span>
          <span class="countdown-unit"><span class="countdown-value" data-countdown="hours">--</span><span class="countdown-name">Hours</span></span><span class="colon" aria-hidden="true">:</span>
          <span class="countdown-unit"><span class="countdown-value" data-countdown="minutes">--</span><span class="countdown-name">Minutes</span></span><span class="colon" aria-hidden="true">:</span>
          <span class="countdown-unit"><span class="countdown-value" data-countdown="seconds">--</span><span class="countdown-name">Seconds</span></span>
        </div>
        <span class="sr-only">Estimated launch date: ${returnDate}.</span>
      </div>
    </div>

    <div class="hero-stage" aria-hidden="true">
      <div class="phone left"><div class="screen"><div class="micro-label">Participate</div><div class="screen-title">What’s next</div><div class="mini-card"><div class="mini-row"><strong>Confirmation</strong><span class="good">Submitted</span></div><div class="mini-row"><span>Entry</span><span>Awaiting review</span></div><div class="mini-row"><span>Jury</span><span>Upcoming</span></div></div><div class="phone-nav"><i></i><i></i><i class="on"></i><i></i><i></i></div></div></div>
      <div class="phone center"><div class="screen"><div class="micro-label">Home</div><div class="screen-title">Solaris</div><div class="mini-card"><div class="mini-row"><strong>Continue participating</strong><span>›</span></div><div class="mini-row"><span>Confirmation</span><span class="good">Complete</span></div></div><div class="mini-card"><div class="mini-row"><strong>Coming next</strong><span>Tonight</span></div><div class="mini-row"><span>SSC 22</span><span>21:00</span></div></div><div class="phone-nav"><i class="on"></i><i></i><i></i><i></i><i></i></div></div></div>
      <div class="phone right"><div class="screen"><div class="micro-label">Results</div><div class="screen-title">Final results</div><div class="result-list"><div><span class="bar"></span><b>312</b></div><div><span class="bar"></span><b>298</b></div><div><span class="bar"></span><b>287</b></div><div><span class="bar"></span><b>271</b></div></div><div class="phone-nav"><i></i><i></i><i></i><i class="on"></i><i></i></div></div></div>
    </div>
  </section>

  <main class="product-story">
    <section class="story scroll-in" aria-labelledby="closer-title">
      <h2 class="small" id="closer-title">Take a closer look.</h2>
      <div class="highlights">
        <article class="highlight"><h3>Five places.<br />One Solaris.</h3><div class="orbit" aria-hidden="true"></div><small>Home · Explore · Participate · Results · Me</small></article>
        <article class="highlight"><h3>Touch it.</h3><div class="orbit" aria-hidden="true"></div><small>Navigation reveal · 19.10</small></article>
        <article class="highlight"><h3>Results, live.</h3><div class="orbit" aria-hidden="true"></div><small>More · 21.10</small></article>
      </div>
    </section>

    <section class="story gate scroll-in" inert data-reveal-at="2026-10-19T00:00:00+03:00" data-locked-copy="More on 19.10" aria-labelledby="navigation-title">
      <div class="reveal"><div class="story-grid"><div class="story-copy"><h2 id="navigation-title">Five places.<br />One Solaris.</h2><p>Home. Explore. Participate. Results. Me.</p></div><div class="visual"><div class="liquid-shell"><div class="liquid-screen"><div class="liquid-copy"><span id="liquid-label">Home</span><strong id="liquid-title">Solaris</strong></div><div class="liquid" id="liquid-demo" data-dragging="false" aria-label="TerraOS navigation preview"><div class="lens" aria-hidden="true"></div><button class="tab" type="button" data-index="0" aria-selected="true"><i class="tab-icon" aria-hidden="true"></i><span>Home</span></button><button class="tab" type="button" data-index="1" aria-selected="false"><i class="tab-icon" aria-hidden="true"></i><span>Explore</span></button><button class="tab" type="button" data-index="2" aria-selected="false"><i class="tab-icon" aria-hidden="true"></i><span>Participate</span></button><button class="tab" type="button" data-index="3" aria-selected="false"><i class="tab-icon" aria-hidden="true"></i><span>Results</span></button><button class="tab" type="button" data-index="4" aria-selected="false"><i class="tab-icon" aria-hidden="true"></i><span>Me</span></button></div></div><p class="hint">Drag the bar or choose a destination.</p></div></div></div></div>
    </section>

    <section class="story gate scroll-in" inert data-reveal-at="2026-10-20T00:00:00+03:00" data-locked-copy="More on 20.10" aria-labelledby="participation-title">
      <div class="reveal"><div class="story-grid"><div class="story-copy"><h2 id="participation-title">What’s next,<br />at a glance.</h2></div><div class="visual"><div class="part-phone"><div class="part-screen"><div class="micro-label">Participate</div><h3 class="part-title">Your contest</h3><div class="part-list"><div class="part-card" data-tone="good"><span class="part-index">01</span><span><strong>Confirmation</strong><small>Current edition</small></span><span class="part-state">Submitted</span></div><div class="part-card" data-tone="action"><span class="part-index">02</span><span><strong>Entry</strong><small>Review</small></span><span class="part-state">Changes requested</span></div><div class="part-card" data-tone="soon"><span class="part-index">03</span><span><strong>Jury</strong><small>Voting</small></span><span class="part-state">Opens tomorrow</span></div><div class="part-card" data-tone="soon"><span class="part-index">04</span><span><strong>Televote</strong><small>Public voting</small></span><span class="part-state">Opens tonight</span></div><div class="part-card" data-tone="good"><span class="part-index">05</span><span><strong>Results</strong><small>Published shows</small></span><span class="part-state">Available</span></div></div></div></div></div></div></div>
    </section>

    <section class="story gate scroll-in" inert data-reveal-at="2026-10-21T00:00:00+03:00" data-locked-copy="More on 21.10" aria-labelledby="results-title">
      <div class="reveal"><div class="story-grid"><div class="story-copy"><h2 id="results-title">Results,<br />live.</h2></div><div class="visual"><div class="results"><div class="points" aria-hidden="true"><span class="point p12">12</span><span class="point p10">10</span><span class="point p8">8</span></div><div class="results-panel"><div class="results-head"><strong>Final results</strong><span>Live</span></div><div class="result-row"><span class="rank">01</span><span class="country"><span class="flag"></span><span class="country-bar"></span></span><b>312</b></div><div class="result-row"><span class="rank">02</span><span class="country"><span class="flag"></span><span class="country-bar"></span></span><b>298</b></div><div class="result-row"><span class="rank">03</span><span class="country"><span class="flag"></span><span class="country-bar"></span></span><b>287</b></div><div class="result-row"><span class="rank">04</span><span class="country"><span class="flag"></span><span class="country-bar"></span></span><b>271</b></div><div class="result-row"><span class="rank">05</span><span class="country"><span class="flag"></span><span class="country-bar"></span></span><b>264</b></div></div><div class="mask" aria-hidden="true"></div></div></div></div><div class="details" aria-label="TerraOS interface details"><div class="detail" aria-hidden="true"></div><div class="detail" aria-hidden="true"></div><div class="detail" aria-hidden="true"></div></div></div>
    </section>

    <section class="story final scroll-in" aria-labelledby="final-title"><h2 id="final-title">TerraOS 3</h2><p class="tagline">Solaris Studio, rebuilt.</p><p class="final-date">Estimated arrival · ${returnDate}</p><div class="final-clock" aria-hidden="true"><span data-final="days">--</span><span>:</span><span data-final="hours">--</span><span>:</span><span data-final="minutes">--</span><span>:</span><span data-final="seconds">--</span></div></section>
  </main>

          <footer>
    <div><strong>Terra Solaris Broadcasting Coalition</strong>Solaris Studio · TerraOS 3 preview</div>
    <div>Maintenance notice updated ${updated} · HTTP 503</div>
  </footer>
</div>
<script>
(function(){
  var root=document.querySelector('.content');
  var portal=document.querySelector('.hod-portal');
  var story=document.querySelector('.product-story');
  if(root&&portal&&story&&portal.parentNode===root){root.insertBefore(portal,story);}

  var launch=new Date(document.documentElement.getAttribute('data-terraos-launch-at')||'').getTime();
  var interval=null;
  function two(v){return String(Math.max(0,v)).padStart(2,'0');}
  function text(sel,v){var n=document.querySelector(sel);if(n)n.textContent=v;}
  function tick(){
    if(!Number.isFinite(launch))return;
    var left=Math.max(0,launch-Date.now()),s=Math.floor(left/1000),d=Math.floor(s/86400),h=Math.floor((s%86400)/3600),m=Math.floor((s%3600)/60),sec=s%60;
    text('[data-countdown="days"]',two(d));text('[data-countdown="hours"]',two(h));text('[data-countdown="minutes"]',two(m));text('[data-countdown="seconds"]',two(sec));
    text('[data-final="days"]',two(d));text('[data-final="hours"]',two(h));text('[data-final="minutes"]',two(m));text('[data-final="seconds"]',two(sec));
    if(left<=0&&interval!==null){clearInterval(interval);interval=null;}
  }
  tick();if(Number.isFinite(launch)&&launch>Date.now())interval=setInterval(tick,1000);

  function revealGate(gate){
    var at=new Date(gate.getAttribute('data-reveal-at')||'').getTime();
    var open=Number.isFinite(at)&&Date.now()>=at;
    gate.setAttribute('data-revealed',open?'true':'false');
    gate.toggleAttribute('inert',!open);
    gate.setAttribute('aria-hidden',open?'false':'true');
    if(!open&&Number.isFinite(at)){var delay=at-Date.now();if(delay>0&&delay<2147483647)setTimeout(function(){gate.setAttribute('data-revealed','true');gate.removeAttribute('inert');gate.setAttribute('aria-hidden','false');},delay);}
  }
  document.querySelectorAll('[data-reveal-at]').forEach(revealGate);

  var demo=document.getElementById('liquid-demo');
  if(demo){
    var tabs=Array.from(demo.querySelectorAll('.tab')),labels=['Home','Explore','Participate','Results','Me'],titles=['Solaris','Discover','Your contest','Results','Your Solaris'],active=0,dragging=false;
    function clamp(v,a,b){return Math.min(b,Math.max(a,v));}
    function draw(progress,selected){demo.style.setProperty('--p',String(progress));tabs.forEach(function(t,i){t.setAttribute('aria-selected',i===selected?'true':'false');});var l=document.getElementById('liquid-label'),t=document.getElementById('liquid-title');if(l)l.textContent=labels[selected];if(t)t.textContent=titles[selected];}
    function select(i){active=clamp(i,0,4);draw(active,active);}
    tabs.forEach(function(t,i){t.addEventListener('click',function(){select(i);});});
    demo.addEventListener('pointerdown',function(e){if(e.pointerType==='mouse'&&e.button!==0)return;dragging=true;demo.setAttribute('data-dragging','true');demo.setPointerCapture(e.pointerId);});
    demo.addEventListener('pointermove',function(e){if(!dragging)return;var r=demo.getBoundingClientRect(),p=clamp(((e.clientX-r.left)/r.width)*5-.5,0,4);draw(p,Math.round(p));});
    function end(e){if(!dragging)return;dragging=false;demo.setAttribute('data-dragging','false');var r=demo.getBoundingClientRect(),p=clamp(((e.clientX-r.left)/r.width)*5-.5,0,4);select(Math.round(p));if(demo.hasPointerCapture&&demo.hasPointerCapture(e.pointerId))demo.releasePointerCapture(e.pointerId);}
    demo.addEventListener('pointerup',end);demo.addEventListener('pointercancel',function(e){dragging=false;demo.setAttribute('data-dragging','false');select(active);if(demo.hasPointerCapture&&demo.hasPointerCapture(e.pointerId))demo.releasePointerCapture(e.pointerId);});
  }

  if('IntersectionObserver'in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){var observer=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){entry.target.classList.add('seen');observer.unobserve(entry.target);}});},{threshold:.12});document.querySelectorAll('.scroll-in').forEach(function(n){observer.observe(n);});}else{document.querySelectorAll('.scroll-in').forEach(function(n){n.classList.add('seen');});}
})();
</script>
</body>
</html>`;
}