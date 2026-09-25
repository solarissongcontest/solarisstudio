import {
  MAINTENANCE_LAST_UPDATED,
  MAINTENANCE_RETURN_DATE,
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

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#071018" />
    <meta name="color-scheme" content="dark" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Solaris Studio is temporarily unavailable</title>
    <style>
      @font-face {
        font-family: "Classica Crastao";
        src: url("https://raw.githubusercontent.com/solarissongcontest/ssc-confirmations/main/public/classicacrastao-m2pj5.ttf") format("truetype");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "Gotham";
        src: url("https://raw.githubusercontent.com/solarissongcontest/ssc-confirmations/main/public/Gotham%20Book.otf") format("opentype");
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "Gotham";
        src: url("https://raw.githubusercontent.com/solarissongcontest/ssc-confirmations/main/public/Gotham%20Medium.otf") format("opentype");
        font-weight: 500;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: "Gotham";
        src: url("https://raw.githubusercontent.com/solarissongcontest/ssc-confirmations/main/public/Gotham%20Bold.otf") format("opentype");
        font-weight: 700;
        font-style: normal;
        font-display: swap;
      }

      :root {
        color-scheme: dark;
        --background: #071023;
        --foreground: #f5f9fc;
        --muted: rgba(224, 236, 246, .72);
        --muted-soft: rgba(205, 223, 236, .52);
        --primary: #9ddff2;
        --primary-strong: #6ebdd7;
        --border: rgba(205, 232, 245, .20);
        font-family: "Gotham", ui-sans-serif, system-ui, sans-serif;
        color: var(--foreground);
        background: var(--background);
      }

      * { box-sizing: border-box; }
      html, body { min-height: 100%; }
      html { background: #020817; }

      body {
        margin: 0;
        min-height: 100svh;
        overflow-x: hidden;
        background-color: #020817;
        background-image:
          linear-gradient(180deg, rgba(1, 5, 20, .08), rgba(1, 5, 20, .32)),
          url("/solaris-background.webp");
        background-size: cover, cover;
        background-position: center, center;
        background-repeat: no-repeat;
        background-attachment: fixed, fixed;
        font-family: "Gotham", ui-sans-serif, system-ui, sans-serif;
        font-weight: 400;
        letter-spacing: -.012em;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }

      .ambient {
        position: fixed;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
        z-index: 0;
      }
      .ambient::before,
      .ambient::after {
        content: "";
        position: absolute;
        width: min(58vw, 760px);
        aspect-ratio: 1;
        border-radius: 50%;
        filter: blur(68px);
        opacity: .18;
        will-change: transform;
      }
      .ambient::before {
        left: -18vw;
        top: -24vw;
        background: radial-gradient(circle, rgba(127, 213, 240, .78), rgba(69, 124, 196, .18) 52%, transparent 72%);
      }
      .ambient::after {
        right: -18vw;
        bottom: -30vw;
        background: radial-gradient(circle, rgba(95, 176, 220, .58), rgba(54, 94, 180, .13) 52%, transparent 72%);
      }

      main {
        position: relative;
        z-index: 1;
        width: min(calc(100% - 2rem), 980px);
        margin: 0 auto;
        padding: max(1.25rem, env(safe-area-inset-top)) 0 max(1.25rem, env(safe-area-inset-bottom));
      }

      .site-nav {
        min-height: 68px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: .72rem 1rem;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 1rem;
        background: linear-gradient(180deg, rgba(7,15,37,.92), rgba(5,12,31,.88));
        -webkit-backdrop-filter: blur(14px) saturate(150%);
        backdrop-filter: blur(14px) saturate(150%);
        box-shadow: 0 8px 28px rgba(0,0,20,.16);
      }

      .brand {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: .75rem;
      }
      .studio-mark-wrap {
        width: 42px;
        height: 42px;
        flex: 0 0 42px;
        display: grid;
        place-items: center;
        overflow: hidden;
        border-radius: 999px;
      }
      .studio-mark {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      .brand-copy { min-width: 0; line-height: 1.08; }
      .brand-name {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: "Classica Crastao", Georgia, serif;
        font-size: 1rem;
        font-weight: 400;
        text-transform: uppercase;
        letter-spacing: .04em;
      }
      .brand-sub {
        display: block;
        margin-top: .22rem;
        color: var(--muted-soft);
        font-size: .68rem;
        letter-spacing: .02em;
      }
      .tsbc-mark { width: 150px; height: auto; max-width: 37vw; }

      .panel {
        position: relative;
        isolation: isolate;
        margin-top: 1rem;
        overflow: hidden;
        border: 1px solid rgba(205,232,245,.24);
        border-radius: 1.25rem;
        background:
          linear-gradient(145deg, rgba(225,242,250,.12) 0%, rgba(166,211,231,.06) 30%, rgba(65,133,177,.035) 64%, rgba(190,225,240,.06) 100%),
          rgba(7,18,38,.88);
        -webkit-backdrop-filter: blur(12px) saturate(155%);
        backdrop-filter: blur(12px) saturate(155%);
        box-shadow:
          0 18px 46px rgba(0,3,20,.24),
          inset 0 1px 0 rgba(235,248,253,.20);
      }
      .panel::before {
        content: "";
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        background:
          radial-gradient(ellipse 85% 46% at 15% -8%, rgba(240,250,254,.16), transparent 64%),
          radial-gradient(ellipse 42% 68% at 103% 34%, rgba(100,190,225,.10), transparent 70%);
      }
      .panel::after {
        content: "";
        position: absolute;
        top: 0;
        left: -45%;
        width: 34%;
        height: 1px;
        z-index: 2;
        background: linear-gradient(90deg, transparent, rgba(196,238,251,.92), transparent);
        box-shadow: 0 0 18px rgba(121,211,240,.38);
      }
      .content {
        position: relative;
        z-index: 1;
        padding: clamp(1.6rem, 5vw, 3.6rem);
      }

      .eyebrow {
        margin: 0 0 .8rem;
        color: rgba(155,225,255,.78);
        font-size: .68rem;
        font-weight: 700;
        letter-spacing: .24em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0;
        max-width: 760px;
        font-family: "Classica Crastao", Georgia, serif;
        font-size: clamp(2.55rem, 8vw, 5.3rem);
        font-weight: 400;
        line-height: .92;
        letter-spacing: .025em;
        text-transform: uppercase;
        text-wrap: balance;
      }
      .lead {
        max-width: 690px;
        margin: 1.35rem 0 0;
        color: var(--muted);
        font-size: clamp(.98rem, 2vw, 1.08rem);
        line-height: 1.72;
      }


      .recovery-visual {
        position: relative;
        margin-top: 1.7rem;
        display: grid;
        grid-template-columns: minmax(250px, .92fr) minmax(0, 1.08fr);
        align-items: center;
        gap: clamp(1rem, 4vw, 2.25rem);
        overflow: hidden;
        padding: clamp(1rem, 3vw, 1.5rem);
        border: 1px solid rgba(188,220,240,.13);
        border-radius: 1rem;
        background:
          radial-gradient(circle at 24% 50%, rgba(103,194,225,.09), transparent 38%),
          linear-gradient(155deg, rgba(13,30,57,.93), rgba(5,17,36,.96));
        box-shadow: 0 12px 32px rgba(0,3,20,.18), inset 0 1px 0 rgba(225,242,250,.07);
      }
      .recovery-visual::before {
        content: "";
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: .24;
        background-image:
          linear-gradient(rgba(157,223,242,.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(157,223,242,.08) 1px, transparent 1px);
        background-size: 32px 32px;
        mask-image: radial-gradient(circle at 25% 50%, black, transparent 58%);
      }
      .orbit-stage {
        position: relative;
        z-index: 1;
        width: min(100%, 310px);
        aspect-ratio: 1;
        margin-inline: auto;
        display: grid;
        place-items: center;
      }
      .orbit-stage::before {
        content: "";
        position: absolute;
        inset: 16%;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(126,217,244,.16), rgba(84,155,198,.045) 48%, transparent 70%);
        filter: blur(12px);
      }
      .recovery-core {
        position: relative;
        z-index: 8;
        width: 31%;
        aspect-ratio: 1;
        display: grid;
        place-items: center;
        border: 1px solid rgba(213,242,252,.28);
        border-radius: 50%;
        background:
          radial-gradient(circle at 38% 30%, rgba(238,250,254,.20), transparent 34%),
          linear-gradient(145deg, rgba(33,72,105,.96), rgba(5,18,38,.98));
        box-shadow:
          0 0 0 8px rgba(126,217,244,.025),
          0 0 40px rgba(100,192,225,.18),
          inset 0 1px 0 rgba(244,252,255,.30);
      }
      .recovery-core img {
        width: 74%;
        height: 74%;
        object-fit: contain;
        filter: drop-shadow(0 4px 14px rgba(0,0,0,.24));
      }
      .orbit {
        position: absolute;
        border-radius: 50%;
        border: 1px solid rgba(157,223,242,.23);
        box-shadow: inset 0 0 18px rgba(126,217,244,.025);
      }
      .orbit::before,
      .orbit::after {
        content: "";
        position: absolute;
        left: 50%;
        border-radius: 50%;
        transform: translateX(-50%);
      }
      .orbit::before {
        top: -4px;
        width: 8px;
        height: 8px;
        background: #d7f6ff;
        box-shadow: 0 0 8px rgba(215,246,255,.95), 0 0 20px rgba(115,213,244,.66);
      }
      .orbit::after {
        bottom: -3px;
        width: 6px;
        height: 6px;
        background: #7ccfe8;
        box-shadow: 0 0 14px rgba(124,207,232,.72);
      }
      .orbit-a { inset: 5%; border-style: solid; }
      .orbit-b { inset: 17%; border-style: dashed; border-color: rgba(157,223,242,.20); }
      .orbit-c { inset: 29%; border-color: rgba(157,223,242,.30); }
      .orbit-axis {
        position: absolute;
        inset: 12% 3%;
        border-top: 1px solid rgba(157,223,242,.10);
        border-bottom: 1px solid rgba(157,223,242,.08);
        transform: rotate(-18deg);
      }
      .recovery-sweep {
        position: absolute;
        inset: 3%;
        z-index: 2;
        border-radius: 50%;
        background: conic-gradient(
          from 0deg,
          transparent 0 286deg,
          rgba(126,217,244,.02) 304deg,
          rgba(126,217,244,.20) 342deg,
          rgba(220,248,255,.58) 358deg,
          transparent 360deg
        );
        -webkit-mask-image: radial-gradient(circle, transparent 0 33%, black 39% 49%, transparent 55%);
        mask-image: radial-gradient(circle, transparent 0 33%, black 39% 49%, transparent 55%);
        mix-blend-mode: screen;
      }
      .signal-ring {
        position: absolute;
        z-index: 4;
        width: 31%;
        aspect-ratio: 1;
        border-radius: 50%;
        border: 1px solid rgba(157,223,242,.34);
        opacity: 0;
      }
      .signal-ring.two { width: 31%; }
      .signal-ring.three { width: 31%; }

      .packet-track {
        position: absolute;
        inset: 2%;
        z-index: 5;
        pointer-events: none;
      }
      .packet-track.two { transform: rotate(120deg); }
      .packet-track.three { transform: rotate(240deg); }
      .packet {
        position: absolute;
        top: 2%;
        left: 50%;
        width: 5px;
        height: 13px;
        border-radius: 999px;
        background: linear-gradient(to bottom, rgba(225,249,255,.98), rgba(105,203,233,.18));
        box-shadow: 0 0 12px rgba(126,217,244,.7);
        transform: translateX(-50%);
        opacity: 0;
      }

      .recovery-copy {
        position: relative;
        z-index: 1;
        min-width: 0;
      }
      .recovery-kicker {
        margin: 0;
        color: rgba(155,225,255,.76);
        font-size: .65rem;
        font-weight: 700;
        letter-spacing: .19em;
        text-transform: uppercase;
      }
      .recovery-copy h2 {
        margin: .45rem 0 0;
        color: var(--foreground);
        font-family: "Gotham", ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(1.2rem, 3vw, 1.65rem);
        line-height: 1.12;
        letter-spacing: -.025em;
      }
      .recovery-copy > p:last-of-type {
        margin: .65rem 0 0;
        max-width: 34rem;
        color: var(--muted);
        font-size: .86rem;
        line-height: 1.55;
      }
      .recovery-meta {
        margin-top: 1rem;
        display: grid;
        gap: .55rem;
      }
      .recovery-meta-row {
        display: flex;
        min-width: 0;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding-top: .55rem;
        border-top: 1px solid rgba(255,255,255,.07);
        font-size: .72rem;
      }
      .recovery-meta-row span:first-child { color: var(--muted-soft); }
      .recovery-meta-row span:last-child {
        color: rgba(223,244,250,.90);
        font-weight: 700;
        text-align: right;
      }

      .status-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: .75rem;
        margin-top: 1.75rem;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: .55rem;
        min-height: 2rem;
        padding: .42rem .7rem;
        border: 1px solid rgba(157,223,242,.18);
        border-radius: 999px;
        background: rgba(157,223,242,.065);
        color: var(--primary);
        font-size: .68rem;
        font-weight: 700;
        letter-spacing: .12em;
        text-transform: uppercase;
      }
      .status-dot {
        width: .48rem;
        height: .48rem;
        border-radius: 50%;
        background: var(--primary);
        box-shadow: 0 0 16px rgba(157,223,242,.72);
      }
      .updated {
        color: var(--muted-soft);
        font-size: .72rem;
      }

      .return {
        margin-top: 1.7rem;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 1rem;
        padding: 1rem 1.1rem;
        border: 1px solid rgba(188,220,240,.13);
        border-radius: .875rem;
        background: linear-gradient(155deg, rgba(13,30,57,.93), rgba(5,17,36,.96));
        box-shadow: 0 10px 28px rgba(0,3,20,.15), inset 0 1px 0 rgba(225,242,250,.07);
      }
      .return-label {
        margin: 0 0 .25rem;
        color: rgba(155,225,255,.74);
        font-size: .65rem;
        font-weight: 700;
        letter-spacing: .18em;
        text-transform: uppercase;
      }
      .return-date {
        margin: 0;
        font-size: clamp(1.25rem, 3vw, 1.65rem);
        font-weight: 700;
        letter-spacing: -.02em;
      }
      .return-icon {
        width: 42px;
        height: 42px;
        display: grid;
        place-items: center;
        border-radius: .75rem;
        border: 1px solid rgba(157,223,242,.13);
        background: rgba(157,223,242,.06);
        color: var(--primary);
        font-size: 1.15rem;
      }

      .notice {
        margin-top: 1rem;
        display: grid;
        gap: .7rem;
      }
      .notice-item {
        display: grid;
        grid-template-columns: 2.35rem minmax(0,1fr);
        gap: .85rem;
        align-items: start;
        padding: .9rem 1rem;
        border: 1px solid rgba(188,220,240,.10);
        border-radius: .875rem;
        background: rgba(7,18,38,.72);
        color: var(--muted);
        font-size: .88rem;
        line-height: 1.55;
        box-shadow: inset 0 1px 0 rgba(225,242,250,.04);
      }
      .notice-icon {
        width: 2.35rem;
        height: 2.35rem;
        display: grid;
        place-items: center;
        border-radius: .75rem;
        background: rgba(157,223,242,.075);
        color: var(--primary);
        font-size: .75rem;
        font-weight: 700;
      }
      .notice-item strong { color: var(--foreground); font-weight: 700; }
      .deadline { color: #fff; font-weight: 700; }

      footer {
        margin-top: 1.35rem;
        padding-top: 1.1rem;
        border-top: 1px solid rgba(255,255,255,.09);
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 1rem;
        color: var(--muted-soft);
        font-size: .72rem;
        line-height: 1.5;
      }
      .signature strong {
        display: block;
        margin-bottom: .15rem;
        color: rgba(247,251,255,.86);
        font-weight: 500;
      }

      @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
        .site-nav { background: rgba(5,12,31,.98); }
        .panel { background: rgba(7,18,38,.98); }
      }

      @media (max-width: 640px) {
        body { background-attachment: scroll, scroll; }
        main {
          width: min(calc(100% - 1rem), 980px);
          padding-top: max(.5rem, env(safe-area-inset-top));
        }
        .site-nav { min-height: 60px; padding: .62rem .72rem; border-radius: .875rem; }
        .studio-mark-wrap { width: 38px; height: 38px; flex-basis: 38px; }
        .brand-name { font-size: .86rem; }
        .brand-sub { display: none; }
        .tsbc-mark { width: 112px; }
        .panel { margin-top: .6rem; border-radius: 1rem; }
        .content { padding: 1.35rem 1.1rem 1.2rem; }
        h1 { font-size: clamp(2.25rem, 13vw, 3.7rem); }
        .lead { margin-top: 1rem; line-height: 1.6; }
        .recovery-visual {
          grid-template-columns: 1fr;
          gap: .55rem;
          padding: .85rem .8rem 1rem;
        }
        .orbit-stage { width: min(76vw, 275px); }
        .recovery-copy { padding: 0 .2rem .1rem; }
        .recovery-copy h2 { font-size: 1.18rem; }
        .recovery-copy > p:last-of-type { font-size: .82rem; }
        .notice-item { padding: .8rem; }
        footer { align-items: flex-start; flex-direction: column; gap: .35rem; }
      }

      @media (prefers-reduced-transparency: reduce) {
        .site-nav, .panel {
          -webkit-backdrop-filter: none;
          backdrop-filter: none;
        }
        .panel { background: rgba(7,18,38,.98); }
      }

      @media (prefers-reduced-motion: no-preference) {
        .ambient::before { animation: aurora-one 18s ease-in-out infinite alternate; }
        .ambient::after { animation: aurora-two 22s ease-in-out infinite alternate; }
        .site-nav { animation: reveal-nav .58s cubic-bezier(.23,1,.32,1) both; }
        .panel { animation: reveal-panel .72s .08s cubic-bezier(.23,1,.32,1) both; }
        .panel::after { animation: scan-line 5.8s 1s ease-in-out infinite; }
        .eyebrow { animation: reveal-item .48s .22s cubic-bezier(.23,1,.32,1) both; }
        h1 { animation: reveal-item .58s .28s cubic-bezier(.23,1,.32,1) both; }
        .lead { animation: reveal-item .58s .36s cubic-bezier(.23,1,.32,1) both; }
        .recovery-visual { animation: reveal-item .58s .42s cubic-bezier(.23,1,.32,1) both; }
        .status-row { animation: reveal-item .5s .52s cubic-bezier(.23,1,.32,1) both; }
        .orbit-a { animation: orbit-clockwise 10s linear infinite; }
        .orbit-b { animation: orbit-counter 16s linear infinite; }
        .orbit-c { animation: orbit-clockwise 23s linear infinite; }
        .recovery-sweep { animation: recovery-scan 4.8s linear infinite; }
        .signal-ring.one { animation: recovery-ping 3.2s ease-out infinite; }
        .signal-ring.two { animation: recovery-ping 3.2s 1.05s ease-out infinite; }
        .signal-ring.three { animation: recovery-ping 3.2s 2.1s ease-out infinite; }
        .packet-track.one .packet { animation: packet-in 3.3s .2s ease-in-out infinite; }
        .packet-track.two .packet { animation: packet-in 3.3s 1.3s ease-in-out infinite; }
        .packet-track.three .packet { animation: packet-in 3.3s 2.4s ease-in-out infinite; }
        .recovery-core { animation: core-breathe 3.8s ease-in-out infinite; }
        .return { animation: reveal-item .5s .5s cubic-bezier(.23,1,.32,1) both; }
        .notice-item:nth-child(1) { animation: reveal-item .48s .58s cubic-bezier(.23,1,.32,1) both; }
        .notice-item:nth-child(2) { animation: reveal-item .48s .65s cubic-bezier(.23,1,.32,1) both; }
        .notice-item:nth-child(3) { animation: reveal-item .48s .72s cubic-bezier(.23,1,.32,1) both; }
        footer { animation: reveal-item .48s .79s cubic-bezier(.23,1,.32,1) both; }
        .status-dot { animation: status-pulse 2.4s ease-in-out infinite; }
        .studio-mark { animation: mark-float 5.2s ease-in-out infinite; }

        @keyframes orbit-clockwise {
          to { transform: rotate(360deg); }
        }
        @keyframes orbit-counter {
          to { transform: rotate(-360deg); }
        }
        @keyframes recovery-scan {
          to { transform: rotate(360deg); }
        }
        @keyframes recovery-ping {
          0% { transform: scale(1); opacity: 0; }
          12% { opacity: .56; }
          80%, 100% { transform: scale(2.45); opacity: 0; }
        }
        @keyframes packet-in {
          0%, 8% { top: 2%; opacity: 0; }
          18% { opacity: 1; }
          72% { opacity: .95; }
          92%, 100% { top: 46%; opacity: 0; }
        }
        @keyframes core-breathe {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 0 0 8px rgba(126,217,244,.025), 0 0 40px rgba(100,192,225,.18), inset 0 1px 0 rgba(244,252,255,.30);
          }
          50% {
            transform: scale(1.045);
            box-shadow: 0 0 0 12px rgba(126,217,244,.04), 0 0 62px rgba(100,192,225,.32), inset 0 1px 0 rgba(244,252,255,.34);
          }
        }
        @keyframes reveal-nav {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes reveal-panel {
          from { opacity: 0; transform: translateY(18px) scale(.992); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes reveal-item {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes status-pulse {
          0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 12px rgba(157,223,242,.55); }
          50% { opacity: .62; transform: scale(.82); box-shadow: 0 0 22px rgba(157,223,242,.9); }
        }
        @keyframes mark-float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-3px) rotate(.8deg); }
        }
        @keyframes scan-line {
          0%, 22% { left: -45%; opacity: 0; }
          32% { opacity: .8; }
          68% { opacity: .8; }
          78%, 100% { left: 112%; opacity: 0; }
        }
        @keyframes aurora-one {
          from { transform: translate3d(-2%, -2%, 0) scale(.92); }
          to { transform: translate3d(18%, 12%, 0) scale(1.08); }
        }
        @keyframes aurora-two {
          from { transform: translate3d(4%, 0, 0) scale(.96); }
          to { transform: translate3d(-16%, -12%, 0) scale(1.08); }
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: .001ms !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
        }
      }

    </style>
  </head>

  <body>
    <div class="ambient" aria-hidden="true"></div>
    <main data-solaris-maintenance="true" aria-labelledby="maintenance-title">
      <header class="site-nav">
        <div class="brand" aria-label="Solaris Studio">
          <span class="studio-mark-wrap">
            <img class="studio-mark" src="/solaris-studio-mark.png" alt="" aria-hidden="true" width="256" height="256" />
          </span>
          <span class="brand-copy">
            <span class="brand-name">Solaris Studio</span>
            <span class="brand-sub">Terra Solaris · SSC</span>
          </span>
        </div>
        <img class="tsbc-mark" src="/tsbc-maintenance-mark.svg" alt="TSBC" width="164" height="44" />
      </header>

      <section class="panel">
        <div class="content">
          <p class="eyebrow">Service status · temporary interruption</p>
          <h1 id="maintenance-title">Solaris Studio is temporarily offline</h1>
          <p class="lead">
            A database service error is currently preventing Solaris Studio from operating reliably.
            We have taken the platform offline temporarily rather than leave submissions, voting,
            results or account actions in an uncertain state.
          </p>

          <section class="recovery-visual" aria-labelledby="recovery-title">
            <div class="orbit-stage" aria-hidden="true">
              <div class="recovery-sweep"></div>
              <div class="orbit-axis"></div>
              <div class="orbit orbit-a"></div>
              <div class="orbit orbit-b"></div>
              <div class="orbit orbit-c"></div>
              <div class="signal-ring one"></div>
              <div class="signal-ring two"></div>
              <div class="signal-ring three"></div>
              <div class="packet-track one"><span class="packet"></span></div>
              <div class="packet-track two"><span class="packet"></span></div>
              <div class="packet-track three"><span class="packet"></span></div>
              <div class="recovery-core">
                <img src="/solaris-studio-mark.png" alt="" width="256" height="256" />
              </div>
            </div>
            <div class="recovery-copy">
              <p class="recovery-kicker">Recovery sequence</p>
              <h2 id="recovery-title">Holding Solaris safely offline</h2>
              <p>
                Solaris Studio is keeping normal traffic and writes stopped while the database service is unavailable.
                The animation represents the protected recovery state, not live database telemetry.
              </p>
              <div class="recovery-meta" aria-label="Recovery state">
                <div class="recovery-meta-row"><span>Application traffic</span><span>Paused safely</span></div>
                <div class="recovery-meta-row"><span>Database service</span><span>Awaiting restoration</span></div>
                <div class="recovery-meta-row"><span>Deadlines</span><span>Protected</span></div>
              </div>
            </div>
          </section>

          <div class="status-row">
            <div class="status"><span class="status-dot" aria-hidden="true"></span>Maintenance mode active</div>
            <span class="updated">Service notice updated ${updated}</span>
          </div>

          <div class="return">
            <div>
              <p class="return-label">Expected return</p>
              <p class="return-date">${returnDate}</p>
            </div>
            <div class="return-icon" aria-hidden="true">↻</div>
          </div>

          <div class="notice" aria-label="Outage information">
            <div class="notice-item">
              <span class="notice-icon" aria-hidden="true">01</span>
              <span><strong>Deadlines are protected.</strong> <span class="deadline">All deadlines scheduled during this outage will be postponed.</span> Updated deadlines will be published after Solaris Studio is back online.</span>
            </div>
            <div class="notice-item">
              <span class="notice-icon" aria-hidden="true">02</span>
              <span><strong>Please do not repeat submissions or votes.</strong> If you attempted an action around the start of the outage, wait for TSBC guidance before trying again.</span>
            </div>
            <div class="notice-item">
              <span class="notice-icon" aria-hidden="true">03</span>
              <span><strong>All Solaris Studio services are temporarily unavailable.</strong> This includes public pages, MySolaris, Confirmations, Televoting and Organizer tools.</span>
            </div>
          </div>

          <footer>
            <div class="signature">
              <strong>Terra Solaris Broadcasting Coalition</strong>
              TSBC / Solaris Studio
            </div>
            <div>HTTP 503 · Service temporarily unavailable</div>
          </footer>
        </div>
      </section>
    </main>
  </body>
</html>`;
}
